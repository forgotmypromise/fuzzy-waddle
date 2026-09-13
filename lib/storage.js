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

// ========== WHITELIST ==========
function loadWhitelist() {
  if (!fs.existsSync(WHITELIST_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveWhitelist(ids) {
  fs.writeFileSync(WHITELIST_PATH, JSON.stringify(ids, null, 2));
}

function addToWhitelist(userId) {
  const list = loadWhitelist();
  if (list.includes(userId)) return false;
  list.push(userId);
  saveWhitelist(list);
  return true;
}

function removeFromWhitelist(userId) {
  const list = loadWhitelist();
  const index = list.indexOf(userId);
  if (index === -1) return false;
  list.splice(index, 1);
  saveWhitelist(list);
  return true;
}

function isWhitelisted(userId) {
  return loadWhitelist().includes(userId);
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
// Applications are stored GLOBALLY so /toggleapps and /apply
// work the same in DMs and in any server.
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

module.exports = {
  getGuildConfig,
  setGuildLink,
  setPremiumRole,
  setResetLimit,
  loadWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  isWhitelisted,
  setSupportStatus,
  clearSupportStatus,
  getSupportStatus,
  getAppStatus,
  setAppStatus,
  isAppOpen
};
