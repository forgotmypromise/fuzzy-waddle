const fs = require('fs');
const DATA_DIR = require('./data-dir');
const path = require('path');

const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

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

module.exports = { getGuildConfig, setGuildLink, setPremiumRole };
