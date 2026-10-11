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
 *   /account           main_account    orders, profile, wishlist, sign out
 *   /account/login     main_login      an email, then the code sent to it
 *   /wishlist          main_wishlist   the products a visitor saved
 *   /contact           contact         a message to the creator
 *
 * A creator who opens one in the builder gets exactly this, and once they
 * save it the stored page is what is served. The section ids are fixed, not
 * generated, so the same page renders the same twice.
 */
import type { SectionInstance } from "@/lib/website-builder/types"
import { chromeOf, withUniversalChrome } from "@/lib/website-builder/universal-chrome"

/** The page keys, and the address each is served at. */
export const ACCOUNT_PAGE_PATHS: Readonly<Record<string, string>> = Object.freeze({
  account: "/account",
  login: "/account/login",
  wishlist: "/wishlist",
  contact: "/contact",
})

function page(homeSections: SectionInstance[], main: SectionInstance): SectionInstance[] {
  /* The header group and the footer group, announcement bars included: lib/website-builder/universal-chrome.ts. */
  return withUniversalChrome([main], chromeOf(homeSections))
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

/**
 * /reviews (Storelib Reviews): every review of the shop, in the All reviews
 * section, between the header and the footer. Served by
 * app/(site)/w/[username]/reviews; a page the creator made called "reviews"
 * is served there instead once saved.
 */
export function reviewsSections(homeSections: SectionInstance[]): SectionInstance[] {
  return page(homeSections, main("storelib-reviews", "reviews_all", "All reviews", homeSections))
}

/**
 * THE PASSWORD PAGE stands on its own, the way Shopify's does: no header,
 * no footer, nothing to click through to, because everything behind those
 * links is behind the password too. One section, on the site's own ground.
 * Served at /password while the website asks for a password
 * (lib/site-password), and opened in the builder like any other page.
 */
export function passwordSections(homeSections: SectionInstance[]): SectionInstance[] {
  return [main("storelib-password", "main_password", "Password page", homeSections)]
}

/** The generated page for a key, or null when the key is not one of these. */
export function accountPageSections(key: string, homeSections: SectionInstance[]): SectionInstance[] | null {
  switch (key) {
    case "password":
      return passwordSections(homeSections)
    case "account":
      return accountSections(homeSections)
    case "login":
      return loginSections(homeSections)
    case "wishlist":
      return wishlistSections(homeSections)
    case "contact":
      return contactSections(homeSections)
    case "reviews":
      return reviewsSections(homeSections)
    default:
      return null
  }
}

/**
 * What the sign in page says when a step of signing in stopped
 * (app/api/site-account/code and /verify send `?error=<why>`,
 * lib/site-accounts/sign-in.ts). Fixed words for fixed reasons: nothing from
 * the address is ever printed, and none of them says whether an email has an
 * account here.
 */
export function signInNotice(error: unknown): string | null {
  switch (error) {
    case "email":
      return "Enter a valid email address."
    case "code":
      return "That code is not right. Check it and try again."
    case "expired":
      return "That code has expired. Send a new one."
    case "tries":
      return "Too many tries with that code. Send a new one."
    case "restart":
      return "That sign in has expired. Enter your email to get a new code."
    case "limit":
      return "Too many codes asked for at once. Try again in a few minutes."
    case "send":
      return "The email with your code could not be sent. Try again in a minute."
    case "site":
    case "unavailable":
      return "Signing in on this website is not available yet."
    case "failed":
      return "Something went wrong. Try again."
    default:
      return null
  }
}
