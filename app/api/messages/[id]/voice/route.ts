import { after, type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { runMessagePush } from "@/lib/push/message-db"
import { createNotification } from "@/lib/notifications"
import { announceInbox, announceThread } from "@/lib/messages/announce"
import { encodeVoiceBody, MAX_PEAKS } from "@/lib/messages/voice-message"

/**
 * POST /api/messages/:id/voice  (multipart: file, ms, peaks)  → { message }
 *
 * A voice note, stored in the same PRIVATE bucket as photographs.
 *
 * Private for a stronger version of the reason photographs are: this is a
 * recording of somebody's actual voice, in a conversation between two people.
 * A public object name is readable forever by anyone who ever sees the URL, and
 * "nobody will guess it" has never been a security model. So what is stored on
 * the message is the object PATH, and a short-lived signed link is minted per
 * read for whichever of the two parties is asking.
 *
 * The upload goes through the server rather than straight from the browser
 * because the bucket's insert policy is scoped to the uploader's own folder, and
 * because this is the one place that can check the caller is actually in this
 * conversation before accepting bytes at all.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DURATION AND THE WAVEFORM ARRIVE WITH THE FILE
 * ---------------------------------------------------------------------------
 * Neither can be recovered cheaply afterwards. `HTMLAudioElement.duration` on a
 * MediaRecorder blob is `Infinity` in Chrome and Safari until the whole file has
 * been fetched and seeked, so a bubble that asks the audio element shows nothing
 * until you press play. And a waveform means downloading and decoding the audio
 * — on a thread that might hold thirty of them.
 *
 * The recorder knows both already: it runs an analyser to draw the live meter,
 * and it started a clock when it started recording. It just has to say so.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Two minutes of Opus at the bitrate the recorder asks for is well under a
 * megabyte; 8MB is room for a browser that ignores the hint and records
 * uncompressed, without being room for somebody uploading a film.
 */
const MAX_BYTES = 8 * 1024 * 1024
/** Longer than this is a phone call, and a thread is not one. */
const MAX_MS = 5 * 60_000
/** Shorter than this is a mis-tap, and sending it helps nobody. */
const MIN_MS = 700

const ALLOWED = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/wav",
]

/**
 * What the bytes actually are, rather than what the upload claims.
 *
 * `file.type` is a label the client wrote, not a fact, and these objects are
 * served back to the other party from our own domain — so a file that is not
 * the recording it claims to be is a file we would be handing to somebody else
 * under our name. Same argument, same treatment, as the photo route's sniff.
 *
 * The container is what is identifiable here; the codec inside is not, and does
 * not need to be. Every format below is one a browser will play.
 */
function sniff(b: Uint8Array): string | null {
  if (b.length < 12) return null
  const ascii = (i: number, s: string) => String.fromCharCode(...b.slice(i, i + s.length)) === s

  // EBML — WebM and Matroska. What Chrome and Firefox record into.
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm"
  // Ogg, usually carrying Opus or Vorbis.
  if (ascii(0, "OggS")) return "audio/ogg"
  // ISO base media — m4a/mp4, which is what Safari records into.
  if (ascii(4, "ftyp")) return "audio/mp4"
  // RIFF/WAVE.
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return "audio/wav"
  // MPEG audio: an ID3 tag, or a bare frame sync.
  if (ascii(0, "ID3")) return "audio/mpeg"
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return "audio/mpeg"
  return null
}

function extensionFor(type: string): string {
  if (type === "audio/ogg") return "ogg"
  if (type === "audio/mp4") return "m4a"
  if (type === "audio/wav") return "wav"
  if (type === "audio/mpeg") return "mp3"
  return "webm"
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
  let ms = 0
  let peaks: number[] = []
  try {
    const form = await req.formData()
    const f = form.get("file")
    file = f instanceof File ? f : null
    ms = Number.parseInt(String(form.get("ms") ?? ""), 10)
    const raw = String(form.get("peaks") ?? "")
    // Digits, one per bar — see lib/messages/voice-message.ts. Anything else is
    // dropped rather than argued with: a missing waveform costs a decoration.
    peaks = /^[0-9]*$/.test(raw)
      ? raw.slice(0, MAX_PEAKS).split("").map((c) => Number.parseInt(c, 10))
      : []
  } catch {
    return NextResponse.json({ error: "Bad upload" }, { status: 400 })
  }

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Înregistrarea este prea mare" }, { status: 413 })
  if (!Number.isFinite(ms) || ms < MIN_MS) {
    return NextResponse.json({ error: "Înregistrarea este prea scurtă" }, { status: 400 })
  }
  if (ms > MAX_MS) return NextResponse.json({ error: "Înregistrarea este prea lungă" }, { status: 413 })

  // The header said audio; the bytes have to agree.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const sniffed = sniff(head)
  if (!sniffed) {
    return NextResponse.json({ error: "Fișierul nu este o înregistrare validă" }, { status: 415 })
  }

  // The same per-minute ceiling photographs get, and for the same reason: a
  // recording is orders of magnitude more expensive than a line of text, in
  // bandwidth, in storage, and in a signed URL minted for it on every read.
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
      .upload(path, file as File, { contentType: sniffed, cacheControl: "31536000", upsert: false })

  let { error: upErr } = await put()

  // The bucket makes itself — same reasoning as the photo route. A bucket is
  // not schema: there is no data in it to migrate and nothing to get wrong, so
  // a missing one is a dead end rather than a decision. The SQL remains the
  // source of truth for the storage POLICIES.
  if (upErr && /bucket.*not.*found/i.test(upErr.message || "")) {
    await admin.storage.createBucket("messages", { public: false, fileSizeLimit: MAX_BYTES })
    ;({ error: upErr } = await put())
  }

  if (upErr) {
    console.error("[messages/voice] upload failed:", upErr)
    return NextResponse.json(
      { error: `Încărcarea a eșuat: ${upErr.message || "eroare necunoscută"}` },
      { status: 500 },
    )
  }

  /**
   * ALWAYS THE ENCODED FORM, unlike the photo route.
   *
   * That one tries a real `image_url` column first and falls back. There is no
   * equivalent column for audio and no `kind` the constraint would accept, so
   * there is nothing to try: the encoded body IS the storage format here, and
   * lib/messages/voice-message.ts explains why that is a design rather than a
   * stopgap. It keeps working unchanged if a column ever arrives.
   */
  const COLUMNS = "id, sender_id, kind, body, offer_cents, offer_status, created_at, read_at"
  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      sender_id: user.id,
      kind: "text",
      body: encodeVoiceBody(path, ms, peaks),
    })
    .select(COLUMNS)
    .single()

  if (error || !inserted) {
    // The row is what makes the object reachable; without it the upload is
    // litter in a private bucket nobody will ever ask for again.
    await admin.storage.from("messages").remove([path])
    console.error("[messages/voice] insert failed:", error)
    const raised = error?.message ?? ""
    if (raised.startsWith("rate_limited")) {
      return NextResponse.json({ error: "Prea multe mesaje. Așteaptă câteva secunde." }, { status: 429 })
    }
    if (raised.startsWith("blocked")) {
      return NextResponse.json({ error: "Nu poți trimite mesaje în această conversație." }, { status: 403 })
    }
    return NextResponse.json(
      { error: `Nu am putut trimite înregistrarea: ${raised || "eroare necunoscută"}` },
      { status: 500 },
    )
  }

  const recipient = convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id
  await Promise.all([
    announceThread(id),
    announceInbox(recipient),
    supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", id),
    createNotification(admin, {
      userId: recipient,
      kind: "message",
      actorId: user.id,
      listingId: convo.listing_id,
      conversationId: id,
    }),
  ])

  // After the response, for the reason the text route states: never inside the
  // Promise.all, so a profile read and an FCM round trip cannot sit between
  // pressing send and the bubble appearing; never a bare fire-and-forget
  // either, or it races the function being frozen.
  after(() => {
    void runMessagePush({
      conversationId: id,
      messageId: inserted.id as string,
      senderId: user.id,
      recipientId: recipient,
      kind: "voice",
    }).catch((e) => console.error("[push:message] failed:", e?.message ?? e))
  })

  return NextResponse.json({ message: inserted })
}
