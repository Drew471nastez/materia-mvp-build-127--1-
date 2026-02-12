import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"
// Use a very large positive number - 0/null would fall back to Supabase global default (often 50MB)
const BUCKET_FILE_SIZE_LIMIT = 2000000000 // ~2GB — must fit int4 (max 2,147,483,647) for older Supabase projects

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Check the bucket's actual file_size_limit via REST API.
 * Returns the current limit, or null if unable to check.
 */
async function getBucketLimit(): Promise<number | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null

  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    })
    if (!res.ok) return null
    const body = await res.json()
    return body?.file_size_limit ?? null
  } catch {
    return null
  }
}

/**
 * Force-fix bucket using every method available. Tries ALL methods (does not
 * return early) to maximise the chance the limit is actually applied.
 * Priority order:
 *   0. RPC function (direct SQL – most reliable)
 *   1. Admin JS client updateBucket / createBucket
 *   2. Direct REST API PUT / POST
 */
async function forceFixBucket(): Promise<void> {
  const adminSupabase = createAdminClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // --- Method 0: RPC function (direct database update, most reliable) ---
  try {
    const { error: rpcErr } = await adminSupabase.rpc("fix_storage_bucket_limit", {
      p_bucket_id: BUCKET_NAME,
      p_file_size_limit: BUCKET_FILE_SIZE_LIMIT,
    })
    if (!rpcErr) {
      console.log("[signed-upload] Bucket fixed via RPC")
      // Verify it actually worked
      const currentLimit = await getBucketLimit()
      if (currentLimit !== null && currentLimit >= BUCKET_FILE_SIZE_LIMIT) {
        return // Verified! Done.
      }
      console.warn("[signed-upload] RPC succeeded but verification failed, current limit:", currentLimit)
    } else {
      console.warn("[signed-upload] RPC fix_storage_bucket_limit failed:", rpcErr.message)
    }
  } catch (e) {
    console.warn("[signed-upload] RPC call failed:", e)
  }

  // --- Method 1: Admin JS client updateBucket ---
  try {
    const { error: updateErr } = await adminSupabase.storage.updateBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: null,
    })
    if (!updateErr) {
      console.log("[signed-upload] Bucket fixed via updateBucket")
    } else {
      console.warn("[signed-upload] updateBucket failed:", updateErr.message)

      if (updateErr.message?.includes("not found") || updateErr.message?.includes("404")) {
        const { error: createErr } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
          allowedMimeTypes: null,
        })
        if (!createErr) {
          console.log("[signed-upload] Bucket created via createBucket")
        } else if (!createErr.message?.includes("already exists") && !createErr.message?.includes("409")) {
          console.warn("[signed-upload] createBucket failed:", createErr.message)
        }
      }
    }
  } catch (e) {
    console.warn("[signed-upload] JS client bucket fix failed:", e)
  }

  // --- Method 2: Direct REST API ---
  if (supabaseUrl && serviceRoleKey) {
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    }
    const bucketConfig = {
      id: BUCKET_NAME,
      name: BUCKET_NAME,
      public: true,
      file_size_limit: BUCKET_FILE_SIZE_LIMIT,
      allowed_mime_types: null,
    }

    try {
      const updateRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(bucketConfig),
      })
      if (updateRes.ok) {
        console.log("[signed-upload] Bucket fixed via REST PUT")
      } else if (updateRes.status === 404 || updateRes.status === 400) {
        const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
          method: "POST",
          headers,
          body: JSON.stringify(bucketConfig),
        })
        if (createRes.ok || createRes.status === 409) {
          console.log("[signed-upload] Bucket created via REST POST")
        }
      }
    } catch (e) {
      console.warn("[signed-upload] REST bucket fix failed:", e)
    }
  }

  // Final verification
  const finalLimit = await getBucketLimit()
  if (finalLimit !== null && finalLimit >= BUCKET_FILE_SIZE_LIMIT) {
    console.log("[signed-upload] Bucket verified: limit =", finalLimit)
  } else {
    console.warn("[signed-upload] Bucket limit may still be wrong. Current:", finalLimit, "Required:", BUCKET_FILE_SIZE_LIMIT)
  }
}

/**
 * POST - Generate a signed upload URL for direct-to-storage uploads.
 * This avoids FUNCTION_PAYLOAD_TOO_LARGE by never sending file bytes through the API route.
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

    if (!fileName || !contentType || !fileSize) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // FORCE fix bucket configuration before every upload attempt
    await forceFixBucket()

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

    // Get the public URL for after upload
    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

    return NextResponse.json({
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: filePath,
      publicUrl: urlData.publicUrl,
      bucket: BUCKET_NAME,
    })
  } catch (error) {
    console.error("Signed upload URL error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
