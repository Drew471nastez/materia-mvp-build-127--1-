/**
 * ===========================================================================
 *  THE THREE ROWS A CREATOR PAGE STARTS FROM, FETCHED ONCE
 * ===========================================================================
 * `app/(marketing)/u/[username]/layout.tsx` ran three SEQUENTIAL queries —
 * profiles, then creators, then store_builder_configs — and did it for one
 * reason: to pick the colours of the loading skeleton.
 *
 * A layout is not inside the page's Suspense boundary. Nothing renders until
 * it resolves, the skeleton included. So pressing a creator's name bought
 * three round trips of a blank screen BEFORE the skeleton appeared, and then
 * the page below repeated all three for itself and did its own work on top.
 * That is what "it takes me to a page with a skeleton and sticks on it" is.
 *
 * Same answer as the product page, next door in product-page-data: React's
 * `cache()` dedupes within one request and `unstable_cache` shares across
 * requests. The layout's three queries cost nothing now — the page needs
 * those rows anyway, and whichever asks first pays.
 *
 * WHY NOT JUST DELETE THE LAYOUT'S QUERIES. Because the skeleton really does
 * need the creator's theme: on a dark scheme a light skeleton is a white
 * flash on every navigation. The lookup was not the mistake; paying for it
 * twice, in series, ahead of everything else was.
 */
import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import { readPublicRow } from "@/lib/security/public-rows"
import { publicProfileByName } from "@/lib/profile/profile-by-name"
import { createAdminClient } from "@/lib/supabase/admin"
import { cachedCreator, cachedCreatorProfile, cachedStoreConfig } from "./product-page-cache"

/**
 * `ilike`, not `eq`, because that is what the layout has always used and a
 * handle is not case-sensitive in a URL.
 *
 * The cross-request cache is deliberately NOT used here: usernames change,
 * and a stale username -> id mapping sends a visitor to somebody else's page.
 * Deduping within the request is the whole win anyway, since this is the
 * query the layout and the page each ran separately.
 */
export const loadProfileByUsername = cache(async (username: string) => {
  /* Every public column, never a private one (lib/security/public-rows); the exact name first, which the username index answers (lib/profile/profile-by-name.ts). */
  return publicProfileByName(await createClient(), username)
})

/** The creator row for a profile, shared with the product page's cache. */
export const loadCreatorForUser = cache(async (userId: string) => {
  return readPublicRow(await createClient(), "creators", (q) => q.eq("user_id", userId))
})

/**
 * The shop's published config. Goes through the shared cross-request cache,
 * so a second visitor to the same creator does not pay for it at all.
 *
 * It falls back to the per-request client when the cached read comes back
 * empty, for the reason product-page-cache spells out: the cached read has no
 * session, so a policy that needs one returns nothing rather than an error,
 * and an empty page is worse than a slow one.
 */
export const loadShopConfig = cache(async (creatorId: string) => {
  const cached = await cachedStoreConfig(creatorId, "shop")
  if (cached) return cached
  const supabase = await createClient()
  const { data } = await supabase
    .from("store_builder_configs")
    .select("published_config")
    .eq("creator_id", creatorId)
    .eq("page_type", "shop")
    .maybeSingle()
  return data ?? null
})

/**
 * Everything the layout needs, which is a subset of what the page needs.
 * Returns the theme name and nothing else, so a caller cannot accidentally
 * grow a dependency on rows it did not ask for.
 */
export async function loadShopThemePreset(username: string): Promise<string> {
  const profile = await loadProfileByUsername(username)
  if (!profile?.id) return "default"
  const creator = await loadCreatorForUser(profile.id)
  if (!creator?.id) return "default"
  const config = await loadShopConfig(creator.id)
  const global = (config as { published_config?: { globalSettings?: { themePreset?: string } } } | null)
    ?.published_config?.globalSettings
  return global?.themePreset || "default"
}

/** Re-exported so a caller needs one import, not two. */
export { cachedCreator, cachedCreatorProfile }

/**
 * The creator's sign in address, for the one place a page may show it: the
 * Contact link stands in with it when the creator typed no contact address,
 * and only for a visitor who has bought from them (app/(marketing)/u/[username]).
 * A private column since run-now part 63, so it is read by the server here
 * and never travels with the profile row.
 */
export const loadAccountEmail = cache(async (userId: string): Promise<string | null> => {
  const { data } = await createAdminClient().from("profiles").select("email").eq("id", userId).maybeSingle()
  return (data?.email as string | null | undefined) ?? null
})
