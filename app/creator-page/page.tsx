import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { readCurrentUser } from "@/lib/auth/current-user"
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
 * AND IT IS FULL SCREEN, which is a reversal of where this started. Under
 * /app it inherited the sidebar and the header, and the page then had about
 * two thirds of a narrow window to render a full-width design in. The sidebar
 * was not worth that: somebody editing their page is editing their page, and
 * the thing being edited should have the screen. One back control replaces
 * the navigation, the same way the website builder does it.
 */
export default async function CreatorPageWorkspaceRoute() {
  const supabase = await createClient()
  const { user } = await readCurrentUser(supabase)
  if (!user) redirect("/login")

  const [{ data: creator }, { data: profile }] = await Promise.all([
    supabase.from("creators").select("id, slug, store_published").eq("user_id", user.id).single(),
    supabase.from("profiles").select("username, display_name").eq("id", user.id).single(),
  ])

  if (!creator) redirect("/onboarding")

  /**
   * The colour scheme is one stored word. The storefront resolves it through
   * lib/store-builder/defaults at render and paints every section from it,
   * which is why it can be a control up here rather than a trip into the
   * section editor.
   */
  const { data: storeConfig } = await supabase
    .from("store_builder_configs")
    .select("published_config, draft_config")
    .eq("creator_id", creator.id)
    .eq("page_type", "shop")
    .maybeSingle()

  const readPreset = (cfg: unknown) =>
    (cfg as { globalSettings?: { themePreset?: string } } | null)?.globalSettings?.themePreset
  const themePreset = readPreset(storeConfig?.published_config) || readPreset(storeConfig?.draft_config) || "default"

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
      themePreset={themePreset}
    />
  )
}
