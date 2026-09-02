const fs = require('fs');
const DATA_DIR = require('./data-dir');
const path = require('path');

const KEYS_PATH = path.join(DATA_DIR, 'keys.txt');

const TEMPLATE =
  '# One key per line. Lines starting with # are ignored.\n' +
  '# Add your real keys below, one per line. Each key is removed\n' +
  '# from this file automatically the moment someone redeems it.\n';

function ensureKeysFile() {
  if (!fs.existsSync(KEYS_PATH)) {
    fs.writeFileSync(KEYS_PATH, TEMPLATE);
  }
}

function readKeys() {
  ensureKeysFile();
  return fs
    .readFileSync(KEYS_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function writeKeys(keys) {
  fs.writeFileSync(KEYS_PATH, keys.join('\n') + (keys.length ? '\n' : ''));
}

/**
 * Checks whether a key exists in keys.txt. If it does, removes it
 * (single-use) and returns true. Returns false if not found.
 */
function redeemKey(inputKey) {
  const keys = readKeys();
  const normalizedInput = inputKey.trim();
  const idx = keys.findIndex((k) => k === normalizedInput);

  if (idx === -1) return false;

  keys.splice(idx, 1);
  writeKeys(keys);
  return true;
}

module.exports = { readKeys, redeemKey, KEYS_PATH };
