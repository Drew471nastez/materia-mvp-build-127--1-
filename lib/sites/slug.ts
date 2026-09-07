/**
 * Site slugs and page slugs.
 *
 * A site slug becomes a hostname — `{slug}.storelib.site` — so it is bound by
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
