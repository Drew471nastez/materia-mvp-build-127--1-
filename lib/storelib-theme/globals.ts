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
import { SOCIAL_PLATFORMS } from "@/lib/website-builder/social-links"

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

/**
 * The customer on the account page: `name`, `first_name`, `email`, `orders`
 * (one per payment, each with its `items`, `total`, `status` and the button
 * to its receipt), `orders_count`, and `sample`, true only in the builder,
 * where the name and email are placeholders. See
 * lib/site-accounts/account-data.ts.
 */
export type CustomerObject = Record<string, unknown> | null

export interface WishlistItem {
  id: string
  title: string
  /** Formatted, e.g. "$48.00". */
  price: string
  compare_price: string
  image: string
  url: string
  tag: string
}

export interface WishlistObject {
  /** The saved products, each `{ id, title, price, compare_price, image, url, tag }`. */
  items: WishlistItem[]
  count: number
  /** True when the list is the signed-in account's rather than this browser's. */
  signed_in: boolean
}

/** The saved products as a template reads them, from the shop's product cards. */
export function wishlistObject(cards: { id: string; settings: Record<string, unknown> }[], signedIn: boolean): WishlistObject {
  const s = (v: unknown) => (typeof v === "string" ? v : "")
  const items = cards.map((c) => ({
    id: c.id,
    title: s(c.settings.title),
    price: s(c.settings.price),
    compare_price: s(c.settings.compare_price),
    image: s(c.settings.image),
    url: s(c.settings.url),
    tag: s(c.settings.tag),
  }))
  return { items, count: items.length, signed_in: signedIn }
}

export interface StorefrontGlobals {
  shop?: Partial<ShopObject>
  customer?: CustomerObject
  wishlist?: WishlistObject | null
}

/**
 * The addresses every Storelib website answers on. Shopify names most of
 * these the same way, so a section written for one reads naturally here.
 *
 * Signing in happens on the website itself, with an email and a code
 * (lib/site-accounts/sign-in.ts): the sign in page, and the three form
 * addresses its forms and the account page's profile form post to, all on
 * the website's own host. There is no separate sign up: a new email makes
 * the account, so `account_register_url` is the sign in page too, kept for
 * sections written when it was not.
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
  /** The sign in page. The same page as account_login_url. */
  account_signin_url: "/account/login",
  /** The sign in page as well: a new email makes the account there. */
  account_register_url: "/account/login",
  /** POST `email` (and `return`, a path): sends a code and shows the code step. */
  account_code_url: "/api/site-account/code",
  /** POST `code`: signs the visitor in. */
  account_verify_url: "/api/site-account/verify",
  /** POST `name`: the signed-in customer's name. */
  account_profile_url: "/api/site-account/profile",
  account_logout_url: "/account/logout",
})

/** The theme's social links, in the order the footer draws them (lib/website-builder/social-links.ts). */
const SOCIALS: [string, string][] = SOCIAL_PLATFORMS.map((p) => [p.key, p.label])

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
