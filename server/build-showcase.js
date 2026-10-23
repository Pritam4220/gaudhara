'use strict';
/* Builds the public showcase page for GitHub Pages into docs/.
   It shows products, prices and how to order — no login, cart or stock levels (the full store does that).
   Run:  npm run showcase   then commit and push the docs/ folder. */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const DB = path.join(ROOT, 'data', 'db.json');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = config.STORE;

// Current products from the store database (falls back to the starting list).
const source = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')).products : JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-products.json'), 'utf8'));
const products = source.filter(p => !p.deleted).map(p => ({
  id: p.id, name: p.name, cat: p.cat, type: p.type, tag: p.tag || '', desc: p.desc || '',
  img: p.img && p.img.startsWith('images/') ? p.img : null,
  variants: p.variants.map(v => ({ size: v.size, price: v.price, mrp: v.mrp })),
}));
const cats = config.CATEGORIES.filter(c => products.some(p => p.cat === c.id));

// Real contact details only — placeholder numbers must never go on a public page.
const digits = String(S.phone || '').replace(/\D/g, '');
const phone10 = digits.length >= 10 ? digits.slice(-10) : '';
const isPlaceholder = !phone10 || /^9000000000$/.test(phone10);
const wa10 = String(S.whatsapp || '').replace(/\D/g, '').slice(-10) || phone10;
const hasContact = !isPlaceholder;
const hasEmail = S.email && !/yourdomain/i.test(S.email);
const hasAddress = S.address && !/your farm address/i.test(S.address);
const storeUrl = String(S.storeUrl || '').trim();

const rupee = n => '₹' + Math.round(n).toLocaleString('en-IN');
const waLink = text => `https://wa.me/91${wa10}?text=${encodeURIComponent(text)}`;
const off = v => v.mrp > v.price ? Math.round((v.mrp - v.price) / v.mrp * 100) : 0;

const card = p => {
  const v = p.variants[0];
  return `<article class="card" data-cat="${esc(p.cat)}">
      ${p.tag ? `<span class="badge">${esc(p.tag)}</span>` : ''}
      <div class="pimg">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">` : '<span class="noimg">🥛</span>'}</div>
      <div class="pbody">
        <h3>${esc(p.name)}</h3>
        <p class="desc">${esc(p.desc)}</p>
        <div class="sizes">${p.variants.map((x, i) => `<button type="button" class="${i ? '' : 'on'}" data-price="${x.price}" data-mrp="${x.mrp}" data-size="${esc(x.size)}">${esc(x.size)}</button>`).join('')}</div>
        <div class="prow">
          <span class="price"><b>${rupee(v.price)}</b>${v.mrp > v.price ? `<s>${rupee(v.mrp)}</s><em>${off(v)}% off</em>` : ''}</span>
          ${hasContact ? `<a class="order" target="_blank" rel="noopener" data-name="${esc(p.name)}" href="${waLink(`Hello ${S.name}, I want to order: ${p.name} (${v.size})`)}">Order</a>` : ''}
        </div>
      </div>
    </article>`;
};

const html = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(S.name)} — ${esc(S.tagline)}</title>
<meta name="description" content="${esc(S.name)}: fresh cow milk, buffalo milk, paneer, dahi, ghee and more, delivered to your door.">
<meta name="theme-color" content="#16a34a">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%2316a34a'/%3E%3Ctext x='50' y='64' font-family='Arial' font-weight='900' font-size='40' fill='white' text-anchor='middle'%3EGF%3C/text%3E%3C/svg%3E">
<style>
:root{--g:#16a34a;--gd:#15803d;--gdd:#166534;--gl:#22c55e;--g50:#f0fdf4;--g100:#dcfce7;--g200:#bbf7d0;--ink:#111827;--ink2:#1f2937;--mut:#6b7280;--line:#e5e7eb;--bg:#f9fafb;--y:#facc15}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink2);background:var(--bg)}
a{color:inherit;text-decoration:none}img{display:block;max-width:100%}h1,h2,h3,p{margin:0}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
header{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:14px;height:66px}
.logo{display:flex;align-items:center;gap:10px}.mark{width:40px;height:40px;border-radius:50%;background:var(--g);color:#fff;display:grid;place-items:center;font-weight:900}
.logo b{display:block;font-size:20px;font-weight:900;color:var(--ink);line-height:1.1}.logo small{color:var(--mut);font-size:11px;font-weight:600}
nav{margin-left:auto;display:flex;gap:18px;align-items:center;font-weight:600;font-size:14px}nav a:hover{color:var(--gd)}
.cta{background:var(--g);color:#fff!important;padding:9px 16px;border-radius:12px;font-weight:700}.cta:hover{background:var(--gd)}
.hero{margin:22px 0;border-radius:24px;overflow:hidden;position:relative;background:linear-gradient(90deg,#111827,#1f2937);color:#fff;min-height:300px;display:flex;align-items:center}
.hero img{position:absolute;right:0;top:0;height:100%;width:56%;object-fit:cover;opacity:.6;-webkit-mask-image:linear-gradient(to right,transparent,#000 40%);mask-image:linear-gradient(to right,transparent,#000 40%)}
.hero .in{position:relative;padding:44px;max-width:600px}.chip{display:inline-block;background:var(--gl);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:5px 10px;border-radius:999px}
.hero h1{font-size:clamp(28px,5vw,44px);font-weight:900;line-height:1.1;margin:12px 0 10px}.hero p{color:#d1d5db;font-size:16px}
.hero .btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:12px;font-weight:800}
.btn.w{background:#fff;color:var(--ink)}.btn.wa{background:#25d366;color:#fff}.btn.o{border:1px solid rgba(255,255,255,.4);color:#fff}
.trust{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px}
.trust div{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 16px;display:flex;gap:12px;align-items:center}
.trust span{width:40px;height:40px;border-radius:50%;background:var(--g50);display:grid;place-items:center;font-size:20px;flex-shrink:0}.trust b{display:block;color:var(--ink);font-size:14px}.trust small{color:var(--mut);font-size:12px}
h2{font-size:24px;font-weight:900;color:var(--ink);margin-bottom:14px}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.chips button{border:1px solid var(--line);background:#fff;padding:8px 18px;border-radius:999px;font:inherit;font-weight:600;color:#4b5563;cursor:pointer}
.chips button.on{background:var(--ink2);border-color:var(--ink2);color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:18px}
.card{position:relative;display:flex;gap:14px;background:#fff;border:1px solid #f3f4f6;border-radius:16px;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.badge{position:absolute;top:-8px;left:-6px;background:var(--y);color:#713f12;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:4px 10px;border-radius:8px;border:1px solid #fde047}
.pimg{width:120px;height:120px;border-radius:12px;overflow:hidden;flex-shrink:0;background:var(--bg)}.pimg img{width:100%;height:100%;object-fit:cover}.noimg{display:grid;place-items:center;height:100%;font-size:40px}
.pbody{flex:1;min-width:0;display:flex;flex-direction:column}.pbody h3{font-size:16px;color:var(--ink2)}
.desc{font-size:12px;color:#9ca3af;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sizes{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.sizes button{font:inherit;font-size:11px;font-weight:700;padding:3px 9px;border-radius:8px;border:1px solid var(--line);background:#fff;color:#4b5563;cursor:pointer}
.sizes button.on{border-color:var(--gl);background:var(--g50);color:var(--gd)}
.prow{margin-top:auto;padding-top:10px;display:flex;justify-content:space-between;align-items:flex-end;gap:8px}
.price b{font-size:19px;color:var(--ink)}.price s{color:#9ca3af;font-size:12px;margin-left:6px}.price em{color:var(--g);font-style:normal;font-weight:700;font-size:12px;margin-left:6px}
.order{background:var(--g50);color:var(--gd);border:1px solid var(--g200);font-weight:800;padding:8px 18px;border-radius:12px;font-size:14px}.order:hover{background:var(--g100)}
.how{margin:40px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.how div{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px}
.how b{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--g);color:#fff;margin-bottom:10px}.how h3{font-size:16px;color:var(--ink);margin-bottom:4px}.how p{font-size:13px;color:var(--mut)}
.contact{background:linear-gradient(135deg,var(--gdd),var(--g));color:#fff;border-radius:24px;padding:32px;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:30px}
.contact h2{color:#fff;margin:0 0 4px}.contact p{color:var(--g100)}
footer{border-top:1px solid var(--line);background:#fff;padding:22px 0;font-size:13px;color:var(--mut)}footer .wrap{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}footer a{text-decoration:underline}
@media(max-width:820px){nav a:not(.cta){display:none}.trust{grid-template-columns:repeat(2,1fr)}.how{grid-template-columns:1fr}.hero{min-height:360px;align-items:flex-end}.hero img{width:100%;opacity:.35;-webkit-mask-image:none;mask-image:none}.hero .in{padding:28px}}
@media(max-width:420px){.grid{grid-template-columns:1fr}.pimg{width:96px;height:96px}.wrap{padding:0 14px}}
</style>
</head>
<body>
<header><div class="wrap bar">
  <a class="logo" href="#"><span class="mark">GF</span><span><b>${esc(S.name)}</b><small>${esc(S.tagline)}</small></span></a>
  <nav><a href="#products">Products</a><a href="#how">How to order</a>${hasContact ? `<a class="cta" href="${waLink(`Hello ${S.name}, I want to place an order.`)}" target="_blank" rel="noopener">Order on WhatsApp</a>` : storeUrl ? `<a class="cta" href="${esc(storeUrl)}">Open store</a>` : ''}</nav>
</div></header>

<main class="wrap">
  <section class="hero">
    ${S.banner?.img ? `<img src="${esc(S.banner.img)}" alt="">` : ''}
    <div class="in">
      <span class="chip">${esc(S.banner?.tag || 'Morning Fresh')}</span>
      <h1>${esc(S.banner?.title || 'Farm to Home').replace(/\n/g, '<br>')}</h1>
      <p>${esc(S.banner?.text || '100% Pure & Untouched')} — fresh cow & buffalo milk, paneer, dahi and ghee from ${esc(S.name)}.</p>
      <div class="btns">
        <a class="btn w" href="#products">See products & prices</a>
        ${hasContact ? `<a class="btn wa" href="${waLink(`Hello ${S.name}, I want to place an order.`)}" target="_blank" rel="noopener">Order on WhatsApp</a><a class="btn o" href="tel:+91${phone10}">Call ${esc(S.phone)}</a>` : ''}
        ${storeUrl ? `<a class="btn o" href="${esc(storeUrl)}">Open online store</a>` : ''}
      </div>
    </div>
  </section>

  <section class="trust">
    <div><span>🌿</span><p><b>Farm fresh</b><small>Milked & chilled the same morning</small></p></div>
    <div><span>🛡️</span><p><b>No preservatives</b><small>Pure, unadulterated dairy</small></p></div>
    <div><span>🚚</span><p><b>Doorstep delivery</b><small>Morning & evening slots</small></p></div>
    <div><span>💵</span><p><b>Pay on delivery</b><small>Cash or any UPI app</small></p></div>
  </section>

  <section id="products">
    <h2>Our products</h2>
    <div class="chips"><button class="on" data-f="all">All</button>${cats.map(c => `<button data-f="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>
    <div class="grid">${products.map(card).join('')}</div>
  </section>

  <section class="how" id="how">
    <div><b>1</b><h3>Choose</h3><p>Pick your milk, paneer, dahi or ghee and the size you need.</p></div>
    <div><b>2</b><h3>${hasContact ? 'Message or call us' : storeUrl ? 'Order online' : 'Order'}</h3><p>${hasContact ? `Tap “Order” to send us a WhatsApp message, or call ${esc(S.phone)}.` : storeUrl ? 'Create a free account in our online store and place your order.' : 'Online ordering opens soon.'}</p></div>
    <div><b>3</b><h3>Get it fresh</h3><p>We deliver to your door in your chosen slot. Pay by cash or UPI when it arrives.</p></div>
  </section>

  ${hasContact || hasEmail || storeUrl ? `<section class="contact">
    <div><h2>Order fresh dairy today</h2><p>${[hasContact ? esc(S.phone) : '', hasEmail ? esc(S.email) : '', hasAddress ? esc(S.address) : ''].filter(Boolean).join(' · ')}</p></div>
    <div class="btns" style="display:flex;gap:10px;flex-wrap:wrap">${hasContact ? `<a class="btn w" href="tel:+91${phone10}">📞 Call</a><a class="btn wa" href="${waLink(`Hello ${S.name}, I want to place an order.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${storeUrl ? `<a class="btn w" href="${esc(storeUrl)}">Open online store</a>` : ''}</div>
  </section>` : ''}
</main>

<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(S.name)}. Prices may change; final price is confirmed when you order.</span><a href="images/CREDITS.md">Photo credits</a></div></footer>

<script>
document.querySelector('.chips').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  document.querySelectorAll('.chips button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.card').forEach(c=>{c.style.display=b.dataset.f==='all'||c.dataset.cat===b.dataset.f?'':'none'});});
document.querySelector('.grid').addEventListener('click',e=>{const b=e.target.closest('.sizes button');if(!b)return;
  const card=b.closest('.card');card.querySelectorAll('.sizes button').forEach(x=>x.classList.toggle('on',x===b));
  const p=+b.dataset.price,m=+b.dataset.mrp,r=n=>'₹'+n.toLocaleString('en-IN');
  card.querySelector('.price').innerHTML='<b>'+r(p)+'</b>'+(m>p?'<s>'+r(m)+'</s><em>'+Math.round((m-p)/m*100)+'% off</em>':'');
  const o=card.querySelector('.order');if(o)o.href=o.href.replace(/text=.*/,'text='+encodeURIComponent('Hello ${esc(S.name)}, I want to order: '+o.dataset.name+' ('+b.dataset.size+')'));});
</script>
</body>
</html>
`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'images'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
const needed = new Set([...products.map(p => p.img).filter(Boolean), S.banner?.img].filter(Boolean).map(p => path.basename(p)));
for (const f of fs.readdirSync(path.join(ROOT, 'public', 'images'))) {
  if (needed.has(f) || f === 'CREDITS.md') fs.copyFileSync(path.join(ROOT, 'public', 'images', f), path.join(OUT, 'images', f));
}
console.log(`Showcase built in docs/ — ${products.length} products, ${needed.size} photos.`);
if (!hasContact) console.log('NOTE: STORE.phone in server/config.js is still a placeholder, so Call/WhatsApp buttons are hidden. Add your real number and run this again.');
