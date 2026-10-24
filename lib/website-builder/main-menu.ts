/**
 * ===========================================================================
 *  THE MAIN MENU IS THE HEADER'S MENU
 * ===========================================================================
 * Shopify's header reads the store's Main menu, and the Main menu is edited
 * in Navigation. Storelib grew the other way round: the header had links of
 * its own (its `nav_link` blocks), and the menus came later. Two copies of
 * one navigation drift apart, so the Main menu is now the one source:
 * the theme's `menus["main-menu"]`, which the header shows when its `menu`
 * setting names it (lib/website-builder/header-settings.ts).
 *
 * MOVED OVER, NOT MOVED. A site saved before this has its links in the
 * header's blocks and no Main menu. Nothing is rewritten when the editor
 * opens: until somebody edits the Main menu, it is shown as the header's
 * links (`mainMenuView`), and the header keeps drawing its blocks, which say
 * the same thing. The first edit writes the menu out from those links and
 * points the header at it (`adoptHeaderLinks`). The blocks are never
 * deleted: a header whose `menu` is cleared again draws them exactly as
 * they were.
 */
import { cleanMenus, type Menu } from "@/lib/storelib-theme/values"
import { MAIN_MENU, menuFromHeader } from "./storefront-data"
import type { SectionInstance } from "./types"

export { MAIN_MENU }

export const MAIN_MENU_TITLE = "Main menu"

type HeaderLike = Pick<SectionInstance, "settings" | "blocks"> | null | undefined

const menusObject = (raw: unknown): Record<string, Menu> =>
  (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, Menu>

/** The header reads the Main menu (or another menu), rather than its own blocks. */
export function headerReadsMenu(header: HeaderLike): string {
  const v = header?.settings?.menu
  return typeof v === "string" ? v : ""
}

/**
 * The Main menu as the editor shows it: the saved one when it has links, else
 * the header's own links when the header still draws them, else the saved
 * (empty) one or a new empty one. `fromHeader` says the links shown are the
 * header's and nothing has been written yet.
 */
export function mainMenuView(menusRaw: unknown, header: HeaderLike): { menu: Menu; fromHeader: boolean } {
  const own = menusObject(menusRaw)[MAIN_MENU]
  const hasOwn = !!own && Array.isArray(own.links) && own.links.length > 0
  if (hasOwn) return { menu: { title: own.title || MAIN_MENU_TITLE, links: own.links }, fromHeader: false }
  if (!headerReadsMenu(header)) {
    const derived = menuFromHeader((header ?? undefined) as SectionInstance | undefined)
    if (derived && derived.links.length > 0) return { menu: { ...derived, title: own?.title || MAIN_MENU_TITLE }, fromHeader: true }
  }
  return { menu: { title: own?.title || MAIN_MENU_TITLE, links: own?.links ?? [] }, fromHeader: false }
}

/**
 * The menus with the Main menu written out from the header's links, and what
 * the header's `menu` setting should become. Null when there is nothing to
 * do: the header already reads a menu, or the Main menu already has links.
 *
 * Non-destructive by construction: the other menus are carried over as they
 * are, a Main menu with links is never replaced, and the header's blocks are
 * not part of what comes back at all.
 */
export function adoptHeaderLinks(menusRaw: unknown, header: HeaderLike): { menus: Record<string, Menu>; headerMenu: string } | null {
  if (!header || headerReadsMenu(header)) return null
  const menus = menusObject(menusRaw)
  const own = menus[MAIN_MENU]
  if (own && Array.isArray(own.links) && own.links.length > 0) return { menus, headerMenu: MAIN_MENU }
  const derived = menuFromHeader(header as SectionInstance)
  const links = derived?.links ?? []
  return { menus: { ...menus, [MAIN_MENU]: { title: own?.title || MAIN_MENU_TITLE, links } }, headerMenu: MAIN_MENU }
}

/** The menus a header can be pointed at, Main menu first, by their names. */
export function menuChoices(menusRaw: unknown, header: HeaderLike): { handle: string; title: string; count: number }[] {
  const clean = cleanMenus(menusObject(menusRaw))
  const main = mainMenuView(menusRaw, header).menu
  const rest = Object.keys(clean)
    .filter((h) => h !== MAIN_MENU)
    .map((h) => ({ handle: h, title: clean[h].title, count: clean[h].links.length }))
  return [{ handle: MAIN_MENU, title: main.title || MAIN_MENU_TITLE, count: main.links.length }, ...rest]
}

/** The handle the header shows: its own links count as the Main menu. */
export function headerMenuHandle(menusRaw: unknown, header: HeaderLike): string {
  const h = headerReadsMenu(header)
  if (!h) return MAIN_MENU
  return cleanMenus(menusObject(menusRaw))[h] || h === MAIN_MENU ? h : MAIN_MENU
}

/**
 * ===========================================================================
 *  A NEW WEBSITE'S HEADER AND FOOTER NAME THE STORE'S MENUS
 * ===========================================================================
 * The menus are the store's (store-menus-server.ts), and a theme only names
 * them by handle. A new website's header falls back to the Main menu by
 * itself (header-settings.ts headerMenuHandleOf); its footer named nothing
 * and drew its starter columns. So a website being added takes the menus
 * the website visitors see named: the same header menu and footer columns,
 * or the store's `footer` menu when that website's footer named none. Only
 * a handle the store has, with links, is named, and a header or footer that
 * already names a menu is left as it is. Pure.
 */
export function pointAtStoreMenus(
  sections: SectionInstance[],
  menus: Record<string, Menu>,
  current: { header?: Record<string, unknown> | null; footer?: Record<string, unknown> | null } = {},
): SectionInstance[] {
  const named = (h: unknown): h is string => typeof h === "string" && h !== "" && (menus[h]?.links?.length ?? 0) > 0
  const text = (v: unknown) => (typeof v === "string" ? v : "")
  return sections.map((s) => {
    const own = (s.settings ?? {}) as Record<string, unknown>
    if (s.type === "header") {
      const was = current.header?.menu
      if (text(own.menu) || !named(was) || was === MAIN_MENU) return s
      return { ...s, settings: { ...own, menu: was } }
    }
    if (s.type === "footer") {
      if (text(own.menu) || text(own.menu_2)) return s
      const was = current.footer ?? {}
      const next: Record<string, unknown> = { ...own }
      if (named(was.menu) || named(was.menu_2)) {
        if (named(was.menu)) next.menu = was.menu
        if (named(was.menu_2)) next.menu_2 = was.menu_2
        if (text(was.menu_heading)) next.menu_heading = was.menu_heading
        if (text(was.menu_2_heading)) next.menu_2_heading = was.menu_2_heading
      } else if (named("footer")) {
        next.menu = "footer"
      } else {
        return s
      }
      return { ...s, settings: next }
    }
    return s
  })
}
