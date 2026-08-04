import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * DELETE /api/messages/:id/message?messageId=…  → { ok: true }
 *
 * Unsending one message. Yours only, and there is no version of this that
 * reaches into somebody else's words.
 *
 * Soft, not hard. A row that simply disappears from a conversation leaves the
 * other person looking at a gap where something used to be and no way to tell
 * whether they misremembered it — so it becomes "Mesaj șters", which is both
 * honest and what every chat app does. It also keeps the day dividers and
 * grouping intact, which a deleted row would otherwise reshuffle.
 *
 * Ownership is proved through the CALLER's client, so RLS answers "is this
 * message in a conversation you are part of" before anything is written. The
 * sender check is ours on top of that. The write itself goes through the
 * service role for one specific reason: `messages_update` deliberately requires
 * `sender_id <> auth.uid()` — it exists so the OTHER party can mark things read
 * and answer offers — so a sender editing their own row is exactly the case that
 * policy forbids. Rather than widen it and give every client a way to rewrite
 * its own history, the one narrow field this endpoint may change is set here,
 * after the check.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const messageId = req.nextUrl.searchParams.get("messageId") || ""
  if (!UUID_RE.test(id) || !UUID_RE.test(messageId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  // RLS is the membership check: a message in a thread that is not theirs reads
  // as absent, and every branch below is unreachable for it.
  const { data: msg } = await supabase
    .from("messages")
    .select("id, sender_id, conversation_id, kind, image_url")
    .eq("id", messageId)
    .eq("conversation_id", id)
    .maybeSingle()
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (msg.sender_id !== user.id) {
    return NextResponse.json({ error: "Poți șterge doar mesajele tale" }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("messages")
    .update({ deleted_at: new Date().toISOString(), body: null, image_url: null })
    .eq("id", messageId)
  if (error) {
    console.error("[messages/message] delete failed:", error)
    return NextResponse.json({ error: "Nu am putut șterge mesajul" }, { status: 500 })
  }

  // The photo goes with it. Leaving the object behind would mean a "deleted"
  // picture that is still sitting in storage under a link the recipient may
  // already have open.
  if (msg.kind === "image" && msg.image_url && !msg.image_url.startsWith("http")) {
    await admin.storage.from("messages").remove([msg.image_url])
  }

  return NextResponse.json({ ok: true })
}
