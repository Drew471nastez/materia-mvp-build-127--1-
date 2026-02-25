import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BLOCKED_EXTENSIONS } from "@/lib/storage/security"

/**
 * POST /api/storage/signed-upload-url
 *
 * Generates a short-lived signed upload URL for direct-to-storage uploads.
 * Client uploads directly to Supabase Storage using the signed URL,
 * bypassing the API route for large files (better performance).
 *
 * Body: { fileName, contentType, bucket?, path? }
 * Returns: { signedUrl, path, token }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { fileName, contentType, bucket = "digital-products", path: customPath } = body

    if (!fileName || !contentType) {
      return NextResponse.json({ error: "fileName and contentType required" }, { status: 400 })
    }

    // Security: check extension
    const ext = fileName.split(".").pop()?.toLowerCase() || ""
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `File type .${ext} is blocked` }, { status: 400 })
    }

    // Get creator
    const admin = createAdminClient()
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Build storage path
    const timestamp = Date.now()
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
    const storagePath = customPath || `${creator.id}/${timestamp}_${safeName}`

    // Create signed upload URL (expires in 5 minutes)
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(storagePath)

    if (error) {
      console.error("[signed-upload-url] Error:", error)
      return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 })
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      path: storagePath,
      token: data.token,
      bucket,
    })
  } catch (error) {
    console.error("[signed-upload-url] Error:", error)
    return NextResponse.json({ error: "Failed to create signed URL" }, { status: 500 })
  }
}
