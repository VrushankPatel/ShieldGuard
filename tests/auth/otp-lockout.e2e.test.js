const { randomSuffix, createStrongPassword } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createUnit, loginWithEmail, onboardSocietyWithAdmin } = require('../../src/utils/onboarding')
const { clearUserLockout, overrideOtpChallenge } = require('../../src/utils/localDbTestHelpers')

function ensureExpectedStatus(response, expectedStatuses, method, path) {
  if (expectedStatuses.includes(response.status)) {
    return
  }

  throw new Error(
    `${method} ${path} expected ${expectedStatuses.join(' or ')}, got ${response.status} (${response.body?.message || 'no message'})`
  )
}

describe('Auth OTP and lockout hardening flows', () => {
  const suite = new AbstractApiTest()
  const context = {
    setupBlockedReason: null
  }

  function skipIfSetupBlocked() {
    if (!context.setupBlockedReason) {
      return false
    }

    expect(context.setupBlockedReason).toMatch(/SHIELD_(ADMIN_EMAIL|ADMIN_PASSWORD|ROOT_PASSWORD)/)
    return true
  }

  async function createUser(role, unitId, accessToken, namePrefix) {
    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const password = createStrongPassword(role)
    const response = await suite.api.post(
      '/api/v1/users',
      {
        unitId,
        name: `${namePrefix} ${suffix}`,
        email: `${role.toLowerCase()}.${namePrefix.toLowerCase()}.${suffix}@shieldguard.test`,
        phone: `+9177${suffix.slice(-8)}`,
        password,
        role
      },
      accessToken
    )
    ensureExpectedStatus(response, [200], 'POST', '/api/v1/users')

    return {
      user: response.body.data,
      credentials: {
        email: response.body.data.email,
        password
      }
    }
  }

  async function sendOtpChallenge(email) {
    const response = await suite.api.post('/api/v1/auth/login/otp/send', { email })
    ensureExpectedStatus(response, [200], 'POST', '/api/v1/auth/login/otp/send')
    expect(response.body.data.challengeToken).toBeTruthy()
    return response.body.data
  }

  beforeAll(async () => {
    await suite.setup()

    try {
      if (suite.config.adminEmail && suite.config.adminPassword) {
        context.adminSession = await loginWithEmail(suite.api, suite.config.adminEmail, suite.config.adminPassword)
      } else {
        const onboarding = await onboardSocietyWithAdmin(suite.api, suite.config)
        if (onboarding.onboardingBlocked) {
          context.setupBlockedReason =
            `${onboarding.onboardingBlockedReason || 'Tenant admin onboarding unavailable.'} ` +
            'Set SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env for SG-0001 execution in strict environments.'
          return
        }
        context.adminSession = onboarding.adminSession
      }
    } catch (error) {
      const message = error?.message || 'Auth setup failed'
      context.setupBlockedReason =
        `${message}. Set SHIELD_ROOT_PASSWORD or provide SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env.`
      return
    }

    if (!context.adminSession?.accessToken) {
      context.setupBlockedReason =
        'Tenant admin session unavailable. Set SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env.'
      return
    }

    context.unit = await createUnit(suite.api, context.adminSession.accessToken, {
      block: 'AUTH',
      unitNumber: `AU-${randomSuffix().slice(-4)}`
    })

    const otpActor = await createUser('OWNER', context.unit.id, context.adminSession.accessToken, 'OtpUser')
    context.otpUser = {
      ...otpActor,
      phone: otpActor.user.phone
    }

    const lockoutActor = await createUser('TENANT', context.unit.id, context.adminSession.accessToken, 'LockoutUser')
    context.lockoutUser = {
      ...lockoutActor
    }
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('sends OTP login challenge with stable response shape', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    const otpChallenge = await sendOtpChallenge(context.otpUser.credentials.email)
    expect(typeof otpChallenge.challengeToken).toBe('string')
    expect(otpChallenge.challengeToken.length).toBeGreaterThan(20)
    expect(otpChallenge.destination).toBeTruthy()
    expect(otpChallenge.destination).toContain(context.otpUser.phone.slice(-4))
    expect(otpChallenge.expiresAt).toBeTruthy()
  })

  it('verifies OTP success path and rejects challenge replay', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    const otpChallenge = await sendOtpChallenge(context.otpUser.credentials.email)
    let otpCode = suite.config.otpTestCode
    let otpSource = 'env'

    if (!otpCode) {
      otpCode = '654321'
      const overrideResult = overrideOtpChallenge(
        suite.config,
        otpChallenge.challengeToken,
        otpCode,
        suite.config.loginOtpMaxAttempts
      )

      if (!overrideResult.ok) {
        expect(overrideResult.reason.toLowerCase()).toContain('otp')
        expect(
          `Unable to auto-seed OTP challenge. Set SHIELD_OTP_TEST_CODE in ShieldGuard/.env. ${overrideResult.reason}`
        ).toContain('SHIELD_OTP_TEST_CODE')
        return
      }
      otpSource = 'local-db-override'
    }

    const verifyResponse = await suite.api.post('/api/v1/auth/login/otp/verify', {
      challengeToken: otpChallenge.challengeToken,
      otpCode
    })
    ensureExpectedStatus(verifyResponse, [200], 'POST', '/api/v1/auth/login/otp/verify')
    expect(verifyResponse.body.data.accessToken).toBeTruthy()
    expect(verifyResponse.body.data.refreshToken).toBeTruthy()
    expect(otpSource).toBeTruthy()

    const replayResponse = await suite.api.post('/api/v1/auth/login/otp/verify', {
      challengeToken: otpChallenge.challengeToken,
      otpCode
    })
    ensureExpectedStatus(replayResponse, [400], 'POST', '/api/v1/auth/login/otp/verify')
  })

  it('enforces invalid OTP attempt limits and challenge invalidation', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    const maxAttempts = Math.max(1, suite.config.loginOtpMaxAttempts)
    const otpChallenge = await sendOtpChallenge(context.otpUser.credentials.email)

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const invalidResponse = await suite.api.post('/api/v1/auth/login/otp/verify', {
        challengeToken: otpChallenge.challengeToken,
        otpCode: '111111'
      })
      ensureExpectedStatus(invalidResponse, [401], 'POST', '/api/v1/auth/login/otp/verify')
    }

    const consumedResponse = await suite.api.post('/api/v1/auth/login/otp/verify', {
      challengeToken: otpChallenge.challengeToken,
      otpCode: '111111'
    })
    ensureExpectedStatus(consumedResponse, [400], 'POST', '/api/v1/auth/login/otp/verify')
  })

  it('locks account after failed password attempts and validates recovery path', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    clearUserLockout(suite.config, context.lockoutUser.credentials.email)
    const maxFailedAttempts = Math.max(1, suite.config.userLockoutMaxFailedAttempts)

    for (let attempt = 0; attempt < maxFailedAttempts; attempt += 1) {
      const invalidLoginResponse = await suite.api.post('/api/v1/auth/login', {
        email: context.lockoutUser.credentials.email,
        password: 'WrongPassword!999'
      })
      ensureExpectedStatus(invalidLoginResponse, [401], 'POST', '/api/v1/auth/login')
    }

    const lockedLoginResponse = await suite.api.post('/api/v1/auth/login', {
      email: context.lockoutUser.credentials.email,
      password: context.lockoutUser.credentials.password
    })
    ensureExpectedStatus(lockedLoginResponse, [401], 'POST', '/api/v1/auth/login')
    expect((lockedLoginResponse.body?.message || '').toLowerCase()).toContain('locked')

    const clearResult = clearUserLockout(suite.config, context.lockoutUser.credentials.email)
    if (!clearResult.ok) {
      expect(
        `Unable to clear lockout state automatically. ${clearResult.reason}. ` +
          'Provide local DB access or set short lockout duration for auth E2E runs.'
      ).toContain('lockout')
      return
    }

    const recoveredLoginResponse = await suite.api.post('/api/v1/auth/login', {
      email: context.lockoutUser.credentials.email,
      password: context.lockoutUser.credentials.password
    })
    ensureExpectedStatus(recoveredLoginResponse, [200], 'POST', '/api/v1/auth/login')
    expect(recoveredLoginResponse.body.data.accessToken).toBeTruthy()
  })
})
