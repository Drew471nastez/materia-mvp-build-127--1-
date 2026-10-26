import type { CompatPage } from "@/lib/storelib-theme/compat/theme"

/*
 * The page an imported theme's canvas draws, kept for Add block's preview:
 * its blocks are drawn with the store's own products and collections, not an
 * empty shop, where a title, a price or buy buttons drew nothing at all.
 * Its own module, so the picker does not pull the canvas in with it.
 */
let shown: CompatPage | null = null

export function setShownCompatPage(page: CompatPage | null): void {
  shown = page
}

export function shownCompatPage(): CompatPage | null {
  return shown
}
