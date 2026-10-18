# Marketplace USD: production launch checklist

`MARKETPLACE_USD` stays unset (off) until Andrew approves activation. Nothing in this list turns it on by itself. Each step says who runs it, what it proves, and what "pass" looks like.

## 0. What Stripe confirmed (Oct 2026)

- Supported:
  - USD destination charges.
  - Automatic currency conversion.
  - Settlement into the creator's supported currency.
- **Not supported:** cross-border payouts to connected accounts on the **recipient** service agreement.

## 1. Connect accounts (blocker)

Run `STRIPE_SECRET_KEY=<live read-only key> node scripts/connect-audit.mjs --out connect.json`. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to name each store and count its orders. It only reads (GET), and it shows bank accounts only by currency and country.

**Pass:**
- You know every account marked `affected` (recipient agreement) and `not-ready`.
- You have decided what to do for each before activation.

**What Stripe's docs say (docs.stripe.com/connect/cross-border-payouts, checked Oct 2026):**
- Cross-border payouts work only between the US, UK, EEA, Canada and Switzerland. Romania is in the EEA.
- They don't work on the recipient agreement.
- They don't work for destination charges with `on_behalf_of`.
- An agreement can't be changed after it is accepted.

**Fixed in round AP (onboarding, for new creators):** `createConnectedAccount` used to ask for the recipient agreement first for every creator outside Romania. Now:
- It never asks for the recipient agreement.
- A creator in another country of the region gets a full agreement account with transfers only, and no card payments, so no sale can go `on_behalf_of` it.
- A creator outside the region is told in plain words that payouts to their country aren't available yet, and no account is opened.
- An unfinished recipient account with nothing submitted is swapped for a new one, like unfinished Express accounts already were.

The shapes are in `lib/payments/stripe/account-attempts.ts` and the region list in `lib/payments/stripe/payout-regions.ts`, both pinned by `tests/round-ap.test.ts`.

**Still open (existing creators, needs the live audit):** the audit marks as `affected` every account on the recipient agreement, and every account in a country outside the region. For each one:
1. If it has a balance, it has to be paid out or settled first (ask Stripe support how, since recipient accounts can't take cross-border payouts).
2. With the balance at zero, the creator uses **Disconnect** in Settings › Payments (it refuses while money is in the account) and sets up payments again. The new account is the full agreement one.
3. A creator outside the region can't be paid out by a Romanian platform at all. The options are a creator bank account in a supported country, or a conversation with Stripe sales (Global Payouts is for US and UK platforms only).

The audit also warns on cross-border accounts that can take cards. Keep `NEXT_PUBLIC_SELLER_STATEMENT_NAME` unset while any of those exist, because it makes sales `on_behalf_of` them.

## 2. Prices (blocker for the stores involved)

Run `node scripts/price-audit.mjs --out audit.json` with the production service key and `NEXT_PUBLIC_PLATFORM_CURRENCY` set to production's value. It only reads.

- **`confirmed`** means proven by the product's own order from before the 4.6 multiplication.
  1. Review the list.
  2. Run `node scripts/price-restore.mjs --from audit.json` (a dry run; it prints the changes).
  3. Then add `--apply --approved-by "<name>"`.

  Every change is recorded in `price_corrections` (SQL part 245) and can be undone with `--undo <batch>`. Orders never change.
- **`needs-creator`** means no order proves the original price or currency. Ask the creator; never restore these automatically.

**Pass:**
- Every `confirmed` product is restored or deliberately left as it is.
- Every `needs-creator` product has the creator's answer.

## 3. Database (SQL parts 244 and 245)

In the Supabase SQL editor:
1. Run `supabase/sql/runbooks/am-ao-1-preflight.sql` and save the output.
2. Run `am-ao-2-apply.sql`. If it says "lock timeout", run it again.
3. Run `am-ao-3-postflight.sql`.

Rehearsed on PostgreSQL 16 with 200,000 orders:
- 50 ms;
- backed off cleanly after 5 seconds while another session held a lock;
- order and product fingerprints identical before and after.

**Pass:**
- The postflight's fingerprints equal the preflight's.
- `p244` and `p245` are true.

## 4. Orders reconciliation

Run `node scripts/reconcile-order-currency.mjs --prices` with the production service key and `STRIPE_SECRET_KEY`. It only reads.

**Pass:** every `unknown` and `differs from Stripe` row is explained.

Emails for orders with no known currency are held and appear on the admin Health view.

## 5. Settings

- Admin › Payments › Configuration shows **Platform currency** (expected USD, matching live Explore) and **Marketplace in US dollars: off**.
- Reports: the Payouts revenue chart now counts a partly refunded sale and takes off only the refunded part, as Analytics and Home already did.

## 6. Real Stripe test mode (blocker)

1. Use a **preview** deployment with Stripe **test** keys and `MARKETPLACE_USD` set in the **Preview** environment only, to one test creator.
2. Run it twice, once for a Romanian test creator and once for one in another region country:
   `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-test-purchase.mjs --create-account RO --out run-ro.json`
   `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-test-purchase.mjs --create-account DE --out run-de.json`
   `--create-account` opens the account the way onboarding now does and fills it with Stripe's test identity and test bank. To use an account onboarded through the app instead, pass `--account acct_...`.
3. It refuses live keys and checks:
   - the USD destination charge with the fee;
   - the platform settlement and conversion;
   - the transfer, and what it settled as in the creator's currency;
   - the partial refund with `reverse_transfer`, and the proportional reversal;
   - payout eligibility (agreement, region, no card payments across the border);
   - a real test payout of the creator's balance, in the currency the sale settled in.
4. On the preview site, buy from Explore with `4242 4242 4242 4242`, then refund part of it from the order page. Check:
   - the order (`currency = usd`, `pricing_context = marketplace`);
   - the receipt, sale and refund emails;
   - the Payouts chart and Analytics in the store's currency.

**Pass:**
- Every check passes for the Romanian creator.
- Every check passes for the German creator too. A failure here is a blocker, not something to explain away.

## 7. Activation (only with Andrew's approval)

1. Set `MARKETPLACE_USD` to **one** eligible creator id (full agreement, payouts on, no `needs-creator` prices) in Production.
2. Make one real purchase and one refund. Check Stripe, the order, the emails and the reports.
3. Widen to a list of eligible creator ids, then `all` only once the account question in step 1 is solved for everyone.
4. To go back at once: remove the variable. Orders keep the currency they were charged in.
