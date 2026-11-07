# Stripe integration: what's left to do

The pitch fundraiser now takes payments with Stripe's **embedded form** (Checkout Sessions, `ui_mode: "form"`).
Supporters pay inside a sheet on the team site instead of being sent to a Stripe page. The money still goes straight
to the club's own Stripe account (a direct charge), and Touchline Tales' fee is still taken as an application fee.

This was an existing Checkout Session call (Scenario A), so only that call's settings changed. The settings that make
the fundraiser work were **kept on purpose**, although Checkout Studio didn't list them:
`payment_intent_data` (our fee, description, metadata), `metadata`, `customer_email` and `expires_at`. Taking them out
would lose our fee and stop the site knowing which square was bought. `success_url`/`cancel_url` became `return_url`,
because the embedded form doesn't use them.

## Values to Replace

None. `mode` and `line_items` already have real values: a one-off `payment` for one square, priced from the
fundraiser's own square price (`price_data`), so no Price IDs are needed.

**File containing the Checkout Session call:**
- [supabase/functions/fundraiser/index.ts](supabase/functions/fundraiser/index.ts) (the `checkout` action)

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| mode | payment | Nothing: a square is a one-off donation. |
| line_items | one item, `price_data` in GBP from the fundraiser | Nothing: the coach sets the price on the Fundraiser page. |

## Configured Parameters

These came from Checkout Studio and are set exactly as configured.

**Files containing these parameters:**
- [supabase/functions/fundraiser/index.ts](supabase/functions/fundraiser/index.ts)
- [docs/app.js](docs/app.js) (`fPayOpen`: Stripe.js, appearance and the form)

| Parameter | Value |
|-----------|-------|
| ui_mode | form |
| integration_identifier | custom_embedded_web_0001 |
| billing_address_collection | auto |
| phone_number_collection | { enabled: false } |
| automatic_tax | { enabled: false } |
| submit_type | auto |
| payment_method_collection | not sent (only for subscriptions) |
| API version | 2026-03-25.dahlia (all calls in the function) |
| Stripe.js | https://js.stripe.com/dahlia/stripe.js, loaded only when someone pays |
| appearance | theme stripe, labels auto, inputs spaced, as configured |
| form layout | expanded |

## Setup

1. **Activate the live Stripe account** for the company and switch on **Connect** (as a platform; Stripe charges
   connected accounts their own fees and they get the full Stripe Dashboard).
2. **Add the secrets** in Supabase (Edge Functions > Secrets), once per Supabase project. Never put keys in code or
   in chat:
   - `STRIPE_SECRET_KEY`: Developers > API keys > Secret key
   - `STRIPE_PUBLISHABLE_KEY`: Developers > API keys > Publishable key (new: the page needs it to draw the form;
     the function hands it over, so it isn't in `team.js`)
   - `STRIPE_WEBHOOK_SECRET`: from the Connect webhook below
3. **Connect webhook**: Developers > Webhooks > Add endpoint, "Events on Connected accounts", URL
   `https://<project>.supabase.co/functions/v1/fundraiser`, events `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.expired`.
4. **Run the SQL** `supabase/32_fundraiser.sql` on each team (already given to Sean as
   `fundraiser/sql/fundraiser_all_teams.sql`; the file was renumbered from 31 to 32 because 31 is fixture changes).
5. **Deploy** `supabase functions deploy fundraiser --no-verify-jwt`.
6. Optional: Settings > Payment methods for Connect. Pick which methods clubs' supporters see (card, Apple Pay,
   Google Pay, Link). Klarna and similar "pay later" options don't suit donations, so consider turning them off.

## How it works

1. A supporter picks a square and taps Pay. The page asks the `fundraiser` function for a checkout.
2. The function holds the square for 35 minutes and creates a Checkout Session on the **club's** Stripe account
   (`Stripe-Account` header), with our fee as `application_fee_amount`. It returns
   `{client_secret, account, pk, square}`.
3. The page loads Stripe.js from js.stripe.com, starts it with the publishable key and the club's account
   (`stripeAccount`), and mounts the form in a sheet over the page.
4. On confirm, Stripe takes the payment and sends the supporter to `?fund&paid=<session>`. The page asks the function
   to confirm it, and the square goes on the pitch. The webhook does the same in case the supporter closes the tab.
5. **Cancel** (or Escape) closes the sheet, expires the session and frees the square straight away.

The demo site has no real payments, so it still "pays" instantly without Stripe.

## Testing

Use a Stripe **test** (sandbox) key pair and a test connected account:
- Card that works: 4242 4242 4242 4242, any future date, any CVC
- Card that's declined: 4000 0000 0000 0002
- Card that needs 3D Secure: 4000 0025 0000 3155
- Bacs Direct Debit, if switched on: sort code 10-88-00, account 00012345

## Next steps

- Same pattern for club subs and payments (see the "Collecting subs and payments for clubs" doc): a monthly subs
  session would be `mode: "subscription"` with `payment_method_collection: "always"` and
  `subscription_data.application_fee_percent` for our cut.
- Touchline Tales' own £5 a month uses a Stripe Payment Link, so it needs no code.

## Resources

- https://support.stripe.com
- https://docs.stripe.com/mcp
- https://docs.stripe.com/checkout/form/quickstart
- https://docs.stripe.com/connect/direct-charges

## Subs and payments (added 7 November 2026)

The same function and the same club Stripe link now also take subs (`supabase/34_subs.sql`, the Subs page).

- Families signed in with their family code pay one month or a one-off cost by card (`mode: "payment"`, our fee as
  `application_fee_amount`), or start monthly payments by Direct Debit or card (`mode: "subscription"`,
  `payment_method_types` `bacs_debit` or `card`, `subscription_data.application_fee_percent`, `billing_cycle_anchor` on the
  next due day with `proration_behavior: "none"`, so nothing is taken on the day they sign up).
- Our fee on subs: secret `SUBS_FEE_BPS` (default 100 = 1%). `FREE_SCHEMAS` teams pay nothing, as for the fundraiser.
- **Add these events to the existing Connect webhook** (same URL): `checkout.session.async_payment_failed`,
  `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Direct Debit needs the club's Stripe account to have Bacs Direct Debit switched on (Stripe asks the club when it links,
  or Settings > Payment methods in the club's own dashboard).
- Run `34_subs.sql` on every team (given to Sean as `subs/sql/subs_all_teams.sql`), then redeploy the function.
- Refunds of subs are done in the club's Stripe dashboard.
