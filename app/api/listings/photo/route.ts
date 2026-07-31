import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/listings/photo — upload one listing photo, get back a public URL.
 *
 * Takes the file directly rather than handing the client a signed URL: the
 * existing signed-url route requires a creator row to already exist, which a
 * first-time seller doesn't have, and a listing photo is small enough that one
 * hop is simpler than three.
 */

const MAX_BYTES = 12 * 1024 * 1024
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 400 })
    if (file.type && !ALLOWED.has(file.type)) return NextResponse.json({ error: "bad_type" }, { status: 400 })

    const admin = createAdminClient()
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)
    const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error } = await admin.storage
      .from("listings")
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false })
    if (error) throw error

    const { data } = admin.storage.from("listings").getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl })
  } catch (e: any) {
    console.error("[listings/photo] upload failed:", e?.message || e)
    return NextResponse.json({ error: "failed", message: e?.message || String(e) }, { status: 500 })
  }
}
