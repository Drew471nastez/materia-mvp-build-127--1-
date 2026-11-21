#!/usr/bin/env node
/**
 * ===========================================================================
 *  MOVE GROW SUBSCRIBERS FROM THE $29 PRICE TO THE $14 ONE (DRY RUN FIRST)
 * ===========================================================================
 * Grow went from $29 to $14 a month (lib/billing/plans PRO_PRICE_CENTS). A
 * Stripe price's amount cannot be changed, so the $14 price is a new price on
 * the same Grow product, and every subscriber still on the old one is moved
 * here, once:
 *
 *   - every active and trialing subscription on an old Grow price is listed,
 *     a page of 100 at a time, for each old price id;
 *   - its item on that price is changed to the new price with
 *     proration_behavior "none" and billing_cycle_anchor "unchanged": nothing
 *     is charged or credited now, the period they paid for is kept, and their
 *     next renewal is $14;
 *   - metadata.plan_id stays "growth", and both prices read as `growth`
 *     (lib/billing/stripe-prices), so the webhook's sync
 *     (lib/billing/subscription-sync) keeps the plan through the move.
 *
 * SAFE TO RUN AGAIN. A subscription already on the new price is not listed
 * (only old prices are), an item is moved only while it is still on an old
 * price, and each move carries an idempotency key, so a second run, or a run
 * after a failure, moves only what is left. A subscription a schedule manages
 * (a downgrade waiting for its date) is left alone and reported: run this
 * again after its date, when it is on the old price by itself.
 *
 * A failure on one subscription is logged and reported; the rest go on. The
 * exit code is 1 when anything failed.
 *
 * Before anything moves, the new price is read from Stripe and must charge
 * exactly $14.00 a month in US dollars; otherwise nothing is changed.
 *
 *   STRIPE_SECRET_KEY=sk_live_... PRICE_GROWTH_MONTHLY=price_new14 \
 *     node scripts/migrate-grow-price.mjs --dry-run
 *     node scripts/migrate-grow-price.mjs
 *
 *   --old <ids>   the old price ids, comma separated. Defaults to
 *                 PRICE_GROWTH_MONTHLY_LEGACY, else the $29 price this code
 *                 always knew (price_1SzBWaBYevnBVyznNCTOXDoS).
 *   --new <id>    the $14 price. Defaults to PRICE_GROWTH_MONTHLY.
 *   --dry-run     prints what it would change and the summary; changes nothing.
 *
 * Never run it without the owner: it changes live subscriptions.
 */

import { pathToFileURL } from "node:url"

/** The $29 Grow price (lib/billing/stripe-prices LEGACY_GROWTH_PRICE_ID). */
export const LEGACY_GROWTH_PRICE_ID = "price_1SzBWaBYevnBVyznNCTOXDoS"
/** What the new price must charge: lib/billing/plans PRO_PRICE_CENTS. */
export const NEW_GROW_PRICE_CENTS = 1400
export const MIGRATED_STATUSES = ["active", "trialing"]

/** Whether a Stripe price is the new Grow price as the cards show it: $14.00, US dollars, monthly. */
export function isShownGrowPrice(price) {
  return (
    !!price &&
    price.unit_amount === NEW_GROW_PRICE_CENTS &&
    String(price.currency).toLowerCase() === "usd" &&
    price.recurring?.interval === "month" &&
    (price.recurring?.interval_count ?? 1) === 1 &&
    price.active !== false
  )
}

const priceIdOf = (item) => (typeof item?.price === "string" ? item.price : item?.price?.id) ?? null

/**
 * THE MOVE, given a Stripe client (the real one, or a stub in
 * tests/pricing-physical-rates.test.ts). Returns what it did; never throws for
 * one subscription's failure.
 *
 * @param {object} o
 * @param {any} o.stripe           a client with prices.retrieve, subscriptions.list and subscriptions.update
 * @param {string[]} o.oldPriceIds the old Grow prices
 * @param {string} o.newPriceId    the $14 price
 * @param {boolean} [o.dryRun]
 * @param {(line: string) => void} [o.log]
 */
export async function migrateGrowPrice({ stripe, oldPriceIds, newPriceId, dryRun = false, log = console.log }) {
  const summary = { dryRun, newPriceId, oldPriceIds: [...oldPriceIds], seen: 0, moved: 0, wouldMove: 0, alreadyMoved: 0, skipped: [], failed: [] }
  const old = [...new Set(oldPriceIds.filter((id) => typeof id === "string" && id.startsWith("price_") && id !== newPriceId))]
  if (!newPriceId || !newPriceId.startsWith("price_")) throw new Error("No new price: set PRICE_GROWTH_MONTHLY or pass --new.")
  if (old.length === 0) throw new Error("No old price to move from: pass --old or set PRICE_GROWTH_MONTHLY_LEGACY.")

  const price = await stripe.prices.retrieve(newPriceId)
  if (!isShownGrowPrice(price)) {
    throw new Error(`${newPriceId} charges ${price?.unit_amount ?? "?"} ${String(price?.currency ?? "?").toUpperCase()} every ${price?.recurring?.interval_count ?? 1} ${price?.recurring?.interval ?? "?"}, not $14.00 a month. Nothing was changed.`)
  }
  const newProduct = typeof price.product === "string" ? price.product : price.product?.id
  for (const id of old) {
    try {
      const was = await stripe.prices.retrieve(id)
      const wasProduct = typeof was?.product === "string" ? was.product : was?.product?.id
      if (newProduct && wasProduct && newProduct !== wasProduct) log(`note: ${id} is on product ${wasProduct}, the new price on ${newProduct}. Both are read as Grow.`)
    } catch (e) {
      log(`note: could not read old price ${id}: ${e?.message ?? e}`)
    }
  }

  const done = new Set()
  for (const oldId of old) {
    for (const status of MIGRATED_STATUSES) {
      let startingAfter
      for (;;) {
        let page
        try {
          page = await stripe.subscriptions.list({ price: oldId, status, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) })
        } catch (e) {
          summary.failed.push({ subscription: null, price: oldId, status, error: `list failed: ${e?.message ?? e}` })
          log(`FAILED listing ${status} subscriptions on ${oldId}: ${e?.message ?? e}`)
          break
        }
        const subs = page?.data ?? []
        for (const sub of subs) {
          if (done.has(sub.id)) continue
          done.add(sub.id)
          summary.seen++
          const items = sub.items?.data ?? []
          const item = items.find((i) => old.includes(priceIdOf(i)))
          if (!item) {
            /* Listed under the old price but no longer on it: moved since the page was read. */
            if (items.some((i) => priceIdOf(i) === newPriceId)) summary.alreadyMoved++
            continue
          }
          const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
          if (sub.schedule) {
            summary.skipped.push({ subscription: sub.id, customer, reason: "managed by a subscription schedule; run again after its next phase starts" })
            log(`skip ${sub.id} (${customer}): managed by a schedule`)
            continue
          }
          const line = `${sub.id} (${customer}, ${sub.status}): ${priceIdOf(item)} -> ${newPriceId}, no proration, renews on its own date`
          if (dryRun) {
            summary.wouldMove++
            log(`would move ${line}`)
            continue
          }
          try {
            await stripe.subscriptions.update(
              sub.id,
              {
                items: [{ id: item.id, price: newPriceId }],
                proration_behavior: "none",
                billing_cycle_anchor: "unchanged",
                metadata: { ...(sub.metadata ?? {}), plan_id: "growth" },
              },
              { idempotencyKey: `storelib:grow-price-move:${sub.id}:${newPriceId}` },
            )
            summary.moved++
            log(`moved ${line}`)
          } catch (e) {
            summary.failed.push({ subscription: sub.id, customer, error: e?.message ?? String(e) })
            log(`FAILED ${sub.id} (${customer}): ${e?.message ?? e}`)
          }
        }
        if (!page?.has_more || subs.length === 0) break
        startingAfter = subs[subs.length - 1].id
      }
    }
  }

  log(
    `${dryRun ? "DRY RUN. " : ""}${summary.seen} subscription(s) found on ${old.join(", ")}: ${dryRun ? `${summary.wouldMove} would move` : `${summary.moved} moved`}, ${summary.alreadyMoved} already moved, ${summary.skipped.length} skipped, ${summary.failed.length} failed.`,
  )
  for (const s of summary.skipped) log(`  skipped ${s.subscription}: ${s.reason}`)
  for (const f of summary.failed) log(`  failed ${f.subscription ?? f.price}: ${f.error}`)
  return summary
}

/* ── Run from the command line ─────────────────────────────────────────── */

function argValue(args, name) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    console.error("Set STRIPE_SECRET_KEY.")
    process.exit(2)
  }
  const newPriceId = argValue(args, "--new") || process.env.PRICE_GROWTH_MONTHLY || ""
  const oldList = argValue(args, "--old") || process.env.PRICE_GROWTH_MONTHLY_LEGACY || LEGACY_GROWTH_PRICE_ID
  const oldPriceIds = oldList.split(",").map((s) => s.trim()).filter(Boolean)
  const { default: Stripe } = await import("stripe")
  const stripe = new Stripe(key)
  try {
    const summary = await migrateGrowPrice({ stripe, oldPriceIds, newPriceId, dryRun })
    process.exit(summary.failed.length > 0 ? 1 : 0)
  } catch (e) {
    console.error(e?.message ?? e)
    process.exit(2)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
