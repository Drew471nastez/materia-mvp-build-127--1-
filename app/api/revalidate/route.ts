import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

// API to revalidate product pages after save
export async function POST(request: NextRequest) {
  try {
    const { slug, type } = await request.json()

    if (type === "product" && slug) {
      // Revalidate the specific product page
      revalidatePath(`/p/${slug}`)
      return NextResponse.json({ revalidated: true, slug })
    }

    return NextResponse.json({ revalidated: false, error: "Missing slug or type" }, { status: 400 })
  } catch (error) {
    console.error("Revalidation error:", error)
    return NextResponse.json({ revalidated: false, error: "Failed to revalidate" }, { status: 500 })
  }
}
