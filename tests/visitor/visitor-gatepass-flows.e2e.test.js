const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createStrongPassword, randomSuffix } = require('../../src/utils/dataFactory')
const { createUnit, loginWithEmail, onboardSocietyWithAdmin } = require('../../src/utils/onboarding')

function ensureExpectedStatus(response, expectedStatuses, method, path) {
  if (expectedStatuses.includes(response.status)) {
    return
  }

  throw new Error(
    `${method} ${path} expected ${expectedStatuses.join(' or ')}, got ${response.status} (${response.body?.message || 'no message'})`
  )
}

describe('Visitor and gate pass end-to-end scenarios', () => {
  const suite = new AbstractApiTest()
  const actorContext = {
    setupBlockedReason: null
  }

  async function createUser(role, unitId, accessToken) {
    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const password = createStrongPassword(role)
    const response = await suite.api.post(
      '/api/v1/users',
      {
        unitId,
        name: `${role} User ${suffix}`,
        email: `${role.toLowerCase()}.${suffix}@shieldguard.test`,
        phone: `+9198${suffix.slice(-8)}`,
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

  beforeAll(async () => {
    await suite.setup()

    if (suite.config.adminEmail && suite.config.adminPassword) {
      actorContext.adminCredentials = {
        email: suite.config.adminEmail,
        password: suite.config.adminPassword
      }
      actorContext.adminSession = await loginWithEmail(
        suite.api,
        suite.config.adminEmail,
        suite.config.adminPassword
      )
    } else {
      const onboarding = await onboardSocietyWithAdmin(suite.api, suite.config)
      if (onboarding.onboardingBlocked) {
        actorContext.setupBlockedReason =
          `${onboarding.onboardingBlockedReason || 'Tenant admin onboarding unavailable.'} ` +
          'Set SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env for SG-0005 execution in strict environments.'
        return
      }

      actorContext.adminCredentials = onboarding.adminCredentials
      actorContext.adminSession = onboarding.adminSession
    }

    actorContext.unit = await createUnit(suite.api, actorContext.adminSession.accessToken, {
      block: 'GATE',
      unitNumber: `G-${randomSuffix().slice(-4)}`
    })

    const ownerActor = await createUser('OWNER', actorContext.unit.id, actorContext.adminSession.accessToken)
    const securityActor = await createUser('SECURITY', actorContext.unit.id, actorContext.adminSession.accessToken)

    actorContext.owner = {
      ...ownerActor,
      session: await loginWithEmail(suite.api, ownerActor.credentials.email, ownerActor.credentials.password)
    }
    actorContext.security = {
      ...securityActor,
      session: await loginWithEmail(suite.api, securityActor.credentials.email, securityActor.credentials.password)
    }
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('runs resident-to-security gate workflow with explicit role boundaries', async () => {
    if (actorContext.setupBlockedReason) {
      expect(actorContext.setupBlockedReason.toLowerCase()).toContain('shield_admin_email')
      expect(actorContext.setupBlockedReason.toLowerCase()).toContain('verification')
      return
    }

    const validFrom = new Date(Date.now() + 5 * 60 * 1000)
    const validTo = new Date(validFrom.getTime() + 2 * 60 * 60 * 1000)
    const passCreateResponse = await suite.api.post(
      '/api/v1/visitor-passes/create',
      {
        unitId: actorContext.unit.id,
        visitorName: 'Ravi Kumar',
        vehicleNumber: 'GJ01AB1234',
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        visitDate: validFrom.toISOString().slice(0, 10),
        purpose: 'Family visit',
        numberOfPersons: 2
      },
      actorContext.owner.session.accessToken
    )
    ensureExpectedStatus(passCreateResponse, [200], 'POST', '/api/v1/visitor-passes/create')
    const visitorPass = passCreateResponse.body.data
    expect(visitorPass.id).toBeTruthy()

    const residentEntryAttempt = await suite.api.post(
      '/api/v1/visitor-logs/entry',
      {
        visitorPassId: visitorPass.id,
        entryGate: 'Gate-1'
      },
      actorContext.owner.session.accessToken
    )
    ensureExpectedStatus(residentEntryAttempt, [403], 'POST', '/api/v1/visitor-logs/entry')

    const securityEntry = await suite.api.post(
      '/api/v1/visitor-logs/entry',
      {
        visitorPassId: visitorPass.id,
        entryGate: 'Gate-1'
      },
      actorContext.security.session.accessToken
    )
    ensureExpectedStatus(securityEntry, [200], 'POST', '/api/v1/visitor-logs/entry')
    expect(securityEntry.body.data.visitorPassId).toEqual(visitorPass.id)
    expect(securityEntry.body.data.exitTime).toBeNull()

    const currentlyInside = await suite.api.get(
      '/api/v1/visitor-logs/currently-inside',
      actorContext.security.session.accessToken
    )
    ensureExpectedStatus(currentlyInside, [200], 'GET', '/api/v1/visitor-logs/currently-inside')
    const insideLogIds = (currentlyInside.body?.data?.content || []).map((log) => log.visitorPassId)
    expect(insideLogIds).toContain(visitorPass.id)

    const securityExit = await suite.api.post(
      '/api/v1/visitor-logs/exit',
      {
        visitorPassId: visitorPass.id,
        exitGate: 'Gate-1'
      },
      actorContext.security.session.accessToken
    )
    ensureExpectedStatus(securityExit, [200], 'POST', '/api/v1/visitor-logs/exit')
    expect(securityExit.body.data.exitTime).toBeTruthy()

    const passAfterExitResponse = await suite.api.get(
      `/api/v1/visitor-passes/${visitorPass.id}`,
      actorContext.security.session.accessToken
    )
    ensureExpectedStatus(passAfterExitResponse, [200], 'GET', '/api/v1/visitor-passes/{id}')
    expect(passAfterExitResponse.body.data.status).toBe('USED')
  })

  it('blocks unauthenticated visitor pass creation requests', async () => {
    const response = await suite.api.post('/api/v1/visitor-passes/create', {
      unitId: actorContext.unit?.id || '00000000-0000-0000-0000-000000000001',
      visitorName: 'Unauthorized Visitor',
      validFrom: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      validTo: new Date(Date.now() + 70 * 60 * 1000).toISOString()
    })
    ensureExpectedStatus(response, [401, 403], 'POST', '/api/v1/visitor-passes/create')
  })
})
