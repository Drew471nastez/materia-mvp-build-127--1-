import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createNotification } from "@/lib/notifications"
import { announceThread } from "@/lib/messages/announce"
import { encodeImageBody } from "@/lib/messages/image-fallback"

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

/** Anything the browser hands us that is not in ALLOWED but IS an image — a
 *  phone can produce avif, and refusing it outright is worse than storing it. */
const IMAGE_RE = /^image\//

/**
 * What the bytes actually are, rather than what the upload claims.
 *
 * `file.type` is whatever the client put in the multipart header — it is a
 * label, not a fact, and a request built by hand can say "image/jpeg" over
 * anything at all. Every serious platform sniffs the leading bytes instead,
 * because that is the only part an attacker cannot simply relabel. It matters
 * here specifically: these objects are served back to the other party from our
 * own domain, so a file that is not the picture it claims to be is a file we
 * would be handing to somebody else under our name.
 */
function sniff(bytes: Uint8Array): string | null {
  const b = bytes
  if (b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  const ascii = (i: number, s: string) => String.fromCharCode(...b.slice(i, i + s.length)) === s
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp"
  if (ascii(4, "ftyp")) {
    const brand = String.fromCharCode(...b.slice(8, 12))
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return "image/heic"
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif"
  return null
}

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
  if (!IMAGE_RE.test(file.type)) return NextResponse.json({ error: "Format neacceptat" }, { status: 415 })

  // The header said image; the bytes have to agree.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const sniffed = sniff(head)
  if (!sniffed) {
    return NextResponse.json({ error: "Fișierul nu este o imagine validă" }, { status: 415 })
  }

  // How many photos one person may put into one thread in a minute. A picture
  // is three orders of magnitude more expensive than a line of text — bandwidth,
  // storage, and a signed URL minted for it on every read — so it gets its own,
  // much tighter ceiling than the twenty-messages one next door.
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count: recent } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", id)
    .eq("sender_id", user.id)
    .gte("created_at", since)
  if ((recent ?? 0) >= 30) {
    return NextResponse.json({ error: "Prea multe trimiteri. Așteaptă un minut." }, { status: 429 })
  }

  const admin = createAdminClient()
  const path = `${user.id}/${id}/${crypto.randomUUID()}.${extensionFor(sniffed)}`

  const put = () =>
    admin.storage
      .from("messages")
      // The sniffed type, so what we serve back is described by what it is.
      .upload(path, file, { contentType: sniffed, cacheControl: "31536000", upsert: false })

  let { error: upErr } = await put()

  // The bucket makes itself.
  //
  // "Încărcare eșuată" with nothing else to go on is almost always this: the
  // migration that declares the `messages` bucket has not been run, so the very
  // first photo anyone tries to send fails with a message that says nothing
  // about why. A bucket is not schema — there is no data in it to migrate and
  // nothing to get wrong — so the service role simply creates it and tries
  // again. The SQL remains the source of truth for the storage POLICIES; this
  // only removes a dead end.
  if (upErr && /bucket.*not.*found/i.test(upErr.message || "")) {
    await admin.storage.createBucket("messages", {
      public: false,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: [...ALLOWED],
    })
    ;({ error: upErr } = await put())
  }

  if (upErr) {
    // The real reason, not a shrug. A failed upload that says only "it failed"
    // is unfixable by anyone, including whoever wrote this.
    console.error("[messages/image] upload failed:", upErr)
    return NextResponse.json(
      { error: `Încărcarea a eșuat: ${upErr.message || "eroare necunoscută"}` },
      { status: 500 },
    )
  }

  // The PATH, not a URL. See the note at the top: what is readable is decided
  // at read time, for the reader who is asking, not baked into a row forever.
  const COLUMNS = "id, sender_id, kind, body, image_url, offer_cents, offer_status, created_at, read_at"
  const COLUMNS_LEGACY = "id, sender_id, kind, body, offer_cents, offer_status, created_at, read_at"

  let { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      sender_id: user.id,
      kind: "image",
      image_url: path,
      body: caption || null,
    })
    .select(COLUMNS)
    .single()

  // The database has not had its migration run — no `image_url`, or a shape
  // constraint that still refuses an image row. That is not the sender's fault
  // and it should not be the sender's problem, so the photo goes in as a text
  // message with its path encoded in the body, which the reader decodes back.
  // See lib/messages/image-fallback.ts for why this is safe to leave in place
  // permanently rather than being a thing to clean up later.
  let encoded = false
  if (error && /image_url|messages_shape|messages_kind_check|column .* does not exist|violates check constraint/i.test(error.message || "")) {
    encoded = true
    ;({ data: inserted, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: id,
        sender_id: user.id,
        kind: "text",
        body: encodeImageBody(path, caption || null),
      })
      .select(COLUMNS_LEGACY)
      .single())
  }

  if (error || !inserted) {
    // The row is what makes the object reachable; without it the upload is
    // litter in a private bucket nobody will ever ask for again.
    await admin.storage.from("messages").remove([path])
    console.error("[messages/image] insert failed:", error)
    // The database's own abuse limits speak in these two prefixes. Passing the
    // raw message through would show the user a Postgres exception; passing
    // nothing through would show them a failure with no cause.
    const raised = error?.message ?? ""
    if (raised.startsWith("rate_limited")) {
      return NextResponse.json(
        { error: "Prea multe fotografii trimise. Așteaptă câteva secunde." },
        { status: 429 },
      )
    }
    if (raised.startsWith("blocked")) {
      return NextResponse.json(
        { error: "Nu poți trimite mesaje în această conversație." },
        { status: 403 },
      )
    }
    return NextResponse.json(
      { error: `Nu am putut trimite fotografia: ${raised || "eroare necunoscută"}` },
      { status: 500 },
    )
  }

  // Rung from the server, so the other side hears about the photo even if the
  // sender's socket never came up. See lib/messages/announce.ts.
  await Promise.all([
    announceThread(id),
    supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", id),
    createNotification(admin, {
      userId: convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id,
      kind: "message",
      actorId: user.id,
      listingId: convo.listing_id,
      conversationId: id,
    }),
  ])

  // Signed for the sender straight away, so the bubble it replaces can show the
  // real photo rather than waiting for the next poll to hand it a link.
  const { data: signed } = await admin.storage.from("messages").createSignedUrl(path, 60 * 60)

  // Handed back in the shape the client renders, whichever way it was stored —
  // the encoded body is an implementation detail of the row, not of the message.
  return NextResponse.json({
    message: {
      ...(inserted as Record<string, unknown>),
      kind: "image",
      body: encoded ? caption || null : (inserted as { body: string | null }).body,
      image_url: signed?.signedUrl ?? null,
    },
  })
}
