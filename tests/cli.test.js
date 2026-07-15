const test = require('node:test');
const assert = require('node:assert/strict');

// Keep a small smoke test around the public command surface without starting Electron.
test('package exposes the agent CLI entry point', () => {
  const packageJson = require('../package.json');
  assert.equal(packageJson.bin['agent-windows'], 'bin/agent-windows.js');
  assert.match(packageJson.scripts.cli, /agent-windows/);
});
