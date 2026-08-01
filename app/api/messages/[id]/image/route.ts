import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createNotification } from "@/lib/notifications"

/**
 * POST /api/messages/:id/image  (multipart: file)  → { message }
 *
 * A photo sent in a conversation, stored in a PRIVATE bucket.
 *
 * Private is the whole design. A picture of your living room, your receipt, or
 * the label inside your coat is between two people; putting it in a public
 * bucket makes it readable forever by anyone who ever sees the URL, and object
 * names are guessable enough that "nobody will find it" is not a security
 * model. So the object is written under the sender's own id and what is stored
 * on the message is the object PATH, not a URL — GET mints a short-lived signed
 * link for whichever of the two parties is asking.
 *
 * The upload goes through the server rather than straight from the browser
 * because the bucket's insert policy is scoped to the uploader's own folder, and
 * because this is the one place that can check the caller is actually in this
 * conversation before accepting bytes at all.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])

function extensionFor(type: string): string {
  if (type === "image/png") return "png"
  if (type === "image/webp") return "webp"
  if (type === "image/heic" || type === "image/heif") return "heic"
  return "jpg"
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  // Membership first, bytes second. RLS is the check: a thread that is not
  // theirs reads as absent, and nothing is uploaded on behalf of a stranger.
  const { data: convo } = await supabase
    .from("conversations")
    .select("id, listing_id, buyer_id, seller_id")
    .eq("id", id)
    .maybeSingle()
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let file: File | null = null
  let caption = ""
  try {
    const form = await req.formData()
    const f = form.get("file")
    file = f instanceof File ? f : null
    const c = form.get("caption")
    if (typeof c === "string") caption = c.trim().slice(0, 2000)
  } catch {
    return NextResponse.json({ error: "Bad upload" }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Imaginea este prea mare" }, { status: 413 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Format neacceptat" }, { status: 415 })

  const admin = createAdminClient()
  const path = `${user.id}/${id}/${crypto.randomUUID()}.${extensionFor(file.type)}`
  const { error: upErr } = await admin.storage
    .from("messages")
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false })
  if (upErr) return NextResponse.json({ error: "Încărcarea a eșuat" }, { status: 500 })

  // The PATH, not a URL. See the note at the top: what is readable is decided
  // at read time, for the reader who is asking, not baked into a row forever.
  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      sender_id: user.id,
      kind: "image",
      image_url: path,
      body: caption || null,
    })
    .select("id, sender_id, kind, body, image_url, offer_cents, offer_status, created_at, read_at")
    .single()
  if (error || !inserted) {
    // The row is what makes the object reachable; without it the upload is
    // litter in a private bucket nobody will ever ask for again.
    await admin.storage.from("messages").remove([path])
    return NextResponse.json({ error: "Could not send" }, { status: 500 })
  }

  await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", id)

  await createNotification(admin, {
    userId: convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id,
    kind: "message",
    actorId: user.id,
    listingId: convo.listing_id,
    conversationId: id,
  })

  // Signed for the sender straight away, so the bubble it replaces can show the
  // real photo rather than waiting for the next poll to hand it a link.
  const { data: signed } = await admin.storage.from("messages").createSignedUrl(path, 60 * 60)

  return NextResponse.json({ message: { ...inserted, image_url: signed?.signedUrl ?? null } })
}
