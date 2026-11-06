import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { announce, onePageAddresses } from "@/lib/seo/announce"
import { onePageActor } from "@/lib/team/onepage"
import { onePageChangedFor } from "@/lib/onepage/public-cache"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { changedLinks, onePageLinks, syncOnePageLinksToCreatorPage } from "@/lib/social/onepage-sync"
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const caller = await routeUser()
    if (caller.kind === "unavailable") return authUnavailableResponse()
    const user = caller.kind === "user" ? caller.user : null
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    /* Whose page (lib/team/onepage): the owner's, through their own client as before, or for a team member with OnePage the store owner's. */
    const actor = await onePageActor(supabase, user.id)
    if (actor instanceof NextResponse) return actor
    const db = actor.db
    const ownerId = actor.pageOwnerId

    const body = await request.json()
    const {
      id,
      // Accept direct data to avoid race conditions
      draft_blocks,
      theme,
      title,
      bio,
      avatar_video_url,
      avatar_video_crop,
      social_links,
    } = body

    // Verify ownership
    const { data: onepage, error: fetchError } = await db
      .from("onepages")
      .select("id, owner_id, published_social_links")
      .eq("id", id)
      .eq("owner_id", ownerId)
      .single()

    if (fetchError || !onepage) {
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    const now = new Date().toISOString()

    /*
      THE PHOTO IN THE PUBLISHED COPY IS THE PROFILE'S. There is one photo
      (lib/account/identity), and the browser's copy of it can be as old as
      the tab: publishing used to freeze whatever it sent into
      `published_profile`, which is where the tab title's icon and the share
      card are built from, so the live page could show a face nobody had used
      for months. Read here, not taken from the request.
    */
    const { data: ownProfile, error: photoError } = await db.from("profiles").select("avatar_url").eq("id", ownerId).maybeSingle()
    if (photoError) return NextResponse.json({ error: "Your profile could not be read. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } })
    const photoNow = typeof ownProfile?.avatar_url === "string" && ownProfile.avatar_url.trim() !== "" ? ownProfile.avatar_url.trim() : null

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
          avatar_url: photoNow,
          avatar_video_url: avatar_video_url || null,
          avatar_video_crop: avatar_video_crop || null,
        },
        published_social_links: social_links || {},
        avatar_url: photoNow,
      } as any
    } else {
      // Legacy: fetch from database
      const { data: fullOnepage, error: fullFetchError } = await db
        .from("onepages")
        .select("*")
        .eq("id", id)
        .eq("owner_id", ownerId)
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
          avatar_url: photoNow,
          avatar_video_url: fullOnepage.avatar_video_url,
          avatar_video_crop: fullOnepage.settings?.avatar_video_crop || null,
        },
        published_social_links: fullOnepage.social_links,
        avatar_url: photoNow,
      } as any
    }

    // Publish by updating published fields
    const { data: published, error: publishError } = await db
      .from("onepages")
      .update(publishData)
      .eq("id", id)
      .eq("owner_id", ownerId)
      .select()
      .single()

    if (publishError) {
      console.error("Publish error:", publishError)
      return NextResponse.json({ error: "Failed to publish" }, { status: 500 })
    }

    /*
      THE LIVE PAGE IS READ AFRESH, AND ONLY NOW. Every visitor's copy of the
      page is held (lib/onepage/public-cache); the publish above wrote the
      new copy in one update, so a publish that failed returned before this
      line and the page keeps showing the copy that was live. Expired at once
      under every name it answers to, so the creator who opens their page
      next sees what they just published.
    */
    await onePageChangedFor(ownerId, [(published as { slug?: string | null } | null)?.slug])

    /*
      THE SAME LINKS ON THE CREATOR PAGE (r51, lib/social/onepage-sync). Only
      the platforms this publish changed against the copy that was live, so a
      link the creator page changed since is never put back. A page with no
      live copy before has nothing to compare with and changes nothing there.
    */
    const liveBefore = (onepage as { published_social_links?: unknown }).published_social_links
    if (liveBefore && typeof liveBefore === "object") {
      const changes = changedLinks(onePageLinks(liveBefore), onePageLinks(publishData.published_social_links))
      if (Object.keys(changes).length > 0 && (await syncOnePageLinksToCreatorPage(db, ownerId, changes))) {
        await creatorPagesChanged({ userId: ownerId }).catch(() => {})
      }
    }

    /* After the answer: the page's address, to the search engines that take
       IndexNow (lib/seo/indexnow.ts). Never in the way of the publish. */
    const owner = ownerId
    after(() => announce(() => onePageAddresses(owner)))

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
