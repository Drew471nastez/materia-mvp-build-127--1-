import { redirect } from "next/navigation"
import { after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import type { OnePage } from "@/lib/onepage/types"
import { ensureOnePage } from "@/lib/onepage/ensure-onepage"
import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { readTwice, within } from "@/lib/onepage/bounded-read"

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
    /* A name for the tab is never worth waiting on: past a second and a half the tab says OnePage. */
    const profile = await Promise.race([
      profileForRequest(user.id),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ])
    const displayName = profile?.display_name || profile?.username || "OnePage"
    return { title: displayName }
  } catch {
    return { title: "OnePage" }
  }
}

/** A new page is a few writes; they get this long before the page says it could not be made. */
const MAKE_PAGE_MS = 6000
/** The store builder's social links are a nicety for a page that has none: never waited on for long. */
const STORE_SOCIALS_MS = 1500

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
    EVERY WAIT HAS AN END, AND THE TWO READS GO TOGETHER. The creator row
    and the page both depend on nothing but the user, and were asked one
    after the other with no ceiling: a read that hung held the router's
    answer, the shell's spinner gave way at its cap, and the editor came
    whenever the read did, or never. Now they are asked at once, each try is
    cut off after 2.5s and a failed one is asked again only while 4s have
    room for it (lib/onepage/bounded-read.ts). What they decide is decided
    in the same order as before.

    WHO THIS IS, AND A FAILED READ IS NOT "NOBODY". This sent anybody whose
    creator row did not come back to /onboarding, which is where a timeout
    or a dropped connection also went: /onboarding, then /signup/success,
    then Home. A press on OnePage that ended on Home, after two screens
    that said "Redirecting". Now only a creator who really has no row is
    sent to onboarding; a read that failed twice is an error, with its
    own Try again, on the editor's own address.
  */
  const [creatorRead, pageRead] = await Promise.all([
    readTwice((signal) =>
      createAdminClient().from("creators").select("*").eq("user_id", user.id).abortSignal(signal).maybeSingle(),
    ),
    readTwice((signal) =>
      supabase.from("onepages").select("*").eq("owner_id", user.id).abortSignal(signal).maybeSingle(),
    ),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creator = creatorRead.data as any
  const creatorError = creatorRead.error
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onepage = pageRead.data as any
  const fetchError = pageRead.error
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
    const made = await within(
      async () => ({ data: await ensureOnePage(supabase, user.id, creator), error: null }),
      MAKE_PAGE_MS,
    )
    onepage = made.data as typeof onepage
    createdNow = !!onepage
  }

  /*
    THE SOCIAL LINKS ARE WRITTEN AFTER THE ANSWER, NOT BEFORE IT. The links
    a page with none is given (from the creator row, or the store builder's
    header) are put on the page this render hands the editor, as before, and
    the write that keeps them is sent now and finished after the response
    (next/server `after`), so the editor never waits on an UPDATE. A write
    that fails is tried again on the next open, as it always was.
  */
  const keep = (write: PromiseLike<unknown>) => {
    const sent = Promise.resolve(write).then(
      () => undefined,
      () => undefined,
    )
    try {
      after(sent)
    } catch {
      /* Outside a request (a test): the write still runs on its own. */
    }
  }

  // If onepage exists but has no social data, try to sync from creators table or store_builder_configs
  const rawOnepage = onepage as any
  if (onepage && !rawOnepage.instagram && !rawOnepage.tiktok && !rawOnepage.youtube) {
    // First check creators table (from main onboarding)
    if (creatorSocials.instagram || creatorSocials.tiktok || creatorSocials.youtube) {
      // Sync social data from creators table to onepage, finished after the response
      keep(supabase
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
        .eq("id", onepage.id))

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
      // Fallback: Check if store_builder_configs has social data we can use (a slow answer is no answer)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: storeConfig } = await within<any>(
        (signal) =>
          supabase
            .from("store_builder_configs")
            .select("draft_config")
            .eq("creator_id", creator.id)
            .eq("page_type", "shop")
            .abortSignal(signal)
            .maybeSingle(),
        STORE_SOCIALS_MS,
      )

      if (storeConfig?.draft_config?.sections) {
        const headerSection = storeConfig.draft_config.sections.find((s: any) => s.type === "header")
        if (headerSection?.settings?.socialLinks) {
          const sl = headerSection.settings.socialLinks
          const hasData = sl.instagram?.url || sl.tiktok?.url || sl.youtube?.url

          if (hasData) {
            // Sync social data from store builder to onepage, finished after the response
            keep(supabase
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
              .eq("id", onepage.id))

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
