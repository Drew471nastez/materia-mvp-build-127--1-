/**
 * ===========================================================================
 *  WHAT HAPPENS AFTER AN ORDER IS WRITTEN, FINISHED EVEN AFTER A CRASH
 * ===========================================================================
 * A paid checkout writes its order once (the receipt token is unique), and
 * the caller whose insert made the row did the rest: the customer, the
 * contact, the library entry, the sales count, the seller's ledger, the
 * emails. If that caller died after the insert (a function timeout, a
 * deploy), every retry found the order, said "already done" and stopped, and
 * the rest never happened.
 *
 * NOW each step is recorded in order_followups (run-now part 300), one row
 * per order and step, and a retry (the webhook again, the buyer's page
 * again, or the ten minute sweep in app/api/cron/physical) runs the steps
 * that are not done. Two kinds of step:
 *
 *   idempotent  safe to run twice: the library entry (checked first), the
 *               ledger (keyed per order in the database), the contact, the
 *               notification events (keyed). Run unless recorded done.
 *
 *   once        not safe twice: the emails, the customer's order count, the
 *               product's sales count, a code's use, the push. CLAIMED
 *               before they run (the row's primary key lets one caller
 *               have it), done after. A claim left by a caller that died
 *               mid-step is never run again: a missing email is better than
 *               two, and two of an order count is wrong for ever. A step
 *               that failed with an error is released and tried again.
 *
 * Before part 300 runs the table is not there: the first writer runs every
 * step as it always did, and a retry does nothing more, as before.
 *
 * A run that is still going is left alone: a retry within IN_FLIGHT_MS of
 * the order's first step does not resume it, so the buyer's page and the
 * webhook arriving together never run the same idempotent step at once.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** What each checkout type is, so the sweep knows how to read its payment again. */
export type FollowupKind = "payment" | "cart_session" | "cart_payment" | "physical" | "cart_free"

/** A first writer is still running inside this window; a retry leaves it be. */
export const IN_FLIGHT_MS = 3 * 60_000
/** The sweep gives an order this many tries, then leaves it to support. */
export const MAX_ATTEMPTS = 8
/** And only looks back this far. */
export const SWEEP_WINDOW_MS = 3 * 24 * 60 * 60_000

const TABLE = "order_followups"
const BEGUN = "begun"
const COMPLETE = "complete"

type Row = { order_id: string; step: string; state: "claimed" | "done" | "failed"; kind?: string | null; ref?: string | null; attempts?: number | null; created_at?: string | null; updated_at?: string | null }

function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || /order_followups/.test(error.message ?? "") && /does not exist|schema cache|not find/i.test(error.message ?? "")
}

export interface Followups {
  /** False before part 300: steps run once, by the first writer, as before. */
  readonly available: boolean
  /** A step safe to run twice. */
  idempotent(step: string, fn: () => Promise<unknown>): Promise<void>
  /** A step that must never run twice. */
  once(step: string, fn: () => Promise<unknown>): Promise<void>
  /** Every step of this run done: the order needs nothing more. */
  finish(): Promise<void>
  /** Step names this run left undone (failed), for the caller's log or answer. */
  readonly failed: string[]
}

/**
 * The first writer of an order: records that its follow-ups began (kind and
 * ref tell the sweep how to read the payment again), then runs its steps.
 */
export async function beginFollowups(db: Db, orderId: string, meta: { kind: FollowupKind; ref: string; log: string }, now = Date.now): Promise<Followups> {
  const at = new Date(now()).toISOString()
  const { error } = await db.from(TABLE).insert({ order_id: orderId, step: BEGUN, state: "claimed", kind: meta.kind, ref: meta.ref, attempts: 1, created_at: at, updated_at: at })
  const available = !missingTable(error) && (!error || error.code === "23505")
  if (error && available && error.code !== "23505") console.error(`[followups] ${meta.log}: begun not recorded`, error.code)
  return runner(db, orderId, { available, known: new Map(), log: meta.log, now })
}

/**
 * A retry that found the order already written. Answers null when there is
 * nothing to do: part 300 has not run, the order was never begun here (a
 * row from before part 300), every step is done, or the first writer is
 * still inside IN_FLIGHT_MS.
 */
export async function resumeFollowups(db: Db, orderId: string, meta: { log: string; force?: boolean }, now = Date.now): Promise<Followups | null> {
  const { data, error } = await db.from(TABLE).select("order_id, step, state, attempts, created_at, updated_at").eq("order_id", orderId).limit(100)
  if (error) return null
  const rows = (data ?? []) as Row[]
  const begun = rows.find((r) => r.step === BEGUN)
  if (!begun) return null
  if (rows.some((r) => r.step === COMPLETE && r.state === "done")) return null
  const started = Date.parse(begun.updated_at ?? begun.created_at ?? "")
  if (!meta.force && Number.isFinite(started) && now() - started < IN_FLIGHT_MS) return null
  /* This resume is one more attempt, and holds the order for IN_FLIGHT_MS against a second resume. */
  await db.from(TABLE).update({ attempts: (begun.attempts ?? 1) + 1, updated_at: new Date(now()).toISOString() }).eq("order_id", orderId).eq("step", BEGUN)
  return runner(db, orderId, { available: true, known: new Map(rows.map((r) => [r.step, r])), log: meta.log, now })
}

function runner(db: Db, orderId: string, s: { available: boolean; known: Map<string, Row>; log: string; now: () => number }): Followups {
  const failed: string[] = []
  const stamp = () => new Date(s.now()).toISOString()
  const note = (step: string, e: unknown) => {
    failed.push(step)
    console.error(`[followups] ${s.log}: ${step} failed for order ${orderId}:`, e instanceof Error ? e.message : e)
  }
  const mark = async (step: string, state: Row["state"], error?: unknown) => {
    if (!s.available) return
    const last_error = error === undefined ? null : String(error instanceof Error ? error.message : error).slice(0, 300)
    const { error: writeError } = await db.from(TABLE).upsert({ order_id: orderId, step, state, last_error, updated_at: stamp() }, { onConflict: "order_id,step", ignoreDuplicates: false })
    if (writeError) console.error(`[followups] ${s.log}: ${step} not recorded`, writeError.code)
  }

  return {
    available: s.available,
    failed,
    async idempotent(step, fn) {
      if (s.known.get(step)?.state === "done") return
      try {
        await fn()
        await mark(step, "done")
      } catch (e) {
        note(step, e)
        await mark(step, "failed", e)
      }
    },
    async once(step, fn) {
      if (!s.available) {
        try {
          await fn()
        } catch (e) {
          note(step, e)
        }
        return
      }
      const seen = s.known.get(step)
      if (seen?.state === "done") return
      /* Somebody claimed it and never said how it went: maybe it ran. Never twice. */
      if (seen?.state === "claimed") {
        console.warn(`[followups] ${s.log}: ${step} for order ${orderId} was claimed and not finished; left alone so it cannot run twice`)
        return
      }
      /* Claim it: a failed one by moving it back from failed (one caller's update wins), a new one by inserting it (one insert wins). */
      let mine = false
      if (seen?.state === "failed") {
        const { data } = await db.from(TABLE).update({ state: "claimed", updated_at: stamp() }).eq("order_id", orderId).eq("step", step).eq("state", "failed").select("step")
        mine = Array.isArray(data) && data.length > 0
      } else {
        const { error } = await db.from(TABLE).insert({ order_id: orderId, step, state: "claimed", created_at: stamp(), updated_at: stamp() })
        mine = !error
        if (error && error.code !== "23505") console.error(`[followups] ${s.log}: ${step} not claimed`, error.code)
      }
      if (!mine) return
      try {
        await fn()
        await mark(step, "done")
      } catch (e) {
        note(step, e)
        await mark(step, "failed", e)
      }
    },
    async finish() {
      if (!s.available || failed.length > 0) return
      await mark(COMPLETE, "done")
      await mark(BEGUN, "done")
    },
  }
}

/**
 * Orders whose follow-ups began and never finished, for the sweep: older
 * than IN_FLIGHT_MS, newer than SWEEP_WINDOW_MS, under MAX_ATTEMPTS. Each
 * with the kind and ref its checkout reads the payment again by.
 */
export async function unfinishedFollowups(db: Db, limit = 10, now = Date.now): Promise<Array<{ orderId: string; kind: FollowupKind; ref: string }>> {
  const { data, error } = await db
    .from(TABLE)
    .select("order_id, step, state, kind, ref, attempts, created_at, updated_at")
    .eq("step", BEGUN)
    .neq("state", "done")
    .lt("updated_at", new Date(now() - IN_FLIGHT_MS).toISOString())
    .gte("created_at", new Date(now() - SWEEP_WINDOW_MS).toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    /* The least tried first, so one that can never finish sinks below newer ones. */
    .order("attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) return []
  return ((data ?? []) as Row[])
    .filter((r) => typeof r.ref === "string" && r.ref && (r.kind === "payment" || r.kind === "cart_session" || r.kind === "cart_payment" || r.kind === "physical"))
    .map((r) => ({ orderId: r.order_id, kind: r.kind as FollowupKind, ref: r.ref as string }))
}

/** The sweep counts its own try before it asks the checkout again, so one whose payment can no longer be read still runs out of tries. */
export async function countSweepAttempt(db: Db, orderId: string): Promise<void> {
  const { data } = await db.from(TABLE).select("attempts").eq("order_id", orderId).eq("step", BEGUN).limit(1)
  const attempts = Array.isArray(data) ? Number((data[0] as { attempts?: number } | undefined)?.attempts) || 1 : 1
  await db.from(TABLE).update({ attempts: attempts + 1 }).eq("order_id", orderId).eq("step", BEGUN)
}
