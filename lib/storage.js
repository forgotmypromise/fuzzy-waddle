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
const DEFAULT_APPS = {
  media: true,
  staff: false,
  helper: false
};

function normalizeGuildId(guildId) {
  if (guildId === null || guildId === undefined || guildId === '') {
    return null;
  }
  return String(guildId);
}

function getAppStatus(guildId) {
  const id = normalizeGuildId(guildId);
  if (!id) {
    // No guild context — fall back to global apps key
    const all = loadAll();
    return (all.__global && all.__global.applications)
      ? { ...DEFAULT_APPS, ...all.__global.applications }
      : { ...DEFAULT_APPS };
  }

  const config = getGuildConfig(id);
  if (config.applications && typeof config.applications === 'object') {
    return {
      media: !!config.applications.media,
      staff: !!config.applications.staff,
      helper: !!config.applications.helper
    };
  }
  return { ...DEFAULT_APPS };
}

function setAppStatus(guildId, type, isOpen) {
  const id = normalizeGuildId(guildId) || '__global';
  const all = loadAll();
  if (!all[id]) all[id] = {};
  if (!all[id].applications || typeof all[id].applications !== 'object') {
    all[id].applications = { ...DEFAULT_APPS };
  }

  // Ensure boolean
  const open = isOpen === true || isOpen === 'open' || isOpen === 'true';

  if (type === 'all') {
    all[id].applications.media = open;
    all[id].applications.staff = open;
    all[id].applications.helper = open;
  } else if (['media', 'staff', 'helper'].includes(type)) {
    all[id].applications[type] = open;
  }

  saveAll(all);

  // Always return a clean normalized object
  return {
    media: !!all[id].applications.media,
    staff: !!all[id].applications.staff,
    helper: !!all[id].applications.helper
  };
}

function isAppOpen(guildId, type) {
  if (!['media', 'staff', 'helper'].includes(type)) return false;
  const status = getAppStatus(guildId);
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
