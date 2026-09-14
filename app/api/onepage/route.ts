import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { OnePage } from "@/lib/onepage/types"
import { ensureOnePage } from "@/lib/onepage/ensure-onepage"

// GET - Fetch user's onepage (creates one if doesn't exist)
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator info
    const { data: creator } = await supabase
      .from("creators")
      .select("id, slug")
      .eq("user_id", user.id)
      .single()

    // Try to get existing onepage with proper error handling
    let { data: onepage, error: fetchError } = await supabase
      .from("onepages")
      .select("*")
      .eq("owner_id", user.id)
      .single()

    // Log actual errors (not "no rows found" which is expected for new users)
    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching onepage (will attempt to create):", fetchError)
    }

    /**
     * ONE DEFINITION OF WHAT A NEW ONEPAGE IS.
     *
     * This used to be ~250 lines inline: a theme, six blocks and a published
     * snapshot. Onboarding now creates one too, and two copies of "the
     * defaults" are two things to keep in step, so it lives in
     * lib/onepage/ensure-onepage.ts and both callers use it.
     */
    if (!onepage) {
      onepage = (await ensureOnePage(supabase, user.id, creator)) as typeof onepage
      if (!onepage) {
        return NextResponse.json({ error: "Failed to create onepage" }, { status: 500 })
      }
    } else if (!onepage.seller_id && creator?.id) {
      // Update existing onepage with seller_id if missing
      const { data: updated } = await supabase
        .from("onepages")
        .update({ seller_id: creator.id, creator_id: creator.id })
        .eq("id", onepage.id)
        .select()
        .single()

      if (updated) {
        onepage = updated
      }
    }

    return NextResponse.json({ onepage })
  } catch (error) {
    console.error("OnePage GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT - Update onepage draft
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      id,
      title,
      bio,
      avatar_url,
      avatar_video_url,
      avatar_video_crop,
      theme,
      settings,
      social_links,
      draft_blocks,
      slug,
      archived_blocks,
    } = body

    // Get existing record with current settings
    const { data: existing } = await supabase
      .from("onepages")
      .select("id, slug, settings, seller_id, creator_id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    // Check slug uniqueness if changed
    if (slug && slug !== existing.slug) {
      const { data: slugExists } = await supabase
        .from("onepages")
        .select("id")
        .eq("slug", slug)
        .neq("id", id)
        .single()

      if (slugExists) {
        return NextResponse.json({ error: "Slug already taken" }, { status: 400 })
      }
    }

    const updates: Partial<OnePage> & { seller_id?: string; creator_id?: string } = {}
    
    if (title !== undefined) updates.title = title
    if (bio !== undefined) updates.bio = bio
    if (avatar_url !== undefined) updates.avatar_url = avatar_url
    if (avatar_video_url !== undefined) updates.avatar_video_url = avatar_video_url
    if (theme !== undefined) updates.theme = theme
    if (social_links !== undefined) updates.social_links = social_links
    if (draft_blocks !== undefined) updates.draft_blocks = draft_blocks
    if (slug !== undefined) updates.slug = slug
    if (archived_blocks !== undefined) (updates as any).archived_blocks = archived_blocks
    
    // PROPERLY MERGE SETTINGS - don't overwrite, merge with existing
    if (settings !== undefined || avatar_video_crop !== undefined) {
      const existingSettings = (existing.settings as any) || {}
      const newSettings = settings || {}
      
      updates.settings = {
        ...existingSettings,
        ...newSettings,
        // Handle avatar_video_crop specially
        avatar_video_crop: avatar_video_crop !== undefined 
          ? avatar_video_crop 
          : (newSettings.avatar_video_crop !== undefined 
              ? newSettings.avatar_video_crop 
              : existingSettings.avatar_video_crop || null)
      }
    }

    // Ensure seller_id is set if missing
    if (!existing.seller_id) {
      const { data: creator } = await supabase
        .from("creators")
        .select("id")
        .eq("user_id", user.id)
        .single()

      if (creator) {
        updates.seller_id = creator.id
        updates.creator_id = creator.id
      }
    }

    const { data: updated, error } = await supabase
      .from("onepages")
      .update(updates)
      .eq("id", id)
      .eq("owner_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating onepage:", error)
      return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }

    return NextResponse.json({ onepage: updated })
  } catch (error) {
    console.error("OnePage PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
