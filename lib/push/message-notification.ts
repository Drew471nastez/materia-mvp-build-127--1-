/**
 * Everything that decides whether a chat message becomes a push, and what it
 * says when it does.
 *
 * ---------------------------------------------------------------------------
 * Why this is a module and not three copies inside three routes
 * ---------------------------------------------------------------------------
 * Three API routes insert a user-to-user message, and every one of them would
 * otherwise need the same eight decisions: is the recipient the sender, have we
 * already handled this message, has this person muted chat, do they want a
 * preview, how many unread are there in this thread, what is the badge, what
 * does the body say, and what does it group with. Written three times, they
 * drift, and the one that drifts is the one that spams somebody.
 *
 * It is also the only shape that can be tested. Every dependency arrives as an
 * argument — the database client and the send function — so the whole decision
 * table can be driven without a network, a device, or Firebase credentials.
 * See tests/push-notifications.test.ts.
 *
 * ---------------------------------------------------------------------------
 * The order of the checks is deliberate
 * ---------------------------------------------------------------------------
 * Cheapest and most certain first. The sender check is free and absolute; the
 * idempotency claim is one indexed insert and decides whether anything else
 * should happen at all; preferences and unread counts are reads, and only then
 * is anything sent. A push that was never going to go out should cost a
 * comparison, not a round trip.
 */

import "server-only"

export type MessageKind = "text" | "image" | "offer"

/** Only what a decision needs. Deliberately not the message row. */
export interface NewMessageInput {
  messageId: string
  conversationId: string
  senderId: string
  recipientId: string
  kind: MessageKind
  body?: string | null
  offerCents?: number | null
}

export type SkipReason =
  | "self"
  | "no-recipient"
  | "duplicate"
  | "muted"
  | "already-read"

export interface NotifyOutcome {
  sent: boolean
  reason?: SkipReason
  /** What was handed to the sender, when something was. For tests and logs. */
  push?: BuiltPush
  delivery?: { sent: number; invalid: number; failed: number; attempted: number }
}

export interface BuiltPush {
  title: string
  body: string
  data: Record<string, string>
  threadId: string
  collapseId: string
  badge: number
  /** Absent means the default sound. The cash register belongs to a sale. */
  sound?: string
}

/** Long enough to know whether it is worth opening, short enough for a banner. */
export const PREVIEW_MAX = 90

/**
 * The one-line summary of a single message.
 *
 * Whitespace is collapsed before anything else: a body of forty newlines is a
 * notification that looks empty, and a body with a newline in the middle is a
 * banner that renders as two lines of which you see one.
 */
export function previewFor(kind: MessageKind, body?: string | null, offerCents?: number | null): string {
  if (kind === "image") return "Ți-a trimis o fotografie"
  if (kind === "offer") {
    const amount = typeof offerCents === "number" && Number.isFinite(offerCents)
      ? Math.round(offerCents / 100)
      : null
    return amount !== null ? `Ți-a trimis o ofertă: ${amount} RON` : "Ți-a trimis o ofertă"
  }
  const text = (body ?? "").replace(/\s+/g, " ").trim()
  if (!text) return "Ți-a trimis un mesaj"
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text
}

/**
 * What the notification says once more than one message is waiting.
 *
 * This is the whole of the "do not send five banners" behaviour, and it is
 * worth being precise about what it is and is not. It is NOT batching: every
 * message still produces one push. What changes is that they all carry the same
 * collapse id, so the system replaces the previous banner rather than adding
 * to it — and the text of each one is derived from how many are actually
 * unread, so the second says "2 mesaje noi" and the fifth says "5 mesaje noi".
 *
 * The count comes from the messages table, not from a counter of pushes sent.
 * A push that failed, a device that was off, a notification the user swiped
 * away — none of them can put this number out of step with what is actually
 * waiting, because it is recomputed from the source of truth every time.
 */
export function bodyFor(unreadInConversation: number, single: string): string {
  return unreadInConversation > 1 ? `${unreadInConversation} mesaje noi` : single
}

/** The grouping keys. Per conversation, never per user — two people writing at
 *  the same time must produce two stacks, not one pile. */
export function threadIdFor(conversationId: string): string {
  return `conversation_${conversationId}`
}

/**
 * The db surface this needs. An interface rather than the Supabase client so a
 * test can supply seven functions instead of a database.
 */
export interface MessagePushDb {
  /** Insert the idempotency row. False means somebody already claimed it. */
  claimMessage(messageId: string, recipientId: string): Promise<boolean>
  /** { enabled, preview }. Absent columns must resolve to the permissive default. */
  prefsFor(userId: string): Promise<{ enabled: boolean; preview: boolean }>
  /** Display name, or null. */
  nameOf(userId: string): Promise<string | null>
  /** Unread FOR THIS RECIPIENT in this conversation, from the messages table. */
  unreadInConversation(conversationId: string, recipientId: string): Promise<number>
  /** Unread across every conversation — the app icon's number. */
  unreadTotal(recipientId: string): Promise<number>
  /** Whether this exact message has already been read. See the note below. */
  isMessageRead(messageId: string): Promise<boolean>
}

export type SendFn = (userId: string, payload: {
  title: string
  body: string
  data: Record<string, string>
  sound?: string
  badge?: number
  threadId?: string
  collapseId?: string
}) => Promise<{ sent: number; invalid: number; failed: number; attempted: number }>

export async function notifyNewMessage(
  input: NewMessageInput,
  db: MessagePushDb,
  send: SendFn,
): Promise<NotifyOutcome> {
  // ── 1. Never the person who typed it. Free, absolute, first. ──────────────
  if (!input.recipientId) return { sent: false, reason: "no-recipient" }
  if (input.recipientId === input.senderId) return { sent: false, reason: "self" }

  // ── 2. Claim the message. ────────────────────────────────────────────────
  //  A primary key insert, so two instances racing on the same message resolve
  //  in Postgres and exactly one wins. This is what makes a retried request, a
  //  double-invoked function, or two routes somehow reaching the same row
  //  produce one notification rather than two.
  //
  //  Before anything is read or sent, so a duplicate costs one statement.
  if (!(await db.claimMessage(input.messageId, input.recipientId))) {
    return { sent: false, reason: "duplicate" }
  }

  // ── 3. Has this person asked not to be told? ─────────────────────────────
  const prefs = await db.prefsFor(input.recipientId)
  if (!prefs.enabled) return { sent: false, reason: "muted" }

  // ── 4. Already read? ─────────────────────────────────────────────────────
  //  The safe half of "do not interrupt somebody who is already reading this".
  //
  //  There is no durable per-conversation presence in this application — see
  //  the note at the bottom of this file — so this does not attempt to guess
  //  whether the recipient is looking at the thread. It asks a question that
  //  has a definite answer: by the time this ran, had the message already been
  //  marked read? If it had, the recipient has demonstrably seen it and a
  //  banner is noise. If it had not, we say nothing about where they are and
  //  send.
  //
  //  It is never wrong in the direction that matters. It can miss a suppression
  //  (they are in the thread but the mark-read has not landed yet); it cannot
  //  suppress a message nobody has seen.
  if (await db.isMessageRead(input.messageId)) {
    return { sent: false, reason: "already-read" }
  }

  // ── 5. Build it. ─────────────────────────────────────────────────────────
  const [name, unreadHere, unreadAll] = await Promise.all([
    db.nameOf(input.senderId),
    db.unreadInConversation(input.conversationId, input.recipientId),
    db.unreadTotal(input.recipientId),
  ])

  const senderName = (name ?? "").trim() || "Storelib"
  const single = previewFor(input.kind, input.body, input.offerCents)

  // Previews off: the fact of a message, and nothing about it. Not the sender's
  // name either — who is writing to you is as private as what they wrote.
  const push: BuiltPush = prefs.preview
    ? {
        title: senderName,
        body: bodyFor(unreadHere, single),
        data: {
          type: "message",
          conversationId: input.conversationId,
          messageId: input.messageId,
          senderId: input.senderId,
          senderName,
          messageKind: input.kind,
          threadId: threadIdFor(input.conversationId),
          unreadCount: String(unreadHere),
        },
        threadId: threadIdFor(input.conversationId),
        collapseId: threadIdFor(input.conversationId),
        badge: unreadAll,
      }
    : {
        title: "Storelib",
        body: "Ai un mesaj nou",
        // The id still travels, because the tap still has to open the right
        // thread. It is an opaque uuid — it says nothing about the message.
        data: {
          type: "message",
          conversationId: input.conversationId,
          messageId: input.messageId,
          threadId: threadIdFor(input.conversationId),
        },
        threadId: threadIdFor(input.conversationId),
        collapseId: threadIdFor(input.conversationId),
        badge: unreadAll,
      }

  const delivery = await send(input.recipientId, {
    title: push.title,
    body: push.body,
    data: push.data,
    badge: push.badge,
    threadId: push.threadId,
    collapseId: push.collapseId,
    // No `sound`, which the sender turns into the platform default.
  })

  return { sent: true, push, delivery }
}

/**
 * ---------------------------------------------------------------------------
 * The limitation, stated rather than guessed at
 * ---------------------------------------------------------------------------
 * "Do not notify somebody who is currently looking at this exact conversation"
 * cannot be answered reliably with what this application stores today, and the
 * check above deliberately does not pretend otherwise.
 *
 * What exists: `announceThread` broadcasts over Supabase Realtime, which is
 * ephemeral and server-to-client — the server can ring the channel but cannot
 * ask who is listening. `profiles.last_seen_at` says the person used the app
 * recently, which is not the same question and would suppress notifications for
 * anybody who happened to have it open on another screen — explicitly the wrong
 * behaviour. And `read_at` is written by `readThread`, i.e. when the thread is
 * FETCHED, so a message arriving over the socket into an already-open thread
 * does not mark itself read.
 *
 * What it would take: a `conversation_presence(user_id, conversation_id,
 * seen_at)` row upserted on a heartbeat from the open thread, checked here with
 * a freshness window of about thirty seconds. It expires by construction — a
 * crashed app simply stops writing, and a stale row is indistinguishable from
 * no row. That is perhaps a hundred lines across a migration, a route and a
 * timer in the thread, and it is the right way to do it.
 *
 * Until then the collapse id carries most of the benefit: somebody reading a
 * conversation as it arrives gets one banner that keeps being replaced, not a
 * stack.
 */
