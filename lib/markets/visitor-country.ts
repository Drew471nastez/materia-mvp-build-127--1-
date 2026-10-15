/**
 * ===========================================================================
 *  THE VISITOR'S COUNTRY: WHAT THEY CHOSE, ELSE WHERE THEY ARE
 * ===========================================================================
 * One reading for every place that places a website visitor in a market:
 * the proxy (the market and the country it names to an imported theme),
 * the imported theme's route, the builder theme's selector and checkout.
 *
 * A choice is remembered in `sl_country` as "2.RO" (a country) or "2.home"
 * (the store's own prices). The "2." says the visitor chose it in a
 * selector that showed their real country. A cookie without it was written
 * before that: an imported theme's selector showed a market's first country
 * in the alphabet ("Åland Islands (BRL)" to a visitor in Romania, the
 * owner), and every language change posted that country back as if it had
 * been chosen, so it was kept for a year. Such a cookie is never read and
 * the proxy clears it (FORGET_COUNTRY_COOKIE).
 *
 * Where they are is Vercel's x-vercel-ip-country, else Cloudflare's
 * cf-ipcountry; anything that is not a real country (XX, T1) is unknown.
 *
 * Pure. Runs in the proxy, on the server and in the browser.
 */
import { COUNTRY_CODES } from "@/lib/checkout/countries"

export const COUNTRY_COOKIE = "sl_country"
const VERSION = "2"
const MAX_AGE = 31_536_000

/** A real country's code in capitals, else null. */
export function knownCountry(v: unknown): string | null {
  const c = typeof v === "string" ? v.trim().toUpperCase() : ""
  return /^[A-Z]{2}$/.test(c) && COUNTRY_CODES.has(c) ? c : null
}

/** The cookie's value for a choice: a country, or "home" for the store's own prices. Null for anything else. */
export function countryCookieValue(choice: string | null | undefined): string | null {
  if (choice === "home") return `${VERSION}.home`
  const c = knownCountry(choice)
  return c ? `${VERSION}.${c}` : null
}

/** The whole Set-Cookie line for a choice, or null when it is not one. */
export function countryCookieHeader(choice: string | null | undefined): string | null {
  const v = countryCookieValue(choice)
  return v ? `${COUNTRY_COOKIE}=${v}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax; Secure` : null
}

/** Clears a cookie that is not a choice (readCountryCookie `stale`). */
export const FORGET_COUNTRY_COOKIE = `${COUNTRY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`

/**
 * The visitor's choice from the cookie's raw value: a country, "home", or
 * null. `stale` is a cookie that is there but is not a choice: written
 * before choices were marked, or naming no real country.
 */
export function readCountryCookie(raw: string | null | undefined): { choice: string | null; stale: boolean } {
  if (raw === null || raw === undefined || raw === "") return { choice: null, stale: false }
  let v = raw
  try {
    v = decodeURIComponent(raw)
  } catch {
    /* read as it came */
  }
  const m = /^2\.(home|[A-Za-z]{2})$/.exec(v.trim())
  if (!m) return { choice: null, stale: true }
  if (m[1] === "home") return { choice: "home", stale: false }
  const c = knownCountry(m[1])
  return c ? { choice: c, stale: false } : { choice: null, stale: true }
}

/** The `sl_country` value in a Cookie header, raw. */
export function countryCookieIn(cookieHeader: string | null | undefined): string | null {
  return cookieHeader ? (/(?:^|;\s*)sl_country=([^;]*)/.exec(cookieHeader)?.[1] ?? null) : null
}

/** Where the connection is, from the request's headers: Vercel's, else Cloudflare's. */
export function seenCountry(headers: { get(name: string): string | null }): string | null {
  return knownCountry(headers.get("x-vercel-ip-country")) ?? knownCountry(headers.get("cf-ipcountry"))
}

/** The visitor's country: the one they chose (`chosen`, the cookie's raw value), else where they are. Null for "home" or unknown. */
export function visitorCountryFrom(chosen: string | null | undefined, seen: string | null | undefined): string | null {
  const { choice } = readCountryCookie(chosen)
  if (choice === "home") return null
  return choice ?? knownCountry(seen)
}
