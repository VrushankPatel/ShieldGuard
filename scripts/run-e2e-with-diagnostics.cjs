#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { loadConfig } = require('../src/config/env');
const {
  collectDiagnostics,
  compareDiagnostics,
  summarizeDiagnostics,
  summarizeComparison,
  writeComparisonReport,
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

const config = loadConfig();
const before = printSnapshot(config, 'before-e2e', false);
const jestResult = runJest();
const after = printSnapshot(config, 'after-e2e', jestResult.status !== 0);
const comparison = compareDiagnostics(before, after);
const comparisonReportPath = writeComparisonReport(config, comparison, 'delta-e2e');

console.log('[ShieldGuard] before/after diagnostics delta');
console.log(summarizeComparison(comparison));
console.log(`Delta report: ${comparisonReportPath}\n`);

const testFailed = (jestResult.status ?? 1) !== 0;
const runtimeUnstable =
  comparison.becameUnstable || comparison.restartDeltas.length > 0 || after.unstable;

if (testFailed || runtimeUnstable) {
  const failureSnapshot = printSnapshot(config, 'failure-e2e', true);
  const failureComparison = compareDiagnostics(before, failureSnapshot);
  const failureComparisonPath = writeComparisonReport(config, failureComparison, 'failure-delta-e2e');
  console.error('[ShieldGuard] Failure-context diagnostics captured.');
  console.error(`Failure delta report: ${failureComparisonPath}`);
}

if (runtimeUnstable) {
  console.error('[ShieldGuard] Container instability detected during/after test execution.');
  console.error('Review diagnostics reports under ShieldGuard/reports/ and start from delta-e2e report.');
  process.exit(1);
}

process.exit(jestResult.status ?? 1);
