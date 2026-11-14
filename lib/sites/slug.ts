/**
 * Site slugs and page slugs.
 *
 * A site slug becomes a hostname — `{slug}.storelib.com` — so it is bound by
 * DNS rules, not by what looks tidy: lowercase, letters/digits/hyphens, no
 * leading or trailing hyphen, 3–63 characters. A page slug becomes a path
 * segment and may be a little freer, but not much, because it is also the
 * storage key (`store_theme_pages.page_key`).
 *
 * RESERVED WORDS ARE NOT OPTIONAL HERE. `lib/reserved-words.ts` already exists
 * for exactly this reason on usernames — a subdomain called `www`, `api`,
 * `admin` or `mail` is not a cosmetic problem, it is a routing collision and,
 * in the case of `mail`, a way to receive somebody's email. It is reused rather
 * than re-listed.
 */

import { isReservedWord } from "@/lib/reserved-words"
import { isPhishingName } from "@/lib/security/phishing-names"

const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/
const PAGE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62})$/

/** Best-effort conversion of a name a human typed into a legal slug. */
export function toSiteSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "")
}

/** Null when the slug is usable, otherwise why it is not. */
export function siteSlugError(slug: string): string | null {
  if (slug.length < 3) return "Use at least 3 characters."
  if (slug.length > 63) return "Use at most 63 characters."
  if (!HOSTNAME_LABEL.test(slug)) {
    return "Use lowercase letters, numbers and hyphens, starting and ending with a letter or number."
  }
  // `xn--` is the punycode prefix; a slug that starts with it can claim to be
  // an internationalised domain it is not.
  if (slug.startsWith("xn--")) return "That address is not available."
  if (isReservedWord(slug)) return "That address is reserved."
  return null
}

/**
 * AN ADDRESS BEING CHOSEN NOW (round AW). The site's own name becomes
 * <slug>.storelib.com, and an AI-built site runs whatever script it was
 * written with, so "PayPal Login" made paypal-login.storelib.com: a phishing
 * page on Storelib's domain before anything was on it. Usernames, OnePage
 * names and a website's own name were already refused for that
 * (lib/security/phishing-names.ts); AI site addresses were the one way round.
 *
 * Only for a NEW address (creating a site, a first publish). An address a
 * site already has is checked with siteSlugError alone, so a published site
 * never moves (the rule phishing-names.ts keeps: names already taken keep
 * working).
 */
export function newSiteSlugError(slug: string): string | null {
  return siteSlugError(slug) ?? (isPhishingName(slug) ? "That address is not available." : null)
}

export function toPageSlug(input: string): string {
  return toSiteSlug(input)
}

/** Null when the page slug is usable, otherwise why it is not. */
export function pageSlugError(slug: string): string | null {
  if (!slug) return "Give the page an address."
  if (slug.length > 63) return "Use at most 63 characters."
  if (!PAGE_SLUG.test(slug)) {
    return "Use lowercase letters, numbers and hyphens."
  }
  return null
}

/**
 * Turn a site name into an address nobody else has.
 *
 * "Portfolio Website" wants to be `portfolio-website`. So does everybody
 * else's, which is the whole problem: the address is derived from a name
 * people did not choose to be unique, and two creators picking the same
 * obvious name must not fight over one URL.
 *
 * The ladder, in order, and each rung exists because the one above it runs
 * out:
 *
 *   portfolio-website          the name, if it is free
 *   portfolio-website-2..9     a number, which reads as "the second one"
 *   portfolio-website-a1b2     four random characters, once numbers are gone
 *
 * Numbers before random suffixes because `-2` is something a person can say
 * out loud and `-a1b2` is not. Random rather than a longer count because
 * counting to 50 means 50 round trips on a popular name.
 *
 * `isTaken` is injected so this is testable without a database, and so the
 * same ladder can be reused for any namespace later.
 */
export const SLUG_FALLBACK = "site"

/** Unambiguous characters only — no 0/o, 1/l/i — because people read these out. */
const SUFFIX_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

function randomSuffix(length = 4): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ""
  for (const byte of bytes) out += SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]
  return out
}

/** Keep a suffix from pushing the slug past the 63-character limit. */
function withSuffix(base: string, suffix: string): string {
  const room = 63 - suffix.length - 1
  return `${base.slice(0, room).replace(/-+$/g, "")}-${suffix}`
}

export async function allocateSiteSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  // A name of pure punctuation, or one so short it fails the length rule,
  // still has to produce an address — it just does not get to keep the name.
  // A name that reads as a sign in page or a bank's desk (newSiteSlugError)
  // gets the same plain fallback.
  let base = toSiteSlug(name)
  if (newSiteSlugError(base)) base = SLUG_FALLBACK

  if (!newSiteSlugError(base) && !(await isTaken(base))) return base

  for (let n = 2; n <= 9; n++) {
    const candidate = withSuffix(base, String(n))
    if (!newSiteSlugError(candidate) && !(await isTaken(candidate))) return candidate
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = withSuffix(base, randomSuffix())
    if (!newSiteSlugError(candidate) && !(await isTaken(candidate))) return candidate
  }

  /**
   * Twelve random four-character suffixes all colliding is not a namespace
   * problem, it is a broken `isTaken`. Falling back to something longer would
   * hide that; throwing surfaces it while the site is still unpublished.
   */
  throw new Error(`Could not find a free address for "${name}".`)
}
