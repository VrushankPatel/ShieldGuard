#!/usr/bin/env node
const { loadConfig } = require('../src/config/env');
const { forceStart, forceStop } = require('../src/core/shieldRuntimeManager');

const command = process.argv[2];
const config = loadConfig();

if (command !== 'start' && command !== 'stop') {
  console.error('Usage: node scripts/shield-runtime.cjs <start|stop>');
  process.exit(1);
}

if (command === 'start') {
  forceStart(config);
  process.exit(0);
}

forceStop(config);
process.exit(0);
