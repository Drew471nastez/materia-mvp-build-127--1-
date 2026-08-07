import { NextResponse, type NextRequest } from "next/server"

import { listFixedLocations, type EawbLocker } from "@/lib/eawb"

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
/** Enough to choose from; small enough to render and to send. */
const MAX_RESULTS = 60

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
    const fq = fold(q)

    const items = all
      .filter((l) => l.is_active !== false)
      .filter((l) => (dropOffOnly ? l.allows_drop_off !== false : true))
      .filter((l) => (carrier > 0 ? l.carrier_id === carrier : true))
      .filter((l) => (fCounty ? fold(l.county_name || "").includes(fCounty) : true))
      .filter((l) => (fLocality ? fold(l.locality_name || "").includes(fLocality) : true))
      .filter((l) =>
        fq ? fold(`${l.name || ""} ${l.address || ""}`).includes(fq) : true,
      )
      .slice(0, MAX_RESULTS)
      // Only what a chooser needs. The schedule and coordinates are large and
      // nobody is drawing a map yet; sending them would make this response ten
      // times the size for no visible difference.
      .map((l) => ({
        id: l.id,
        name: (l.name || "").trim(),
        address: l.address,
        carrier: l.carrier_name,
        carrierId: l.carrier_id,
        locality: l.locality_name,
        localityId: l.locality_id,
        county: l.county_name,
        allowsDropOff: l.allows_drop_off !== false,
      }))

    return NextResponse.json(
      { ok: true, total: items.length, items },
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
