import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const DEFAULT_BUCKET = "lead-form-files-v2"
const LEGACY_BUCKET = "lead-form-files"
const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || DEFAULT_BUCKET
const MAX_DIGITAL_FILE_SIZE = 50 * 1024 * 1024 * 1024 // 50GB project-level guardrail
const BUCKET_FILE_SIZE_LIMIT = 50 * 1024 * 1024 * 1024

function getCandidateBuckets(): string[] {
  return Array.from(new Set([BUCKET_NAME, DEFAULT_BUCKET, LEGACY_BUCKET]))
}

async function forceFixBucket(): Promise<void> {
  const adminSupabase = createAdminClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucketIds = getCandidateBuckets()

  try {
    for (const bucketId of bucketIds) {
      const { error: updateErr } = await adminSupabase.storage.updateBucket(bucketId, {
        public: true,
        fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
        allowedMimeTypes: undefined,
      })

      if (!updateErr) continue

      if (updateErr.message?.includes("not found") || updateErr.message?.includes("404")) {
        const { error: createErr } = await adminSupabase.storage.createBucket(bucketId, {
          public: true,
          fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
          allowedMimeTypes: undefined,
        })
        if (!createErr || createErr.message?.includes("already exists") || createErr.message?.includes("409")) {
          continue
        }
      }

      console.warn(`[signed-upload] JS bucket fix failed for ${bucketId}:`, updateErr.message)
    }
  } catch (e) {
    console.warn("[signed-upload] JS client bucket fix failed:", e)
  }

  if (supabaseUrl && serviceRoleKey) {
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    }

    for (const bucketId of bucketIds) {
      const bucketConfig = {
        id: bucketId,
        name: bucketId,
        public: true,
        file_size_limit: BUCKET_FILE_SIZE_LIMIT,
        allowed_mime_types: null,
      }

      try {
        const updateRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(bucketConfig),
        })

        if (updateRes.ok) continue

        if (updateRes.status === 404 || updateRes.status === 400) {
          const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
            method: "POST",
            headers,
            body: JSON.stringify(bucketConfig),
          })
          if (createRes.ok || createRes.status === 409) continue
        }
      } catch (e) {
        console.warn(`[signed-upload] REST bucket fix failed for ${bucketId}:`, e)
      }

      try {
        await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            ...headers,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            query: `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('${bucketId}', '${bucketId}', true, ${BUCKET_FILE_SIZE_LIMIT}, NULL) ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = ${BUCKET_FILE_SIZE_LIMIT}, allowed_mime_types = NULL;`,
          }),
        })
      } catch {
        // RPC may not exist, ignore
      }
    }
  }
}

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

    const { data: creator } = await adminSupabase.from("creators").select("id").eq("user_id", user.id).single()

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
      return NextResponse.json({ error: "File too large (max 50GB)" }, { status: 400 })
    }

    await forceFixBucket()

    const ext = fileName.split(".").pop() || "bin"
    const subfolder = folder === "digital" ? "digital-products" : "product-images"
    const filePath = `${creator.id}/${subfolder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

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

    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

    return NextResponse.json({
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: filePath,
      publicUrl: urlData.publicUrl,
      bucket: BUCKET_NAME,
      maxBytes: MAX_DIGITAL_FILE_SIZE,
    })
  } catch (error) {
    console.error("Signed upload URL error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
