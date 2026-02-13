import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateFile, checkUploadRateLimit } from "@/lib/storage"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Ensure the bucket exists with NO bucket-level file size limit.
 * Setting file_size_limit to 0/null disables the bucket check in Supabase Storage,
 * letting only the project-level global limit apply.
 */
async function ensureBucketNoLimit(): Promise<{ ok: boolean; currentLimit: number | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return { ok: true, currentLimit: null }

  const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  }

  const getBucketInfo = async (): Promise<{ exists: boolean; limit: number | null }> => {
    try {
      const r = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      })
      if (!r.ok) return { exists: false, limit: null }
      const b = await r.json()
      return { exists: true, limit: b?.file_size_limit ?? null }
    } catch {
      return { exists: false, limit: null }
    }
  }

  const info = await getBucketInfo()

  // null/0 = no bucket-level limit = OK
  if (info.exists && (info.limit === null || info.limit === 0)) {
    return { ok: true, currentLimit: null }
  }

  // Try to remove the limit (set to 0)
  const adminSupabase = createAdminClient()

  // Method 1: REST API
  try {
    if (info.exists) {
      await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ public: true, file_size_limit: 0, allowed_mime_types: null }),
      })
    } else {
      await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id: BUCKET_NAME, name: BUCKET_NAME, public: true, file_size_limit: 0, allowed_mime_types: null }),
      })
    }
  } catch { /* continue */ }
  const after1 = await getBucketInfo()
  if (after1.exists && (after1.limit === null || after1.limit === 0)) return { ok: true, currentLimit: null }

  // Method 2: JS client
  try {
    await adminSupabase.storage.updateBucket(BUCKET_NAME, { public: true, fileSizeLimit: 0 as unknown as string })
  } catch {
    try {
      await adminSupabase.storage.createBucket(BUCKET_NAME, { public: true, fileSizeLimit: 0 as unknown as string })
    } catch { /* exists */ }
  }
  const after2 = await getBucketInfo()
  if (after2.exists && (after2.limit === null || after2.limit === 0)) return { ok: true, currentLimit: null }

  // Method 3: RPC direct SQL
  try {
    await adminSupabase.rpc("fix_storage_bucket_limit", { p_bucket_id: BUCKET_NAME, p_file_size_limit: 0 })
  } catch { /* may not exist */ }
  const after3 = await getBucketInfo()
  if (after3.exists && (after3.limit === null || after3.limit === 0)) return { ok: true, currentLimit: null }

  return { ok: false, currentLimit: after3.limit }
}

/**
 * POST - Generate a signed upload URL for direct-to-storage uploads.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const body = await request.json()
    const { fileName, contentType, fileSize, folder } = body as {
      fileName: string
      contentType: string
      fileSize: number
      folder: string
    }

    if (!fileName || !fileSize) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Rate limit check
    const rateCheck = await checkUploadRateLimit(adminSupabase, creator.id)
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: rateCheck.reason }, { status: 429 })
    }

    // Security validation (extension blocklist + 5GB limit)
    const fileValidation = validateFile(fileName, contentType || "application/octet-stream", fileSize)
    if (!fileValidation.valid) {
      return NextResponse.json({ error: fileValidation.reason }, { status: 400 })
    }

    // Ensure bucket has no file_size_limit (let global project limit handle it)
    const bucketFix = await ensureBucketNoLimit()

    if (!bucketFix.ok) {
      const sql = `UPDATE storage.buckets SET file_size_limit = NULL WHERE id = '${BUCKET_NAME}';`
      console.error(`[signed-upload] Bucket limit still set: ${bucketFix.currentLimit}. Run SQL: ${sql}`)
      return NextResponse.json(
        { error: `Storage bucket file_size_limit is ${bucketFix.currentLimit} bytes — run this SQL in Supabase SQL Editor to remove it: ${sql}` },
        { status: 507 },
      )
    }

    // Generate unique path
    const ext = fileName.split(".").pop() || "bin"
    const subfolder = folder === "digital" ? "digital-products" : "product-images"
    const filePath = `${creator.id}/${subfolder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    // Create a signed upload URL using admin client (valid for 10 minutes)
    const { data: signedData, error: signedError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath)

    if (signedError || !signedData) {
      console.error("Signed URL error:", signedError)
      return NextResponse.json(
        { error: `Failed to create upload URL: ${signedError?.message || "Unknown error"}` },
        { status: 500 },
      )
    }

    // Auto-create RLS policies so browser TUS uploads work (idempotent)
    let tusReady = false
    try {
      await adminSupabase.rpc("ensure_storage_rls", { p_bucket_id: BUCKET_NAME })
      tusReady = true
    } catch {
      console.warn("[signed-upload] ensure_storage_rls RPC not available")
    }

    // Get the public URL for after upload
    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

    return NextResponse.json({
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: filePath,
      publicUrl: urlData.publicUrl,
      bucket: BUCKET_NAME,
      tusReady,
    })
  } catch (error) {
    console.error("Signed upload URL error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
