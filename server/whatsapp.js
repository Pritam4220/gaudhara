'use strict';
/* WhatsApp number verification through the official WhatsApp Business Platform (Cloud API).

   Way 1 — we SEND the OTP to the customer's WhatsApp (an approved "authentication" template).
           Needs: WA_PHONE_ID, WA_TOKEN, WA_OTP_TEMPLATE (+ WA_TEMPLATE_LANG, default "en").
           Works even while the store runs only on this computer. Meta charges per OTP.
   Way 2 — the customer SENDS us a code from their WhatsApp; Meta's webhook tells us who sent it.
           Needs: WA_NUMBER, WA_PHONE_ID, WA_TOKEN, WA_APP_SECRET, WA_VERIFY_TOKEN, and the store online (https).
           Incoming messages are free. Used only when Way 1 is not set up. */

const crypto = require('crypto');

const env = k => String(process.env[k] || '').trim();
const has = keys => keys.every(k => env(k));
const waSendReady = () => has(['WA_PHONE_ID', 'WA_TOKEN', 'WA_OTP_TEMPLATE']);
const waReceiveReady = () => has(['WA_NUMBER', 'WA_PHONE_ID', 'WA_TOKEN', 'WA_APP_SECRET', 'WA_VERIFY_TOKEN']);
const waNumber = () => env('WA_NUMBER').replace(/\D/g, '');
const graph = path => `https://graph.facebook.com/${env('WA_API_VERSION') || 'v21.0'}/${encodeURIComponent(env('WA_PHONE_ID'))}/${path}`;

async function post(payload) {
  const res = await fetch(graph('messages'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WA_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp error ${res.status}: ${body.error?.message || 'unknown'}`);
  return body;
}

// Way 1: OTP sent with an authentication template that has a "Copy code" button.
function sendOtpTemplate(phone10, otp) {
  return post({
    to: '91' + phone10,
    type: 'template',
    template: {
      name: env('WA_OTP_TEMPLATE'),
      language: { code: env('WA_TEMPLATE_LANG') || 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: otp }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
      ],
    },
  });
}

// Way 2: check that a webhook really comes from Meta (signed with the app secret).
function validSignature(raw, header) {
  const secret = env('WA_APP_SECRET');
  if (!secret || !raw || !/^sha256=[0-9a-f]{64}$/.test(String(header || ''))) return false;
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'));
  const given = Buffer.from(String(header));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// Text messages people sent to the business number, as [{ from: '9876543210', raw: '919876543210', text }]
function incomingTexts(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      for (const m of change.value?.messages || []) {
        const digits = String(m.from || '').replace(/\D/g, '');
        const from = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
        const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || '';
        if (from && text) out.push({ from, raw: digits, text });
      }
    }
  }
  return out;
}

// Free-form reply inside the chat the customer just opened.
function reply(toDigits, text) {
  if (!has(['WA_PHONE_ID', 'WA_TOKEN'])) return Promise.resolve();
  return post({ to: toDigits, type: 'text', text: { body: text } });
}

module.exports = { waSendReady, waReceiveReady, waNumber, sendOtpTemplate, validSignature, incomingTexts, reply };
