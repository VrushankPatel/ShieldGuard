const { createStrongPassword, randomSuffix } = require('./dataFactory')
const { loginWithEmail, onboardSocietyWithAdmin } = require('./onboarding')

function ensureExpectedStatus(response, expectedStatuses, method, path) {
  if (expectedStatuses.includes(response.status)) {
    return
  }

  throw new Error(
    `${method} ${path} expected ${expectedStatuses.join(' or ')}, got ${response.status} (${response.body?.message || 'no message'})`
  )
}

async function resolveAdminSession(suite, context, scenarioTag) {
  try {
    if (suite.config.adminEmail && suite.config.adminPassword) {
      context.adminSession = await loginWithEmail(suite.api, suite.config.adminEmail, suite.config.adminPassword)
      return
    }

    const onboarding = await onboardSocietyWithAdmin(suite.api, suite.config)
    if (onboarding.onboardingBlocked) {
      context.setupBlockedReason =
        `${onboarding.onboardingBlockedReason || `${scenarioTag} onboarding unavailable.`} ` +
        `Set SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env for ${scenarioTag}.`
      return
    }

    context.adminSession = onboarding.adminSession
  } catch (error) {
    const message = error?.message || `${scenarioTag} setup failed`
    context.setupBlockedReason =
      `${message}. Set SHIELD_ROOT_PASSWORD or provide SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env.`
  }
}

function skipIfSetupBlocked(context) {
  if (!context.setupBlockedReason) {
    return false
  }

  expect(context.setupBlockedReason).toMatch(/SHIELD_(ADMIN_EMAIL|ADMIN_PASSWORD|ROOT_PASSWORD)/)
  return true
}

async function createUser(suite, accessToken, unitId, role, namePrefix) {
  const suffix = randomSuffix().replace(/[^0-9]/g, '')
  const password = createStrongPassword(role)
  const response = await suite.api.post(
    '/api/v1/users',
    {
      unitId,
      name: `${namePrefix} ${suffix}`,
      email: `${role.toLowerCase()}.${namePrefix.toLowerCase()}.${suffix}@shieldguard.test`,
      phone: `+9166${suffix.slice(-8)}`,
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

module.exports = {
  ensureExpectedStatus,
  resolveAdminSession,
  skipIfSetupBlocked,
  createUser
}
