/* ============================================================
   Gaudhara store settings — edit, then restart the server.
   Products, prices, photos and stock are managed in the admin panel.
   ============================================================ */

module.exports = {
  STORE: {
    name: 'GauDhara',
    tagline: 'Pure Dairy, Delivered Fresh',
    // Home-page banner
    banner: { tag: 'Morning Fresh', title: 'Farm to Home\nin 90 Mins', text: '100% Pure & Untouched', img: 'images/a2-milk.jpg' },
    phone: '+91 90000 00000',
    whatsapp: '',                    // WhatsApp number for orders on the showcase page (empty = same as phone)
    storeUrl: '',                    // full online store address once it is live, e.g. https://gaudhara.up.railway.app
    email: 'hello@yourdomain.com',
    address: 'Your farm address, City, State - 000000',
    freeDeliveryAbove: 199,
    deliveryFee: 25,
    servicePincodes: [],             // e.g. ['302001', '302012']; leave empty to accept every pincode
  },

  SUB_DISCOUNT: 0.05,                // 5% off on subscription orders

  COUPONS: {
    GAUDHARA10: { type: 'pct', value: 10, max: 100, label: '10% off, up to ₹100' },
    FIRST50:    { type: 'flat', value: 50, min: 299, label: '₹50 off on orders above ₹299' },
  },

  PAYMENT_METHODS: ['Cash on delivery', 'UPI on delivery'],

  CATEGORIES: [
    { id: 'milk',   name: 'Milk',          art: 'bottle', accent: '#2874f0', label: 'MILK', bg: '#e8f1ff', img: 'images/cow-milk.jpg' },
    { id: 'paneer', name: 'Paneer',        art: 'paneer', accent: '#ff8a00', bg: '#fff3e0', img: 'images/paneer.jpg' },
    { id: 'curd',   name: 'Curd & Dahi',   art: 'curd',   accent: '#2874f0', label: 'DAHI', bg: '#eef4ff', img: 'images/cow-curd.jpg' },
    { id: 'ghee',   name: 'Ghee & Butter', art: 'ghee',   accent: '#b5651d', label: 'GHEE', bg: '#fff6e0', img: 'images/cow-ghee.jpg' },
    { id: 'drinks', name: 'Lassi & Chaas', art: 'glass',  accent: '#ff8a00', fill: '#fff1d0', bg: '#fff8ec', img: 'images/sweet-lassi.jpg' },
  ],
};
