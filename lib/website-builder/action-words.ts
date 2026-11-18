/**
 * ===========================================================================
 *  A BOOKING OR ENQUIRY ACTION THAT OPENS THE SHOP (round 56)
 * ===========================================================================
 * The scripted consulting site's "Book an intro call" went to /products: the
 * model rewrote the words of a starting template's button and kept its
 * address. /products is a real route, so every link check passed it, and a
 * visitor who asked to book a call was shown a shop.
 *
 * Words that ask to book, enquire or get in touch belong on a link to the
 * page that takes the request (a contact page with its form, a booking page),
 * never on one into the shop (/products, /collections and what is under
 * them). "Book" on its own is a booking only on a store with nothing for
 * sale: with products it is as often a book.
 *
 * Shared by both engines' checks: the agent's render check
 * (lib/ai-builder/render-check.ts actionMismatch) and the native engine's
 * button pass (./ai-site/native/validate.ts). Pure.
 */

const ASKS_TO_BOOK = /^(?:book(?: (?:a|an|your|the|now|in|online|me|us|time|today)\b|$)|enquire|inquire|make an? (?:enquiry|inquiry|appointment|booking)|request (?:a|an) (?:call|quote|consultation|visit|appointment|booking|proposal)|schedule|arrange|reserve|contact|get in touch|talk to|speak (?:to|with)|call us|send (?:a|an|us) (?:message|enquiry|inquiry|note)|ask (?:a|us|about)|start (?:a|the) conversation)|\b(?:intro(?:ductory)? call|discovery call|consultation|appointment)\b/i

const SHOP_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:products|collections)(?:\/|$)/i

/** Page keys that take a booking or an enquiry, in the order one is suggested. */
export const REQUEST_PAGES = ["contact", "book", "booking", "bookings", "enquire", "enquiries", "appointments", "consultation"] as const

/** Whether a button's words ask to book, enquire or get in touch. `sells`: the store has something for sale. */
export function asksToBook(words: string, sells: boolean): boolean {
  const w = words.replace(/\s+/g, " ").trim()
  if (!w) return false
  if (/^book$/i.test(w) && sells) return false
  return ASKS_TO_BOOK.test(w)
}

/** Whether an address goes into the shop (its list, a product, a collection). */
export function intoShop(href: string): boolean {
  const path = href.replace(/&amp;/g, "&").trim().split(/[?#]/)[0]
  return SHOP_PATH.test(path)
}

/** The first of the site's pages that takes a request, from its page keys. */
export function requestPage(pageKeys: Iterable<string>): string | undefined {
  const have = new Set(pageKeys)
  return REQUEST_PAGES.find((k) => have.has(k))
}
