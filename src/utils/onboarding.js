const { createSocietyPayload, createStrongPassword, randomSuffix } = require('./dataFactory')
const { ensureRootReady } = require('./rootAuth')

function assertApiSuccess(response, context) {
  if (response.status !== 200 || response.body?.success !== true || !response.body?.data) {
    throw new Error(
      `${context} failed (status=${response.status}, success=${response.body?.success ?? 'n/a'})`
    )
  }
}

async function loginWithEmail(api, email, password) {
  const response = await api.post('/api/v1/auth/login', {
    email,
    password
  })
  assertApiSuccess(response, `Login for ${email}`)
  return response.body.data
}

async function onboardSocietyWithAdmin(api, config, options = {}) {
  const rootSession = await ensureRootReady(api, config)
  const adminPassword = options.adminPassword || createStrongPassword('AdminInit')

  const payloadFromFactory = createSocietyPayload(adminPassword)
  const societyPayload = {
    ...payloadFromFactory,
    ...options.societyPayload,
    adminPassword
  }

  const rootRotationGateActive =
    rootSession.passwordChangeRequired && !rootSession.bootstrapPasswordRotationApplied

  const createSocietyResponse = await api.post(
    '/api/v1/platform/societies',
    societyPayload,
    rootSession.accessToken
  )

  if (rootRotationGateActive) {
    return {
      rootSession,
      societyPayload,
      onboardingBlocked: true,
      onboardingBlockedReason: rootSession.passwordRotationSkippedReason,
      onboardingResponse: createSocietyResponse,
      adminCredentials: {
        email: societyPayload.adminEmail,
        password: adminPassword
      }
    }
  }

  assertApiSuccess(createSocietyResponse, 'Society onboarding')
  const onboarding = createSocietyResponse.body.data
  const adminSession = await loginWithEmail(api, societyPayload.adminEmail, adminPassword)

  return {
    rootSession,
    societyPayload,
    onboardingBlocked: false,
    onboardingResponse: createSocietyResponse,
    onboarding,
    adminCredentials: {
      email: societyPayload.adminEmail,
      password: adminPassword
    },
    adminSession
  }
}

async function createUnit(api, accessToken, overrides = {}) {
  const suffix = randomSuffix()
  const payload = {
    unitNumber: `A-${suffix}`,
    block: 'A',
    type: 'FLAT',
    squareFeet: 1200,
    status: 'ACTIVE',
    ...overrides
  }

  const response = await api.post('/api/v1/units', payload, accessToken)
  assertApiSuccess(response, 'Unit creation')
  return response.body.data
}

module.exports = {
  assertApiSuccess,
  loginWithEmail,
  onboardSocietyWithAdmin,
  createUnit
}
