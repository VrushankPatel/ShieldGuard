const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function toTitleProxy(proxy) {
  const normalized = String(proxy || '').toLowerCase();
  if (normalized === 'haproxy') {
    return 'HaProxy';
  }
  if (normalized === 'nginx') {
    return 'Nginx';
  }
  return proxy || 'HaProxy';
}

function composeProjectName(config) {
  return `system${config.instances}nodes${toTitleProxy(config.proxy)}`.toLowerCase();
}

function runDockerCommand(args) {
  try {
    return execFileSync('docker', args, { encoding: 'utf8' }).trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : 'n/a';
    return `ERROR: ${stderr || error.message}`;
  }
}

function parseContainerLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, status, image] = line.split('\t');
      return {
        name,
        status,
        image
      };
    });
}

function getRestartCount(containerName) {
  const output = runDockerCommand(['inspect', '-f', '{{.RestartCount}}', containerName]);
  const numeric = Number.parseInt(output, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getTailLogs(containerName, lines = 120) {
  return runDockerCommand(['logs', '--tail', String(lines), containerName]);
}

function extractHints(containers, containerLogs) {
  const hints = [];

  for (const container of containers) {
    const status = String(container.status || '').toLowerCase();
    if (status.includes('restarting')) {
      hints.push(`Container ${container.name} is restarting.`);
    }
  }

  for (const [containerName, logs] of Object.entries(containerLogs || {})) {
    const lower = String(logs || '').toLowerCase();
    if (lower.includes('password authentication failed for user')) {
      hints.push(
        `${containerName} log shows database password authentication failure. Check SHIELD_ENV_FILE, POSTGRES_PASSWORD, and persisted db_files state.`
      );
    }
    if (lower.includes('unable to obtain connection from database')) {
      hints.push(`${containerName} could not obtain a database connection during startup.`);
    }
    if (lower.includes('outofmemoryerror')) {
      hints.push(`${containerName} experienced OOM. Consider increasing container memory.`);
    }
    if (lower.includes('address already in use')) {
      hints.push(`${containerName} failed due to port conflict (address already in use).`);
    }
  }

  return [...new Set(hints)];
}

function collectDiagnostics(config, options = {}) {
  const includeLogs = options.includeLogs ?? true;
  const logsTailLines = options.logsTailLines ?? 120;
  const project = composeProjectName(config);

  const allContainers = runDockerCommand([
    'ps',
    '-a',
    '--format',
    '{{.Names}}\t{{.Status}}\t{{.Image}}'
  ]);

  const projectContainers = parseContainerLines(allContainers).filter((entry) =>
    entry.name.startsWith(`${project}-`)
  );

  const containers = projectContainers.map((entry) => ({
    ...entry,
    restartCount: getRestartCount(entry.name)
  }));

  const containerLogs = {};
  if (includeLogs) {
    for (const container of containers) {
      containerLogs[container.name] = getTailLogs(container.name, logsTailLines);
    }
  }

  const hints = extractHints(containers, containerLogs);
  const unstable = containers.some((container) => {
    const status = String(container.status || '').toLowerCase();
    return status.includes('restarting') || status.includes('exited');
  });

  return {
    timestamp: new Date().toISOString(),
    project,
    containers,
    unstable,
    hints,
    logs: containerLogs
  };
}

function ensureReportsDir(config) {
  const dirPath = config.reportsDir || path.resolve(config.shieldGuardRoot, 'reports');
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function writeDiagnosticsReport(config, diagnostics, label = 'snapshot') {
  const dirPath = ensureReportsDir(config);
  const safeLabel = String(label || 'snapshot').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `shield-diagnostics-${safeLabel}-${Date.now()}.log`;
  const reportPath = path.join(dirPath, fileName);

  const lines = [];
  lines.push(`timestamp=${diagnostics.timestamp}`);
  lines.push(`project=${diagnostics.project}`);
  lines.push(`unstable=${diagnostics.unstable}`);
  lines.push('');

  lines.push('containers:');
  if (!diagnostics.containers.length) {
    lines.push('  (none found for this compose project)');
  } else {
    diagnostics.containers.forEach((container) => {
      lines.push(
        `  - ${container.name} | status=${container.status} | image=${container.image} | restartCount=${container.restartCount}`
      );
    });
  }

  lines.push('');
  lines.push('hints:');
  if (!diagnostics.hints.length) {
    lines.push('  (none)');
  } else {
    diagnostics.hints.forEach((hint) => lines.push(`  - ${hint}`));
  }

  if (diagnostics.logs && Object.keys(diagnostics.logs).length) {
    lines.push('');
    lines.push('logs:');
    for (const [containerName, logs] of Object.entries(diagnostics.logs)) {
      lines.push(`--- ${containerName} ---`);
      lines.push(logs || '(empty)');
      lines.push('');
    }
  }

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
  return reportPath;
}

function summarizeDiagnostics(diagnostics) {
  const lines = [];
  lines.push(`Project: ${diagnostics.project}`);
  lines.push(`Unstable: ${diagnostics.unstable}`);
  if (!diagnostics.containers.length) {
    lines.push('Containers: none detected');
  } else {
    lines.push('Containers:');
    diagnostics.containers.forEach((container) => {
      lines.push(
        `  - ${container.name}: ${container.status} (restartCount=${container.restartCount})`
      );
    });
  }

  if (diagnostics.hints.length) {
    lines.push('Hints:');
    diagnostics.hints.forEach((hint) => lines.push(`  - ${hint}`));
  }

  return lines.join('\n');
}

module.exports = {
  collectDiagnostics,
  writeDiagnosticsReport,
  summarizeDiagnostics
};
