/**
 * ===========================================================================
 *  WHICH VINTED, AND WHICH MEMBER
 * ===========================================================================
 *
 * Split out of lib/import/vinted.ts and deliberately NOT `server-only`: this
 * half is pure string work with no network in it, so it can be unit-tested
 * directly and reused to validate the field before a request is ever made. The
 * half that opens sessions and fetches wardrobes stays server-only.
 *
 * ---------------------------------------------------------------------------
 * THE COUNTRY TABLE IS THE LOAD-BEARING PART
 * ---------------------------------------------------------------------------
 * A Vinted member id is global; their wardrobe is only served by their own
 * country's domain. Member 164822283 on vinted.com reports `item_count: 5` and
 * returns an EMPTY wardrobe with HTTP 200 — not an error, not a redirect, just
 * zero items. The same id on vinted.co.uk returns all five. Every import has to
 * resolve the country before it asks for anything, or it succeeds and finds
 * nothing.
 */

/** Vinted country_code → the host that actually serves that member's items.
 *
 *  Their country_code is mostly ISO-3166 but not entirely — the United Kingdom
 *  is "UK" here rather than "GB", which is exactly the kind of near-miss that
 *  makes a table written from memory fail for one country and only one
 *  country. Both spellings are listed so it cannot matter which they send. */
export const HOST_BY_COUNTRY: Record<string, string> = {
  UK: "www.vinted.co.uk",
  GB: "www.vinted.co.uk",
  IE: "www.vinted.ie",
  US: "www.vinted.com",
  CA: "www.vinted.ca",
  FR: "www.vinted.fr",
  DE: "www.vinted.de",
  AT: "www.vinted.at",
  ES: "www.vinted.es",
  IT: "www.vinted.it",
  PT: "www.vinted.pt",
  NL: "www.vinted.nl",
  BE: "www.vinted.be",
  LU: "www.vinted.lu",
  PL: "www.vinted.pl",
  CZ: "www.vinted.cz",
  SK: "www.vinted.sk",
  HU: "www.vinted.hu",
  RO: "www.vinted.ro",
  HR: "www.vinted.hr",
  SI: "www.vinted.si",
  GR: "www.vinted.gr",
  SE: "www.vinted.se",
  DK: "www.vinted.dk",
  FI: "www.vinted.fi",
  LT: "www.vinted.lt",
  LV: "www.vinted.lv",
  EE: "www.vinted.ee",
}

/**
 * Every host a URL may name, and the only hosts anything will make a request
 * to.
 *
 * A pasted URL is untrusted input that the server then fetches, so the set of
 * reachable hosts is closed BY CONSTRUCTION rather than by validating the
 * string. That is the difference between a check somebody can talk their way
 * around and one they cannot: "does this look like Vinted" has an infinite
 * number of near-misses, "is this host in the table" has none.
 */
export const ALLOWED_HOSTS = new Set<string>(Object.values(HOST_BY_COUNTRY))

export class VintedError extends Error {
  constructor(
    message: string,
    readonly code:
      | "bad_url"
      | "not_found"
      | "blocked"
      | "network"
      | "empty_wardrobe"
      | "country_unknown",
  ) {
    super(message)
    this.name = "VintedError"
  }
}

/**
 * The member id out of any Vinted URL.
 *
 * Accepts every shape their site produces: bare id, id-with-handle
 * (`/member/164822283-ead02ox`), any country TLD, with or without `www`, with
 * or without a query string. The host it returns is only a STARTING POINT —
 * the host that can actually serve the wardrobe comes from the member's
 * country and is resolved after the user record is read.
 */
export function parseVintedUrl(input: string): { host: string; memberId: string } {
  const raw = (input || "").trim()
  if (!raw) throw new VintedError("Lipsește adresa profilului.", "bad_url")

  let u: URL
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`)
  } catch {
    throw new VintedError("Adresa nu este un link valid.", "bad_url")
  }

  const host = u.hostname.startsWith("www.") ? u.hostname : `www.${u.hostname}`
  if (!ALLOWED_HOSTS.has(host)) {
    throw new VintedError(`${u.hostname} nu este un domeniu Vinted cunoscut.`, "bad_url")
  }

  // `/member/<id>` or `/member/<id>-<handle>`. The id is the leading digits of
  // the segment AFTER "member"; the handle can itself contain digits, which is
  // why this anchors on the segment rather than searching the whole path.
  const seg = u.pathname.split("/").filter(Boolean)
  const idx = seg.indexOf("member")
  const target = idx >= 0 ? seg[idx + 1] : undefined
  const memberId = (target || "").match(/^(\d+)/)?.[1]
  if (!memberId) {
    throw new VintedError("Linkul trebuie să fie către un profil (/member/...).", "bad_url")
  }
  return { host, memberId }
}
