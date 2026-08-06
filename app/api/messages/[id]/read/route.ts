import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { readSessionAuth } from "@/lib/auth/current-user"

/**
 * POST /api/messages/<id>/read — mark everything the OTHER person sent in this
 * conversation as read.
 *
 * ---------------------------------------------------------------------------
 * The unread badge that would not clear
 * ---------------------------------------------------------------------------
 * Until this existed, `read_at` was written in exactly one place: `readThread`,
 * which runs when a conversation is FETCHED — the server render of
 * /messages/<id>, and the client's own refetch. That covers the messages which
 * were already there when you opened the thread, and nothing else.
 *
 * So a message that arrived over the realtime socket INTO AN ALREADY-OPEN
 * THREAD was displayed, read by a human being, and never marked. Go back to the
 * inbox and the row still says unread, correctly according to the database and
 * incorrectly according to everything the person just did. lib/push/
 * message-notification.ts even documents the gap — it is the reason chat push
 * cannot tell whether somebody is looking at a conversation.
 *
 * The second, rarer half is the router cache: opening a conversation whose RSC
 * payload Next.js still holds serves the cached page, so the server component —
 * and with it `readThread` — never runs at all.
 *
 * Both are fixed by the same thing: a cheap, idempotent endpoint the CLIENT can
 * call at the moments a human has actually seen something, rather than only at
 * the moment a page was built.
 *
 * ---------------------------------------------------------------------------
 * Deliberately trivial
 * ---------------------------------------------------------------------------
 * One statement, on the CALLER's client, so row-level security is what decides
 * whether they are in this conversation — the id in the URL is a filter, not a
 * credential, and a stranger's id matches zero rows rather than leaking one.
 * `sender_id <> me` so nobody marks their own messages read, and
 * `read_at is null` so a repeat call updates nothing and costs an index probe.
 *
 * Being idempotent is what lets the client call it liberally — on every arrival,
 * on every return to the tab — without any coordination.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 })

  const supabase = await createClient()
  const auth = await readSessionAuth(supabase)
  // "Could not read the session" is not "signed out" — see
  // lib/auth/current-user.ts. Answering 401 here would make the client treat a
  // transient fault as a logout.
  if (auth.status === "indeterminate") {
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 })
  }
  if (auth.status === "anonymous") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .neq("sender_id", auth.userId)
    .is("read_at", null)
    // A returning update, so the answer distinguishes "we ran an update" from
    // "we changed something" — the client only needs to tell the inbox when
    // something actually changed.
    .select("id")

  if (error) {
    console.error("[messages/read] failed:", error.message)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }

  return NextResponse.json({ marked: data?.length ?? 0 })
}
