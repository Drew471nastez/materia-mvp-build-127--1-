import { profileAvatar } from "@/lib/account/avatar"
import { NextResponse, after } from "next/server"
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
import { withSafeLinkValues, withSafeUrls } from "@/lib/onepage/safe-urls"
import { openLocked, sealLocked } from "@/lib/onepage/locked-seal"
import { ownerStoreId } from "@/lib/onepage/page-store"
import { onePageEditVersion, sentBaseVersion } from "@/lib/onepage/edit-version"
import { removedSince, withoutProducts, withoutRemovalsKey } from "@/lib/onepage/product-removals"
import { productIdsInBlocks } from "@/lib/onepage/live-products"
import { claimOldAddress, rememberOldAddress } from "@/lib/onepage/old-addresses"
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

    const { data: profile, error: photoError } = await db.from("profiles").select("avatar_url").eq("id", ownerId).maybeSingle()
    if (photoError) return NextResponse.json({ error: "Your profile could not be read. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } })
    /* The page's own editor sees its paid blocks' locked parts opened (lib/onepage/locked-seal); the version is the stored copy's. */
    return NextResponse.json({ onepage: { ...onepage, draft_blocks: openLocked(onepage.draft_blocks), archived_blocks: openLocked((onepage as { archived_blocks?: unknown }).archived_blocks), avatar_url: profileAvatar(profile?.avatar_url), edit_version: onePageEditVersion(onepage) } }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("OnePage GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** PostgREST's "no such column" (PGRST204), or Postgres's own (42703), for this column. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/*
  THE PRODUCTS A SAVE NAMES THAT NO LONGER EXIST. A deleted product's blocks
  are taken off the page on the server (lib/products/forget-product); an
  editor that was open still holds them, and its save must not put them
  back. Asked of the products table by id alone, with the service key, so a
  team member's session reads the same answer. Fail open: a read that does
  not answer takes nothing out.
*/
async function goneProducts(blocks: unknown[]): Promise<string[]> {
  const ids = [...new Set(blocks.flatMap((list) => productIdsInBlocks(list)))].filter((id) => UUID.test(id))
  if (ids.length === 0) return []
  try {
    const { data, error } = await createAdminClient().from("products").select("id").in("id", ids)
    if (error || !Array.isArray(data)) return []
    const found = new Set((data as Array<{ id?: unknown }>).map((r) => String(r.id ?? "").toLowerCase()))
    return ids.filter((id) => !found.has(id.toLowerCase()))
  } catch {
    return []
  }
}

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
      base_version,
      social_links_patch,
      publish,
    } = body
    /* Save and publish in one write (the editor's Save): see the end of this route. */
    const publishing = publish === true

    /* The picture a shared link shows: one of three (lib/onepage/seo). Null is the same as not sent. */
    if (share_image_mode !== undefined && share_image_mode !== null && !isShareImageMode(share_image_mode)) {
      return refuse("That share image choice does not exist")
    }

    // Get existing record with current settings (and, for a publish, what the live copy is built from where the save does not change it)
    const { data: existing } = await db
      .from("onepages")
      .select(publishing ? "id, slug, settings, seller_id, creator_id, title, bio, theme, social_links, avatar_video_url, draft_blocks, published_social_links" : "id, slug, settings, seller_id, creator_id")
      .eq("id", id)
      .eq("owner_id", ownerId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    /*
      A SAVE FROM AN EDITOR THAT STARTED FROM AN OLDER COPY (round AU). The
      editor says which copy of the blocks, archive, look and bio it began
      from (lib/onepage/edit-version). When the row no longer holds that copy,
      the page was saved from somewhere else meanwhile (a second tab, the app
      on a phone left open since yesterday), and writing now would put the
      older blocks back over the newer ones. Nothing is written; the editor
      says so and keeps its work, and a second Save there sends no base.
      Asked only of the row already found by id and owner above, so it never
      widens what a caller can reach. A read that fails is not a conflict.
    */
    const base = sentBaseVersion(base_version)
    /*
      AND THE CHECK HOLDS UNTIL THE WRITE (round AV). The read above and the
      write below were two steps: a phone and a computer saving within the
      same moment could both pass the check against the same row, and the
      second write replaced the first without a word. So the row's
      updated_at, read with the check, is a condition of the write: the
      write lands only on the row the check saw, and moves updated_at on, so
      the other save finds nothing to write and is answered the same 409.
    */
    let checkedAt: string | null = null
    const conflictAnswer = () =>
      NextResponse.json(
        { error: "This page was saved somewhere else since you opened it", conflict: true },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      )
    /* Products the server took off the page since this editor's base (lib/onepage/product-removals): taken out of what it sends too. */
    let removedProducts: string[] = []
    if (base && draft_blocks !== undefined) {
      let read = await db
        .from("onepages")
        .select("draft_blocks, archived_blocks, theme, bio, settings, updated_at")
        .eq("id", id)
        .eq("owner_id", ownerId)
        .maybeSingle()
      /* A database without onepages.updated_at: the check as it was, without the hold. */
      if (read.error && missingColumn(read.error, "updated_at")) {
        read = await db.from("onepages").select("draft_blocks, archived_blocks, theme, bio, settings").eq("id", id).eq("owner_id", ownerId).maybeSingle()
      }
      const { data: current, error: currentError } = read
      /*
        A PRODUCT DELETED WHILE THIS EDITOR WAS OPEN IS NOT A CONFLICT. Its
        blocks were taken off on the server, which moved the version; when
        nothing but such removals lies between the base and the row, the save
        goes ahead without those products. Anything else is a conflict.
      */
      if (!currentError && current) {
        const since = removedSince((current as { settings?: unknown }).settings, base, onePageEditVersion(current))
        if (since === null) return conflictAnswer()
        removedProducts = since
      }
      const at = (current as { updated_at?: unknown } | null)?.updated_at
      if (!currentError && typeof at === "string" && at) checkedAt = at
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
      const { data: profile, error: photoError } = await db.from("profiles").select("avatar_url").eq("id", ownerId).maybeSingle()
      if (photoError) return NextResponse.json({ error: "Your profile could not be read. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } })
      photoNow = typeof profile?.avatar_url === "string" && profile.avatar_url.trim() !== "" ? profile.avatar_url.trim() : null
      updates.avatar_url = photoNow
    }
    if (avatar_video_url !== undefined) updates.avatar_video_url = avatar_video_url
    if (theme !== undefined) updates.theme = theme
    /* No address saved on a page can run script (lib/onepage/safe-urls): blocks, the archive and the social links. */
    if (social_links !== undefined) updates.social_links = withSafeLinkValues(social_links)
    /*
      ONLY THE LINKS THIS EDITOR CHANGED (the OnePage production audit, S1).
      The editor used to send its whole copy of the social links on every
      Save, and an editor open since before Instagram was changed on the
      creator page (lib/social/onepage-sync) put the old one back here and,
      through the publish's link sync, back on the creator page too. It sends
      the platforms it changed now, merged over the row's own: "" clears one.
    */
    if (social_links_patch && typeof social_links_patch === "object" && !Array.isArray(social_links_patch)) {
      const patch: Record<string, string> = {}
      for (const [platform, value] of Object.entries(social_links_patch as Record<string, unknown>)) {
        if (platform.length <= 40 && (typeof value === "string" || value === null)) patch[platform] = typeof value === "string" ? value.slice(0, 500) : ""
      }
      const base = (updates.social_links ?? (existing as { social_links?: unknown }).social_links ?? {}) as Record<string, unknown>
      updates.social_links = withSafeLinkValues({ ...(base && typeof base === "object" ? base : {}), ...patch }) as typeof updates.social_links
    }
    /* What the live page reads for a shelf or a posts row is never kept in the draft (lib/onepage/storelib-blocks stripResolved). */
    /* And a paid block's locked part is sealed before it is stored (lib/onepage/locked-seal): the table's rows can be read with the public key. */
    /*
      AND A DELETED PRODUCT NEVER COMES BACK. The products removed since the
      base, and any the blocks name that no longer exist (a second Save after
      a conflict sends no base), are taken out of the blocks and the archive
      before they are written. The answer names them, so the editor drops
      them from its own copy.
    */
    if (draft_blocks !== undefined || archived_blocks !== undefined) {
      const gone = await goneProducts([draft_blocks, archived_blocks].filter((x) => Array.isArray(x)) as unknown[])
      removedProducts = [...new Set([...removedProducts, ...gone])]
    }
    if (draft_blocks !== undefined) updates.draft_blocks = sealLocked(withSafeUrls(stripResolved(withoutProducts(draft_blocks, removedProducts))))
    if (nextSlug !== undefined) updates.slug = nextSlug
    if (archived_blocks !== undefined) (updates as any).archived_blocks = sealLocked(withSafeUrls(withoutProducts(archived_blocks, removedProducts)))
    if (isShareImageMode(share_image_mode)) updates.share_image_mode = share_image_mode
    
    // PROPERLY MERGE SETTINGS - don't overwrite, merge with existing
    if (settings !== undefined || avatar_video_crop !== undefined) {
      const existingSettings = (existing.settings as any) || {}
      /* Every setting checked (lib/onepage/settings-rules); one that cannot be made right refuses the save with the reason. */
      /* The product removals are the server's own note (lib/onepage/product-removals): an editor's copy never replaces them. */
      const checked = settings === undefined || settings === null ? { ok: true as const, value: {} as Record<string, any> } : checkSettingsPatch(withoutRemovalsKey(settings), existingSettings)
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
        if (plan === "free") return refuse("The verified badge and hiding the Storelib badge are part of Grow")
      }

      updates.settings = {
        ...existingSettings,
        ...newSettings,
        /*
          The profile video's crop: the settings' own value when the save carries
          one (the editor writes it there), else a top-level one from an older
          caller, else what was kept. A top-level null used to win over the
          settings' crop, so a row with that column lost its crop on every Save.
        */
        avatar_video_crop: newSettings.avatar_video_crop !== undefined
          ? newSettings.avatar_video_crop
          : (avatar_video_crop !== undefined
              ? avatar_video_crop
              : existingSettings.avatar_video_crop || null)
      }
    }

    /*
      THE ROW NAMES ITS OWNER'S STORE (the OnePage production audit, SEC1 and
      SEC7). It was filled only when empty, so a row naming another store, or
      the account's user id (pages the old onboarding made), kept it. Public
      routes no longer trust these columns (lib/onepage/page-store); a save
      also puts them right, for anything else that reads them.
    */
    const ownStore = await ownerStoreId(db, ownerId)
    if (ownStore && (existing.seller_id !== ownStore || (existing as { creator_id?: string | null }).creator_id !== ownStore)) {
      updates.seller_id = ownStore
      updates.creator_id = ownStore
    }

    /*
      SAVE AND PUBLISH ARE ONE WRITE (the OnePage production audit, S2). The
      editor's Save was this PUT and then a second request to
      /api/onepage/publish: when the second one failed (the signal dropped,
      the app was sent away), the draft was saved, the live page was not, and
      the editor opened next time saying Saved with nothing to press, while
      visitors kept the old page until some later edit. With publish: true the
      live copy is written by this same update, inside the same check, from
      what this save wrote and, for what it did not send, from the row.
      /api/onepage/publish stays for older editors.
    */
    let liveLinksBefore: unknown = null
    let publishedAt: string | null = null
    if (publishing) {
      const row = existing as Record<string, any>
      if (photoNow === undefined) {
        const { data: profile, error: photoError } = await db.from("profiles").select("avatar_url").eq("id", ownerId).maybeSingle()
        if (photoError) return NextResponse.json({ error: "Your profile could not be read. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } })
        photoNow = typeof profile?.avatar_url === "string" && profile.avatar_url.trim() !== "" ? profile.avatar_url.trim() : null
        updates.avatar_url = photoNow
      }
      const finalSettings = (updates.settings ?? row.settings ?? {}) as Record<string, unknown>
      const finalLinks = withSafeLinkValues(((updates.social_links ?? row.social_links) || {}) as Record<string, unknown>)
      liveLinksBefore = row.published_social_links
      publishedAt = new Date().toISOString()
      Object.assign(updates as Record<string, unknown>, {
        status: "published",
        published_at: publishedAt,
        published_blocks: updates.draft_blocks ?? sealLocked(withSafeUrls(stripResolved(row.draft_blocks ?? []))),
        published_theme: updates.theme ?? row.theme,
        published_profile: {
          title: updates.title ?? row.title ?? "",
          bio: updates.bio ?? row.bio ?? "",
          avatar_url: photoNow,
          avatar_video_url: (updates.avatar_video_url !== undefined ? updates.avatar_video_url : row.avatar_video_url) || null,
          avatar_video_crop: finalSettings.avatar_video_crop || null,
        },
        published_social_links: finalLinks,
      })
    }

    const write = (row: typeof updates) => {
      const q = db.from("onepages").update(row).eq("id", id).eq("owner_id", ownerId)
      return (checkedAt ? q.eq("updated_at", checkedAt) : q).select().single()
    }
    if (checkedAt) {
      /* Moved on by this write, always to a later value than the one checked (two saves in one millisecond included). */
      const next = Math.max(Date.now(), Date.parse(checkedAt) + 1)
      updates.updated_at = new Date(next).toISOString()
    }
    let { data: updated, error } = await write(updates)
    /* The row moved between the check and the write: another save landed first. Nothing was written. */
    if (checkedAt && error && (error as { code?: string }).code === "PGRST116") return conflictAnswer()

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

    /*
      A NEW ADDRESS LEAVES THE OLD ONE LEADING HERE (lib/onepage/old-addresses,
      SQL part 472): storelib.me/{old} and the old links redirect to the new
      one. And the new address is this page's now, so any history that named
      it (this page's own, or another page's) is dropped. Written with the
      service key: the table is server only. Neither ever fails the save.
    */
    const savedSlug = (updated as { slug?: string | null } | null)?.slug ?? null
    if (updates.slug !== undefined && savedSlug && existing.slug && savedSlug.toLowerCase() !== String(existing.slug).toLowerCase()) {
      const admin = createAdminClient()
      await claimOldAddress(admin, savedSlug)
      await rememberOldAddress(admin, { oldSlug: String(existing.slug), onepageId: id, ownerId })
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
    if (publishing || updates.settings !== undefined || updates.slug !== undefined || updates.share_image_mode !== undefined || photoNow !== undefined) {
      await onePageChangedFor(ownerId, [existing.slug, (updated as { slug?: string | null } | null)?.slug])
    }

    if (publishing) {
      /*
        What a publish does after its write, as /api/onepage/publish does it:
        the platforms this publish changed against the copy that was live go
        to the creator page too (lib/social/onepage-sync), and the address goes
        to the search engines that take IndexNow, after the answer.
      */
      /* Loaded only by a save that publishes: a plain draft save never pays for the creator page's and the search engines' modules. */
      const [{ changedLinks, onePageLinks, syncOnePageLinksToCreatorPage }, { creatorPagesChanged }, { announce, onePageAddresses }] = await Promise.all([
        import("@/lib/social/onepage-sync"),
        import("@/lib/storefront/creator-page-purge"),
        import("@/lib/seo/announce"),
      ])
      if (liveLinksBefore && typeof liveLinksBefore === "object") {
        const changes = changedLinks(onePageLinks(liveLinksBefore), onePageLinks((updated as { published_social_links?: unknown } | null)?.published_social_links))
        if (Object.keys(changes).length > 0 && (await syncOnePageLinksToCreatorPage(db, ownerId, changes))) {
          await creatorPagesChanged({ userId: ownerId }).catch(() => {})
        }
      }
      const owner = ownerId
      after(() => announce(() => onePageAddresses(owner)))
    }

    /* The copy this save wrote, for the editor's next save to name as its base (also as a header, for an answer whose body is cut off). */
    const editVersion = onePageEditVersion(updated as Parameters<typeof onePageEditVersion>[0])
    return NextResponse.json(
      { onepage: updated, edit_version: editVersion, ...(publishedAt ? { published: true, published_at: publishedAt } : {}), ...(removedProducts.length > 0 ? { removed_products: removedProducts } : {}) },
      { headers: editVersion ? { "X-OnePage-Edit-Version": editVersion } : undefined },
    )
  } catch (error) {
    console.error("OnePage PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
