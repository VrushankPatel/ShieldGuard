#!/usr/bin/env node
const { loadConfig } = require('../src/config/env');
const {
  collectDiagnostics,
  summarizeDiagnostics,
  writeDiagnosticsReport
} = require('../src/utils/containerDiagnostics');

function parseArgs(argv) {
  const args = {
    includeLogs: false,
    label: 'manual'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--logs') {
      args.includeLogs = true;
      continue;
    }
    if (value === '--label') {
      args.label = argv[index + 1] || args.label;
      index += 1;
    }
  }

  return args;
}

const config = loadConfig();
const args = parseArgs(process.argv.slice(2));

const diagnostics = collectDiagnostics(config, {
  includeLogs: args.includeLogs
});
const reportPath = writeDiagnosticsReport(config, diagnostics, args.label);

console.log(summarizeDiagnostics(diagnostics));
console.log(`Diagnostics report: ${reportPath}`);

if (diagnostics.unstable) {
  process.exit(2);
}
