'use strict';
/* Emergency admin password reset — works without email.
   1. Stop the store server (close its window or press Ctrl+C).
   2. Run:  npm run reset-admin -- YourNewPassword
   3. Start the store again with npm start and sign in at /login. */
require('./env');
const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
const PORT = +process.env.PORT || 3000;
const password = process.argv[2] || '';
const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

if (password.length < 8) {
  console.error('\n  Usage: npm run reset-admin -- YourNewPassword   (at least 8 characters)\n');
  process.exit(1);
}
if (!fs.existsSync(DB_FILE)) {
  console.error('\n  No database yet. Start the store once with npm start first.\n');
  process.exit(1);
}

// The running server keeps its own copy of the data and would overwrite this change.
const probe = net.connect(PORT, '127.0.0.1');
probe.on('connect', () => {
  probe.destroy();
  console.error(`\n  The store server is still running on port ${PORT}. Stop it first, then run this again.\n`);
  process.exit(1);
});
probe.on('error', () => {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const admin = db.admins.find(a => a.email === email) || db.admins[0];
  if (!admin) { console.error('\n  No admin account found.\n'); process.exit(1); }
  const salt = crypto.randomBytes(16).toString('hex');
  admin.pass = salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
  for (const [t, s] of Object.entries(db.sessions || {})) if (s.role === 'admin') delete db.sessions[t];
  db.resets = [];
  fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db, null, 1));
  fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  console.log(`\n  Admin password changed for ${admin.email}.\n  Start the store with npm start and sign in at http://localhost:${PORT}/login\n`);
});
