/* Pricing rules shared by the browser and the server, so totals always match. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.Shared = m;
})(this, function () {
  const PLANS = { once: 'Buy once', daily: 'Daily', alternate: 'Alternate days', weekly: 'Weekly' };
  const STATUSES = ['Pending', 'Confirmed', 'Out for delivery', 'Delivered', 'Cancelled', 'Rejected'];
  const MAX_QTY = 20;

  const unitPrice = (v, plan, subDiscount) => plan === 'once' ? v.price : Math.round(v.price * (1 - subDiscount));

  function couponDiscount(coupons, code, price) {
    const c = coupons[code];
    if (!c) return { ok: false, off: 0, msg: 'This coupon code is not valid.' };
    if (c.min && price < c.min) return { ok: false, off: 0, msg: `Add ₹${c.min - price} more to use ${code}.` };
    const off = c.type === 'pct' ? Math.min(c.max || Infinity, Math.round(price * c.value / 100)) : c.value;
    return { ok: true, off: Math.min(off, price) };
  }

  // lines: [{ price, mrp, qty }] with price already per-unit for the chosen plan
  function computeTotals(lines, cfg, code) {
    let mrp = 0, price = 0, count = 0;
    lines.forEach(l => { mrp += l.mrp * l.qty; price += l.price * l.qty; count += l.qty; });
    const c = code ? couponDiscount(cfg.COUPONS, code, price) : { ok: false, off: 0 };
    const couponOff = c.ok ? c.off : 0;
    const delivery = !count || price >= cfg.STORE.freeDeliveryAbove ? 0 : cfg.STORE.deliveryFee;
    return { mrp, price, discount: mrp - price, couponOff, couponMsg: code && !c.ok ? c.msg : '', delivery, total: price - couponOff + delivery, count };
  }

  return { PLANS, STATUSES, MAX_QTY, unitPrice, couponDiscount, computeTotals };
});
