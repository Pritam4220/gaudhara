# Gaudhara — Dairy e-commerce store

A Flipkart-style online store for Gaudhara's milk, paneer, curd, ghee and more, with customer accounts and an admin dashboard.
It's plain Node.js with **no packages to install**.

## Start the store

```
npm start
```

- Store: http://localhost:3000
- Admin: http://localhost:3000/login
- **Team login:** open **/login** (it is not linked anywhere on the store) and sign in with the email in
  `.env` (`ADMIN_EMAIL`, currently anointinginfotech@gmail.com). When the account is first created, its password is
  printed in the terminal and saved to `data/admin-login.txt`. Change it in **Settings**, then delete that file.
- **Email (Gmail):** paste a Gmail App Password after `SMTP_PASS=` in `.env` and restart. That turns on
  **Forgot password?** links (one-time, 60 minutes) and **new-order alert emails**. Admin → Settings has a "Send a test email" button.
  Never share or upload `.env`.

## How it works

**Customers** (a phone-app style design based on the GauDhara Fresh prototype)
- Splash screen → **Welcome!** (sign up / log in with mobile number) → menu. "Skip for now" lets people just browse.
- Menu: banner, category chips, product cards with badges, size choice, **ADD → − qty +**, and a floating
  **View Cart** bar. Tapping ADD without an account opens the Welcome screen; the item is added after login.
- Checkout: **Detect Current Location** (GPS pin on a map + address filled in automatically), house no.,
  delivery time, bill details with coupons, Cash / UPI on delivery, **Place Order**.
  GPS needs HTTPS (or localhost); customers can always type the address instead.
- Order tracking shows the **real status you set in admin** (checked every 15 seconds) and a call button.
- Banner text and image: `STORE.banner` in `server/config.js`.
- Orders start as **"Awaiting confirmation"**. Customers can track each order
  (Order placed → Confirmed → Out for delivery → Delivered) and cancel it before it goes out for delivery.

**Admin (`/login` only — `/admin` is switched off)**
- **Dashboard:** orders awaiting verification, orders to deliver, today's orders and sales, customers, and out-of-stock count.
- **Orders:** new orders appear automatically (checked every 15 seconds) with a sound and a notification.
  Open an order to see the customer, phone (tap to call), address, items and amount to collect, then:
  **Verify & confirm** / **Reject** → **Out for delivery** → **Delivered**.
- **Products & stock:** switch each product **In stock / Out of stock** (customers can't buy out-of-stock items),
  **upload or change product photos**, edit names, prices and sizes, add new products, and delete products.
- **Customers:** everyone who signed up, with their orders and total spent.
- **Settings:** change the password, check email alerts and send a test email.
- Orders and customers can be exported to Excel (CSV), and each order has **Call** and **WhatsApp** buttons with a ready-made status message.

## Files

| Path | What it is |
|---|---|
| `server/server.js` | The web server and API |
| `.env` | Team login email, Gmail settings, store web address (keep private) |
| `server/config.js` | Store phone, email, address, delivery fee, coupons, categories (restart after editing) |
| `server/seed-products.json` | Starting product list (used only when the database is first created) |
| `data/db.json` | **The database:** customers, orders, products. **Back this up.** |
| `public/uploads/` | Photos uploaded from the admin panel |
| `public/images/` | Starting product photos (see `CREDITS.md` there) |

## Before launch

- Put your real phone, email and address in `server/config.js`.
- Replace the starting photos with **photos of your own products** (Admin → Products → Change photo).
  The included photos are free stock photos from Wikimedia Commons. Their credits are in `public/images/CREDITS.md`.
- The starting ratings and review counts are sample numbers. Change or remove them in `server/seed-products.json`
  before the database is first created, or ask a developer to clear them in `data/db.json`.

## Going online (Railway)

GitHub Pages cannot run this store (it needs a Node.js server). Railway runs it straight from this GitHub repo.

1. **railway.app** → sign in with GitHub → **New Project** → **Deploy from GitHub repo** → `Pritam4220/gaudhara`.
2. In the service → **Settings → Volumes** → **Add volume**, mount path **`/data`**.
   (This keeps customers, orders and photos safe across restarts and updates.)
3. **Variables** → add:
   - `DATA_DIR=/data`
   - `TRUST_PROXY=1`
   - `ADMIN_EMAIL=anointinginfotech@gmail.com`
   - `ADMIN_PASSWORD=` a strong password for the first admin login
   - `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=anointinginfotech@gmail.com`,
     `SMTP_PASS=` your Gmail App Password, `NOTIFY_EMAIL=anointinginfotech@gmail.com`
4. **Settings → Networking → Generate Domain** (or add your own domain). Copy the address and add the variable
   `SITE_URL=https://that-address` (used in emailed links; also turns on secure cookies).
5. Railway builds and starts it with `npm start`. Health check path: `/api/health`.
6. Open `https://that-address/login` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Every `git push` to `main` redeploys automatically. The online store starts with its own empty database
(products come from `server/seed-products.json`); product photos you uploaded on this computer must be
uploaded again in Admin → Products.

| Setting | What it does |
|---|---|
| `DATA_DIR` | Folder for `db.json` and uploaded photos (point it at the persistent volume) |
| `UPLOADS_DIR` | Optional: a different folder just for photos |
| `TRUST_PROXY=1` | Use the visitor's real IP behind the host's proxy (for login limits) |
| `SITE_URL` | Public https address; links in emails and `Secure` cookies |
| `PORT` | Set by the host automatically |

## Customer accounts: verified number, photos, forgot password

> **Current setting: OTP is OFF.** Customers create an account with name, number, password (+ optional photo)
> and can use the store straight away. The whole store (products, prices, stock) is visible **only after login**.
> Customer forgot password → they call you → **Admin → Customers → Reset password**.
> Customers can change their own password in **My Profile**. To switch OTP back on later, set `REQUIRE_OTP=on`
> in `.env` and connect WhatsApp or SMS as described below.

- Sign-up asks for name, WhatsApp/mobile number, password and an optional **profile photo**.
- The number is verified with **Verify on WhatsApp** (main way, free): the customer taps *Open WhatsApp*, presses
  *Send* on a ready-typed message ("GauDhara verify 123456") to your business number, and comes back. WhatsApp
  tells the store which number sent it, so only the real owner of the number can verify it.
  **SMS OTP** is offered as a backup ("No WhatsApp? Get OTP by SMS instead").
- **Forgot password?** on the login tab: number + new password → verify on WhatsApp (or SMS) → done.
- **My Profile** (account menu): change photo, name, or password.
- **No shortcuts:** until WhatsApp OTP or SMS OTP is connected, sign-up and "forgot password" are paused (customers see
  a message, the admin dashboard shows a red warning). `VERIFY_TEST_MODE=on` in `.env` shows codes on screen for
  testing on this computer only — keep it `off` for real use.

### Connect WhatsApp OTP — we send the code to the customer's WhatsApp (recommended)

Works even while the store runs on this computer. Meta charges about ₹0.115 + GST per OTP.

1. developers.facebook.com → My Apps → **Create app** → **Business** → add **WhatsApp**.
2. WhatsApp → API Setup → add your **business phone number** (not used in the normal WhatsApp app) → copy the
   **Phone number ID**. Add a payment method in WhatsApp Manager.
3. Business Settings → System users → create one → **Generate token** with `whatsapp_business_messaging`.
4. WhatsApp Manager → **Message templates** → Create → category **Authentication** → "Copy code" button →
   name it e.g. `gaudhara_otp`, language English → submit and wait for **Approved**.
5. In `.env`: `WA_PHONE_ID=…`, `WA_TOKEN=…`, `WA_OTP_TEMPLATE=gaudhara_otp`, `WA_TEMPLATE_LANG=en`. Restart.

### Alternative: customer sends the code to you (free, needs the store online with https)

1. Go to developers.facebook.com → My Apps → **Create app** → type **Business** → add the **WhatsApp** product.
2. In WhatsApp → API Setup, add your **business phone number** (a number *not* used in the normal WhatsApp app).
   Copy the **Phone number ID**.
3. Business Settings → System users → create one → **Generate token** with `whatsapp_business_messaging` permission.
4. App settings → Basic → copy the **App secret**.
5. Fill in `.env`: `WA_NUMBER` (e.g. 919876543210), `WA_PHONE_ID`, `WA_TOKEN`, `WA_APP_SECRET`, and choose any
   secret word for `WA_VERIFY_TOKEN`. Restart the store.
6. WhatsApp → Configuration → Webhook: Callback URL `https://YOUR-DOMAIN/api/whatsapp/webhook`, Verify token = the
   same word as `WA_VERIFY_TOKEN` → Verify and save → subscribe to the **messages** field.

Customers' messages to that number arrive in the store, not in a WhatsApp app, so use a separate number for this.

**To send real SMS** (backup method), create an account with one SMS provider and fill these in `.env`, then restart:

| Provider | What to put in .env |
|---|---|
| Fast2SMS (fast2sms.com) | `SMS_PROVIDER=fast2sms`, `SMS_API_KEY=` your API key (Dev API page) |
| 2Factor (2factor.in) | `SMS_PROVIDER=2factor`, `SMS_API_KEY=` your API key |
| MSG91 (msg91.com) | `SMS_PROVIDER=msg91`, `SMS_API_KEY=` your auth key, `SMS_TEMPLATE=` your OTP template ID |

Until then the site is in **test mode**: the OTP is shown on screen (and in the server window) only when the site is
opened on this computer. Visitors from other devices cannot sign up until SMS is set up.

## Admin forgot password

- **By email:** add a Gmail **App Password** after `SMTP_PASS=` in `.env`, restart, then use
  **Forgot password?** on /login. A one-time link is emailed to anointinginfotech@gmail.com.
  To make the App Password: myaccount.google.com (signed in as anointinginfotech@gmail.com) → Security →
  turn on **2-Step Verification** → search **App passwords** → name it "GauDhara" → Create → copy the 16 letters.
- **Without email:** stop the store, run `npm run reset-admin -- <new password>` (8+ characters), then start it again.
