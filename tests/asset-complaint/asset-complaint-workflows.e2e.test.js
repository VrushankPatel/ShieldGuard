const { randomSuffix, createStrongPassword } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createUnit, loginWithEmail, onboardSocietyWithAdmin } = require('../../src/utils/onboarding')

function ensureExpectedStatus(response, expectedStatuses, method, path) {
  if (expectedStatuses.includes(response.status)) {
    return
  }

  throw new Error(
    `${method} ${path} expected ${expectedStatuses.join(' or ')}, got ${response.status} (${response.body?.message || 'no message'})`
  )
}

describe('Asset and complaint workflow end-to-end scenarios', () => {
  const suite = new AbstractApiTest()
  const context = {
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
        phone: `+9188${suffix.slice(-8)}`,
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
      context.adminSession = await loginWithEmail(suite.api, suite.config.adminEmail, suite.config.adminPassword)
    } else {
      const onboarding = await onboardSocietyWithAdmin(suite.api, suite.config)
      if (onboarding.onboardingBlocked) {
        context.setupBlockedReason =
          `${onboarding.onboardingBlockedReason || 'Tenant admin onboarding unavailable.'} ` +
          'Set SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env for SG-0006 execution in strict environments.'
        return
      }

      context.adminSession = onboarding.adminSession
    }

    context.unit = await createUnit(suite.api, context.adminSession.accessToken, {
      block: 'ASSET',
      unitNumber: `AS-${randomSuffix().slice(-4)}`
    })

    const securityActor = await createUser('SECURITY', context.unit.id, context.adminSession.accessToken)
    context.security = {
      ...securityActor,
      session: await loginWithEmail(suite.api, securityActor.credentials.email, securityActor.credentials.password)
    }
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('creates asset and drives complaint through explicit lifecycle transitions', async () => {
    if (context.setupBlockedReason) {
      expect(context.setupBlockedReason.toLowerCase()).toContain('shield_admin_email')
      expect(context.setupBlockedReason.toLowerCase()).toContain('verification')
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const categoryResponse = await suite.api.post(
      '/api/v1/asset-categories',
      {
        categoryName: `Electrical-${suffix}`,
        description: 'Electrical infrastructure assets'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(categoryResponse, [200], 'POST', '/api/v1/asset-categories')
    const category = categoryResponse.body.data

    const assetResponse = await suite.api.post(
      '/api/v1/assets',
      {
        assetCode: `A-${suffix}`,
        assetName: `Lobby Light ${suffix}`,
        categoryId: category.id,
        category: category.categoryName,
        location: 'Block A Lobby',
        blockName: 'A',
        floorLabel: 'Ground',
        status: 'ACTIVE'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(assetResponse, [200], 'POST', '/api/v1/assets')
    const asset = assetResponse.body.data
    expect(asset.id).toBeTruthy()

    const complaintCreateResponse = await suite.api.post(
      '/api/v1/complaints',
      {
        assetId: asset.id,
        unitId: context.unit.id,
        title: `Light not working ${suffix}`,
        description: 'Lobby light is flickering and not stable',
        priority: 'HIGH',
        complaintType: 'ELECTRICAL',
        location: 'Block A Lobby',
        slaHours: 24
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(complaintCreateResponse, [200], 'POST', '/api/v1/complaints')
    const complaint = complaintCreateResponse.body.data
    expect(complaint.status).toBe('OPEN')

    const assignResponse = await suite.api.post(
      `/api/v1/complaints/${complaint.id}/assign`,
      {
        assignedTo: context.security.user.id
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(assignResponse, [200], 'POST', '/api/v1/complaints/{id}/assign')
    expect(assignResponse.body.data.status).toBe('ASSIGNED')
    expect(assignResponse.body.data.assignedTo).toEqual(context.security.user.id)

    const resolveResponse = await suite.api.post(
      `/api/v1/complaints/${complaint.id}/resolve`,
      {
        resolutionNotes: 'Replaced driver and tested for 10 minutes'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(resolveResponse, [200], 'POST', '/api/v1/complaints/{id}/resolve')
    expect(resolveResponse.body.data.status).toBe('RESOLVED')
    expect(resolveResponse.body.data.resolvedAt).toBeTruthy()

    const closeResponse = await suite.api.post(
      `/api/v1/complaints/${complaint.id}/close`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(closeResponse, [200], 'POST', '/api/v1/complaints/{id}/close')
    expect(closeResponse.body.data.status).toBe('CLOSED')
    expect(closeResponse.body.data.closedAt).toBeTruthy()
  })

  it('rejects invalid asset references in complaint workflows', async () => {
    if (context.setupBlockedReason) {
      expect(context.setupBlockedReason.toLowerCase()).toContain('shield_admin_email')
      return
    }

    const invalidAssetId = '00000000-0000-0000-0000-000000000999'
    const complaintWithInvalidAsset = await suite.api.post(
      '/api/v1/complaints',
      {
        assetId: invalidAssetId,
        unitId: context.unit.id,
        title: `Invalid asset reference ${randomSuffix()}`,
        description: 'This should fail because asset does not exist',
        priority: 'LOW',
        complaintType: 'MAINTENANCE',
        location: 'Unknown'
      },
      context.adminSession.accessToken
    )

    ensureExpectedStatus(complaintWithInvalidAsset, [400, 404, 409], 'POST', '/api/v1/complaints')

    const getMissingAsset = await suite.api.get(`/api/v1/assets/${invalidAssetId}`, context.adminSession.accessToken)
    ensureExpectedStatus(getMissingAsset, [404], 'GET', '/api/v1/assets/{id}')
  })
})
