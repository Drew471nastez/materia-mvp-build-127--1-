import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { creatorPagePage } from "@/lib/team/creator-page"
import { CreatorPageWorkspace } from "@/components/app/creator-page-workspace"

export const metadata: Metadata = { title: "Creator page - Storelib" }
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE CREATOR PAGE, EDITED WHERE IT LIVES
 * ===========================================================================
 * The old editor was a builder: a full-screen shell with its own top bar, its
 * own sidebar of sections, and a canvas that DREW AN APPROXIMATION of the
 * page. Two problems with that, and the second is the expensive one.
 *
 * It threw away the app. Opening it meant losing the sidebar, so "customise my
 * page" was a trip out of the product and back, and every other thing a
 * creator might do next was two navigations away.
 *
 * And an approximation is a second implementation. The page already knows how
 * to render itself, and it already knows how to show its owner the controls
 * for editing it in place — the pencil, the profile dialog, the About editor,
 * the owner menu. All of that exists and is what a visitor's browser runs. A
 * canvas that redraws it is a copy that drifts, and the drift is invisible
 * until a creator publishes something that does not look like what they
 * arranged.
 *
 * So this renders THE PAGE ITSELF, signed in, inside the app shell. What a
 * creator edits is not a preview of their page. It is their page.
 *
 * ITS OWN SCREEN. This has moved four times, on the owner's instruction each
 * time, and it is their product. Being a route OUTSIDE /app is the whole of
 * how it gets the screen: the layout beside this file gates on the session
 * and renders the children bare, with no sidebar and no app header. The way
 * back is the arrow in the bar.
 *
 * The grid still holds three columns from `md` rather than `lg`. That was
 * added for the sidebar and it is right without one too: a card at 768/3 is
 * about 230px, wider than the phone layout all of these are designed at, and
 * a laptop window that is not maximised is the same situation.
 */
export default async function CreatorPageWorkspaceRoute() {
  /* Round 42: the owner's own page, or the store's for a team member with Creator page (lib/team/creator-page); the layout has already said no to anyone else. */
  const page = await creatorPagePage()
  if (page.kind === "signed_out" || page.kind === "closed") return null
  if (page.kind === "none") redirect("/onboarding")
  const supabase = page.db

  const [{ data: creator }, { data: profile }] = await Promise.all([
    supabase.from("creators").select("id, slug, store_published").eq("id", page.creatorId).single(),
    supabase.from("profiles").select("username, display_name").eq("id", page.profileId).single(),
  ])

  if (!creator) redirect("/onboarding")

  /**
   * The handle the public page is addressed by. `profiles.username` is what a
   * visitor types; the creator slug is the fallback for an account that
   * predates usernames, which is the same order the sidebar uses.
   */
  const handle = profile?.username || creator.slug

  return (
    <CreatorPageWorkspace
      handle={handle}
      displayName={profile?.display_name || handle}
      published={!!creator.store_published}
    />
  )
}
