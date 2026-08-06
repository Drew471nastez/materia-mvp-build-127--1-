import { createHash, timingSafeEqual } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendPushToUser } from "@/lib/push/sender"

/**
 * Sending a test push, including to everybody.
 *
 *   POST /api/admin/push-test
 *   header x-storelib-admin-key: <STORELIB_ADMIN_KEY>
 *
 *   { "mode": "count" }                                  ← default. Sends NOTHING.
 *   { "mode": "user", "userId": "<uuid>" }               ← one account
 *   { "mode": "all", "confirm": "SEND TO ALL" }          ← everybody with a device
 *
 * ---------------------------------------------------------------------------
 * Why this is a route with a confirmation and not a script
 * ---------------------------------------------------------------------------
 * "Send a test to every account" is the only operation in this project that
 * cannot be undone, cannot be partially undone, and is visible to every user at
 * once. A one-off script has no record of having run, no dry run, and no way to
 * find out how many phones it is about to buzz before it buzzes them — so the
 * three modes above are ordered by how much they can do, `count` is what you get
 * if you say nothing, and `all` additionally requires a literal phrase that
 * cannot be produced by a typo or by a client retrying a saved request body.
 *
 * The audience is `push_tokens`, not `profiles`. Only an account with a
 * registered device can receive anything at all, so that is the honest number
 * and it is far smaller than the user table — a broadcast to profiles would be
 * mostly a walk over people it cannot reach.
 *
 * Authentication is the shared secret already used by /api/admin/broadcast, and
 * the route 404s when STORELIB_ADMIN_KEY is unset: an endpoint that does not
 * exist is better than one advertising itself as merely locked.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** The literal that has to be typed. Not a boolean — a boolean is a default. */
const CONFIRM_PHRASE = "SEND TO ALL"
/** A ceiling, so a mistake is bounded even after the confirmation. */
const MAX_RECIPIENTS = 5000
/** One PostgREST page of tokens. */
const PAGE_SIZE = 1000
/** Concurrency across accounts. */
const CHUNK = 20

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DEFAULT_TITLE = "Storelib"
const DEFAULT_BODY = "Notificare de test — notificările funcționează corect."
const MAX_TITLE = 60
const MAX_BODY = 160

/** Digests, so neither the key's contents nor its length leaks through timing. */
function keyMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const expected = process.env.STORELIB_ADMIN_KEY
  if (!expected) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const provided = req.headers.get("x-storelib-admin-key") ?? ""
  if (!provided || !keyMatches(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: { mode?: string; userId?: string; confirm?: string; title?: string; body?: string }
  try {
    payload = (await req.json()) ?? {}
  } catch {
    // An empty body is a legitimate way to ask the safest question, so it is
    // not an error — it is `count`.
    payload = {}
  }

  const mode = payload.mode ?? "count"
  const title = (payload.title ?? DEFAULT_TITLE).trim().slice(0, MAX_TITLE) || DEFAULT_TITLE
  const body = (payload.body ?? DEFAULT_BODY).trim().slice(0, MAX_BODY) || DEFAULT_BODY

  const admin = createAdminClient()

  // ── The audience, whatever the mode. Counting is the same query as sending,
  //    so `count` cannot report a different number than `all` would reach.
  const seen = new Set<string>()
  const userIds: string[] = []
  let devices = 0
  let truncated = false
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await admin
      .from("push_tokens")
      .select("user_id")
      .order("user_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error("[push-test] token page failed:", error.message)
      return NextResponse.json({ error: "Could not read devices" }, { status: 500 })
    }
    if (!data?.length) break
    devices += data.length
    for (const row of data) {
      const id = (row as any).user_id as string
      if (id && !seen.has(id)) {
        seen.add(id)
        userIds.push(id)
      }
    }
    if (data.length < PAGE_SIZE) break
    if (userIds.length >= MAX_RECIPIENTS) {
      truncated = true
      break
    }
  }

  if (mode === "count") {
    return NextResponse.json({
      mode: "count",
      accounts: userIds.length,
      devices,
      truncated,
      sent: 0,
      note: `Nothing was sent. To send to everybody: {"mode":"all","confirm":"${CONFIRM_PHRASE}"}`,
    })
  }

  if (mode === "user") {
    const target = typeof payload.userId === "string" ? payload.userId : ""
    if (!UUID_RE.test(target)) {
      return NextResponse.json({ error: "invalid userId" }, { status: 400 })
    }
    const result = await deliver(target, title, body)
    return NextResponse.json({ mode: "user", accounts: 1, ...result })
  }

  if (mode !== "all") {
    return NextResponse.json({ error: "mode must be count, user or all" }, { status: 400 })
  }

  if (payload.confirm !== CONFIRM_PHRASE) {
    // 428 rather than 400: the request is well formed, it is the precondition
    // that is missing, and the difference matters when you are reading a log
    // trying to work out whether anybody was buzzed.
    return NextResponse.json(
      {
        error: "confirmation required",
        accounts: userIds.length,
        devices,
        sent: 0,
        note: `Re-send with {"mode":"all","confirm":"${CONFIRM_PHRASE}"} to notify ${userIds.length} account(s).`,
      },
      { status: 428 },
    )
  }

  const targets = userIds.slice(0, MAX_RECIPIENTS)
  let sent = 0
  let invalid = 0
  let failed = 0
  for (let i = 0; i < targets.length; i += CHUNK) {
    const results = await Promise.all(targets.slice(i, i + CHUNK).map((id) => deliver(id, title, body)))
    for (const r of results) {
      sent += r.sent
      invalid += r.invalid
      failed += r.failed
    }
  }

  console.log(
    `[push-test] mode=all accounts=${targets.length} devices=${devices} ok=${sent} invalid=${invalid} retryable=${failed}`,
  )

  return NextResponse.json({
    mode: "all",
    accounts: targets.length,
    devices,
    sent,
    invalid,
    failed,
    truncated: truncated || userIds.length > MAX_RECIPIENTS,
  })
}

/**
 * One account.
 *
 * No `badge`, deliberately. The badge is the unread MESSAGE count, and a test
 * that leaves every phone in the country showing a "1" it cannot clear by
 * reading anything is not a test, it is a support ticket. `sendPushToUser`
 * omits the field entirely when it is not passed, which leaves the existing
 * badge exactly where it was.
 *
 * The collapse id is constant, so running the test twice replaces the first
 * banner instead of stacking two.
 */
async function deliver(userId: string, title: string, body: string) {
  try {
    return await sendPushToUser(userId, {
      title,
      body,
      data: { type: "test" },
      threadId: "storelib_test",
      collapseId: "storelib_test",
    })
  } catch (e: any) {
    console.error("[push-test] send failed:", e?.message ?? e)
    return { sent: 0, invalid: 0, failed: 1, attempted: 1 }
  }
}
