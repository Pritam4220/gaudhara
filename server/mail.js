'use strict';
/* Minimal SMTP sender (e.g. Gmail with an App Password) — no packages needed.
   Settings come from .env: SMTP_HOST, SMTP_PORT (465 = TLS, 587 = STARTTLS), SMTP_USER, SMTP_PASS. */

const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

function settings() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  // Gmail shows App Passwords in groups of four; the spaces are not part of it.
  return { host: SMTP_HOST, port: Number(SMTP_PORT) || 465, user: SMTP_USER.trim(), pass: SMTP_PASS.replace(/\s+/g, '') };
}
const mailConfigured = () => Boolean(settings());

// Header values may come from customers, so never let them add header lines.
const oneLine = v => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200);
const b64 = v => Buffer.from(String(v), 'utf8').toString('base64');
const encodeHeader = v => /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`;

function client(sock) {
  let buf = '';
  let waiting = null;
  const replies = [];
  const flush = () => { if (waiting && replies.length) { const w = waiting; waiting = null; w.resolve(replies.shift()); } };
  const onData = d => {
    buf += d.toString('utf8');
    let m;
    while ((m = /^(?:\d{3}-[^\r\n]*\r\n)*\d{3}(?: [^\r\n]*)?\r\n/.exec(buf))) { replies.push(m[0]); buf = buf.slice(m[0].length); }
    flush();
  };
  const onError = e => { if (waiting) { waiting.reject(e); waiting = null; } };
  sock.on('data', onData);
  sock.on('error', onError);
  return {
    async cmd(line, ok) {
      if (line != null) sock.write(line + '\r\n');
      const reply = await new Promise((resolve, reject) => { waiting = { resolve, reject }; flush(); });
      if (!ok.includes(+reply.slice(0, 3))) throw new Error('SMTP: ' + reply.trim().split('\r\n').pop());
      return reply;
    },
    detach() { sock.removeListener('data', onData); sock.removeListener('error', onError); },
  };
}

function open(host, port) {
  return new Promise((resolve, reject) => {
    const sock = port === 465 ? tls.connect({ host, port, servername: host }, () => resolve(sock)) : net.connect({ host, port }, () => resolve(sock));
    sock.once('error', reject);
    sock.setTimeout(20000, () => sock.destroy(new Error('SMTP connection timed out')));
  });
}

async function sendMail(to, subject, text) {
  const s = settings();
  if (!s) throw new Error('Email is not set up (SMTP settings missing in .env)');
  let sock = await open(s.host, s.port);
  let c = client(sock);
  try {
    await c.cmd(null, [220]);
    await c.cmd('EHLO gaudhara', [250]);
    if (s.port !== 465) {
      await c.cmd('STARTTLS', [220]);
      c.detach();
      sock = await new Promise((resolve, reject) => { const t = tls.connect({ socket: sock, servername: s.host }, () => resolve(t)); t.once('error', reject); });
      c = client(sock);
      await c.cmd('EHLO gaudhara', [250]);
    }
    await c.cmd('AUTH LOGIN', [334]);
    await c.cmd(b64(s.user), [334]);
    await c.cmd(b64(s.pass), [235]);
    await c.cmd(`MAIL FROM:<${s.user}>`, [250]);
    await c.cmd(`RCPT TO:<${oneLine(to)}>`, [250, 251]);
    await c.cmd('DATA', [354]);
    const body = b64(text).replace(/.{76}/g, '$&\r\n');
    const message = [
      `From: ${encodeHeader(process.env.MAIL_FROM_NAME || 'Gaudhara')} <${s.user}>`,
      `To: <${oneLine(to)}>`,
      `Subject: ${encodeHeader(oneLine(subject))}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomBytes(12).toString('hex')}@gaudhara>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      body,
    ].join('\r\n');
    await c.cmd(message + '\r\n.', [250]);
    await c.cmd('QUIT', [221]).catch(() => {});
  } finally {
    sock.end();
  }
}

// Fire-and-forget alert to the shop owner; never blocks or fails the customer's request.
function notifyOwner(subject, text) {
  const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
  if (!mailConfigured() || !to) return;
  sendMail(to, subject, text).catch(err => console.error('[mail] alert failed:', err.message));
}

module.exports = { sendMail, notifyOwner, mailConfigured };
