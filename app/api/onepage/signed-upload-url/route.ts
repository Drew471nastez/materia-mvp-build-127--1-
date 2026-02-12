import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"
// Must fit int4 (max 2,147,483,647) — older Supabase projects use int4 for file_size_limit
const BUCKET_FILE_SIZE_LIMIT = 2000000000 // ~2GB

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Check the bucket's actual file_size_limit via REST API.
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
 * Force-fix bucket using every method available. Returns whether the bucket
 * limit is now sufficient for the requested file size.
 */
async function forceFixBucket(requiredSize: number): Promise<{ ok: boolean; currentLimit: number | null }> {
  // Check current limit first — skip fix if already sufficient
  const existingLimit = await getBucketLimit()
  if (existingLimit !== null && existingLimit >= requiredSize) {
    return { ok: true, currentLimit: existingLimit }
  }

  const adminSupabase = createAdminClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const logs: string[] = []

  // --- Method 1: REST API PUT (most reliable — no dependency on RPC function) ---
  if (supabaseUrl && serviceRoleKey) {
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    }

    try {
      // PUT body should only contain updatable fields (no id/name)
      const updateRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          public: true,
          file_size_limit: BUCKET_FILE_SIZE_LIMIT,
          allowed_mime_types: null,
        }),
      })

      if (updateRes.ok) {
        logs.push("REST PUT: OK")
      } else {
        const body = await updateRes.json().catch(() => ({}))
        logs.push(`REST PUT ${updateRes.status}: ${body?.message || body?.error || ""}`)

        // Bucket doesn't exist — create it
        if (updateRes.status === 404 || updateRes.status === 400) {
          const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              id: BUCKET_NAME,
              name: BUCKET_NAME,
              public: true,
              file_size_limit: BUCKET_FILE_SIZE_LIMIT,
              allowed_mime_types: null,
            }),
          })
          const createBody = await createRes.json().catch(() => ({}))
          if (createRes.ok || createRes.status === 409) {
            logs.push("REST POST (create): OK")
            // After create, do a PUT to set the limit (create might ignore file_size_limit)
            await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
              method: "PUT",
              headers,
              body: JSON.stringify({
                public: true,
                file_size_limit: BUCKET_FILE_SIZE_LIMIT,
                allowed_mime_types: null,
              }),
            }).catch(() => {})
          } else {
            logs.push(`REST POST ${createRes.status}: ${createBody?.message || ""}`)
          }
        }
      }
    } catch (e) {
      logs.push(`REST error: ${e instanceof Error ? e.message : String(e)}`)
    }

    // Check if REST fixed it
    const afterRest = await getBucketLimit()
    if (afterRest !== null && afterRest >= requiredSize) {
      console.log("[signed-upload] Bucket fixed via REST.", logs.join("; "))
      return { ok: true, currentLimit: afterRest }
    }
  }

  // --- Method 2: Admin JS client updateBucket ---
  try {
    const { error: updateErr } = await adminSupabase.storage.updateBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
    })
    if (!updateErr) {
      logs.push("updateBucket: OK")
    } else {
      logs.push(`updateBucket: ${updateErr.message}`)
      if (updateErr.message?.includes("not found") || updateErr.message?.includes("404")) {
        const { error: createErr } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
        })
        if (!createErr) {
          logs.push("createBucket: OK")
        } else {
          logs.push(`createBucket: ${createErr.message}`)
        }
      }
    }
  } catch (e) {
    logs.push(`JS client: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Check again
  const afterJs = await getBucketLimit()
  if (afterJs !== null && afterJs >= requiredSize) {
    console.log("[signed-upload] Bucket fixed via JS client.", logs.join("; "))
    return { ok: true, currentLimit: afterJs }
  }

  // --- Method 3: RPC function (requires migration to have been applied) ---
  try {
    const { error: rpcErr } = await adminSupabase.rpc("fix_storage_bucket_limit", {
      p_bucket_id: BUCKET_NAME,
      p_file_size_limit: BUCKET_FILE_SIZE_LIMIT,
    })
    if (!rpcErr) {
      logs.push("RPC: OK")
    } else {
      logs.push(`RPC: ${rpcErr.message}`)
    }
  } catch (e) {
    logs.push(`RPC error: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Final check
  const finalLimit = await getBucketLimit()
  const ok = finalLimit !== null && finalLimit >= requiredSize
  console.log(`[signed-upload] Bucket fix ${ok ? "succeeded" : "FAILED"}.`, logs.join("; "), "limit:", finalLimit)
  return { ok, currentLimit: finalLimit }
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

    if (!fileName || !contentType || !fileSize) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Fix bucket configuration and VERIFY it worked before proceeding
    const bucketFix = await forceFixBucket(fileSize)

    if (!bucketFix.ok) {
      const sql = `UPDATE storage.buckets SET file_size_limit = ${BUCKET_FILE_SIZE_LIMIT}, public = true, allowed_mime_types = NULL WHERE id = '${BUCKET_NAME}';`
      console.error(
        `[signed-upload] Bucket limit too low for ${fileSize} byte file. Current limit: ${bucketFix.currentLimit}. Run this SQL in Supabase dashboard: ${sql}`,
      )
      return NextResponse.json(
        {
          error: `Storage bucket limit is ${bucketFix.currentLimit || "unknown"} bytes but file is ${fileSize} bytes. Please contact support or run this SQL in your Supabase SQL Editor: ${sql}`,
        },
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
