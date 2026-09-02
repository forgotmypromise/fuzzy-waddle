const fs = require('fs');
const path = require('path');

// On Railway (or any host with an ephemeral filesystem), set DATA_DIR to a
// mounted persistent Volume path (e.g. /data) so config.json, resets.json,
// and keys.txt survive redeploys and restarts. Locally, this defaults to
// the project root, same as before.
const DATA_DIR = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : path.join(__dirname, '..');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

module.exports = DATA_DIR;
