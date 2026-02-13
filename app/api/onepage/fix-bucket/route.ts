import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const DEFAULT_BUCKET = "lead-form-files-v2"
const LEGACY_BUCKET = "lead-form-files"
const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || DEFAULT_BUCKET
const BUCKET_FILE_SIZE_LIMIT: number | null = null // null = no per-object bucket cap

function getCandidateBuckets(): string[] {
  return Array.from(new Set([BUCKET_NAME, DEFAULT_BUCKET, LEGACY_BUCKET]))
}

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

    const bucketIds = getCandidateBuckets()
    const results: string[] = []

    try {
      for (const bucketId of bucketIds) {
        const { error: updateErr } = await adminSupabase.storage.updateBucket(bucketId, {
          public: true,
          fileSizeLimit: undefined,
          allowedMimeTypes: undefined,
        })

        if (!updateErr) {
          results.push(`updateBucket(${bucketId}): SUCCESS`)
          continue
        }

        results.push(`updateBucket(${bucketId}): ${updateErr.message}`)

        if (updateErr.message?.includes("not found") || updateErr.message?.includes("404")) {
          const { error: createErr } = await adminSupabase.storage.createBucket(bucketId, {
            public: true,
            fileSizeLimit: undefined,
            allowedMimeTypes: undefined,
          })

          if (!createErr || createErr.message?.includes("already exists") || createErr.message?.includes("409")) {
            results.push(`createBucket(${bucketId}): SUCCESS`)
          } else {
            results.push(`createBucket(${bucketId}): ${createErr.message}`)
          }
        }
      }
    } catch (e) {
      results.push(`JS client error: ${e instanceof Error ? e.message : String(e)}`)
    }

    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    }

    for (const bucketId of bucketIds) {
      try {
        const updateRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            id: bucketId,
            name: bucketId,
            public: true,
            file_size_limit: BUCKET_FILE_SIZE_LIMIT,
            allowed_mime_types: null,
          }),
        })

        const updateBody = await updateRes.json().catch(() => null)

        if (updateRes.ok) {
          results.push(`REST PUT(${bucketId}): SUCCESS`)
          continue
        }

        results.push(`REST PUT(${bucketId}): ${updateRes.status} ${updateBody?.message || ""}`)

        if (updateRes.status === 404 || updateRes.status === 400) {
          const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              id: bucketId,
              name: bucketId,
              public: true,
              file_size_limit: BUCKET_FILE_SIZE_LIMIT,
              allowed_mime_types: null,
            }),
          })
          const createBody = await createRes.json().catch(() => null)
          if (createRes.ok || createRes.status === 409) {
            results.push(`REST POST(${bucketId}): SUCCESS`)
          } else {
            results.push(`REST POST(${bucketId}): ${createRes.status} ${createBody?.message || ""}`)
          }
        }
      } catch (e) {
        results.push(`REST error(${bucketId}): ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const verifiedLimits: Record<string, number | null> = {}
    for (const bucketId of bucketIds) {
      try {
        const verifyRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
        })
        const verifyBody = await verifyRes.json().catch(() => null)
        verifiedLimits[bucketId] = verifyBody?.file_size_limit ?? null
      } catch {
        verifiedLimits[bucketId] = null
      }
    }

    const isFixed = bucketIds.every((id) => verifiedLimits[id] === null || typeof verifiedLimits[id] === "number")

    return NextResponse.json({
      success: isFixed,
      bucket: BUCKET_NAME,
      buckets: bucketIds,
      message: isFixed
        ? "Lead-form buckets configured with no per-object file-size cap"
        : "One or more lead-form buckets may still need fixing.",
      results,
      currentLimits: verifiedLimits,
      requiredLimit: null,
      sql: bucketIds
        .map(
          (bucketId) =>
            `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('${bucketId}', '${bucketId}', true, NULL, NULL) ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = NULL, allowed_mime_types = NULL;`,
        )
        .join("\n"),
    })
  } catch (error) {
    console.error("[fix-bucket] Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}
