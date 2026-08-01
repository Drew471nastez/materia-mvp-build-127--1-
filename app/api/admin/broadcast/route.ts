import { createHash, timingSafeEqual } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureSystemConversation, getSystemUserId } from "@/lib/system-account"

/**
 * Sending one message from Storelib to everybody.
 *
 *   POST /api/admin/broadcast { body, onlyTo?: "all" }
 *     header x-storelib-admin-key: <STORELIB_ADMIN_KEY>
 *
 * This is a fan-out write and it is deliberately naive: it walks every profile
 * in pages, makes sure each person has a Storelib thread, and appends the same
 * message to it. There is no queue, no retry, no resumption — a real scheduler
 * would enqueue one job per page and let workers drain it, and that is the
 * shape to reach for the day the user table stops fitting inside one request's
 * time budget. Until then a capped, synchronous loop is honest about what it
 * does and easy to reason about at 2am.
 *
 * Authentication is a shared secret rather than a session, because the caller
 * is an operator with a terminal, not a signed-in user with a browser. When
 * STORELIB_ADMIN_KEY is unset the route answers 404: an endpoint that does not
 * exist is better than one that advertises itself as merely locked, and every
 * environment that never configured broadcasting is in exactly that state.
 */

export const runtime = "nodejs"

/** Long enough for a real announcement, short enough to stay a message. */
const MAX_BODY = 2000
/** One PostgREST page. Bigger pages save round trips; 500 keeps them cheap. */
const PAGE_SIZE = 500
/** Ten thousand recipients is where this stops being a request and starts being a job. */
const MAX_PAGES = 20
/** Concurrency per page — enough to hide latency, not enough to hammer the pool. */
const CHUNK = 25

/**
 * Constant-time comparison over digests rather than over the raw strings, so
 * neither the key's contents nor its length leaks through timing, and so
 * timingSafeEqual never sees the mismatched buffer lengths it throws on.
 */
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

  let payload: { body?: string; onlyTo?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }
  const body = typeof payload.body === "string" ? payload.body.trim().slice(0, MAX_BODY) : ""
  if (!body) return NextResponse.json({ error: "Empty message" }, { status: 400 })
  // The only audience this route knows how to address is everyone. Anything
  // else is rejected rather than quietly widened, so the day a targeted mode
  // exists, an old caller asking for it fails loudly instead of spamming.
  if (payload.onlyTo !== undefined && payload.onlyTo !== "all") {
    return NextResponse.json({ error: "Unsupported audience" }, { status: 400 })
  }

  const admin = createAdminClient()
  const systemId = await getSystemUserId(admin)
  if (!systemId) {
    return NextResponse.json({ error: "Official account not configured" }, { status: 409 })
  }

  let recipients = 0
  let sent = 0
  let failed = 0
  let truncated = false

  // Ordering by id keeps the pages stable across the walk; profiles created
  // mid-broadcast may or may not be caught, which for an announcement is fine.
  for (let pageIndex = 0; ; pageIndex++) {
    if (pageIndex >= MAX_PAGES) {
      truncated = true
      break
    }
    const from = pageIndex * PAGE_SIZE
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error("[broadcast] profile page failed:", error.message)
      break
    }
    if (!profiles?.length) break

    // The official account is not its own audience, and a thread with itself
    // is forbidden by the schema anyway.
    const ids = profiles.map((p: any) => p.id as string).filter((id) => id !== systemId)
    recipients += ids.length

    for (let i = 0; i < ids.length; i += CHUNK) {
      const results = await Promise.all(ids.slice(i, i + CHUNK).map((id) => deliver(admin, id, body, systemId)))
      for (const ok of results) {
        if (ok) sent++
        else failed++
      }
    }

    if (profiles.length < PAGE_SIZE) break
  }

  return NextResponse.json({ recipients, sent, failed, truncated })
}

/**
 * One recipient: make sure the thread exists, then append. A failure here is
 * one person missing one announcement, so it is counted and stepped over
 * rather than aborting the run for everybody behind them.
 */
async function deliver(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  body: string,
  systemId: string,
): Promise<boolean> {
  try {
    const conversationId = await ensureSystemConversation(admin, userId)
    if (!conversationId) return false

    const { error } = await admin
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: systemId, kind: "text", body })
    if (error) {
      console.error("[broadcast] insert failed:", error.message)
      return false
    }

    // The inbox sorts on this, and an announcement that lands under last
    // week's haggling is an announcement nobody reads.
    await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId)
    return true
  } catch (e: any) {
    console.error("[broadcast] delivery failed:", e?.message || e)
    return false
  }
}
