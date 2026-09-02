const crypto = require('crypto');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generatePoloKey() {
  // 8 uppercase hex chars, e.g. POLO-3F9A2C7B
  const hash = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
  return `POLO-${hash}`;
}

function generateRandom9Key() {
  // 9 random uppercase letters, e.g. QWXNPKZTL
  let out = '';
  for (let i = 0; i < 9; i++) {
    out += LETTERS[crypto.randomInt(0, LETTERS.length)];
  }
  return out;
}

function generateKey(format) {
  return format === 'random9' ? generateRandom9Key() : generatePoloKey();
}

module.exports = { generateKey };
