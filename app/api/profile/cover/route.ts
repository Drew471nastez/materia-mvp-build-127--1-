import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { writeProfile } from "@/lib/profile/write"

/**
 * POST /api/profile/cover  (multipart: file)  → { url }
 *
 * The photograph behind your name. Public, unlike a message image — it is drawn
 * on a page anybody can open, so there is nothing to protect and a signed URL
 * would only mean the profile stops rendering when the signature expires.
 *
 * It goes through the server rather than straight from the browser for the two
 * reasons an upload usually should. The bucket's write policy does not have to
 * be widened for a second folder shape, and — the one that matters — this is
 * where the bytes can be checked before they are stored. A cover is served back
 * from our own origin on a public page: a file that is not the picture it
 * claims to be is a file we would be hosting under our name.
 */

const MAX_BYTES = 8 * 1024 * 1024

/**
 * What the bytes ARE, rather than what the upload says they are.
 *
 * `file.type` is a label the client wrote and a hand-built request can say
 * anything at all. The leading bytes are the part nobody can relabel, which is
 * why every platform that hosts user images reads them. Same routine as
 * /api/messages/:id/image, deliberately — two different answers to "is this an
 * image" is how one of them ends up being the wrong one.
 */
function sniff(b: Uint8Array): string | null {
  if (b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  const ascii = (i: number, s: string) => String.fromCharCode(...b.slice(i, i + s.length)) === s
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp"
  if (ascii(4, "ftyp")) {
    const brand = String.fromCharCode(...b.slice(8, 12))
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return "image/heic"
    if (brand === "avif") return "image/avif"
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif"
  return null
}

function extensionFor(type: string): string {
  if (type === "image/png") return "png"
  if (type === "image/webp") return "webp"
  if (type === "image/avif") return "avif"
  if (type === "image/gif") return "gif"
  if (type === "image/heic") return "heic"
  return "jpg"
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get("file")
    if (f instanceof File) file = f
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Imaginea este prea mare (max 8 MB)." }, { status: 413 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const sniffed = sniff(bytes)
  if (!sniffed) return NextResponse.json({ error: "Fișierul nu este o imagine." }, { status: 415 })

  const admin = createAdminClient()
  // Timestamped rather than overwritten. A fixed name would be cached by every
  // CDN and browser that has ever seen the old cover, which is why avatar
  // uploads elsewhere in this codebase append `?t=` — a cache-buster on a URL
  // that has genuinely changed is a workaround for reusing the name. A new name
  // is simply a new object, and nothing anywhere has a stale copy of it.
  const path = `covers/${user.id}/${Date.now()}.${extensionFor(sniffed)}`
  const { error } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: sniffed, cacheControl: "31536000", upsert: false })
  if (error) {
    console.error("[profile/cover] upload failed:", error.message)
    return NextResponse.json({ error: "Încărcarea a eșuat." }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("avatars").getPublicUrl(path)

  // Written here rather than left to a second request from the client: an
  // uploaded object with nothing pointing at it is a file nobody can see and
  // nobody will ever clean up, and the gap between two calls is exactly where a
  // closed tab leaves one behind.
  //
  // Through lib/profile/write.ts, which CHECKS. This used to be a bare
  // `update().eq("id", …)`, and against an account with no `profiles` row that
  // matches nothing and reports success — so this route returned the public URL
  // it had just stored, the picture appeared from the response, and it was gone
  // on the next load because nothing had been written. The row is created if it
  // is missing.
  const written = await writeProfile({
    admin,
    userId: user.id,
    patch: { cover_url: publicUrl },
    fallbackUsername: user.email?.split("@")[0] ?? null,
    email: user.email ?? null,
  })
  if (!written.ok) {
    if (written.reason === "no-columns") {
      return NextResponse.json(
        { error: "Profilul extins nu este activat încă pe acest cont.", missingColumns: true },
        { status: 409 },
      )
    }
    // THE REASON, not a shrug.
    //
    // "Could not save" is what this said for every failure, and it is exactly
    // as useful to the person reading it as it was to the person who wrote it:
    // the profile row could be missing, a column could be absent, a constraint
    // could be refusing the write, and all three produced the same four words.
    // The message is the database's own, about the caller's own row, on a
    // screen only they can see — there is nothing in it to withhold, and
    // without it the next report is another screenshot of the same four words.
    return NextResponse.json({ error: "Nu am putut salva profilul.", detail: written.message }, { status: 500 })
  }

  void admin.storage
    .from("avatars")
    .list(`covers/${user.id}`, { limit: 50 })
    .then(({ data }) => {
      const stale = (data ?? [])
        .map((o) => `covers/${user.id}/${o.name}`)
        .filter((p) => p !== path)
      if (stale.length > 0) void admin.storage.from("avatars").remove(stale)
    })

  return NextResponse.json({ url: publicUrl })
}
