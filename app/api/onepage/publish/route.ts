import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
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
      // Accept direct data to avoid race conditions
      draft_blocks,
      theme,
      title,
      bio,
      avatar_url,
      avatar_video_url,
      avatar_video_crop,
      social_links,
    } = body

    // Verify ownership
    const { data: onepage, error: fetchError } = await supabase
      .from("onepages")
      .select("id, owner_id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single()

    if (fetchError || !onepage) {
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    const now = new Date().toISOString()

    // If direct data was provided, use it (prevents race conditions)
    // Otherwise fall back to fetching from database (legacy support)
    let publishData: {
      status: string
      published_at: string
      published_blocks: any
      published_theme: any
      published_profile: any
      published_social_links: any
    }

    if (draft_blocks && theme) {
      // Use provided data directly
      publishData = {
        status: "published",
        published_at: now,
        published_blocks: draft_blocks,
        published_theme: theme,
        published_profile: {
          title: title || "",
          bio: bio || "",
          avatar_url: avatar_url || null,
          avatar_video_url: avatar_video_url || null,
          avatar_video_crop: avatar_video_crop || null,
        },
        published_social_links: social_links || {},
      }
    } else {
      // Legacy: fetch from database
      const { data: fullOnepage, error: fullFetchError } = await supabase
        .from("onepages")
        .select("*")
        .eq("id", id)
        .eq("owner_id", user.id)
        .single()

      if (fullFetchError || !fullOnepage) {
        return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
      }

      publishData = {
        status: "published",
        published_at: now,
        published_blocks: fullOnepage.draft_blocks,
        published_theme: fullOnepage.theme,
        published_profile: {
          title: fullOnepage.title,
          bio: fullOnepage.bio,
          avatar_url: fullOnepage.avatar_url,
          avatar_video_url: fullOnepage.avatar_video_url,
          avatar_video_crop: fullOnepage.avatar_video_crop,
        },
        published_social_links: fullOnepage.social_links,
      }
    }

    // Publish by updating published fields
    const { data: published, error: publishError } = await supabase
      .from("onepages")
      .update(publishData)
      .eq("id", id)
      .eq("owner_id", user.id)
      .select()
      .single()

    if (publishError) {
      console.error("Publish error:", publishError)
      return NextResponse.json({ error: "Failed to publish" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      published_at: now,
      onepage: published,
    })
  } catch (error) {
    console.error("Publish error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
