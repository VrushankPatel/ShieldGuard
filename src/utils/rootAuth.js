const { createStrongPassword } = require('./dataFactory');
const { resolveRootPassword, setRootPasswordForSession } = require('./rootCredential');

function apiSucceeded(response) {
  return response.status === 200 && response.body && response.body.success === true;
}

function data(response) {
  return response?.body?.data;
}

async function loginRoot(api, config, password) {
  return api.post('/api/v1/platform/root/login', {
    loginId: config.rootLoginId,
    password
  });
}

async function ensureRootReady(api, config) {
  let currentPassword = resolveRootPassword(config);
  let loginResponse = await loginRoot(api, config, currentPassword);
  let bootstrapPasswordRotationApplied = false;
  let passwordRotationSkippedReason = null;

  if (!apiSucceeded(loginResponse)) {
    throw new Error(
      `Root login failed with status ${loginResponse.status}. ` +
        'Provide SHIELD_ROOT_PASSWORD in ShieldGuard/.env if bootstrap credential is no longer valid.'
    );
  }

  let session = data(loginResponse);

  // Handle first-run hardening flow where root must rotate password.
  if (session.passwordChangeRequired) {
    const nextPassword = createStrongPassword('RootInit');
    const changeResponse = await api.post(
      '/api/v1/platform/root/change-password',
      {
        email: config.rootEmail,
        mobile: config.rootMobile,
        newPassword: nextPassword,
        confirmNewPassword: nextPassword
      },
      session.accessToken
    );

    if (apiSucceeded(changeResponse)) {
      bootstrapPasswordRotationApplied = true;

      const staleRefreshResponse = await api.post('/api/v1/platform/root/refresh', {
        refreshToken: session.refreshToken
      });
      if (apiSucceeded(staleRefreshResponse)) {
        throw new Error('Root refresh token stayed valid after password rotation.');
      }

      currentPassword = nextPassword;
      loginResponse = await loginRoot(api, config, currentPassword);
      if (!apiSucceeded(loginResponse)) {
        throw new Error('Root login failed immediately after successful root password change.');
      }
      session = data(loginResponse);
    } else if ([400, 403].includes(changeResponse.status)) {
      passwordRotationSkippedReason =
        'Root password-change verification is blocked in this environment. ' +
        'Enable dummy verification for test environments or provide real verification providers.';
    } else {
      throw new Error(`Root password change failed with status ${changeResponse.status}`);
    }
  }

  setRootPasswordForSession(currentPassword);

  return {
    password: currentPassword,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    passwordChangeRequired: session.passwordChangeRequired,
    bootstrapPasswordRotationApplied,
    passwordRotationSkippedReason
  };
}

module.exports = {
  loginRoot,
  ensureRootReady
};
