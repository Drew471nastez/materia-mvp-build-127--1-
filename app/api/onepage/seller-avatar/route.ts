import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { keptPhoto } from "@/lib/account/identity"

/**
 * The icon the OnePage sets in the browser once it has loaded, for a page
 * with no picture of its own.
 *
 * THE PROFILE IS THE FACE (lib/account/identity), so it is read first. This
 * used to start from the creator page header and only fall back to the
 * profile, which meant the tab's icon could be a third photo again: the one
 * an editor had written into that header. The header's own copy still
 * answers for a profile with no photo, and the page's favicon, which is a
 * site icon and not a face, still wins over neither.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sellerId = searchParams.get("seller_id")

  if (!sellerId) {
    return NextResponse.json({ avatar_url: null }, { status: 400 })
  }

  const supabase = await createClient()

  try {
    const { data: creator } = await supabase
      .from("creators")
      .select("user_id")
      .eq("id", sellerId)
      .single()

    if (creator?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", creator.user_id)
        .single()

      const own = keptPhoto(profile?.avatar_url)
      if (own) {
        return NextResponse.json({ avatar_url: own })
      }
    }

    const { data: storeConfig } = await supabase
      .from("store_builder_configs")
      .select("published_config")
      .eq("creator_id", sellerId)
      .eq("page_type", "shop")
      .maybeSingle()

    const headerSettings = storeConfig?.published_config?.headerSettings as any
    const fromHeader = keptPhoto(headerSettings?.avatarUrl) || keptPhoto(headerSettings?.faviconUrl)
    if (fromHeader) {
      return NextResponse.json({ avatar_url: fromHeader })
    }

    return NextResponse.json({ avatar_url: null })
  } catch (error) {
    console.error("Error fetching seller avatar:", error)
    return NextResponse.json({ avatar_url: null })
  }
}
