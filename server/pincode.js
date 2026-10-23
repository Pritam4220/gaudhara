'use strict';
/* Pincode → city, state and area names.
   Uses India Post's free pincode service, with OpenStreetMap as a fallback. Results are cached. */

const cache = new Map();
const TTL = 7 * 24 * 3600e3;

async function getJson(url, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'GauDhara-store/1.0', Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const clean = s => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

async function fromIndiaPost(pin) {
  const [r] = await getJson(`https://api.postalpincode.in/pincode/${pin}`);
  const offices = r?.Status === 'Success' ? r.PostOffice || [] : [];
  if (!offices.length) return null;
  const first = offices[0];
  return {
    pin,
    city: first.District || first.Block || '',
    state: first.State || '',
    // "Sector-43, Chandigarh" → "Sector-43" (the city is already shown separately)
    areas: [...new Set(offices.map(o => clean(o.Name).replace(/,\s*[^,]+$/, m => (o.District && m.toLowerCase().includes(o.District.toLowerCase()) ? '' : m))).filter(Boolean))].slice(0, 30),
  };
}

async function fromOsm(pin) {
  const list = await getJson(`https://nominatim.openstreetmap.org/search?postalcode=${pin}&country=India&format=json&addressdetails=1&limit=1`);
  const a = list?.[0]?.address;
  if (!a) return null;
  return { pin, city: a.city || a.town || a.state_district || a.county || '', state: a.state || '', areas: [a.suburb || a.neighbourhood || a.village].filter(Boolean) };
}

async function lookupPincode(pin) {
  const hit = cache.get(pin);
  if (hit && hit.at > Date.now() - TTL) return hit.data;
  let data = null;
  try { data = await fromIndiaPost(pin); } catch (e) { console.error('[pincode] India Post:', e.message); }
  if (!data) { try { data = await fromOsm(pin); } catch (e) { console.error('[pincode] OSM:', e.message); } }
  if (data) cache.set(pin, { at: Date.now(), data });
  return data;
}

module.exports = { lookupPincode };
