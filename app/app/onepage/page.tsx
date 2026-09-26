import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import type { OnePage } from "@/lib/onepage/types"
import { ensureOnePage } from "@/lib/onepage/ensure-onepage"
import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { SessionRecovery } from "@/components/auth/session-recovery"

export const dynamic = "force-dynamic"

/*
  THE TAB'S NAME, FROM THE ANSWERS THE LAYOUT ALREADY HAS. This made a
  client of its own and asked Supabase Auth who was signed in, a second
  round trip on every open of the editor, beside the one the layout and
  the page share (lib/auth/request-scope.ts). Now it reads the same cached
  answers, so opening the editor asks Auth once.
*/
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { user } = await currentUserForRequest()
    if (!user) return { title: "OnePage" }
    const profile = await profileForRequest(user.id)
    const displayName = profile?.display_name || profile?.username || "OnePage"
    return { title: displayName }
  } catch {
    return { title: "OnePage" }
  }
}

/** A read that failed for a reason other than the row not being there, asked once more before giving up. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Read = PromiseLike<{ data: any; error: { code?: string; message?: string } | null }>
async function readTwice(read: () => Read) {
  const first = await read()
  if (!first.error) return first
  return read()
}

export default async function OnePageEditorPage() {
  const supabase = await createClient()

  const user = await pageUser()
  /*
    Supabase did not answer in time. Not /login (lib/auth/page-user.ts),
    and not nothing: on a document load the layout's gate is holding the
    screen and this is never mounted, but on a press in the app the layout
    is not drawn again, and a page that rendered null here was an empty
    screen with nothing coming. SessionRecovery reads the session in the
    browser and reloads, which is what the layout's gate would have done.
  */
  if (!user) return <SessionRecovery />

  /*
    WHO THIS IS, AND A FAILED READ IS NOT "NOBODY". This sent anybody whose
    creator row did not come back to /onboarding, which is where a timeout
    or a dropped connection also went: /onboarding, then /signup/success,
    then Home. A press on OnePage that ended on Home, after two screens
    that said "Redirecting". Now only a creator who really has no row is
    sent to onboarding; a read that failed twice is an error, with its
    own Try again, on the editor's own address.
  */
  const { data: creator, error: creatorError } = await readTwice(() =>
    supabase.from("creators").select("*").eq("user_id", user.id).maybeSingle(),
  )
  if (creatorError) {
    console.error("[OnePage] Creator fetch error:", creatorError)
    throw new Error("The creator could not be read")
  }
  if (!creator) redirect("/onboarding")

  // Extract social data from creator (may be null if columns don't exist)
  const creatorSocials = {
    instagram: (creator as any).instagram || null,
    tiktok: (creator as any).tiktok || null,
    youtube: (creator as any).youtube || null,
  }

  /*
    THE PAGE, AND A FAILED READ IS NOT "NO PAGE" EITHER. A read that errored
    used to be logged and then treated as a creator with no OnePage, so a
    new one was made (or the making failed and the editor sat on a spinner
    for ever, below). A page that is there is read; one that is not is made;
    a read that failed twice is an error with a Try again, and nothing is
    made over somebody's page.
  */
  let { data: onepage, error: fetchError } = await readTwice(() =>
    supabase.from("onepages").select("*").eq("owner_id", user.id).maybeSingle(),
  )
  if (fetchError) {
    console.error("[OnePage] OnePage fetch error:", fetchError)
    throw new Error("The OnePage could not be read")
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

  /* Neither there nor made: an error with a Try again, not an editor that waits for ever on a page it will never get. */
  if (!onepage) {
    console.error("[OnePage] The OnePage could not be made")
    throw new Error("The OnePage could not be made")
  }

  return <OnePageEditor initialOnePage={onepage as OnePage} />
}
