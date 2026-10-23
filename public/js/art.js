/* Product images: a photo when the product has one (set from the admin panel),
   otherwise a built-in SVG illustration. */
const escAttr = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function art(p) {
  if (p.img) return `<img src="${escAttr(p.img)}" alt="${escAttr(p.name)}" loading="lazy">`;
  const a = p.accent || '#2874f0';
  const l = p.label || '';
  const fs = l.length > 5 ? 8 : 11;
  const shadow = (cy, rx) => `<ellipse cx="60" cy="${cy}" rx="${rx}" ry="5" fill="#000" opacity=".08"/>`;
  const label = (y, color = '#fff') => l ? `<text x="60" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fs}" font-weight="700" fill="${color}" letter-spacing=".5">${l}</text>` : '';
  const shapes = {
    bottle: `${shadow(107, 30)}
      <rect x="47" y="10" width="26" height="10" rx="3" fill="${a}"/>
      <path d="M49 20h22v10c0 4 9 10 9 18v50a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8V48c0-8 9-14 9-18z" fill="#fff" stroke="#d6dde8" stroke-width="2"/>
      <rect x="40" y="60" width="40" height="24" fill="${a}"/>${label(76)}
      <path d="M46 48v8M46 90v6" stroke="#eef3fa" stroke-width="3" stroke-linecap="round"/>`,
    paneer: `${shadow(102, 42)}
      <path d="M18 52 60 34l42 18-42 18z" fill="#fffdf3" stroke="#eadfb8" stroke-width="1.5"/>
      <path d="M18 52v28l42 18V70z" fill="#f6edcd"/>
      <path d="M102 52v28L60 98V70z" fill="#ecdfb0"/>
      <path d="M39 43l42 18M81 43 39 61" stroke="#efe3bc" stroke-width="1.5"/>
      <path d="M39 61v28M81 61v28" stroke="#e2d39f" stroke-width="1.5"/>
      <path d="M70 38c6-8 16-8 20-6-2 6-10 12-20 6z" fill="${a}"/>`,
    curd: `${shadow(103, 38)}
      <path d="M20 54h80c0 26-18 44-40 44S20 80 20 54z" fill="${a}"/>
      <ellipse cx="60" cy="54" rx="40" ry="11" fill="#fff" stroke="${a}" stroke-width="3"/>
      <path d="M42 53c6-6 14 4 22-2 4-3 8-2 12 0" stroke="#e6ecf4" stroke-width="3" fill="none" stroke-linecap="round"/>
      ${label(82)}`,
    ghee: `${shadow(105, 30)}
      <rect x="34" y="18" width="52" height="14" rx="4" fill="${a}"/>
      <path d="M32 32h56v62a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8z" fill="#f7c948" stroke="#e3a92b" stroke-width="2"/>
      <rect x="32" y="54" width="56" height="24" fill="#fff8e1"/>${label(70, a)}
      <path d="M40 40v8M40 84v10" stroke="#fff" stroke-opacity=".5" stroke-width="4" stroke-linecap="round"/>`,
    butter: `<ellipse cx="60" cy="86" rx="48" ry="13" fill="#fff" stroke="#d6dde8" stroke-width="2"/>
      <path d="M28 60 64 48l28 13-36 13z" fill="#fffbea"/>
      <path d="M28 60v16l28 12V74z" fill="#fbefc0"/>
      <path d="M92 61v15L56 88V74z" fill="#f3e2a2"/>
      <path d="M40 58c8-3 16 2 24-1" stroke="#f3e6b4" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    glass: `${shadow(107, 24)}
      <path d="M74 6 66 46" stroke="${a}" stroke-width="5" stroke-linecap="round"/>
      <path d="M36 20h48l-7 80a6 6 0 0 1-6 5H49a6 6 0 0 1-6-5z" fill="#fff" fill-opacity=".9" stroke="#d6dde8" stroke-width="2"/>
      <path d="M39 36h42l-5 62a4 4 0 0 1-4 4H48a4 4 0 0 1-4-4z" fill="${p.fill || '#fff1d0'}"/>
      ${p.mint ? `<circle cx="52" cy="52" r="2" fill="#4caf50"/><circle cx="64" cy="66" r="2" fill="#4caf50"/><circle cx="56" cy="82" r="2" fill="#4caf50"/><circle cx="68" cy="46" r="1.6" fill="#8d6e63"/>` : ''}`,
  };
  return `<svg viewBox="0 0 120 120" role="img" aria-label="${escAttr(p.name)}">${shapes[p.art] || shapes.bottle}</svg>`;
}
