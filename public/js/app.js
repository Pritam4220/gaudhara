(() => {
  'use strict';

  /* ---------- Helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $('#app');
  const rupee = n => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { MAX_QTY } = Shared;

  let STORE, COUPONS, CATEGORIES, PAYMENT_METHODS, SUB_DISCOUNT, VERIFY = {}, PRODUCTS = [];
  let user = null, cart = [], wish = [], coupon = '';
  let pendingAction = null, afterRender = null, loginReason = '', loginMode = 'register';
  let chip = 'all', pollTimer = null, locating = false;
  const selV = {}; // product id → chosen size index
  const draft = { line1: '', line2: '', city: '', state: '', pin: '', lat: null, lng: null, source: null, slot: 0, pay: 0 };

  const byId = id => PRODUCTS.find(p => p.id === id);
  const unitPrice = (v, plan) => Shared.unitPrice(v, plan, SUB_DISCOUNT);
  const media = (p, cls, extra = '') => `<div class="${cls} ${p.img ? 'has-photo' : ''}" style="${p.img ? '' : `background:${p.bg || '#f9fafb'}`}">${art(p)}${extra}</div>`;
  const first = name => String(name || '').trim().split(/\s+/)[0];

  const local = {
    get(k, d) { try { const v = localStorage.getItem('gd_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('gd_' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem('gd_' + k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem('gd_' + k, v); } catch { /* storage unavailable */ } },
  };

  async function api(path, { method, body } = {}) {
    const res = await fetch('/api' + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && user && !path.startsWith('/auth/')) setUser(null);
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status });
    return data;
  }

  // Icons from Lucide (ISC licence), the same set the GauDhara app design uses.
  const I = {
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    locate: '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
    mapPin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    phone: '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.84 0 8.27 3.06 9.94 6.65a1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"/><path d="m2 2 20 20"/>',
  };
  const icon = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg, ok = false) {
    const t = $('#toast');
    t.hidden = false;
    t.className = 'toast' + (ok ? ' ok' : '');
    t.innerHTML = `${icon(ok ? 'circleCheck' : 'alert')}<p>${esc(msg)}</p>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  /* ---------- Account & cart ---------- */
  function setUser(u) {
    user = u;
    cart = u ? u.cart.filter(i => byId(i.id)?.variants[i.v]) : [];
    wish = u ? u.wish : [];
    coupon = u ? local.get('coupon_' + u.id, '') : '';
    if (u) loadLoc(u);
  }

  let syncTimer;
  function syncCart() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => api('/me/cart', { method: 'PUT', body: { cart, wish } })
      .catch(e => toast(e.status === 401 ? 'Session khatam ho gaya. Kripya dobara login karein.' : 'Cart save nahi ho paya. Internet check karein.')), 250);
  }
  const setCoupon = c => { coupon = c; if (user) local.set('coupon_' + user.id, c); };

  const qtyOf = (id, v) => cart.find(i => i.id === id && i.v === v && i.plan === 'once')?.qty || 0;
  const cartCount = () => cart.reduce((n, i) => n + i.qty, 0);
  const totals = () => Shared.computeTotals(cart.map(i => { const v = byId(i.id).variants[i.v]; return { price: unitPrice(v, i.plan), mrp: v.mrp, qty: i.qty }; }), { STORE, COUPONS }, coupon);

  function change(id, v, delta) {
    const p = byId(id);
    if (delta > 0 && !p.inStock) return toast(`${p.name} abhi stock me nahi hai.`);
    let line = cart.find(i => i.id === id && i.v === v && i.plan === 'once');
    if (!line && delta > 0) cart.push(line = { id, v, qty: 0, plan: 'once' });
    if (!line) return;
    line.qty = Math.min(MAX_QTY, line.qty + delta);
    if (line.qty <= 0) cart = cart.filter(i => i !== line);
    syncCart();
    refreshCard(id);
    refreshCartBar();
    if (route().name === 'cart') { if (!cart.length) render(); else refreshCheckout(); }
  }

  // Browsing is open to everyone; adding to the cart and ordering need an account.
  function requireLogin(reason, action) {
    if (user) return action();
    pendingAction = action;
    loginReason = reason;
    loginMode = 'register';
    location.hash = '#/signin';
  }

  /* ---------- Splash ---------- */
  const splash = () => `<div class="splash"><div class="splash-in"><div class="logo-circle">GF</div><h1>${esc(STORE?.name || 'GauDhara')}</h1><p>${esc(STORE?.tagline || 'Pure Dairy, Delivered Fresh')}</p></div></div>`;

  /* ---------- Welcome: sign up / forgot password (verified on WhatsApp or by SMS OTP), log in ---------- */
  const lf = { name: '', phone: '', password: '', photo: null, otp: '', step: 'form', devOtp: null, resendAt: 0, wa: null, channel: 'sms' };
  let resendTimer = null, waPoll = null;
  const fmtPhone = p => `+91 ${p.slice(0, 5)} ${p.slice(5)}`;
  const avatar = (u, cls = '') => `<span class="avatar in ${cls}">${u.photo ? `<img src="${esc(u.photo)}" alt="">` : esc(first(u.name).charAt(0).toUpperCase())}</span>`;
  const WA_ICON = '<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>';
  // Which ways of proving a number are switched on (set by the store owner in .env).
  const canWaSend = () => !!(VERIFY.waSend || VERIFY.test);            // we send the OTP to WhatsApp
  const canWaRecv = () => !!VERIFY.waReceive && !canWaSend();          // customer sends us a code on WhatsApp
  const canWa = () => canWaSend() || canWaRecv();
  const canSms = () => !!(VERIFY.sms || VERIFY.test);
  const canVerify = () => canWa() || canSms();

  // Shrinks a chosen photo in the browser so uploads stay small on mobile data.
  function readImage(file, max = 640) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('Kripya ek photo (JPG ya PNG) chunein.'));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const sw = Math.min(img.width, img.height);
        const side = Math.round(Math.min(sw, max));
        const c = document.createElement('canvas');
        c.width = c.height = side;
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, side, side);
        g.drawImage(img, (img.width - sw) / 2, (img.height - sw) / 2, sw, sw, 0, 0, side, side);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Yeh photo khul nahi payi. Koi doosri photo chunein.')); };
      img.src = url;
    });
  }

  function stopLoginTimers() { clearInterval(resendTimer); clearInterval(waPoll); }

  function setLoginMode(m) {
    loginMode = m;
    Object.assign(lf, { step: 'form', otp: '', devOtp: null, password: '', wa: null });
    viewLogin();
  }

  function viewLogin() {
    stopLoginTimers();
    const m = loginMode, step = lf.step;
    const otpOn = !!VERIFY.required;
    const head = {
      register: ['Welcome!', 'Create your account to order fresh dairy'],
      login: ['Welcome back!', 'Log in with your mobile number'],
      forgot: ['Forgot password?', otpOn ? 'Choose a new password, then verify your number' : "Don't worry, we'll help you"],
    }[m];
    const title = step === 'wa' ? 'Verify on WhatsApp' : step === 'otp' ? 'Enter OTP' : head[0];
    const sub = step === 'wa' ? 'One tap to prove this number is yours' : step === 'otp' ? (lf.channel === 'whatsapp' ? 'Enter the code we sent to your WhatsApp' : 'Enter the code we sent you by SMS') : head[1];
    const pwField = (label, ph, ac) => `<div><label class="lbl" for="f-pass">${label} <i>*</i></label><div class="pw"><input class="inp" id="f-pass" name="password" type="password" maxlength="100" autocomplete="${ac}" placeholder="${ph}" value="${esc(lf.password)}"><button type="button" data-eye aria-label="Show password">${icon('eye')}</button></div></div>`;
    const numberBar = `<div class="otp-info">${icon('phone', 'ic-sm')}<span>Number: <b>${fmtPhone(lf.phone)}</b></span><button type="button" data-chgnum>Change</button></div>`;
    let body, btn;
    if (step === 'wa') {
      const w = lf.wa;
      body = `${numberBar}
        <div class="wa-card">
          <span class="wa-logo">${WA_ICON}</span>
          <ol class="wa-steps"><li>Tap <b>Open WhatsApp</b> below</li><li>Press <b>Send</b> — the message is already typed</li><li>Come back here. We continue automatically ✓</li></ol>
          <div class="wa-msg"><small>Message</small>${esc(w.text)}</div>
          ${w.test
            ? `<button type="button" class="btn-wa" data-wasim>${WA_ICON} Simulate WhatsApp message</button><p class="reason test">${icon('alert', 'ic-sm')}<span>Test mode — WhatsApp is not connected yet, so this button pretends you sent the message.</span></p>`
            : `<a class="btn-wa" href="${esc(w.link)}" target="_blank" rel="noopener">${WA_ICON} Open WhatsApp</a>`}
          <p class="wa-wait">${icon('loader', 'ic-sm spin')} Waiting for your WhatsApp message…</p>
        </div>
        ${canSms() ? '<button type="button" class="alt-link" data-usesms>No WhatsApp? Get OTP by SMS instead</button>' : ''}`;
      btn = "I've sent it — Continue";
    } else if (step === 'otp') {
      body = `${numberBar}
        ${lf.channel === 'whatsapp' && !lf.devOtp ? `<div class="wa-sent"><span class="wa-logo sm">${WA_ICON}</span><span>Check <b>WhatsApp</b> — a message from <b>${esc(STORE.name)}</b> has your 6-digit code.</span></div>` : ''}
        ${lf.devOtp ? `<div class="reason test">${icon('alert', 'ic-sm')}<span>Test mode (switched on in .env) — nothing was sent. Code: <b>${lf.devOtp}</b></span></div>` : ''}
        <div><label class="lbl" for="f-otp">Enter 6-digit OTP <i>*</i></label><input class="inp otp" id="f-otp" name="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="• • • • • •" value="${esc(lf.otp)}"></div>
        <button type="button" class="resend" data-resend disabled>Resend OTP</button>
        ${lf.channel === 'whatsapp' ? (canSms() ? '<button type="button" class="alt-link" data-usesms>Not received? Get OTP by SMS instead</button>' : '') : (canWa() ? '<button type="button" class="alt-link" data-usewa>Get OTP on WhatsApp instead</button>' : '')}`;
      btn = m === 'register' ? 'Verify & Create Account' : 'Verify & Reset Password';
    } else if (m === 'forgot' && !otpOn) {
      body = `<div class="wa-sent"><span class="wa-logo sm" style="background:var(--green)">${icon('phone', 'ic')}</span><span><b>Call or WhatsApp ${esc(STORE.name)}</b><br>Tell us your registered mobile number. We'll set a new password for you and you can log in straight away.</span></div>
        <a class="btn-wa" href="tel:${esc(STORE.phone.replace(/\s/g, ''))}">${icon('phone', 'ic')} Call ${esc(STORE.phone)}</a>`;
      btn = 'Back to Login';
    } else {
      body = `${m !== 'forgot' ? `<div class="seg" role="tablist"><button type="button" class="${m === 'register' ? 'on' : ''}" data-mode="register">New customer</button><button type="button" class="${m === 'login' ? 'on' : ''}" data-mode="login">Already registered</button></div>` : ''}
        ${m === 'register' ? `<label class="photo-pick"><span class="ph-circle" id="phPrev">${lf.photo ? `<img src="${lf.photo}" alt="">` : icon('camera')}</span><span><b>Add profile photo</b><small>Optional · tap to choose</small></span><input type="file" accept="image/*" data-photo-in="signup" hidden></label>
          <div><label class="lbl" for="f-name">Full Name <i>*</i></label><input class="inp" id="f-name" name="name" autocomplete="name" maxlength="60" placeholder="Ravi Kumar" value="${esc(lf.name)}"></div>` : ''}
        <div><label class="lbl" for="f-phone">${m === 'register' ? 'WhatsApp / Mobile Number' : 'Mobile Number'} <i>*</i></label><div class="phone-in"><span>+91</span><input class="inp" id="f-phone" name="phone" type="tel" inputmode="numeric" maxlength="10" autocomplete="tel-national" placeholder="10-digit mobile number" value="${esc(lf.phone)}"></div></div>
        ${m === 'register' ? pwField('Create Password', 'At least 6 characters', 'new-password')
          : m === 'forgot' ? pwField('New Password', 'At least 6 characters', 'new-password')
          : pwField('Password', 'Your password', 'current-password') + '<button type="button" class="forgot-link" data-mode="forgot">Forgot password?</button>'}
        ${m !== 'login' && otpOn ? (canVerify() ? `<p class="note">${icon('shield', 'ic-xs')} ${canWaSend() ? "We'll send a 6-digit code to your WhatsApp to verify your number." : canWaRecv() ? "We'll verify your number on WhatsApp." : 'We will send a one-time code (OTP) by SMS.'}</p>`
          : `<div class="reason">${icon('alert', 'ic-sm')}<span>${m === 'register' ? 'New sign-ups are paused for a short while' : 'Password reset is paused for a short while'} while we set up mobile verification. Please call us at ${esc(STORE.phone)}.</span></div>`) : ''}
        ${m !== 'login' && otpOn && canWa() && canSms() ? '<button type="button" class="alt-link" data-usesms>No WhatsApp? Get OTP by SMS instead</button>' : ''}`;
      btn = m === 'login' ? 'Login & Continue' : !otpOn ? 'Create Account' : !canVerify() ? 'Not available right now' : canWaSend() ? 'Get OTP on WhatsApp' : canWa() ? 'Verify on WhatsApp' : 'Send OTP by SMS';
    }
    app.innerHTML = `<div class="view login-v"><div class="login-box">
      <header class="hero-head">${m === 'forgot' || step !== 'form' ? `<button class="back light" data-lback aria-label="Back">${icon('arrowLeft')}</button>` : '<span class="brand-mark light">GF</span>'}<h1>${title}</h1><p>${sub}</p></header>
      <div class="scroll pad">
        ${loginReason && step === 'form' ? `<div class="reason">${icon('alert', 'ic-sm')}${esc(loginReason)}</div>` : ''}
        <form class="form-card" id="loginForm" novalidate>${body}<button type="submit" hidden></button></form>
      </div>
      <div class="bottom"><button class="btn-main ${otpOn && step === 'form' && m !== 'login' && canWa() ? 'wa' : ''}" id="loginGo">${otpOn && step === 'form' && m !== 'login' && canWa() ? WA_ICON + ' ' : ''}${btn}</button></div>
    </div></div>`;
    const f = $('#loginForm'), go = $('#loginGo');
    const ready = () => (m === 'forgot' && !otpOn) || step === 'wa' ? true : step === 'otp' ? /^\d{6}$/.test(lf.otp)
      : /^\d{10}$/.test(lf.phone) && !!lf.password && (m !== 'register' || lf.name.trim()) && (m === 'login' || !otpOn || canVerify());
    const sync = () => go.classList.toggle('ready', !!ready());
    f.addEventListener('input', e => {
      const el = e.target;
      if (el.name === 'phone' || el.name === 'otp') el.value = el.value.replace(/\D/g, '').slice(0, el.name === 'otp' ? 6 : 10);
      if (el.name && el.name in lf) lf[el.name] = el.value;
      sync();
    });
    sync();
    if (step === 'otp') startResendTimer();
    if (step === 'wa') waPoll = setInterval(() => checkWa(false), 3000);
    f.onsubmit = e => { e.preventDefault(); submitLogin(go); };
    go.onclick = () => submitLogin(go);
    (step === 'otp' ? f.elements.otp : step === 'wa' ? null : m === 'register' ? f.elements.name : f.elements.phone)?.focus();
  }

  function startResendTimer() {
    const tick = () => {
      const b = $('[data-resend]');
      if (!b) return clearInterval(resendTimer);
      const left = Math.ceil((lf.resendAt - Date.now()) / 1000);
      b.disabled = left > 0;
      b.textContent = left > 0 ? `Resend OTP in ${left}s` : 'Resend OTP';
    };
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  function checkForm() {
    const m = loginMode;
    if (m === 'register' && lf.name.trim().length < 2) return 'Kripya apna poora naam bharein.';
    if (!/^[6-9]\d{9}$/.test(lf.phone)) return 'Kripya sahi 10-digit mobile number bharein.';
    if (m === 'login') return lf.password ? '' : 'Kripya password bharein.';
    return lf.password.length >= 6 ? '' : 'Password kam se kam 6 characters ka hona chahiye.';
  }

  async function startWa() {
    if (canWaSend()) return requestOtp('whatsapp');
    const r = await api('/auth/wa/start', { body: { phone: lf.phone, purpose: loginMode === 'forgot' ? 'reset' : 'register' } });
    Object.assign(lf, { wa: r, step: 'wa' });
    viewLogin();
    if (r.link && matchMedia('(max-width: 899px)').matches) window.open(r.link, '_blank', 'noopener');
  }

  async function requestOtp(channel = 'sms') {
    const r = await api('/auth/otp', { body: { phone: lf.phone, channel, purpose: loginMode === 'forgot' ? 'reset' : 'register' } });
    Object.assign(lf, { devOtp: r.devOtp || null, resendAt: Date.now() + 30000, step: 'otp', otp: '', channel });
    toast(channel === 'whatsapp' ? `OTP aapke WhatsApp (${fmtPhone(lf.phone)}) par bhej diya gaya hai.` : `OTP ${fmtPhone(lf.phone)} par SMS se bhej diya gaya hai.`, true);
    viewLogin();
  }

  let waChecking = false;
  async function checkWa(manual) {
    if (!lf.wa || waChecking) return;
    waChecking = true;
    try {
      const s = await api('/auth/wa/status', { body: { id: lf.wa.id } });
      if (s.verified) { stopLoginTimers(); await finishAuth({ waId: lf.wa.id }); }
      else if (s.expired) { toast('Verification ka samay khatam ho gaya. Kripya dobara try karein.'); lf.step = 'form'; viewLogin(); }
      else if (manual) toast('Abhi tak aapka WhatsApp message nahi mila. WhatsApp me "Send" dabayein, phir yahan wapas aayein.');
    } catch (ex) { if (manual) toast(ex.message); }
    waChecking = false;
  }

  // Creates the account / resets the password once the number is verified (or logs in).
  async function finishAuth(proof) {
    const m = loginMode;
    const r = m === 'login' ? await api('/auth/login', { body: { phone: lf.phone, password: lf.password } })
      : m === 'register' ? await api('/auth/register', { body: { name: lf.name.trim(), phone: lf.phone, password: lf.password, ...proof } })
      : await api('/auth/reset', { body: { phone: lf.phone, password: lf.password, ...proof } });
    PRODUCTS = (await api('/products')).products;
    setUser(r.user);
    if (m === 'register' && lf.photo) {
      try { user.photo = (await api('/me/photo', { body: { image: lf.photo } })).user.photo; }
      catch { toast('Photo upload nahi ho payi. My Profile me dobara try karein.'); }
    }
    toast(m === 'register' ? `Welcome to ${STORE.name} Fresh, ${first(r.user.name)}!${r.user.verified ? ' Number verified ✓' : ''}`
      : m === 'forgot' ? 'Password badal gaya. Aap login ho gaye hain.' : `Welcome back, ${first(r.user.name)}!`, true);
    Object.assign(lf, { name: '', password: '', photo: null, otp: '', step: 'form', devOtp: null, wa: null });
    afterRender = pendingAction;
    pendingAction = null;
    loginReason = '';
    loginMode = 'register';
    gpsAsked = false;
    setTimeout(() => autoLocate(true), 600);
    if (location.hash === '#/') render(); else location.replace('#/');
  }

  async function submitLogin(go, how) {
    const step = lf.step;
    if (step === 'wa') return checkWa(true);
    if (loginMode === 'forgot' && !VERIFY.required) return setLoginMode('login');
    if (step === 'form') { const err = checkForm(); if (err) return toast(err); if (loginMode !== 'login' && VERIFY.required && !canVerify()) return toast(`Mobile verification abhi set up nahi hai. Kripya ${STORE.phone} par call karein.`); }
    if (step === 'otp' && !/^\d{6}$/.test(lf.otp)) return toast('Kripya 6-digit OTP bharein.');
    const label = go?.innerHTML;
    if (go) { go.disabled = true; go.innerHTML = `${icon('loader', 'ic spin')} Please wait…`; }
    try {
      if (step === 'form' && loginMode !== 'login' && VERIFY.required) await ((how || (canWa() ? 'wa' : 'sms')) === 'wa' ? startWa() : requestOtp('sms'));
      else await finishAuth(step === 'otp' ? { otp: lf.otp } : {});
    } catch (ex) {
      toast(ex.status === 409 ? 'Is number se account pehle se hai. "Already registered" par tap karke login karein.' : ex.message);
      if (go && go.isConnected) { go.disabled = false; go.innerHTML = label; }
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && lf.step === 'wa') checkWa(false); });

  /* ---------- My profile ---------- */
  function viewProfile() {
    if (!user) return requireLogin('Profile dekhne ke liye login karein.', () => { location.hash = '#/profile'; });
    app.innerHTML = `<div class="view"><header class="subhead"><button class="back" data-go="#/" aria-label="Back">${icon('arrowLeft')}</button><h2>My Profile</h2></header>
      <div class="scroll" style="padding:16px 0">
        <section class="block profile-top">
          <label class="photo-big" title="Change photo">${avatar(user, 'xl')}<span class="cam">${icon('camera', 'ic-sm')}</span><input type="file" accept="image/*" data-photo-in="profile" hidden></label>
          <div class="pinfo"><b>${esc(user.name)}</b><span>${fmtPhone(user.phone)}${user.verified ? ' <em class="vbadge">✓ Verified</em>' : ''}</span>
            ${user.photo ? '<button class="link-btn" data-rmphoto>Remove photo</button>' : '<small>Tap the photo to add one</small>'}</div>
        </section>
        <section class="block"><h4>Your name</h4><form id="nameForm" class="row-form"><input class="inp sm" name="name" maxlength="60" value="${esc(user.name)}" aria-label="Your name"><button class="btn-sm">Save</button></form></section>
        <section class="block"><h4>Change password</h4><form id="pwForm2" class="pw-form">
          <input class="inp sm" name="current" type="password" autocomplete="current-password" placeholder="Current password" aria-label="Current password">
          <input class="inp sm" name="next" type="password" autocomplete="new-password" placeholder="New password (at least 6 characters)" aria-label="New password">
          <button class="btn-sm">Update password</button></form></section>
        <section class="block"><button class="prow-btn" data-go="#/orders">${icon('receipt')} My Orders ${icon('chevronRight', 'ic-sm chev')}</button><button class="prow-btn red" data-logout>${icon('logout')} Logout</button></section>
      </div></div>`;
  }

  /* ---------- Home ---------- */
  function locationLine() {
    if (draft.city || draft.line2) return [draft.line2 || draft.line1, draft.city].filter(Boolean).join(', ');
    return locating ? 'Finding your location…' : 'Set delivery location';
  }

  function card(p) {
    const vi = Math.min(selV[p.id] ?? 0, p.variants.length - 1);
    const v = p.variants[vi], q = qtyOf(p.id, vi);
    return `<div class="pcard ${p.inStock ? '' : 'oos'}" data-card="${p.id}">
      ${p.tag ? `<span class="badge">${esc(p.tag)}</span>` : ''}
      ${media(p, 'pimg', p.inStock ? '' : '<span class="oos-tag">Out of stock</span>')}
      <div class="pbody">
        <div><h3>${esc(p.name)}</h3>
          <div class="unit">${rupee(v.price)} / ${esc(v.size)}</div>
          ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ''}
          ${p.variants.length > 1 ? `<div class="sizes">${p.variants.map((x, i) => `<button class="${i === vi ? 'on' : ''}" data-size="${p.id}" data-v="${i}">${esc(x.size)}</button>`).join('')}</div>` : ''}
        </div>
        <div class="prow">
          <div class="price">${rupee(v.price)}${v.mrp > v.price ? `<s>${rupee(v.mrp)}</s>` : ''}</div>
          ${!p.inStock ? '<button class="add" disabled>Out of stock</button>'
            : q ? `<div class="stepper"><button data-dec="${p.id}" data-v="${vi}" aria-label="Remove one">${icon('minus', 'ic-sm')}</button><span>${q}</span><button data-inc="${p.id}" data-v="${vi}" aria-label="Add one" ${q >= MAX_QTY ? 'disabled' : ''}>${icon('plus', 'ic-sm')}</button></div>`
            : `<button class="add" data-inc="${p.id}" data-v="${vi}">ADD</button>`}
        </div>
      </div>
    </div>`;
  }

  function refreshCard(id) {
    const el = $(`[data-card="${id}"]`);
    if (el) el.outerHTML = card(byId(id));
  }

  function cartBarHtml() {
    const n = cartCount();
    if (!n) return '';
    return `<div class="cartbar" id="cartbar"><button data-go="#/cart">
      <span class="l">${icon('bag', 'ic')}<span><b>${n} Item${n > 1 ? 's' : ''}</b><small>${rupee(totals().price)} total</small></span></span>
      <span class="r">View Cart ${icon('chevronRight', 'ic-sm')}</span></button></div>`;
  }
  function refreshCartBar() {
    const view = $('.home-view');
    if (!view) return;
    $('#cartbar')?.remove();
    view.insertAdjacentHTML('beforeend', cartBarHtml());
    const head = $('.head-cart'), n = cartCount();
    if (head) { $('i', head)?.remove(); if (n) head.insertAdjacentHTML('beforeend', `<i>${n}</i>`); }
  }

  let query = '';
  function menuHtml() {
    const q = query.toLowerCase().trim();
    const list = PRODUCTS.filter(p => (chip === 'all' || p.cat === chip) &&
      (!q || [p.name, p.type, p.desc, p.tag].join(' ').toLowerCase().includes(q))).sort((a, b) => b.inStock - a.inStock);
    if (list.length) return list.map(card).join('');
    return q ? `<p class="menu-empty">"${esc(query)}" se koi product nahi mila.</p>` : '<p class="menu-empty">Is category me abhi koi product nahi hai.</p>';
  }

  const searchBox = cls => `<label class="search ${cls}">${icon('search', 'ic-sm')}<input class="search-in" type="search" placeholder="Search milk, paneer, ghee…" value="${esc(query)}" aria-label="Search products"></label>`;

  const TRUST = [
    ['leaf', 'Farm fresh', 'Milked & chilled the same morning'],
    ['shield', 'No preservatives', 'Pure, unadulterated dairy'],
    ['truck', 'Doorstep delivery', 'Morning & evening slots'],
    ['wallet', 'Pay on delivery', 'Cash or any UPI app'],
  ];

  function viewHome() {
    const b = STORE.banner || {};
    const cats = CATEGORIES.filter(c => PRODUCTS.some(p => p.cat === c.id));
    const n = cartCount();
    app.innerHTML = `<div class="view home-view">
      <header class="topbar">
        <a class="brand" href="#/" aria-label="${esc(STORE.name)} home"><span class="brand-mark">GF</span><span class="brand-name">${esc(STORE.name)}<small>${esc(STORE.tagline)}</small></span></a>
        <button class="loc" data-locsheet aria-label="Change delivery location">
          <span class="loc-ic">${icon('mapPin')}</span>
          <span class="loc-txt"><span class="hello">Hello, ${esc(user ? first(user.name) : 'Guest')} ${icon('chevronRight', 'ic-xs')}</span><b>${esc(locationLine())}</b></span>
        </button>
        ${searchBox('in-head')}
        <button class="head-cart" data-go="#/cart" aria-label="Cart">${icon('bag')}<span>Cart</span>${n ? `<i>${n}</i>` : ''}</button>
        <button class="avatar-btn" data-profile aria-label="Account">${user ? avatar(user) : `<span class="avatar">${icon('user')}</span>`}</button>
      </header>
      <div class="scroll" id="homeScroll"><div class="wrap">
        ${searchBox('in-body')}
        <div class="banner-wrap"><div class="banner">
          <div class="banner-txt"><span class="chip-green">${esc(b.tag || 'Morning Fresh')}</span><h2>${esc(b.title || 'Farm to Home')}</h2><p>${esc(b.text || '100% Pure & Untouched')}</p>
            <button class="banner-cta" data-chip="milk">Order fresh milk ${icon('chevronRight', 'ic-sm')}</button></div>
          ${b.img ? `<img src="${esc(b.img)}" alt="">` : ''}
        </div></div>
        <div class="trust">${TRUST.map(([ic, t, s]) => `<div><span>${icon(ic, 'ic-sm')}</span><p><b>${t}</b>${s}</p></div>`).join('')}</div>
        <div class="chips">
          <button class="${chip === 'all' ? 'on' : ''}" data-chip="all">All Fresh</button>
          ${cats.map(c => `<button class="${chip === c.id ? 'on' : ''}" data-chip="${c.id}">${esc(c.name)}</button>`).join('')}
        </div>
        <div class="menu"><h3 class="section-h">Explore Menu</h3><div class="menu-list" id="menuList">${menuHtml()}</div></div>
        <footer class="site-foot">
          <div class="foot-brand"><span class="brand-mark">GF</span><div><b>${esc(STORE.name)}</b><p>${esc(STORE.tagline)}</p></div></div>
          <div class="foot-cols">
            <div><h5>Contact</h5><a href="tel:${esc(STORE.phone.replace(/\s/g, ''))}">${icon('phone', 'ic-xs')} ${esc(STORE.phone)}</a><a href="mailto:${esc(STORE.email)}">✉ ${esc(STORE.email)}</a><p>${esc(STORE.address)}</p></div>
            <div><h5>Your account</h5><a href="#/orders">My orders</a><a href="#/cart">My cart</a>${user ? '<button data-logout>Logout</button>' : '<button data-login>Login / Sign up</button>'}</div>
            <div><h5>Delivery</h5><p>Morning 6 – 8 AM and evening 5 – 7 PM slots.</p><p>Pay by cash or any UPI app at your door.</p></div>
          </div>
          <p class="copy">© ${new Date().getFullYear()} ${esc(STORE.name)}. All rights reserved.</p>
        </footer>
      </div></div>
      ${cartBarHtml()}
    </div>`;
  }

  /* ---------- Map (OpenStreetMap tiles drawn around a pin; needs no map library) ---------- */
  function staticMap(lat, lng, zoom = 16) {
    const size = 256 * 2 ** zoom, r = lat * Math.PI / 180;
    const x = (lng + 180) / 360 * size;
    const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * size;
    const tx = Math.floor(x / 256), ty = Math.floor(y / 256), max = 2 ** zoom;
    let tiles = '';
    for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) {
      const cx = tx + dx, cy = ty + dy;
      if (cy < 0 || cy >= max) continue;
      tiles += `<img src="https://tile.openstreetmap.org/${zoom}/${(cx + max) % max}/${cy}.png" alt="" style="left:calc(50% + ${Math.round(cx * 256 - x)}px);top:calc(50% + ${Math.round(cy * 256 - y)}px)">`;
    }
    return `<div class="osm" role="img" aria-label="Map of the delivery location">${tiles}<span class="osm-pin">${icon('mapPin')}</span>
      <a class="osm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>`;
  }

  /* ---------- Checkout ---------- */
  function slotOptions() {
    const fmt = d => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const out = [{ day: 'Today', time: 'As soon as possible' }];
    for (let k = 1; k <= 2; k++) {
      const d = new Date();
      d.setDate(d.getDate() + k);
      const day = k === 1 ? 'Tomorrow' : fmt(d);
      out.push({ day, time: '6 – 8 AM', full: `${k === 1 ? 'Tomorrow, ' : ''}${fmt(d)}, 6 – 8 AM` }, { day, time: '5 – 7 PM', full: `${k === 1 ? 'Tomorrow, ' : ''}${fmt(d)}, 5 – 7 PM` });
    }
    return out.map(s => ({ ...s, label: s.full || `Today (${fmt(new Date())}), as soon as possible` }));
  }

  const addressReady = () => draft.line1.trim().length >= 3 && draft.line2.trim() && draft.city.trim().length >= 2 && /^[1-9]\d{5}$/.test(draft.pin.trim());

  function locationHtml() {
    const has = draft.lat != null;
    const { lat, lng } = draft;
    return `<div class="mapbox">
        ${has ? `<div class="map">${staticMap(lat, lng)}
            <button class="relocate" data-locsheet>${icon('mapPin', 'ic-xs')} Change on map</button></div>`
          : draft.source === 'manual' && draft.city ? `<div class="map-empty manual">${icon('mapPin', 'ic')}<p>Delivering to <b>${esc([draft.line2, draft.city].filter(Boolean).join(', '))}</b><br><small>Address entered manually</small></p></div>`
          : `<div class="map-empty">${icon('mapPin', 'ic bounce')}<p>Detect your exact location</p></div>`}
        <button class="detect ${has && !locating ? 'done' : ''}" data-locate ${locating ? 'disabled' : ''}>
          ${locating ? `${icon('loader', 'ic-sm spin')} Fetching GPS...` : has ? `${icon('circleCheck', 'ic-sm')} Location pinned on map` : `${icon('locate', 'ic-sm')} Detect Current Location`}</button>
        ${has ? '' : `<button type="button" class="alt-link map-link" data-locsheet>${icon('mapPin', 'ic-xs')} Or set the location on a map</button>`}
      </div>`;
  }

  function itemsHtml() {
    return cart.map((i, idx) => {
      const p = byId(i.id), v = p.variants[i.v], u = unitPrice(v, i.plan);
      return `<div class="line">
        <div class="l"><span class="veg"></span><div><div class="nm">${esc(p.name)}</div><div class="un">${rupee(u)} / ${esc(v.size)}</div>
          ${p.inStock ? '' : '<div class="oos-note">Out of stock — please remove</div>'}</div></div>
        <div class="r"><div class="stepper sm"><button data-ldec="${idx}" aria-label="Remove one">${icon('minus', 'ic-xs')}</button><span>${i.qty}</span><button data-linc="${idx}" aria-label="Add one" ${i.qty >= MAX_QTY || !p.inStock ? 'disabled' : ''}>${icon('plus', 'ic-xs')}</button></div>
          <div class="amt">${rupee(u * i.qty)}</div></div>
      </div>`;
    }).join('');
  }

  function billHtml() {
    const t = totals();
    const left = STORE.freeDeliveryAbove - t.price;
    return `<h4>Bill Details</h4>
      <div class="bill">
        <div><span>Item Total</span><span>${t.discount ? `<s style="color:#9ca3af;margin-right:6px">${rupee(t.mrp)}</s>` : ''}${rupee(t.price)}</span></div>
        ${t.couponOff ? `<div><span>Coupon (${esc(coupon)})</span><span class="green">− ${rupee(t.couponOff)}</span></div>` : ''}
        <div><span>Delivery Partner Fee</span>${t.delivery ? `<span>${rupee(t.delivery)}</span>` : '<span class="free">FREE</span>'}</div>
        ${left > 0 ? `<div style="font-size:12px;color:#6b7280"><span>Add ${rupee(left)} more for free delivery</span></div>` : ''}
        <div class="grand"><span>Grand Total</span><span>${rupee(t.total)}</span></div>
      </div>
      ${coupon && !t.couponMsg
        ? `<div class="coupon-ok"><span>✓ ${esc(coupon)} applied · you save ${rupee(t.couponOff)}</span><button data-rmcoupon class="err-text">Remove</button></div>`
        : `<form class="coupon" id="couponForm"><input class="inp sm" name="code" placeholder="Coupon code" aria-label="Coupon code" value="${esc(coupon)}"><button>Apply</button></form>
           <p class="coupon-hint">${t.couponMsg ? `<span class="err-text">${esc(t.couponMsg)}</span>` : `Try ${Object.keys(COUPONS).map(c => `<button type="button" data-coupon="${c}">${c}</button>`).join(' or ')}`}</p>`}`;
  }

  function placeBtnHtml() {
    const ok = addressReady() && !cart.some(i => !byId(i.id).inStock);
    return `<button class="btn-main ${ok ? 'ready' : ''}" id="placeBtn">Place Order • ${rupee(totals().total)}</button>`;
  }

  function refreshCheckout() {
    if (!$('#ckItems')) return;
    $('#ckItems').innerHTML = itemsHtml();
    $('#ckBill').innerHTML = billHtml();
    $('#ckBottom').innerHTML = placeBtnHtml();
  }

  function viewCart() {
    if (!user) return requireLogin('Order karne ke liye kripya login karein.', () => { location.hash = '#/cart'; });
    if (!cart.length) {
      app.innerHTML = `<div class="view"><header class="subhead"><button class="back" data-go="#/" aria-label="Back">${icon('arrowLeft')}</button><h2>Checkout</h2></header>
        <div class="scroll"><div class="empty"><div class="big">${icon('bag')}</div><h3>Your cart is empty</h3><p>Fresh milk, paneer aur dahi add karein.</p><button class="btn-main ready" data-go="#/">Browse Menu</button></div></div></div>`;
      return;
    }
    const slots = slotOptions();
    app.innerHTML = `<div class="view">
      <header class="subhead"><button class="back" data-go="#/" aria-label="Back">${icon('arrowLeft')}</button><h2>Checkout</h2></header>
      <div class="scroll" style="padding-bottom:16px">
        <section class="block"><h4 class="row-h">Delivery Location <button type="button" class="link-btn" data-locsheet>Change</button></h4>
          <div id="ckLoc">${locationHtml()}</div>
          <div class="fields">
            <div class="full"><label class="lbl sm" for="a-line1">House No, Floor, Building <i>*</i></label><input class="inp sm" id="a-line1" data-f="line1" maxlength="120" value="${esc(draft.line1)}" placeholder="e.g. Flat 201, Green Apts"></div>
            <div class="full"><label class="lbl sm" for="a-line2">Locality / Area <i>*</i></label><input class="inp sm" id="a-line2" data-f="line2" list="areaList" maxlength="120" value="${esc(draft.line2)}" placeholder="e.g. Tajpur Road"></div>
            <div><label class="lbl sm" for="a-city">City <i>*</i></label><input class="inp sm" id="a-city" data-f="city" maxlength="40" value="${esc(draft.city)}" placeholder="e.g. Samastipur"></div>
            <div><label class="lbl sm" for="a-pin">Pincode <i>*</i></label><input class="inp sm" id="a-pin" data-f="pin" inputmode="numeric" maxlength="6" value="${esc(draft.pin)}" placeholder="6 digits"></div>
          </div>
          <datalist id="areaList"></datalist><p class="hint" id="ckPinHint"></p>
          <p class="hint">Delivering to ${esc(user.name)} · ${esc(user.phone)}</p>
        </section>
        <section class="block" id="ckItems">${itemsHtml()}</section>
        <section class="block"><h4>Delivery Time</h4><div class="slots">${slots.map((s, i) => `<button class="${i === draft.slot ? 'on' : ''}" data-slot="${i}"><b>${s.day}</b><small>${s.time}</small></button>`).join('')}</div></section>
        <section class="block" id="ckBill">${billHtml()}</section>
        <section class="block"><h4>Pay Using</h4>
          ${PAYMENT_METHODS.map((m, i) => `<button class="pay ${i === draft.pay ? 'on' : ''}" data-pay="${i}"><span class="l"><span class="pay-ic">${/upi/i.test(m) ? 'UPI' : '₹'}</span><span><b>${esc(m)}</b><small>${/upi/i.test(m) ? 'Scan & pay with any UPI app at your door' : 'Pay in cash when your order arrives'}</small></span></span><span class="radio">${i === draft.pay ? icon('check', 'ic-xs') : ''}</span></button>`).join('')}
        </section>
      </div>
      <div class="bottom" id="ckBottom">${placeBtnHtml()}</div>
    </div>`;
  }

  /* ---------- Delivery location: automatic GPS, manual address, pincode lookup ---------- */
  const LOC_KEYS = ['line1', 'line2', 'city', 'state', 'pin', 'lat', 'lng', 'source'];
  const pinCache = new Map();
  let gpsAsked = false;

  function saveLoc() {
    if (user) local.set('loc_' + user.id, Object.fromEntries(LOC_KEYS.map(k => [k, draft[k] ?? null])));
  }
  function loadLoc(u) {
    const a = local.get('loc_' + u.id, null) || u.address;
    Object.assign(draft, { line1: '', line2: '', city: '', state: '', pin: '', lat: null, lng: null, source: null });
    if (a) Object.assign(draft, {
      line1: a.line1 || '', line2: a.line2 || '', city: a.city || '', state: a.state || '', pin: a.pin || '',
      lat: a.lat ?? null, lng: a.lng ?? null, source: a.source || (a.lat != null ? 'gps' : 'manual'),
    });
  }

  async function reverseGeocode(lat, lng) {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`);
    const a = (await r.json()).address || {};
    const pin = String(a.postcode || '').replace(/\D/g, '');
    return {
      area: a.suburb || a.neighbourhood || a.residential || a.village || a.city_district || a.road || a.hamlet || '',
      city: a.city || a.town || a.village || a.county || a.state_district || '',
      state: a.state || '',
      pin: /^[1-9]\d{5}$/.test(pin) ? pin : '',
    };
  }

  // Updates everything on screen that shows the delivery location.
  function refreshLocationUI() {
    const head = $('.loc-txt b');
    if (head) head.textContent = locationLine();
    if ($('#ckLoc')) {
      $('#ckLoc').innerHTML = locationHtml();
      ['line1', 'line2', 'city', 'pin'].forEach(k => { const el = $(`[data-f="${k}"]`); if (el && el.value !== draft[k]) el.value = draft[k]; });
      $('#ckBottom').innerHTML = placeBtnHtml();
    }
  }

  function detectLocation(silent = false) {
    return new Promise(resolve => {
      if (!navigator.geolocation) { if (!silent) toast('Aapka browser location access support nahi karta. Kripya address khud bharein.'); return resolve(false); }
      if (!window.isSecureContext) { if (!silent) toast('Location sirf secure (https) website par kaam karta hai. Kripya address khud bharein.'); return resolve(false); }
      locating = true;
      refreshLocationUI();
      navigator.geolocation.getCurrentPosition(async pos => {
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6, lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        let place = {};
        try { place = await reverseGeocode(lat, lng); } catch { /* the GPS pin is still saved */ }
        Object.assign(draft, { lat, lng, source: 'gps' });
        if (place.area) draft.line2 = place.area;
        if (place.city) draft.city = place.city;
        if (place.state) draft.state = place.state;
        if (place.pin) draft.pin = place.pin;
        locating = false;
        saveLoc();
        refreshLocationUI();
        $('#locWrap')?.remove();
        toast(`📍 Delivering to ${[draft.line2, draft.city].filter(Boolean).join(', ') || 'your current location'}`, true);
        resolve(true);
      }, () => {
        locating = false;
        refreshLocationUI();
        toast(silent ? 'Location nahi mil payi. Upar "Deliver to" par tap karke address bharein.' : 'Location access denied! Browser settings me Location allow karein, ya address khud bharein.');
        resolve(false);
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
  }

  // After login: find where the customer is, unless they chose another address themselves.
  function autoLocate(afterLogin) {
    if (!user || gpsAsked) return;
    if (draft.source === 'manual' && draft.city) return;
    if (!afterLogin && draft.city) return;
    gpsAsked = true;
    detectLocation(true);
  }

  async function lookupPin(pin) {
    if (!/^[1-9]\d{5}$/.test(pin)) return null;
    if (pinCache.has(pin)) return pinCache.get(pin);
    try {
      const r = await api('/pincode/' + pin);
      pinCache.set(pin, r);
      return r;
    } catch (ex) {
      if (ex.status === 404) pinCache.set(pin, null);
      return null;
    }
  }

  // Fills city / area suggestions from a pincode typed into a form (checkout or "Deliver to").
  async function fillFromPin(pin, { city, areaList, hint, area }) {
    if (hint) hint.textContent = pin.length === 6 ? 'Pincode check ho raha hai…' : '';
    if (pin.length !== 6) return null;
    const r = await lookupPin(pin);
    if (!r) { if (hint) { hint.textContent = 'Yeh pincode nahi mila — kripya city khud bharein.'; hint.className = 'hint err-text'; } return null; }
    // A pincode in another city means the old area name (e.g. a Panchkula sector) no longer applies.
    if (area && city && city.value && city.value.toLowerCase() !== r.city.toLowerCase() && !r.areas.includes(area.value)) {
      area.value = '';
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (city) { city.value = r.city; city.dispatchEvent(new Event('input', { bubbles: true })); }
    if (areaList) areaList.innerHTML = r.areas.map(a => `<option value="${esc(a)}">`).join('');
    if (area && !area.value && r.areas.length === 1) { area.value = r.areas[0]; area.dispatchEvent(new Event('input', { bubbles: true })); }
    if (hint) { hint.textContent = `📍 ${r.city}${r.state ? ', ' + r.state : ''}${r.areas.length > 1 ? ` · ${r.areas.length} areas — pick yours in Locality` : ''}`; hint.className = 'hint ok-text'; }
    return r;
  }

  // Leaflet (free, open-source map library) is loaded only when the map is first opened.
  let leafletReady = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = () => resolve(window.L);
      js.onerror = () => { leafletReady = null; reject(new Error('Map load nahi ho paya. Internet check karein.')); };
      document.head.appendChild(js);
    });
    return leafletReady;
  }

  // Address text → map position (India only).
  async function forwardGeocode(q) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&accept-language=en&q=${encodeURIComponent(q)}`);
    const [hit] = await r.json();
    return hit ? { lat: +hit.lat, lng: +hit.lon } : null;
  }

  const round6 = n => Math.round(n * 1e6) / 1e6;

  // "Deliver to": move the map so the pin sits on the door (like Zomato), or type the address.
  async function openLocSheet() {
    $('#locWrap')?.remove();
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.id = 'locWrap';
    wrap.innerHTML = `<div class="psheet loc-sheet" role="dialog" aria-label="Deliver to"><div class="grab"></div>
      <h3>Deliver to</h3>
      <div class="pickmap">
        <div id="pickMap"></div>
        <span class="center-pin" aria-hidden="true">${icon('mapPin')}</span>
        <span class="pin-tip" id="pinTip">Move the map to set your exact location</span>
        <button type="button" class="locate-me" data-mapgps>${icon('locate', 'ic-sm')} Locate me</button>
        <div class="map-msg" id="mapMsg">${icon('loader', 'ic spin')} Loading map…</div>
      </div>
      <div class="pick-addr">${icon('mapPin', 'ic-sm')}<span><b id="pickTitle">${esc(draft.line2 || 'Choose a location')}</b><small id="pickSub">${esc([draft.city, draft.state, draft.pin].filter(Boolean).join(', '))}</small></span></div>
      <form id="locForm" class="loc-form" novalidate>
        <div class="fields">
          <div><label class="lbl sm" for="l-pin">Pincode <i>*</i></label><input class="inp sm" id="l-pin" name="pin" inputmode="numeric" maxlength="6" placeholder="e.g. 160022" value="${esc(draft.pin)}"></div>
          <div><label class="lbl sm" for="l-city">City <i>*</i></label><input class="inp sm" id="l-city" name="city" maxlength="40" placeholder="e.g. Chandigarh" value="${esc(draft.city)}"></div>
          <div class="full"><label class="lbl sm" for="l-area">Locality / Area <i>*</i></label><input class="inp sm" id="l-area" name="line2" list="areaList2" maxlength="120" placeholder="e.g. Sector 22" value="${esc(draft.line2)}"><datalist id="areaList2"></datalist></div>
          <div class="full"><label class="lbl sm" for="l-house">House No, Floor, Building</label><input class="inp sm" id="l-house" name="line1" maxlength="120" placeholder="e.g. House 1234 (you can add it at checkout)" value="${esc(draft.line1)}"></div>
        </div>
        <p class="hint" id="locPinHint">Typing another city or pincode moves the map there.</p>
        <button class="btn-main ready" type="submit">Confirm location</button>
      </form>
    </div>`;
    app.appendChild(wrap);
    const f = $('#locForm', wrap);
    const pick = { state: draft.state || '' };
    let map = null, quiet = false, revTimer = null, revSeq = 0;

    const setLabel = () => {
      $('#pickTitle', wrap).textContent = f.elements.line2.value || 'Pinned location';
      $('#pickSub', wrap).textContent = [f.elements.city.value, pick.state, f.elements.pin.value].filter(Boolean).join(', ');
    };
    const fillFromPlace = p => {
      if (p.pin) f.elements.pin.value = p.pin;
      if (p.city) f.elements.city.value = p.city;
      if (p.area) f.elements.line2.value = p.area;
      if (p.state) pick.state = p.state;
      setLabel();
      if (p.pin) fillFromPin(p.pin, { areaList: $('#areaList2', wrap), hint: $('#locPinHint', wrap) });
    };
    const moveMap = (lat, lng, zoom = 16) => { if (!map) return; quiet = true; map.setView([lat, lng], zoom); };

    wrap.addEventListener('click', async e => {
      if (e.target === wrap) return wrap.remove();
      if (!e.target.closest('[data-mapgps]')) return;
      if (!navigator.geolocation || !window.isSecureContext) return toast('Is browser me GPS nahi mil raha. Map ko khud move karein ya address type karein.');
      $('#pinTip', wrap).textContent = 'Finding your location…';
      navigator.geolocation.getCurrentPosition(
        pos => { if (map) map.setView([pos.coords.latitude, pos.coords.longitude], 17); },
        () => { $('#pinTip', wrap).textContent = 'Move the map to set your exact location'; toast('Location access denied. Map ko khud move karein ya address type karein.'); },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });

    // Typing: pincode fills city/areas and moves the map; a new area moves the map closer.
    f.elements.pin.addEventListener('input', async e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      const r = await fillFromPin(e.target.value, { city: f.elements.city, areaList: $('#areaList2', wrap), hint: $('#locPinHint', wrap), area: f.elements.line2 });
      if (r) {
        pick.state = r.state;
        setLabel();
        const at = await forwardGeocode(`${r.city}, ${e.target.value}`).catch(() => null);
        if (at) moveMap(at.lat, at.lng, 14);
      }
    });
    f.elements.line2.addEventListener('change', async () => {
      setLabel();
      const at = await forwardGeocode([f.elements.line2.value, f.elements.city.value, f.elements.pin.value].filter(Boolean).join(', ')).catch(() => null);
      if (at) moveMap(at.lat, at.lng, 16);
    });
    f.elements.city.addEventListener('input', setLabel);

    f.addEventListener('submit', async e => {
      e.preventDefault();
      const v = { pin: f.elements.pin.value.trim(), city: f.elements.city.value.trim(), line2: f.elements.line2.value.trim(), line1: f.elements.line1.value.trim() };
      if (!/^[1-9]\d{5}$/.test(v.pin)) return toast('Kripya sahi 6-digit pincode bharein.');
      if (v.city.length < 2) return toast('Kripya city bharein.');
      if (!v.line2) return toast('Kripya locality / area bharein.');
      const c = map?.getCenter();
      // The pin on the map is the delivery point, wherever the customer is right now.
      Object.assign(draft, v, { state: pick.state, lat: c ? round6(c.lat) : null, lng: c ? round6(c.lng) : null, source: 'map' });
      saveLoc();
      refreshLocationUI();
      wrap.remove();
      toast(`Delivery location set: ${draft.line2}, ${draft.city}`, true);
    });

    if (draft.pin) fillFromPin(draft.pin, { areaList: $('#areaList2', wrap), hint: $('#locPinHint', wrap) });

    try {
      const L = await loadLeaflet();
      if (!wrap.isConnected) return;
      let start = draft.lat != null ? { lat: draft.lat, lng: draft.lng, zoom: 17 } : null;
      if (!start && (draft.city || draft.pin)) {
        const at = await forwardGeocode([draft.line2, draft.city, draft.pin].filter(Boolean).join(', ')).catch(() => null);
        if (at) start = { ...at, zoom: 15 };
      }
      start = start || { lat: 22.6, lng: 79.0, zoom: 5 }; // India
      map = L.map($('#pickMap', wrap), { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], start.zoom);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      L.control.zoom({ position: 'bottomleft' }).addTo(map);
      $('#pickMap', wrap).leafletMap = map; // lets automated tests move the map like a finger would
      $('#mapMsg', wrap).remove();
      map.on('movestart', () => { if (!quiet) $('#pinTip', wrap).textContent = 'Release to set this location'; wrap.querySelector('.center-pin').classList.add('lift'); });
      map.on('moveend', () => {
        wrap.querySelector('.center-pin').classList.remove('lift');
        $('#pinTip', wrap).textContent = 'Move the map to set your exact location';
        if (quiet) { quiet = false; return; }
        if (map.getZoom() < 13) return;
        clearTimeout(revTimer);
        const seq = ++revSeq;
        revTimer = setTimeout(async () => {
          const c = map.getCenter();
          $('#pickTitle', wrap).textContent = 'Finding address…';
          try { const p = await reverseGeocode(round6(c.lat), round6(c.lng)); if (seq === revSeq && wrap.isConnected) fillFromPlace(p); }
          catch { setLabel(); }
        }, 600);
      });
      setTimeout(() => map.invalidateSize(), 250);
    } catch (ex) {
      const m = $('#mapMsg', wrap);
      if (m) m.innerHTML = `${icon('alert', 'ic-sm')} ${esc(ex.message)} Address neeche type karein.`;
    }
  }

  async function locate() { return detectLocation(false); }

  async function placeOrder(btn) {
    if (!addressReady()) return toast('Delivery address zaroori hai. Kripya location detect karein aur address bharein.');
    if (cart.some(i => !byId(i.id).inStock)) return toast('Kuch items out of stock hain. Kripya unhe cart se hatayein.');
    btn.disabled = true;
    btn.innerHTML = `${icon('loader', 'ic spin')} Placing order…`;
    try {
      const { order } = await api('/orders', { body: {
        items: cart, coupon, slot: slotOptions()[draft.slot].label, pay: PAYMENT_METHODS[draft.pay],
        address: { name: user.name, phone: user.phone, line1: draft.line1, line2: draft.line2, city: draft.city, pin: draft.pin, lat: draft.lat, lng: draft.lng },
      } });
      user.address = order.address;
      cart = [];
      setCoupon('');
      location.hash = '#/order/' + order.id;
    } catch (ex) {
      toast(ex.message);
      btn.disabled = false;
      if (ex.status === 409) await refreshProducts();
      refreshCheckout();
    }
  }

  /* ---------- Order tracking ---------- */
  const STEPS = [
    ['Pending', 'Order Placed', 'Waiting for GauDhara to confirm your order', 'clock'],
    ['Confirmed', 'Order Confirmed', 'Confirmed and being packed with care', 'check'],
    ['Out for delivery', 'Out for Delivery', 'Our delivery partner is on the way', 'map'],
    ['Delivered', 'Arrived at Doorstep', 'Enjoy your fresh dairy!', 'house'],
  ];
  const STATUS_TXT = { Pending: 'Awaiting confirmation', Confirmed: 'Confirmed', 'Out for delivery': 'Out for delivery', Delivered: 'Delivered', Cancelled: 'Cancelled', Rejected: 'Not accepted' };
  const sCls = s => 's-' + s.replace(/\s/g, '-').toLowerCase();
  const fmtDate = iso => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  function trackingSheet(o) {
    const stopped = ['Cancelled', 'Rejected'].includes(o.status);
    const at = STEPS.findIndex(s => s[0] === o.status);
    const big = stopped ? `<h2 class="bad">${icon('alert', 'ic')} ${o.status === 'Rejected' ? 'Not accepted' : 'Cancelled'}</h2><p>${esc(o.note || 'This order will not be delivered')}</p>`
      : o.status === 'Delivered' ? `<h2 class="ok">${icon('circleCheck', 'ic')} Delivered</h2><p>Thank you for ordering!</p>`
      : `<h2>${STEPS[at][1]}</h2><p>${o.status === 'Pending' ? 'Waiting for confirmation' : esc(o.slot)}</p>`;
    return `<div class="status-big">${big}</div>
      <div class="helpcard"><div class="l"><span class="help-logo">GF</span><div><h4>${esc(STORE.name)} Support</h4><p>Questions about this order? Call us.</p></div></div>
        <a class="call" href="tel:${esc(STORE.phone.replace(/\s/g, ''))}" aria-label="Call ${esc(STORE.name)}">${icon('phone', 'ic-sm')}</a></div>
      ${o.rider && ['Confirmed', 'Out for delivery'].includes(o.status) ? `<div class="helpcard rider"><div class="l"><span class="help-logo">🛵</span><div><h4>${esc(o.rider.name)}</h4><p>Your delivery partner</p></div></div>
        <a class="call" href="tel:${esc(o.rider.phone)}" aria-label="Call ${esc(o.rider.name)}">${icon('phone', 'ic-sm')}</a></div>` : ''}
      ${stopped ? '' : `<div class="timeline"><span class="bar" style="height:calc((100% - 56px) * ${at / (STEPS.length - 1)})"></span>
        ${STEPS.map(([, title, sub, ic], i) => `<div class="tstep ${i < at ? 'done' : i === at ? 'now' : 'todo'}"><span class="tdot">${icon(i < at ? 'check' : ic, 'ic-xs')}</span><div><h4>${title}</h4><p>${sub}</p></div></div>`).join('')}
      </div>`}
      <div class="osum"><h4>Order summary</h4>
        ${o.items.map(i => `<div class="line"><div class="l"><span class="veg"></span><div><div class="nm">${esc(i.name)}</div><div class="un">${esc(i.size)} × ${i.qty}</div></div></div><div class="amt">${rupee(i.price * i.qty)}</div></div>`).join('')}
        <div class="bill" style="margin-top:8px"><div class="grand"><span>Total (${esc(o.pay)})</span><span>${rupee(o.totals.total)}</span></div></div>
        <p class="meta">📍 ${esc(o.address.line1)}, ${esc(o.address.line2)}, ${esc(o.address.city)} – ${esc(o.address.pin)}<br>🕒 ${esc(o.slot)}<br>Placed ${fmtDate(o.date)}</p>
        ${['Pending', 'Confirmed'].includes(o.status) ? `<button class="cancel-btn" data-cancel="${o.id}">Cancel order</button>` : ''}
      </div>`;
  }

  async function viewOrder(id, token) {
    if (!user) return requireLogin('Apna order dekhne ke liye login karein.', () => { location.hash = '#/order/' + id; });
    app.innerHTML = `<div class="view"><div class="empty">${icon('loader', 'ic spin')}</div></div>`;
    let o;
    try { o = (await api('/orders')).orders.find(x => x.id === id); } catch (ex) { return toast(ex.message); }
    if (token !== renderToken) return;
    if (!o) { location.replace('#/orders'); return; }
    const a = o.address;
    app.innerHTML = `<div class="view slide-up" style="background:#fff">
      <div class="track-map">
        ${a.lat != null ? staticMap(a.lat, a.lng, 16)
          : `<div class="dots"></div><div class="home-pin"><span>Your home</span><i>${icon('house')}</i></div>`}
        <div class="track-top"><button class="glass" data-go="#/orders" aria-label="Back">${icon('arrowLeft')}</button><span class="order-chip"><span class="live-dot"></span>Order #${o.id}</span></div>
      </div>
      <div class="sheet" id="trackSheet">${trackingSheet(o)}</div>
    </div>`;
    // The status changes when GauDhara verifies or dispatches the order in the admin panel.
    pollTimer = setInterval(async () => {
      try {
        const fresh = (await api('/orders')).orders.find(x => x.id === id);
        const sheet = $('#trackSheet');
        if (!fresh || !sheet || token !== renderToken) return;
        if (fresh.status !== o.status) {
          o = fresh;
          const top = sheet.scrollTop;
          sheet.innerHTML = trackingSheet(o);
          sheet.scrollTop = top;
          toast(`Order update: ${STATUS_TXT[o.status]}`, !['Cancelled', 'Rejected'].includes(o.status));
        }
      } catch { /* try again next time */ }
    }, 15000);
  }

  async function viewOrders(token) {
    if (!user) return requireLogin('Apne orders dekhne ke liye login karein.', () => { location.hash = '#/orders'; });
    app.innerHTML = `<div class="view"><header class="subhead"><button class="back" data-go="#/" aria-label="Back">${icon('arrowLeft')}</button><h2>My Orders</h2></header><div class="scroll"><div class="empty">${icon('loader', 'ic spin')}</div></div></div>`;
    let orders;
    try { orders = (await api('/orders')).orders; } catch (ex) { return toast(ex.message); }
    if (token !== renderToken) return;
    $('.scroll').innerHTML = orders.length ? `<div class="olist">${orders.map(o => `<button class="ocard" data-go="#/order/${o.id}">
        <div class="top"><b>Order #${o.id}</b><span class="spill ${sCls(o.status)}">${STATUS_TXT[o.status]}</span></div>
        <div class="sub">${o.items.map(i => `${esc(i.name)} × ${i.qty}`).join(', ')}</div>
        <div class="o-loc">${o.address.lat != null ? `<span class="o-map">${staticMap(o.address.lat, o.address.lng, 15)}</span>` : ''}<span>${icon('mapPin', 'ic-xs')} ${esc([o.address.line1, o.address.line2, o.address.city].filter(Boolean).join(', '))} – ${esc(o.address.pin)}</span></div>
        <div class="bot"><span class="sub" style="margin:0">${fmtDate(o.date)}</span><span>${rupee(o.totals.total)} ${icon('chevronRight', 'ic-xs')}</span></div>
      </button>`).join('')}</div>`
      : `<div class="empty"><div class="big">${icon('receipt')}</div><h3>No orders yet</h3><p>Aapke orders yahan dikhenge.</p><button class="btn-main ready" data-go="#/">Browse Menu</button></div>`;
  }

  /* ---------- Profile sheet ---------- */
  function openProfile() {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="psheet" role="dialog" aria-label="Account"><div class="grab"></div>
      ${user ? `<div class="pme">${avatar(user)}<div><b>${esc(user.name)}</b><span>${fmtPhone(user.phone)}${user.verified ? ' · ✓ Verified' : ''}</span></div></div>
        <button class="prow-btn" data-go="#/profile">${icon('user')} My Profile ${icon('chevronRight', 'ic-sm chev')}</button>
        <button class="prow-btn" data-go="#/orders">${icon('receipt')} My Orders ${icon('chevronRight', 'ic-sm chev')}</button>
        <button class="prow-btn" data-go="#/cart">${icon('bag')} My Cart ${icon('chevronRight', 'ic-sm chev')}</button>
        <button class="prow-btn red" data-logout>${icon('logout')} Logout</button>`
      : `<div class="pme"><span class="avatar">${icon('user')}</span><div><b>Hello, Guest</b><span>Login to order and track deliveries</span></div></div>
        <button class="btn-main ready" data-login>Login / Sign up</button>`}
      <p class="store-foot">${esc(STORE.name)} · ${esc(STORE.phone)} · ${esc(STORE.email)}</p>
    </div>`;
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-go], [data-login], [data-logout]')) setTimeout(() => wrap.remove(), 0); });
    app.appendChild(wrap);
  }

  /* ---------- Router ---------- */
  function route() {
    const [name = 'home', arg] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { name, arg: arg && decodeURIComponent(arg) };
  }

  let renderToken = 0;
  function render() {
    clearInterval(pollTimer);
    stopLoginTimers();
    const token = ++renderToken;
    const r = route();
    const titles = { home: 'Pure Dairy, Delivered Fresh', signin: 'Welcome', profile: 'My Profile', cart: 'Checkout', order: 'Track Order', orders: 'My Orders' };
    document.title = `${STORE.name} — ${titles[r.name] || titles.home}`;
    if (!user && r.name !== 'signin') { viewLogin(); return; }
    switch (r.name) {
      case 'signin': if (user) { location.replace('#/'); return; } viewLogin(); break;
      case 'profile': viewProfile(); break;
      case 'cart': viewCart(); break;
      case 'order': viewOrder(r.arg, token); break;
      case 'orders': viewOrders(token); break;
      default: viewHome();
    }
    if (afterRender) { const act = afterRender; afterRender = null; act(); }
  }

  async function refreshProducts() {
    try {
      const { products } = await api('/products');
      const changed = JSON.stringify(products) !== JSON.stringify(PRODUCTS);
      PRODUCTS = products;
      cart = cart.filter(i => byId(i.id)?.variants[i.v]);
      if (changed && $('#menuList')) { $('#menuList').innerHTML = menuHtml(); refreshCartBar(); }
    } catch { /* keep the current list */ }
  }

  /* ---------- Events ---------- */
  app.addEventListener('click', async e => {
    const t = e.target.closest('button, a');
    if (!t) return;
    const d = t.dataset;
    if (d.go) { e.preventDefault(); location.hash = d.go; }
    else if (d.inc) requireLogin('Cart me add karne ke liye kripya login karein.', () => change(d.inc, +d.v, 1));
    else if (d.dec) change(d.dec, +d.v, -1);
    else if (d.size) { selV[d.size] = +d.v; refreshCard(d.size); }
    else if (d.chip) {
      chip = d.chip;
      $$('.chips button').forEach(b => b.classList.toggle('on', b.dataset.chip === chip));
      $('#menuList').innerHTML = menuHtml();
      if (t.classList.contains('banner-cta')) $('.menu').scrollIntoView({ behavior: 'smooth' });
    }
    else if ('profile' in d) openProfile();
    else if ('login' in d) { loginReason = ''; location.hash = '#/signin'; }
    else if ('logout' in d) {
      await api('/auth/logout', { body: {} }).catch(() => {});
      setUser(null);
      PRODUCTS = [];
      Object.assign(draft, { line1: '', line2: '', city: '', state: '', pin: '', lat: null, lng: null, source: null });
      gpsAsked = false;
      toast('Aap logout ho gaye hain.', true);
      location.hash = '#/';
      render();
    }
    else if (d.mode) setLoginMode(d.mode);
    else if ('lback' in d) {
      if (lf.step !== 'form') { lf.step = 'form'; viewLogin(); }
      else if (user) render();
      else setLoginMode('login');
    }
    else if ('chgnum' in d) { lf.step = 'form'; viewLogin(); }
    else if ('usesms' in d) {
      if (lf.step === 'form') { const err = checkForm(); if (err) return toast(err); }
      try { await requestOtp('sms'); } catch (ex) { toast(ex.message); }
    }
    else if ('usewa' in d) { try { await startWa(); } catch (ex) { toast(ex.message); } }
    else if ('wasim' in d) {
      t.disabled = true;
      try { await api('/auth/wa/simulate', { body: { id: lf.wa.id } }); await checkWa(false); } catch (ex) { toast(ex.message); t.disabled = false; }
    }
    else if ('resend' in d) {
      t.disabled = true;
      try { await requestOtp(lf.channel); } catch (ex) { toast(ex.message); t.disabled = false; }
    }
    else if ('changepw' in d) { loginMode = 'forgot'; Object.assign(lf, { phone: user.phone, step: 'form', otp: '', password: '', devOtp: null, wa: null }); viewLogin(); }
    else if ('rmphoto' in d) {
      try { user.photo = (await api('/me/photo', { method: 'DELETE' })).user.photo; toast('Photo hata di gayi.', true); viewProfile(); }
      catch (ex) { toast(ex.message); }
    }
    else if ('eye' in d) {
      const input = t.previousElementSibling, show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      t.innerHTML = icon(show ? 'eyeOff' : 'eye');
      t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }
    else if ('locate' in d) locate();
    else if ('locsheet' in d) openLocSheet();
    else if (d.ldec || d.linc) { const i = cart[+(d.ldec || d.linc)]; change(i.id, i.v, d.ldec ? -1 : 1); }
    else if (d.slot) { draft.slot = +d.slot; $$('[data-slot]').forEach(b => b.classList.toggle('on', b === t)); }
    else if (d.pay) { draft.pay = +d.pay; $$('[data-pay]').forEach(b => { const on = b === t; b.classList.toggle('on', on); $('.radio', b).innerHTML = on ? icon('check', 'ic-xs') : ''; }); }
    else if (d.coupon) { setCoupon(d.coupon); refreshCheckout(); toast(`Coupon ${d.coupon} lag gaya!`, true); }
    else if ('rmcoupon' in d) { setCoupon(''); refreshCheckout(); }
    else if (t.id === 'placeBtn') placeOrder(t);
    else if (d.cancel) {
      if (!confirm('Kya aap yeh order cancel karna chahte hain?')) return;
      try { await api(`/orders/${d.cancel}/cancel`, { body: {} }); toast('Order cancel ho gaya.', true); render(); }
      catch (ex) { toast(ex.message); }
    }
  });

  app.addEventListener('input', e => {
    if (e.target.classList.contains('search-in')) {
      query = e.target.value;
      $$('.search-in').forEach(i => { if (i !== e.target) i.value = query; });
      $('#menuList').innerHTML = menuHtml();
      return;
    }
    const k = e.target.dataset.f;
    if (!k) return;
    if (k === 'pin') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    const changed = draft[k] !== e.target.value;
    draft[k] = e.target.value;
    if (changed && (k === 'pin' || k === 'city') && draft.source === 'gps') {
      Object.assign(draft, { lat: null, lng: null, source: 'manual' });
      $('#ckLoc').innerHTML = locationHtml();
    }
    if (k === 'pin' && changed && draft.pin.length === 6) {
      const pin = draft.pin;
      fillFromPin(pin, { city: $('[data-f="city"]'), areaList: $('#areaList'), hint: $('#ckPinHint'), area: $('[data-f="line2"]') })
        .then(r => r && forwardGeocode([draft.line2, r.city, pin].filter(Boolean).join(', ')))
        .then(at => {
          // Put the new place on the map (approximate; "Change on map" lets them fine-tune it).
          if (!at || draft.pin !== pin || !$('#ckLoc')) return;
          Object.assign(draft, { lat: round6(at.lat), lng: round6(at.lng), source: 'map' });
          saveLoc();
          $('#ckLoc').innerHTML = locationHtml();
        })
        .catch(() => {});
    }
    saveLoc();
    $('#ckBottom').innerHTML = placeBtnHtml();
  });

  app.addEventListener('change', async e => {
    const which = e.target.dataset.photoIn, file = e.target.files?.[0];
    if (!which || !file) return;
    e.target.value = '';
    try {
      const img = await readImage(file);
      if (which === 'signup') { lf.photo = img; $('#phPrev').innerHTML = `<img src="${img}" alt="">`; return; }
      toast('Photo upload ho rahi hai…', true);
      user.photo = (await api('/me/photo', { body: { image: img } })).user.photo;
      toast('Profile photo update ho gayi ✓', true);
      viewProfile();
    } catch (ex) { toast(ex.message); }
  });

  app.addEventListener('submit', async e => {
    if (e.target.id === 'pwForm2') {
      e.preventDefault();
      const f = e.target;
      if (f.elements.next.value.length < 6) return toast('Naya password kam se kam 6 characters ka hona chahiye.');
      try { await api('/me/password', { body: { current: f.elements.current.value, next: f.elements.next.value } }); f.reset(); toast('Password badal gaya ✓', true); }
      catch (ex) { toast(ex.message); }
      return;
    }
    if (e.target.id === 'nameForm') {
      e.preventDefault();
      try { user.name = (await api('/me/profile', { method: 'PUT', body: { name: e.target.elements.name.value } })).user.name; toast('Naam save ho gaya ✓', true); viewProfile(); }
      catch (ex) { toast(ex.message); }
      return;
    }
    if (e.target.id !== 'couponForm') return;
    e.preventDefault();
    setCoupon(e.target.elements.code.value.trim().toUpperCase());
    refreshCheckout();
    const t = totals();
    if (coupon && !t.couponMsg) toast(`Coupon lag gaya! Aapne ${rupee(t.couponOff)} bachaye.`, true);
  });

  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && route().name === 'home') refreshProducts(); });

  /* ---------- Boot ---------- */
  (async () => {
    const showSplash = !session.get('splash');
    if (showSplash) { app.innerHTML = splash(); session.set('splash', '1'); }
    const wait = new Promise(r => setTimeout(r, showSplash ? 1800 : 0));
    try {
      const [cfg, me] = await Promise.all([api('/config'), api('/me')]);
      ({ STORE, COUPONS, CATEGORIES, PAYMENT_METHODS, SUB_DISCOUNT } = cfg);
      VERIFY = cfg.VERIFY || {};
      if (me.user) PRODUCTS = (await api('/products')).products;
      setUser(me.user);
      await wait;
      render();
      setTimeout(() => autoLocate(false), 800);
    } catch {
      app.innerHTML = `<div class="view"><div class="empty"><div class="big">${icon('alert')}</div><h3>Store se connect nahi ho paya</h3><p>Internet check karke page refresh karein.</p><button class="btn-main ready" onclick="location.reload()">Refresh</button></div></div>`;
    }
  })();
})();
