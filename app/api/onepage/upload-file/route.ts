import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Increase body size limit for file uploads (default is ~4MB)
export const config = {
  api: {
    bodyParser: false,
  },
}

// Runtime must be nodejs for large file handling
export const runtime = "nodejs"
// Allow up to 300 seconds for upload processing (large files)
export const maxDuration = 300

const BUCKET_NAME = "lead-form-files"
const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024 // 4GB - all file types

// POST - Upload a file for lead form (product images and digital products)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Get the current user
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

    // Get form data with the file
    const formData = await request.formData()
    const file = formData.get("file") as File
    const fileType = formData.get("type") as string // 'image' or 'digital'

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file size (max 4GB for all file types)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: 'File size must be less than 4GB'
      }, { status: 400 })
    }

    // Ensure bucket exists with correct settings (public, 4GB, all MIME types)
    const { data: buckets } = await adminSupabase.storage.listBuckets()
    const existingBucket = buckets?.find((b) => b.name === BUCKET_NAME)

    if (!existingBucket) {
      const { error: createError } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: null, // null = allow ALL file types
      })

      if (createError && !createError.message?.includes('already exists')) {
        console.error("Error creating bucket:", createError)
      }
    } else {
      // Always update to ensure correct settings (public, 4GB, no MIME restrictions)
      await adminSupabase.storage.updateBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: null, // null = allow ALL file types (undefined gets stripped from JSON!)
      })
    }

    // Generate unique filename
    const fileExt = file.name.split(".").pop() || "bin"
    const subfolder = fileType === 'digital' ? 'digital-products' : 'product-images'
    const fileName = `${creator.id}/${subfolder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    // Convert File to ArrayBuffer then to Uint8Array for upload
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = new Uint8Array(arrayBuffer)

    // Upload using admin client (bypasses RLS)
    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: "31536000", // Cache for 1 year
        upsert: true,
      })

    if (uploadError) {
      console.error("Upload error:", uploadError)
      return NextResponse.json({ error: `Failed to upload file: ${uploadError.message}` }, { status: 500 })
    }

    // Get the public URL
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
    console.error("Upload file error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
