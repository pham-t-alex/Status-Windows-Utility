const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeStatus } = require('../src/status');

test('normalizes supported status names', () => {
  assert.equal(normalizeStatus('in-progress'), 'in_progress');
  assert.equal(normalizeStatus('waiting_user'), 'waiting_user');
  assert.equal(normalizeStatus('complete'), 'complete');
});

test('defaults status to in_progress', () => {
  assert.equal(normalizeStatus(), 'in_progress');
});

test('rejects unknown statuses', () => {
  assert.throws(() => normalizeStatus('paused'), /Invalid status/);
});
