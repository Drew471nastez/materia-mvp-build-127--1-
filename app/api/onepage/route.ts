import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { OnePage } from "@/lib/onepage/types"
import { ensureOnePage } from "@/lib/onepage/ensure-onepage"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkPageSlug, checkProfileText, checkSettingsPatch } from "@/lib/onepage/settings-rules"

/* A plain sentence the editor shows as it is (lib/onepage/editor-state describeSaveFailure). */
const refuse = (error: string) => NextResponse.json({ error }, { status: 400 })
const TAKEN = "That page address is taken"

/** Whether the owner pays for a plan: Pro (sold as "growth") or the older Pro, in a state that still entitles. */
async function onPaidPlan(userId: string): Promise<boolean> {
  try {
    const { data } = await createAdminClient().from("creators").select("subscription_plan_id, subscription_status").eq("user_id", userId).maybeSingle()
    const row = data as { subscription_plan_id?: string | null; subscription_status?: string | null } | null
    const plan = (row?.subscription_plan_id || "free").toLowerCase().trim()
    const status = (row?.subscription_status || "active").toLowerCase()
    return (plan === "growth" || plan === "pro" || plan === "professional") && ["active", "trialing", "past_due"].includes(status)
  } catch {
    /* Unreadable is not a reason to refuse somebody who pays: the editor already asked. */
    return true
  }
}

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

    /*
      A NEW PAGE ADDRESS. It is served at storelib.com/<address>/links, where
      a slug is looked up before a username, so an address that is somebody
      else's username would put this page on their address. Checked with the
      service client: the owner's own client cannot see other people's pages
      under RLS, so the old check never found a clash. Only a change is
      checked, so a page made before these rules still saves.
    */
    let nextSlug: string | undefined
    if (slug !== undefined && slug !== existing.slug) {
      const verdict = checkPageSlug(slug)
      if (!verdict.ok) return refuse(verdict.error)
      nextSlug = verdict.value
      if (nextSlug !== existing.slug) {
        const admin = createAdminClient()
        const [{ data: pageTaken }, { data: nameTaken }] = await Promise.all([
          admin.from("onepages").select("id").eq("slug", nextSlug).neq("id", id).limit(1).maybeSingle(),
          admin.from("profiles").select("id").ilike("username", nextSlug).neq("id", user.id).limit(1).maybeSingle(),
        ])
        if (pageTaken || nameTaken) return refuse(TAKEN)
      }
    }

    const profileText = checkProfileText(title, bio)
    if (!profileText.ok) return refuse(profileText.error)

    const updates: Partial<OnePage> & { seller_id?: string; creator_id?: string } = {}
    
    if (profileText.value.title !== undefined) updates.title = profileText.value.title
    if (profileText.value.bio !== undefined) updates.bio = profileText.value.bio
    if (avatar_url !== undefined) updates.avatar_url = avatar_url
    if (avatar_video_url !== undefined) updates.avatar_video_url = avatar_video_url
    if (theme !== undefined) updates.theme = theme
    if (social_links !== undefined) updates.social_links = social_links
    if (draft_blocks !== undefined) updates.draft_blocks = draft_blocks
    if (nextSlug !== undefined) updates.slug = nextSlug
    if (archived_blocks !== undefined) (updates as any).archived_blocks = archived_blocks
    
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
      if (turnsOnPaid && !(await onPaidPlan(user.id))) {
        return refuse("The verified badge and hiding the Storelib badge are part of Pro")
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
      /* Two saves racing for one address: the unique index answers, and it is the same answer. */
      if ((error as { code?: string }).code === "23505") return refuse(TAKEN)
      console.error("Error updating onepage:", (error as { code?: string }).code ?? "unknown")
      return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }

    return NextResponse.json({ onepage: updated })
  } catch (error) {
    console.error("OnePage PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
