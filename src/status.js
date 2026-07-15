const STATUS_VALUES = Object.freeze([
  'in_progress',
  'waiting_user',
  'blocked',
  'complete',
  'error',
]);

function normalizeStatus(value, fallback = 'in_progress') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new Error('status must be a string.');

  const normalized = value.trim().toLowerCase().replaceAll('-', '_');
  if (!STATUS_VALUES.includes(normalized)) {
    throw new Error(`Invalid status: ${value}. Expected one of: ${STATUS_VALUES.join(', ')}.`);
  }
  return normalized;
}

module.exports = { STATUS_VALUES, normalizeStatus };
