import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"
const MAX_DIGITAL_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
const BUCKET_FILE_SIZE_LIMIT = 5368709120 // 5GB exact

/**
 * Force-fix bucket using every method available:
 * 1. Admin JS client updateBucket
 * 2. Admin JS client createBucket (if not found)
 * 3. Direct REST API (bypasses JS client quirks)
 * 4. Direct SQL via rpc (ultimate fallback)
 */
async function forceFixBucket(): Promise<void> {
  const adminSupabase = createAdminClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // --- Attempt 1: Admin JS client updateBucket ---
  try {
    const { error: updateErr } = await adminSupabase.storage.updateBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: undefined,
    })
    if (!updateErr) {
      console.log("[signed-upload] Bucket fixed via updateBucket")
      return
    }
    console.warn("[signed-upload] updateBucket failed:", updateErr.message)

    // If bucket doesn't exist, create it
    if (updateErr.message?.includes("not found") || updateErr.message?.includes("404")) {
      const { error: createErr } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
        allowedMimeTypes: undefined,
      })
      if (!createErr) {
        console.log("[signed-upload] Bucket created via createBucket")
        return
      }
      // 409 = already exists, that's fine
      if (createErr.message?.includes("already exists") || createErr.message?.includes("409")) {
        console.log("[signed-upload] Bucket already exists, continuing")
      } else {
        console.warn("[signed-upload] createBucket failed:", createErr.message)
      }
    }
  } catch (e) {
    console.warn("[signed-upload] JS client bucket fix failed:", e)
  }

  // --- Attempt 2: Direct REST API ---
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
        return
      }

      if (updateRes.status === 404 || updateRes.status === 400) {
        const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
          method: "POST",
          headers,
          body: JSON.stringify(bucketConfig),
        })
        if (createRes.ok || createRes.status === 409) {
          console.log("[signed-upload] Bucket fixed via REST POST")
          return
        }
      }
    } catch (e) {
      console.warn("[signed-upload] REST bucket fix failed:", e)
    }

    // --- Attempt 3: Direct SQL via PostgREST ---
    try {
      const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          query: `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('${BUCKET_NAME}', '${BUCKET_NAME}', true, ${BUCKET_FILE_SIZE_LIMIT}, NULL) ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = ${BUCKET_FILE_SIZE_LIMIT}, allowed_mime_types = NULL;`,
        }),
      })
      if (sqlRes.ok) {
        console.log("[signed-upload] Bucket fixed via SQL rpc")
        return
      }
    } catch {
      // RPC may not exist, that's fine
    }
  }

  console.warn("[signed-upload] All bucket fix methods attempted - proceeding with upload")
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

    if (fileSize > MAX_DIGITAL_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 5GB)" }, { status: 400 })
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
