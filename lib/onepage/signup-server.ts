import "server-only"

/**
 * A OnePage signup kept on Storelib, for the lead magnets
 * (app/api/onepage/lead-magnet): the lead on the page (onepage_leads, with
 * what it was for: SQL part 316's magnet_kind and magnet_label), and the
 * person on the creator's list (subscribers) with the welcome flow, exactly
 * as the email signup does it (app/api/onepage/leads). A database without
 * part 316's columns still keeps the lead, without them.
 */

import { randomUUID } from "node:crypto"
import { triggerEmailFlows } from "@/lib/email"
import { recordContactSource } from "@/lib/contacts/contact-source"
import { recordSignupAttribution } from "@/lib/attribution/server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface LeadInput {
  onepageId: string
  email: string
  name: string | null
  blockId: string | null
  referrer: string | null
  utm: { source?: string | null; medium?: string | null; campaign?: string | null }
  magnetKind: string | null
  magnetLabel: string | null
  country: { code: string | null; name: string | null }
}

/** The lead on the page. `fresh` is false for an address already on it. */
export async function saveLead(db: Db, input: LeadInput): Promise<{ ok: true; fresh: boolean } | { ok: false }> {
  const row: Record<string, unknown> = {
    onepage_id: input.onepageId,
    email: input.email,
    name: input.name,
    block_id: input.blockId,
    referrer: input.referrer,
    utm_source: input.utm.source || null,
    utm_medium: input.utm.medium || null,
    utm_campaign: input.utm.campaign || null,
    delivery_status: "not_applicable",
    magnet_kind: input.magnetKind,
    magnet_label: input.magnetLabel,
    country_code: input.country.code,
    country_name: input.country.name,
  }
  const optional = ["magnet_kind", "magnet_label", "country_code", "country_name"]
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await db.from("onepage_leads").insert(attempt === 0 ? row : Object.fromEntries(Object.entries(row).filter(([k]) => !optional.includes(k))))
    if (!error) return { ok: true, fresh: true }
    if (error.code === "23505") return { ok: true, fresh: false }
    if (error.code !== "PGRST204" && error.code !== "42703") return { ok: false }
  }
  return { ok: false }
}

/** On the creator's list, or back on it, with the welcome. Never throws. */
export async function addSubscriber(db: Db, creatorId: string, input: { email: string; name: string | null; onepageId: string; consentText: string; source: unknown; sent: unknown }): Promise<void> {
  try {
    const { data: existing } = await db.from("subscribers").select("id, status").eq("creator_id", creatorId).eq("email", input.email).maybeSingle()
    const at = new Date().toISOString()
    let joined = false
    if (!existing) {
      const { error } = await db.from("subscribers").insert({
        email: input.email,
        name: input.name,
        source: "onepage",
        source_id: input.onepageId,
        creator_id: creatorId,
        status: "subscribed",
        is_active: true,
        subscribed_at: at,
        consent_text: input.consentText,
        consent_timestamp: at,
        unsubscribe_token: randomUUID(),
      })
      joined = !error
    } else if (existing.status === "unsubscribed" || existing.status === "customer" || existing.status === "wrote") {
      const { error } = await db.from("subscribers").update({ status: "subscribed", is_active: true, subscribed_at: at, unsubscribed_at: null, consent_text: input.consentText, consent_timestamp: at }).eq("id", existing.id)
      joined = !error
    }
    if (!joined) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordContactSource(db, creatorId, input.email, input.source as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordSignupAttribution(db, { creatorId, email: input.email, source: input.source as any, sent: input.sent })
    await triggerEmailFlows(db, { triggerType: "new_subscriber", creatorId, recipientEmail: input.email, recipientName: input.name || undefined, source: input.source as never })
  } catch (e) {
    console.error("[onepage-signup] subscriber step failed (non-fatal):", e)
  }
}

type Block = { id?: string; type?: string; enabled?: boolean; data?: Record<string, unknown> }

/** A block of the published page by its id, in a group or not. */
export function publishedBlock(blocks: unknown, id: string): Block | null {
  if (!Array.isArray(blocks) || !id) return null
  for (const raw of blocks) {
    const b = raw as Block | null
    if (!b || typeof b !== "object") continue
    if (b.id === id) return b
    if (b.type === "group" && Array.isArray(b.data?.children)) {
      const inner = publishedBlock(b.data!.children, id)
      if (inner) return inner
    }
  }
  return null
}
