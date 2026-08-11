/**
 * Chat push notifications — the decision table.
 *
 * These drive the REAL modules. `notifyNewMessage` and `tapTargetFor` are
 * imported from lib/, not reimplemented here, so a change to either that breaks
 * a rule breaks a test. What is faked is the database and the send function,
 * because those are the two things that need a network — and both are faked as
 * recorders, so the assertions are about what the real code decided rather than
 * about what a mock returned.
 *
 * Run with:  npm run test:push
 */

import {
  notifyNewMessage,
  previewFor,
  bodyFor,
  threadIdFor,
  PREVIEW_MAX,
  type MessagePushDb,
  type NewMessageInput,
} from "../lib/push/message-notification"
import { tapTargetFor } from "../lib/push/tap-target"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Source without comments — the prose here describes the very things being
 *  asserted absent, and matching raw source fails the test while the code is
 *  right. */
const strip = stripComments

// ── a tiny harness ──────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`)
  }
}
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  check(name, a === b, `got ${a}\n          want ${b}`)
}
function section(title: string) {
  console.log(`\n${title}`)
}

// ── a fake database, and a record of what was asked of it ───────────────────
type FakeOpts = {
  claimed?: Set<string>
  enabled?: boolean
  preview?: boolean
  name?: string | null
  unreadHere?: number
  unreadTotal?: number
  read?: boolean
  /** Milliseconds since the recipient's app was last in the foreground.
   *  Undefined means never seen, which must behave as "send". */
  seenMsAgo?: number
}

function fakeDb(o: FakeOpts = {}) {
  const claimed = o.claimed ?? new Set<string>()
  const calls: string[] = []
  const db: MessagePushDb = {
    async claimMessage(id) {
      calls.push("claim")
      if (claimed.has(id)) return false
      claimed.add(id)
      return true
    },
    async prefsFor() {
      calls.push("prefs")
      return { enabled: o.enabled ?? true, preview: o.preview ?? true }
    },
    async nameOf() {
      calls.push("name")
      return o.name === undefined ? "Sarah" : o.name
    },
    async lastSeenAt() {
      calls.push("lastSeen")
      return o.seenMsAgo === undefined ? null : new Date(Date.now() - o.seenMsAgo)
    },
    async unreadInConversation() {
      calls.push("unreadHere")
      return o.unreadHere ?? 1
    },
    async unreadTotal() {
      calls.push("unreadTotal")
      return o.unreadTotal ?? 1
    },
    async isMessageRead() {
      calls.push("read")
      return o.read ?? false
    },
  }
  return { db, calls, claimed }
}

/** A send that records, and can be told which devices fail. */
function fakeSend(result = { sent: 1, invalid: 0, failed: 0, attempted: 1 }) {
  const seen: { userId: string; payload: any }[] = []
  const fn = async (userId: string, payload: any) => {
    seen.push({ userId, payload })
    return result
  }
  return { fn, seen }
}

const SENDER = "11111111-1111-1111-1111-111111111111"
const RECIPIENT = "22222222-2222-2222-2222-222222222222"
const CONVO = "33333333-3333-3333-3333-333333333333"
const MSG = "44444444-4444-4444-4444-444444444444"

const base: NewMessageInput = {
  messageId: MSG,
  conversationId: CONVO,
  senderId: SENDER,
  recipientId: RECIPIENT,
  kind: "text",
  body: "Hey, is this still available?",
}

async function run() {
  // ────────────────────────────────────────────────────────────────────────
  section("who is notified")
  {
    const { db } = fakeDb()
    const s = fakeSend()
    const r = await notifyNewMessage({ ...base, recipientId: SENDER }, db, s.fn)
    eq("the sender never receives their own message", [r.sent, r.reason], [false, "self"])
    eq("  …and nothing was sent", s.seen.length, 0)
  }
  {
    const { db } = fakeDb()
    const s = fakeSend()
    const r = await notifyNewMessage({ ...base, recipientId: "" }, db, s.fn)
    eq("a missing recipient sends nothing", [r.sent, r.reason], [false, "no-recipient"])
  }
  {
    const { db } = fakeDb()
    const s = fakeSend()
    const r = await notifyNewMessage(base, db, s.fn)
    check("the recipient receives a text notification", r.sent === true)
    eq("  …addressed to them", s.seen[0]?.userId, RECIPIENT)
  }

  // ────────────────────────────────────────────────────────────────────────
  section("what each kind says")
  {
    const { db } = fakeDb()
    const s = fakeSend()
    await notifyNewMessage(base, db, s.fn)
    eq("text: the sender's name is the title", s.seen[0].payload.title, "Sarah")
    eq("text: the body is the message", s.seen[0].payload.body, "Hey, is this still available?")
  }
  {
    const { db } = fakeDb()
    const s = fakeSend()
    await notifyNewMessage({ ...base, kind: "image", body: null }, db, s.fn)
    eq("image", s.seen[0].payload.body, "Ți-a trimis o fotografie")
    eq("  …and says so in the data", s.seen[0].payload.data.messageKind, "image")
  }
  {
    const { db } = fakeDb()
    const s = fakeSend()
    await notifyNewMessage({ ...base, kind: "offer", offerCents: 36800, body: null }, db, s.fn)
    eq("offer carries the amount", s.seen[0].payload.body, "Ți-a trimis o ofertă: 368 RON")
  }
  eq("an offer with no amount still reads", previewFor("offer", null, null), "Ți-a trimis o ofertă")
  eq("an empty body still says something", previewFor("text", "   "), "Ți-a trimis un mesaj")
  eq("newlines are collapsed", previewFor("text", "salut\n\n  ce faci"), "salut ce faci")
  eq("a long message is cut", previewFor("text", "x".repeat(400)).length, PREVIEW_MAX)

  // ────────────────────────────────────────────────────────────────────────
  section("idempotency — one push per message, whatever happens upstream")
  {
    const claimed = new Set<string>()
    const s = fakeSend()
    const a = await notifyNewMessage(base, fakeDb({ claimed }).db, s.fn)
    const b = await notifyNewMessage(base, fakeDb({ claimed }).db, s.fn)
    check("the first processing sends", a.sent === true)
    eq("the second is refused", [b.sent, b.reason], [false, "duplicate"])
    eq("exactly one notification left the building", s.seen.length, 1)
  }
  {
    // The claim is taken BEFORE the reads, so a duplicate costs one statement.
    const claimed = new Set<string>([MSG])
    const f = fakeDb({ claimed })
    await notifyNewMessage(base, f.db, fakeSend().fn)
    eq("a duplicate reads nothing else", f.calls, ["claim"])
  }

  // ────────────────────────────────────────────────────────────────────────
  section("grouping — five quick messages are one banner that changes")
  {
    const { db } = fakeDb({ unreadHere: 1 })
    const s = fakeSend()
    await notifyNewMessage(base, db, s.fn)
    eq("the first says what was said", s.seen[0].payload.body, "Hey, is this still available?")
  }
  {
    const { db } = fakeDb({ unreadHere: 3 })
    const s = fakeSend()
    await notifyNewMessage({ ...base, messageId: "x" }, db, s.fn)
    eq("the third says how many", s.seen[0].payload.body, "3 mesaje noi")
    eq("  …and the title is still the person", s.seen[0].payload.title, "Sarah")
  }
  eq("the count is never 'N' for one", bodyFor(1, "hello"), "hello")
  eq("the count takes over from two", bodyFor(2, "hello"), "2 mesaje noi")
  {
    const { db } = fakeDb()
    const s = fakeSend()
    await notifyNewMessage(base, db, s.fn)
    const p = s.seen[0].payload
    eq("it collapses onto its own conversation", p.collapseId, `conversation_${CONVO}`)
    eq("and threads with it", p.threadId, `conversation_${CONVO}`)
  }
  {
    // Two conversations, same recipient, same moment.
    const other = "55555555-5555-5555-5555-555555555555"
    const { db } = fakeDb()
    const s = fakeSend()
    await notifyNewMessage(base, db, s.fn)
    await notifyNewMessage(
      { ...base, messageId: "m2", conversationId: other, senderId: "alex" },
      fakeDb().db,
      s.fn,
    )
    check(
      "two conversations never share a group",
      s.seen[0].payload.collapseId !== s.seen[1].payload.collapseId,
      `${s.seen[0].payload.collapseId} vs ${s.seen[1].payload.collapseId}`,
    )
    eq("  …and both were sent", s.seen.length, 2)
  }

  // ────────────────────────────────────────────────────────────────────────
  section("preferences")
  {
    const { db } = fakeDb({ enabled: false })
    const s = fakeSend()
    const r = await notifyNewMessage(base, db, s.fn)
    eq("muted sends nothing", [r.sent, r.reason], [false, "muted"])
    eq("  …nothing at all", s.seen.length, 0)
  }
  {
    const { db } = fakeDb({ preview: false })
    const s = fakeSend()
    await notifyNewMessage(base, db, s.fn)
    const p = s.seen[0].payload
    eq("previews off: generic title", p.title, "Storelib")
    eq("previews off: generic body", p.body, "Ai un mesaj nou")
    check(
      "previews off: the message text appears nowhere",
      !JSON.stringify(p).includes("available"),
      JSON.stringify(p),
    )
    check(
      "previews off: the sender's name appears nowhere",
      !JSON.stringify(p).includes("Sarah"),
      JSON.stringify(p),
    )
    eq("previews off: the tap still knows where to go", p.data.conversationId, CONVO)
  }

  // ────────────────────────────────────────────────────────────────────────
  section("already read")
  {
    const { db } = fakeDb({ read: true })
    const s = fakeSend()
    const r = await notifyNewMessage(base, db, s.fn)
    eq("a message already read is not announced", [r.sent, r.reason], [false, "already-read"])
  }

  // ────────────────────────────────────────────────────────────────────────
  section("in the app right now")
  {
    // A banner for something already on screen is not a notification, it is the
    // app interrupting itself. The presence beacon only pings while the tab is
    // VISIBLE, so a recent timestamp means the app is in front of them.
    const r = await notifyNewMessage(base, fakeDb({ seenMsAgo: 5_000 }).db, fakeSend().fn)
    eq("somebody holding the phone with Storelib open is not pushed", [r.sent, r.reason], [false, "in-app"])

    const r2 = await notifyNewMessage(base, fakeDb({ seenMsAgo: 10 * 60_000 }).db, fakeSend().fn)
    eq("ten minutes away and the push comes back", r2.sent, true)

    // The beacon pings every 120s; the window has to be wider than that, or
    // somebody with the app open gets a banner in the gap between two pings.
    const r3 = await notifyNewMessage(base, fakeDb({ seenMsAgo: 130_000 }).db, fakeSend().fn)
    eq("a gap between two beacon pings still counts as present", [r3.sent, r3.reason], [false, "in-app"])

    // Never seen — a fresh account, or the column missing. Send.
    const r4 = await notifyNewMessage(base, fakeDb({}).db, fakeSend().fn)
    eq("an unknown last-seen sends rather than silences", r4.sent, true)

    // Presence is asked AFTER the cheap absolute checks, so a muted recipient
    // never costs a profile read.
    const f = fakeDb({ enabled: false, seenMsAgo: 5_000 })
    await notifyNewMessage(base, f.db, fakeSend().fn)
    eq("a muted recipient is never looked up for presence", f.calls.includes("lastSeen"), false)
  }

  // ────────────────────────────────────────────────────────────────────────
  section("badge — from the database, not from pushes sent")
  {
    const { db } = fakeDb({ unreadTotal: 7 })
    const s = fakeSend()
    await notifyNewMessage(base, db, s.fn)
    eq("the badge is the real unread total", s.seen[0].payload.badge, 7)
  }
  {
    const { db } = fakeDb({ unreadTotal: 0 })
    const s = fakeSend()
    await notifyNewMessage(base, db, s.fn)
    eq("zero is a real answer and is sent as one", s.seen[0].payload.badge, 0)
  }
  {
    // ── THE 1,216 ──────────────────────────────────────────────────────────
    // The query behind that number was
    //     from("messages").neq("sender_id", me).is("read_at", null)
    // with NO restriction to the caller's own conversations — through the admin
    // client, so RLS was not there to add one. It counted every unread message
    // on the platform. Every user's icon showed the same figure, and that
    // figure was Storelib's total message volume, on their phone.
    const src = strip(read("lib/push/message-db.ts"))
    const fn = src.slice(src.indexOf("async unreadTotal("), src.indexOf("async lastSeenAt("))
    eq(
      "the badge counts only conversations this person is in",
      /buyer_id\.eq\.\$\{recipientId\},seller_id\.eq\.\$\{recipientId\}/.test(fn) &&
        /\.in\("conversation_id"/.test(fn),
      true,
    )
    eq(
      "and it is bounded, so the id list cannot outgrow a request",
      /\.limit\(500\)/.test(fn),
      true,
    )
  }

  // ────────────────────────────────────────────────────────────────────────
  section("delivered now, not eventually")
  {
    const src = strip(read("lib/push/sender.ts"))
    // Without an explicit priority a push can be treated as deferrable and held
    // until the device next wakes for some other reason — minutes, not seconds.
    eq("iOS is told to deliver immediately", /"apns-priority": "10"/.test(src), true)
    eq("and told what kind of push it is", /"apns-push-type": "alert"/.test(src), true)
    // FCM's Android default is "normal", which is explicitly the batched tier.
    eq("Android is told to wake the device", /priority: "high"/.test(src), true)
  }
  {
    // Activity digests are batched ON PURPOSE — 10 minutes to settle, four
    // hours between pushes — so a burst of likes is one banner rather than
    // nine. That delay is the design and is left alone; the priority headers
    // above are about a push taking minutes to ARRIVE once it has been sent,
    // which is a different thing and was a real fault.
    const src = strip(read("lib/push/activity-notification.ts"))
    eq("the digest still settles before it sends", /SETTLE_MS = 10 \* 60_000/.test(src), true)
    eq("and still spaces itself out", /MIN_GAP_MS = 4 \* 60 \* 60_000/.test(src), true)
    // In-app suppression sits BEFORE the eligibility filter, so the events stay
    // pending and roll into the next digest instead of being consumed silently.
    const plan = src.slice(src.indexOf("export function planDigest"))
    eq(
      "a digest is not sent to somebody using the app",
      /if \(ctx\.inApp\) return \{ send: false, reason: "in-app", eventIds: \[\] \}/.test(plan),
      true,
    )
    eq(
      "and its events are not consumed by the skip",
      plan.indexOf("ctx.inApp") < plan.indexOf("const eligible"),
      true,
    )
    eq(
      "an unknown last-seen sends the digest rather than swallowing it",
      /Number\.isFinite\(seen\) &&/.test(strip(read("lib/push/activity-db.ts"))),
      true,
    )
  }

  // ────────────────────────────────────────────────────────────────────────
  section("delivery reporting")
  {
    const { db } = fakeDb()
    const s = fakeSend({ sent: 2, invalid: 1, failed: 1, attempted: 4 })
    const r = await notifyNewMessage(base, db, s.fn)
    eq("per-device outcomes come back for the log", r.delivery, {
      sent: 2,
      invalid: 1,
      failed: 1,
      attempted: 4,
    })
    check("one dead device did not stop the others", (r.delivery?.sent ?? 0) === 2)
  }
  {
    const { db } = fakeDb()
    const throwing = async () => {
      throw new Error("FCM is down")
    }
    let threw = false
    try {
      await notifyNewMessage(base, db, throwing as any)
    } catch {
      threw = true
    }
    check(
      "a send that throws propagates to the caller's catch, not into the route",
      threw,
      "the route wraps this in .catch() inside after() — see app/api/messages/[id]/route.ts",
    )
  }

  // ────────────────────────────────────────────────────────────────────────
  section("no sale sound on a chat message")
  {
    const { db } = fakeDb()
    const s = fakeSend()
    await notifyNewMessage(base, db, s.fn)
    eq("sound is left to the platform default", s.seen[0].payload.sound, undefined)
  }

  // ────────────────────────────────────────────────────────────────────────
  section("payload hygiene")
  {
    const { db } = fakeDb()
    const s = fakeSend()
    await notifyNewMessage(base, db, s.fn)
    const data = s.seen[0].payload.data
    check(
      "every data value is a string — FCM rejects the message otherwise",
      Object.values(data).every((v) => typeof v === "string"),
      JSON.stringify(data),
    )
    eq("the fields are the agreed set", Object.keys(data).sort(), [
      "conversationId",
      "messageId",
      "messageKind",
      "senderId",
      "senderName",
      "threadId",
      "type",
      "unreadCount",
    ])
  }

  // ────────────────────────────────────────────────────────────────────────
  section("tap navigation")
  eq("a valid message tap opens the conversation", tapTargetFor({ type: "message", conversationId: CONVO }), `/messages/${CONVO}`)
  eq("a missing id falls back to the inbox", tapTargetFor({ type: "message" }), "/messages")
  eq("path traversal falls back", tapTargetFor({ type: "message", conversationId: "../../app/settings" }), "/messages")
  eq("an external URL falls back", tapTargetFor({ type: "message", conversationId: "https://evil.example/x" }), "/messages")
  eq("a javascript: URL falls back", tapTargetFor({ type: "message", conversationId: "javascript:alert(1)" }), "/messages")
  eq("a protocol-relative URL falls back", tapTargetFor({ type: "message", conversationId: "//evil.example" }), "/messages")
  eq("a malformed uuid falls back", tapTargetFor({ type: "message", conversationId: "not-a-uuid" }), "/messages")
  eq("a non-string id falls back", tapTargetFor({ type: "message", conversationId: 42 as any }), "/messages")
  eq("sales still route", tapTargetFor({ type: "sale" }), "/app/sales")
  eq("payouts still route", tapTargetFor({ type: "payout_available" }), "/app/payouts")
  eq("an unknown type navigates nowhere", tapTargetFor({ type: "something-else" }), null)
  eq("no data at all navigates nowhere", tapTargetFor(undefined), null)

  // ────────────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nfailing: ${failures.join(", ")}`)
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
