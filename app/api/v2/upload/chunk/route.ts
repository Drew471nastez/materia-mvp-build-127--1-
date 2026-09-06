import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  STORAGE_BUCKET,
  PUBLIC_BUCKET,
  validateFile,
  generateStoragePath,
  checkUploadAllowed,
  checkUploadRateLimit,
  readBufferHeader,
  scanFile,
} from "@/lib/storage"
import { ignoreError } from "@/lib/supabase/ignore-error"

export const runtime = "nodejs"
export const maxDuration = 300

// In-memory chunk assembly store (per-process; for multi-process use Redis)
const chunkStore = new Map<
  string,
  {
    chunks: Map<number, Buffer>
    totalChunks: number
    fileName: string
    fileSize: number
    contentType: string
    path: string
    bucket: string
    assetId: string | null
    productId: string | null
    creatorId: string
    userId: string
    createdAt: number
  }
>()

// Clean up stale entries every 5 minutes
setInterval(() => {
  const staleThreshold = Date.now() - 30 * 60 * 1000 // 30 min
  for (const [key, entry] of chunkStore) {
    if (entry.createdAt < staleThreshold) {
      chunkStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * POST /api/v2/upload/chunk
 *
 * Receives individual chunks of a large file upload.
 * When all chunks are received, assembles and uploads to storage.
 *
 * Form data:
 *   - file: Blob (the chunk)
 *   - chunkIndex: number
 *   - totalChunks: number
 *   - fileName: string
 *   - fileSize: number (total file size)
 *   - contentType: string
 *   - path: string (storage path from prepare)
 *   - bucket: string (target bucket from prepare)
 *   - assetId?: string (from prepare)
 *   - productId?: string
 *   - folder: string
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // Authenticate
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator
    const { data: creator } = await admin
      .from("creators")
      .select("id, subscription_plan_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403 })
    }

    // Parse form data
    const formData = await request.formData()
    const chunk = formData.get("file") as File | null
    const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10)
    const totalChunks = parseInt(formData.get("totalChunks") as string, 10)
    const fileName = formData.get("fileName") as string
    const fileSize = parseInt(formData.get("fileSize") as string, 10)
    const contentType = (formData.get("contentType") as string) || "application/octet-stream"
    const path = formData.get("path") as string
    const bucket = formData.get("bucket") as string
    const assetId = formData.get("assetId") as string | null
    const productId = formData.get("productId") as string | null
    const folder = (formData.get("folder") as string) || "digital"

    if (!chunk || isNaN(chunkIndex) || isNaN(totalChunks) || !fileName || isNaN(fileSize)) {
      return NextResponse.json({ error: "Missing chunk data" }, { status: 400 })
    }

    // Create a unique key for this upload session
    const uploadKey = `${user.id}:${path || fileName}:${fileSize}`

    // First chunk: validate and set up
    if (chunkIndex === 0) {
      // Rate limit check
      const rateCheck = await checkUploadRateLimit(admin, creator.id)
      if (!rateCheck.allowed) {
        return NextResponse.json({ error: rateCheck.reason }, { status: 429 })
      }

      // Validate file metadata
      const validation = validateFile(fileName, contentType, fileSize)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.reason }, { status: 400 })
      }

      // Check quota
      const quotaCheck = await checkUploadAllowed(admin, creator.id, fileSize)
      if (!quotaCheck.allowed) {
        return NextResponse.json({ error: quotaCheck.reason }, { status: 403 })
      }

      // Initialize chunk store
      chunkStore.set(uploadKey, {
        chunks: new Map(),
        totalChunks,
        fileName,
        fileSize,
        contentType,
        path: path || generateStoragePath(creator.id, fileName, folder === "digital" ? "digital-products" : "product-images"),
        bucket: bucket || (folder === "digital" ? STORAGE_BUCKET : PUBLIC_BUCKET),
        assetId,
        productId,
        creatorId: creator.id,
        userId: user.id,
        createdAt: Date.now(),
      })
    }

    const entry = chunkStore.get(uploadKey)
    if (!entry) {
      return NextResponse.json(
        { error: "Upload session not found. Start from chunk 0." },
        { status: 400 },
      )
    }

    // Store this chunk
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer())
    entry.chunks.set(chunkIndex, chunkBuffer)

    // Check if all chunks received
    if (entry.chunks.size < entry.totalChunks) {
      return NextResponse.json({
        success: true,
        chunksReceived: entry.chunks.size,
        totalChunks: entry.totalChunks,
        complete: false,
      })
    }

    // All chunks received — assemble the file
    const orderedChunks: Buffer[] = []
    for (let i = 0; i < entry.totalChunks; i++) {
      const c = entry.chunks.get(i)
      if (!c) {
        return NextResponse.json({ error: `Missing chunk ${i}` }, { status: 400 })
      }
      orderedChunks.push(c)
    }

    const fullBuffer = Buffer.concat(orderedChunks)

    // Security scan on the assembled file
    const header = readBufferHeader(fullBuffer)
    const deepScan = scanFile(entry.fileName, entry.contentType, header)
    if (!deepScan.safe) {
      chunkStore.delete(uploadKey)
      if (entry.assetId) {
        await ignoreError(admin.from("digital_assets").delete().eq("id", entry.assetId))
      }
      return NextResponse.json({ error: deepScan.reason }, { status: 400 })
    }

    // Upload to storage via admin client
    const { error: uploadError } = await admin.storage
      .from(entry.bucket)
      .upload(entry.path, fullBuffer, {
        contentType: entry.contentType,
        cacheControl: "31536000",
        upsert: true,
      })

    // Clean up chunk store
    chunkStore.delete(uploadKey)

    if (uploadError) {
      console.error("[chunk] Upload error:", uploadError)

      // Fallback: REST API upload
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (supabaseUrl && serviceRoleKey) {
        try {
          const restRes = await fetch(
            `${supabaseUrl}/storage/v1/object/${entry.bucket}/${entry.path}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serviceRoleKey}`,
                apikey: serviceRoleKey,
                "Content-Type": entry.contentType,
                "Cache-Control": "max-age=31536000",
                "x-upsert": "true",
              },
              body: fullBuffer,
            },
          )

          if (!restRes.ok) {
            const restBody = await restRes.json().catch(() => ({}))
            return NextResponse.json(
              { error: `Upload failed: ${restBody.error || restRes.status}` },
              { status: 500 },
            )
          }
        } catch (restErr) {
          return NextResponse.json(
            { error: `Upload failed: ${restErr instanceof Error ? restErr.message : "Unknown error"}` },
            { status: 500 },
          )
        }
      } else {
        return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
      }
    }

    // Mark asset as completed
    if (entry.assetId) {
      /*
        This was `.catch(() => {})`, i.e. meant as best-effort — but a PostgREST
        builder has no `catch`, so it threw a TypeError and the route answered
        500 AFTER the file had uploaded successfully. The author's intent is
        restored, not changed.
      */
      await ignoreError(
        admin
          .from("digital_assets")
          .update({
            upload_status: "completed",
            scan_status: "pending_scan",
            file_size: fullBuffer.length,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entry.assetId),
      )
    }

    return NextResponse.json({
      success: true,
      chunksReceived: entry.totalChunks,
      totalChunks: entry.totalChunks,
      complete: true,
      path: entry.path,
      bucket: entry.bucket,
      assetId: entry.assetId,
    })
  } catch (error) {
    console.error("[chunk] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
