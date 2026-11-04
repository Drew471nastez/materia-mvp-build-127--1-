import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { OnePage } from "@/lib/onepage/types"
import { ensureOnePage } from "@/lib/onepage/ensure-onepage"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkPageSlug, checkProfileText, checkSettingsPatch } from "@/lib/onepage/settings-rules"
import { isShareImageMode } from "@/lib/onepage/seo"
import { followProfileIdentity, type FollowClient } from "@/lib/account/profile-follow"
import { onePageChangedFor } from "@/lib/onepage/public-cache"
import { onePageNameTaken } from "@/lib/onepage/name-availability"
import { onePageActor } from "@/lib/team/onepage"
import { stripResolved } from "@/lib/onepage/storelib-blocks"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

/* A plain sentence the editor shows as it is (lib/onepage/editor-state describeSaveFailure). */
const refuse = (error: string) => NextResponse.json({ error }, { status: 400 })
const TAKEN = "That page address is taken"

/**
 * Whether the owner pays for a plan: Pro (sold as "growth") or the older Pro,
 * in a state that still entitles. "unknown" when the plan could not be read:
 * a paid setting is then neither granted (a free page would get Pro for as
 * long as the read fails) nor refused as if unpaid (a paying creator would be
 * told to upgrade); the save says to try again.
 */
async function paidPlan(userId: string): Promise<"paid" | "free" | "unknown"> {
  try {
    const { data, error } = await createAdminClient().from("creators").select("subscription_plan_id, subscription_status").eq("user_id", userId).maybeSingle()
    if (error) return "unknown"
    const row = data as { subscription_plan_id?: string | null; subscription_status?: string | null } | null
    const plan = (row?.subscription_plan_id || "free").toLowerCase().trim()
    const status = (row?.subscription_status || "active").toLowerCase()
    return (plan === "growth" || plan === "pro" || plan === "professional") && ["active", "trialing", "past_due"].includes(status) ? "paid" : "free"
  } catch {
    return "unknown"
  }
}

// GET - Fetch user's onepage (creates one if doesn't exist)
export async function GET() {
  try {
    const supabase = await createClient()

    const who = await routeUser()
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    /* Whose page (lib/team/onepage): the owner's own, with their own client as before; a team member with OnePage, the store owner's. */
    const actor = await onePageActor(supabase, user.id)
    if (actor instanceof NextResponse) return actor
    const db = actor.db
    const ownerId = actor.pageOwnerId

    // Get creator info
    const { data: creator } = await db
      .from("creators")
      .select("id, slug")
      .eq("user_id", ownerId)
      .single()

    // Try to get existing onepage with proper error handling
    let { data: onepage, error: fetchError } = await db
      .from("onepages")
      .select("*")
      .eq("owner_id", ownerId)
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
      onepage = (await ensureOnePage(db, ownerId, creator)) as typeof onepage
      if (!onepage) {
        return NextResponse.json({ error: "Failed to create onepage" }, { status: 500 })
      }
    } else if (!onepage.seller_id && creator?.id) {
      // Update existing onepage with seller_id if missing
      const { data: updated } = await db
        .from("onepages")
        .update({ seller_id: creator.id, creator_id: creator.id })
        .eq("id", onepage.id)
        .eq("owner_id", ownerId)
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

/** PostgREST's "no such column" (PGRST204), or Postgres's own (42703), for this column. */
function missingColumn(error: { code?: string; message?: string }, column: string): boolean {
  return (error.code === "PGRST204" || error.code === "42703") && (error.message ?? "").includes(column)
}

// PUT - Update onepage draft
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()

    const who = await routeUser()
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    /* Whose page (lib/team/onepage). For the owner db is this same session client and ownerId their own id, so nothing below changes for them. */
    const actor = await onePageActor(supabase, user.id)
    if (actor instanceof NextResponse) return actor
    const db = actor.db
    const ownerId = actor.pageOwnerId

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") return refuse("The page could not be read")
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
      share_image_mode,
    } = body

    /* The picture a shared link shows: one of three (lib/onepage/seo). Null is the same as not sent. */
    if (share_image_mode !== undefined && share_image_mode !== null && !isShareImageMode(share_image_mode)) {
      return refuse("That share image choice does not exist")
    }

    // Get existing record with current settings
    const { data: existing } = await db
      .from("onepages")
      .select("id, slug, settings, seller_id, creator_id")
      .eq("id", id)
      .eq("owner_id", ownerId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    /*
      A NEW PAGE ADDRESS, storelib.me/<address>. A slug is looked up there
      before a username, so an address that is somebody else's username
      would put this page on their address, and one that differs from
      another page's only in case is the same address. The check is
      lib/onepage/name-availability, the one the editor's live check runs,
      so the field never says free for a name this refuses. Only a change is
      checked, so a page made before these rules still saves.
    */
    let nextSlug: string | undefined
    if (slug !== undefined && slug !== existing.slug) {
      const verdict = checkPageSlug(slug)
      if (!verdict.ok) return refuse(verdict.error)
      nextSlug = verdict.value
      if (nextSlug !== existing.slug) {
        const taken = await onePageNameTaken(nextSlug, { onepageId: id, userId: ownerId })
        if (taken === "unknown") return refuse("That page address could not be checked just now. Try again in a moment.")
        if (taken === "taken") return refuse(TAKEN)
      }
    }

    const profileText = checkProfileText(title, bio)
    if (!profileText.ok) return refuse(profileText.error)

    const updates: Partial<OnePage> & { seller_id?: string; creator_id?: string } = {}
    
    if (profileText.value.title !== undefined) updates.title = profileText.value.title
    if (profileText.value.bio !== undefined) updates.bio = profileText.value.bio
    /*
      THE PHOTO IS THE PROFILE'S, AND THIS ROUTE NEVER SETS IT. A photo saved
      from the OnePage editor used to land in this row and nowhere else, so
      the creator page kept one face, Settings a second and the OnePage a
      third (lib/account/identity). The editor's photo control saves the
      profile now, through app/api/account/avatar, exactly as Settings does;
      every copy follows from there (lib/account/profile-follow).

      A save that carries a photo is still answered, because every save sends
      the whole page: the row's copy is set to whatever the PROFILE holds at
      this moment, never to what the browser sent. An editor open in another
      tab since before the photo changed therefore cannot save the old one
      back over it, which is the shape the creator page bug had.
    */
    let photoNow: string | null | undefined
    if (avatar_url !== undefined) {
      const { data: profile } = await db.from("profiles").select("avatar_url").eq("id", ownerId).maybeSingle()
      photoNow = typeof profile?.avatar_url === "string" && profile.avatar_url.trim() !== "" ? profile.avatar_url.trim() : null
      updates.avatar_url = photoNow
    }
    if (avatar_video_url !== undefined) updates.avatar_video_url = avatar_video_url
    if (theme !== undefined) updates.theme = theme
    if (social_links !== undefined) updates.social_links = social_links
    /* What the live page reads for a shelf or a posts row is never kept in the draft (lib/onepage/storelib-blocks stripResolved). */
    if (draft_blocks !== undefined) updates.draft_blocks = stripResolved(draft_blocks)
    if (nextSlug !== undefined) updates.slug = nextSlug
    if (archived_blocks !== undefined) (updates as any).archived_blocks = archived_blocks
    if (isShareImageMode(share_image_mode)) updates.share_image_mode = share_image_mode
    
    // PROPERLY MERGE SETTINGS - don't overwrite, merge with existing
    if (settings !== undefined || avatar_video_crop !== undefined) {
      const existingSettings = (existing.settings as any) || {}
      /* Every setting checked (lib/onepage/settings-rules); one that cannot be made right refuses the save with the reason. */
      const checked = settings === undefined || settings === null ? { ok: true as const, value: {} as Record<string, any> } : checkSettingsPatch(settings, existingSettings)
      if (!checked.ok) return refuse(checked.error)
      const newSettings = checked.value as Record<string, any>

      /*
        THE TWO PAID SETTINGS ARE PAID HERE TOO. The editor asks before it
        saves them on a free plan, but only in its header; the Save in
        Settings and any other caller went straight past. Turning either on
        now asks the creator's plan, as the Stripe webhook and the billing
        page keep it (creators.subscription_plan_id and its status). Only a
        change is asked about, so a page that already has one still saves.
      */
      const turnsOnPaid =
        (newSettings.verified_badge_enabled === true && existingSettings.verified_badge_enabled !== true) ||
        (newSettings.show_branding === false && existingSettings.show_branding !== false)
      if (turnsOnPaid) {
        const plan = await paidPlan(ownerId)
        if (plan === "unknown") return refuse("Your plan could not be checked just now. Try again in a moment.")
        if (plan === "free") return refuse("The verified badge and hiding the Storelib badge are part of Pro")
      }

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
      const { data: creator } = await db
        .from("creators")
        .select("id")
        .eq("user_id", ownerId)
        .single()

      if (creator) {
        updates.seller_id = creator.id
        updates.creator_id = creator.id
      }
    }

    const write = (row: typeof updates) => db.from("onepages").update(row).eq("id", id).eq("owner_id", ownerId).select().single()
    let { data: updated, error } = await write(updates)

    /*
      A DATABASE WITHOUT onepages.share_image_mode YET (run-now part 57 adds
      it): the choice is kept in the page's settings instead, where
      lib/onepage/seo shareImageModeOf reads it, so choosing a picture works
      before the SQL runs. Once the column is there it is the one read.
    */
    if (error && updates.share_image_mode !== undefined && missingColumn(error, "share_image_mode")) {
      const { share_image_mode: mode, ...rest } = updates
      rest.settings = { ...((rest.settings ?? existing.settings ?? {}) as Record<string, unknown>), share_image_mode: mode } as typeof rest.settings
      ;({ data: updated, error } = await write(rest))
    }

    if (error) {
      /* Two saves racing for one address: the unique index answers, and it is the same answer. */
      if ((error as { code?: string }).code === "23505") return refuse(TAKEN)
      console.error("Error updating onepage:", (error as { code?: string }).code ?? "unknown")
      return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }

    /* The copy taken at the last publish takes the same photo, so the live
       page changes with the profile rather than at the next publish. */
    if (photoNow !== undefined) {
      await followProfileIdentity(db as unknown as FollowClient, ownerId, { photo: { after: photoNow } })
    }

    /*
      WHAT THE LIVE PAGE READS FROM THE ROW ITSELF, not from the copy taken at
      the last publish: its settings (search and share text, the badge), its
      address, its share picture and the photo. A save that changed one of
      them clears the held copy (lib/onepage/public-cache) under the old
      address and the new one; a save of the draft alone leaves the live page
      as it is, so an editor saving every second and a half costs visitors
      nothing.
    */
    if (updates.settings !== undefined || updates.slug !== undefined || updates.share_image_mode !== undefined || photoNow !== undefined) {
      await onePageChangedFor(ownerId, [existing.slug])
    }

    return NextResponse.json({ onepage: updated })
  } catch (error) {
    console.error("OnePage PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
