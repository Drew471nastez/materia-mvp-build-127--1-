import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

// API to revalidate product pages after save
export async function POST(request: NextRequest) {
  try {
    const { slug, type, handle } = await request.json()

    if (type === "product" && slug) {
      /**
       * A PRODUCT HAS TWO ADDRESSES AND BOTH HOLD A CACHE.
       * `/<handle>/<slug>` is where everything links now; `/p/<slug>` still
       * resolves, and is what an old shared link lands on. Revalidating only
       * the second one left the address people actually use serving the copy
       * from before the save.
       */
      revalidatePath(`/p/${slug}`)
      if (typeof handle === "string" && handle.trim()) {
        revalidatePath(`/${handle.trim().toLowerCase()}/${slug}`)
      }
      return NextResponse.json({ revalidated: true, slug })
    }

    return NextResponse.json({ revalidated: false, error: "Missing slug or type" }, { status: 400 })
  } catch (error) {
    console.error("Revalidation error:", error)
    return NextResponse.json({ revalidated: false, error: "Failed to revalidate" }, { status: 500 })
  }
}
