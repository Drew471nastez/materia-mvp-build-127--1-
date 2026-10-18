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

**Why it matters today, not only for USD.** Onboarding (`lib/payments/stripe/connect.ts`, `createConnectedAccount`) asks for the recipient agreement **first** for every creator whose country differs from the platform's (the code expects the platform in Romania). Stripe's own refusal text says so: "recipient ToS is not supported for platforms in RO creating accounts in RO".
- Creators outside Romania are therefore very likely on the recipient agreement.
- Stripe says those accounts cannot receive cross-border payouts, so their payouts may already be affected.
- Romanian creators get the full agreement (or transfers only) and are not affected.

**Not changed yet (as asked).** When you decide, there are two options:
- **(a) Onboarding:** stop requesting the recipient agreement and request the full agreement where Stripe allows it for that country.
- **(b) Marketplace switch:** never include a creator whose account is on the recipient agreement. In code, `marketplaceUsdFor` would also read the account's agreement.

Existing affected accounts cannot change agreement in place; Stripe support decides the path (usually a new account).

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
2. Onboard two test creators through the app: one in Romania, one outside.
3. Run, for each:
   `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-test-purchase.mjs --account acct_... --out run.json`
   It refuses live keys and checks:
   - the USD destination charge with the fee;
   - the platform settlement and conversion;
   - the transfer, and what it settled as in the creator's currency;
   - the partial refund with `reverse_transfer`, and the proportional reversal;
   - payout eligibility.
4. On the preview site, buy from Explore with `4242 4242 4242 4242`, then refund part of it from the order page. Check:
   - the order (`currency = usd`, `pricing_context = marketplace`);
   - the receipt, sale and refund emails;
   - the Payouts chart and Analytics in the store's currency.

**Pass:**
- Every check passes for the Romanian creator.
- The creator outside Romania either passes, or fails only on the agreement check, which step 1 already covers.

## 7. Activation (only with Andrew's approval)

1. Set `MARKETPLACE_USD` to **one** eligible creator id (full agreement, payouts on, no `needs-creator` prices) in Production.
2. Make one real purchase and one refund. Check Stripe, the order, the emails and the reports.
3. Widen to a list of eligible creator ids, then `all` only once the account question in step 1 is solved for everyone.
4. To go back at once: remove the variable. Orders keep the currency they were charged in.
