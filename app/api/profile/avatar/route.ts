import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
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

  // Service role, scoped to the session's own id — see the note in
  // app/api/profile/route.ts. `avatar_url` has been on this table since the
  // beginning, so there is no missing-column case to answer here.
  const { error: saveError } = await admin.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id)
  if (saveError) {
    console.error("[profile/avatar] save failed:", saveError.message)
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
