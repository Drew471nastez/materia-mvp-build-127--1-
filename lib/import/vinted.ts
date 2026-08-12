import "server-only"

import { HOST_BY_COUNTRY, VintedError, parseVintedUrl } from "@/lib/import/vinted-url"

/**
 * ===========================================================================
 *  READING A VINTED WARDROBE
 * ===========================================================================
 *
 * WHAT THIS IS, PLAINLY
 * ---------------------------------------------------------------------------
 * Vinted has no public API and their terms prohibit automated extraction. This
 * reads their internal endpoints with an anonymous session, which is the same
 * data their own web client fetches. It is here because it was asked for, with
 * the trade-off understood: the listings it copies — and in particular the
 * PHOTOGRAPHS, which are the seller's own work — end up re-hosted on
 * storelib.com, and that exposure sits with Storelib rather than with whoever
 * pasted the URL. Nothing about this file makes that go away, and the page
 * that calls it says so on screen.
 *
 * There are NO credentials anywhere in here. Vinted's anonymous session is
 * minted per request from their own homepage and is worth nothing to anybody;
 * there is no key to leak, which is the one good thing about the arrangement.
 *
 * ---------------------------------------------------------------------------
 * TWO THINGS THAT LOOK LIKE THEY WORK AND DO NOT
 * ---------------------------------------------------------------------------
 *
 * 1. THE PROFILE PAGE HAS NO LISTINGS IN IT. Fetching
 *    https://www.vinted.com/member/164822283 returns 1.5MB of HTML, HTTP 200,
 *    with the member's handle and avatar in the meta tags and ZERO links to
 *    any item — the grid is drawn client-side. Anything that scrapes the HTML
 *    will look like it is working, find nothing, and report an empty wardrobe
 *    for a seller who has fifty things for sale.
 *
 * 2. `/api/v2/catalog/items?user_id=<id>` RETURNS SOMEBODY ELSE'S ITEMS. The
 *    parameter is accepted and silently ignored; the response is the general
 *    catalogue. Asking it for member 164822283 came back with items belonging
 *    to user 3146573973. It is the obvious-looking endpoint and it is a trap:
 *    an importer built on it imports strangers' stock into your seller's shop
 *    and every field looks plausible. The endpoint that actually filters is
 *    `/api/v2/wardrobe/<id>/items`, and it is the only one used here.
 *
 * ---------------------------------------------------------------------------
 * AND THE ONE THAT COSTS AN AFTERNOON: VINTED IS PARTITIONED BY COUNTRY
 * ---------------------------------------------------------------------------
 * A member id is global but their wardrobe is only served by their own
 * country's domain. Member 164822283 on vinted.com reports `item_count: 5` and
 * returns an EMPTY wardrobe with HTTP 200 — not an error, not a redirect, just
 * zero items and `total_pages: 1`. The same id on vinted.co.uk, which is where
 * `country_code: "UK"` says they live, returns all five.
 *
 * So the country is resolved FIRST, from the user record, and the wardrobe is
 * only ever asked of the resolved host. Skipping that step produces a
 * confident, successful, completely empty import.
 */

/** Chrome's, because Vinted serves a challenge to anything that looks like a
 *  script. This is not evasion of a security control — the endpoints are the
 *  ones their own site calls — but the request does have to be well-formed. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

/** A serverless function has a wall-clock ceiling and Vinted occasionally
 *  hangs rather than refusing. Every request here is bounded. */
const TIMEOUT_MS = 15_000

/** Ceilings, so one pasted URL cannot start an unbounded job. A wardrobe
 *  larger than this imports its first 200 and says so — a truncation that is
 *  reported is a decision; a truncation that is silent is a bug. */
export const MAX_PAGES = 10
export const PER_PAGE = 20
export const MAX_ITEMS = MAX_PAGES * PER_PAGE

export interface VintedPhoto {
  url: string
  width: number | null
  height: number | null
}

export interface VintedItem {
  id: string
  title: string
  description: string
  /** As Vinted states it — NOT converted here. Conversion is a separate,
   *  reviewable step in lib/import/mapping.ts. */
  priceAmount: number
  priceCurrency: string
  brand: string | null
  size: string | null
  status: string | null
  catalogId: number | null
  colour: string | null
  url: string
  photos: VintedPhoto[]
}

export interface VintedProfile {
  memberId: string
  login: string
  countryCode: string | null
  host: string
  profileUrl: string
  /** What Vinted claims. Compared against what the wardrobe actually returns,
   *  because a mismatch is the country-domain fault above and the caller needs
   *  to be told rather than shown an empty list. */
  itemCount: number | null
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctl.signal, redirect: "follow" })
  } catch (e: any) {
    if (e?.name === "AbortError") throw new VintedError("Vinted nu a răspuns la timp.", "network")
    throw new VintedError("Nu s-a putut contacta Vinted.", "network")
  } finally {
    clearTimeout(timer)
  }
}

/**
 * An anonymous session for one host.
 *
 * Their API answers 401 to a bare request and 200 to the same request carrying
 * the cookies their homepage hands out — `access_token_web` is the one that
 * matters. This is not a login and there is no account behind it; it is the
 * same anonymous session a first-time visitor gets.
 *
 * Returned as a Cookie header string rather than a jar, because it is used for
 * a handful of requests within one invocation and never persisted. Persisting
 * it would be caching somebody else's session token on our infrastructure for
 * no benefit.
 */
async function openSession(host: string): Promise<string> {
  const res = await timedFetch(`https://${host}/`, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
  })
  // `getSetCookie` is the only accessor that returns ALL Set-Cookie headers —
  // `headers.get("set-cookie")` folds them into one comma-joined string that
  // cannot be split correctly, because cookie Expires values contain commas.
  const jar = res.headers.getSetCookie?.() ?? []
  const pairs = jar
    .map((line) => line.split(";")[0]?.trim())
    .filter((p): p is string => !!p && p.includes("="))
  if (!pairs.length) {
    throw new VintedError("Vinted nu a emis o sesiune — probabil a blocat cererea.", "blocked")
  }
  return pairs.join("; ")
}

async function apiGet(host: string, path: string, cookie: string): Promise<any> {
  const res = await timedFetch(`https://${host}${path}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en",
      Referer: `https://${host}/`,
      Cookie: cookie,
    },
  })
  if (res.status === 401 || res.status === 403) {
    throw new VintedError("Vinted a respins cererea (protecție anti-bot).", "blocked")
  }
  if (res.status === 404) throw new VintedError("Profilul nu există pe acest domeniu.", "not_found")
  if (!res.ok) throw new VintedError(`Vinted a răspuns ${res.status}.`, "network")

  const type = res.headers.get("content-type") || ""
  if (!type.includes("json")) {
    // A challenge page is HTML with a 200. Treated as blocked rather than
    // parsed, so it can never be mistaken for an empty result.
    throw new VintedError("Vinted a returnat o pagină de verificare, nu date.", "blocked")
  }
  return res.json()
}

/**
 * Who this profile belongs to, and — the load-bearing part — WHICH HOST serves
 * their items.
 *
 * The pasted host is used only to ask who the member is. Their `country_code`
 * decides where the wardrobe is read from, because a member id on the wrong
 * domain returns an empty wardrobe with a successful status.
 */
export async function loadProfile(pasted: { host: string; memberId: string }): Promise<VintedProfile> {
  const cookie = await openSession(pasted.host)
  const data = await apiGet(pasted.host, `/api/v2/users/${pasted.memberId}`, cookie)
  const user = data?.user
  if (!user?.id) throw new VintedError("Profilul nu a putut fi citit.", "not_found")

  const countryCode: string | null = typeof user.country_code === "string" ? user.country_code : null
  const resolved = countryCode ? HOST_BY_COUNTRY[countryCode.toUpperCase()] : undefined
  if (countryCode && !resolved) {
    throw new VintedError(
      `Membrul este în ${countryCode}, un domeniu Vinted pe care nu îl cunoaștem.`,
      "country_unknown",
    )
  }

  return {
    memberId: String(user.id),
    login: typeof user.login === "string" ? user.login : String(user.id),
    countryCode,
    host: resolved || pasted.host,
    profileUrl: typeof user.profile_url === "string" ? user.profile_url : `https://${pasted.host}/member/${user.id}`,
    itemCount: Number.isFinite(user.item_count) ? Number(user.item_count) : null,
  }
}

function photosOf(raw: any): VintedPhoto[] {
  const list = Array.isArray(raw?.photos) ? raw.photos : []
  const out: VintedPhoto[] = []
  for (const p of list) {
    // Their shape has drifted across versions; the largest available is
    // preferred and the smaller keys are fallbacks rather than alternatives.
    const url: unknown = p?.full_size_url || p?.url || p?.high_resolution?.url
    if (typeof url !== "string" || !url.startsWith("https://")) continue
    out.push({
      url,
      width: Number.isFinite(p?.width) ? Number(p.width) : null,
      height: Number.isFinite(p?.height) ? Number(p.height) : null,
    })
  }
  return out
}

function itemFrom(raw: any, host: string): VintedItem | null {
  const id = raw?.id != null ? String(raw.id) : null
  if (!id) return null

  // Sold, hidden, reserved and draft items are not for sale and importing them
  // would put things in the feed that cannot be bought. `is_visible` is only
  // trusted when present — an absent flag means the wardrobe endpoint did not
  // say, and the wardrobe endpoint only returns active items anyway.
  if (raw?.is_closed || raw?.is_hidden || raw?.is_draft || raw?.is_reserved) return null
  if (raw?.is_visible === false) return null

  const amount = Number.parseFloat(raw?.price?.amount ?? raw?.total_item_price?.amount ?? "")
  const currency = raw?.price?.currency_code ?? raw?.currency ?? null
  if (!Number.isFinite(amount) || typeof currency !== "string") return null

  const path = typeof raw?.path === "string" ? raw.path : `/items/${id}`

  return {
    id,
    title: typeof raw?.title === "string" ? raw.title.trim() : "",
    description: typeof raw?.description === "string" ? raw.description.trim() : "",
    priceAmount: amount,
    priceCurrency: currency.toUpperCase(),
    brand: typeof raw?.brand === "string" ? raw.brand : (raw?.brand_title ?? null),
    size: typeof raw?.size === "string" ? raw.size : (raw?.size_title ?? null),
    status: typeof raw?.status === "string" ? raw.status : null,
    catalogId: Number.isFinite(raw?.catalog_id) ? Number(raw.catalog_id) : null,
    colour: typeof raw?.color1 === "string" ? raw.color1 : null,
    url: typeof raw?.url === "string" ? raw.url : `https://${host}${path}`,
    photos: photosOf(raw),
  }
}

/**
 * The fields the wardrobe listing does NOT carry.
 *
 * `/api/v2/wardrobe/<id>/items` returns title, price, brand, size, status,
 * photos and url — verified against a live profile — but NOT `description` and
 * NOT `catalog_id`. Those only exist on the per-item record, which is one
 * request per item and therefore only worth making for items somebody has
 * actually chosen to import.
 *
 * BEST EFFORT, DELIBERATELY. Every call is wrapped by the caller and a failure
 * returns null rather than throwing: a listing that imports with its photos,
 * price and size but no description is a listing the seller can finish in
 * thirty seconds, whereas an import that aborts on item 14 of 30 leaves them
 * with half a shop and no way to tell which half.
 */
export async function loadItemDetail(
  host: string,
  itemId: string,
  cookie: string,
): Promise<{ description: string | null; catalogId: number | null; colour: string | null } | null> {
  try {
    const data = await apiGet(host, `/api/v2/items/${itemId}`, cookie)
    const it = data?.item ?? data
    if (!it) return null
    return {
      description: typeof it.description === "string" ? it.description.trim() : null,
      catalogId: Number.isFinite(it.catalog_id) ? Number(it.catalog_id) : null,
      colour: typeof it.color1 === "string" ? it.color1 : null,
    }
  } catch {
    return null
  }
}

/** Re-exported so callers have ONE import site for the whole adapter and do
 *  not have to know which half of it is server-only. */
export { VintedError, parseVintedUrl }

/** Exposed so the import route can open ONE session and reuse it across every
 *  detail request, rather than minting a session per item. */
export { openSession }

export interface WardrobeResult {
  profile: VintedProfile
  items: VintedItem[]
  /** True when the wardrobe was longer than MAX_ITEMS and the tail was not
   *  read. Surfaced in the UI — a cap nobody is told about reads as "that is
   *  everything they had". */
  truncated: boolean
  /** Items the wardrobe returned that were skipped as sold/hidden/reserved. */
  skipped: number
}

/**
 * Every active listing on a profile, in the order Vinted returns them — which
 * is their newest-first order, and is the order they get created in so the
 * shop reads the same way on both sites.
 */
export async function loadWardrobe(profileUrl: string): Promise<WardrobeResult> {
  const parsed = parseVintedUrl(profileUrl)
  const profile = await loadProfile(parsed)

  // A fresh session on the RESOLVED host. The session from the pasted host is
  // not valid here and reusing it is how this silently 401s on any member who
  // is not on the domain that was pasted.
  const cookie = await openSession(profile.host)

  const items: VintedItem[] = []
  let skipped = 0
  let truncated = false
  let page = 1

  for (; page <= MAX_PAGES; page++) {
    const data = await apiGet(
      profile.host,
      `/api/v2/wardrobe/${profile.memberId}/items?page=${page}&per_page=${PER_PAGE}`,
      cookie,
    )
    const raw = Array.isArray(data?.items) ? data.items : []
    for (const r of raw) {
      const it = itemFrom(r, profile.host)
      if (it) items.push(it)
      else skipped++
    }
    const totalPages = Number(data?.pagination?.total_pages ?? 1)
    if (page >= totalPages) break
    if (page === MAX_PAGES && totalPages > MAX_PAGES) truncated = true
  }

  if (!items.length) {
    // The difference that matters: a genuinely empty shop, versus the
    // country-domain fault reading as an empty shop. `item_count` comes from
    // the user record and is not domain-specific, so a positive count with an
    // empty wardrobe is the second case and says so.
    if (profile.itemCount && profile.itemCount > 0) {
      throw new VintedError(
        `Vinted spune că profilul are ${profile.itemCount} anunțuri, dar ${profile.host} nu a returnat niciunul.`,
        "empty_wardrobe",
      )
    }
    throw new VintedError("Profilul nu are anunțuri active.", "empty_wardrobe")
  }

  return { profile, items, truncated, skipped }
}
