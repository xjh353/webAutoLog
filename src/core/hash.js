const crypto = require('node:crypto');

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

module.exports = { shortHash };
