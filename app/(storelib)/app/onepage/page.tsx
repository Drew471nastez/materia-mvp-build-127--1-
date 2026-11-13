import { profileAvatar } from "@/lib/account/avatar"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import type { OnePage } from "@/lib/onepage/types"
import { ensureOnePage } from "@/lib/onepage/ensure-onepage"
/* Which copy of the blocks the editor starts from, so a save from a stale editor is caught (lib/onepage/edit-version). */
import { onePageEditVersion } from "@/lib/onepage/edit-version"
import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { readTwice, within } from "@/lib/onepage/bounded-read"
import { teamPageStore } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { creatorPageHostFromRows } from "@/lib/custom-domains/client"
import type { OnePageTeam } from "@/lib/onepage/team-context"

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
    A TEAM MEMBER WITH ONEPAGE edits the store owner's page (lib/team/onepage).
    Read here with the service role, by the owner's account and nothing else,
    and handed to the editor with what it would otherwise ask the signed in
    account for (lib/onepage/team-context). The owner never enters this branch:
    teamPageStore answers them from the reads the layout already made.
  */
  const access = await teamPageStore("onepage")
  if (access.kind === "denied") return <TeamAreaClosed area="onepage" store={access.acting.name} permissions={access.acting.permissions} />
  if (access.kind === "store" && !access.isOwner && access.acting) {
    return teamOnePage({ creatorId: access.creatorId, ownerUserId: access.acting.ownerUserId, store: access.acting.name })
  }

  /*
    EVERY WAIT HAS AN END. The creator row, page and canonical profile photo
    are read together. The creator and page were previously asked one
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
  const [creatorRead, pageRead, profileRead] = await Promise.all([
    readTwice((signal) =>
      createAdminClient().from("creators").select("*").eq("user_id", user.id).abortSignal(signal).maybeSingle(),
    ),
    readTwice((signal) =>
      supabase.from("onepages").select("*").eq("owner_id", user.id).abortSignal(signal).maybeSingle(),
    ),
    readTwice<{ avatar_url: string | null }>((signal) => supabase.from("profiles").select("avatar_url").eq("id", user.id).abortSignal(signal).maybeSingle()),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creator = creatorRead.data as any
  const creatorError = creatorRead.error
  /*
    A SLOW CREATOR ROW DOES NOT KEEP SOMEBODY FROM THEIR OWN PAGE. Once the
    page itself has come back, the creator row is only where its social
    links might be copied from, so a creator read that failed twice
    ("READ_TIMEOUT no answer in 1492ms" in production, while the page's own
    read answered) opens the editor without that copy, which is tried again
    on the next open. Without the page the row is needed to make one, so
    that is still an error with a Try again.
  */
  if (creatorError) {
    console.error("[OnePage] Creator fetch error:", creatorError)
    if (!pageRead.data) throw new Error("The creator could not be read")
  } else if (!creator) redirect("/onboarding")

  // Extract social data from creator (may be null if columns don't exist)
  const creatorSocials = {
    instagram: (creator as any)?.instagram || null,
    tiktok: (creator as any)?.tiktok || null,
    youtube: (creator as any)?.youtube || null,
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
  if (onepage && creator && !rawOnepage.instagram && !rawOnepage.tiktok && !rawOnepage.youtube) {
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

  if (profileRead.error) throw new Error("The profile could not be read")
  return <OnePageEditor initialOnePage={{ ...onepage, avatar_url: profileAvatar(profileRead.data?.avatar_url), edit_version: onePageEditVersion(onepage) } as OnePage} />
}

/** The plan a creators row is on, as the editor names it: Pro ("growth", or the older "pro") while it still entitles, else free. */
function editorPlan(row: { subscription_plan_id?: string | null; subscription_status?: string | null } | null): OnePageTeam["plan"] {
  const plan = (row?.subscription_plan_id || "free").toLowerCase().trim()
  const status = (row?.subscription_status || "active").toLowerCase()
  if (!["active", "trialing", "past_due"].includes(status)) return "free"
  return plan === "growth" ? "growth" : plan === "pro" || plan === "professional" ? "pro" : "free"
}

/** The store owner's OnePage, for a team member with the OnePage permission. Made for the owner if they have none yet, as their own first visit would. */
async function teamOnePage({ creatorId, ownerUserId, store }: { creatorId: string; ownerUserId: string | null; store: string }) {
  if (!ownerUserId) throw new Error("This store has no owner account")
  const admin = createAdminClient()
  const [creatorRead, pageRead, domainsRead, ownerRead] = await Promise.all([
    readTwice((signal) => admin.from("creators").select("*").eq("id", creatorId).eq("user_id", ownerUserId).abortSignal(signal).maybeSingle()),
    readTwice((signal) => admin.from("onepages").select("*").eq("owner_id", ownerUserId).abortSignal(signal).maybeSingle()),
    within((signal) => admin.from("custom_domains").select("*").eq("creator_id", creatorId).abortSignal(signal), STORE_SOCIALS_MS),
    /* The owner's name and photo for the preview (round 41), read here with the page rather than from the member's browser. */
    within((signal) => admin.from("profiles").select("display_name, avatar_url").eq("id", ownerUserId).abortSignal(signal).maybeSingle(), STORE_SOCIALS_MS),
  ])
  const ownerRow = (ownerRead.data as { display_name?: string | null; avatar_url?: string | null } | null) ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creator = creatorRead.data as any
  if (creatorRead.error || pageRead.error || ownerRead.error) throw new Error("The OnePage could not be read")
  if (!creator) throw new Error("This store isn't on Storelib any more")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onepage = pageRead.data as any
  if (!onepage) {
    const made = await within(async () => ({ data: await ensureOnePage(admin, ownerUserId, creator), error: null }), MAKE_PAGE_MS)
    onepage = made.data
  }
  if (!onepage) throw new Error("The OnePage could not be made")
  const team: OnePageTeam = {
    store,
    creatorId,
    ownerUserId,
    plan: editorPlan(creator),
    domain: creatorPageHostFromRows((domainsRead.data as { domain?: string | null; status?: string | null; purpose?: string | null; is_primary?: boolean | null }[] | null) ?? null),
    ownerName: ownerRow?.display_name ?? null,
    ownerAvatar: profileAvatar(ownerRow?.avatar_url),
  }
  return <OnePageEditor initialOnePage={{ ...onepage, avatar_url: profileAvatar(ownerRow?.avatar_url), edit_version: onePageEditVersion(onepage) } as OnePage} team={team} />
}
