/**
 * ===========================================================================
 *  THE SHOP'S OWN WORDS, IN EVERY LANGUAGE OF THE WEBSITE
 * ===========================================================================
 * The words a Storelib theme draws itself, that no section setting holds:
 * the cart's, the buy buttons', the cart notice's. They were English on
 * every language of a website. Each is a translation like any other text
 * (Translate › Shop words, key `ui:<name>`), drafted by AI with the rest,
 * and drawn in the page's language once approved (StorefrontContext
 * `words`, lib/markets/live.ts). A word with no approved translation, or a
 * page in the website's own language, shows the English below.
 *
 * A button's own label set in a section (a product block's "Add to cart"
 * label) is that section's text and is translated there; these are the
 * defaults it falls back to.
 */
export const UI_WORDS = {
  cart: "Cart",
  cart_nothing: "Nothing in your cart yet.",
  cart_title: "Your cart",
  cart_empty: "Your cart is empty",
  continue_shopping: "Continue shopping",
  subtotal: "Subtotal",
  total: "Total",
  check_out: "Check out",
  view_cart: "View cart",
  remove: "Remove",
  quantity: "Quantity",
  note_for_shop: "Note for the shop",
  discount_code: "Discount code",
  apply: "Apply",
  taxes_at_checkout: "Taxes and shipping are worked out at checkout",
  add_to_cart: "Add to cart",
  added_to_cart: "Added to cart",
  buy_now: "Buy now",
  get_it_free: "Get it free",
  sold_out: "Sold out",
  search: "Search",
  no_results: "No results",
} as const

export type UiWord = keyof typeof UI_WORDS

export const uiKey = (word: UiWord) => `ui:${word}`

/** Every word as a line in Translate › Shop words. */
export function uiTranslatables(): { key: string; source: string; label: string; where: string; multiline: boolean }[] {
  return (Object.keys(UI_WORDS) as UiWord[]).map((w) => ({ key: uiKey(w), source: UI_WORDS[w], label: UI_WORDS[w], where: "Shop words", multiline: false }))
}

/** A word in the page's language: its approved translation, else the English. */
export function uiWord(words: Partial<Record<string, string>> | undefined, word: UiWord): string {
  const v = words?.[word]
  return typeof v === "string" && v.trim() ? v : UI_WORDS[word]
}
