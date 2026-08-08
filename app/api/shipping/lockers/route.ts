import { NextResponse, type NextRequest } from "next/server"

import { listFixedLocations, type EawbLocker } from "@/lib/eawb"
import { distanceKm, isUsableCoord } from "@/lib/geo"
import { normalizeLocker } from "@/lib/shipping/locker"

/**
 * ===========================================================================
 *  LOCKER SEARCH — what a buyer picks at checkout
 * ===========================================================================
 *   GET /api/shipping/lockers?county=Cluj&q=profi&carrier=6&dropOff=1
 *
 * Public on purpose, and safe to be: it returns the same public list of
 * easyboxes and parcel machines the couriers publish on their own websites —
 * names, streets and opening hours. Nothing about our account, our orders or
 * our customers passes through here, and the credential that fetches it never
 * leaves the server.
 *
 * ---------------------------------------------------------------------------
 * Why it is cached hard
 * ---------------------------------------------------------------------------
 * Romania has 12,079 of these. The provider returns ALL of them in one
 * response, with schedules and coordinates — several megabytes. Fetching that
 * per keystroke of a buyer's search box would be absurd, so the whole list is
 * held in module memory and re-fetched at most once an hour.
 *
 * A cache in module scope is normally the wrong answer in serverless — this
 * file argues elsewhere that instances do not share memory — but the reasoning
 * inverts for a READ of public, slow-moving data: a cold instance simply
 * fetches once, and the worst case of a stale entry is a locker that opened
 * last week not appearing until the hour turns. That is not a correctness
 * problem the way a missed rate limit or a duplicated shipment is.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Lockers move rarely. An hour is far below how often the list changes and
 *  far above how often a checkout page asks. */
const TTL_MS = 60 * 60 * 1000
/**
 * Enough to choose from; small enough to render and to send.
 *
 * THIS CAP WAS THE "INVISIBLE LOCKERS" BUG. Bucharest county has 2,276 active
 * lockers and a text search returned sixty of them, so the map drew sixty and
 * the rest simply did not exist as far as the browser was concerned. It looked
 * like a rendering fault and was a truncation.
 */
const MAX_RESULTS = 60

/**
 * The cap when the caller asks for a specific rectangle of the world.
 *
 * Higher, because a viewport query is already bounded by geography — at street
 * zoom a city block holds a handful of lockers, and the only way to reach this
 * number is to zoom out far enough that clustering is doing the work anyway.
 *
 * Not unlimited: 2,276 normalised lockers is roughly half a megabyte, which is
 * not a thing to send to a phone on mobile data because someone panned.
 */
const MAX_IN_BOUNDS = 400

let cache: { at: number; country: string; items: EawbLocker[] } | null = null

async function lockersFor(country: string): Promise<EawbLocker[]> {
  if (cache && cache.country === country && Date.now() - cache.at < TTL_MS) return cache.items
  const items = await listFixedLocations(country)
  cache = { at: Date.now(), country, items }
  return items
}

/** Diacritic- and case-insensitive contains. "Bucuresti" must find
 *  "București", because nobody types the comma-below on a phone. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

/**
 * Does every word of the query appear in this locker's text?
 *
 * A plain substring match was wrong in both directions, and both were easy to
 * hit:
 *
 *   "profi bucuresti"  found NOTHING, because those two words are far apart in
 *                      "PROFI VACARESTI, Str. Vacaresti 391, Sector 4,
 *                      Bucuresti" and a substring has to be contiguous.
 *
 *   "sector 3"         matched "Sector 4 ... 391", because the bare "3" is
 *                      inside "391".
 *
 * So: every token must be present (AND, not OR — extra words should narrow the
 * list, which is what people expect when they add one), and a SHORT NUMERIC
 * token must match on a word boundary so a house number cannot satisfy a
 * sector number. Longer numbers are left as substrings, because "391" finding
 * "3910" is harmless and postcode-ish prefixes are useful.
 */
function matchesQuery(haystack: string, tokens: string[]): boolean {
  for (const t of tokens) {
    if (/^\d{1,2}$/.test(t)) {
      // \b would not do: the fold keeps punctuation, and "sector 3," must match.
      if (!new RegExp(`(^|[^0-9])${t}([^0-9]|$)`).test(haystack)) return false
    } else if (!haystack.includes(t)) {
      return false
    }
  }
  return true
}

/** Split a query into the words that must all appear. */
function tokenise(q: string): string[] {
  return fold(q)
    .split(/[\s,._-]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const country = (url.searchParams.get("country") || "RO").toUpperCase().slice(0, 2)
  const county = url.searchParams.get("county")?.trim() || ""
  const locality = url.searchParams.get("locality")?.trim() || ""
  const q = url.searchParams.get("q")?.trim() || ""
  const carrier = Number(url.searchParams.get("carrier") || 0)
  // The seller drops the parcel off, so for the SENDER side only lockers that
  // accept drop-offs are usable. A buyer collecting has no such constraint.
  const dropOffOnly = url.searchParams.get("dropOff") === "1"

  try {
    const all = await lockersFor(country)
    const fCounty = fold(county)
    const fLocality = fold(locality)
    const qTokens = tokenise(q)

    // A coordinate turns this from a search into a "what is near me" list, and
    // it is the buyer's own position — never stored, never logged, used only to
    // sort this one response.
    const lat = Number(url.searchParams.get("lat"))
    const lng = Number(url.searchParams.get("lng"))
    const origin = isUsableCoord({ lat, lng }) ? { lat, lng } : null

    /**
     * The rectangle the map is currently showing: "minLat,minLng,maxLat,maxLng".
     *
     * When present it REPLACES the result cap with a geographic one, which is
     * what makes every locker in view actually reach the browser. Panning
     * somewhere else fetches that somewhere else, so the total sent stays
     * bounded no matter how many lockers the country has.
     */
    const bboxParam = url.searchParams.get("bbox") ?? ""
    const bboxParts = bboxParam.split(",").map(Number)
    const bbox =
      bboxParts.length === 4 && bboxParts.every((n) => Number.isFinite(n))
        ? {
            // Sorted rather than trusted, so a caller that sends the corners in
            // the other order gets its lockers instead of an empty rectangle.
            minLat: Math.min(bboxParts[0], bboxParts[2]),
            maxLat: Math.max(bboxParts[0], bboxParts[2]),
            minLng: Math.min(bboxParts[1], bboxParts[3]),
            maxLng: Math.max(bboxParts[1], bboxParts[3]),
          }
        : null

    const matched = all
      .filter((l) => l.is_active !== false)
      .filter((l) => (dropOffOnly ? l.allows_drop_off !== false : true))
      .filter((l) => (carrier > 0 ? l.carrier_id === carrier : true))
      // Inside the visible rectangle, when one was given. Applied before the
      // text filters so a query narrows what is on screen rather than searching
      // the whole country and then discarding most of it.
      .filter((l) => {
        if (!bbox) return true
        const c = l.coordinates
        if (!c) return false
        const la = Number(c.lat)
        const ln = Number(c.long)
        return la >= bbox.minLat && la <= bbox.maxLat && ln >= bbox.minLng && ln <= bbox.maxLng
      })
      // Locality OR county, because Bucharest's lockers are filed under
      // "Sector 1".."Sector 6" with county "Bucuresti" — matching locality
      // alone finds 47 of roughly 2,600.
      .filter((l) =>
        fCounty ? fold(l.county_name || "").includes(fCounty) : true,
      )
      .filter((l) =>
        fLocality
          ? fold(l.locality_name || "").includes(fLocality) ||
            fold(l.county_name || "").includes(fLocality)
          : true,
      )
      .filter((l) =>
        qTokens.length
          ? matchesQuery(
              fold(`${l.name || ""} ${l.address || ""} ${l.locality_name || ""} ${l.county_name || ""}`),
              qTokens,
            )
          : true,
      )

    // Distance decides the order when we know where the buyer is; otherwise the
    // provider's order stands. Sorting happens BEFORE the cap, so "nearest 60"
    // means nearest of all of them, not nearest of an arbitrary first 60.
    const withDistance = matched.map((l) => {
      const c = l.coordinates
      const point = c ? { lat: Number(c.lat), lng: Number(c.long) } : null
      const km = origin && isUsableCoord(point) ? distanceKm(origin, point) : null
      return { l, km }
    })

    if (origin) {
      withDistance.sort((a, b) => {
        // Lockers with no coordinates sink to the bottom rather than sorting as
        // though they were at the origin.
        if (a.km === null) return b.km === null ? 0 : 1
        if (b.km === null) return -1
        return a.km - b.km
      })
    }

    const cap = bbox ? MAX_IN_BOUNDS : MAX_RESULTS
    // Said out loud rather than hidden: the client shows "zoom in to see the
    // rest" instead of silently drawing a subset, which is exactly how the
    // sixty-locker cap read as a broken map.
    const truncated = withDistance.length > cap

    const items = withDistance
      .slice(0, cap)
      // Only what a chooser needs. The full schedule is large and nobody is
      // rendering opening hours yet; sending it would multiply the response
      // size for no visible difference. Coordinates ARE included — they are
      // what a map, once there is one, would draw from.
      // Through the shared normaliser, so the shape the map renders is the same
      // shape the AWB is built from and there is one place a provider field
      // name appears.
      .map(({ l, km }) => {
        const n = normalizeLocker(l)
        if (!n) return null
        return {
          ...n,
          distanceMeters: km === null ? undefined : Math.round(km * 1000),
          // Kept for the existing callers, which speak kilometres.
          distanceKm: km === null ? null : Math.round(km * 100) / 100,
          // Legacy aliases: the picker and the admin page were written against
          // these names. Removing them is a separate change from adding the
          // normaliser, and doing both at once would make a regression here
          // impossible to attribute.
          address: n.addressLine1,
          locality: n.city,
          lat: n.latitude,
          lng: n.longitude,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    return NextResponse.json(
      { ok: true, total: items.length, matched: withDistance.length, truncated, items },
      // A buyer's browser may cache this too — the data is public and slow.
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
    )
  } catch (err) {
    const e = err as Error & { code?: string }
    return NextResponse.json(
      { ok: false, code: e?.code ?? "error", message: e?.message ?? "Could not load lockers", items: [] },
      { status: 200 },
    )
  }
}
