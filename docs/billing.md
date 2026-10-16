# Billing (Stripe)

Paid plans (Plus, Pro, Unlimited) are sold through Stripe Billing with Stripe Tax. The pricing model is in `docs/decisions.md`; plan names, codes and prices live in `PLAN_DETAILS` (`packages/core/src/plans`).

## How it works

- **Checkout:** "Choose Plus" on `/pricing` calls `choosePlanAction`, which creates a Stripe customer for the user (once; stored in `user.billing_customer_id`) and opens a hosted Stripe Checkout page. Someone who already pays is sent to the billing portal instead, where plan changes happen.
- **Tax:** Checkout runs with `automatic_tax`, collects the billing address, and lets businesses add a tax ID. Prices are USD and tax-exclusive: tax is added on top where it applies.
- **Portal:** "Manage plan and billing" on the account page opens the Stripe customer portal: switch plan (upgrades now, prorated; downgrades and yearly→monthly at period end), update card and address, invoices, cancel at period end.
- **Webhooks:** `POST /api/billing/webhook` verifies the signature, then re-reads the subscription from Stripe and stores it in `subscriptions`. It never trusts the event body, so retried or out-of-order events are harmless. Returning from checkout also syncs right away (`syncCheckout`), so the plan shows without waiting for the webhook.
- **Plan in effect:** the higher of `user.plan` (granted by an admin) and any subscription that is `active`, `trialing` or `past_due` (`effectivePlan` in `packages/core/src/billing`). Past due keeps the plan while Stripe retries the card.
- **Ending a plan never breaks anything:** codes with advanced features keep them; only adding them to more codes is limited.
- **Account deletion** cancels open subscriptions first (if Stripe can't be reached, nothing is deleted).
- **Price lookups:** prices are found by lookup key (`qrfinity_plus_monthly`, `qrfinity_pro_yearly`, …), so no price ids are in configuration.
- **Provider interface:** `Billing` in `packages/core/src/ports.ts`; Stripe implementation in `apps/web/lib/server/stripe.ts`; service in `apps/web/lib/server/billing.ts`.

## Environment variables

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | Developers → API keys → Secret key (`sk_test_…`, then `sk_live_…`). A restricted key (`rk_…`) also works for the app if it has write access to Customers, Checkout Sessions, Customer portal and Subscriptions, and read access to Prices. The setup script additionally needs write access to Products, Prices and Webhook Endpoints. |
| `STRIPE_WEBHOOK_SECRET` | The endpoint's signing secret (`whsec_…`). |
| `STRIPE_PORTAL_CONFIGURATION` | Optional: the portal configuration id (`bpc_…`) printed by the setup script. Without it Stripe uses your default portal settings. |

Paid plans stay "Coming soon" (with the waitlist) until the first two are set. The pricing page is static, so **redeploy after setting them**.

## Setting up (test mode first)

1. **Stripe Tax:** Dashboard → Tax → set your origin address (Ontario), and the preset product tax code to *Software as a service (SaaS) – personal use* or *business use* (ask your accountant which). Add registrations as you need them: Canada GST/HST once past the $30k small-supplier threshold; the EU (OSS) and UK from the first consumer sale; US states after their thresholds. Stripe Tax monitors thresholds and warns you.
2. **Products, prices, portal and webhook:** run from the repo root:

   ```sh
   STRIPE_SECRET_KEY=sk_test_... pnpm --filter @qrfinity/web stripe:setup --webhook https://qrfinity.com
   ```

   Run `pnpm install` first after pulling (the script uses `tsx`). It prints `STRIPE_WEBHOOK_SECRET` and `STRIPE_PORTAL_CONFIGURATION`. It's safe to run again; a price changed in `PLAN_DETAILS` gets a new Stripe price that takes over the lookup key (existing subscribers stay on the old price).

   To create the webhook by hand instead: Developers → Webhooks → Add endpoint, URL `https://qrfinity.com/api/billing/webhook`, snapshot payloads, events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`. Copy its signing secret.
3. **Emails:** Settings → Customer emails → turn on receipts for successful payments and refunds, and emails for failed payments (Settings → Billing → Revenue recovery: Smart Retries and failed-payment emails, then cancel the subscription if all retries fail).
4. **Public details:** Settings → Public details: business name *QRfinity*, support email hello@qrfinity.com, website, and the statement descriptor (e.g. `QRFINITY.COM`). Settings → Branding: logo and colours from `brand/`.
5. **Vercel:** set the variables above for Production (and Preview with test keys), run `pnpm db:migrate`, and redeploy.
6. **Try it:** on `/pricing` choose Plus with card `4242 4242 4242 4242`, any future date and CVC. Check the account page shows Plus, Admin → Settings shows "1 on plus", then open Manage plan and billing and cancel.
7. **Go live:** repeat steps 2–5 in live mode with `sk_live_…` (live mode has its own products, webhook and secret).

## Local development

```sh
stripe listen --forward-to localhost:3000/api/billing/webhook   # prints a whsec_ for .env.local
```

Unit tests use a fake provider (`apps/web/test/billing.test.ts`) and Stripe's own signature helper (`test/stripe-webhook.test.ts`); no Stripe account is needed.

## Refunds

Policy (terms §7): a full refund on request within 14 days of the first payment for a plan; renewals aren't refunded. Refund from the payment in the Stripe dashboard. Refunding doesn't cancel the subscription: cancel it too if the customer is leaving.
