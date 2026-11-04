import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
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

    /* Two paths of the published header, read by the server (round 48, R48-6): never the draft, never the contact address, and no anon read of the table. */
    const { data: storeConfig } = await createAdminClient()
      .from("store_builder_configs")
      .select("avatar:published_config->headerSettings->>avatarUrl, favicon:published_config->headerSettings->>faviconUrl")
      .eq("creator_id", sellerId)
      .eq("page_type", "shop")
      .maybeSingle()

    const header = storeConfig as { avatar?: string | null; favicon?: string | null } | null
    const fromHeader = keptPhoto(header?.avatar) || keptPhoto(header?.favicon)
    if (fromHeader) {
      return NextResponse.json({ avatar_url: fromHeader })
    }

    return NextResponse.json({ avatar_url: null })
  } catch (error) {
    console.error("Error fetching seller avatar:", error)
    return NextResponse.json({ avatar_url: null })
  }
}
