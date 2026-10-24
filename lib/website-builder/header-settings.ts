/**
 * ===========================================================================
 *  THE HEADER'S NEWER SETTINGS, AS RULES A TEST CAN RUN
 * ===========================================================================
 * The header is drawn by a React component (sections/renderers/
 * HeaderSection.tsx) that is long and mostly about motion and layout. The
 * decisions its newer settings make are here instead, pure, so each one is a
 * function with a test rather than a branch somewhere in two thousand lines:
 *
 *   menu                    which links the nav shows
 *   mobile_menu_style       where the phone menu comes from
 *   desktop_menu            links in the row, or a menu button and a drawer
 *   search_behaviour        a field in the header, a window, or the page
 *   header_transparent_scope which pages the header is see-through on
 */
import type { Menu, MenuLink } from "@/lib/storelib-theme/values"
import { opensNewTab, withoutNewTab } from "./new-tab"

type NavBlock = { id: string; type: "nav_link"; settings: Record<string, unknown> }

/**
 * A menu from Theme settings › Menus as the nav blocks the header already
 * knows how to draw: root links in order, each child carrying its parent's
 * id, which is the shape the header's own links are stored in. Null when
 * the header names no menu, or one that does not exist, and the header then
 * draws its own links as it always did.
 *
 * Two levels, because the header draws two: a link, and a dropdown under
 * it. A third level from a menu is left out of the header rather than
 * flattened into the second.
 */
/**
 * The menu a header reads: its own `menu` setting, or the Main menu once the
 * store's Main menu has links. A header's `menu` is empty only because it was
 * never pointed anywhere (its picker has no "None"), so a Main menu edited in
 * Navigation, in the builder or on /app/website-builder/navigation, is what
 * the header shows, the way the editor's Menus already shows it
 * (lib/website-builder/main-menu.ts, mainMenuView).
 */
export function headerMenuHandleOf(own: string, menus: Record<string, Menu>): string {
  if (own) return own
  return (menus["main-menu"]?.links.length ?? 0) > 0 ? "main-menu" : ""
}

export function headerMenuBlocks(handle: string, menus: Record<string, Menu>): NavBlock[] | null {
  const menu = handle ? menus[handle] : undefined
  if (!menu) return null
  /*
    THE MAIN MENU IS THE HEADER'S, EVEN EMPTY. Once the header reads the Main
    menu (lib/website-builder/main-menu.ts), taking its last link out has to
    take the last link out of the header too: falling back to the header's
    old blocks would bring back links somebody had just removed. Any other
    menu that is empty still leaves the header's own links, as it always did.
  */
  if (menu.links.length === 0) return handle === "main-menu" ? [] : null
  const out: NavBlock[] = []
  menu.links.forEach((link: MenuLink, i: number) => {
    const id = `menu-${handle}-${i}`
    /* "Open in a new tab" from the menu editor is a mark on the address (./new-tab.ts): it becomes the link's own open_in_new_tab, which the header and its drawer draw as target="_blank". */
    out.push({ id, type: "nav_link", settings: { label: link.title, url: withoutNewTab(link.url), link_type: "custom", open_in_new_tab: opensNewTab(link.url) } })
    ;(link.links ?? []).forEach((child, j) => {
      out.push({ id: `${id}-${j}`, type: "nav_link", settings: { label: child.title, url: withoutNewTab(child.url), link_type: "custom", parent_id: id, open_in_new_tab: opensNewTab(child.url) } })
    })
  })
  return out
}

export type MobileMenuStyle = "left" | "right" | "top" | "full"

/** Header › Menu on phones. Anything unknown is the menu every site had: from the left. */
export function mobileMenuStyle(value: unknown): MobileMenuStyle {
  return value === "right" || value === "top" || value === "full" ? value : "left"
}

/**
 * Header › Menu on larger screens. The links in the header row is what every
 * header drew, and stays the answer for a header that never set this. The
 * other three put a menu button in the row instead, which opens the same
 * drawer a phone gets, from the edge named.
 */
export type DesktopMenu = "inline" | "drawer_left" | "drawer_right" | "drawer_top"

export function desktopMenu(value: unknown): DesktopMenu {
  return value === "drawer_left" || value === "drawer_right" || value === "drawer_top" ? value : "inline"
}

/** The edge a larger screen's drawer comes from, or null when the links are in the row. */
export function desktopDrawerEdge(menu: DesktopMenu): MobileMenuStyle | null {
  if (menu === "drawer_left") return "left"
  if (menu === "drawer_right") return "right"
  if (menu === "drawer_top") return "top"
  return null
}

/**
 * Where the menu drawer rests while closed, as a transform, so the slide is
 * the compositor's alone. Covers the screen comes in from the left, as it
 * always did. From the top it drops from under the header, inside a frame
 * that clips it there, so it never travels across the header itself.
 */
export function drawerClosedTransform(style: MobileMenuStyle): string {
  if (style === "right") return "translate3d(101%, 0, 0)"
  if (style === "top") return "translate3d(0, -101%, 0)"
  return "translate3d(-101%, 0, 0)"
}

/**
 * Header › When search is clicked.
 *
 *   header  a field opens over the header row (what it always did)
 *   modal   a window opens over the page, with the field and live results
 *   page    the icon is a link to the search page
 */
export type SearchMode = "header" | "modal" | "page"

export function searchMode(value: unknown): SearchMode {
  return value === "modal" || value === "page" ? value : "header"
}

/**
 * A header link is a plain link, or a button that opens the links under it.
 *
 * A link with sub-links and no address of its own, or the `#` a menu uses
 * for "nowhere", has nothing to go to, so it is a button: pressing it opens
 * its links as a dropdown on a computer, and in the drawer on a phone. A
 * link with an address goes there, and its sub-links open as the pointer
 * rests on it, as they always did. A link with no sub-links is a link.
 */
export function isMenuButton(url: unknown, childCount: number): boolean {
  if (childCount <= 0) return false
  const v = typeof url === "string" ? url.trim() : ""
  return v === "" || v === "#"
}

/**
 * Header › Transparent on. "all" is what the toggle always meant; "home" is
 * the home page only, because an inner page (a policy, the cart) usually
 * has no picture at the top for the header to sit over, and a see-through
 * header over plain text is text over text.
 */
export function transparentHere(transparent: boolean, scope: unknown, template: string | undefined): boolean {
  if (!transparent) return false
  if (scope === "home") return template === "index"
  return true
}

/**
 * Header › Logo shows: the picture, the store's name, or both side by side.
 *
 * A header saved before this setting existed has no value, and it keeps what
 * it always drew: the picture when there is one, the name when there is not.
 * Asking for the picture without having uploaded one draws the name, so the
 * header is never left with nothing in the logo's place.
 */
export type LogoMode = "image" | "text" | "image_text"

export function logoMode(value: unknown): LogoMode | null {
  return value === "image" || value === "text" || value === "image_text" ? value : null
}

export function logoParts(value: unknown, hasImage: boolean): { image: boolean; text: boolean } {
  const mode = logoMode(value)
  if (!hasImage) return { image: false, text: true }
  if (mode === "text") return { image: false, text: true }
  if (mode === "image_text") return { image: true, text: true }
  return { image: true, text: false }
}

/**
 * The wordmark's font stack. `inherit` is what the schema stores for "no
 * choice", and inside a list it makes the whole declaration invalid, which
 * dropped the wordmark into the button face. A named family is quoted.
 */
export function logoFontStack(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : ""
  const named = raw && raw.toLowerCase() !== "inherit" && /^[\w -]+$/.test(raw) ? `"${raw}"` : null
  return [named, "var(--theme-font-heading)", "ui-sans-serif", "system-ui", "sans-serif"].filter(Boolean).join(", ")
}

/**
 * Header › Show border on, decided from the page being drawn. The canvas
 * used to count every page as the home page, so "Inner pages only" never
 * showed a border in the editor and always did on the site.
 */
export function headerBorderHere(enabled: boolean, visibility: unknown, template: string | undefined): boolean {
  if (!enabled) return false
  const home = template === "index"
  if (visibility === "home_only") return home
  if (visibility === "inner_only") return !home
  if (visibility === "none") return false
  return true
}
