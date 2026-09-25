/**
 * ===========================================================================
 *  THE ACCOUNT, SIGN IN, WISHLIST AND CONTACT PAGES EVERY WEBSITE HAS
 * ===========================================================================
 * Like the shop and the search page (./shop-page.ts), these exist on every
 * website from the day it is published, on every theme, because they are
 * made of the website's own pieces: the home page's header and footer, and
 * one section each that reads the store and the visitor through the
 * template globals (lib/storelib-theme/globals.ts), so nothing in them is
 * typed twice.
 *
 *   /account           main_account    orders, saved items, sign out
 *   /account/login     main_login      sign in with Storelib, come back
 *   /wishlist          main_wishlist   the products a visitor saved
 *   /contact           contact         a message to the creator
 *
 * A creator who opens one in the builder gets exactly this, and once they
 * save it the stored page is what is served. The section ids are fixed, not
 * generated, so the same page renders the same twice.
 */
import type { SectionInstance } from "@/lib/website-builder/types"

/** The page keys, and the address each is served at. */
export const ACCOUNT_PAGE_PATHS: Readonly<Record<string, string>> = Object.freeze({
  account: "/account",
  login: "/account/login",
  wishlist: "/wishlist",
  contact: "/contact",
})

function chrome(homeSections: SectionInstance[]) {
  return {
    header: homeSections.find((s) => s.type === "header"),
    footer: homeSections.find((s) => s.type === "footer"),
  }
}

function page(homeSections: SectionInstance[], main: SectionInstance): SectionInstance[] {
  const { header, footer } = chrome(homeSections)
  return [...(header ? [header] : []), main, ...(footer ? [footer] : [])]
}

/**
 * THE SITE'S OWN GROUND. A dark theme's pages sit on its dark scheme: Studio
 * Noir's header and body are "black", and a sign in page drawn on the
 * section's default "white" would be a white page between a black header and
 * a black footer. The header is the one section every site has and every
 * theme sets, so its scheme is the page's; "white" is the sections' own
 * default, so it is not written at all.
 */
export function baseScheme(homeSections: SectionInstance[]): string | null {
  const header = homeSections.find((s) => s.type === "header")
  const scheme = (header?.settings as Record<string, unknown> | undefined)?.color_scheme
  return typeof scheme === "string" && scheme && scheme !== "white" ? scheme : null
}

function main(id: string, type: string, name: string, homeSections: SectionInstance[]): SectionInstance {
  /* Settings left empty but for the ground: every other value is the
     section's own default, so a change to a default reaches every site that
     never changed it. */
  const scheme = baseScheme(homeSections)
  return { id, type, name, settings: scheme ? { color_scheme: scheme } : {}, blocks: [], hidden: false }
}

export function accountSections(homeSections: SectionInstance[]): SectionInstance[] {
  return page(homeSections, main("storelib-account", "main_account", "Account", homeSections))
}

export function loginSections(homeSections: SectionInstance[]): SectionInstance[] {
  return page(homeSections, main("storelib-login", "main_login", "Sign in", homeSections))
}

export function wishlistSections(homeSections: SectionInstance[]): SectionInstance[] {
  return page(homeSections, main("storelib-wishlist", "main_wishlist", "Wishlist", homeSections))
}

export function contactSections(homeSections: SectionInstance[]): SectionInstance[] {
  return page(homeSections, main("storelib-contact", "contact", "Contact form", homeSections))
}

/** The generated page for a key, or null when the key is not one of these. */
export function accountPageSections(key: string, homeSections: SectionInstance[]): SectionInstance[] | null {
  switch (key) {
    case "account":
      return accountSections(homeSections)
    case "login":
      return loginSections(homeSections)
    case "wishlist":
      return wishlistSections(homeSections)
    case "contact":
      return contactSections(homeSections)
    default:
      return null
  }
}

/**
 * What the sign in page says when the last step of signing in refused a
 * code (app/api/site-account/exchange sends `?error=<why>`). Fixed words for
 * fixed reasons: nothing from the address is ever printed.
 */
export function signInNotice(error: unknown): string | null {
  switch (error) {
    case "expired":
      return "That sign in took too long. Sign in again."
    case "used":
      return "That sign in link was already used. Sign in again."
    case "mismatch":
      return "That sign in did not finish in this browser. Sign in again."
    case "unavailable":
      return "Signing in on this website is not available yet. Your orders are in your Storelib Library."
    default:
      return null
  }
}
