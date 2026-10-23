'use strict';
/* Gaudhara store server — plain Node.js, no dependencies.
   Run: npm start   (or: node server/server.js) */

require('./env');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { sendMail, notifyOwner, mailConfigured } = require('./mail');
const { sendOtp, smsConfigured } = require('./sms');
const wa = require('./whatsapp');
const { lookupPincode } = require('./pincode');
const { PLANS, STATUSES, MAX_QTY, unitPrice, computeTotals } = require('../public/js/shared');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
// On a host, photos go inside DATA_DIR so they survive restarts; locally they stay in public/uploads.
const UPLOADS = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : process.env.DATA_DIR ? path.join(DATA, 'uploads') : path.join(PUBLIC, 'uploads');
// Behind a hosting proxy (Railway, Render, nginx) the visitor's IP is in X-Forwarded-For.
const TRUST_PROXY = /^(1|true|yes|on)$/i.test(String(process.env.TRUST_PROXY || '').trim());
const clientIp = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
const DB_FILE = path.join(DATA, 'db.json');
const PORT = +process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SECURE = SITE_URL.startsWith('https://') ? '; Secure' : '';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const RESET_MINUTES = 60;
const sha256 = v => crypto.createHash('sha256').update(String(v)).digest('hex');

/* ---------- Database (a JSON file) ---------- */
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

let db;
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}
function load() {
  db = fs.existsSync(DB_FILE)
    ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
    : { users: [], admins: [], orders: [], sessions: {}, products: JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-products.json'), 'utf8')) };
  const now = Date.now();
  for (const [t, s] of Object.entries(db.sessions)) if (s.exp < now) delete db.sessions[t];
  db.resets = (db.resets || []).filter(r => !r.used && r.exp > now);
  db.otps = (db.otps || []).filter(o => o.created > now - 2 * 3600e3);
  db.waVerifs = (db.waVerifs || []).filter(v => v.created > now - 2 * 3600e3);
  db.riders = db.riders || [];
  db.orders.forEach(o => o.history.forEach(h => { if (!h.by || h.by === 'undefined') h.by = 'admin'; }));
  db.products.forEach(p => { if (p.tag === 'Bestseller') p.tag = 'Best Seller'; });

  // Team login is by email (ADMIN_EMAIL in .env). Older username-based accounts keep their password.
  const email = ADMIN_EMAIL || 'admin@gaudhara.local';
  db.admins.forEach(a => { if (!a.email) { a.email = email; delete a.username; } });
  if (!db.admins.some(a => a.email === email) && db.admins.length === 1) db.admins[0].email = email;
  if (!db.admins.some(a => a.email === email)) {
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
    db.admins.push({ id: uid(), email, pass: hashPassword(password), created: new Date().toISOString() });
    fs.writeFileSync(path.join(DATA, 'admin-login.txt'), `Gaudhara team login\nURL: ${SITE_URL}/login\nEmail: ${email}\nPassword: ${password}\n\nChange this password in Admin > Settings, then delete this file.\n`);
    console.log(`\n  Team login created → email: ${email}  password: ${password}\n  (also saved to data/admin-login.txt)\n`);
  }
  save();
}

/* ---------- Security helpers ---------- */
const uid = () => crypto.randomBytes(8).toString('hex');
const rupee = n => '₹' + Math.round(n).toLocaleString('en-IN');
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pw), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const attempts = new Map(); // simple login rate limit: 10 tries per 15 minutes per IP
function rateLimit(req, key, max = 10) {
  const k = key + clientIp(req);
  const now = Date.now();
  const a = attempts.get(k) || { n: 0, reset: now + 15 * 60e3 };
  if (now > a.reset) { a.n = 0; a.reset = now + 15 * 60e3; }
  if (++a.n > max) throw fail('Too many attempts. Please wait 15 minutes and try again.', 429);
  attempts.set(k, a);
}

const COOKIE = { user: 'gd_sid', admin: 'gd_admin' };
const MAX_AGE = { user: 30 * 86400, admin: 12 * 3600 };
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function startSession(role, id) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { role, uid: id, exp: Date.now() + MAX_AGE[role] * 1000 };
  save();
  return `${COOKIE[role]}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE[role]}${SECURE}`;
}
function endSession(req, role) {
  const t = parseCookies(req)[COOKIE[role]];
  if (t && db.sessions[t]) { delete db.sessions[t]; save(); }
  return `${COOKIE[role]}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE}`;
}
function sessionOf(req, role) {
  const s = db.sessions[parseCookies(req)[COOKIE[role]]];
  if (!s || s.role !== role || s.exp < Date.now()) return null;
  return (role === 'admin' ? db.admins : db.users).find(u => u.id === s.uid) || null;
}

/* ---------- Validation ---------- */
function fail(msg, status = 400) { return Object.assign(new Error(msg), { status }); }
function text(v, label, min = 1, max = 120) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (s.length < min) throw fail(min > 1 ? `${label} must be at least ${min} characters.` : `${label} is required.`);
  if (s.length > max) throw fail(`${label} must be at most ${max} characters.`);
  return s;
}
const PHONE = /^[6-9]\d{9}$/;
const TAGS = ['', 'Best Seller', 'Premium', 'New', 'High Fat', 'Protein Rich', 'Fresh'];
const PIN = /^[1-9]\d{5}$/;
const int = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

const publicUser = u => u && { id: u.id, name: u.name, phone: u.phone, photo: u.photo || null, verified: !!u.phoneVerified, cart: u.cart || [], wish: u.wish || [], address: u.address || null };
const otpRequired = () => /^(on|1|true|yes)$/i.test(String(process.env.REQUIRE_OTP || '').trim());
const testMode = req => /^(on|1|true|yes)$/i.test(String(process.env.VERIFY_TEST_MODE || '').trim()) && isLocal(req);
const verifyStatus = req => ({ waSend: wa.waSendReady(), waReceive: wa.waReceiveReady(), sms: smsConfigured(), test: testMode(req) });
const isLocal = req => !TRUST_PROXY && /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');
const liveProducts = () => db.products.filter(p => !p.deleted);

function cleanCart(cart) {
  if (!Array.isArray(cart)) return [];
  return cart.slice(0, 50).map(i => {
    const p = liveProducts().find(x => x.id === i?.id);
    const v = int(i?.v, 0, 20), qty = int(i?.qty, 1, MAX_QTY);
    if (!p || v == null || !p.variants[v] || qty == null) return null;
    return { id: p.id, v, qty, plan: PLANS[i.plan] && (i.plan === 'once' || p.subscribable) ? i.plan : 'once' };
  }).filter(Boolean);
}

function cleanProduct(b, old = {}) {
  const cat = config.CATEGORIES.find(c => c.id === b.cat);
  if (!cat) throw fail('Please choose a valid category.');
  const variants = (Array.isArray(b.variants) ? b.variants : []).slice(0, 6).map((v, i) => {
    const size = text(v.size, `Size ${i + 1}`, 1, 20);
    const price = int(v.price, 1, 100000), mrp = int(v.mrp, 1, 100000);
    if (price == null) throw fail(`Enter a valid price for ${size}.`);
    if (mrp == null || mrp < price) throw fail(`MRP for ${size} must be equal to or more than the price.`);
    return { size, price, mrp };
  });
  if (!variants.length) throw fail('Add at least one size with a price.');
  const keepArt = old.cat === cat.id;
  return {
    ...old,
    name: text(b.name, 'Product name', 2, 80),
    cat: cat.id,
    type: ['Cow', 'Buffalo', 'Other'].includes(b.type) ? b.type : 'Cow',
    tag: TAGS.includes(b.tag) ? b.tag : '',
    desc: String(b.desc ?? '').trim().slice(0, 1000),
    highlights: (Array.isArray(b.highlights) ? b.highlights : []).map(h => String(h).trim().slice(0, 120)).filter(Boolean).slice(0, 8),
    variants,
    subscribable: !!b.subscribable,
    inStock: b.inStock !== false,
    art: keepArt && old.art || cat.art, accent: keepArt && old.accent || cat.accent, label: keepArt ? old.label ?? cat.label : cat.label,
    fill: keepArt ? old.fill ?? cat.fill : cat.fill, bg: keepArt && old.bg || cat.bg,
    rating: old.rating ?? null, reviews: old.reviews ?? 0,
  };
}

function saveImage(dataUrl, prefix) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw fail('Please upload a JPG, PNG or WebP image.');
  const buf = Buffer.from(m[2], 'base64');
  const magic = { jpeg: buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])), png: buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), webp: buf.slice(8, 12).toString() === 'WEBP' };
  if (!magic[m[1]]) throw fail('That file does not look like a valid image.');
  if (buf.length > 5 * 1024 * 1024) throw fail('Image is too large (max 5 MB).');
  const name = `${prefix}-${uid()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  return 'uploads/' + name;
}
function removeUpload(img) {
  if (img && img.startsWith('uploads/')) fs.rm(path.join(UPLOADS, path.basename(img)), { force: true }, () => {});
}

function newOrderId() {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  let id;
  do id = `GD${stamp}${crypto.randomInt(1000, 9999)}`; while (db.orders.some(o => o.id === id));
  return id;
}

/* ---------- API routes ---------- */
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, ...opts });

// Public
route('GET', '/api/health', () => ({ ok: true }));
route('GET', '/api/config', ({ req }) => ({
  STORE: config.STORE, SUB_DISCOUNT: config.SUB_DISCOUNT, COUPONS: config.COUPONS,
  CATEGORIES: config.CATEGORIES, PAYMENT_METHODS: config.PAYMENT_METHODS,
  VERIFY: { ...verifyStatus(req), required: otpRequired() },
}));
route('GET', '/api/products', () => ({ products: liveProducts() }), { auth: 'user' });
route('GET', '/api/me', ({ req }) => ({ user: publicUser(sessionOf(req, 'user')) }));

/* ---------- Phone OTP (sign-up and forgot password) ---------- */
const OTP_MINUTES = 10;
function checkPhone(v) {
  const phone = String(v || '').trim();
  if (!PHONE.test(phone)) throw fail('Kripya sahi 10-digit mobile number bharein.');
  return phone;
}
route('POST', '/api/auth/otp', async ({ req, body }) => {
  rateLimit(req, 'otp');
  const phone = checkPhone(body.phone);
  const purpose = body.purpose === 'reset' ? 'reset' : 'register';
  const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'sms';
  const live = channel === 'whatsapp' ? wa.waSendReady() : smsConfigured();
  if (!live && !testMode(req)) {
    throw fail(channel === 'whatsapp' ? 'WhatsApp OTP abhi connect nahi hua hai. Kripya store se sampark karein.' : 'SMS OTP abhi connect nahi hua hai. Kripya store se sampark karein.', 503);
  }
  const exists = db.users.some(u => u.phone === phone);
  if (purpose === 'register' && exists) throw fail('Is number se account pehle se hai. Kripya login karein.', 409);
  const now = Date.now();
  const recent = db.otps.filter(o => o.phone === phone && o.created > now - 3600e3);
  if (recent.length && now - recent[recent.length - 1].created < 30e3) throw fail('Kripya 30 second baad dobara OTP mangayein.', 429);
  if (recent.length >= 5) throw fail('Bahut zyada OTP maange gaye. Kripya 1 ghante baad try karein.', 429);
  db.otps.forEach(o => { if (o.phone === phone && o.purpose === purpose) o.used = true; });
  const otp = String(crypto.randomInt(100000, 1000000));
  let devOtp;
  // For "forgot password", an unknown number gets the same answer, so the form can't reveal who has an account.
  if (purpose === 'register' || exists) {
    if (live) {
      try {
        if (channel === 'whatsapp') await wa.sendOtpTemplate(phone, otp); else await sendOtp(phone, otp);
      } catch (e) {
        console.error(`[${channel}] OTP failed:`, e.message);
        throw fail(channel === 'whatsapp' ? 'WhatsApp par OTP nahi bhej paye. Kya yeh number WhatsApp par hai? Thodi der baad try karein ya SMS chunein.' : 'OTP SMS nahi bhej paye. Thodi der baad try karein.', 502);
      }
    } else {
      devOtp = otp;
      console.log(`  [TEST MODE] ${channel} OTP for ${phone}: ${otp}`);
    }
  }
  db.otps.push({ phone, purpose, channel, hash: sha256(otp + phone), created: now, exp: now + OTP_MINUTES * 60e3, tries: 0, used: !(purpose === 'register' || exists) });
  save();
  return { sent: true, minutes: OTP_MINUTES, ...(devOtp ? { devOtp } : {}) };
});
function useOtp(phone, purpose, code) {
  const o = [...db.otps].reverse().find(x => x.phone === phone && x.purpose === purpose && !x.used);
  if (!o || o.exp < Date.now()) throw fail('OTP expire ho gaya ya galat hai. Kripya naya OTP mangayein.');
  if (o.tries >= 5) { o.used = true; save(); throw fail('Bahut galat koshish. Kripya naya OTP mangayein.', 429); }
  const given = sha256(String(code || '').trim() + phone);
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(o.hash))) {
    o.tries++;
    save();
    throw fail(`Galat OTP. ${5 - o.tries} koshish baaki hain.`);
  }
  o.used = true;
}

/* ---------- Verify on WhatsApp: the customer messages us a code from their own WhatsApp ---------- */
const WA_MINUTES = 15;
route('POST', '/api/auth/wa/start', ({ req, body }) => {
  rateLimit(req, 'wa');
  const phone = checkPhone(body.phone);
  const purpose = body.purpose === 'reset' ? 'reset' : 'register';
  if (!wa.waReceiveReady() && !testMode(req)) throw fail('WhatsApp verification abhi connect nahi hua hai. Kripya store se sampark karein.', 503);
  if (purpose === 'register' && db.users.some(u => u.phone === phone)) throw fail('Is number se account pehle se hai. Kripya login karein.', 409);
  const now = Date.now();
  const recent = db.waVerifs.filter(v => v.phone === phone && v.created > now - 3600e3);
  if (recent.length >= 6) throw fail('Bahut zyada koshish. Kripya 1 ghante baad try karein.', 429);
  db.waVerifs.forEach(v => { if (v.phone === phone && v.purpose === purpose) v.used = true; });
  let code;
  do code = String(crypto.randomInt(100000, 1000000)); while (db.waVerifs.some(v => !v.used && v.code === code));
  const v = { id: crypto.randomBytes(16).toString('hex'), phone, purpose, code, created: now, exp: now + WA_MINUTES * 60e3, verified: false, used: false };
  db.waVerifs.push(v);
  save();
  const text = `${config.STORE.name} verify ${code}`;
  return {
    id: v.id, code, text, minutes: WA_MINUTES,
    link: wa.waReceiveReady() ? `https://wa.me/${wa.waNumber()}?text=${encodeURIComponent(text)}` : null,
    test: !wa.waReceiveReady(),
  };
});
const findWa = (id, phone) => db.waVerifs.find(v => v.id === String(id || '') && (!phone || v.phone === phone));
route('POST', '/api/auth/wa/status', ({ body }) => {
  const v = findWa(body.id);
  if (!v) throw fail('Verification not found. Kripya dobara shuru karein.', 404);
  return { verified: v.verified, expired: !v.verified && v.exp < Date.now() };
});
// Test mode only (this computer, WhatsApp not connected yet): pretend the WhatsApp message arrived.
route('POST', '/api/auth/wa/simulate', ({ req, body }) => {
  if (wa.waReceiveReady() || !testMode(req)) throw fail('Not available.', 404);
  const v = findWa(body.id);
  if (!v || v.used || v.exp < Date.now()) throw fail('Verification expired. Kripya dobara shuru karein.');
  v.verified = true;
  save();
  return { verified: true };
});
function useWa(phone, purpose, id) {
  const v = findWa(id, phone);
  if (!v || v.purpose !== purpose || v.used || !v.verified || v.exp < Date.now()) throw fail('WhatsApp verification poora nahi hua ya expire ho gaya. Kripya dobara try karein.');
  v.used = true;
}

// Meta calls this once to confirm the webhook URL...
route('GET', '/api/whatsapp/webhook', ({ query }) => {
  const token = String(process.env.WA_VERIFY_TOKEN || '').trim();
  if (query.get('hub.mode') === 'subscribe' && token && query.get('hub.verify_token') === token) return { __text: query.get('hub.challenge') || '' };
  throw fail('Forbidden', 403);
});
// ...and then sends every incoming WhatsApp message here.
route('POST', '/api/whatsapp/webhook', async ({ req, body }) => {
  if (!wa.validSignature(req.rawBody, req.headers['x-hub-signature-256'])) throw fail('Invalid signature', 401);
  for (const m of wa.incomingTexts(body)) {
    const code = (/\b(\d{6})\b/.exec(m.text) || [])[1];
    if (!code) continue;
    const v = db.waVerifs.find(x => x.code === code && x.phone === m.from && !x.used && !x.verified && x.exp > Date.now());
    const msg = v
      ? `✅ Your number is verified! Go back to the ${config.STORE.name} website to finish.`
      : `This code has expired or was started for a different number. Please start again on the ${config.STORE.name} website.`;
    if (v) { v.verified = true; v.verifiedAt = Date.now(); save(); }
    wa.reply(m.raw, msg).catch(e => console.error('[whatsapp]', e.message));
  }
  return { ok: true };
}, { limit: 1024 * 1024 });

route('POST', '/api/auth/register', ({ req, body }) => {
  rateLimit(req, 'register');
  const name = text(body.name, 'Name', 2, 60);
  const phone = checkPhone(body.phone);
  const password = String(body.password || '');
  if (password.length < 6 || password.length > 100) throw fail('Password kam se kam 6 characters ka hona chahiye.');
  if (db.users.some(u => u.phone === phone)) throw fail('Is number se account pehle se hai. Kripya login karein.', 409);
  let verified = false;
  if (otpRequired()) { if (body.waId) useWa(phone, 'register', body.waId); else useOtp(phone, 'register', body.otp); verified = true; }
  const user = { id: uid(), name, phone, phoneVerified: verified, pass: hashPassword(password), created: new Date().toISOString(), cart: [], wish: [], address: null, photo: null };
  db.users.push(user);
  return { user: publicUser(user), cookie: startSession('user', user.id) };
});
route('POST', '/api/auth/reset', ({ req, body }) => {
  rateLimit(req, 'reset');
  const phone = checkPhone(body.phone);
  const password = String(body.password || '');
  if (password.length < 6 || password.length > 100) throw fail('Naya password kam se kam 6 characters ka hona chahiye.');
  const user = db.users.find(u => u.phone === phone);
  if (!user) throw fail(body.waId ? 'Is number se koi account nahi mila. Kripya naya account banayein.' : 'OTP expire ho gaya ya galat hai. Kripya naya OTP mangayein.');
  if (body.waId) useWa(phone, 'reset', body.waId); else useOtp(phone, 'reset', body.otp);
  user.pass = hashPassword(password);
  user.phoneVerified = true;
  for (const [t, ses] of Object.entries(db.sessions)) if (ses.role === 'user' && ses.uid === user.id) delete db.sessions[t];
  return { user: publicUser(user), cookie: startSession('user', user.id) };
});
route('POST', '/api/auth/login', ({ req, body }) => {
  rateLimit(req, 'login');
  const user = db.users.find(u => u.phone === String(body.phone || '').trim());
  if (!user || !checkPassword(body.password || '', user.pass)) throw fail('Incorrect mobile number or password.', 401);
  return { user: publicUser(user), cookie: startSession('user', user.id) };
});
route('POST', '/api/auth/logout', ({ req }) => ({ ok: true, cookie: endSession(req, 'user') }));

// Customer (logged in)
route('PUT', '/api/me/profile', ({ user, body }) => {
  user.name = text(body.name, 'Name', 2, 60);
  save();
  return { user: publicUser(user) };
}, { auth: 'user' });
route('GET', '/api/pincode/:pin', async ({ req, params }) => {
  rateLimit(req, 'pincode', 150);
  if (!PIN.test(params.pin)) throw fail('Kripya sahi 6-digit pincode bharein.');
  const data = await lookupPincode(params.pin);
  if (!data) throw fail('Yeh pincode nahi mila. Kripya city khud bharein.', 404);
  return data;
}, { auth: 'user' });
route('POST', '/api/me/password', ({ req, user, body }) => {
  rateLimit(req, 'mypw');
  if (!checkPassword(body.current || '', user.pass)) throw fail('Purana (current) password galat hai.', 401);
  const next = String(body.next || '');
  if (next.length < 6 || next.length > 100) throw fail('Naya password kam se kam 6 characters ka hona chahiye.');
  user.pass = hashPassword(next);
  save();
  return { ok: true };
}, { auth: 'user' });
route('POST', '/api/me/photo', ({ user, body }) => {
  const img = saveImage(body.image, 'avatar');
  removeUpload(user.photo);
  user.photo = img;
  save();
  return { user: publicUser(user) };
}, { auth: 'user', limit: 8 * 1024 * 1024 });
route('DELETE', '/api/me/photo', ({ user }) => {
  removeUpload(user.photo);
  user.photo = null;
  save();
  return { user: publicUser(user) };
}, { auth: 'user' });
route('PUT', '/api/me/cart', ({ user, body }) => {
  user.cart = cleanCart(body.cart);
  const ids = new Set(liveProducts().map(p => p.id));
  user.wish = [...new Set((Array.isArray(body.wish) ? body.wish : []).filter(id => ids.has(id)))].slice(0, 100);
  save();
  return { cart: user.cart, wish: user.wish };
}, { auth: 'user' });

route('GET', '/api/orders', ({ user }) => ({ orders: db.orders.filter(o => o.uid === user.id).reverse() }), { auth: 'user' });

route('POST', '/api/orders', ({ user, body }) => {
  const cart = cleanCart(body.items);
  if (!cart.length) throw fail('Your cart is empty.');
  const items = cart.map(i => {
    const p = db.products.find(x => x.id === i.id), v = p.variants[i.v];
    if (!p.inStock) throw fail(`Sorry, ${p.name} is out of stock. Please remove it from your cart.`, 409);
    return { id: p.id, name: p.name, size: v.size, qty: i.qty, plan: i.plan, price: unitPrice(v, i.plan, config.SUB_DISCOUNT), mrp: v.mrp, img: p.img || null };
  });
  const a = body.address || {};
  const address = {
    name: text(a.name, 'Name', 2, 60),
    phone: String(a.phone || '').trim(),
    line1: text(a.line1, 'House / street', 3, 120),
    line2: String(a.line2 || '').trim().slice(0, 120),
    city: text(a.city, 'City', 2, 40),
    pin: String(a.pin || '').trim(),
  };
  // GPS pin from the customer's phone (optional) so the delivery person can open it in Maps.
  const lat = Number(a.lat), lng = Number(a.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng)) {
    address.lat = Math.round(lat * 1e6) / 1e6;
    address.lng = Math.round(lng * 1e6) / 1e6;
  }
  if (!PHONE.test(address.phone)) throw fail('Enter a valid 10-digit mobile number.');
  if (!PIN.test(address.pin)) throw fail('Enter a valid 6-digit pincode.');
  if (config.STORE.servicePincodes.length && !config.STORE.servicePincodes.includes(address.pin)) throw fail(`Sorry, we don't deliver to ${address.pin} yet.`);
  const pay = config.PAYMENT_METHODS.includes(body.pay) ? body.pay : config.PAYMENT_METHODS[0];
  const coupon = String(body.coupon || '').trim().toUpperCase();
  const totals = computeTotals(items, config, coupon);
  const now = new Date().toISOString();
  const order = {
    id: newOrderId(), uid: user.id, date: now, items, totals,
    coupon: totals.couponOff ? coupon : '', address, slot: text(body.slot, 'Delivery slot', 3, 60), pay,
    status: 'Pending', history: [{ status: 'Pending', at: now, by: 'customer' }], note: '',
  };
  db.orders.push(order);
  user.cart = [];
  user.address = address;
  save();
  notifyOwner(`New order ${order.id} — ${rupee(totals.total)} from ${address.name}`, [
    'A new order is waiting for verification.',
    '',
    ...items.map(i => `• ${i.name} (${i.size}) × ${i.qty} = ${rupee(i.price * i.qty)}${i.plan !== 'once' ? ` [${PLANS[i.plan]} subscription]` : ''}`),
    '',
    `Total to collect: ${rupee(totals.total)} (${pay})`,
    `Delivery slot: ${order.slot}`,
    '',
    `Customer: ${address.name}, ${address.phone}`,
    `Address: ${[address.line1, address.line2, address.city, address.pin].filter(Boolean).join(', ')}`,
    '',
    `Verify it here: ${SITE_URL}/login#orders`,
  ].join('\n'));
  return { order };
}, { auth: 'user' });

route('POST', '/api/orders/:id/cancel', ({ user, params }) => {
  const o = db.orders.find(x => x.id === params.id && x.uid === user.id);
  if (!o) throw fail('Order not found.', 404);
  if (!['Pending', 'Confirmed'].includes(o.status)) throw fail(`This order is already ${o.status.toLowerCase()} and can no longer be cancelled.`);
  o.status = 'Cancelled';
  o.history.push({ status: 'Cancelled', at: new Date().toISOString(), by: 'customer' });
  save();
  return { order: o };
}, { auth: 'user' });

// Admin
const adminInfo = a => ({ email: a.email, mail: mailConfigured(), notifyTo: process.env.NOTIFY_EMAIL || a.email, verify: { waSend: wa.waSendReady(), waReceive: wa.waReceiveReady(), sms: smsConfigured(), required: otpRequired() } });
const normEmail = v => String(v || '').trim().toLowerCase().slice(0, 160);

route('POST', '/api/admin/login', ({ req, body }) => {
  rateLimit(req, 'admin');
  const admin = db.admins.find(a => a.email === normEmail(body.email));
  if (!admin || !checkPassword(body.password || '', admin.pass)) throw fail('That email and password don’t match. Please try again.', 401);
  return { admin: adminInfo(admin), cookie: startSession('admin', admin.id) };
});
route('POST', '/api/admin/logout', ({ req }) => ({ ok: true, cookie: endSession(req, 'admin') }));
route('GET', '/api/admin/me', ({ admin }) => ({ admin: adminInfo(admin) }), { auth: 'admin' });

route('POST', '/api/admin/forgot', async ({ req, body }) => {
  rateLimit(req, 'forgot');
  const email = normEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Please enter a valid email address.');
  if (!mailConfigured()) throw fail('Password reset by email isn’t set up yet. Add the Gmail App Password (SMTP_PASS) in the .env file and restart the server.', 503);
  // Same answer whether or not the email is a team account, so the form can't be used to find accounts.
  if (db.admins.some(a => a.email === email)) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.resets.push({ email, hash: sha256(token), exp: Date.now() + RESET_MINUTES * 60e3, used: false });
    save();
    try {
      await sendMail(email, 'Reset your Gaudhara admin password',
        `Someone (hopefully you) asked to reset the Gaudhara admin password for ${email}.\n\n`
        + `Open this link to choose a new password. It works once and expires in ${RESET_MINUTES} minutes:\n\n${SITE_URL}/login#reset=${token}\n\n`
        + 'If you didn’t ask for this, ignore this email. Your password stays the same.');
    } catch (e) {
      console.error('[mail] reset email failed:', e.message);
      throw fail('We couldn’t send the email just now. Please check the email settings and try again.', 502);
    }
  }
  return { sent: true };
});
const findReset = token => typeof token === 'string' && token.length >= 20 && token.length <= 100
  && db.resets.find(r => r.hash === sha256(token) && !r.used && r.exp > Date.now() && db.admins.some(a => a.email === r.email));
route('POST', '/api/admin/reset/check', ({ body }) => {
  const r = findReset(body.token);
  if (!r) throw fail('This link has expired or was already used.', 400);
  return { email: r.email };
});
route('POST', '/api/admin/reset', ({ req, body }) => {
  rateLimit(req, 'forgot');
  const r = findReset(body.token);
  if (!r) throw fail('This link has expired or was already used.', 400);
  const pass = String(body.password || '');
  if (pass.length < 8) throw fail('Use at least 8 characters.');
  if (pass.length > 200) throw fail('That password is too long.');
  const admin = db.admins.find(a => a.email === r.email);
  admin.pass = hashPassword(pass);
  db.resets.forEach(x => { if (x.email === r.email) x.used = true; });
  for (const [t, ses] of Object.entries(db.sessions)) if (ses.role === 'admin' && ses.uid === admin.id) delete db.sessions[t];
  save();
  return { ok: true };
});
route('POST', '/api/admin/test-email', async ({ admin }) => {
  const to = process.env.NOTIFY_EMAIL || admin.email;
  try {
    await sendMail(to, 'Gaudhara: test email', `Email is working. New-order alerts and password reset links will be sent to ${to}.\n\n${SITE_URL}/login`);
  } catch (e) { throw fail('Email failed: ' + e.message, 502); }
  return { to };
}, { auth: 'admin' });
route('POST', '/api/admin/password', ({ admin, body }) => {
  if (!checkPassword(body.current || '', admin.pass)) throw fail('Current password is incorrect.', 401);
  const next = String(body.next || '');
  if (next.length < 8) throw fail('New password must be at least 8 characters.');
  admin.pass = hashPassword(next);
  save();
  return { ok: true };
}, { auth: 'admin' });

route('GET', '/api/admin/orders', () => ({ orders: [...db.orders].reverse() }), { auth: 'admin' });
route('PATCH', '/api/admin/orders/:id', ({ admin, params, body }) => {
  const o = db.orders.find(x => x.id === params.id);
  if (!o) throw fail('Order not found.', 404);
  if (!STATUSES.includes(body.status)) throw fail('Invalid status.');
  o.status = body.status;
  if (body.note != null) o.note = String(body.note).trim().slice(0, 300);
  o.history.push({ status: o.status, at: new Date().toISOString(), by: admin.email, note: body.note ? o.note : undefined });
  save();
  return { order: o };
}, { auth: 'admin' });

route('POST', '/api/admin/customers/:id/password', ({ params, body }) => {
  const u = db.users.find(x => x.id === params.id);
  if (!u) throw fail('Customer not found.', 404);
  const pass = String(body.password || '');
  if (pass.length < 6 || pass.length > 100) throw fail('Password must be at least 6 characters.');
  u.pass = hashPassword(pass);
  for (const [t, ses] of Object.entries(db.sessions)) if (ses.role === 'user' && ses.uid === u.id) delete db.sessions[t];
  save();
  return { ok: true };
}, { auth: 'admin' });
route('DELETE', '/api/admin/customers/:id', ({ params }) => {
  const u = db.users.find(x => x.id === params.id);
  if (!u) throw fail('Customer not found.', 404);
  removeUpload(u.photo);
  db.users = db.users.filter(x => x !== u);
  for (const [t, ses] of Object.entries(db.sessions)) if (ses.role === 'user' && ses.uid === u.id) delete db.sessions[t];
  save();
  return { ok: true };
}, { auth: 'admin' });
// Finished orders (delivered, cancelled or rejected) can be removed; active ones cannot.
route('DELETE', '/api/admin/orders/:id', ({ params }) => {
  const o = db.orders.find(x => x.id === params.id);
  if (!o) throw fail('Order not found.', 404);
  if (!['Delivered', 'Cancelled', 'Rejected'].includes(o.status)) throw fail('Only delivered, cancelled or rejected orders can be deleted.');
  db.orders = db.orders.filter(x => x !== o);
  save();
  return { ok: true };
}, { auth: 'admin' });
route('GET', '/api/admin/riders', () => ({ riders: db.riders }), { auth: 'admin' });
route('POST', '/api/admin/riders', ({ body }) => {
  const name = text(body.name, 'Name', 2, 40);
  const phone = String(body.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!PHONE.test(phone)) throw fail('Enter a valid 10-digit mobile number.');
  if (db.riders.some(r => r.phone === phone)) throw fail('This delivery boy is already added.');
  if (db.riders.length >= 30) throw fail('You can save up to 30 delivery boys.');
  const rider = { id: uid(), name, phone };
  db.riders.push(rider);
  save();
  return { rider, riders: db.riders };
}, { auth: 'admin' });
route('DELETE', '/api/admin/riders/:id', ({ params }) => {
  db.riders = db.riders.filter(r => r.id !== params.id);
  save();
  return { riders: db.riders };
}, { auth: 'admin' });
route('POST', '/api/admin/orders/:id/rider', ({ admin, params, body }) => {
  const o = db.orders.find(x => x.id === params.id);
  if (!o) throw fail('Order not found.', 404);
  const r = db.riders.find(x => x.id === body.riderId);
  if (!r) throw fail('Delivery boy not found. Add him in Settings first.', 404);
  o.rider = { id: r.id, name: r.name, phone: r.phone, at: new Date().toISOString() };
  o.history.push({ status: o.status, at: o.rider.at, by: admin.email, note: `Sent to delivery boy ${r.name} (${r.phone})` });
  save();
  return { order: o };
}, { auth: 'admin' });
route('GET', '/api/admin/customers', () => ({
  customers: db.users.map(u => {
    const mine = db.orders.filter(o => o.uid === u.id);
    return {
      id: u.id, name: u.name, phone: u.phone, photo: u.photo || null, verified: !!u.phoneVerified, created: u.created, orders: mine.length,
      spent: mine.filter(o => !['Cancelled', 'Rejected'].includes(o.status)).reduce((s, o) => s + o.totals.total, 0),
      city: u.address?.city || '',
    };
  }).reverse(),
}), { auth: 'admin' });

route('GET', '/api/admin/products', () => ({ products: liveProducts() }), { auth: 'admin' });
route('POST', '/api/admin/products', ({ body }) => {
  const p = cleanProduct(body);
  const base = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
  p.id = db.products.some(x => x.id === base) ? `${base}-${uid().slice(0, 4)}` : base;
  db.products.push(p);
  save();
  return { product: p };
}, { auth: 'admin' });
route('PUT', '/api/admin/products/:id', ({ params, body }) => {
  const i = db.products.findIndex(x => x.id === params.id && !x.deleted);
  if (i < 0) throw fail('Product not found.', 404);
  db.products[i] = { ...cleanProduct(body, db.products[i]), id: params.id };
  save();
  return { product: db.products[i] };
}, { auth: 'admin' });
route('PATCH', '/api/admin/products/:id/stock', ({ params, body }) => {
  const p = liveProducts().find(x => x.id === params.id);
  if (!p) throw fail('Product not found.', 404);
  p.inStock = !!body.inStock;
  save();
  return { product: p };
}, { auth: 'admin' });
route('POST', '/api/admin/products/:id/image', ({ params, body }) => {
  const p = liveProducts().find(x => x.id === params.id);
  if (!p) throw fail('Product not found.', 404);
  const img = saveImage(body.image, p.id);
  removeUpload(p.img);
  p.img = img;
  save();
  return { product: p };
}, { auth: 'admin', limit: 8 * 1024 * 1024 });
route('DELETE', '/api/admin/products/:id/image', ({ params }) => {
  const p = liveProducts().find(x => x.id === params.id);
  if (!p) throw fail('Product not found.', 404);
  removeUpload(p.img);
  p.img = null;
  save();
  return { product: p };
}, { auth: 'admin' });
route('DELETE', '/api/admin/products/:id', ({ params }) => {
  const p = liveProducts().find(x => x.id === params.id);
  if (!p) throw fail('Product not found.', 404);
  p.deleted = true; // kept so old orders still show it
  db.users.forEach(u => { u.cart = (u.cart || []).filter(i => i.id !== p.id); u.wish = (u.wish || []).filter(id => id !== p.id); });
  save();
  return { ok: true };
}, { auth: 'admin' });

/* ---------- HTTP plumbing ---------- */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(fail('Request is too large.', 413)); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      req.rawBody = Buffer.concat(chunks);
      try { resolve(JSON.parse(req.rawBody.toString('utf8'))); } catch { reject(fail('Invalid request.')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data, cookie) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  // The team dashboard opens only at /login; it is not linked from the store.
  if (pathname === '/admin.html') pathname = '/__none__';
  if (pathname === '/login' || pathname === '/login/') pathname = '/admin.html';
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  const fromUploads = decoded.startsWith('/uploads/');
  const base = fromUploads ? UPLOADS : PUBLIC;
  const file = path.normalize(path.join(base, fromUploads ? decoded.slice('/uploads'.length) : decoded));
  if (!file.startsWith(base + path.sep) || path.basename(file).startsWith('.') || file.endsWith('.md')) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const isMedia = /^image\//.test(MIME[ext] || '');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isMedia ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}

// Last line of defence: log unexpected errors instead of letting one bad request stop the store.
process.on('unhandledRejection', e => console.error('[unhandled]', e));

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, pathname);
  }
  try {
    const r = routes.find(x => x.method === req.method && x.re.test(pathname));
    if (!r) throw fail('Not found.', 404);
    // Form posts from other websites can't send JSON, which blocks cross-site request forgery.
    // DELETE can't come from a form at all, so it may arrive without a body.
    if (req.method !== 'GET' && req.method !== 'DELETE' && !/^application\/json/.test(req.headers['content-type'] || '')) throw fail('Requests must be JSON.', 415);
    const ctx = { req, query: searchParams, params: r.re.exec(pathname).groups || {}, body: req.method === 'GET' ? {} : await readBody(req, r.limit || 100 * 1024) };
    if (r.auth === 'user' && !(ctx.user = sessionOf(req, 'user'))) throw fail('Please log in to continue.', 401);
    if (r.auth === 'admin' && !(ctx.admin = sessionOf(req, 'admin'))) throw fail('Admin login required.', 401);
    const { cookie, ...data } = await r.handler(ctx);
    if (data.__text !== undefined) { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(String(data.__text)); }
    sendJson(res, 200, data, cookie);
  } catch (e) {
    if (!e.status) console.error(e);
    sendJson(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong on the server.' });
  }
});

load();
server.listen(PORT, () => {
  const nets = Object.values(require('os').networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal);
  console.log(`  Gaudhara store running:\n    Store:  http://localhost:${PORT}\n    Admin:  http://localhost:${PORT}/login`);
  nets.forEach(n => console.log(`    On your Wi-Fi: http://${n.address}:${PORT}`));
});
