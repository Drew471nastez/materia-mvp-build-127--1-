/**
 * ===========================================================================
 *  WHERE A BUYER BOUGHT, AND WHAT THEIR EMAILS ARE WRITTEN IN AND SIGNED BY
 * ===========================================================================
 * One rule for every email a buyer gets, decided once here and read by the
 * senders (lib/email.tsx for a digital receipt and refund,
 * lib/physical/jobs-server.ts for an order that ships, the review ask and
 * the checkout reminder) and by the previews in Emails (lib/emails/
 * customer-catalog.ts), so a preview is never in another language or under
 * another name than the email it shows.
 *
 *   website    bought on the creator's published website (its live store,
 *              a cart, a site checkout): written in the language the buyer
 *              used there, or the website's own language when that one is
 *              not published any more, and signed by the shop (its name
 *              and logo, Settings › Store details)
 *   storelib   bought on the creator page, a product page, the OnePage,
 *              Explore, a checkout link, or in a community: written in
 *              English and signed by the creator (their name and photo)
 *
 * WHY THE PLACE DECIDES, NOT THE BUYER'S BROWSER. A website is the store's
 * own, in the languages its owner published and translated (Translate ›
 * Order emails); the email is the next page of that visit, so it reads the
 * same. Storelib's own pages are English for everyone, and Storelib has no
 * approved translation of a store's emails to stand behind there.
 *
 * WHAT IS KNOWN, IN THIS ORDER: the page Buy was pressed on (the order's
 * origin, lib/orders/order-source.ts), else the channel it was recorded
 * under, else a language the checkout sent (only a website's checkout sends
 * one) or a website address the receipt links to, else the kind of order:
 * an order that ships is placed in the store's checkout, so it keeps the
 * website's language as it always has; a download with nothing known is
 * Storelib's.
 *
 * Pure and browser safe.
 */

export type BuyerChannel = "website" | "storelib"
export type EmailFamily = "digital" | "physical" | "communities"

/** Pages on Storelib itself: the creator page, a product page, the OnePage, Explore, a link, an admin test sale. */
const STORELIB_SURFACES = new Set(["profile", "onepage", "product", "explore", "link", "admin"])

export interface ChannelFacts {
  family: EmailFamily
  /** The order's origin surface (orders.source_detail.surface). */
  surface?: unknown
  /** orders.source: "website" | "storelib". */
  source?: unknown
  /** The language the checkout was in (orders.source_detail.lang); only a website's checkout records one. */
  lang?: unknown
  /** The website the receipt links to (a site checkout, app/checkout/site). */
  siteBase?: unknown
}

export function buyerChannel(f: ChannelFacts): BuyerChannel {
  if (f.family === "communities") return "storelib"
  const surface = typeof f.surface === "string" ? f.surface : ""
  if (surface === "website") return "website"
  if (STORELIB_SURFACES.has(surface)) return "storelib"
  if (f.source === "website") return "website"
  if (f.source === "storelib") return "storelib"
  if (typeof f.lang === "string" && f.lang.trim()) return "website"
  if (typeof f.siteBase === "string" && /^https:\/\//i.test(f.siteBase)) return "website"
  return f.family === "physical" ? "website" : "storelib"
}

/**
 * THE STORE'S OWN WORDS (Settings › Customer emails) are written in its
 * website's language, the one the dashboard edits them for. An email in that
 * language carries them; one in another language gets Storelib's standard
 * words in that language, so a French buyer never reads an English paragraph
 * in the middle of a French email. A creator with no website writes in
 * English, which is then their own.
 */
export function ownWordsApply(emailLang: string, websiteLang: string | null | undefined): boolean {
  const base = (s: string) => s.toLowerCase().split("-")[0]
  return base(emailLang || "en") === base(websiteLang || "en")
}

/** Who signs a buyer's email: the shop on its website, the creator everywhere else. */
export function signedBy(channel: BuyerChannel): "shop" | "creator" {
  return channel === "website" ? "shop" : "creator"
}
