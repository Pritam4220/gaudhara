(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const rupee = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { PLANS, STATUSES } = Shared;
  const view = $('#view'), tools = $('#toolActions');
  const POLL_MS = 15000;

  let cfg, me, orders = [], products = [], customers = [], riders = [];
  let tab = 'dashboard', orderFilter = '', orderQuery = '', productQuery = '', productCat = '', customerQuery = '';
  let knownOrderIds = new Set(), freshIds = new Set(), pollTimer, lastSig = '';

  /* ---------- API ---------- */
  async function api(path, { method, body } = {}) {
    const res = await fetch('/api' + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    const authCall = /^\/admin\/(login|forgot|reset|password|me)/.test(path);
    if (res.status === 401 && !authCall) { showAuth('login', { error: 'Your session has ended. Please sign in again.' }); throw new Error('Signed out'); }
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status });
    return data;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  const fmtDate = iso => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const isToday = iso => new Date(iso).toDateString() === new Date().toDateString();
  const pillCls = s => 'pill pill-' + s.replace(/\s/g, '-').toLowerCase();
  const stLabel = s => s === 'Pending' ? 'Awaiting verification' : s;
  const media = (p, cls, extra = '') => `<div class="${cls} ${p.img ? 'has-photo' : ''}" style="background:${p.bg || '#f1f3f6'}">${art(p)}${extra}</div>`;
  const catName = id => cfg.CATEGORIES.find(c => c.id === id)?.name || id;
  const live = o => !['Cancelled', 'Rejected'].includes(o.status);
  const waNumber = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

  /* ---------- Password field with show/hide eye ---------- */
  const EYE = '<svg class="icon-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>'
    + '<svg class="icon-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.84 0 8.27 3.06 9.94 6.65a1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"/><path d="m2 2 20 20"/></svg>';
  const passwordField = (id, name, label, autocomplete, minlength) => `<div class="field">
      <label for="${id}">${label}</label>
      <div class="password-wrap">
        <input id="${id}" name="${name}" type="password" required autocomplete="${autocomplete}" ${minlength ? `minlength="${minlength}"` : ''}>
        <button class="password-toggle" type="button" aria-controls="${id}" aria-label="Show password" aria-pressed="false" data-password-toggle>${EYE}</button>
      </div>
    </div>`;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-password-toggle]');
    if (!b) return;
    const input = document.getElementById(b.getAttribute('aria-controls'));
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', show);
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  /* ---------- Sign in / forgot / reset ---------- */
  const alerts = ({ error, notice }) => (error ? `<div class="alert alert-error" role="alert">${esc(error)}</div>` : '') + (notice ? `<div class="alert alert-success" role="status">${esc(notice)}</div>` : '');

  function showAuth(mode, opts = {}) {
    clearInterval(pollTimer);
    $('#appView').hidden = true;
    $('#authView').hidden = false;
    const card = $('#authCard');
    if (mode === 'forgot') {
      document.title = 'Forgot password — Gaudhara';
      card.innerHTML = opts.sent
        ? `<div class="login-card"><h1>Check your email</h1><p class="muted">If <b>${esc(opts.email)}</b> is a team account, we've sent a link to choose a new password. It works once and expires in 60 minutes.</p>
            <p class="login-center"><a href="#login">Back to sign in</a></p></div>`
        : `<form class="login-card" id="forgotForm" novalidate><h1>Forgot password</h1>
            <p class="muted">Enter your team email. We'll send you a link to choose a new password.</p>
            ${alerts(opts)}
            <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" required autocomplete="username" value="${esc(opts.email || '')}"></div>
            <button class="btn btn-primary btn-block">Send reset link</button>
            <p class="login-center"><a href="#login">Back to sign in</a></p></form>`;
      const f = $('#forgotForm');
      if (f) {
        f.elements.email.focus();
        f.onsubmit = async e => {
          e.preventDefault();
          const email = f.elements.email.value.trim();
          if (!f.checkValidity()) return showAuth('forgot', { error: 'Please enter a valid email address.', email });
          f.querySelector('button').disabled = true;
          try { await api('/admin/forgot', { body: { email } }); showAuth('forgot', { sent: true, email }); }
          catch (ex) { showAuth('forgot', { error: ex.message, email }); }
        };
      }
      return;
    }
    if (mode === 'reset') {
      document.title = 'Choose a new password — Gaudhara';
      card.innerHTML = '<div class="login-card"><div class="loading"><span class="spinner"></span>Checking link…</div></div>';
      api('/admin/reset/check', { body: { token: opts.token } }).then(({ email }) => {
        card.innerHTML = `<form class="login-card" id="resetForm" novalidate><h1>Choose a new password</h1>
          <p class="muted">For <b>${esc(email)}</b>. Use at least 8 characters.</p>
          <div id="resetErr"></div>
          ${passwordField('r-pass', 'password', 'New password', 'new-password', 8)}
          ${passwordField('r-confirm', 'confirm', 'Confirm new password', 'new-password', 8)}
          <button class="btn btn-primary btn-block">Save new password</button></form>`;
        $('#r-pass').focus();
        $('#resetForm').onsubmit = async e => {
          e.preventDefault();
          const f = e.target, pass = f.elements.password.value;
          const err = m => { $('#resetErr').innerHTML = alerts({ error: m }); };
          if (pass.length < 8) return err('Use at least 8 characters.');
          if (pass !== f.elements.confirm.value) return err('The two passwords don’t match.');
          try {
            await api('/admin/reset', { body: { token: opts.token, password: pass } });
            history.replaceState(null, '', '/login#login');
            showAuth('login', { notice: 'Your password has been changed. Sign in with the new password.', email });
          } catch (ex) { err(ex.message); }
        };
      }).catch(ex => {
        card.innerHTML = `<div class="login-card"><h1>Link not valid</h1><p class="muted">${esc(ex.message)} Reset links work once and expire after 60 minutes.</p>
          <a class="btn btn-primary btn-block" href="#forgot">Request a new link</a><p class="login-center"><a href="#login">Back to sign in</a></p></div>`;
      });
      return;
    }
    document.title = 'Team sign in — Gaudhara';
    card.innerHTML = `<form class="login-card" id="loginForm" novalidate>
        <h1>Team sign in</h1>
        <p class="muted">Verify orders, manage products, photos and stock.</p>
        ${alerts(opts)}
        <div class="field"><label for="login-email">Email</label><input id="login-email" name="email" type="email" required autocomplete="username" value="${esc(opts.email || '')}"></div>
        ${passwordField('login-password', 'password', 'Password', 'current-password')}
        <p class="login-forgot"><a href="#forgot">Forgot password?</a></p>
        <button class="btn btn-primary btn-block">Sign in</button>
      </form>`;
    const f = $('#loginForm');
    (opts.email ? f.elements.password : f.elements.email).focus();
    f.onsubmit = async e => {
      e.preventDefault();
      const email = f.elements.email.value.trim();
      if (!email || !f.elements.password.value) return showAuth('login', { error: 'Enter your email and password.', email });
      f.querySelector('.btn-primary').disabled = true;
      try {
        const r = await api('/admin/login', { body: { email, password: f.elements.password.value } });
        me = r.admin;
        if (!/^#(dashboard|orders|products|customers|settings)$/.test(location.hash)) history.replaceState(null, '', '/login#dashboard');
        start();
      } catch (ex) { showAuth('login', { error: ex.message, email }); }
    };
  }

  $('#signOut').onclick = async () => {
    await api('/admin/logout', { body: {} }).catch(() => {});
    history.replaceState(null, '', '/login#login');
    showAuth('login', { notice: 'You have signed out.' });
  };

  /* ---------- Data & live updates ---------- */
  const signature = () => orders.map(o => o.id + o.status + o.history.length).join('|') + '#' + customers.length;

  async function loadAll() {
    const [o, p, c, r] = await Promise.all([api('/admin/orders'), api('/admin/products'), api('/admin/customers'), api('/admin/riders')]);
    orders = o.orders; products = p.products; customers = c.customers; riders = r.riders;
    knownOrderIds = new Set(orders.map(x => x.id));
    lastSig = signature();
  }

  async function poll() {
    try {
      const [o, c] = await Promise.all([api('/admin/orders'), api('/admin/customers')]);
      orders = o.orders; customers = c.customers;
      const incoming = orders.filter(x => !knownOrderIds.has(x.id));
      incoming.forEach(x => { knownOrderIds.add(x.id); freshIds.add(x.id); });
      if (incoming.length) { toast(`🔔 ${incoming.length} new order${incoming.length > 1 ? 's' : ''} received`); beep(); }
      $('#syncInfo').classList.remove('off');
      $('#syncInfo').textContent = 'Live · updated ' + new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      const sig = signature();
      if (sig !== lastSig) {
        lastSig = sig;
        renderNav();
        if (tab === 'dashboard') renderDashboard();
        else if (tab === 'orders') renderOrderList();
        else if (tab === 'customers') renderCustomerList();
      }
    } catch {
      $('#syncInfo').classList.add('off');
      $('#syncInfo').textContent = 'Offline — retrying';
    }
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach(t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.15, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
      });
    } catch { /* sound not available */ }
  }

  async function start() {
    $('#authView').hidden = true;
    $('#appView').hidden = false;
    $('#who').textContent = me.email;
    view.innerHTML = '<div class="loading"><span class="spinner"></span>Loading…</div>';
    try {
      cfg = cfg || await api('/config');
      await loadAll();
    } catch (ex) { view.innerHTML = `<p class="notice">${esc(ex.message)}</p>`; return; }
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, POLL_MS);
    route();
  }

  /* ---------- Navigation ---------- */
  const TABS = { dashboard: 'Dashboard', orders: 'Orders', products: 'Products & stock', customers: 'Customers', settings: 'Settings' };
  function renderNav() {
    const pending = orders.filter(o => o.status === 'Pending').length;
    const oos = products.filter(p => !p.inStock).length;
    $('#nav').innerHTML = Object.entries(TABS).map(([k, l]) => `<a href="#${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}${
      k === 'orders' && pending ? ` <span class="count">${pending}</span>` : k === 'products' && oos ? ` <span class="count red">${oos} out</span>` : ''}</a>`).join('');
    document.title = (pending ? `(${pending}) ` : '') + `Admin — ${TABS[tab]}`;
  }

  function route() {
    const h = location.hash.slice(1);
    if (h.startsWith('reset=')) return showAuth('reset', { token: h.slice(6) });
    if (h === 'forgot' || h === 'login') { tab = 'dashboard'; history.replaceState(null, '', '/login#dashboard'); }
    else tab = TABS[h] ? h : 'dashboard';
    $('#pageTitle').textContent = TABS[tab];
    renderNav();
    tools.innerHTML = '';
    ({ dashboard: renderDashboard, orders: renderOrders, products: renderProducts, customers: renderCustomers, settings: renderSettings })[tab]();
  }
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (!$('#authView').hidden) {
      if (h.startsWith('reset=')) showAuth('reset', { token: h.slice(6) });
      else showAuth(h === 'forgot' ? 'forgot' : 'login');
    } else route();
  });

  /* ---------- Orders ---------- */
  const NEXT = {
    Pending: [['Confirmed', '✓ Verify & confirm', 'btn-green'], ['Rejected', 'Reject', 'btn-danger']],
    Confirmed: [['Out for delivery', '🚚 Out for delivery', 'btn-blue'], ['Cancelled', 'Cancel', 'btn-danger']],
    'Out for delivery': [['Delivered', '✓ Mark delivered', 'btn-green'], ['Cancelled', 'Cancel', 'btn-danger']],
    Delivered: [], Cancelled: [['Pending', 'Reopen', '']], Rejected: [['Pending', 'Reopen', '']],
  };

  /* ---------- Delivery location & delivery boys ---------- */
  const addrText = a => [a.line1, a.line2, a.city].filter(Boolean).join(', ') + (a.pin ? ' – ' + a.pin : '');
  const mapsLink = a => a.lat != null ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrText(a))}`;
  const dirLink = a => `https://www.google.com/maps/dir/?api=1&destination=${a.lat != null ? `${a.lat},${a.lng}` : encodeURIComponent(addrText(a))}`;
  const PIN_SVG = '<svg viewBox="0 0 24 24" width="34" height="34" fill="#fff" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>';
  // OpenStreetMap tiles drawn around the customer's pin (no map library needed).
  function staticMap(lat, lng, zoom = 16) {
    const size = 256 * 2 ** zoom, r = lat * Math.PI / 180;
    const x = (lng + 180) / 360 * size, y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * size;
    const tx = Math.floor(x / 256), ty = Math.floor(y / 256), max = 2 ** zoom;
    let tiles = '';
    for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) {
      tiles += `<img src="https://tile.openstreetmap.org/${zoom}/${(tx + dx + max) % max}/${ty + dy}.png" alt="" style="left:calc(50% + ${Math.round((tx + dx) * 256 - x)}px);top:calc(50% + ${Math.round((ty + dy) * 256 - y)}px)">`;
    }
    return `<div class="osm">${tiles}<span class="osm-pin">${PIN_SVG}</span><span class="osm-credit">© OpenStreetMap</span></div>`;
  }
  function riderMessage(o) {
    const a = o.address;
    return [
      `🛵 ${cfg.STORE.name} delivery — Order ${o.id}`,
      '',
      `👤 ${a.name} — ${a.phone}`,
      `🏠 ${addrText(a)}`,
      `📍 Location: ${mapsLink(a)}`,
      '',
      `🥛 ${o.items.map(i => `${i.name} (${i.size}) × ${i.qty}`).join(', ')}`,
      `💰 Collect: ${rupee(o.totals.total)} (${o.pay})`,
      `🕒 Slot: ${o.slot}`,
    ].join('\n');
  }
  const riderLink = (o, r) => `https://wa.me/${r ? waNumber(r.phone) : ''}?text=${encodeURIComponent(riderMessage(o))}`;

  function locationBox(o) {
    const a = o.address, open = !['Delivered', 'Cancelled', 'Rejected'].includes(o.status);
    const chosen = riders.find(r => r.id === o.rider?.id) || riders[0];
    return `<div class="loc-box">
      ${a.lat != null
        ? `<a class="o-map-lg" href="${mapsLink(a)}" target="_blank" rel="noopener" title="Open in Google Maps">${staticMap(a.lat, a.lng)}</a>`
        : '<div class="no-map">📍 No map pin for this order (placed before map pins). Use the buttons to find the address.</div>'}
      <div class="loc-side">
        <p class="loc-addr"><b>${esc(addrText(a))}</b>${a.lat != null ? '<span class="pill pill-delivered">Exact pin</span>' : ''}</p>
        <div class="actions">
          <a class="btn" href="${mapsLink(a)}" target="_blank" rel="noopener">📍 Open in Google Maps</a>
          <a class="btn" href="${dirLink(a)}" target="_blank" rel="noopener">🧭 Directions</a>
        </div>
        ${open ? (riders.length
          ? `<div class="rider-row"><select data-rider-select="${o.id}" aria-label="Delivery boy">${riders.map(r => `<option value="${r.id}" ${r.id === chosen.id ? 'selected' : ''}>${esc(r.name)} · ${esc(r.phone)}</option>`).join('')}</select>
              <a class="btn btn-wa" data-rider-send="${o.id}" data-rider="${chosen.id}" href="${riderLink(o, chosen)}" target="_blank" rel="noopener">🛵 Send to delivery boy</a></div>`
          : `<div class="rider-row"><a class="btn btn-wa" href="${riderLink(o, null)}" target="_blank" rel="noopener">🛵 Share with delivery boy</a><span class="hint">Save your delivery boys in <a href="#settings">Settings</a> for one-tap sending.</span></div>`) : ''}
        ${o.rider ? `<p class="meta">🛵 Sent to <b>${esc(o.rider.name)}</b> (${esc(o.rider.phone)}) · ${fmtDate(o.rider.at)}</p>` : ''}
      </div>
    </div>`;
  }

  function waMessage(o) {
    const first = o.address.name.split(' ')[0];
    const amount = rupee(o.totals.total);
    const msg = {
      Pending: `Hello ${first}, this is ${cfg.STORE.name}. We received your order ${o.id} (${amount}). We'll confirm it shortly.`,
      Confirmed: `Hello ${first}, your ${cfg.STORE.name} order ${o.id} is confirmed ✅ It will be delivered ${o.slot}. Amount: ${amount} (${o.pay}).`,
      'Out for delivery': `Hello ${first}, your ${cfg.STORE.name} order ${o.id} is out for delivery 🚚 Please keep ${amount} ready (${o.pay}).`,
      Delivered: `Hello ${first}, your ${cfg.STORE.name} order ${o.id} has been delivered. Thank you for shopping with us! 🥛`,
      Cancelled: `Hello ${first}, your ${cfg.STORE.name} order ${o.id} has been cancelled.${o.note ? ' Reason: ' + o.note : ''}`,
      Rejected: `Hello ${first}, sorry — we couldn't accept your ${cfg.STORE.name} order ${o.id}.${o.note ? ' Reason: ' + o.note : ''}`,
    }[o.status];
    return `https://wa.me/${waNumber(o.address.phone)}?text=${encodeURIComponent(msg)}`;
  }

  function orderCard(o) {
    const a = o.address;
    const thumb = i => media(products.find(x => x.id === i.id) || { name: i.name, img: i.img, art: 'bottle' }, 'thumb');
    return `<article class="card ${freshIds.has(o.id) ? 'fresh' : ''}" data-oid="${o.id}">
      <div class="card-head">
        <div class="card-title"><h2>${esc(a.name)}<span class="oid">${o.id}</span></h2>
          <p class="meta">${fmtDate(o.date)} · ${o.items.reduce((n, i) => n + i.qty, 0)} item${o.items.length > 1 || o.items[0].qty > 1 ? 's' : ''}</p></div>
        <span class="${pillCls(o.status)}">${stLabel(o.status)}</span>
      </div>
      <dl class="fields">
        <div><dt>Phone</dt><dd><a href="tel:${esc(a.phone)}">${esc(a.phone)}</a></dd></div>
        <div><dt>Delivery slot</dt><dd>${esc(o.slot)}</dd></div>
        <div><dt>Collect</dt><dd><b>${rupee(o.totals.total)}</b> · ${esc(o.pay)}</dd></div>
      </dl>
      ${locationBox(o)}
      <ul class="items">
        ${o.items.map(i => `<li>${thumb(i)}<span>${esc(i.name)} <span class="muted">(${esc(i.size)}) × ${i.qty}</span>${i.plan !== 'once' ? `<span class="sub-tag">${PLANS[i.plan]}</span>` : ''}</span><span>${rupee(i.price * i.qty)}</span></li>`).join('')}
        <li class="totals"><span>Items ${rupee(o.totals.price)}</span>${o.totals.couponOff ? `<span>Coupon ${esc(o.coupon)} −${rupee(o.totals.couponOff)}</span>` : ''}<span>Delivery ${o.totals.delivery ? rupee(o.totals.delivery) : 'FREE'}</span><span>Total <b>${rupee(o.totals.total)}</b></span></li>
      </ul>
      ${o.note ? `<p class="meta" style="margin:-4px 0 12px">Note: ${esc(o.note)}</p>` : ''}
      <div class="actions">
        ${NEXT[o.status].map(([s, l, c]) => `<button class="btn ${c}" data-set-status="${s}" data-id="${o.id}">${l}</button>`).join('')}
        ${['Delivered', 'Cancelled', 'Rejected'].includes(o.status) ? `<button class="btn btn-danger" data-del-order="${o.id}" type="button">🗑 Delete order</button>` : ''}
        <span class="spacer"></span>
        <a class="btn" href="tel:${esc(a.phone)}">📞 Call</a>
        <a class="btn btn-wa" href="${waMessage(o)}" target="_blank" rel="noopener">WhatsApp</a>
      </div>
      <details class="history"><summary>History (${o.history.length})</summary><ul>
        ${o.history.map(h => `<li><b>${stLabel(h.status)}</b> · ${fmtDate(h.at)} · by ${esc(h.by)}${h.note ? ' — ' + esc(h.note) : ''}</li>`).join('')}
      </ul></details>
    </article>`;
  }

  function renderOrders() {
    tools.innerHTML = `<input type="search" id="orderSearch" placeholder="Search name, phone, order ID…" value="${esc(orderQuery)}" aria-label="Search orders">
      <label>Status <select id="orderStatus"><option value="">All</option>${STATUSES.map(s => `<option value="${s}" ${s === orderFilter ? 'selected' : ''}>${stLabel(s)}</option>`).join('')}</select></label>
      <button class="btn" id="exportOrders" type="button">Export CSV</button>`;
    $('#orderSearch').oninput = e => { orderQuery = e.target.value; renderOrderList(); };
    $('#orderStatus').onchange = e => { orderFilter = e.target.value; renderOrderList(); };
    $('#exportOrders').onclick = exportOrders;
    view.innerHTML = '<div id="orderList"></div>';
    renderOrderList();
  }

  const filteredOrders = () => {
    const q = orderQuery.toLowerCase().trim();
    return orders.filter(o => (!orderFilter || o.status === orderFilter) &&
      (!q || [o.id, o.address.name, o.address.phone, o.address.city, o.address.pin].join(' ').toLowerCase().includes(q)));
  };

  function renderOrderList() {
    const box = $('#orderList');
    if (!box) return;
    const open = new Set($$('details.history[open]', box).map(d => d.closest('[data-oid]').dataset.oid));
    const list = filteredOrders();
    box.innerHTML = list.length ? list.map(orderCard).join('')
      : `<div class="card"><p class="empty">${orders.length ? 'No orders match.' : 'No orders yet. New orders appear here automatically.'}</p></div>`;
    open.forEach(id => { const d = $(`[data-oid="${id}"] details.history`, box); if (d) d.open = true; });
    setTimeout(() => freshIds.clear(), 3000);
  }

  async function setStatus(id, status) {
    let note;
    if (status === 'Rejected' || status === 'Cancelled') {
      note = prompt(`Reason for ${status === 'Rejected' ? 'rejecting' : 'cancelling'} this order (the customer will see it):`, status === 'Rejected' ? 'Delivery not available in your area' : '');
      if (note === null) return;
    }
    try {
      const { order } = await api('/admin/orders/' + id, { method: 'PATCH', body: { status, note } });
      orders = orders.map(o => o.id === id ? order : o);
      lastSig = signature();
      toast(`Order ${id}: ${stLabel(status)}`);
      renderNav();
      if (tab === 'orders') renderOrderList(); else if (tab === 'dashboard') renderDashboard();
    } catch (ex) { toast(ex.message); }
  }

  // Spreadsheet-safe CSV: quote everything and stop formulas from running in Excel.
  function downloadCsv(name, rows) {
    const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportOrders() {
    const list = filteredOrders();
    if (!list.length) return toast('No orders to export');
    downloadCsv('gaudhara-orders', [
      ['Order ID', 'Date', 'Status', 'Customer', 'Phone', 'Address', 'City', 'Pincode', 'Delivery slot', 'Payment', 'Items', 'Items total', 'Coupon', 'Discount', 'Delivery', 'Total'],
      ...list.map(o => [o.id, fmtDate(o.date), stLabel(o.status), o.address.name, o.address.phone, [o.address.line1, o.address.line2].filter(Boolean).join(', '),
        o.address.city, o.address.pin, o.slot, o.pay, o.items.map(i => `${i.name} (${i.size}) x${i.qty}${i.plan !== 'once' ? ' ' + PLANS[i.plan] : ''}`).join('; '),
        o.totals.price, o.coupon, o.totals.couponOff, o.totals.delivery, o.totals.total]),
    ]);
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    const today = orders.filter(o => isToday(o.date));
    const pending = orders.filter(o => o.status === 'Pending');
    const toDeliver = orders.filter(o => ['Confirmed', 'Out for delivery'].includes(o.status));
    const oos = products.filter(p => !p.inStock);
    const v = me.verify || {};
    view.innerHTML = `
      ${!v.required || v.waSend || v.waReceive || v.sms ? '' : '<p class="notice"><b>Customer sign-up is paused.</b> New customers cannot create an account until WhatsApp OTP or SMS OTP is connected in <code>.env</code> (see README → “Connect WhatsApp”). Existing customers can still log in and order.</p>'}
      ${me.mail ? '' : '<p class="notice info">Email alerts are off. Add the Gmail App Password in <code>.env</code> (SMTP_PASS) to get new-order emails and “Forgot password?” links. <a href="#settings">How to set it up</a></p>'}
      <div class="stats">
        <a class="stat warn" href="#orders" data-filter="Pending"><span>Awaiting verification</span><b>${pending.length}</b></a>
        <a class="stat" href="#orders" data-filter="Confirmed"><span>To deliver</span><b>${toDeliver.length}</b></a>
        <div class="stat"><span>Today's orders</span><b>${today.length}</b></div>
        <div class="stat"><span>Today's sales</span><b>${rupee(today.filter(live).reduce((s, o) => s + o.totals.total, 0))}</b></div>
        <a class="stat" href="#customers"><span>Customers</span><b>${customers.length}</b></a>
        <a class="stat ${oos.length ? 'bad' : ''}" href="#products"><span>Out of stock</span><b>${oos.length}</b></a>
      </div>
      <div class="dash">
        <section><h2 class="section-title">Awaiting verification <a href="#orders" data-filter="Pending">View all →</a></h2>
          ${pending.length ? pending.slice(0, 5).map(orderCard).join('') : '<div class="card"><p class="empty">All caught up — no orders waiting.</p></div>'}</section>
        <section><h2 class="section-title">Stock <a href="#products">Manage →</a></h2>
          <div class="card stock-list" style="padding:0">${products.map(p => `<div class="stock-row">${media(p, 'thumb')}<span>${esc(p.name)}</span>
            <label class="switch" title="${p.inStock ? 'In stock' : 'Out of stock'}"><input type="checkbox" data-stock="${p.id}" ${p.inStock ? 'checked' : ''} aria-label="${esc(p.name)} in stock"></label></div>`).join('')}</div></section>
      </div>`;
  }

  /* ---------- Products ---------- */
  function renderProducts() {
    tools.innerHTML = `<input type="search" id="pSearch" placeholder="Search products…" value="${esc(productQuery)}" aria-label="Search products">
      <label>Category <select id="pCat"><option value="">All</option>${cfg.CATEGORIES.map(c => `<option value="${c.id}" ${c.id === productCat ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
      <button class="btn btn-primary" id="addProduct" type="button">+ Add product</button>`;
    $('#pSearch').oninput = e => { productQuery = e.target.value; renderProductGrid(); };
    $('#pCat').onchange = e => { productCat = e.target.value; renderProductGrid(); };
    $('#addProduct').onclick = () => openProduct(null);
    view.innerHTML = '<p class="hint" style="margin:-6px 0 14px">Switch a product off when it runs out — customers will see “Out of stock” and can’t order it. Use 📷 to upload your own photos.</p><div class="p-grid" id="pGrid"></div>';
    renderProductGrid();
  }
  function renderProductGrid() {
    const grid = $('#pGrid');
    if (!grid) return;
    const q = productQuery.toLowerCase().trim();
    const list = products.filter(p => (!productCat || p.cat === productCat) && (!q || p.name.toLowerCase().includes(q)));
    grid.innerHTML = list.length ? list.map(p => `<article class="card p-card ${p.inStock ? '' : 'oos'}">
        ${media(p, 'p-photo', `<button class="photo-btn" data-photo="${p.id}" type="button">📷 ${p.img ? 'Change photo' : 'Add photo'}</button>`)}
        <div class="p-info"><h2>${esc(p.name)}</h2>
          <span class="meta">${esc(catName(p.cat))} · ${esc(p.type)}${p.subscribable ? ' · Subscription' : ''}</span>
          <span class="prices">${p.variants.map(v => `${esc(v.size)} <b>${rupee(v.price)}</b>`).join(' · ')}</span></div>
        <div class="p-foot">
          <label class="switch"><input type="checkbox" data-stock="${p.id}" ${p.inStock ? 'checked' : ''}><span class="${p.inStock ? 'on-t' : 'off-t'}">${p.inStock ? 'In stock' : 'Out of stock'}</span></label>
          <button class="btn" data-edit="${p.id}" type="button">Edit</button>
        </div>
      </article>`).join('') : '<div class="card"><p class="empty">No products found.</p></div>';
  }

  async function setStock(id, inStock, input) {
    try {
      const { product } = await api(`/admin/products/${id}/stock`, { method: 'PATCH', body: { inStock } });
      products = products.map(p => p.id === id ? product : p);
      toast(`${product.name} is now ${inStock ? 'in stock' : 'out of stock'}`);
      renderNav();
      if (tab === 'products') renderProductGrid(); else if (tab === 'dashboard') renderDashboard();
    } catch (ex) { input.checked = !inStock; toast(ex.message); }
  }

  // Resize in the browser so uploads stay small and fast.
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Please choose a JPG, PNG or WebP photo.'));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 1000 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo.')); };
      img.src = url;
    });
  }
  async function uploadPhoto(id, file) {
    const { product } = await api(`/admin/products/${id}/image`, { body: { image: await readImage(file) } });
    products = products.map(p => p.id === id ? product : p);
    return product;
  }

  let photoTarget = null;
  $('#quickPhoto').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !photoTarget) return;
    toast('Uploading photo…');
    try { const p = await uploadPhoto(photoTarget, file); toast(`Photo updated for ${p.name}`); renderProductGrid(); }
    catch (ex) { toast(ex.message); }
  };

  const dlg = $('#productDialog');
  function openProduct(id) {
    const p = id ? products.find(x => x.id === id) : { name: '', cat: productCat || cfg.CATEGORIES[0].id, type: 'Cow', tag: '', desc: '', highlights: [], variants: [{ size: '', price: '', mrp: '' }], subscribable: false, inStock: true };
    let pendingImage = null;
    const vRow = v => `<div class="v-row"><input name="size" placeholder="e.g. 500 ml" value="${esc(v.size)}" maxlength="20" aria-label="Size"><input name="price" type="number" min="1" placeholder="Price" value="${esc(v.price)}" aria-label="Selling price"><input name="mrp" type="number" min="1" placeholder="MRP" value="${esc(v.mrp)}" aria-label="MRP"><button type="button" class="rm" data-rm aria-label="Remove size">×</button></div>`;
    dlg.innerHTML = `<form id="pForm" novalidate>
      <div class="pd-head"><h2 id="pdTitle">${id ? 'Edit product' : 'Add product'}</h2><button type="button" class="x" data-close aria-label="Close">×</button></div>
      <div class="pd-body">
        <div class="pd-photo">
          <div id="pPrev">${media(p, 'prev')}</div>
          <label class="btn">📷 Upload photo<input type="file" id="pFile" accept="image/jpeg,image/png,image/webp" hidden></label>
          ${p.img ? '<button type="button" class="link" id="pRemovePhoto" style="color:var(--danger);font-size:13px">Remove photo</button>' : ''}
          <span class="hint">JPG, PNG or WebP. A square photo on a clean background looks best.</span>
        </div>
        <div class="pd-fields">
          <div class="field full"><label for="pd-name">Product name</label><input id="pd-name" name="name" required maxlength="80" value="${esc(p.name)}"></div>
          <div class="field"><label for="pd-cat">Category</label><select id="pd-cat" name="cat">${cfg.CATEGORIES.map(c => `<option value="${c.id}" ${c.id === p.cat ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
          <div class="field"><label for="pd-type">Milk source</label><select id="pd-type" name="type">${['Cow', 'Buffalo', 'Other'].map(t => `<option ${t === p.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label for="pd-tag">Badge</label><select id="pd-tag" name="tag">${['', 'Best Seller', 'Premium', 'New', 'High Fat', 'Protein Rich', 'Fresh'].map(t => `<option value="${t}" ${t === p.tag ? 'selected' : ''}>${t || 'None'}</option>`).join('')}</select></div>
          <div class="field"><span>Options</span><div class="checks">
            <label><input type="checkbox" name="inStock" ${p.inStock ? 'checked' : ''}> In stock</label>
            <label><input type="checkbox" name="subscribable" ${p.subscribable ? 'checked' : ''}> Subscription</label></div></div>
          <div class="field full"><span>Sizes &amp; prices (₹)</span>
            <div class="v-head"><span>Size</span><span>Selling price</span><span>MRP</span><span></span></div>
            <div class="variants" id="variants">${p.variants.map(vRow).join('')}</div>
            <button type="button" class="link" id="addVariant" style="align-self:flex-start;font-size:13px">+ Add size</button></div>
          <div class="field full"><label for="pd-desc">Description</label><textarea id="pd-desc" name="desc" maxlength="1000" rows="3">${esc(p.desc)}</textarea></div>
          <div class="field full"><label for="pd-hl">Highlights (one per line)</label><textarea id="pd-hl" name="highlights" rows="3">${esc((p.highlights || []).join('\n'))}</textarea></div>
          <p class="err full" id="pErr" role="alert"></p>
        </div>
      </div>
      <div class="pd-foot">
        ${id ? '<button type="button" class="btn btn-danger left" id="pDelete">Delete product</button>' : ''}
        <button type="button" class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" id="pSave">${id ? 'Save changes' : 'Add product'}</button>
      </div>
    </form>`;
    dlg.showModal();

    const form = $('#pForm');
    form.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) dlg.close();
      if (e.target.closest('[data-rm]')) {
        if ($$('#variants .v-row').length > 1) e.target.closest('.v-row').remove();
        else toast('A product needs at least one size');
      }
    });
    $('#addVariant').onclick = () => { if ($$('#variants .v-row').length < 6) $('#variants').insertAdjacentHTML('beforeend', vRow({ size: '', price: '', mrp: '' })); };
    $('#pFile').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await readImage(file);
        pendingImage = file;
        $('#pPrev').innerHTML = `<div class="prev has-photo"><img src="${url}" alt=""></div>`;
      } catch (ex) { $('#pErr').textContent = ex.message; }
    };
    if ($('#pRemovePhoto')) $('#pRemovePhoto').onclick = async () => {
      if (!confirm('Remove this photo? The built-in illustration will be shown instead.')) return;
      try {
        const { product } = await api(`/admin/products/${id}/image`, { method: 'DELETE' });
        products = products.map(x => x.id === id ? product : x);
        toast('Photo removed'); dlg.close(); renderProductGrid();
      } catch (ex) { $('#pErr').textContent = ex.message; }
    };
    if ($('#pDelete')) $('#pDelete').onclick = async () => {
      if (!confirm(`Delete "${p.name}"? It will be removed from the store. Past orders are kept.`)) return;
      try {
        await api('/admin/products/' + id, { method: 'DELETE' });
        products = products.filter(x => x.id !== id);
        toast('Product deleted'); dlg.close(); renderNav(); renderProductGrid();
      } catch (ex) { $('#pErr').textContent = ex.message; }
    };
    form.onsubmit = async e => {
      e.preventDefault();
      const f = e.target, btn = $('#pSave');
      $('#pErr').textContent = '';
      const body = {
        name: f.elements.name.value, cat: f.elements.cat.value, type: f.elements.type.value, tag: f.elements.tag.value,
        desc: f.elements.desc.value, highlights: f.elements.highlights.value.split('\n'),
        inStock: f.elements.inStock.checked, subscribable: f.elements.subscribable.checked,
        variants: $$('#variants .v-row').map(r => ({ size: $('[name=size]', r).value, price: $('[name=price]', r).value, mrp: $('[name=mrp]', r).value || $('[name=price]', r).value })),
      };
      btn.disabled = true;
      try {
        let { product } = await api(id ? '/admin/products/' + id : '/admin/products', { method: id ? 'PUT' : 'POST', body });
        products = id ? products.map(x => x.id === id ? product : x) : [...products, product];
        if (pendingImage) product = await uploadPhoto(product.id, pendingImage);
        toast(id ? 'Product saved' : `${product.name} added to the store`);
        dlg.close();
        renderNav();
        renderProductGrid();
      } catch (ex) { $('#pErr').textContent = ex.message; } finally { btn.disabled = false; }
    };
  }

  /* ---------- Customers ---------- */
  function renderCustomers() {
    tools.innerHTML = `<input type="search" id="cSearch" placeholder="Search name, phone, city…" value="${esc(customerQuery)}" aria-label="Search customers">
      <button class="btn" id="exportCustomers" type="button">Export CSV</button>`;
    $('#cSearch').oninput = e => { customerQuery = e.target.value; renderCustomerList(); };
    $('#exportCustomers').onclick = () => customers.length ? downloadCsv('gaudhara-customers', [['Name', 'Mobile', 'City', 'Joined', 'Orders', 'Total spent'],
      ...customers.map(c => [c.name, c.phone, c.city, new Date(c.created).toLocaleDateString('en-IN'), c.orders, c.spent])]) : toast('No customers yet');
    view.innerHTML = '<div id="cList"></div>';
    renderCustomerList();
  }
  function renderCustomerList() {
    const box = $('#cList');
    if (!box) return;
    const q = customerQuery.toLowerCase().trim();
    const list = customers.filter(c => !q || [c.name, c.phone, c.city].join(' ').toLowerCase().includes(q));
    box.innerHTML = list.length ? `<div class="card table-card"><table class="t">
      <thead><tr><th>Customer</th><th>Mobile</th><th>City</th><th>Joined</th><th class="num">Orders</th><th class="num">Total spent</th><th></th></tr></thead><tbody>
      ${list.map(c => `<tr><td><span class="cust">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : `<i>${esc(c.name.charAt(0).toUpperCase())}</i>`}<b>${esc(c.name)}</b>${c.verified ? ' <span class="pill pill-delivered" title="Mobile number verified by OTP">✓ Verified</span>' : ''}</span></td><td><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></td><td>${esc(c.city) || '—'}</td>
        <td class="muted">${new Date(c.created).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
        <td class="num">${c.orders}</td><td class="num"><b>${rupee(c.spent)}</b></td>
        <td class="num"><span class="row-btns"><a class="btn btn-wa" href="https://wa.me/${waNumber(c.phone)}" target="_blank" rel="noopener">WhatsApp</a><button class="btn" data-reset-pw="${c.id}" data-name="${esc(c.name)}" type="button">Reset password</button><button class="btn btn-danger" data-del-cust="${c.id}" data-name="${esc(c.name)}" type="button">Delete</button></span></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="card"><p class="empty">${customers.length ? 'No customers match.' : 'No customers have signed up yet.'}</p></div>`;
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    view.innerHTML = `<div class="settings">
      <section class="card"><h2>Your account</h2><p class="muted">Signed in as <b>${esc(me.email)}</b></p>
        <form id="pwForm" novalidate>
          ${passwordField('s-current', 'current', 'Current password', 'current-password')}
          ${passwordField('s-next', 'next', 'New password', 'new-password', 8)}
          ${passwordField('s-confirm', 'confirm', 'Confirm new password', 'new-password', 8)}
          <div id="pwMsg"></div>
          <button class="btn btn-primary">Update password</button>
        </form></section>
      <section class="card"><h2>Email</h2>
        <p class="muted">New-order alerts and “Forgot password?” links are sent to <b>${esc(me.notifyTo)}</b>.</p>
        <div class="status-line">${me.mail ? '<span class="pill pill-delivered">On</span> Email is set up' : '<span class="pill pill-rejected">Off</span> Gmail App Password not added yet'}</div>
        ${me.mail ? '<button class="btn" id="testEmail" type="button">Send a test email</button>' : `<ol>
          <li>Sign in to Google as <b>${esc(me.email)}</b>.</li>
          <li>Google Account → Security → turn on <b>2-Step Verification</b>.</li>
          <li>Open <b>App passwords</b>, create one named “Gaudhara”, copy the 16 letters.</li>
          <li>Paste it in <code>C:\\Gaudhara\\.env</code> after <code>SMTP_PASS=</code> and save.</li>
          <li>Restart the server (close it, then run <code>npm start</code>).</li></ol>`}
        <div id="mailMsg" style="margin-top:12px"></div></section>
      <section class="card"><h2>Delivery boys</h2><p class="muted">Save them once. Each order then has a “Send to delivery boy” button that sends the address, exact map location and amount on WhatsApp.</p>
        <ul class="rider-list" id="riderList"></ul>
        <form id="riderForm" class="rider-form" novalidate>
          <input name="name" maxlength="40" placeholder="Name, e.g. Ramesh" aria-label="Delivery boy name">
          <input name="phone" inputmode="numeric" maxlength="13" placeholder="10-digit mobile number" aria-label="Delivery boy mobile number">
          <button class="btn btn-primary">Add</button>
        </form></section>
      <section class="card"><h2>Store details</h2>
        <p class="muted">${esc(cfg.STORE.name)} · ${esc(cfg.STORE.phone)} · ${esc(cfg.STORE.email)}<br>${esc(cfg.STORE.address)}<br>
        Free delivery above ${rupee(cfg.STORE.freeDeliveryAbove)}, otherwise ${rupee(cfg.STORE.deliveryFee)} · Coupons: ${Object.keys(cfg.COUPONS).map(c => `<code>${c}</code>`).join(' ')}</p>
        <p class="hint">To change these, edit <code>server/config.js</code> and restart the server.</p></section>
    </div>`;
    const drawRiders = () => {
      $('#riderList').innerHTML = riders.length ? riders.map(r => `<li><span>🛵 <b>${esc(r.name)}</b> · ${esc(r.phone)}</span><button class="btn btn-danger" data-del-rider="${r.id}" type="button">Remove</button></li>`).join('')
        : '<li class="muted">No delivery boys saved yet.</li>';
    };
    drawRiders();
    $('#riderForm').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try { riders = (await api('/admin/riders', { body: { name: f.elements.name.value, phone: f.elements.phone.value } })).riders; f.reset(); drawRiders(); toast('Delivery boy added'); }
      catch (ex) { toast(ex.message); }
    };
    $('#riderList').onclick = async e => {
      const b = e.target.closest('[data-del-rider]');
      if (!b || !confirm('Remove this delivery boy?')) return;
      try { riders = (await api('/admin/riders/' + b.dataset.delRider, { method: 'DELETE' })).riders; drawRiders(); } catch (ex) { toast(ex.message); }
    };
    $('#pwForm').onsubmit = async e => {
      e.preventDefault();
      const f = e.target, msg = $('#pwMsg');
      const show = (m, ok) => { msg.innerHTML = alerts(ok ? { notice: m } : { error: m }); };
      if (f.elements.next.value.length < 8) return show('New password must be at least 8 characters.');
      if (f.elements.next.value !== f.elements.confirm.value) return show('The two new passwords don’t match.');
      try {
        await api('/admin/password', { body: { current: f.elements.current.value, next: f.elements.next.value } });
        f.reset(); show('Password updated.', true);
      } catch (ex) { show(ex.message); }
    };
    if ($('#testEmail')) $('#testEmail').onclick = async e => {
      e.target.disabled = true;
      try { const r = await api('/admin/test-email', { body: {} }); $('#mailMsg').innerHTML = alerts({ notice: `Test email sent to ${r.to}. Check the inbox (and spam folder).` }); }
      catch (ex) { $('#mailMsg').innerHTML = alerts({ error: ex.message }); }
      e.target.disabled = false;
    };
  }

  /* ---------- Global events ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-set-status], [data-edit], [data-photo], [data-filter]');
    if (!t) return;
    const d = t.dataset;
    if (d.filter) orderFilter = d.filter; // the link then opens #orders
    else if (d.setStatus) setStatus(d.id, d.setStatus);
    else if (d.edit) openProduct(d.edit);
    else if (d.photo) { photoTarget = d.photo; $('#quickPhoto').click(); }
  });
  // Customer forgot their password and called the shop: set a new one for them.
  document.addEventListener('click', async e => {
    const r = e.target.closest('[data-reset-pw]'), del = e.target.closest('[data-del-cust]');
    if (r) {
      const pass = prompt(`New password for ${r.dataset.name} (at least 6 characters). Tell it to the customer on the phone:`);
      if (pass === null) return;
      if (pass.trim().length < 6) return toast('Password must be at least 6 characters.');
      try { await api(`/admin/customers/${r.dataset.resetPw}/password`, { body: { password: pass.trim() } }); toast(`Password changed for ${r.dataset.name}. They can log in with it now.`); }
      catch (ex) { toast(ex.message); }
    } else if (del) {
      if (!confirm(`Delete the account of ${del.dataset.name}? They will not be able to log in. Their past orders stay in Orders.`)) return;
      try { await api('/admin/customers/' + del.dataset.delCust, { method: 'DELETE' }); customers = customers.filter(c => c.id !== del.dataset.delCust); renderCustomerList(); toast('Customer deleted'); }
      catch (ex) { toast(ex.message); }
    }
  });
  document.addEventListener('change', e => {
    const sel = e.target.closest('[data-rider-select]');
    if (sel) {
      const o = orders.find(x => x.id === sel.dataset.riderSelect), r = riders.find(x => x.id === sel.value);
      const a = document.querySelector(`[data-rider-send="${o.id}"]`);
      if (a && r) { a.href = riderLink(o, r); a.dataset.rider = r.id; }
    }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-del-order]');
    if (!b) return;
    const id = b.dataset.delOrder;
    if (!confirm(`Delete order ${id} permanently?\n\nIt will disappear from Orders and from the customer's "My Orders". This cannot be undone.\nTip: use "Export CSV" first if you want to keep a record.`)) return;
    b.disabled = true;
    try {
      await api('/admin/orders/' + id, { method: 'DELETE' });
      orders = orders.filter(o => o.id !== id);
      lastSig = signature();
      renderNav();
      if (tab === 'orders') renderOrderList(); else if (tab === 'dashboard') renderDashboard();
      toast(`Order ${id} deleted`);
    } catch (ex) { toast(ex.message); b.disabled = false; }
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-rider-send]');
    if (!a) return; // the link itself opens WhatsApp; here we just remember who got the order
    api(`/admin/orders/${a.dataset.riderSend}/rider`, { body: { riderId: a.dataset.rider } })
      .then(({ order }) => { orders = orders.map(x => x.id === order.id ? order : x); lastSig = signature(); toast(`Order ${order.id} sent to ${order.rider.name}`); setTimeout(() => { if (tab === 'orders') renderOrderList(); else if (tab === 'dashboard') renderDashboard(); }, 400); })
      .catch(ex => toast(ex.message));
  });
  document.addEventListener('change', e => {
    if (e.target.dataset.stock) setStock(e.target.dataset.stock, e.target.checked, e.target);
  });

  /* ---------- Boot ---------- */
  const h = location.hash.slice(1);
  if (h.startsWith('reset=')) showAuth('reset', { token: h.slice(6) });
  else if (h === 'forgot') showAuth('forgot');
  else api('/admin/me').then(r => { me = r.admin; start(); }).catch(() => showAuth('login'));
})();
