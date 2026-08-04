import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { announceThread } from "@/lib/messages/announce"

/**
 * POST /api/messages/:id/typing → tell the other party the dots should be up.
 *
 * The fallback path, not the normal one. A typing ping is normally a direct
 * broadcast from the browser that is doing the typing — one hop, no server,
 * nothing to pay for — and the client only comes here when its own channel has
 * not reached SUBSCRIBED. That window is real and it is the worst possible one:
 * the seconds right after you open a conversation and start writing, before the
 * socket has finished connecting, are exactly when the other person is most
 * likely looking at the screen waiting to see whether you are replying.
 *
 * Membership is checked, and it has to be. The broadcast below goes out with
 * the service key, so without this read anyone holding a session could put the
 * typing dots into any conversation whose id they could guess. Reading the row
 * through the CALLER's client makes RLS the check: a thread that is not theirs
 * reads as absent and nothing is sent.
 *
 * Throttled by the caller to one every two seconds (see `noteTyping` in
 * components/messages/thread.tsx), which is what keeps a keystroke from being a
 * request. Nothing is written; this is one indexed select and a fire-and-forget.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { data: convo } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .maybeSingle()
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // An opaque per-request value, not the caller's account id.
  //
  // A broadcast channel carries no RLS — anyone who can guess a conversation id
  // can listen to it — so putting a real uuid in the payload would hand a
  // listener a participant's account id along with a live feed of when they
  // were typing. The receiver only ever compares this against its OWN tag to
  // ignore its echo, so any value it cannot have produced itself works, and one
  // that identifies nobody is strictly better.
  await announceThread(id, "typing", { from: crypto.randomUUID() })
  return NextResponse.json({ ok: true })
}
