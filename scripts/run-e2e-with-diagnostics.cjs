#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { loadConfig } = require('../src/config/env');
const {
  collectDiagnostics,
  summarizeDiagnostics,
  writeDiagnosticsReport
} = require('../src/utils/containerDiagnostics');

function runJest() {
  return spawnSync(
    process.execPath,
    ['node_modules/jest/bin/jest.js', '--runInBand', '--config', 'jest.config.cjs'],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    }
  );
}

function printSnapshot(config, label, includeLogs) {
  const diagnostics = collectDiagnostics(config, { includeLogs });
  const reportPath = writeDiagnosticsReport(config, diagnostics, label);
  console.log(`\n[ShieldGuard] ${label} container snapshot`);
  console.log(summarizeDiagnostics(diagnostics));
  console.log(`Diagnostics report: ${reportPath}\n`);
  return diagnostics;
}

function isMoreUnstable(before, after) {
  if (!before || !after) {
    return false;
  }

  const beforeMap = new Map(before.containers.map((container) => [container.name, container.restartCount]));
  return after.containers.some((container) => {
    const previous = beforeMap.get(container.name) ?? 0;
    return container.restartCount > previous;
  });
}

const config = loadConfig();
const before = printSnapshot(config, 'before-e2e', false);
const jestResult = runJest();
const after = printSnapshot(config, 'after-e2e', jestResult.status !== 0);

const restartIncreased = isMoreUnstable(before, after);
const becameUnstable = after.unstable;

if (restartIncreased || becameUnstable) {
  console.error('[ShieldGuard] Container instability detected during/after test execution.');
  console.error('Review diagnostics reports under ShieldGuard/reports/.');
  process.exit(1);
}

process.exit(jestResult.status ?? 1);
