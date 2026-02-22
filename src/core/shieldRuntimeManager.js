const { execFileSync } = require('child_process');
const { waitFor } = require('../utils/polling');

let initialized = false;
let startedByShieldGuard = false;
let consumerCount = 0;
let initializationPromise = null;

function joinUrl(baseUrl, path) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function isHealthy(config) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(joinUrl(config.baseUrl, config.healthPath), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });

    const body = await response.text().catch(() => '');
    if (response.status === 503 && body.includes('No server is available to handle this request')) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function runShieldCommand(config, downMode) {
  const args = [
    '--instances',
    String(config.instances),
    '--proxy',
    config.proxy,
    '--env-file',
    config.envFilePath
  ];

  if (downMode) {
    args.push('--down');
  }

  execFileSync(config.runScriptPath, args, {
    cwd: config.projectDir,
    stdio: 'inherit'
  });
}

async function ensureRuntimeReady(config) {
  consumerCount += 1;

  if (initialized) {
    return;
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      const alreadyHealthy = await isHealthy(config);
      if (alreadyHealthy) {
        initialized = true;
        return;
      }

      if (!config.autostart) {
        throw new Error(
          `SHIELD is not reachable at ${joinUrl(config.baseUrl, config.healthPath)} and SHIELD_AUTOSTART=false`
        );
      }

      runShieldCommand(config, false);

      await waitFor(() => isHealthy(config), {
        timeoutMs: config.startupTimeoutMs,
        intervalMs: config.pollIntervalMs,
        onRetry: (elapsed) => {
          process.stdout.write(`Waiting for SHIELD health check... ${elapsed} ms\n`);
        }
      });

      startedByShieldGuard = true;
      initialized = true;
    })();
  }

  try {
    await initializationPromise;
  } catch (error) {
    consumerCount = Math.max(consumerCount - 1, 0);
    throw error;
  } finally {
    initializationPromise = null;
  }
}

async function releaseRuntime(config) {
  consumerCount = Math.max(consumerCount - 1, 0);

  if (consumerCount > 0) {
    return;
  }

  if (!startedByShieldGuard || !config.autostop) {
    return;
  }

  runShieldCommand(config, true);
  initialized = false;
  startedByShieldGuard = false;
}

function forceStart(config) {
  runShieldCommand(config, false);
}

function forceStop(config) {
  runShieldCommand(config, true);
}

module.exports = {
  ensureRuntimeReady,
  releaseRuntime,
  forceStart,
  forceStop,
  isHealthy
};
