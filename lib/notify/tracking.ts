import "server-only"

/**
 * ===========================================================================
 *  WHAT HAPPENED TO AN EMAIL AFTER IT LEFT
 * ===========================================================================
 * The Mailgun webhook hands each event here. The delivery is found by the
 * v:delivery_id variable every engine email carries, else by its Message-Id,
 * and its row moves forward: delivered, opened, clicked, or bounced and
 * complained. A row never moves back (an open after a bounce changes only
 * opened_at).
 *
 * What an event means for the address, whether or not the email was the
 * engine's:
 *
 *   failed, permanent   suppressed for everything (scope all, "bounce"):
 *                       the address does not take mail
 *   complained          suppressed for optional email (scope optional,
 *                       "complaint"), and, when the person is known, their
 *                       lifecycle, tips and marketing email turned off
 *                       (source "mailgun"). Security and payment email
 *                       still reaches them.
 *   unsubscribed        on an engine email: that email's category turned
 *                       off by email, unless it is a required one
 *
 * Addresses are never logged in full; tokens and keys never at all.
 */
import { notifyLog } from "./log"
import { OPTIONAL_EMAIL_CATEGORIES } from "./registry"
import { storeOf, type DbLike, type DeliveryRow, type ProviderUpdate } from "./store"
import type { PreferenceCategory } from "./types"

export type ProviderEventName = "accepted" | "delivered" | "failed" | "opened" | "clicked" | "unsubscribed" | "complained" | "rejected" | "stored" | string

export interface ProviderEvent {
  event: ProviderEventName
  severity?: string | null
  recipient?: string | null
  deliveryId?: string | null
  messageId?: string | null
  /** When it happened, ISO. */
  at?: string | null
  reason?: string | null
}

export interface TrackingResult {
  delivery: DeliveryRow | null
  suppressed: "all" | "optional" | null
  preferencesOff: PreferenceCategory[]
}

export function updateFor(ev: ProviderEvent): ProviderUpdate | null {
  const at = ev.at || new Date().toISOString()
  switch (ev.event) {
    case "accepted":
      return { providerMessageId: ev.messageId ?? null }
    case "delivered":
      return { status: "delivered", deliveredAt: at }
    case "failed":
      return ev.severity === "permanent"
        ? { status: "bounced", failedAt: at, failureReason: "The receiving mail server refused it." }
        : { failureReason: "The receiving server deferred it; Mailgun is trying again." }
    case "opened":
      return { openedAt: at }
    case "clicked":
      return { clickedAt: at }
    case "complained":
      return { status: "complained", complainedAt: at }
    case "unsubscribed":
      return { status: "unsubscribed", unsubscribedAt: at }
    default:
      return null
  }
}

export async function recordProviderEvent(db: DbLike, ev: ProviderEvent): Promise<TrackingResult> {
  const store = storeOf(db)
  const out: TrackingResult = { delivery: null, suppressed: null, preferencesOff: [] }
  const email = (ev.recipient || "").trim().toLowerCase()

  if (ev.deliveryId || ev.messageId) {
    out.delivery = await store.findDelivery({ deliveryId: ev.deliveryId ?? null, providerMessageId: ev.messageId ?? null })
    const patch = updateFor(ev)
    if (out.delivery && patch) {
      /* Bounced and complained rows stay what they are; later opens and clicks only stamp their time. */
      const settled = out.delivery.status === "bounced" || out.delivery.status === "complained"
      await store.updateDelivery(out.delivery.id, settled ? { ...patch, status: undefined } : patch)
    }
  }

  if (!email.includes("@")) return out

  if (ev.event === "failed" && ev.severity === "permanent") {
    await store.suppress(email, "all", "bounce", "mailgun")
    out.suppressed = "all"
  } else if (ev.event === "complained") {
    await store.suppress(email, "optional", "complaint", "mailgun")
    out.suppressed = "optional"
    const userId = out.delivery?.recipient_user_id ?? null
    if (userId) {
      for (const category of OPTIONAL_EMAIL_CATEGORIES) {
        await store.setPreference(userId, category, "email", false, "mailgun")
        out.preferencesOff.push(category)
      }
    }
  } else if (ev.event === "unsubscribed" && out.delivery) {
    const d = out.delivery
    if (d.recipient_user_id && d.category && d.requirement && d.requirement !== "required_service" && d.category !== "security") {
      await store.setPreference(d.recipient_user_id, d.category, "email", false, "mailgun")
      out.preferencesOff.push(d.category)
    }
  }

  if (out.suppressed || out.preferencesOff.length) {
    notifyLog("info", "provider event applied", { event: ev.event, email, deliveryId: out.delivery?.id ?? null, suppressed: out.suppressed, preferencesOff: out.preferencesOff.join(",") })
  }
  return out
}
