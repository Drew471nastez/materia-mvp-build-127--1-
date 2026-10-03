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
