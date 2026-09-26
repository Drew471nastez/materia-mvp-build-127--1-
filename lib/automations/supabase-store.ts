import "server-only"

/**
 * The engine's Store (lib/automations/engine.ts) on Supabase, with the
 * service role. Every write that must happen once is a unique index or a
 * conditional UPDATE in the database; nothing here remembers anything
 * between calls.
 *
 * BEFORE THE SQL. supabase/sql/RUN_EMAIL_AUTOMATIONS.sql adds the tables and
 * functions. Until it runs, `enroll` and `claim` report the engine as not
 * there (a missing relation or function), and the callers use the older
 * path: see triggerEmailFlows in lib/email.tsx.
 */

import { APP_URL } from "@/lib/email-automation"
import { recordCheckoutContact } from "@/lib/contacts/checkout-contact"
import { cleanContactSource } from "@/lib/contacts/contact-source"
import type { Brand, FlowRow, Identity, JobRow, JobState, RunLinks, RunRow, SendBegin, Standing, Store } from "./engine"
import type { TriggerType } from "./flow-model"
import { textOn } from "./merge-fields"
import type { CheckoutStart, StartOutcome, StartsStore } from "./abandoned"
import { ownerAddress } from "@/lib/businesses/email-alias"

type Db = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
type PgError = { code?: string; message?: string } | null | undefined

/** A table or function the SQL adds, not there yet. */
export function isMissing(error: PgError): boolean {
  if (!error) return false
  const code = error.code ?? ""
  if (code === "42P01" || code === "42883" || code === "PGRST205" || code === "PGRST202" || code === "42703") return true
  return /does not exist|could not find the (table|function)|schema cache/i.test(error.message ?? "")
}

class StoreError extends Error {}

function fail(what: string, error: PgError): never {
  /* The code, never the message: a message can quote a row. */
  throw new StoreError(`Could not ${what} (${error?.code || "database error"}).`)
}

function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const FLOW_COLUMNS = "id, creator_id, name, trigger_type, trigger_config, status, steps"

/** Statuses that mean "do not email this person", however they got there. */
const SUPPRESSED = new Set(["unsubscribed", "bounced", "complained", "cleaned"])

/** Orders that were paid for, refunded or not: "has bought before". */
const PAID = ["completed", "refunded", "partially_refunded", "disputed"]

/**
 * Where this address stands with this creator's contacts
 * (lib/contacts/checkout-contact says who is which). No row is not
 * suppressed: a buyer from before contacts were recorded at checkout still
 * gets their order's follow-up, as they always have, and nothing that sells.
 */
export async function contactStanding(db: Db, creatorId: string, email: string): Promise<Standing> {
  const { data, error } = await db
    .from("subscribers")
    .select("status, is_active, unsubscribe_token")
    .eq("creator_id", creatorId)
    .eq("email", email.toLowerCase().trim())
    .maybeSingle()
  /* A read that failed says nothing either way: `subscribed` is left unknown, so a
     welcome is not ended over a dropped connection (engine processJob). No row is
     a real answer: not on the list. */
  if (error) return { suppressed: false, unsubscribeToken: null, status: null }
  if (!data) return { suppressed: false, unsubscribeToken: null, subscribed: false, status: null }
  const status = typeof data.status === "string" ? data.status : "subscribed"
  const suppressed = SUPPRESSED.has(status) || data.is_active === false
  return {
    suppressed,
    unsubscribeToken: typeof data.unsubscribe_token === "string" ? data.unsubscribe_token : null,
    subscribed: !suppressed && status === "subscribed",
    status: suppressed ? null : status === "customer" ? "customer" : status === "subscribed" ? "subscribed" : null,
  }
}

/**
 * ENDS THIS PERSON'S RUNS WITH THIS CREATOR, NOW: every active one, or only
 * those of one trigger. Each run is marked exited with the reason and its
 * waiting job cancelled, in that order, each only where it is still active
 * or queued, so it is safe to repeat and never touches a finished run.
 *
 * Used for a purchase (a checkout reminder they were partway through has no
 * reason left, `trigger` "abandoned_checkout") and for an unsubscribe
 * (app/api/email/unsubscribe, every trigger). The engine checks both again
 * before every step anyway (engine.ts processJob), so this is not what keeps
 * an email from going; it is what makes the builder and the contact's page
 * say "Left" the moment they left, rather than "In progress" until their
 * next step comes up, days later, and finds them gone.
 *
 * A job already running is left to its worker, which sees the run is over
 * and cancels itself. Returns how many runs it ended; 0 before the engine's
 * tables exist.
 */
export async function exitContactRuns(db: Db, creatorId: string, email: string, reason: string, trigger?: TriggerType): Promise<number> {
  const now = new Date().toISOString()
  let q = db
    .from("email_flow_runs")
    .update({ status: "exited", exit_reason: reason, finished_at: now, updated_at: now })
    .eq("creator_id", creatorId)
    .eq("email", email.trim().toLowerCase())
  if (trigger) q = q.eq("trigger_type", trigger)
  const { data, error } = await q.eq("status", "active").select("id")
  if (error) {
    if (isMissing(error)) return 0
    fail("end the runs", error)
  }
  const ids = (Array.isArray(data) ? data : []).map((r: { id: string }) => r.id)
  if (ids.length > 0) {
    await db.from("email_flow_jobs").update({ state: "cancelled", last_error: reason, finished_at: now, updated_at: now }).in("run_id", ids).eq("state", "queued")
  }
  return ids.length
}

export function supabaseStore(db: Db): Store {
  const identities = new Map<string, Promise<Identity & { handle: string | null }>>()
  const identityOf = (creatorId: string) => {
    let found = identities.get(creatorId)
    if (!found) {
      found = readIdentity(db, creatorId)
      identities.set(creatorId, found)
    }
    return found
  }
  const creatorProducts = async (creatorId: string): Promise<string[]> => {
    const { data, error } = await db.from("products").select("id").eq("creator_id", creatorId)
    if (error) fail("read the products", error)
    return (data ?? []).map((p: { id: string }) => p.id)
  }
  return {
    async activeFlows(creatorId: string, trigger: TriggerType) {
      const { data, error } = await db.from("email_flows").select(FLOW_COLUMNS).eq("creator_id", creatorId).eq("trigger_type", trigger).eq("status", "active")
      if (error) fail("read the flows", error)
      return (data ?? []) as FlowRow[]
    },

    async enroll(input) {
      const args = {
        p_flow_id: input.flowId,
        p_creator_id: input.creatorId,
        p_email: input.email,
        p_name: input.name,
        p_dedupe_key: input.dedupeKey,
        p_window_days: input.windowDays,
        p_trigger_type: input.triggerType,
        p_first_step_id: input.firstStepId,
        p_context: input.context,
        p_source: input.source ?? null,
      }
      /* A trigger that fails to enter is an automation that never runs, so a
         dropped connection is tried again. The function is safe to repeat:
         a second call for the same entry writes nothing. */
      let last: PgError = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await db.rpc("enroll_email_flow", args)
        if (!error) return { runId: typeof data === "string" ? data : null }
        if (isMissing(error)) return { runId: null, unavailable: true }
        last = error
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
      }
      fail("enter the flow", last)
    },

    async claim(worker, limit, leaseSeconds) {
      const { data, error } = await db.rpc("claim_email_flow_jobs", { p_worker: worker, p_limit: limit, p_lease_seconds: leaseSeconds })
      if (error) {
        if (isMissing(error)) return null
        fail("claim work", error)
      }
      return (Array.isArray(data) ? data : []) as JobRow[]
    },

    async flow(id) {
      const { data, error } = await db.from("email_flows").select(FLOW_COLUMNS).eq("id", id).maybeSingle()
      if (error) fail("read the flow", error)
      return (data ?? null) as FlowRow | null
    },

    async run(id) {
      const { data, error } = await db.from("email_flow_runs").select("id, flow_id, creator_id, email, name, status, started_at, context").eq("id", id).maybeSingle()
      if (error) fail("read the run", error)
      return data ? ({ ...data, context: data.context ?? {} } as RunRow) : null
    },

    async finishRun(runId, status, reason) {
      const now = new Date().toISOString()
      const { error } = await db
        .from("email_flow_runs")
        .update({ status, exit_reason: reason, finished_at: now, updated_at: now })
        .eq("id", runId)
        .eq("status", "active")
      if (error) fail("finish the run", error)
    },

    async setRunStep(runId, stepId) {
      const { error } = await db.from("email_flow_runs").update({ current_step_id: stepId, updated_at: new Date().toISOString() }).eq("id", runId).eq("status", "active")
      if (error) fail("move the run on", error)
    },

    async enqueue(job) {
      const { data, error } = await db
        .from("email_flow_jobs")
        .upsert(
          { run_id: job.runId, flow_id: job.flowId, creator_id: job.creatorId, step_id: job.stepId, after_step_id: job.afterStepId, run_at: job.runAt, state: "queued" },
          { onConflict: "run_id,step_id", ignoreDuplicates: true },
        )
        .select("id")
      if (error) fail("queue the next step", error)
      /* A duplicate is ignored and returns no row. */
      return Array.isArray(data) && data.length > 0
    },

    async jobState(runId, stepId) {
      const { data, error } = await db.from("email_flow_jobs").select("state").eq("run_id", runId).eq("step_id", stepId).maybeSingle()
      if (error) fail("read the step", error)
      return (data?.state ?? null) as JobState | null
    },

    async completeJob(jobId, worker, state, note) {
      const now = new Date().toISOString()
      const { data, error } = await db
        .from("email_flow_jobs")
        .update({ state, finished_at: now, updated_at: now, claimed_until: null, ...(note ? { last_error: note } : {}) })
        .eq("id", jobId)
        .eq("claimed_by", worker)
        .eq("state", "running")
        .select("id")
      if (error) fail("finish the step", error)
      return Array.isArray(data) && data.length > 0
    },

    async retryJob(jobId, worker, runAt, message) {
      const { data, error } = await db
        .from("email_flow_jobs")
        .update({ state: "queued", run_at: runAt, last_error: message, claimed_by: null, claimed_until: null, updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("claimed_by", worker)
        .eq("state", "running")
        .select("id")
      if (error) fail("put the step back", error)
      return Array.isArray(data) && data.length > 0
    },

    async failJob(jobId, worker, message) {
      const now = new Date().toISOString()
      const { data, error } = await db
        .from("email_flow_jobs")
        .update({ state: "failed", last_error: message, finished_at: now, updated_at: now, claimed_until: null })
        .eq("id", jobId)
        .eq("claimed_by", worker)
        .eq("state", "running")
        .select("id")
      if (error) fail("mark the step failed", error)
      return Array.isArray(data) && data.length > 0
    },

    async beginSend(input): Promise<SendBegin> {
      const { data, error } = await db
        .from("email_flow_sends")
        .insert({ run_id: input.runId, flow_id: input.flowId, creator_id: input.creatorId, step_id: input.stepId, email: input.email, subject: input.subject.slice(0, 300), status: "sending" })
        .select("token")
        .single()
      if (!error && data?.token) return { go: true, token: data.token }
      if (error && error.code !== "23505") fail("write the send", error)
      const { data: row, error: readError } = await db.from("email_flow_sends").select("status, token").eq("run_id", input.runId).eq("step_id", input.stepId).maybeSingle()
      if (readError || !row) fail("read the send", readError)
      if (row.status === "sent") return { go: false, why: "sent" }
      if (row.status === "failed") {
        const { data: taken, error: takeError } = await db
          .from("email_flow_sends")
          .update({ status: "sending", error: null, subject: input.subject.slice(0, 300), updated_at: new Date().toISOString() })
          .eq("run_id", input.runId)
          .eq("step_id", input.stepId)
          .eq("status", "failed")
          .select("token")
        if (takeError) fail("retry the send", takeError)
        if (Array.isArray(taken) && taken[0]?.token) return { go: true, token: taken[0].token }
        return { go: false, why: "interrupted" }
      }
      if (row.status === "sending") {
        await db.from("email_flow_sends").update({ status: "interrupted", updated_at: new Date().toISOString() }).eq("run_id", input.runId).eq("step_id", input.stepId).eq("status", "sending")
      }
      return { go: false, why: "interrupted" }
    },

    async finishSend(runId, stepId, result) {
      const now = new Date().toISOString()
      const patch = result.ok
        ? { status: "sent", provider_id: result.providerId, sent_at: now, error: null, updated_at: now }
        : { status: "failed", error: "error" in result ? result.error : "Send failed", updated_at: now }
      const { error } = await db.from("email_flow_sends").update(patch).eq("run_id", runId).eq("step_id", stepId).eq("status", "sending")
      if (error) fail("record the send", error)
    },

    async purchasedSince(creatorId, email, sinceIso) {
      const ids = await creatorProducts(creatorId)
      if (ids.length === 0) return false
      const { count, error: ordersError } = await db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("product_id", ids)
        .ilike("buyer_email", likeExact(email))
        .eq("status", "completed")
        .gt("created_at", sinceIso)
      if (ordersError) fail("read the orders", ordersError)
      return (count ?? 0) > 0
    },

    async openedStep(runId, stepId) {
      const { data, error } = await db.from("email_flow_sends").select("opened_at, clicked_at").eq("run_id", runId).eq("step_id", stepId).maybeSingle()
      if (error) fail("read the send", error)
      return Boolean(data?.opened_at || data?.clicked_at)
    },

    standing(creatorId, email): Promise<Standing> {
      return contactStanding(db, creatorId, email)
    },

    async identity(creatorId) {
      const found = await identityOf(creatorId)
      return { fromName: found.fromName, replyTo: found.replyTo, storeUrl: found.storeUrl, brand: found.brand }
    },

    async firstOrder(creatorId, email, orderId) {
      const { data: order, error } = await db.from("orders").select("id, created_at").eq("id", orderId).maybeSingle()
      if (error) fail("read the order", error)
      if (!order) return false
      const ids = await creatorProducts(creatorId)
      if (ids.length === 0) return false
      /* Earlier than this order, so the other lines of the same basket
         (written after its first) are not "an earlier order". */
      const { count, error: ordersError } = await db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("product_id", ids)
        .ilike("buyer_email", likeExact(email))
        .in("status", PAID)
        .neq("id", orderId)
        .lt("created_at", order.created_at)
      if (ordersError) fail("read the orders", ordersError)
      return (count ?? 0) === 0
    },

    exitRuns(creatorId, email, trigger, reason) {
      return exitContactRuns(db, creatorId, email, reason, trigger)
    },

    async links(run): Promise<RunLinks> {
      const out: RunLinks = { productUrl: null, orderUrl: null, checkoutUrl: null }
      const productId = run.context.product_id
      if (!productId) return out
      const { data: product, error } = await db.from("products").select("id, slug, creator_id").eq("id", productId).maybeSingle()
      if (error) fail("read the product", error)
      /* Only this creator's own product: a run's context is ours, but a
         link in their email is checked against the row it names. */
      if (!product || product.creator_id !== run.creator_id) return out
      const { handle } = await identityOf(run.creator_id)
      if (product.slug) out.productUrl = handle ? `${APP_URL}/${encodeURIComponent(handle)}/${encodeURIComponent(product.slug)}` : `${APP_URL}/p/${encodeURIComponent(product.slug)}`
      out.checkoutUrl = `${APP_URL}/checkout?productId=${encodeURIComponent(product.id)}${run.context.variant_id ? `&variantId=${encodeURIComponent(run.context.variant_id)}` : ""}`
      if (run.context.order_id) {
        const { data: order, error: orderError } = await db.from("orders").select("receipt_token, product_id, buyer_email").eq("id", run.context.order_id).maybeSingle()
        if (orderError) fail("read the order", orderError)
        /* The order page is the key to the download: only ever for the
           address the order was placed with, for this creator's product. */
        const own = order && typeof order.receipt_token === "string" && order.receipt_token && (order.buyer_email ?? "").toLowerCase() === run.email && (order.product_id === product.id || (await creatorProducts(run.creator_id)).includes(order.product_id))
        if (own) out.orderUrl = `${APP_URL}/receipt/${encodeURIComponent(order.receipt_token)}`
      }
      return out
    },
  }
}

/**
 * The checkouts that reached Pay (lib/automations/abandoned.ts), on the table
 * supabase/sql/RUN_CHECKOUT_CONTACTS.sql adds. Before it runs, `due` is null
 * and nothing is swept.
 */
export function supabaseStarts(db: Db): StartsStore {
  return {
    async due(olderThanIso, newerThanIso, limit) {
      const { data, error } = await db
        .from("checkout_starts")
        .select("id, creator_id, product_id, variant_id, product_title, email, first_name, email_opt_in, source_detail, created_at")
        .is("handled_at", null)
        .lt("created_at", olderThanIso)
        .gt("created_at", newerThanIso)
        .order("created_at", { ascending: true })
        .limit(limit)
      if (error) {
        if (isMissing(error)) return null
        fail("read the started checkouts", error)
      }
      return (data ?? []) as CheckoutStart[]
    },
    async settle(id, outcome: StartOutcome) {
      const { data, error } = await db
        .from("checkout_starts")
        .update({ handled_at: new Date().toISOString(), outcome })
        .eq("id", id)
        .is("handled_at", null)
        .select("id")
      if (error) fail("settle a started checkout", error)
      return Array.isArray(data) && data.length > 0
    },
    async release(id) {
      await db.from("checkout_starts").update({ handled_at: null, outcome: null }).eq("id", id)
    },
    async recordConsent(s) {
      return recordCheckoutContact(db, {
        creatorId: s.creator_id,
        email: s.email,
        name: s.first_name,
        basis: "ticked",
        bought: false,
        source: cleanContactSource(s.source_detail),
      })
    },
  }
}

const HEX = /^#[0-9a-f]{6}$/i

function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 1000) return null
  try {
    const u = new URL(v.trim())
    return u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * The creator as their emails show them. The name and address they send
 * from, their page, and their brand: the published website's store name,
 * logo and main colour when they have a site, their profile name and
 * picture when they do not, and the /app ink when no colour was chosen.
 */
async function readIdentity(db: Db, creatorId: string): Promise<Identity & { handle: string | null }> {
  const replyFallback = process.env.EMAIL_REPLY_TO || "support@storelib.com"
  const plain = (name: string): Brand => ({ name, logoUrl: null, accentColor: "#1a1a2e", onAccent: "#ffffff" })
  const fallback = { fromName: "Storelib", replyTo: replyFallback, storeUrl: APP_URL, brand: plain("Storelib"), handle: null }
  try {
    const { data: creator } = await db.from("creators").select("slug, headline, support_email, user_id").eq("id", creatorId).maybeSingle()
    if (!creator) return fallback
    const [{ data: profile }, site] = await Promise.all([
      creator.user_id ? db.from("profiles").select("display_name, username, email, avatar_url").eq("id", creator.user_id).maybeSingle() : Promise.resolve({ data: null }),
      readSiteBrand(db, creatorId),
    ])
    const fromName = profile?.display_name?.trim() || profile?.username?.trim() || creator.headline?.trim() || creator.slug?.trim() || "Storelib"
    const replyTo = (creator.support_email?.trim() || ownerAddress(profile?.email)?.trim() || replyFallback).toLowerCase()
    const handle = profile?.username?.trim() || creator.slug?.trim() || null
    const accent = site.color ?? "#1a1a2e"
    const brand: Brand = {
      name: site.name || fromName,
      logoUrl: site.logo ?? httpsUrl(profile?.avatar_url),
      accentColor: accent,
      onAccent: textOn(accent),
    }
    return { fromName, replyTo, storeUrl: handle ? `${APP_URL}/${encodeURIComponent(handle)}` : APP_URL, brand, handle }
  } catch {
    return fallback
  }
}

/** The published website's name, logo and main colour, when the creator has one. Never a draft. */
async function readSiteBrand(db: Db, creatorId: string): Promise<{ name: string | null; logo: string | null; color: string | null }> {
  const none = { name: null, logo: null, color: null }
  try {
    const { data: install } = await db
      .from("store_theme_installs")
      .select("id, store_theme_settings ( settings )")
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle()
    const row = install?.store_theme_settings
    const settings = (Array.isArray(row) ? row[0]?.settings : row?.settings) as Record<string, unknown> | null | undefined
    if (!settings || typeof settings !== "object") return none
    const name = typeof settings.brand_name === "string" ? settings.brand_name.replace(/\s+/g, " ").trim().slice(0, 80) : ""
    const color = [settings.primary_color, settings.accent_color].find((c): c is string => typeof c === "string" && HEX.test(c.trim()))
    return { name: name || null, logo: httpsUrl(settings.logo_url), color: color ? color.trim().toLowerCase() : null }
  } catch {
    return none
  }
}
