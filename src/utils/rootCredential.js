const fs = require('fs');

let cachedRootPassword = '';

function parseCredentialFile(credentialFilePath) {
  if (!fs.existsSync(credentialFilePath)) {
    return '';
  }

  const content = fs.readFileSync(credentialFilePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('credential=')) {
      return line.slice('credential='.length).trim();
    }
  }
  return '';
}

function resolveRootPassword(config) {
  if (cachedRootPassword) {
    return cachedRootPassword;
  }

  if (config.rootPassword && config.rootPassword.trim()) {
    cachedRootPassword = config.rootPassword.trim();
    return cachedRootPassword;
  }

  const fromFile = parseCredentialFile(config.rootCredentialFilePath);
  if (fromFile) {
    cachedRootPassword = fromFile;
    return cachedRootPassword;
  }

  throw new Error(
    'Root credential is not available. Set SHIELD_ROOT_PASSWORD in ShieldGuard/.env or provide SHIELD_ROOT_CREDENTIAL_FILE.'
  );
}

function setRootPasswordForSession(rootPassword) {
  cachedRootPassword = rootPassword;
}

module.exports = {
  resolveRootPassword,
  setRootPasswordForSession
};
