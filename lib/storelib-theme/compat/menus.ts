/**
 * ===========================================================================
 *  THE MENUS AN IMPORTED THEME READS
 * ===========================================================================
 * A Shopify theme asks for its menus by Shopify's handles: `main-menu` for
 * the header, `footer` for the footer. The store's own menus are used under
 * those names (the first one standing in where a name is missing), and a
 * store with none gets a first menu from the pages the site has, so a
 * theme's navigation is never drawn empty.
 *
 * One rule for the live site (lib/website-builder/compat-site.ts) and the
 * builder's canvas: a header that showed its links on the website and none
 * in the builder was the canvas reading the store's menus without this.
 */
import type { MenuLinkLike } from "./objects"

export type CompatMenus = Record<string, { title?: string; links: MenuLinkLike[] }>

export function compatMenus(stored: CompatMenus | null | undefined, pages: readonly string[]): CompatMenus {
  const own = stored ? Object.fromEntries(Object.entries(stored).filter(([, m]) => m && Array.isArray(m.links) && m.links.length > 0)) : {}
  if (Object.keys(own).length) {
    const out: CompatMenus = { ...own }
    const first = Object.values(own)[0]
    if (!out["main-menu"] && first) out["main-menu"] = first
    if (!out.footer && first) out.footer = first
    return out
  }
  const links: MenuLinkLike[] = [{ title: "Home", url: "/" }, { title: "Shop", url: "/collections/all" }]
  if (pages.includes("contact")) links.push({ title: "Contact", url: "/pages/contact" })
  return { "main-menu": { title: "Main menu", links }, footer: { title: "Footer", links: [{ title: "Search", url: "/search" }] } }
}
