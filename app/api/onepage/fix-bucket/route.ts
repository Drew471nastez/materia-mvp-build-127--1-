import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"

/**
 * POST - Fix the lead-form-files bucket configuration.
 * Uses direct REST API call to Supabase Storage (bypassing JS client)
 * to set file_size_limit to 5GB and allow all MIME types.
 * This fixes issues caused by the previous 4GB value overflowing int32 in PostgreSQL.
 */
export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    // Direct REST API call to Supabase Storage to update bucket
    // This bypasses the JS client which may have issues with the corrupted int32 value
    const updateRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: BUCKET_NAME,
        name: BUCKET_NAME,
        public: true,
        file_size_limit: 5368709120, // 5GB per object
        allowed_mime_types: null, // null = allow all
      }),
    })

    const updateBody = await updateRes.json().catch(() => null)

    if (!updateRes.ok) {
      console.error("[fix-bucket] Direct REST API update failed:", updateRes.status, updateBody)

      // If bucket doesn't exist, try creating it
      if (updateRes.status === 404 || updateRes.status === 400) {
        const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: BUCKET_NAME,
            name: BUCKET_NAME,
            public: true,
            file_size_limit: 5368709120,
            allowed_mime_types: null,
          }),
        })

        const createBody = await createRes.json().catch(() => null)

        if (!createRes.ok) {
          return NextResponse.json({
            error: `Failed to fix bucket via REST API`,
            updateStatus: updateRes.status,
            updateBody,
            createStatus: createRes.status,
            createBody,
            sql: `UPDATE storage.buckets SET file_size_limit = 5368709120, allowed_mime_types = NULL WHERE id = '${BUCKET_NAME}';`,
          }, { status: 500 })
        }
      } else {
        return NextResponse.json({
          error: `Failed to update bucket: ${updateBody?.message || updateRes.statusText}`,
          status: updateRes.status,
          body: updateBody,
          sql: `UPDATE storage.buckets SET file_size_limit = 5368709120, allowed_mime_types = NULL WHERE id = '${BUCKET_NAME}';`,
        }, { status: 500 })
      }
    }

    // Verify the bucket config by reading it back
    const verifyRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
    })
    const verifyBody = await verifyRes.json().catch(() => null)

    return NextResponse.json({
      success: true,
      message: "Bucket configuration fixed successfully",
      bucket: verifyBody,
    })
  } catch (error) {
    console.error("[fix-bucket] Error:", error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Internal server error",
      sql: `UPDATE storage.buckets SET file_size_limit = 5368709120, allowed_mime_types = NULL WHERE id = '${BUCKET_NAME}';`,
    }, { status: 500 })
  }
}
