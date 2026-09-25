/**
 * ===========================================================================
 *  WHAT EVERY SECTION CAN READ ABOUT THE STORE IT IS ON
 * ===========================================================================
 * A section used to know its own settings, its blocks, the theme and the
 * shop's products, and nothing about the store itself. So a contact section
 * had its creator's name typed into a heading, a footer its social links
 * typed again, and a link to the account page was a string somebody had to
 * know. Four objects, read the way a Shopify theme reads its globals:
 *
 *   shop       the store: name, tagline, logo, support email, social links
 *   routes     the addresses the platform answers on every website
 *   customer   the signed-in visitor on the account page, null everywhere else
 *   wishlist   the visitor's saved products on the pages that show them
 *
 * `shop` is built from the published theme settings, which every surface
 * has, plus what only the server knows (the creator's support email, and
 * their name when the store has none set). `routes` is fixed: it is the list
 * of addresses proxy.ts and app/(site)/w route to, written once. `customer`
 * and `wishlist` are per visitor, so they are only ever given on a page that
 * is drawn for one visitor (force-dynamic, never cached); on a cached page
 * they are null and the page's own code fills in hearts and counts.
 *
 * Pure and dependency free: the engine renders on the server, in the builder
 * and in tests with the same answer.
 */

export interface SocialLink {
  key: string
  label: string
  url: string
}

export interface ShopObject {
  name: string
  tagline: string
  logo: string
  /** The support email from Settings, when the page was given it. Never the account's login email. */
  email: string
  url: string
  socials: SocialLink[]
}

/** The customer on the account page: see lib/site-accounts/account-data.ts. */
export type CustomerObject = Record<string, unknown> | null

export interface WishlistObject {
  /** Product cards, block-shaped like `products`. */
  items: { id: string; type: string; settings: Record<string, unknown> }[]
  count: number
  /** True when the list is the signed-in account's rather than this browser's. */
  signed_in: boolean
}

export interface StorefrontGlobals {
  shop?: Partial<ShopObject>
  customer?: CustomerObject
  wishlist?: WishlistObject | null
}

/**
 * The addresses every Storelib website answers on. Shopify names most of
 * these the same way, so a section written for one reads naturally here.
 * The two that leave for storelib.com to sign in are routes on the website's
 * own host (app/api/site-account/start), which remember where to come back to.
 */
export const SITE_ROUTES = Object.freeze({
  root_url: "/",
  products_url: "/products",
  search_url: "/search",
  cart_url: "/cart",
  contact_url: "/contact",
  wishlist_url: "/wishlist",
  account_url: "/account",
  account_login_url: "/account/login",
  /** Leaves for Storelib to sign in, and comes back to the account page. */
  account_signin_url: "/api/site-account/start?return=%2Faccount",
  /** Leaves for Storelib to make an account, and comes back to the account page. */
  account_register_url: "/api/site-account/start?return=%2Faccount&mode=signup",
  account_logout_url: "/account/logout",
})

/** The theme's social links, in the order the footer draws them. */
const SOCIALS: [string, string][] = [
  ["social_instagram", "Instagram"],
  ["social_twitter", "X"],
  ["social_facebook", "Facebook"],
  ["social_tiktok", "TikTok"],
  ["social_youtube", "YouTube"],
  ["social_linkedin", "LinkedIn"],
  ["social_discord", "Discord"],
  ["social_pinterest", "Pinterest"],
  ["social_twitch", "Twitch"],
  ["social_github", "GitHub"],
]

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

/** Only an address a visitor can open: https, http, or a path. Anything else is left out. */
function linkable(v: unknown): string {
  const s = text(v)
  return /^(https?:\/\/|\/(?!\/))/i.test(s) ? s : ""
}

/** The `shop` object for a page, from the theme's own settings and what the server added. */
export function shopObject(theme: Record<string, unknown>, extra: Partial<ShopObject> = {}): ShopObject {
  const socials = SOCIALS.flatMap(([key, label]) => {
    const url = linkable(theme[key])
    return url ? [{ key: key.replace(/^social_/, ""), label, url }] : []
  })
  const email = text(extra.email)
  return {
    name: text(theme.brand_name) || text(extra.name),
    tagline: text(theme.tagline) || text(extra.tagline),
    logo: text(theme.logo_url) || text(extra.logo),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "",
    url: "/",
    socials,
  }
}
