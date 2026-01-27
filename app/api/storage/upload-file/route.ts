import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = "product-files"

// POST - Get a signed upload URL for digital product files
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

    const body = await request.json()
    const { filename, contentType, productId } = body

    if (!filename || !productId) {
      return NextResponse.json({ error: "Missing filename or productId" }, { status: 400 })
    }

    // Verify user owns this product
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, creator_id, creators!inner(user_id)")
      .eq("id", productId)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Check if user owns this product
    const creator = product.creators as { user_id: string }
    if (creator.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized - you don't own this product" }, { status: 403 })
    }

    // Generate unique path
    const timestamp = Date.now()
    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_")
    const filePath = `${user.id}/${productId}/${timestamp}_${safeName}`

    // Ensure bucket exists and has proper config
    const { data: buckets } = await adminSupabase.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME)

    if (!bucketExists) {
      // Create bucket - private for digital products
      const { error: createError } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        fileSizeLimit: 1073741824, // 1GB
      })

      if (createError) {
        console.error("Error creating bucket:", createError)
      }
    }

    // Create a signed upload URL (valid for 1 hour)
    const { data: signedData, error: signedError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath)

    if (signedError) {
      console.error("Error creating signed URL:", signedError)
      return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: signedData.path,
      filePath: filePath, // The path to store in database
    })
  } catch (error) {
    console.error("Upload file error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
