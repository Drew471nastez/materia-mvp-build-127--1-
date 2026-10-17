/**
 * ===========================================================================
 *  WHICH SIDEBAR GROUPS ARE OPEN
 * ===========================================================================
 * A group in the app's sidebar (Products, with Coupons and Reviews under it;
 * Integrations, with the ones installed) used to start closed on every load,
 * so opening Coupons from a link or refreshing the page showed Products shut
 * over the page being read, with the lit row nowhere on screen. Opening by
 * route alone was tried before and dropped, because it fought the chevron: a
 * group the reader had just closed opened itself again on the next render.
 *
 * So the two answers are kept apart. THE ROUTE decides a group nobody has
 * touched: the page you are on is inside it, so it is open. A PRESS ON THE
 * CHEVRON is this reader's own answer for that one group, and it wins for as
 * long as the tab lives (sessionStorage), including across a refresh.
 *
 * Pure, so the rule can be read without a browser.
 */

export interface NavGroup {
  href: string
  children?: { href: string }[]
}

/** Whether `pathname` is this href or a page under it. "/app/products" does not hold "/app/products-x". */
export function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Whether the page being shown is one of this group's own rows. */
export function routeInside(group: NavGroup, pathname: string): boolean {
  return (group.children ?? []).some((c) => under(pathname, c.href))
}

/**
 * The groups drawn open: the reader's own answer where they gave one, the
 * route's answer everywhere else. A group with no rows under it is never
 * open, whatever is kept against its name.
 */
export function openGroups(groups: readonly NavGroup[], pathname: string, choice: Record<string, boolean> = {}): Set<string> {
  const open = new Set<string>()
  for (const g of groups) {
    if (!g.children?.length) continue
    if (choice[g.href] ?? routeInside(g, pathname)) open.add(g.href)
  }
  return open
}

/**
 * The reader's answers after they press one group's chevron: what it is now
 * is written down, whichever way it got there. Pressing the chevron of a
 * group the route opened writes "closed"; pressing it again writes "open",
 * and that stays open even after they walk away from its pages.
 */
export function afterToggle(choice: Record<string, boolean>, href: string, openNow: boolean): Record<string, boolean> {
  return { ...choice, [href]: !openNow }
}
