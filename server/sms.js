'use strict';
/* Sends OTP text messages through an Indian SMS provider.
   Set in .env: SMS_PROVIDER = fast2sms | 2factor | msg91, SMS_API_KEY, and (MSG91 / optional 2Factor) SMS_TEMPLATE.
   Without a provider, OTPs are only shown for testing on this computer. */

const provider = () => String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
const smsConfigured = () => ['fast2sms', '2factor', 'msg91'].includes(provider()) && Boolean(process.env.SMS_API_KEY);

async function sendOtp(phone, otp) {
  const key = String(process.env.SMS_API_KEY || '').trim();
  const tpl = String(process.env.SMS_TEMPLATE || '').trim();
  const p = provider();
  let res, body;
  if (p === 'fast2sms') {
    res = await fetch(`https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(key)}&route=otp&variables_values=${otp}&flash=0&numbers=${phone}`);
    body = await res.json().catch(() => ({}));
    if (!res.ok || body.return === false) throw new Error([].concat(body.message || `Fast2SMS error ${res.status}`).join(' '));
  } else if (p === '2factor') {
    res = await fetch(`https://2factor.in/API/V1/${encodeURIComponent(key)}/SMS/+91${phone}/${otp}${tpl ? '/' + encodeURIComponent(tpl) : ''}`);
    body = await res.json().catch(() => ({}));
    if (!res.ok || body.Status !== 'Success') throw new Error(body.Details || `2Factor error ${res.status}`);
  } else if (p === 'msg91') {
    if (!tpl) throw new Error('MSG91 needs SMS_TEMPLATE (your OTP template ID)');
    res = await fetch(`https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(tpl)}&mobile=91${phone}&otp=${otp}`, {
      method: 'POST', headers: { authkey: key, 'Content-Type': 'application/json' }, body: '{}',
    });
    body = await res.json().catch(() => ({}));
    if (!res.ok || body.type === 'error') throw new Error(body.message || `MSG91 error ${res.status}`);
  } else {
    throw new Error('SMS is not set up');
  }
}

module.exports = { sendOtp, smsConfigured, provider };
