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
  getSupportStatus
};
