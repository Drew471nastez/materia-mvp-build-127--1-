#!/usr/bin/env node
/**
 * ===========================================================================
 *  UNDO THE 4.6 MULTIPLICATION, ONLY WHERE AN ORDER PROVES IT (DRY RUN FIRST)
 * ===========================================================================
 * Reads the report scripts/price-audit.mjs wrote (--from audit.json) and, for
 * each product it marked confirmed, PROVES IT AGAIN from the database before
 * anything is touched: the marker, the product's age, an order before the
 * multiplication at exactly today's price / 4.6 in the currency the store
 * sells in now, and no price edit since. A product with options is restored
 * only when every option made before the multiplication is proven by its own
 * order too; otherwise it is skipped whole, never half restored.
 *
 * Without --apply it prints what it would do and changes nothing.
 * With --apply it needs --approved-by "<name>" and, for every field:
 *   1. writes a price_corrections row (SQL part 245) with before, after, proof
 *   2. updates the field only if it still holds the value read (no overwrite of
 *      a price someone changed in the meantime)
 *   3. marks the row applied
 * --undo <batch> puts back every field of a batch that is still at its
 * corrected value. Orders, payments and receipts are never touched.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_PLATFORM_CURRENCY=usd \
 *     node scripts/price-restore.mjs --from audit.json                 (dry run)
 *     node scripts/price-restore.mjs --from audit.json --only <id,...> --apply --approved-by "Andrew"
 *     node scripts/price-restore.mjs --undo <batch> --approved-by "Andrew"
 */
import { readFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { knownCurrency, original, multiplied, verdictOf } from "./price-audit.mjs"

const args = process.argv.slice(2)
const opt = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const FROM = opt("--from")
const ONLY = (opt("--only") || "").split(",").map((s) => s.trim()).filter(Boolean)
const APPLY = args.includes("--apply")
const UNDO = opt("--undo")
const APPROVED_BY = opt("--approved-by")

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PLATFORM = (process.env.NEXT_PUBLIC_PLATFORM_CURRENCY || "").toLowerCase()
const H = () => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", Prefer: "return=representation" })

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H() })
  if (!res.ok) throw new Error(`read ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
async function send(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: H(), body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** Every field to put back for one product, proven now, or why not. */
async function planFor(id, appliedAt, logStartedAt) {
  const [p] = await get(`products?select=id,creator_id,title,price_cents,pwyw_min_price_cents,pwyw_suggested_price_cents,compare_at_cents,created_at&id=eq.${id}`)
  if (!p) return { id, skip: "no such product" }
  const [s] = await get(`store_settings?select=currency&creator_id=eq.${p.creator_id}`)
  const preOrders = await get(`orders?select=amount_cents,tip_cents,currency,variant_id,variant_price_cents&product_id=eq.${id}&created_at=lt.${encodeURIComponent(appliedAt)}&status=in.(completed,refunded)&limit=200`)
  const edits = await get(`store_activity_log?select=id&action=eq.product.price&subject_id=eq.${id}&created_at=gt.${encodeURIComponent(appliedAt)}&limit=1`)
  const v = verdictOf({ appliedAt, product: p, storeCurrency: knownCurrency(s?.currency), platformCurrency: PLATFORM, preOrders, priceEditsSince: edits.length, logStartedAt })
  if (v.verdict !== "confirmed") return { id, skip: `not proven now: ${v.reason}` }
  const fields = [{ field: "price_cents", before: p.price_cents, after: v.original_cents }]
  for (const f of ["pwyw_min_price_cents", "pwyw_suggested_price_cents", "compare_at_cents"]) {
    const x = p[f]
    if (typeof x === "number" && x > 0) {
      if (multiplied(original(x)) !== x) return { id, skip: `${f} is not a multiplied value, so it was edited since` }
      fields.push({ field: f, before: x, after: original(x) })
    }
  }
  const variants = await get(`product_variants?select=id,price_cents,created_at&product_id=eq.${id}`)
  for (const vr of variants) {
    if (!(vr.price_cents > 0) || !(Date.parse(vr.created_at) < Date.parse(appliedAt))) continue
    const proven = preOrders.some((o) => o.variant_id === vr.id && knownCurrency(o.currency) === v.currency && o.variant_price_cents === original(vr.price_cents))
    if (!proven) return { id, skip: `option ${vr.id} existed before the multiplication but no order proves its price, so the product is left whole` }
    fields.push({ field: "variant_price_cents", variant: vr.id, before: vr.price_cents, after: original(vr.price_cents) })
  }
  return { id, title: p.title, currency: v.currency, proof: v.reason, fields }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Nothing was read or changed.")
    process.exit(2)
  }
  if ((APPLY || UNDO) && !(APPROVED_BY && APPROVED_BY.trim().length >= 2)) {
    console.error("--apply and --undo need --approved-by \"<who approved this>\". Nothing was changed.")
    process.exit(2)
  }

  if (UNDO) {
    const rows = await get(`price_corrections?select=*&batch=eq.${encodeURIComponent(UNDO)}&applied_at=not.is.null&undone_at=is.null`)
    let back = 0
    for (const r of rows) {
      const target = r.variant_id ? `product_variants?id=eq.${r.variant_id}&price_cents=eq.${r.after_cents}` : `products?id=eq.${r.product_id}&${r.field}=eq.${r.after_cents}`
      const changed = await send("PATCH", target, r.variant_id ? { price_cents: r.before_cents } : { [r.field]: r.before_cents })
      if (changed.length) {
        await send("PATCH", `price_corrections?id=eq.${r.id}`, { undone_at: new Date().toISOString() })
        back++
      } else console.log(`  left as is (changed since): ${r.product_id} ${r.field}`)
    }
    console.log(`Undone ${back} of ${rows.length} fields of batch ${UNDO}.`)
    return
  }

  if (!FROM) {
    console.error("--from <audit.json> (from scripts/price-audit.mjs --out). Nothing was changed.")
    process.exit(2)
  }
  if (!/^[a-z]{3}$/.test(PLATFORM)) {
    console.error("Set NEXT_PUBLIC_PLATFORM_CURRENCY to what production uses (usd or ron); the proof needs it. Nothing was changed.")
    process.exit(2)
  }
  const audit = JSON.parse(readFileSync(FROM, "utf8"))
  const markers = await get("platform_migrations?select=key,applied_at&key=eq.currency_ron_2026")
  const appliedAt = markers[0]?.applied_at
  if (!appliedAt) {
    console.error("No currency_ron_2026 marker: no multiplication is recorded, so there is nothing to undo.")
    process.exit(1)
  }
  const firstLog = await get("store_activity_log?select=created_at&order=created_at.asc&limit=1").catch(() => [])
  const ids = audit.products.filter((p) => p.verdict === "confirmed").map((p) => p.id).filter((id) => !ONLY.length || ONLY.includes(id))
  const batch = `ao-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString("hex")}`
  console.log(`${APPLY ? "Applying" : "Dry run (nothing changes)"}: ${ids.length} confirmed product(s)${APPLY ? `, batch ${batch}, approved by ${APPROVED_BY}` : ""}`)
  let done = 0
  for (const id of ids) {
    const plan = await planFor(id, appliedAt, firstLog[0]?.created_at ?? null)
    if (plan.skip) {
      console.log(`  skip  ${id}: ${plan.skip}`)
      continue
    }
    for (const f of plan.fields) console.log(`  ${APPLY ? "fix " : "would"}  ${id}${f.variant ? ` option ${f.variant}` : ""} ${f.field}: ${(f.before / 100).toFixed(2)} -> ${(f.after / 100).toFixed(2)} ${plan.currency}`)
    if (!APPLY) continue
    for (const f of plan.fields) {
      const [row] = await send("POST", "price_corrections", { batch, product_id: id, variant_id: f.variant ?? null, field: f.field, before_cents: f.before, after_cents: f.after, proof: plan.proof.slice(0, 600), approved_by: APPROVED_BY.slice(0, 120) })
      const target = f.variant ? `product_variants?id=eq.${f.variant}&price_cents=eq.${f.before}` : `products?id=eq.${id}&${f.field}=eq.${f.before}`
      const changed = await send("PATCH", target, f.variant ? { price_cents: f.after } : { [f.field]: f.after })
      if (changed.length) await send("PATCH", `price_corrections?id=eq.${row.id}`, { applied_at: new Date().toISOString() })
      else console.log(`    not changed: ${f.field} moved since it was read (its record stays unapplied)`)
    }
    done++
  }
  console.log(APPLY ? `\nRestored ${done} product(s). Undo with: --undo ${batch} --approved-by "<name>"` : "\nNothing was changed. Add --apply --approved-by \"<name>\" to restore these.")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
