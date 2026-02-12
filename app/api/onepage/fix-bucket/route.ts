import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"
// Use a very large positive number - 0/null would fall back to Supabase global default (often 50MB)
const BUCKET_FILE_SIZE_LIMIT = 2000000000 // ~2GB — must fit int4 for older Supabase projects

/**
 * POST - Fix the lead-form-files bucket configuration.
 * Tries multiple methods: JS admin client, REST API, then reports status.
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

    const adminSupabase = createAdminClient()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const results: string[] = []

    // --- Method 0: RPC function (direct database update – most reliable) ---
    try {
      const { error: rpcErr } = await adminSupabase.rpc("fix_storage_bucket_limit", {
        p_bucket_id: BUCKET_NAME,
        p_file_size_limit: BUCKET_FILE_SIZE_LIMIT,
      })
      if (!rpcErr) {
        results.push("RPC fix_storage_bucket_limit: SUCCESS")
      } else {
        results.push(`RPC: ${rpcErr.message}`)
      }
    } catch (e) {
      results.push(`RPC error: ${e instanceof Error ? e.message : String(e)}`)
    }

    // --- Method 1: Admin JS client updateBucket ---
    try {
      const { error: updateErr } = await adminSupabase.storage.updateBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
        allowedMimeTypes: null,
      })
      if (!updateErr) {
        results.push("updateBucket: SUCCESS")
      } else {
        results.push(`updateBucket: ${updateErr.message}`)

        // Try create if not found
        if (updateErr.message?.includes("not found") || updateErr.message?.includes("404")) {
          const { error: createErr } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
            allowedMimeTypes: null,
          })
          if (!createErr) {
            results.push("createBucket: SUCCESS")
          } else {
            results.push(`createBucket: ${createErr.message}`)
          }
        }
      }
    } catch (e) {
      results.push(`JS client error: ${e instanceof Error ? e.message : String(e)}`)
    }

    // --- Method 2: Direct REST API (always try as double-check) ---
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    }

    try {
      const updateRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          public: true,
          file_size_limit: BUCKET_FILE_SIZE_LIMIT,
          allowed_mime_types: null,
        }),
      })

      const updateBody = await updateRes.json().catch(() => null)

      if (updateRes.ok) {
        results.push("REST PUT: SUCCESS")
      } else {
        results.push(`REST PUT: ${updateRes.status} ${updateBody?.message || ""}`)

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
          const createBody = await createRes.json().catch(() => null)
          if (createRes.ok || createRes.status === 409) {
            results.push("REST POST: SUCCESS")
          } else {
            results.push(`REST POST: ${createRes.status} ${createBody?.message || ""}`)
          }
        }
      }
    } catch (e) {
      results.push(`REST error: ${e instanceof Error ? e.message : String(e)}`)
    }

    // --- Verify final state ---
    let verifiedLimit: number | null = null
    try {
      const verifyRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      })
      const verifyBody = await verifyRes.json().catch(() => null)
      verifiedLimit = verifyBody?.file_size_limit ?? null
    } catch {
      // ignore
    }

    const isFixed = verifiedLimit !== null && verifiedLimit >= BUCKET_FILE_SIZE_LIMIT

    return NextResponse.json({
      success: isFixed,
      message: isFixed
        ? `Bucket configured: ${BUCKET_NAME} with ${BUCKET_FILE_SIZE_LIMIT} byte limit`
        : `Bucket may still need fixing. Current limit: ${verifiedLimit}. Run this SQL in Supabase SQL Editor.`,
      results,
      currentLimit: verifiedLimit,
      requiredLimit: BUCKET_FILE_SIZE_LIMIT,
      sql: `UPDATE storage.buckets SET file_size_limit = ${BUCKET_FILE_SIZE_LIMIT}, public = true, allowed_mime_types = NULL WHERE id = '${BUCKET_NAME}';`,
    })
  } catch (error) {
    console.error("[fix-bucket] Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        sql: `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('${BUCKET_NAME}', '${BUCKET_NAME}', true, ${BUCKET_FILE_SIZE_LIMIT}, NULL) ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = ${BUCKET_FILE_SIZE_LIMIT}, allowed_mime_types = NULL;`,
      },
      { status: 500 },
    )
  }
}
