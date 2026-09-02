const fs = require('fs');
const DATA_DIR = require('./data-dir');
const path = require('path');

const RESETS_PATH = path.join(DATA_DIR, 'resets.json');
const MAX_RESETS = 3;

function loadAll() {
  if (!fs.existsSync(RESETS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(RESETS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveAll(data) {
  fs.writeFileSync(RESETS_PATH, JSON.stringify(data, null, 2));
}

function getUsed(guildId, userId) {
  const all = loadAll();
  return all[guildId]?.[userId] ?? 0;
}

function getRemaining(guildId, userId) {
  return Math.max(0, MAX_RESETS - getUsed(guildId, userId));
}

/**
 * Attempts to use one reset. Returns { success, remaining }.
 * success is false if the user has no resets left.
 */
function useReset(guildId, userId) {
  const all = loadAll();
  if (!all[guildId]) all[guildId] = {};
  const used = all[guildId][userId] ?? 0;

  if (used >= MAX_RESETS) {
    return { success: false, remaining: 0 };
  }

  all[guildId][userId] = used + 1;
  saveAll(all);
  return { success: true, remaining: MAX_RESETS - (used + 1) };
}

module.exports = { getUsed, getRemaining, useReset, MAX_RESETS };
