/**
 * ===========================================================================
 *  THE LANGUAGE A BUYER'S ORDER IS WRITTEN IN, AFTER THEY PAID
 * ===========================================================================
 * One rule for everything a buyer gets about an order once it is placed:
 * the receipt email and page, the order confirmation, shipped, refund and
 * review emails, the order page, the thank you page, order help, the
 * checkout reminder and the code a site account signs in with. Every one
 * of them asks this function and none decides on its own.
 *
 *   1. bought on Storelib (the creator page, Explore, a link, a community):
 *      English, signed by the creator (lib/emails/buyer-channel.ts)
 *   2. a language a link Storelib wrote names (?lang= on an email's link),
 *      when it is the store's default or one it publishes
 *   3. the language the order's checkout was drawn in (orders.source_detail
 *      .lang, commerce_checkouts.origin.lang), when it is still the store's
 *      default or one it publishes
 *   4. the store's default language (Settings › Markets and languages)
 *
 * NEVER CONSULTED: the sl_lang cookie (a visitor's language on whichever
 * website they last browsed on this host, which the proxy can also write
 * from Accept-Language or the visitor's country), the browser's
 * Accept-Language, the buyer's country or market, the store's currency, and
 * the seller's own dashboard language. A Romanian browser, a Romanian
 * address or a lei price never turns an English store's receipt Romanian.
 *
 * Before paying, the checkout and Track your order are pages of the website
 * and follow the language the visitor is reading it in (its address, then
 * their choice there; lib/markets/checkout-language.ts). That choice is what
 * the checkout records on the order, and from then on rule 3 holds it.
 *
 * Pure and browser safe.
 */

export type BuyerLanguageReason = "storelib" | "named" | "order" | "default"

export interface BuyerLanguageFacts {
  /** The store's default language (store_localization.default_language); English when it has none. */
  defaultLanguage: string | null | undefined
  /** The other languages the store publishes. */
  published?: readonly string[] | null
  /** Where it was bought (lib/emails/buyer-channel.ts buyerChannel); unknown reads as the website. */
  channel?: "website" | "storelib" | null
  /** A language a link Storelib wrote names (?lang=). */
  named?: unknown
  /** The language the order's checkout was drawn in. */
  order?: unknown
}

export interface BuyerLanguage {
  lang: string
  reason: BuyerLanguageReason
}

/** The store's language matching `asked` exactly (case aside), or null. */
function offered(asked: unknown, own: string, published: readonly string[]): string | null {
  if (typeof asked !== "string") return null
  const want = asked.trim().toLowerCase()
  if (!want) return null
  if (want === own.toLowerCase()) return own
  return published.find((l) => l.toLowerCase() === want) ?? null
}

export function buyerLanguage(f: BuyerLanguageFacts): BuyerLanguage {
  if (f.channel === "storelib") return { lang: "en", reason: "storelib" }
  const own = (typeof f.defaultLanguage === "string" && f.defaultLanguage.trim()) || "en"
  const published = f.published ?? []
  const named = offered(f.named, own, published)
  if (named) return { lang: named, reason: "named" }
  const order = offered(f.order, own, published)
  if (order) return { lang: order, reason: "order" }
  return { lang: own, reason: "default" }
}
