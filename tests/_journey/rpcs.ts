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
}
