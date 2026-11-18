/**
 * ===========================================================================
 *  AN ENQUIRY THAT OPENS THE SHOP (round 56)
 * ===========================================================================
 * The scripted consulting site's "Book an intro call" went to /products: the
 * model rewrote the words of a starting template's button and kept its
 * address. /products is a real route, so every link check passed it, and a
 * visitor who asked for a call was shown a shop.
 *
 * Words that ask to get in touch (contact, enquire, talk to us, request a
 * quote, an intro or discovery call) belong on a link to the page that takes
 * the request (a contact page with its form, a booking page), never on one
 * into the shop (/products, /collections and what is under them). Words that
 * book a paid service ("Book a chair", "Book online") may well go to the
 * shop: a salon sells its appointments as products. Those are only wrong on
 * a store with nothing for sale, which the checks treat as any call to action
 * into an empty shop.
 *
 * Shared by both engines' checks: the agent's render check
 * (lib/ai-builder/render-check.ts actionMismatch) and the native engine's
 * button pass (./ai-site/native/validate.ts). Pure.
 */

const ASKS_TO_TALK = /^(?:contact|get in touch|enquire|inquire|make an? (?:enquiry|inquiry)|request (?:a|an) (?:call|callback|quote|proposal|visit)|talk to|speak (?:to|with)|call us|email us|write to us|send (?:a|an|us) (?:message|enquiry|inquiry|note|email)|ask (?:a question|us|about)|start (?:a|the) conversation|say hello)\b|\b(?:intro(?:ductory)? call|discovery call|free consultation|chat with (?:us|me|the))\b/i

const SHOP_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:products|collections)(?:\/|$)/i

/** Page keys that take a booking or an enquiry, in the order one is suggested. */
export const REQUEST_PAGES = ["contact", "book", "booking", "bookings", "enquire", "enquiries", "appointments", "consultation"] as const

/** Whether a button's words ask to get in touch (an enquiry, a call, a quote), which the shop cannot take. */
export function asksToTalk(words: string): boolean {
  return ASKS_TO_TALK.test(words.replace(/\s+/g, " ").trim())
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
