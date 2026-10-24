import "server-only"

/**
 * ===========================================================================
 *  WHAT EACH CUSTOMER EMAIL HAS SENT, AND WHAT IS RUNNING
 * ===========================================================================
 * Emails › Customer emails shows, beside each email, how many went out in
 * the last 30 days and when the last one did, and beside it the store's
 * automations that go with that family, on or off. Read from the records
 * each sender already keeps, never a new count:
 *
 *   receipt          orders.buyer_notified_at, a basket counted once (its
 *                    payment), lib/email.tsx updateOrderEmailStatus
 *   digital_refund   the store's download orders refunded in the period
 *                    (orders.refunded_at): each sends its one refund email
 *   physical         commerce_order_events "email.sent" (lib/physical/
 *                    jobs-server.ts), which email from the entry's key
 *   communities      notification_jobs sent for the community (the engine's
 *                    own record of each member email)
 *   automations      email_flow_sends, sent, per automation
 *
 * The checkout reminder keeps no record of its own, so it shows none. Any
 * read that fails leaves its numbers out; the list never waits on them.
 */
import { emailIdForJob } from "./customer-custom"
import { flowFamilies } from "./flow-family"
import type { EmailFamily } from "./buyer-channel"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const ACTIVITY_DAYS = 30

export interface Sent {
  sent: number
  lastAt: string | null
}

export interface FlowActivity {
  id: string
  name: string
  trigger_type: string
  status: string
  families: EmailFamily[]
  /** Limited to some products: how many; null for any product, or a trigger that has none. */
  products: number | null
  sent: number
  lastAt: string | null
}

export interface EmailActivity {
  days: number
  emails: Record<string, Sent>
  /** By community id, by community email id (lib/emails/customer-catalog.ts COMMUNITY_EMAILS). */
  communities: Record<string, Record<string, Sent>>
  flows: FlowActivity[]
  /** An automation on "Leaves checkout" that is on: Storelib's own checkout reminder stands aside for it. */
  reminderReplacedBy: { id: string; name: string } | null
}

function add(map: Record<string, Sent>, id: string, at: string | null | undefined) {
  const row = (map[id] ??= { sent: 0, lastAt: null })
  row.sent++
  if (at && (!row.lastAt || at > row.lastAt)) row.lastAt = at
}

/** Which physical email an "email.sent" entry was, from its key (`email_sent:<template>:<id>:<kind or status>`) and its words. */
export function physicalEmailOf(key: string | null | undefined, message: string | null | undefined): string | null {
  const parts = (key ?? "").split(":")
  if (parts[0] !== "email_sent" || parts.length < 3) return null
  const template = parts[1]
  const last = parts[parts.length - 1] || null
  const pickup = /pickup|picked up/i.test(message ?? "")
  if (template === "shipment") return emailIdForJob("shipment", last, null, pickup)
  if (template === "return") return emailIdForJob("return", null, last)
  return emailIdForJob(template)
}

const COMMUNITY_TYPE_TO_ID: Record<string, string> = {
  COMMUNITY_WELCOME: "community_welcome",
  COMMUNITY_JOIN_APPROVED: "community_join_approved",
  COMMUNITY_INVITE: "community_invite",
  COMMUNITY_BROADCAST: "community_broadcast",
  COMMUNITY_EVENT_TICKET: "community_event_ticket",
  COMMUNITY_EVENT_TICKET_INVITE: "community_event_ticket_invite",
  COMMUNITY_EVENT_REFUND: "community_event_refund",
  COMMUNITY_EVENT_CANCELLED: "community_event_cancelled",
}

async function quietly<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch {
    return fallback
  }
}

export async function emailActivity(db: Db, creatorId: string, opts: { physical: boolean; communityIds: string[] }): Promise<EmailActivity> {
  const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000).toISOString()
  const emails: Record<string, Sent> = {}
  const communities: Record<string, Record<string, Sent>> = {}

  const receipts = quietly(async () => {
    const { data, error } = await db.from("orders").select("id, stripe_session_id, buyer_notified_at, checkout_id").eq("creator_id", creatorId).gte("buyer_notified_at", since).limit(5000)
    if (error) return
    const seen = new Set<string>()
    for (const r of (data ?? []) as Array<{ id: string; stripe_session_id: string | null; buyer_notified_at: string | null; checkout_id: string | null }>) {
      const payment = r.stripe_session_id ? `s:${r.stripe_session_id}` : `o:${r.id}`
      if (seen.has(payment)) continue
      seen.add(payment)
      add(emails, "receipt", r.buyer_notified_at)
    }
  }, undefined)

  const refunds = quietly(async () => {
    const { data, error } = await db.from("orders").select("id, refunded_at, checkout_id").eq("creator_id", creatorId).gte("refunded_at", since).is("checkout_id", null).limit(5000)
    if (error) return
    for (const r of (data ?? []) as Array<{ refunded_at: string | null }>) add(emails, "digital_refund", r.refunded_at)
  }, undefined)

  const physical = opts.physical
    ? quietly(async () => {
        const { data, error } = await db.from("commerce_order_events").select("idempotency_key, message, created_at").eq("creator_id", creatorId).eq("kind", "email.sent").gte("created_at", since).limit(10000)
        if (error) return
        for (const r of (data ?? []) as Array<{ idempotency_key: string | null; message: string | null; created_at: string }>) {
          const id = physicalEmailOf(r.idempotency_key, r.message)
          if (id) add(emails, id, r.created_at)
        }
      }, undefined)
    : Promise.resolve()

  const members = opts.communityIds.length
    ? quietly(async () => {
        const { data, error } = await db
          .from("notification_jobs")
          .select("type, entity_id, sent_at")
          .eq("entity_type", "community")
          .in("entity_id", opts.communityIds.slice(0, 50))
          .eq("state", "sent")
          .gte("sent_at", since)
          .in("type", Object.keys(COMMUNITY_TYPE_TO_ID))
          .limit(20000)
        if (error) return
        for (const r of (data ?? []) as Array<{ type: string; entity_id: string; sent_at: string | null }>) {
          const id = COMMUNITY_TYPE_TO_ID[r.type]
          if (!id) continue
          add((communities[r.entity_id] ??= {}), id, r.sent_at)
        }
      }, undefined)
    : Promise.resolve()

  const flows = quietly(async (): Promise<{ flows: FlowActivity[]; replaced: EmailActivity["reminderReplacedBy"] }> => {
    const { data, error } = await db.from("email_flows").select("id, name, trigger_type, trigger_config, status").eq("creator_id", creatorId).order("created_at", { ascending: false })
    if (error) return { flows: [], replaced: null }
    const rows = (data ?? []) as Array<{ id: string; name: string; trigger_type: string; trigger_config: { product_ids?: unknown } | null; status: string }>
    const ids = [...new Set(rows.flatMap((f) => (Array.isArray(f.trigger_config?.product_ids) ? (f.trigger_config!.product_ids as unknown[]) : []).filter((x): x is string => typeof x === "string")))]
    const types = new Map<string, string>()
    if (ids.length) {
      const { data: products } = await db.from("products").select("id, type").eq("creator_id", creatorId).in("id", ids.slice(0, 500))
      for (const p of (products ?? []) as Array<{ id: string; type: string | null }>) types.set(p.id, p.type ?? "digital")
    }
    const sent: Record<string, Sent> = {}
    const { data: sends, error: sendsError } = await db.from("email_flow_sends").select("flow_id, sent_at").eq("creator_id", creatorId).eq("status", "sent").gte("sent_at", since).limit(20000)
    if (!sendsError) for (const s of (sends ?? []) as Array<{ flow_id: string; sent_at: string | null }>) add(sent, s.flow_id, s.sent_at)
    const list: FlowActivity[] = rows.map((f) => {
      const productIds = Array.isArray(f.trigger_config?.product_ids) ? (f.trigger_config!.product_ids as unknown[]) : []
      return {
        id: f.id,
        name: f.name,
        trigger_type: f.trigger_type,
        status: f.status,
        families: flowFamilies(f.trigger_type, productIds, (id) => types.get(id), opts.physical),
        products: (f.trigger_type === "purchase" || f.trigger_type === "first_purchase") && productIds.length ? productIds.length : null,
        sent: sent[f.id]?.sent ?? 0,
        lastAt: sent[f.id]?.lastAt ?? null,
      }
    })
    const on = rows.find((f) => f.trigger_type === "abandoned_checkout" && f.status === "active")
    return { flows: list, replaced: on ? { id: on.id, name: on.name } : null }
  }, { flows: [], replaced: null })

  const [, , , , automations] = await Promise.all([receipts, refunds, physical, members, flows])
  return { days: ACTIVITY_DAYS, emails, communities, flows: automations.flows, reminderReplacedBy: automations.replaced }
}
