import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = "lead-form-files"
const MAX_DIGITAL_FILE_SIZE = 500 * 1024 * 1024 // 500MB

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
      folder: string // 'digital' or 'images'
    }

    if (!fileName || !contentType || !fileSize) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (fileSize > MAX_DIGITAL_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 500MB)" }, { status: 400 })
    }

    // Ensure bucket exists with proper configuration using direct REST API
    // This bypasses the JS client to fix corrupted int32 file_size_limit values
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

      // First try to update existing bucket via direct REST API
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
          file_size_limit: 0, // 0 = no limit (fixes int32 overflow from previous 4GB value)
          allowed_mime_types: null,
        }),
      })

      if (!updateRes.ok) {
        const updateBody = await updateRes.json().catch(() => null)
        console.error("[signed-upload] Direct bucket update failed:", updateRes.status, updateBody)

        // If bucket doesn't exist, create it
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
              file_size_limit: 0,
              allowed_mime_types: null,
            }),
          })
          if (!createRes.ok) {
            const createBody = await createRes.json().catch(() => null)
            console.error("[signed-upload] Bucket creation failed:", createRes.status, createBody)
          }
        }
      }
    } catch (bucketErr) {
      console.error("[signed-upload] Bucket setup error (continuing):", bucketErr)
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
      return NextResponse.json({ error: `Failed to create upload URL: ${signedError?.message || 'Unknown error'}` }, { status: 500 })
    }

    // Get the public URL for after upload
    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

    return NextResponse.json({
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: filePath,
      publicUrl: urlData.publicUrl,
    })
  } catch (error) {
    console.error("Signed upload URL error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
