const { AbstractApiTest } = require('../../src/core/abstractApiTest');
const { ensureRootReady } = require('../../src/utils/rootAuth');

describe('Root authentication and session security', () => {
  const suite = new AbstractApiTest();
  let rootSession;

  beforeAll(async () => {
    await suite.setup();
    rootSession = await ensureRootReady(suite.api, suite.config);
  });

  afterAll(async () => {
    await suite.teardown();
  });

  it('rotates root refresh tokens and rejects token reuse', async () => {
    // First rotation should return a new refresh token.
    const firstRefresh = rootSession.refreshToken;
    const firstRefreshResponse = await suite.api.post('/api/v1/platform/root/refresh', {
      refreshToken: firstRefresh
    });
    suite.expectApiSuccessWithData(firstRefreshResponse);
    const firstRotated = suite.extractData(firstRefreshResponse);

    expect(firstRotated.refreshToken).toBeDefined();
    expect(firstRotated.refreshToken).not.toEqual(firstRefresh);

    // Second rotation should invalidate the previous rotated token.
    const secondRefreshResponse = await suite.api.post('/api/v1/platform/root/refresh', {
      refreshToken: firstRotated.refreshToken
    });
    suite.expectApiSuccessWithData(secondRefreshResponse);
    const secondRotated = suite.extractData(secondRefreshResponse);

    const reusedFirstResponse = await suite.api.post('/api/v1/platform/root/refresh', {
      refreshToken: firstRefresh
    });
    suite.expectAuthRejected(reusedFirstResponse);

    const reusedSecondResponse = await suite.api.post('/api/v1/platform/root/refresh', {
      refreshToken: firstRotated.refreshToken
    });
    suite.expectAuthRejected(reusedSecondResponse);

    rootSession = {
      ...rootSession,
      accessToken: secondRotated.accessToken,
      refreshToken: secondRotated.refreshToken
    };
  });

  it('rejects society onboarding for unauthenticated callers', async () => {
    // Root-only endpoint must reject requests with no root token.
    const response = await suite.api.post('/api/v1/platform/societies', {
      societyName: 'Unauthorized Society',
      societyAddress: 'Unauthorized Address',
      adminName: 'Unauthorized Admin',
      adminEmail: 'unauthorized.admin@shieldguard.test',
      adminPhone: '+911234567890',
      adminPassword: 'UnauthorizedAa1!'
    });

    suite.expectAuthRejected(response);
  });
});
