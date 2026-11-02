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
import { unstable_cache } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { readPublicRow, readPublicRowStrict } from "@/lib/security/public-rows"
import { publicProfileByName, publicProfileByNameStrict } from "@/lib/profile/profile-by-name"
import { requestMayHaveSession } from "@/lib/supabase/session-cookie"
import { createAdminClient } from "@/lib/supabase/admin"
import { createPublicReadClient } from "@/lib/supabase/public-read"
import { cachedCreator, cachedCreatorProfile, cachedStoreConfig } from "./product-page-cache"
import { readPublishedStoreConfig } from "@/lib/store-builder/public-config"

/**
 * `ilike`, not `eq`, because that is what the layout has always used and a
 * handle is not case-sensitive in a URL.
 *
 * The cross-request cache is deliberately NOT used here: usernames change,
 * and a stale username -> id mapping sends a visitor to somebody else's page.
 * Deduping within the request is the whole win anyway, since this is the
 * query the layout and the page each ran separately.
 */
export const loadProfileByUsernameStrict = cache(async (username: string) => {
  /* Every public column, never a private one (lib/security/public-rows); the exact name first, which the username index answers (lib/profile/profile-by-name.ts). Bounded, and a failed read THROWS (SiteReadError): null is only "no such name". */
  return publicProfileByNameStrict(await createClient(), username)
})

/**
 * The same profile where a failed read may read as "none" (a layout's skeleton
 * colour, a share image). The one read above, shared within the request, so
 * the strict and the lenient caller cost one round trip between them.
 */
export const loadProfileByUsername = cache(async (username: string) => {
  return loadProfileByUsernameStrict(username).catch(() => null)
})

/** The creator row for a profile, bounded; a failed read THROWS (SiteReadError), null is only "no creator row". */
export const loadCreatorForUserStrict = cache(async (userId: string) => {
  return readPublicRowStrict(await createClient(), "creators", (q) => q.eq("user_id", userId))
})

/** The creator row for a profile, shared with the product page's cache; a failed read reads as none, as it always has. */
export const loadCreatorForUser = cache(async (userId: string) => {
  return loadCreatorForUserStrict(userId).catch(() => null)
})

/**
 * The shop's published config. Goes through the shared cross-request cache,
 * so a second visitor to the same creator does not pay for it at all.
 *
 * It reads again, uncached, when the cached read failed, or found nothing for
 * somebody signed in (the creator who just published sees it on the next
 * load). Both reads are the server's narrow one (lib/store-builder/
 * public-config.ts): published_config only, no contact address in it.
 */
export const loadShopConfig = cache(async (creatorId: string) => {
  const cached = await cachedStoreConfig(creatorId, "shop").catch(() => undefined)
  if (cached) return cached
  /* Nothing published, and a visitor with no session cannot have just published it (lib/supabase/session-cookie.ts). */
  if (cached === null && !(await requestMayHaveSession())) return null
  /* Read fresh, the same narrow server read the cache makes (lib/store-builder/public-config.ts, round 48). */
  return readPublishedStoreConfig(creatorId, "shop").catch(() => null)
})

/**
 * ===========================================================================
 *  THE LAYOUT'S TWO FACTS, HELD FOR EVERY VISITOR
 * ===========================================================================
 * The layout around storelib.com/<name> (app/(marketing)/u/[username]/
 * layout.tsx) needs the store whose currency the prices are in and the
 * theme that tints the loading skeleton. It wraps the creator page, but also
 * the OnePage at /<name>/links, which is the page storelib.me/<name> is
 * drawn from, and every product at /<name>/<product>. Read per request,
 * that was two round trips (the profile by name, then its creator) on every
 * OnePage visit, for a skeleton colour, and the OnePage itself reads nothing
 * per visit any more (lib/onepage/public-cache).
 *
 * So the two facts are held for a minute, keyed by the name. The reason
 * loadProfileByUsername above is never held does not apply: what this hands
 * back is a colour and the store's id, which only picks the currency the
 * prices are drawn in (its value read through cachedStoreCurrency, which a
 * currency change clears). Nothing on the page is chosen by it. The creator
 * page itself still reads its profile per request, so a renamed account
 * never shows somebody else's page.
 *
 * Only a name that leads to a creator is held: a name that leads nowhere, or
 * a read that failed, is thrown out of the held function (unstable_cache
 * keeps nothing then) and answered with the plain skeleton.
 */
export interface ShopLayoutFacts {
  creatorId: string | null
  themePreset: string
}

class NoCreator extends Error {}

export const SHOP_LAYOUT_HOLD_SECONDS = 60

export const heldShopLayout = cache(async (username: string): Promise<ShopLayoutFacts> => {
  const name = username.trim().toLowerCase()
  try {
    return await unstable_cache(
      async (): Promise<ShopLayoutFacts> => {
        const db = createPublicReadClient()
        const profile = await publicProfileByName<{ id?: string }>(db as never, name)
        if (!profile?.id) throw new NoCreator()
        const creator = await readPublicRow<{ id?: string }>(db as never, "creators", (q) => q.eq("user_id", profile.id))
        if (!creator?.id) throw new NoCreator()
        const config = await cachedStoreConfig(creator.id, "shop").catch(() => null)
        const preset = (config as { published_config?: { globalSettings?: { themePreset?: string } } } | null)?.published_config?.globalSettings?.themePreset
        return { creatorId: creator.id, themePreset: preset || "default" }
      },
      ["shop-layout-facts", "v1", name],
      { revalidate: SHOP_LAYOUT_HOLD_SECONDS, tags: [`shop-layout:${name}`] },
    )()
  } catch {
    return { creatorId: null, themePreset: "default" }
  }
})

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
