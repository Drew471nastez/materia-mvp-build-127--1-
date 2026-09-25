import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import type { OnePage } from "@/lib/onepage/types"
import { ensureOnePage } from "@/lib/onepage/ensure-onepage"
import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { title: "OnePage" }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", user.id)
      .single()

    const displayName = profile?.display_name || profile?.username || "OnePage"
    return { title: displayName }
  } catch {
    return { title: "OnePage" }
  }
}

export default async function OnePageEditorPage() {
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  // Get creator info including social links from onboarding
  const { data: creator, error: creatorError } = await supabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    console.error("[OnePage] Creator fetch error:", creatorError)
    redirect("/onboarding")
  }

  // Extract social data from creator (may be null if columns don't exist)
  const creatorSocials = {
    instagram: (creator as any).instagram || null,
    tiktok: (creator as any).tiktok || null,
    youtube: (creator as any).youtube || null,
  }

  // Try to get existing onepage with proper error handling
  let { data: onepage, error: fetchError } = await supabase
    .from("onepages")
    .select("*")
    .eq("owner_id", user.id)
    .single()

  // If we got an actual error (not just "no rows found"), log it but continue to try creating
  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("Error fetching onepage (will attempt to create):", fetchError)
  }

  /**
   * ONE DEFINITION OF WHAT A NEW ONEPAGE IS, HERE TOO.
   *
   * This screen carried its own ~370 line copy of the new-page defaults (a
   * theme, six blocks, a published snapshot, its own slug loop and retries)
   * next to lib/onepage/ensure-onepage.ts, which the API and onboarding use.
   * Two copies had already drifted: this one wrote no seller_id. It calls
   * the same function now. The social links it used to fold in at creation
   * are brought in by the sync just below, which already did the same for
   * an existing page with none; for a page made on this visit the sync also
   * writes them to the published copy, as the old creation did.
   */
  let createdNow = false
  if (!onepage) {
    onepage = (await ensureOnePage(supabase, user.id, creator)) as typeof onepage
    createdNow = !!onepage
  }

  // If onepage exists but has no social data, try to sync from creators table or store_builder_configs
  const rawOnepage = onepage as any
  if (onepage && !rawOnepage.instagram && !rawOnepage.tiktok && !rawOnepage.youtube) {
    // First check creators table (from main onboarding)
    if (creatorSocials.instagram || creatorSocials.tiktok || creatorSocials.youtube) {
      // Sync social data from creators table to onepage
      await supabase
        .from("onepages")
        .update({
          instagram: creatorSocials.instagram,
          tiktok: creatorSocials.tiktok,
          youtube: creatorSocials.youtube,
          social_links: {
            ...onepage.social_links,
            instagram: creatorSocials.instagram,
            tiktok: creatorSocials.tiktok,
            youtube: creatorSocials.youtube,
          },
          ...(createdNow ? {
            published_social_links: {
              ...onepage.social_links,
              instagram: creatorSocials.instagram,
              tiktok: creatorSocials.tiktok,
              youtube: creatorSocials.youtube,
            },
          } : {}),
        })
        .eq("id", onepage.id)

      // Update the local onepage object with the synced data
      rawOnepage.instagram = creatorSocials.instagram
      rawOnepage.tiktok = creatorSocials.tiktok
      rawOnepage.youtube = creatorSocials.youtube
      onepage.social_links = {
        ...onepage.social_links,
        instagram: creatorSocials.instagram,
        tiktok: creatorSocials.tiktok,
        youtube: creatorSocials.youtube,
      }
    } else {
      // Fallback: Check if store_builder_configs has social data we can use
      const { data: storeConfig } = await supabase
        .from("store_builder_configs")
        .select("draft_config")
        .eq("creator_id", creator.id)
        .eq("page_type", "shop")
        .maybeSingle()

      if (storeConfig?.draft_config?.sections) {
        const headerSection = storeConfig.draft_config.sections.find((s: any) => s.type === "header")
        if (headerSection?.settings?.socialLinks) {
          const sl = headerSection.settings.socialLinks
          const hasData = sl.instagram?.url || sl.tiktok?.url || sl.youtube?.url

          if (hasData) {
            // Sync social data from store builder to onepage
            await supabase
              .from("onepages")
              .update({
                instagram: sl.instagram?.url || null,
                tiktok: sl.tiktok?.url || null,
                youtube: sl.youtube?.url || null,
                social_links: {
                  ...onepage.social_links,
                  instagram: sl.instagram?.url || null,
                  tiktok: sl.tiktok?.url || null,
                  youtube: sl.youtube?.url || null,
                },
                ...(createdNow ? {
                  published_social_links: {
                    ...onepage.social_links,
                    instagram: sl.instagram?.url || null,
                    tiktok: sl.tiktok?.url || null,
                    youtube: sl.youtube?.url || null,
                  },
                } : {}),
              })
              .eq("id", onepage.id)

            // Update the local onepage object with the synced data
            rawOnepage.instagram = sl.instagram?.url || null
            rawOnepage.tiktok = sl.tiktok?.url || null
            rawOnepage.youtube = sl.youtube?.url || null
            onepage.social_links = {
              ...onepage.social_links,
              instagram: sl.instagram?.url || null,
              tiktok: sl.tiktok?.url || null,
              youtube: sl.youtube?.url || null,
            }
          }
        }
      }
    }
  }

  // Final safety check - if we still don't have an onepage, something went wrong
  // This should rarely happen with all the retry logic above
  if (!onepage) {
    console.error("Failed to get or create onepage - this should not happen")
    // Instead of redirecting to /app, try to render with a minimal state
    // The editor should handle null gracefully
  }

  return <OnePageEditor initialOnePage={onepage as OnePage} />
}
