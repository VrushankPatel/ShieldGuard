const { AbstractApiTest } = require('../../src/core/abstractApiTest');
const { ensureRootReady } = require('../../src/utils/rootAuth');
const { createSocietyPayload, createStrongPassword } = require('../../src/utils/dataFactory');

describe('Admin authentication and session invalidation flows', () => {
  const suite = new AbstractApiTest();
  let adminEmail;
  let adminPassword;
  let adminSession;

  async function loginAdmin(email, password) {
    const response = await suite.api.post('/api/v1/auth/login', {
      email,
      password
    });
    suite.expectApiSuccessWithData(response);
    return suite.extractData(response);
  }

  beforeAll(async () => {
    await suite.setup();

    const rootSession = await ensureRootReady(suite.api, suite.config);
    adminPassword = createStrongPassword('AdminInit');
    const societyPayload = createSocietyPayload(adminPassword);

    const createSocietyResponse = await suite.api.post(
      '/api/v1/platform/societies',
      societyPayload,
      rootSession.accessToken
    );
    suite.expectApiSuccessWithData(createSocietyResponse);

    adminEmail = societyPayload.adminEmail;
    adminSession = await loginAdmin(adminEmail, adminPassword);
  });

  afterAll(async () => {
    await suite.teardown();
  });

  it('allows authenticated admin access to protected user APIs', async () => {
    // Fresh access token must work on protected tenant-scoped APIs.
    const usersResponse = await suite.api.get('/api/v1/users', adminSession.accessToken);
    suite.expectApiSuccessWithData(usersResponse);
  });

  it('rotates admin refresh token on both refresh endpoints and blocks replay', async () => {
    // Rotate once via /refresh.
    const firstRefresh = adminSession.refreshToken;
    const refreshResponse = await suite.api.post('/api/v1/auth/refresh', {
      refreshToken: firstRefresh
    });
    suite.expectApiSuccessWithData(refreshResponse);
    const firstRotated = suite.extractData(refreshResponse);

    // Rotate again via /refresh-token alias.
    const refreshAliasResponse = await suite.api.post('/api/v1/auth/refresh-token', {
      refreshToken: firstRotated.refreshToken
    });
    suite.expectApiSuccessWithData(refreshAliasResponse);
    const secondRotated = suite.extractData(refreshAliasResponse);

    // Replay of consumed refresh tokens must fail.
    const reusedFirstResponse = await suite.api.post('/api/v1/auth/refresh', {
      refreshToken: firstRefresh
    });
    suite.expectAuthRejected(reusedFirstResponse);

    const reusedSecondResponse = await suite.api.post('/api/v1/auth/refresh', {
      refreshToken: firstRotated.refreshToken
    });
    suite.expectAuthRejected(reusedSecondResponse);

    adminSession = secondRotated;
  });

  it('invalidates refresh sessions on logout', async () => {
    // Logout should consume all active refresh sessions for the admin.
    const logoutResponse = await suite.api.post('/api/v1/auth/logout', {}, adminSession.accessToken);
    suite.expectApiSuccess(logoutResponse);

    const refreshAfterLogoutResponse = await suite.api.post('/api/v1/auth/refresh', {
      refreshToken: adminSession.refreshToken
    });
    suite.expectAuthRejected(refreshAfterLogoutResponse);
  });

  it('invalidates older sessions when admin changes password', async () => {
    // Login again to get a fresh session before password update.
    const preChangeSession = await loginAdmin(adminEmail, adminPassword);
    const nextPassword = createStrongPassword('AdminRotate');

    const changePasswordResponse = await suite.api.post(
      '/api/v1/auth/change-password',
      {
        currentPassword: adminPassword,
        newPassword: nextPassword
      },
      preChangeSession.accessToken
    );
    suite.expectApiSuccess(changePasswordResponse);

    // Pre-change refresh token must be invalid after password update.
    const refreshAfterChangeResponse = await suite.api.post('/api/v1/auth/refresh', {
      refreshToken: preChangeSession.refreshToken
    });
    suite.expectAuthRejected(refreshAfterChangeResponse);

    // Old password must fail and new password must pass.
    const oldPasswordLoginResponse = await suite.api.post('/api/v1/auth/login', {
      email: adminEmail,
      password: adminPassword
    });
    suite.expectAuthRejected(oldPasswordLoginResponse);

    adminPassword = nextPassword;
    adminSession = await loginAdmin(adminEmail, adminPassword);
  });
});
