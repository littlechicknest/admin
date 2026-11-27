# Little Chick Nest Admin

Admin panel for the [Little Chick Nest shop](https://github.com/littlechicknest/littlechicknest), live at https://littlechicknest.github.io/admin/. It also holds the shop's backend (`supabase/`: database migrations and Edge Functions). Shop and admin only share the Supabase project.

The panel is public code, but shows nothing without an admin sign-in: every table is protected by Row Level Security, and `profiles.role` can only be changed in the Supabase SQL editor.

```bash
npm install
cp .env.example .env.local   # Supabase URL + publishable key
npm run dev                  # http://localhost:5173/admin/
npm test && npm run lint && npm run build
```

## Products
- **Products** lists everything with tabs (In shop, Hidden, Need photos, My own products), search and a category filter. Change a product's category right in the list, or tick several and use **Move to / Show in shop / Hide**.
- **Add my own product** makes a product that is not from Gelato (`source = 'manual'`): photos, name, description, price, optional sizes and colours. Paid orders with these items are marked *manual fulfilment*: the owner posts them. Gelato items in the same order still go to Gelato.
- Prices: Gelato products sell at the retail price set in Gelato (`skus[].price`); the margin in Settings is only the fallback when Gelato has none.

## Fast pictures
Every picture uploaded in the admin is resized (max 1600-2000 px) and saved as WebP in the browser before upload. Gelato sends JPGs, so while the admin is open `src/lib/optimize.ts` converts any JPG/PNG in our storage to WebP every 10 minutes and points the product (and website photos) at the new file. The old file is kept so past orders still show it. Supabase's own image resizing needs a paid plan, which is why this runs in the admin.

## Product photos
1. A new Gelato product appears at the top of **Products** marked **NEW** (within 5 minutes).
2. In Gelato: select mockups, download the ZIP, unselect them, keep one as main.
3. **Add ZIP or pictures** on the product, as often as needed: pictures are added, never replaced. On the edit page **Add _colour_ pictures** puts your own pictures straight into that colour. Otherwise each picture's colour comes from the Gelato product code in its folder, then colour words in folder/file names, then (marked "Is this right?") the pixels. Anything unknown is listed first and stays out of the shop until a colour is chosen.
4. **Edit** shows every picture with its colour (and design option) to correct, hide or delete. Drag a picture, or pick its **Position**, to rank it: number 1 is the main picture. Changes save at once.

How it is stored: the sync writes `products.gelato_photos`, the admin writes `products.photos` (uploads, plus corrections of Gelato pictures), and the `products_photos` trigger merges both into `variants[].images` / `variants[].by_option`, which the shop, basket and orders read. `products.photo_order` holds the ranking. The sync never overwrites uploads or the ranking. Opening a product or uploading a ZIP syncs that product at once. Gelato only sends a colour's picture after its mockup is saved in Gelato; if Gelato drops it later, the last one stays.

**Website photos** stores replacements in `store_settings.site_images`. Slot names are in `src/pages/SitePhotos.tsx` here and `src/lib/siteImages.tsx` in the shop.

## Protection
- SQL injection: no SQL is built from user input anywhere; the API uses parameters, plus RLS and length checks.
- Floods: GitHub Pages and Supabase sit behind CDNs that absorb large attacks. `public.check_request()` also limits API writes (8 a minute per visitor, 120 per signed-in user) and checkout is limited to 15 open attempts an hour per customer.
- Password guessing: Supabase limits sign-in attempts per IP address. For bots on many addresses, turn on CAPTCHA: create a free Cloudflare Turnstile widget, paste its secret in Supabase → Authentication → Attack Protection, and add the site key as the repository variable `VITE_TURNSTILE_SITE_KEY` in **both** repos (deploy both before switching it on in Supabase).
- A Content Security Policy blocks foreign scripts on both sites.

## One-time setup checklist

### 1. Supabase (project `groyltayfbxzsalzvsai`, already done)
- The migrations in `supabase/migrations/` are applied: tables, RLS, Storage bucket, Vault tokens and the cron jobs.
- The Edge Functions in `supabase/functions/` are deployed.

### 2. Go live with Stripe (done 2026-11-27)
In the Supabase dashboard, open **Edge Functions → Secrets** and add the Stripe secret or restricted key (Stripe → Developers → API keys). Any secret name works (the live one is `strip_secrets`); the functions find the value that starts with `sk_`/`rk_`. A restricted key needs write access to Checkout Sessions and Webhook Endpoints. The publishable `pk_` key is not needed: checkout is Stripe's hosted page.

The Stripe account is shared with another shop (WooCommerce), so `stripe-webhook` ignores events whose `order_id` is not one of ours.

Within 15 minutes the shop registers its own Stripe webhook, stores the signing secret in Vault and switches checkout from **Test** to **Live**. To do it at once, press *Prices & settings → Sync orders now*.

- `sk_live_…`: real payments, orders go to Gelato and Gelato charges you for them, so add a payment method in Gelato first.
- `sk_test_…`: Stripe test cards work, orders are marked as test orders and are **never** sent to Gelato. Replace it with the live key when ready.
- A restricted key (`rk_…`) needs write access to Checkout Sessions and Webhook Endpoints.

Optional secrets: `GELATO_API_KEY` (overrides the one in Vault), `GELATO_STORE_ID`, `SITE_URL`, `STRIPE_WEBHOOK_SECRET` (only if you create the webhook by hand; then also switch *Checkout mode* yourself).

To change the Gelato key in Vault: `select vault.update_secret(id, 'NEW_KEY') from vault.secrets where name = 'gelato_api_key';`

### 3. Auth (Supabase → Authentication)
- **URL Configuration → Site URL:** `https://littlechicknest.github.io/littlechicknest/`
- **Redirect URLs:** add the URL above, `https://littlechicknest.github.io/admin/` and `http://localhost:5173/littlechicknest/`
- **Providers → Google:** enable it and paste the OAuth Client ID and Secret from Google Cloud Console (logged in as info.littlechicknest@gmail.com). In Google Cloud, the authorised redirect URI is `https://groyltayfbxzsalzvsai.supabase.co/auth/v1/callback`. The "Continue with Google" button works as soon as this is on.

### 4. Gelato webhook (optional; the 15-minute sync already covers this)
In **Prices & settings** the full webhook URL, token included, is shown. Paste it into Gelato → Developer → Webhooks for order status updates.

### 5. Make yourself admin
Sign up on the site with `info.littlechicknest@gmail.com`, confirm the email, then run this in the Supabase SQL editor:
```sql
update public.profiles set role = 'admin' where email = 'info.littlechicknest@gmail.com';
```
Then sign in at https://littlechicknest.github.io/admin/.

### 6. GitHub Pages
Both repos: **Settings → Pages → Source: GitHub Actions**. Every push to `main` tests, builds and deploys. The shop reads its Supabase values from repository secrets, this repo from repository variables.

## Products & pricing
`sync-products` copies the Gelato store every 5 minutes: title, description, size guide, colours, sizes, photos and cost. Nothing is typed in by hand.

- **Price** = Gelato cost × (1 + margin%), per colour and size, using the margin slider in *Prices & settings*. Gelato costs in GBP are converted to USD with Gelato's own rate.
- **Photos** from Gelato are copied once to Supabase Storage (Gelato's links expire after 24 h). A colour without photos borrows another colour's, with a note.
- **Category** is guessed on first import (Unisex appears under Men and Women). Category, visibility, featured and print files are yours to edit and the sync never changes them.
- A product deleted in Gelato is hidden, not deleted. Gelato products can't be deleted here, because the next sync would bring them back: hide them.
- **Manual products** have a fixed price and are marked "manual fulfilment".

Categories: **Men, Women, Unisex, Kids, Accessories**.

Prices are always calculated on the server (`public.sku_price()` in SQL and the checkout function), never trusted from the browser.

## Test checkout mode (before Stripe)
While *Checkout mode* is **Test**, customers (and you, for the client demo) can go all the way through checkout: address, delivery option, order confirmation, then order tracking in *My orders*.
- Orders are created by the `place_test_order()` database function, which re-prices everything on the server.
- They are flagged `is_test`, show a **Test order** badge, take no payment and are **never sent to Gelato** (the sync skips them).
- Move a test order through Processing → Printing → Shipped → Delivered from *Admin → Orders* to preview the customer's tracking page.
- Limit: 20 test orders per account per day.

## Sample products
The 25 sample products are hidden. Remove them for good with **Delete sample products** in the admin.

## Shipping
Set in *Prices & settings*: standard rate (default $4.95), free-standard threshold (default $75) and express rate (default $12.95). `public.shipping_cost()` is the single source of truth, used by test checkout and the Stripe function.

## Order flow
1. Customer fills in address + delivery on the shop's checkout page → `create-checkout-session` re-prices the basket from the database → Stripe Checkout (card, Apple Pay, Google Pay).
2. Stripe → `stripe-webhook` marks the order **paid** and sends it to Gelato. Any error is shown on the admin order page and retried every 15 minutes.
3. `sync-order-status` runs every 15 minutes (pg_cron), and on demand from the admin, to pull status and tracking: Processing → Printing → Shipped.
4. Admins can set status, tracking and internal notes on any order.

## Security notes
- RLS is on every table. Customers can read only their own orders and profile and can't change their role. Product costs and print files are hidden from the public, and the storefront reads through `shop_products()`.
- Reviews can be posted only by customers who bought the product, and appear only after admin approval.
- `npm test` covers the Gelato mapping, colour recognition, prices, CSV export and URL sanitising.
- **Rotate the Gelato key and the GitHub token after setup.** Both were shared in plain text during the project.
