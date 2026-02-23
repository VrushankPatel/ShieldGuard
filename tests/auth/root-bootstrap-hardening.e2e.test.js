const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createStrongPassword } = require('../../src/utils/dataFactory')
const { ensureRootReady, loginRoot } = require('../../src/utils/rootAuth')
const { resolveRootPassword, setRootPasswordForSession } = require('../../src/utils/rootCredential')

describe('Root bootstrap and first-login hardening', () => {
  const suite = new AbstractApiTest()
  let rootState

  beforeAll(async () => {
    await suite.setup()
    rootState = await ensureRootReady(suite.api, suite.config)
  })

  afterAll(async () => {
    // Keep the runtime cache aligned with the stable password for later suites.
    if (rootState?.password) {
      setRootPasswordForSession(rootState.password)
    }
    await suite.teardown()
  })

  it('resolves bootstrap credential and produces a valid root auth payload', async () => {
    const resolvedPassword = resolveRootPassword(suite.config)
    expect(resolvedPassword).toBeTruthy()

    const loginResponse = await loginRoot(suite.api, suite.config, resolvedPassword)
    suite.expectApiSuccessWithData(loginResponse)

    const session = suite.extractData(loginResponse)
    expect(session.accessToken).toBeTruthy()
    expect(session.refreshToken).toBeTruthy()
    expect(typeof session.passwordChangeRequired).toBe('boolean')
    if (rootState.passwordChangeRequired && !rootState.bootstrapPasswordRotationApplied) {
      expect(rootState.passwordRotationSkippedReason).toMatch(/verification/i)
    }
  })

  it('enforces password-change hardening by invalidating stale refresh sessions', async () => {
    const stablePassword = rootState.password
    const firstSessionResponse = await loginRoot(suite.api, suite.config, stablePassword)
    suite.expectApiSuccessWithData(firstSessionResponse)
    const firstSession = suite.extractData(firstSessionResponse)

    const rotatedPassword = createStrongPassword('RootRotate')
    const rotateResponse = await suite.api.post(
      '/api/v1/platform/root/change-password',
      {
        email: suite.config.rootEmail,
        mobile: suite.config.rootMobile,
        newPassword: rotatedPassword,
        confirmNewPassword: rotatedPassword
      },
      firstSession.accessToken
    )
    if (![200, 400, 403].includes(rotateResponse.status)) {
      throw new Error(`Unexpected root password-change status: ${rotateResponse.status}`)
    }
    if (rotateResponse.status !== 200) {
      const message = rotateResponse?.body?.message || rotateResponse?.body?.error || ''
      expect(message.toLowerCase()).toContain('verification')
      return
    }
    suite.expectApiSuccess(rotateResponse)

    const staleRefreshResponse = await suite.api.post('/api/v1/platform/root/refresh', {
      refreshToken: firstSession.refreshToken
    })
    suite.expectAuthRejected(staleRefreshResponse)

    const oldPasswordResponse = await loginRoot(suite.api, suite.config, stablePassword)
    suite.expectAuthRejected(oldPasswordResponse)

    const rotatedLoginResponse = await loginRoot(suite.api, suite.config, rotatedPassword)
    suite.expectApiSuccessWithData(rotatedLoginResponse)
    const rotatedSession = suite.extractData(rotatedLoginResponse)

    const revertResponse = await suite.api.post(
      '/api/v1/platform/root/change-password',
      {
        email: suite.config.rootEmail,
        mobile: suite.config.rootMobile,
        newPassword: stablePassword,
        confirmNewPassword: stablePassword
      },
      rotatedSession.accessToken
    )
    suite.expectApiSuccess(revertResponse)

    const rotatedStaleRefreshResponse = await suite.api.post('/api/v1/platform/root/refresh', {
      refreshToken: rotatedSession.refreshToken
    })
    suite.expectAuthRejected(rotatedStaleRefreshResponse)

    const revertedLoginResponse = await loginRoot(suite.api, suite.config, stablePassword)
    suite.expectApiSuccessWithData(revertedLoginResponse)
    rootState = {
      ...rootState,
      password: stablePassword,
      ...suite.extractData(revertedLoginResponse)
    }
  })
})
