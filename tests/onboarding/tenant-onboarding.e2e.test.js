const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { onboardSocietyWithAdmin, assertApiSuccess } = require('../../src/utils/onboarding')

describe('Tenant onboarding end-to-end flows', () => {
  const suite = new AbstractApiTest()
  let onboardingContext

  beforeAll(async () => {
    await suite.setup()
    onboardingContext = await onboardSocietyWithAdmin(suite.api, suite.config)
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('creates a society and tenant admin via root onboarding', () => {
    if (onboardingContext.onboardingBlocked) {
      expect(onboardingContext.onboardingResponse.status).toBe(400)
      expect((onboardingContext.onboardingResponse.body?.message || '').toLowerCase()).toContain(
        'password change is required'
      )
      expect((onboardingContext.onboardingBlockedReason || '').toLowerCase()).toContain('verification')
      return
    }

    expect(onboardingContext.onboarding.societyId).toBeTruthy()
    expect(onboardingContext.onboarding.adminUserId).toBeTruthy()
    expect(onboardingContext.onboarding.adminEmail).toEqual(onboardingContext.adminCredentials.email)
  })

  it('allows onboarded admin login and protected route access in tenant scope', async () => {
    if (onboardingContext.onboardingBlocked) {
      const loginResponse = await suite.api.post('/api/v1/auth/login', onboardingContext.adminCredentials)
      suite.expectAuthRejected(loginResponse)
      return
    }

    const usersResponse = await suite.api.get('/api/v1/users', onboardingContext.adminSession.accessToken)
    suite.expectApiSuccessWithData(usersResponse)

    const adminByIdResponse = await suite.api.get(
      `/api/v1/users/${onboardingContext.onboarding.adminUserId}`,
      onboardingContext.adminSession.accessToken
    )
    assertApiSuccess(adminByIdResponse, 'Fetch onboarded admin by id')

    const adminUser = adminByIdResponse.body.data
    expect(adminUser.id).toEqual(onboardingContext.onboarding.adminUserId)
    expect(adminUser.tenantId).toEqual(onboardingContext.onboarding.societyId)
    expect(adminUser.email.toLowerCase()).toEqual(onboardingContext.adminCredentials.email.toLowerCase())
  })
})
