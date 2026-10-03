/**
 * ===========================================================================
 *  WHICH OF THE HEADER'S DRAWERS MAY BE OPEN, AND WHERE ONE MAY EXIST AT ALL
 * ===========================================================================
 * A built site's header owns three things that open over the page: the menu
 * (a phone's navigation), the cart, and search. The rules about them are
 * here, pure, so a test can run them; HeaderSection.tsx applies them.
 *
 * ONE AT A TIME. Two of them open together is two scroll locks, two
 * backdrops and two close buttons, and the second lock reads the page offset
 * the first one has already zeroed. Opening one closes the others, whichever
 * one asked: the hamburger, the bag, the search icon, or an Add to cart
 * somewhere down the page that opens the cart by itself.
 *
 * THE MENU IS A PHONE'S. On a desktop layout the header draws its links in
 * the row, so a menu drawer there is a second copy of the navigation drawn
 * over the page. In the editor the canvas says which device it is drawing,
 * and the drawer exists only in the phone preview. Published, the drawer is
 * hidden from the tablet breakpoint up by CSS, and closes if the window is
 * widened past it while open.
 */

export type SiteDrawer = "menu" | "cart" | "search"

export type DrawerState = Record<SiteDrawer, boolean>

export const ALL_CLOSED: DrawerState = { menu: false, cart: false, search: false }

/** The state after `which` is opened: it, and nothing else. */
export function openOnly(which: SiteDrawer): DrawerState {
  return { ...ALL_CLOSED, [which]: true }
}

/**
 * The state to settle on after a change. When the change opened a drawer
 * while another was open, the one that has just opened wins and the rest
 * close. A change that only closed things is kept as it is.
 */
export function settleDrawers(prev: DrawerState, next: DrawerState): DrawerState {
  const opened = (Object.keys(next) as SiteDrawer[]).filter((k) => next[k] && !prev[k])
  if (opened.length === 0) {
    const stillOpen = (Object.keys(next) as SiteDrawer[]).filter((k) => next[k])
    /* Nothing new, but two were already open: keep the first, by priority. */
    if (stillOpen.length > 1) return openOnly(stillOpen[0])
    return next
  }
  /* Two opened in the same change: the cart is the one a shopper asked for
     last (it opens itself after Add to cart), then search, then the menu. */
  const order: SiteDrawer[] = ["cart", "search", "menu"]
  const winner = order.find((k) => opened.includes(k)) ?? opened[0]
  return openOnly(winner)
}

/** How many are open. The rule above keeps this at one or none. */
export function openCount(state: DrawerState): number {
  return Number(state.menu) + Number(state.cart) + Number(state.search)
}

/**
 * Whether the phone menu drawer is drawn on this surface at all.
 *
 *   editor, phone preview      yes
 *   editor, desktop or tablet  no: the desktop layout has its links in the row
 *   published (no device)      yes, and CSS hides it at the tablet breakpoint
 */
export function menuDrawerExists(deviceMode?: "desktop" | "tablet" | "mobile"): boolean {
  /* No device named: the published page, which serves every width. */
  return deviceMode ? deviceMode === "mobile" : true
}

/** The published breakpoint the header swaps its two shells at, Tailwind's `md`. */
export const MENU_DRAWER_MAX_WIDTH = 767

/**
 * A link in the menu that only moves within the page it is on: `#about`, or
 * `/#about` on the home page. The drawer closes and then hands the click on
 * as an ordinary anchor click, so whatever scrolls a site to its anchors gets
 * to do that, instead of the drawer loading a page.
 */
export function isInPageLink(href: string, currentPath: string): boolean {
  const h = href.trim()
  if (h.startsWith("#")) return h.length > 1
  const hash = h.indexOf("#")
  if (hash <= 0 || hash === h.length - 1) return false
  const path = h.slice(0, hash).replace(/\/+$/, "") || "/"
  const here = currentPath.replace(/\/+$/, "") || "/"
  return path === here
}
