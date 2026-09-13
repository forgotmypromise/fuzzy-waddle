const fs = require('fs');
const path = require('path');
const DATA_DIR = require('./data-dir');

const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const WHITELIST_PATH = path.join(DATA_DIR, 'whitelist.json');

function loadAll() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveAll(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

function getGuildConfig(guildId) {
  const all = loadAll();
  return all[guildId] || {};
}

function setGuildLink(guildId, key, url) {
  const all = loadAll();
  if (!all[guildId]) all[guildId] = {};
  all[guildId][key] = url;
  saveAll(all);
}

function setPremiumRole(guildId, roleId) {
  const all = loadAll();
  if (!all[guildId]) all[guildId] = {};
  all[guildId].premiumRoleId = roleId;
  saveAll(all);
}

function setResetLimit(guildId, amount) {
  const all = loadAll();
  if (!all[guildId]) all[guildId] = {};
  all[guildId].resetLimit = amount;
  saveAll(all);
}

// ========== WHITELIST (per-command permissions) ==========
// Format: { "userId": ["all"] } or { "userId": ["genkeys", "disable", ...] }
// Legacy format (array of ids) is auto-migrated to { id: ["all"] }.

function loadWhitelistRaw() {
  if (!fs.existsSync(WHITELIST_PATH)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8'));
    // Legacy: array of user ids
    if (Array.isArray(data)) {
      const migrated = {};
      for (const id of data) {
        if (id) migrated[String(id)] = ['all'];
      }
      saveWhitelistRaw(migrated);
      return migrated;
    }
    if (data && typeof data === 'object') {
      return data;
    }
    return {};
  } catch {
    return {};
  }
}

function saveWhitelistRaw(obj) {
  fs.writeFileSync(WHITELIST_PATH, JSON.stringify(obj, null, 2));
}

function loadWhitelist() {
  // Returns list of user ids (for compatibility)
  return Object.keys(loadWhitelistRaw());
}

function getUserPerms(userId) {
  const all = loadWhitelistRaw();
  const perms = all[String(userId)];
  if (!perms) return null;
  if (!Array.isArray(perms)) return ['all'];
  return perms.map(p => String(p).toLowerCase().trim()).filter(Boolean);
}

function addToWhitelist(userId, commands = ['all']) {
  const all = loadWhitelistRaw();
  const id = String(userId);
  if (all[id]) return false;
  const list = Array.isArray(commands) && commands.length
    ? commands.map(c => String(c).toLowerCase().trim()).filter(Boolean)
    : ['all'];
  all[id] = list.includes('all') ? ['all'] : list;
  saveWhitelistRaw(all);
  return true;
}

function removeFromWhitelist(userId) {
  const all = loadWhitelistRaw();
  const id = String(userId);
  if (!all[id]) return false;
  delete all[id];
  saveWhitelistRaw(all);
  return true;
}

function setUserPerms(userId, commands) {
  const all = loadWhitelistRaw();
  const id = String(userId);
  if (!all[id]) return false;
  const list = Array.isArray(commands)
    ? commands.map(c => String(c).toLowerCase().trim()).filter(Boolean)
    : [];
  if (!list.length) return false;
  all[id] = list.includes('all') ? ['all'] : list;
  saveWhitelistRaw(all);
  return true;
}

function isWhitelisted(userId) {
  return !!getUserPerms(userId);
}

function userCanUseCommand(userId, commandName) {
  const perms = getUserPerms(userId);
  if (!perms) return false;
  if (perms.includes('all')) return true;
  const cmd = String(commandName || '').toLowerCase().trim();
  return perms.includes(cmd);
}

// ========== SUPPORT STATUS ==========
function setSupportStatus(guildId, untilTimestamp, reason) {
  const all = loadAll();
  if (!all[guildId]) all[guildId] = {};
  all[guildId].supportStatus = {
    until: untilTimestamp,
    reason: reason
  };
  saveAll(all);
}

function clearSupportStatus(guildId) {
  const all = loadAll();
  if (!all[guildId]) return;
  delete all[guildId].supportStatus;
  saveAll(all);
}

function getSupportStatus(guildId) {
  const config = getGuildConfig(guildId);
  const status = config.supportStatus;
  if (!status || !status.until) return null;
  if (Date.now() >= status.until) {
    clearSupportStatus(guildId);
    return null;
  }
  return status;
}

// ========== APPLICATION TOGGLES ==========
const DEFAULT_APPS = {
  media: true,
  staff: false,
  helper: false
};

const APPS_KEY = '__applications__';

function getAppStatus(_guildId) {
  const all = loadAll();
  const stored = all[APPS_KEY];
  if (stored && typeof stored === 'object') {
    return {
      media: !!stored.media,
      staff: !!stored.staff,
      helper: !!stored.helper
    };
  }
  return { ...DEFAULT_APPS };
}

function setAppStatus(_guildId, type, isOpen) {
  const all = loadAll();
  if (!all[APPS_KEY] || typeof all[APPS_KEY] !== 'object') {
    all[APPS_KEY] = { ...DEFAULT_APPS };
  }

  const open = isOpen === true || isOpen === 'open' || isOpen === 'true';

  if (type === 'all') {
    all[APPS_KEY].media = open;
    all[APPS_KEY].staff = open;
    all[APPS_KEY].helper = open;
  } else if (['media', 'staff', 'helper'].includes(type)) {
    all[APPS_KEY][type] = open;
  }

  saveAll(all);

  return {
    media: !!all[APPS_KEY].media,
    staff: !!all[APPS_KEY].staff,
    helper: !!all[APPS_KEY].helper
  };
}

function isAppOpen(_guildId, type) {
  if (!['media', 'staff', 'helper'].includes(type)) return false;
  const status = getAppStatus();
  return status[type] === true;
}

// ========== FREE SCRIPT MESSAGE ==========
const FREESCRIPT_KEY = '__freescript__';

function getFreeScriptText() {
  const all = loadAll();
  // Prefer new key; fall back to old announce key
  const stored = all[FREESCRIPT_KEY] ?? all['__announce__'];
  if (typeof stored === 'string' && stored.trim()) {
    return stored;
  }
  return null;
}

function setFreeScriptText(text) {
  const all = loadAll();
  all[FREESCRIPT_KEY] = String(text || '').trim();
  saveAll(all);
  return all[FREESCRIPT_KEY];
}

// Back-compat aliases
function getAnnounceText() {
  return getFreeScriptText();
}

function setAnnounceText(text) {
  return setFreeScriptText(text);
}

module.exports = {
  getGuildConfig,
  setGuildLink,
  setPremiumRole,
  setResetLimit,
  loadWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  setUserPerms,
  getUserPerms,
  isWhitelisted,
  userCanUseCommand,
  setSupportStatus,
  clearSupportStatus,
  getSupportStatus,
  getAppStatus,
  setAppStatus,
  isAppOpen,
  getFreeScriptText,
  setFreeScriptText,
  getAnnounceText,
  setAnnounceText
};
