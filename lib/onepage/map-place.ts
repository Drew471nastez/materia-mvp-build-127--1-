/**
 * ===========================================================================
 *  A PLACE FOR THE MAP BLOCK: A TYPED ADDRESS OR A GOOGLE MAPS LINK
 * ===========================================================================
 * The owner: "the address/place input accepts either a Google Maps URL or a
 * typed address and resolves it reliably; easy to set up".
 *
 * mapPlace reads what was put in the field:
 *
 *   350 5th Ave, New York, NY 10118                  a typed address
 *   https://www.google.com/maps/place/Empire+State+Building/@40.74,-73.98,17z/data=!3d40.7484405!4d-73.9856644
 *                                                    the place's name and its exact point
 *   https://www.google.com/maps/@40.7484,-73.9857,17z
 *                                                    a dropped point
 *   https://www.google.com/maps/search/?api=1&query=Joe%27s+Pizza
 *   https://maps.google.com/?q=40.7484,-73.9857       a search or a point in q=
 *   https://www.google.com/maps/dir/Home/Joe's+Pizza  directions: where they end
 *   https://maps.app.goo.gl/xyz                      a short link the share
 *                                                    button makes; it only
 *                                                    says where it goes when
 *                                                    asked, so the editor asks
 *                                                    once (app/api/onepage/
 *                                                    map-place) and keeps the
 *                                                    whole link beside it
 *
 * and gives what the block draws from: the words for the map's search (an
 * exact point when the link has one, which never lands on another place of
 * the same name), a label for the editor to say what it found, and the
 * address Open in Maps goes to (the creator's own link when they pasted
 * one, so Google opens the very place they picked).
 *
 * Pure: no React, no network. tests/onepage-editor-op.test.ts.
 */

export interface MapPlace {
  /** "address": typed words; "link": a Google Maps link read whole; "short": a short link not read yet. */
  kind: "address" | "link" | "short"
  /** What the map searches for: the address, the place's name, or "lat,lng". Empty for a short link not read yet. */
  query: string
  /** What the editor says it found. */
  label: string
  /** The exact point, when the link carries one. */
  lat?: number
  lng?: number
  /** Where Open in Maps goes. */
  href: string
}

const GOOGLE_HOST = /^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/i
const MAPS_HOST = /^maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$/i

/** A short link Google Maps' Share button makes. */
export function isShortMapsLink(raw: string | null | undefined): boolean {
  const u = asUrl(raw)
  if (!u) return false
  const host = u.hostname.toLowerCase()
  return host === "maps.app.goo.gl" || (host === "goo.gl" && u.pathname.startsWith("/maps")) || (host === "g.co" && u.pathname.startsWith("/kgs/"))
}

/** A whole Google Maps link (not a short one). */
export function isGoogleMapsLink(raw: string | null | undefined): boolean {
  const u = asUrl(raw)
  if (!u) return false
  const host = u.hostname.toLowerCase()
  return MAPS_HOST.test(host) || (GOOGLE_HOST.test(host) && /^\/maps(\/|$)/.test(u.pathname))
}

function asUrl(raw: string | null | undefined): URL | null {
  const t = String(raw ?? "").trim()
  if (!t || /\s/.test(t) || t.length > 4000) return null
  if (!/^https?:\/\//i.test(t) && !/^(www\.|maps\.|google\.[a-z.]+\/maps|goo\.gl\/|maps\.app\.goo\.gl\/|g\.co\/)/i.test(t)) return null
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    return u.protocol === "https:" || u.protocol === "http:" ? u : null
  } catch {
    return null
  }
}

const words = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " ")).replace(/\s+/g, " ").trim()
  } catch {
    return s.replace(/\+/g, " ").trim()
  }
}

const POINT = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

function point(lat: number, lng: number): { lat: number; lng: number } | null {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}

const round = (n: number) => Math.round(n * 1e6) / 1e6
const pointWords = (p: { lat: number; lng: number }) => `${round(p.lat)},${round(p.lng)}`

/**
 * What the field holds, as a place for the map. Null when there is nothing
 * to show (empty, or a link that is not Google Maps' and not an address).
 */
export function mapPlace(raw: string | null | undefined): MapPlace | null {
  const typed = String(raw ?? "").trim()
  if (!typed) return null
  const url = asUrl(typed)
  if (!url) {
    /* Typed words. A bare "lat, lng" pins that point. */
    const m = POINT.exec(typed)
    const p = m ? point(Number(m[1]), Number(m[2])) : null
    if (p) return { kind: "address", query: pointWords(p), label: pointWords(p), ...p, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pointWords(p))}` }
    if (typed.length > 300) return null
    return { kind: "address", query: typed, label: typed, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(typed)}` }
  }
  const href = url.toString().replace(/^http:/i, "https:")
  if (isShortMapsLink(typed)) return { kind: "short", query: "", label: "", href }
  if (!isGoogleMapsLink(typed)) return null

  const segs = url.pathname.split("/").filter(Boolean)
  const q = url.searchParams
  /* The place's own point (!3d<lat>!4d<lng> in the data part): where the pin is, not where the screen was. */
  const exact = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(decodeURIComponent(url.pathname + url.search))
  const pin = exact ? point(Number(exact[1]), Number(exact[2])) : null
  /* The screen's centre (@lat,lng,zoom): the point when nothing better is there. */
  const at = segs.find((s) => s.startsWith("@"))
  const centreMatch = at ? /^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(at) : null
  const centre = centreMatch ? point(Number(centreMatch[1]), Number(centreMatch[2])) : null

  let name = ""
  const after = (word: string) => {
    const i = segs.indexOf(word)
    return i >= 0 && segs[i + 1] && !segs[i + 1].startsWith("@") && !segs[i + 1].startsWith("data=") ? words(segs[i + 1]) : ""
  }
  name = after("place") || after("search")
  if (!name && segs[1] === "dir") {
    const stops = segs.slice(2).filter((s) => !s.startsWith("@") && !s.startsWith("data="))
    name = stops.length ? words(stops[stops.length - 1]) : ""
  }
  if (!name) name = words(q.get("query") || q.get("q") || q.get("destination") || q.get("daddr") || "")

  const named = name && !POINT.test(name) ? name : ""
  const fromName = POINT.exec(name)
  const typedPoint = fromName ? point(Number(fromName[1]), Number(fromName[2])) : null
  const best = pin || typedPoint || (named ? null : centre)
  if (best) return { kind: "link", query: pointWords(best), label: named || pointWords(best), ...best, href }
  if (named) return { kind: "link", query: named, label: named, ...(centre ? centre : {}), href }
  return null
}

const ZOOM: Record<string, number> = { street: 17, area: 15, city: 12 }

/** The map's frame address: Google's own embed, searching for the place at the chosen distance. */
export function mapEmbedSrc(place: MapPlace, zoom: "street" | "area" | "city" = "area"): string | null {
  if (!place.query) return null
  return `https://maps.google.com/maps?q=${encodeURIComponent(place.query)}&z=${ZOOM[zoom] ?? 15}&output=embed`
}

/**
 * The place the block draws: the whole link kept for a short one when it
 * was read for this same short link, otherwise what the field holds.
 */
export function mapPlaceOf(data: { address?: string | null; place?: { from?: string; url?: string } | null } | null | undefined): MapPlace | null {
  const typed = String(data?.address ?? "").trim()
  if (!typed) return null
  const kept = data?.place
  if (kept && kept.from === typed && kept.url && isGoogleMapsLink(kept.url)) {
    const read = mapPlace(kept.url)
    /* Open in Maps keeps the creator's own short link: it is the one they shared. */
    if (read) return { ...read, href: mapPlace(typed)?.href ?? read.href }
  }
  return mapPlace(typed)
}
