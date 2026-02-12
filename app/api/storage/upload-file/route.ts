import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Default bucket for digital product files
const BUCKET_NAME = "product-files"

// file_size_limit = 0 means NO limit in Supabase Storage
const MAX_FILE_SIZE = 0

// Helper to ensure bucket exists with proper configuration
async function ensureBucketExists(adminSupabase: ReturnType<typeof createAdminClient>, bucketName: string) {
  try {
    const { data: buckets } = await adminSupabase.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === bucketName)

    if (!bucketExists) {
      // Create bucket (private, not public - files are delivered via signed URLs)
      const { error: createError } = await adminSupabase.storage.createBucket(bucketName, {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE, // 5GB
      })

      if (createError && !createError.message.includes("already exists")) {
        console.error(`Error creating bucket ${bucketName}:`, createError)
        return false
      }
    } else {
      // Try to update bucket settings
      try {
        await adminSupabase.storage.updateBucket(bucketName, {
          public: false,
          fileSizeLimit: MAX_FILE_SIZE, // 5GB
        })
      } catch (updateErr) {
        // Ignore update errors - bucket config might be fine
        console.log(`Bucket ${bucketName} update skipped:`, updateErr)
      }
    }
    return true
  } catch (err) {
    console.error("Error ensuring bucket exists:", err)
    return false
  }
}

// POST - Upload a digital file using admin client (bypasses RLS)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      console.error("Auth error:", authError)
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 })
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized - please log in" }, { status: 401 })
    }

    // Create admin client after auth check
    let adminSupabase
    try {
      adminSupabase = createAdminClient()
    } catch (adminError) {
      console.error("Admin client creation error:", adminError)
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    // Verify user is a creator
    const { data: creator, error: creatorError } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (creatorError) {
      console.error("Creator lookup error:", creatorError)
    }

    if (!creator) {
      return NextResponse.json({ error: "Only creators can upload digital files" }, { status: 403 })
    }

    // Parse form data
    let formData
    try {
      formData = await request.formData()
    } catch (formError) {
      console.error("Form data parse error:", formError)
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
    }

    const file = formData.get("file") as File | null
    const productId = formData.get("productId") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    // Verify the product belongs to this creator
    const { data: product, error: productError } = await adminSupabase
      .from("products")
      .select("id, creator_id")
      .eq("id", productId)
      .single()

    if (productError) {
      console.error("Product lookup error:", productError)
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    if (!product || product.creator_id !== creator.id) {
      return NextResponse.json({ error: "Product not found or access denied" }, { status: 403 })
    }

    // Ensure bucket exists
    const bucketReady = await ensureBucketExists(adminSupabase, BUCKET_NAME)
    if (!bucketReady) {
      console.error("Bucket creation/verification failed")
      return NextResponse.json({ error: "Storage not available" }, { status: 500 })
    }

    // Generate unique path
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
    const filePath = `products/${productId}/${timestamp}_${safeName}`

    // Upload using admin client (bypasses RLS)
    let arrayBuffer
    try {
      arrayBuffer = await file.arrayBuffer()
    } catch (bufferError) {
      console.error("File buffer error:", bufferError)
      return NextResponse.json({ error: "Failed to read file" }, { status: 400 })
    }

    const { error: uploadError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
        upsert: false,
      })

    if (uploadError) {
      console.error("Digital file upload error:", uploadError)
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // Save to digital_assets table
    const { data: asset, error: dbError } = await adminSupabase
      .from("digital_assets")
      .insert({
        product_id: productId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
      })
      .select()
      .single()

    if (dbError) {
      console.error("Digital asset DB error:", dbError)
      // Try to clean up uploaded file
      await adminSupabase.storage.from(BUCKET_NAME).remove([filePath]).catch(() => {})
      return NextResponse.json({ error: `Failed to save file metadata: ${dbError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
      },
    })
  } catch (error) {
    console.error("Digital file upload error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE - Remove a digital file
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const assetId = searchParams.get("assetId")

    if (!assetId) {
      return NextResponse.json({ error: "Asset ID is required" }, { status: 400 })
    }

    // Verify the user owns this asset's product
    const { data: asset } = await adminSupabase
      .from("digital_assets")
      .select("*, product:products(creator_id)")
      .eq("id", assetId)
      .single()

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    }

    // Get the creator
    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator || asset.product?.creator_id !== creator.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Delete from storage
    const { error: storageError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .remove([asset.file_path])

    if (storageError) {
      console.log("Storage deletion error (continuing):", storageError)
    }

    // Delete from database
    const { error: dbError } = await adminSupabase
      .from("digital_assets")
      .delete()
      .eq("id", assetId)

    if (dbError) {
      return NextResponse.json({ error: `Failed to delete: ${dbError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete digital file error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
