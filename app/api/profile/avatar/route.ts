import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { writeProfile } from "@/lib/profile/write"
import { sniffImage, extensionForImage } from "@/lib/profile/image-bytes"

/**
 * POST /api/profile/avatar  (multipart: file)  → { url }
 *
 * Your picture. The same shape as the cover route beside it — public bucket,
 * bytes checked before they are stored, object timestamped rather than
 * overwritten, previous one removed once the new one is pointed at — and the
 * reasoning for each of those is written out there.
 *
 * Two of them are worth repeating because an avatar is the one image on this
 * platform that appears everywhere. It is served from our own origin, so a file
 * that is not the picture it claims to be would be hosted under our name on
 * every screen this person appears on. And a fixed object name would be cached
 * by every CDN and browser that has ever rendered a conversation they are in,
 * so changing your picture would leave the old one showing in the inbox, in the
 * thread header and on every listing card until those caches expired. A new
 * name is simply a new object.
 */

const MAX_BYTES = 6 * 1024 * 1024

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
    return NextResponse.json({ error: "Imaginea este prea mare (max 6 MB)." }, { status: 413 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const sniffed = sniffImage(bytes)
  if (!sniffed) return NextResponse.json({ error: "Fișierul nu este o imagine." }, { status: 415 })

  const admin = createAdminClient()
  const path = `avatars/${user.id}/${Date.now()}.${extensionForImage(sniffed)}`
  const { error } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: sniffed, cacheControl: "31536000", upsert: false })
  if (error) {
    console.error("[profile/avatar] upload failed:", error.message)
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
    patch: { avatar_url: publicUrl },
    fallbackUsername: user.email?.split("@")[0] ?? null,
  })
  if (!written.ok) {
    if (written.reason === "no-columns") {
      return NextResponse.json(
        { error: "Profilul extins nu este activat încă pe acest cont.", missingColumns: true },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: "Could not save" }, { status: 500 })
  }

  void admin.storage
    .from("avatars")
    .list(`avatars/${user.id}`, { limit: 50 })
    .then(({ data }) => {
      const stale = (data ?? []).map((o) => `avatars/${user.id}/${o.name}`).filter((p) => p !== path)
      if (stale.length > 0) void admin.storage.from("avatars").remove(stale)
    })

  return NextResponse.json({ url: publicUrl })
}
