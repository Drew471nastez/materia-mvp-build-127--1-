/**
 * ===========================================================================
 *  A PAGE'S LINK, IN THE MENU THE SITE'S HEADER REALLY DRAWS (round 26)
 * ===========================================================================
 * add_page puts a new page in the Main menu, and remove_page takes its links
 * out. WHICH menu depends on the site:
 *
 *   a Storelib site    the theme's own `menus` setting (settings.menus), at
 *                      /<key>, as before;
 *   a Materia site     (a template start, or a redesign of one) the STORE's
 *                      menus (store_menus), which its header and footer draw
 *                      (lib/storelib-theme/compat/menus.ts compatMenus, the
 *                      same data the template import writes), at
 *                      /pages/<key>, Shopify's address for a page. Written to
 *                      settings.menus, the link would never be drawn.
 *
 * A store with no menus yet starts from what its Materia header draws today
 * (compatMenus' first menu), so adding a page never takes Home and Shop away.
 * Pure helpers; the tools do the reads and writes (./tools-impl.ts).
 */
import { compatMenus } from "@/lib/storelib-theme/compat/menus"
import { pagePath } from "@/lib/website-builder/site-pages"
import type { StoreMenu } from "./ports"

export type Menus = Record<string, StoreMenu>
type Link = StoreMenu["links"][number]

/** Where a page of a Materia site is: Shopify's /pages/<handle>. */
export const materiaPagePath = (key: string): string => `/pages/${key}`

/** Every address a page of this key may be linked by, on either kind of site. */
export function pageAddresses(key: string): string[] {
  return [materiaPagePath(key), pagePath(key)]
}

const norm = (url: string) => url.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase() || "/"

/** The menus with a link to `url` in `handle` (made when missing), unless one is there already. */
export function withPageLink(menus: Menus, handle: string, title: string, url: string): Menus {
  const menu = menus[handle] ?? { title: handle === "main-menu" ? "Main menu" : handle, links: [] }
  const has = (links: Link[]): boolean => links.some((l) => norm(l.url) === norm(url) || has(l.links ?? []))
  if (has(menu.links)) return menus
  return { ...menus, [handle]: { ...menu, links: [...menu.links, { title, url }] } }
}

/** The menus with every link to any of `urls` taken out, in every menu and at every depth, and how many went. */
export function withoutPageLinks(menus: Menus, urls: readonly string[]): { menus: Menus; removed: number } {
  const gone = new Set(urls.map(norm))
  let removed = 0
  const prune = (links: Link[]): Link[] =>
    links.flatMap((l) => {
      if (gone.has(norm(l.url))) {
        removed++
        return []
      }
      return [{ ...l, ...(l.links ? { links: prune(l.links) } : {}) }]
    })
  const out: Menus = {}
  for (const [handle, m] of Object.entries(menus)) out[handle] = { ...m, links: prune(m.links) }
  return { menus: out, removed }
}

/** A Materia site's menus to start from: the store's own, or, with none yet, what its header draws today. */
export function materiaMenusToStart(stored: Menus | null, pageKeys: readonly string[]): Menus {
  if (stored && Object.keys(stored).length) return stored
  return compatMenus(null, pageKeys) as unknown as Menus
}
