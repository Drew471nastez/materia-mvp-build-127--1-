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
 *   header_transparent_scope which pages the header is see-through on
 */
import type { Menu, MenuLink } from "@/lib/storelib-theme/values"

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
export function headerMenuBlocks(handle: string, menus: Record<string, Menu>): NavBlock[] | null {
  const menu = handle ? menus[handle] : undefined
  if (!menu || menu.links.length === 0) return null
  const out: NavBlock[] = []
  menu.links.forEach((link: MenuLink, i: number) => {
    const id = `menu-${handle}-${i}`
    out.push({ id, type: "nav_link", settings: { label: link.title, url: link.url, link_type: "custom" } })
    ;(link.links ?? []).forEach((child, j) => {
      out.push({ id: `${id}-${j}`, type: "nav_link", settings: { label: child.title, url: child.url, link_type: "custom", parent_id: id } })
    })
  })
  return out
}

export type MobileMenuStyle = "left" | "right" | "full"

/** Header › Menu on phones. Anything unknown is the menu every site had: from the left. */
export function mobileMenuStyle(value: unknown): MobileMenuStyle {
  return value === "right" || value === "full" ? value : "left"
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
