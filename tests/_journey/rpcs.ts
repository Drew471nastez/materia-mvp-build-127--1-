/**
 * The database functions the commerce flow calls, ported from the SQL that
 * defines them (each names its file), so the journey's stock, ledger, code
 * and copy counts move exactly as Postgres moves them. A port is line for
 * line with its plpgsql; where the SQL raises, this throws a PgError with the
 * same code and message.
 */
import { PgError, type MemoryDb, type Row } from "./postgrest"

const now = () => new Date().toISOString()

function level(db: MemoryDb, variant: string, location: string, creator: string): Row {
  let lvl = db.rows("inventory_levels").find((l) => l.variant_id === variant && l.location_id === location)
  if (!lvl) {
    lvl = { variant_id: variant, location_id: location, creator_id: creator, on_hand: 0, committed: 0, incoming: 0, updated_at: now() }
    db.rows("inventory_levels").push(lvl)
  }
  return lvl
}
const avail = (l: Row) => (Number(l.on_hand) || 0) - (Number(l.committed) || 0)

let movementId = 1
function movement(db: MemoryDb, m: Row): boolean {
  if (m.idempotency_key && db.rows("inventory_movements").some((x) => x.idempotency_key === m.idempotency_key)) return false
  db.rows("inventory_movements").push({ id: movementId++, delta_on_hand: 0, delta_committed: 0, delta_incoming: 0, actor: "system", created_at: now(), ...m })
  return true
}

export function installRpcs(db: MemoryDb) {
  /*
    supabase/migrations/20271130_forms_bookings.sql native_form_book and
    20271410_bookings_calendar.sql native_form_book_capped: the response and
    its booking in one step, the same submission sent again answered with the
    first, a held start or an overlap refused (the table's own exclusion), the
    daily limit (23514). The advisory lock is the single thread here.
  */
  const formBook = (d: MemoryDb, a: Record<string, any>) => {
    const sub = a.p_submission as Row
    if (!["pending", "confirmed"].includes(a.p_status)) throw new PgError("22023", "invalid booking status")
    if (!d.rows("native_forms").some((f) => f.id === sub.form_id && f.owner_id === sub.owner_id && f.status === "published")) throw new PgError("P0002", "form not found")
    const again = d.rows("form_submissions").find((s) => s.form_id === sub.form_id && s.dedupe_key === sub.dedupe_key)
    if (again) return [{ submission_id: again.id, booking_id: d.rows("form_bookings").find((b) => b.submission_id === again.id)?.id ?? null, duplicate: true }]
    const start = Date.parse(a.p_starts_at)
    const end = Date.parse(a.p_ends_at)
    const clash = d.rows("form_bookings").some((b) => b.owner_id === sub.owner_id && ["pending", "confirmed"].includes(b.status) && Date.parse(b.starts_at) < end && start < Date.parse(b.hold_until ?? b.ends_at))
    if (clash) throw new PgError("23P01", "conflicting key value violates exclusion constraint")
    const [submission] = d.insert("form_submissions", { owner_id: sub.owner_id, form_id: sub.form_id, form_revision: sub.form_revision, form_title: sub.form_title, answers: sub.answers, contact_name: sub.contact_name, contact_email: sub.contact_email, contact_phone: sub.contact_phone, score: sub.score ?? 0, consent: sub.consent, source_kind: sub.source_kind ?? "form", source_url: sub.source_url, source_block: sub.source_block, dedupe_key: sub.dedupe_key }, {})
    const paid = !!a.p_payment_product_id
    const [booking] = d.insert("form_bookings", { owner_id: sub.owner_id, form_id: sub.form_id, submission_id: submission.id, starts_at: a.p_starts_at, ends_at: a.p_ends_at, hold_until: a.p_hold_until, visitor_timezone: a.p_visitor_timezone, status: paid ? "pending" : a.p_status, payment_product_id: a.p_payment_product_id ?? null, decided_at: a.p_status === "confirmed" && !paid ? new Date().toISOString() : null, payment_status: paid ? "unpaid" : "none", payment_due_at: paid ? new Date(Date.now() + 30 * 60_000).toISOString() : null }, {})
    return [{ submission_id: submission.id, booking_id: booking.id, duplicate: false }]
  }
  db.rpcs.native_form_book = formBook
  db.rpcs.native_form_book_capped = (d, a) => {
    const sub = a.p_submission as Row
    if ((a.p_max_per_day ?? 0) > 0 && !d.rows("form_submissions").some((s) => s.form_id === sub.form_id && s.dedupe_key === sub.dedupe_key)) {
      const taken = d.rows("form_bookings").filter((b) => b.form_id === sub.form_id && ["pending", "confirmed"].includes(b.status) && b.starts_at >= a.p_day_start && b.starts_at < a.p_day_end).length
      if (taken >= a.p_max_per_day) throw new PgError("23514", "daily limit reached")
    }
    const out = formBook(d, a) as { submission_id: string; booking_id: string | null; duplicate: boolean }[]
    const r = out[0]
    if (r?.booking_id && !r.duplicate) {
      const b = d.rows("form_bookings").find((x) => x.id === r.booking_id)
      if (b) Object.assign(b, { duration_minutes: a.p_duration_minutes, location: a.p_location, updated_at: new Date().toISOString() })
    }
    return out
  }

  /* supabase/sql/run-now/305_translation_providers.sql: a day's calls per translator and model, added to. */
  db.rpcs.translation_usage_add = (d, a) => {
    const rows = d.rows("translation_provider_usage")
    let r = rows.find((x) => x.day === a.p_day && x.provider === a.p_provider && x.model === (a.p_model || "-"))
    if (!r) {
      r = { day: a.p_day, provider: a.p_provider, model: a.p_model || "-", calls: 0, ok: 0, failed: 0, limited: 0, strings: 0, chars: 0, input_tokens: 0, output_tokens: 0 }
      rows.push(r)
    }
    for (const [k, col] of [["p_calls", "calls"], ["p_ok", "ok"], ["p_failed", "failed"], ["p_limited", "limited"], ["p_strings", "strings"], ["p_chars", "chars"], ["p_input_tokens", "input_tokens"], ["p_output_tokens", "output_tokens"]] as const) r[col] = Number(r[col]) + Math.max(0, Number(a[k] ?? 0))
    r.updated_at = new Date().toISOString()
    return null
  }

  /* run-now 32_orders_keep_sales.sql: orders_fill_creator, BEFORE INSERT OR UPDATE OF product_id. */
  db.beforeWrite.orders = (row, d) => {
    if (row.product_id) row.creator_id = d.rows("products").find((p) => p.id === row.product_id)?.creator_id ?? null
  }

  /* supabase/sql/run-now/78_physical_commerce.sql */
  db.rpcs.physical_inventory_apply = (d, a) => {
    if (a.p_key && d.rows("inventory_movements").some((m) => m.idempotency_key === a.p_key)) {
      const l = d.rows("inventory_levels").find((x) => x.variant_id === a.p_variant && x.location_id === a.p_location) ?? {}
      return { applied: false, repeat: true, on_hand: l.on_hand, committed: l.committed, incoming: l.incoming, available: avail(l) }
    }
    const v = d.rows("product_variants").find((x) => x.id === a.p_variant)
    const owner = v ? d.rows("products").find((p) => p.id === v.product_id)?.creator_id : null
    const locOwner = d.rows("inventory_locations").find((l) => l.id === a.p_location)?.creator_id
    if (!owner || owner !== a.p_creator || !locOwner || locOwner !== a.p_creator) return { applied: false, error: "not_found" }
    const lvl = level(d, a.p_variant, a.p_location, a.p_creator)
    const onHand = lvl.on_hand + (a.p_on_hand ?? 0)
    let committed = lvl.committed + (a.p_committed ?? 0)
    let incoming = lvl.incoming + (a.p_incoming ?? 0)
    if (committed < 0) committed = 0
    if (incoming < 0) incoming = 0
    if (a.p_guard && onHand - committed < 0 && ((a.p_on_hand ?? 0) < 0 || (a.p_committed ?? 0) > 0)) return { applied: false, error: "insufficient", available: avail(lvl) }
    const before = { ...lvl }
    Object.assign(lvl, { on_hand: onHand, committed, incoming, updated_at: now() })
    movement(d, {
      creator_id: a.p_creator,
      variant_id: a.p_variant,
      location_id: a.p_location,
      delta_on_hand: onHand - before.on_hand,
      delta_committed: committed - before.committed,
      delta_incoming: incoming - before.incoming,
      on_hand_after: onHand,
      committed_after: committed,
      incoming_after: incoming,
      reason: a.p_reason,
      ref_type: a.p_ref_type,
      ref_id: a.p_ref_id,
      note: a.p_note ? String(a.p_note).slice(0, 500) : null,
      actor: a.p_actor ?? "system",
      idempotency_key: a.p_key,
    })
    return { applied: true, on_hand: onHand, committed, incoming, available: onHand - committed }
  }

  db.rpcs.physical_reserve = (d, a) => {
    const co = d.rows("commerce_checkouts").find((c) => c.id === a.p_checkout)
    if (!co) return { applied: false, error: "not_found" }
    if (d.rows("inventory_reservations").some((r) => r.checkout_id === a.p_checkout)) return { applied: false, repeat: true }
    const lines = [...(a.p_lines as Row[])].sort((x, y) => `${x.variant_id}${x.location_id}`.localeCompare(`${y.variant_id}${y.location_id}`))
    /* All or none: a transaction, so a later line's refusal undoes the earlier ones. */
    const snapshot = JSON.stringify({ l: d.rows("inventory_levels"), m: d.rows("inventory_movements"), r: d.rows("inventory_reservations") })
    try {
      let held = 0
      for (const ln of lines) {
        if (!ln.quantity || ln.quantity < 1) throw new PgError("P0001", "physical_reserve: bad quantity")
        const lvl = level(d, ln.variant_id, ln.location_id, co.creator_id)
        if (lvl.creator_id !== co.creator_id) throw new PgError("P0001", "physical_reserve: not this shop")
        if (!ln.oversell && avail(lvl) < ln.quantity) throw new PgError("P0001", `out_of_stock:${ln.variant_id}:${Math.max(avail(lvl), 0)}`)
        const before = { ...lvl }
        lvl.committed += ln.quantity
        movement(d, { creator_id: co.creator_id, variant_id: ln.variant_id, location_id: ln.location_id, delta_committed: ln.quantity, on_hand_after: before.on_hand, committed_after: before.committed + ln.quantity, incoming_after: before.incoming, reason: "order_reserved", ref_type: "checkout", ref_id: a.p_checkout, actor: "buyer", idempotency_key: `reserve:${a.p_checkout}:${ln.variant_id}:${ln.location_id}` })
        d.rows("inventory_reservations").push({ id: crypto.randomUUID(), checkout_id: a.p_checkout, creator_id: co.creator_id, variant_id: ln.variant_id, location_id: ln.location_id, quantity: ln.quantity, status: "held", fulfilled_quantity: 0, expires_at: a.p_expires, created_at: now(), updated_at: now() })
        held++
      }
      return { applied: true, held }
    } catch (e) {
      const s = JSON.parse(snapshot)
      d.tables.inventory_levels = s.l
      d.tables.inventory_movements = s.m
      d.tables.inventory_reservations = s.r
      throw e
    }
  }

  db.rpcs.physical_release = (d, a) => {
    let released = 0
    for (const r of d.rows("inventory_reservations").filter((x) => x.checkout_id === a.p_checkout && x.status === "held")) {
      if (r.variant_id && r.location_id) {
        const lvl = level(d, r.variant_id, r.location_id, r.creator_id)
        lvl.committed = Math.max(lvl.committed - r.quantity, 0)
        movement(d, { creator_id: r.creator_id, variant_id: r.variant_id, location_id: r.location_id, delta_committed: -r.quantity, reason: "reservation_released", ref_type: "checkout", ref_id: a.p_checkout, actor: "system", idempotency_key: `release:${r.id}` })
      }
      r.status = "released"
      r.updated_at = now()
      released++
    }
    return released
  }

  db.rpcs.physical_mark_sold = (d, a) => {
    let again = 0
    for (const r of d.rows("inventory_reservations").filter((x) => x.checkout_id === a.p_checkout)) {
      if (r.status === "held") Object.assign(r, { status: "sold", expires_at: null, updated_at: now() })
      else if (r.status === "released" && r.variant_id && r.location_id) {
        const lvl = level(d, r.variant_id, r.location_id, r.creator_id)
        lvl.committed += r.quantity
        movement(d, { creator_id: r.creator_id, variant_id: r.variant_id, location_id: r.location_id, delta_committed: r.quantity, reason: "order_reserved", ref_type: "checkout", ref_id: a.p_checkout, note: "Paid after the hold expired", actor: "system", idempotency_key: `resold:${r.id}` })
        Object.assign(r, { status: "sold", expires_at: null, updated_at: now() })
        again++
      }
    }
    return { applied: true, recommitted: again }
  }

  db.rpcs.physical_fulfill = (d, a) => {
    const f = d.rows("fulfillments").find((x) => x.id === a.p_fulfillment)
    if (!f) return 0
    let moved = 0
    const items = d.rows("fulfillment_items").filter((i) => i.fulfillment_id === f.id)
    for (const it of items) {
      const o = d.rows("orders").find((x) => x.id === it.order_id)
      if (!o) continue
      const v = d.rows("product_variants").find((x) => x.id === o.variant_id)
      const p = d.rows("products").find((x) => x.id === o.product_id)
      const location = o.fulfillment_location_id ?? f.location_id
      const tracked = v?.track_inventory ?? p?.track_inventory ?? true
      if (!o.variant_id || !location || !tracked) continue
      const key = `fulfill:${f.id}:${o.id}`
      if (d.rows("inventory_movements").some((m) => m.idempotency_key === key)) continue
      const lvl = level(d, o.variant_id, location, f.creator_id)
      const before = { ...lvl }
      lvl.on_hand -= it.quantity
      lvl.committed = Math.max(lvl.committed - it.quantity, 0)
      movement(d, { creator_id: f.creator_id, variant_id: o.variant_id, location_id: location, delta_on_hand: -it.quantity, delta_committed: -Math.min(it.quantity, before.committed), on_hand_after: before.on_hand - it.quantity, committed_after: Math.max(before.committed - it.quantity, 0), incoming_after: before.incoming, reason: "sale_fulfilled", ref_type: "fulfillment", ref_id: f.id, actor: "creator", idempotency_key: key })
      for (const r of d.rows("inventory_reservations").filter((x) => x.checkout_id === f.checkout_id && x.variant_id === o.variant_id && x.location_id === location && ["held", "sold"].includes(x.status))) {
        const next = r.fulfilled_quantity + it.quantity
        r.status = next >= r.quantity ? "fulfilled" : r.status
        r.fulfilled_quantity = Math.min(r.quantity, next)
        r.updated_at = now()
      }
      moved++
    }
    return moved
  }

  db.rpcs.physical_cancel_unfulfilled = (d, a) => {
    let done = 0
    for (const r of d.rows("inventory_reservations").filter((x) => x.checkout_id === a.p_checkout && ["held", "sold"].includes(x.status))) {
      const left = r.quantity - r.fulfilled_quantity
      if (left > 0 && r.variant_id && r.location_id) {
        const lvl = level(d, r.variant_id, r.location_id, r.creator_id)
        lvl.committed = Math.max(lvl.committed - left, 0)
        movement(d, { creator_id: r.creator_id, variant_id: r.variant_id, location_id: r.location_id, delta_committed: -left, reason: "order_cancelled", ref_type: "checkout", ref_id: a.p_checkout, actor: "creator", idempotency_key: `cancel:${r.id}` })
      }
      r.status = "released"
      done++
    }
    return done
  }

  db.rpcs.physical_expire_holds = (d, a) => {
    let n = 0
    const ids = new Set(
      d
        .rows("inventory_reservations")
        .filter((r) => r.status === "held" && r.expires_at && r.expires_at < now() && d.rows("commerce_checkouts").find((c) => c.id === r.checkout_id)?.status !== "paid")
        .map((r) => r.checkout_id),
    )
    for (const id of [...ids].slice(0, Math.max(a.p_limit ?? 100, 1))) {
      d.rpcs.physical_release(d, { p_checkout: id, p_reason: "expired" })
      const c = d.rows("commerce_checkouts").find((x) => x.id === id && x.status === "pending")
      if (c) Object.assign(c, { status: "expired", updated_at: now() })
      n++
    }
    return n
  }

  db.rpcs.commerce_claim_jobs = (d, a) => {
    const due = d
      .rows("commerce_jobs")
      .filter((j) => (["queued", "failed"].includes(j.status) && j.run_after <= now()) || (j.status === "running" && j.locked_until < now()))
      .sort((x, y) => String(x.run_after).localeCompare(String(y.run_after)))
      .slice(0, Math.max(a.p_limit ?? 20, 1))
    for (const j of due) Object.assign(j, { status: "running", attempts: (j.attempts ?? 0) + 1, locked_until: new Date(Date.now() + Math.max(a.p_lease_seconds ?? 120, 30) * 1000).toISOString(), updated_at: now() })
    return due.map((j) => ({ ...j }))
  }

  /* increment_product_sales (supabase migrations) */
  db.rpcs.increment_product_sales = (d, a) => {
    const p = d.rows("products").find((x) => x.id === a.p_product_id)
    if (p) p.sales_count = (p.sales_count ?? 0) + 1
    return undefined
  }

  /* run-now 150_products_sales_limit.sql */
  const copiesSold = (d: MemoryDb, product: string) =>
    d
      .rows("orders")
      .filter((o) => o.product_id === product && (o.status === "completed" || (o.status === "refunded" && (o.refund_amount_cents ?? 0) > 0 && o.refund_amount_cents < (o.amount_cents ?? 0))))
      .reduce((n, o) => n + Math.max(1, o.quantity ?? 1), 0)
  db.rpcs.product_copies_sold = (d, a) => copiesSold(d, a.p_product)
  db.rpcs.hold_product_sale = (d, a) => {
    const q = Math.max(1, Math.min(a.p_quantity ?? 1, 1000))
    if (!a.p_holder || String(a.p_holder).length < 1 || String(a.p_holder).length > 200) return false
    const p = d.rows("products").find((x) => x.id === a.p_product)
    if (!p) return false
    d.tables.product_sale_holds = d.rows("product_sale_holds").filter((h) => !(h.product_id === a.p_product && h.expires_at < now()))
    if (p.sales_limit === null || p.sales_limit === undefined) return true
    const sold = copiesSold(d, a.p_product)
    const others = d.rows("product_sale_holds").filter((h) => h.product_id === a.p_product && h.holder !== a.p_holder).reduce((n, h) => n + h.quantity, 0)
    if (sold + others + q > p.sales_limit) return false
    const expires = new Date(Date.now() + Math.max(60, Math.min(a.p_seconds ?? 2100, 86400)) * 1000).toISOString()
    const had = d.rows("product_sale_holds").find((h) => h.product_id === a.p_product && h.holder === a.p_holder)
    if (had) Object.assign(had, { quantity: q, expires_at: expires })
    else d.rows("product_sale_holds").push({ product_id: a.p_product, holder: a.p_holder, quantity: q, expires_at: expires, created_at: now() })
    return true
  }
  db.rpcs.release_product_sale = (d, a) => {
    d.tables.product_sale_holds = d.rows("product_sale_holds").filter((h) => !(h.product_id === a.p_product && h.holder === a.p_holder))
    return undefined
  }
  db.rpcs.product_sales_status = (d, a) =>
    d
      .rows("products")
      .filter((p) => (a.p_products ?? []).includes(p.id) && p.sales_limit !== null && p.sales_limit !== undefined)
      .map((p) => ({ product_id: p.id, sales_limit: p.sales_limit, sold: copiesSold(d, p.id), held: d.rows("product_sale_holds").filter((h) => h.product_id === p.id && h.expires_at >= now()).reduce((n, h) => n + h.quantity, 0) }))

  /* coupon holds */
  db.rpcs.hold_coupon_use = (d, a) => {
    const c = d.rows("coupons").find((x) => x.id === a.p_coupon_id)
    if (!c) return false
    d.tables.coupon_holds = d.rows("coupon_holds").filter((h) => !(h.coupon_id === a.p_coupon_id && h.expires_at < now()))
    if (c.usage_limit === null || c.usage_limit === undefined) return true
    const others = d.rows("coupon_holds").filter((h) => h.coupon_id === a.p_coupon_id && h.holder !== a.p_holder).length
    if ((c.usage_count ?? 0) + others >= c.usage_limit) return false
    const expires = new Date(Date.now() + Math.max(60, Math.min(a.p_seconds ?? 2100, 86400)) * 1000).toISOString()
    const had = d.rows("coupon_holds").find((h) => h.coupon_id === a.p_coupon_id && h.holder === a.p_holder)
    if (had) had.expires_at = expires
    else d.rows("coupon_holds").push({ coupon_id: a.p_coupon_id, holder: a.p_holder, expires_at: expires })
    return true
  }
  db.rpcs.use_coupon_hold = (d, a) => {
    const c = d.rows("coupons").find((x) => x.id === a.p_coupon_id)
    if (c) c.usage_count = (c.usage_count ?? 0) + 1
    d.tables.coupon_holds = d.rows("coupon_holds").filter((h) => !(h.coupon_id === a.p_coupon_id && h.holder === a.p_holder))
    return undefined
  }
  db.rpcs.release_coupon_hold = (d, a) => {
    d.tables.coupon_holds = d.rows("coupon_holds").filter((h) => !(h.coupon_id === a.p_coupon_id && h.holder === a.p_holder))
    return undefined
  }
  db.rpcs.increment_coupon_usage = (d, a) => {
    const c = d.rows("coupons").find((x) => x.id === a.coupon_id)
    if (c) c.usage_count = (c.usage_count ?? 0) + 1
    return undefined
  }

  /* run-now 64_ledger_once_and_atomic.sql */
  db.rpcs.ledger_post = (d, a) => {
    if (!a.p_creator || a.p_amount === null || a.p_amount === undefined || a.p_amount < 0) throw new PgError("P0001", "ledger_post: a creator and an amount of zero or more are needed")
    let l = d.rows("seller_ledger").find((x) => x.creator_id === a.p_creator)
    if (!l) {
      l = { creator_id: a.p_creator, pending_amount: 0, available_amount: 0, in_transit_amount: 0, negative_balance: 0, lifetime_earnings: 0, lifetime_fees: 0, lifetime_refunds: 0, lifetime_paid_out: 0 }
      d.rows("seller_ledger").push(l)
    }
    if (a.p_key && d.rows("ledger_events").some((e) => e.idempotency_key === a.p_key)) return { applied: false }
    let dp = 0
    let da = 0
    let dt = 0
    let dn = 0
    const amt = Number(a.p_amount)
    if (a.p_op === "sale") {
      const take = Math.min(amt, l.negative_balance)
      dn = -take
      dp = amt - take
    } else if (a.p_op === "credit_available") {
      const take = Math.min(amt, l.negative_balance)
      dn = -take
      da = amt - take
    } else if (a.p_op === "debit_pending_first" || a.p_op === "debit_available_first") {
      let rem = amt
      const takeP = () => {
        const t = Math.min(rem, l!.pending_amount)
        dp = -t
        rem -= t
      }
      const takeA = () => {
        const t = Math.min(rem, l!.available_amount)
        da = -t
        rem -= t
      }
      if (a.p_op === "debit_pending_first") {
        takeP()
        takeA()
      } else {
        takeA()
        takeP()
      }
      dn = rem
    } else if (a.p_op === "payout_paid") dt = -Math.min(amt, l.in_transit_amount)
    else if (a.p_op === "payout_returned") {
      dt = -Math.min(amt, l.in_transit_amount)
      da = amt
    } else if (a.p_op !== "record") throw new PgError("P0001", `ledger_post: unknown change ${a.p_op}`)
    const ev = a.p_event ?? {}
    const id = crypto.randomUUID()
    d.rows("ledger_events").push({
      id,
      creator_id: a.p_creator,
      event_type: ev.event_type,
      amount_cents: ev.amount_cents ?? amt,
      net_seller_cents: ev.net_seller_cents ?? amt,
      fee_cents: ev.fee_cents ?? 0,
      currency: ev.currency ?? "usd",
      pending_delta: dp,
      available_delta: da,
      in_transit_delta: dt,
      order_id: ev.order_id ?? null,
      stripe_payout_id: ev.stripe_payout_id ?? null,
      stripe_refund_id: ev.stripe_refund_id ?? null,
      stripe_dispute_id: ev.stripe_dispute_id ?? null,
      hold_until: ev.hold_until ?? null,
      description: ev.description ?? null,
      metadata: ev.metadata ?? {},
      idempotency_key: a.p_key ?? null,
      created_at: now(),
    })
    l.pending_amount += dp
    l.available_amount += da
    l.in_transit_amount += dt
    l.negative_balance += dn
    l.lifetime_earnings += Number(ev.add_lifetime_earnings ?? 0)
    l.lifetime_fees += Number(ev.add_lifetime_fees ?? 0)
    l.lifetime_refunds += Number(ev.add_lifetime_refunds ?? 0)
    if (a.p_op === "payout_paid") l.lifetime_paid_out += amt
    return { applied: true, event_id: id, pending_delta: dp, available_delta: da, in_transit_delta: dt, negative_delta: dn }
  }
  db.rpcs.ledger_release_due = () => []

  /* Telemetry and the OnePage's slug (a dashboard function): nothing the journey reads. */
  db.rpcs.perf_ingest = () => undefined
  db.rpcs.generate_onepage_slug = (_d, a) => String(a.base ?? a.p_base ?? "page").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.random().toString(36).slice(2, 6)

  /* The notification engine's queues (run-now 40_notification_engine.sql), so its cron sends what it sends in production. */
  db.rpcs.claim_notification_events = (d, a) => {
    const lease = new Date(Date.now() + Math.max(15, Math.min(a.p_lease_seconds ?? 60, 900)) * 1000).toISOString()
    const due = d
      .rows("notification_events")
      .filter((e) => !e.processed_at && (!e.claimed_until || e.claimed_until < now()) && (e.attempts ?? 0) < 10)
      .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))
      .slice(0, Math.max(1, Math.min(a.p_limit ?? 20, 100)))
    for (const e of due) Object.assign(e, { claimed_until: lease, attempts: (e.attempts ?? 0) + 1 })
    return due.map((e) => ({ ...e }))
  }
  db.rpcs.claim_notification_jobs = (d, a) => {
    for (const x of d.rows("notification_jobs")) if (x.state === "pending" && x.expires_at && x.expires_at <= now()) Object.assign(x, { state: "skipped", skip_reason: "EXPIRED", claimed_by: null, claimed_until: null, finished_at: now(), updated_at: now() })
    const due = d
      .rows("notification_jobs")
      .filter((q) => ((q.state === "pending" && q.run_at <= now()) || (q.state === "processing" && q.claimed_until < now())) && (!q.expires_at || q.expires_at > now()))
      .sort((x, y) => String(x.run_at).localeCompare(String(y.run_at)))
      .slice(0, Math.max(1, Math.min(a.p_limit ?? 20, 100)))
    const lease = new Date(Date.now() + Math.max(30, Math.min(a.p_lease_seconds ?? 120, 900)) * 1000).toISOString()
    for (const j of due) Object.assign(j, { state: "processing", claimed_by: a.p_worker, claimed_until: lease, attempts: (j.attempts ?? 0) + 1, updated_at: now() })
    return due.map((j) => ({ ...j }))
  }

  /*
    supabase/sql/run-now/176_store_currency.sql: store_change_currency. A
    store's selling currency changed once per request key, refused when the
    store's currency moved underneath the caller (40001); "convert" snapshots
    and converts every price the store owns at the rate given, "keep" moves
    no number. Part 258: membership and community products stay in dollars,
    and offers' fixed amounts and minimums and smart collections' price
    conditions are converted too.
  */
  db.rpcs.store_change_currency = (d, a) => {
    const code = (v: unknown) => typeof v === "string" && /^[A-Z]{3}$/.test(v)
    if (!a.p_creator) throw new PgError("22023", "store_currency: no store")
    if (!code(a.p_from) || !code(a.p_to)) throw new PgError("22023", "store_currency: a currency is not a code")
    if (a.p_from === a.p_to) throw new PgError("22023", `store_currency: the store already sells in ${a.p_to}`)
    if (a.p_mode !== "keep" && a.p_mode !== "convert") throw new PgError("22023", "store_currency: mode is keep or convert")
    if (a.p_mode === "convert" && !(Number(a.p_rate) > 0 && Number(a.p_rate) <= 1_000_000)) throw new PgError("22023", "store_currency: converting needs a rate")
    if (typeof a.p_key !== "string" || a.p_key.length < 8 || a.p_key.length > 120) throw new PgError("22023", "store_currency: a request key is needed")
    let settings = d.rows("store_settings").find((r) => r.creator_id === a.p_creator)
    if (!settings) settings = d.insert("store_settings", { creator_id: a.p_creator }, {})[0]
    const prev = d.rows("store_currency_changes").find((c) => c.creator_id === a.p_creator && c.request_key === a.p_key)
    if (prev) return { ok: true, repeat: true, id: prev.id, from: prev.from_currency, to: prev.to_currency, mode: prev.mode, rate: prev.rate, counts: prev.counts }
    if ((settings.currency ?? a.p_from) !== a.p_from) throw new PgError("40001", `store_currency: the store now sells in ${settings.currency}`)
    const [change] = d.insert("store_currency_changes", { creator_id: a.p_creator, from_currency: a.p_from, to_currency: a.p_to, previous_currency: settings.currency ?? null, mode: a.p_mode, rate: a.p_mode === "convert" ? a.p_rate : null, rate_as_of: a.p_mode === "convert" ? a.p_rate_as_of : null, request_key: a.p_key, created_by: a.p_user ?? null }, {})
    const counts: Record<string, number> = {}
    if (a.p_mode === "convert") {
      const rate = Number(a.p_rate)
      const conv = (v: unknown) => (typeof v === "number" ? Math.round(v * rate) : v)
      const own = d.rows("products").filter((p) => p.creator_id === a.p_creator && p.type !== "membership" && p.type !== "community")
      const ids = new Set(own.map((p) => p.id))
      const targets: [string, Row[], string[]][] = [
        ["products", own, ["price_cents", "compare_at_cents", "pwyw_min_price_cents", "pwyw_suggested_price_cents"]],
        ["product_variants", d.rows("product_variants").filter((v) => ids.has(v.product_id)), ["price_cents", "compare_at_price_cents", "additional_price_cents"]],
        ["shipping_rates", d.rows("shipping_rates").filter((r) => r.creator_id === a.p_creator), ["price_cents", "free_over_cents"]],
        ["inventory_locations", d.rows("inventory_locations").filter((r) => r.creator_id === a.p_creator), ["local_delivery_price_cents", "local_delivery_min_cents", "local_delivery_free_over_cents"]],
        ["coupons", d.rows("coupons").filter((r) => r.creator_id === a.p_creator), ["min_purchase_cents"]],
        ["store_offers", d.rows("store_offers").filter((r) => r.creator_id === a.p_creator), ["min_subtotal_cents"]],
        ["product_collections", d.rows("product_collections").filter((r) => r.creator_id === a.p_creator && r.kind === "smart" && Array.isArray(r.rules) && (r.rules as Row[]).some((x) => x?.field === "price" || x?.field === "compare_at_price")), []],
      ]
      for (const [table, rows, cols] of targets) {
        if (!rows.length) continue
        for (const r of rows) {
          d.rows("store_currency_snapshots").push({ change_id: change.id, table_name: table, row_id: r.id, before: Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])) })
          for (const c of cols) if (c in r) r[c] = conv(r[c])
          if (table === "coupons" && r.discount_type === "fixed" && typeof r.discount_value === "number") r.discount_value = Math.max(0.01, Math.round(r.discount_value * rate * 100) / 100)
          if (table === "store_offers" && r.discount_type === "fixed" && typeof r.discount_value === "number") r.discount_value = Math.max(1, Math.round(r.discount_value * rate))
          if (table === "product_collections") {
            const before = r.rules
            r.rules = (r.rules as Row[]).map((x) => (x && (x.field === "price" || x.field === "compare_at_price") && /^\s*[0-9]+(\.[0-9]+)?\s*$/.test(String(x.value)) ? { ...x, value: String(Math.round(Number(x.value) * rate * 100) / 100) } : x))
            const snap = d.rows("store_currency_snapshots")
            snap[snap.length - 1].before = { rules: before }
          }
        }
        counts[table] = rows.length
      }
      const fee = settings.checkout && typeof settings.checkout === "object" ? (settings.checkout as Row).codFeeCents : undefined
      if (typeof fee === "number") {
        settings.checkout = { ...(settings.checkout as Row), codFeeCents: Math.round(fee * rate) }
        counts.cod_fee = 1
      }
    }
    settings.currency = a.p_to
    settings.updated_at = now()
    change.counts = counts
    return { ok: true, repeat: false, id: change.id, from: a.p_from, to: a.p_to, mode: a.p_mode, rate: a.p_mode === "convert" ? a.p_rate : null, counts }
  }

  /*
    Round L (tests/ai-builder-journey.test.ts). supabase/sql/run-now/401_ai_builder_agent.sql:
    ai_site_job_add_events. A batch of an AI job's events, numbered after the
    newest under the job's row lock, only while the job is queued or running
    (0 otherwise), at most 50 a call; last_event_seq moved with them.
  */
  db.rpcs.ai_site_job_add_events = (d, a) => {
    const events = a.p_events
    if (!Array.isArray(events) || events.length === 0) return 0
    const job = d.rows("ai_site_jobs").find((j) => j.id === a.p_job_id && j.creator_id === a.p_creator_id)
    if (!job || !["queued", "running"].includes(String(job.status))) return 0
    const top = Math.max(0, ...d.rows("ai_site_job_events").filter((e) => e.job_id === a.p_job_id).map((e) => Number(e.seq) || 0))
    let seq = Math.max(Number(job.last_event_seq) || 0, top)
    for (const [n, e] of events.slice(0, 50).entries()) d.insert("ai_site_job_events", { job_id: a.p_job_id, creator_id: a.p_creator_id, seq: seq + n + 1, kind: (e as Row)?.kind, payload: (e as Row)?.payload ?? {} }, {})
    seq += Math.min(events.length, 50)
    job.last_event_seq = seq
    return seq
  }

  /*
    supabase/sql/run-now/130_theme_publish_in_one_step.sql: publish_theme_install.
    One website made live in one step: its settings and pages (a draft equal to
    what was published is cleared), every file's draft made its live half, the
    store's other live website taken down. Refused (P0002) for another store's.
  */
  const same = (x: unknown, y: unknown) => JSON.stringify(canonical(x ?? null)) === JSON.stringify(canonical(y ?? null))
  db.rpcs.publish_theme_install = (d, a) => {
    const install = d.rows("store_theme_installs").find((r) => r.id === a.p_install && r.creator_id === a.p_creator)
    if (!install) throw new PgError("P0002", "publish: this website is not this creator's")
    if (a.p_settings !== null && a.p_settings !== undefined) {
      for (const s of d.rows("store_theme_settings").filter((r) => r.install_id === a.p_install)) {
        s.draft_settings = same(s.draft_settings, a.p_settings_draft) ? null : s.draft_settings
        s.settings = a.p_settings
      }
    }
    for (const page of (Array.isArray(a.p_pages) ? a.p_pages : []) as Row[]) {
      const row = d.rows("store_theme_pages").find((r) => r.id === page.id && r.install_id === a.p_install)
      if (!row) continue
      row.draft_sections = same(row.draft_sections, page.draft) ? null : row.draft_sections
      row.sections = page.sections
    }
    const files: Row[] = []
    for (const f of d.rows("store_theme_custom_files").filter((r) => r.install_id === a.p_install && r.draft_content !== null && r.draft_content !== undefined)) {
      f.content = f.draft_content
      f.draft_content = null
      files.push({ path: f.path, content: f.content })
    }
    const was: unknown[] = []
    for (const other of d.rows("store_theme_installs").filter((r) => r.creator_id === a.p_creator && r.status === "published" && r.id !== a.p_install)) {
      other.status = "unpublished"
      was.push(other.id)
    }
    install.status = "published"
    install.published_at = now()
    return { was_live: was, files }
  }
}

/** jsonb equality ignores key order: keys sorted before comparing. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as Row).sort().map((k) => [k, canonical((v as Row)[k])]))
  return v
}
