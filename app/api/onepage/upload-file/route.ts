import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 300

const DEFAULT_BUCKET = "lead-form-files-v2"
const LEGACY_BUCKET = "lead-form-files"
const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || DEFAULT_BUCKET
const BUCKET_FILE_SIZE_LIMIT: number | null = null // null = no per-object bucket cap

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
        fileSizeLimit: undefined,
        allowedMimeTypes: undefined,
      })

      if (!updateErr) continue

      if (updateErr.message?.includes("not found") || updateErr.message?.includes("404")) {
        const { error: createErr } = await adminSupabase.storage.createBucket(bucketId, {
          public: true,
          fileSizeLimit: undefined,
          allowedMimeTypes: undefined,
        })
        if (!createErr || createErr.message?.includes("already exists") || createErr.message?.includes("409")) {
          continue
        }
      }
    }
  } catch {
    // continue to REST fallback
  }

  if (supabaseUrl && serviceRoleKey) {
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    }

    for (const bucketId of bucketIds) {
      const config = {
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
          body: JSON.stringify(config),
        })
        if (updateRes.ok) continue

        if (updateRes.status === 404 || updateRes.status === 400) {
          const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
            method: "POST",
            headers,
            body: JSON.stringify(config),
          })
          if (createRes.ok || createRes.status === 409) continue
        }
      } catch {
        // continue
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

    const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (formError) {
      console.error("[upload-file] FormData parse error:", formError)
      return NextResponse.json(
        { error: "Failed to parse upload data. File may be too large for direct upload - use signed upload." },
        { status: 413 },
      )
    }

    const file = formData.get("file") as File
    const fileType = formData.get("type") as string

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }


    await forceFixBucket()

    const fileExt = file.name.split(".").pop() || "bin"
    const subfolder = fileType === "digital" ? "digital-products" : "product-images"
    const fileName = `${creator.id}/${subfolder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = new Uint8Array(arrayBuffer)

    const { data: uploadData, error: uploadError } = await adminSupabase.storage.from(BUCKET_NAME).upload(fileName, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "31536000",
      upsert: true,
    })

    if (uploadError) {
      console.error("[upload-file] Storage upload error:", uploadError)
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(fileName)

    if (!urlData?.publicUrl) {
      return NextResponse.json({ error: "Failed to get public URL" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: uploadData.path,
      filename: file.name,
    })
  } catch (error) {
    console.error("[upload-file] Fatal error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
