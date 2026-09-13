const crypto = require('crypto');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generatePoloKey() {
  // POLO-3F9A2C7B
  const hash = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
  return `POLO-${hash}`;
}

function generateHashKey() {
  // 32-char uppercase hex
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

function generateCustomKey() {
  // XXXX-XXXX-XXXX-XXXX style
  const parts = [];
  for (let i = 0; i < 4; i++) {
    let part = '';
    for (let j = 0; j < 4; j++) {
      part += ALNUM[crypto.randomInt(0, ALNUM.length)];
    }
    parts.push(part);
  }
  return parts.join('-');
}

function generateRandom9Key() {
  let out = '';
  for (let i = 0; i < 9; i++) {
    out += LETTERS[crypto.randomInt(0, LETTERS.length)];
  }
  return out;
}

function generateKey(format) {
  const f = String(format || 'polo').toLowerCase().trim();
  if (f === 'hash') return generateHashKey();
  if (f === 'custom') return generateCustomKey();
  if (f === 'random9') return generateRandom9Key();
  return generatePoloKey();
}

/** Duration option value -> ms (null = lifetime) */
const DURATION_MS = {
  '1d': 1 * 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
  '3m': 90 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  lifetime: null
};

const DURATION_LABELS = {
  '1d': '1 Day',
  '3d': '3 Days',
  '7d': '7 Days',
  '1m': '1 Month',
  '3m': '3 Months',
  '1y': '1 Year',
  lifetime: 'Lifetime'
};

function durationToMs(duration) {
  const d = String(duration || 'lifetime').toLowerCase().trim();
  if (Object.prototype.hasOwnProperty.call(DURATION_MS, d)) {
    return DURATION_MS[d];
  }
  return null;
}

function durationLabel(duration) {
  const d = String(duration || 'lifetime').toLowerCase().trim();
  return DURATION_LABELS[d] || d;
}

/**
 * Compute expiresAt ISO string from now + duration.
 * Returns null for lifetime.
 */
function computeExpiresAt(duration, fromDate = new Date()) {
  const ms = durationToMs(duration);
  if (ms == null) return null;
  return new Date(fromDate.getTime() + ms).toISOString();
}

module.exports = {
  generateKey,
  durationToMs,
  durationLabel,
  computeExpiresAt,
  DURATION_MS,
  DURATION_LABELS
};
