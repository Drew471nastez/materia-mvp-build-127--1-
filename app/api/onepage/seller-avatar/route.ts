import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { keptPhoto } from "@/lib/account/identity"

/**
 * The icon the OnePage sets in the browser once it has loaded, for a page
 * with no picture of its own. Through lib/account/identity, so a picture a
 * sign in provider sent that is still sitting in the creator page header
 * cannot come back as the icon after the person removed their photo: the
 * profile is the face.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sellerId = searchParams.get("seller_id")

  if (!sellerId) {
    return NextResponse.json({ avatar_url: null }, { status: 400 })
  }

  const supabase = await createClient()

  try {
    // First try to get the store builder config for favicon/avatar
    const { data: storeConfig } = await supabase
      .from("store_builder_configs")
      .select("published_config")
      .eq("creator_id", sellerId)
      .eq("page_type", "shop")
      .maybeSingle()

    // Check if store builder has a custom avatar/favicon
    const headerSettings = storeConfig?.published_config?.headerSettings as any
    const fromHeader = keptPhoto(headerSettings?.avatarUrl) || keptPhoto(headerSettings?.faviconUrl)
    if (fromHeader) {
      return NextResponse.json({ avatar_url: fromHeader })
    }

    // Fall back to creator profile avatar
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

      if (profile?.avatar_url) {
        return NextResponse.json({ avatar_url: profile.avatar_url })
      }

    }

    return NextResponse.json({ avatar_url: null })
  } catch (error) {
    console.error("Error fetching seller avatar:", error)
    return NextResponse.json({ avatar_url: null })
  }
}
