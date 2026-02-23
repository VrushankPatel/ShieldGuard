const path = require('path');
const dotenv = require('dotenv');

const SHIELD_GUARD_ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(SHIELD_GUARD_ROOT, '.env') });

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseInteger(value, defaultValue) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function resolvePath(baseDirectory, maybeRelativePath) {
  if (!maybeRelativePath) {
    return baseDirectory;
  }
  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.resolve(baseDirectory, maybeRelativePath);
}

function loadConfig() {
  const shieldProjectDir = resolvePath(SHIELD_GUARD_ROOT, process.env.SHIELD_PROJECT_DIR || '..');
  const runScriptPath = resolvePath(SHIELD_GUARD_ROOT, process.env.SHIELD_RUN_SCRIPT || '../run.sh');
  const envFilePath = resolvePath(SHIELD_GUARD_ROOT, process.env.SHIELD_ENV_FILE || '../dev.env');
  const credentialFilePath = resolvePath(
    SHIELD_GUARD_ROOT,
    process.env.SHIELD_ROOT_CREDENTIAL_FILE || '../root-bootstrap-credential.txt'
  );

  return {
    shieldGuardRoot: SHIELD_GUARD_ROOT,
    reportsDir: path.resolve(SHIELD_GUARD_ROOT, 'reports'),
    baseUrl: process.env.SHIELD_BASE_URL || 'http://localhost:8080',
    healthPath: process.env.SHIELD_HEALTH_PATH || '/actuator/info',
    autostart: parseBoolean(process.env.SHIELD_AUTOSTART, true),
    autostop: parseBoolean(process.env.SHIELD_AUTOSTOP, false),
    startupTimeoutMs: parseInteger(process.env.SHIELD_STARTUP_TIMEOUT_MS, 240000),
    pollIntervalMs: parseInteger(process.env.SHIELD_POLL_INTERVAL_MS, 4000),
    projectDir: shieldProjectDir,
    runScriptPath,
    envFilePath,
    instances: parseInteger(process.env.SHIELD_INSTANCES, 1),
    proxy: process.env.SHIELD_PROXY || 'haproxy',
    rootLoginId: process.env.SHIELD_ROOT_LOGIN_ID || 'root',
    rootPassword: process.env.SHIELD_ROOT_PASSWORD || '',
    rootCredentialFilePath: credentialFilePath,
    rootEmail: process.env.SHIELD_ROOT_EMAIL || 'root@shield.local',
    rootMobile: process.env.SHIELD_ROOT_MOBILE || '+911234567890',
    adminEmail: process.env.SHIELD_ADMIN_EMAIL || '',
    adminPassword: process.env.SHIELD_ADMIN_PASSWORD || ''
  };
}

module.exports = {
  loadConfig
};
