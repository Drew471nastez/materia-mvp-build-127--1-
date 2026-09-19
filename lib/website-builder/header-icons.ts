/**
 * ===========================================================================
 *  WHETHER A HEADER ICON IS ON, ANSWERED IN ONE PLACE
 * ===========================================================================
 * The Header elements panel wrote `show_search` and `show_cart`. The header
 * reads `show_search_icon` and `show_cart_icon`, which is what the section's
 * schema declares. So two of those four toggles changed a setting nothing
 * looks at: the icon stayed in the header and the control looked broken,
 * which is exactly what it was.
 *
 * A panel and a renderer agreeing about a key by both spelling it correctly
 * is not an arrangement that holds. They ask the same function now, so the
 * next one cannot drift.
 *
 * THE DEFAULT IS ON. Every one of these ships on, so an absent setting means
 * on. Reading it as off is how the panel came to draw four toggles in the
 * off position beside a header showing every icon they described.
 *
 * THE OLD KEY IS STILL HONOURED. A creator who turned search off while the
 * panel was writing `show_search` meant it. Their setting is read when the
 * current key has never been written, and is ignored the moment it is, so
 * flipping the toggle now does what it says.
 */
/**
 * Values rather than key names, deliberately. The settings audit reads a
 * renderer for a PROPERTY ACCESS ending in each id a panel offers — passing
 * `"show_search_icon"` as a string would hide the read from it, and a
 * control nothing reads is the exact class of bug this function exists to
 * end. `headerIconOn(s.show_search_icon, s.show_search)` is a read of both.
 */
export function headerIconOn(current: unknown, legacy?: unknown): boolean {
  if (typeof current === "boolean") return current
  if (typeof legacy === "boolean") return legacy
  return true
}

/** The four the panel offers, so neither side can forget one. */
export const HEADER_ICON_KEYS = {
  search: { key: "show_search_icon", legacy: "show_search" },
  account: { key: "show_account_icon" },
  wishlist: { key: "show_wishlist_icon" },
  cart: { key: "show_cart_icon", legacy: "show_cart" },
} as const
