import { createAdminClient } from "@/lib/supabase/admin"
import { sendPushToUser } from "./sender"

/**
 * Push notification builders for Storelib seller events.
 * Call these from webhook handlers, Stripe listeners, payout jobs, etc.
 */

// ── A new chat message ───────────────────────────────────────────────────────

/** Long enough to know whether it is worth opening, short enough for a banner. */
const PREVIEW_MAX = 90

interface NewMessageOptions {
  /** The person who wrote it. Never notified — see the guard below. */
  senderId: string
  conversationId: string
  kind: "text" | "image" | "offer"
  /** The text, if there is any. Null for a photo with no caption. */
  body?: string | null
  /** Minor units, for an offer. */
  offerCents?: number | null
}

/**
 * Tell somebody they have a message.
 *
 * ── Who ──────────────────────────────────────────────────────────────────────
 * `recipientId` and `senderId` are both required and compared here rather than
 * at each call site. Three routes create messages and every one of them has
 * already worked out who the other party is; making them pass both means the
 * "never notify the person who just typed it" rule is written once, in the only
 * place that can enforce it, instead of three times in places that could drift.
 *
 * ── What it says ─────────────────────────────────────────────────────────────
 * The title is the sender's name, because that is the only thing on a lock
 * screen that decides whether you open it. The name is read here, from
 * `profiles`, rather than passed in: the routes have a user id and would each
 * need their own query, and a push that arrives as "Utilizator" because one
 * caller did not bother is worse than the extra round trip. It is on the far
 * side of the response either way — see the `after()` calls at the call sites.
 *
 * A photo has no text to preview, and an offer's text is the amount rather than
 * whatever was typed alongside it, so each kind states itself.
 *
 * ── The sound ────────────────────────────────────────────────────────────────
 * `sound` is deliberately not set, which sender.ts turns into "default". The
 * cash register belongs to a sale — an amount of money arriving is a different
 * kind of event from somebody asking whether a jumper is still available, and
 * a chat that sounds like a sale devalues both.
 */
export async function notifyNewMessage(
  recipientId: string,
  opts: NewMessageOptions,
): Promise<void> {
  // The one rule this function exists to guarantee.
  if (!recipientId || recipientId === opts.senderId) return

  const admin = createAdminClient()

  let senderName = "Mesaj nou"
  try {
    const { data } = await admin
      .from("profiles")
      .select("display_name, username")
      .eq("id", opts.senderId)
      .maybeSingle()
    senderName = data?.display_name?.trim() || data?.username?.trim() || "Mesaj nou"
  } catch {
    // A name we could not read is not a reason to withhold the message.
  }

  let preview: string
  if (opts.kind === "image") {
    preview = "📷 Ți-a trimis o fotografie"
  } else if (opts.kind === "offer") {
    const amount = typeof opts.offerCents === "number" ? (opts.offerCents / 100).toFixed(0) : null
    preview = amount ? `💰 Ofertă nouă: ${amount} RON` : "💰 Ofertă nouă"
  } else {
    const text = (opts.body ?? "").replace(/\s+/g, " ").trim()
    preview = text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text || "Mesaj nou"
  }

  return sendPushToUser(recipientId, {
    title: senderName,
    body: preview,
    // Every value in `data` must be a string: FCM rejects the whole message if
    // one is not, and a number here would mean the push silently never arrives.
    data: {
      type: "message",
      conversationId: opts.conversationId,
      senderName,
    },
  })
}

// ── Sale ─────────────────────────────────────────────────────────────────────

interface SaleOptions {
  productName: string
  /** Amount in cents */
  amountCents: number
  orderId: string
  productId: string
}

export async function notifySale(userId: string, opts: SaleOptions): Promise<void> {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(opts.amountCents / 100)

  return sendPushToUser(userId, {
    title: "🎉 You made a sale!",
    body: `You sold ${opts.productName} for ${amount}`,
    data: {
      type: "sale",
      orderId: opts.orderId,
      productId: opts.productId,
    },
    sound: "cash",
  })
}

// ── Payout available ──────────────────────────────────────────────────────────

export async function notifyPayoutAvailable(userId: string, amountCents: number): Promise<void> {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100)

  return sendPushToUser(userId, {
    title: "Payout available",
    body: `${amount} is ready to cash out`,
    data: {
      type: "payout_available",
    },
  })
}
