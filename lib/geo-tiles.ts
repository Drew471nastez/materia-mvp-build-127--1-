import type { LatLng } from "@/lib/geo"

/**
 * ===========================================================================
 *  WEB MERCATOR — enough of it to draw a slippy map
 * ===========================================================================
 *
 * Every tile map on the web (OpenStreetMap, Google, Mapbox) shares one
 * projection and one addressing scheme: the world is a square, `2^zoom` tiles
 * across, each 256 px, and a tile is named `{z}/{x}/{y}`. That is the whole
 * contract, and it is forty lines of arithmetic.
 *
 * ---------------------------------------------------------------------------
 * Why not a mapping library
 * ---------------------------------------------------------------------------
 * Leaflet is the obvious answer and it is a good library. It is also 42 KB of
 * JavaScript, a CSS file, and a DOM abstraction — to place pins on tiles that
 * are already just images. What we need is: show these lockers, let one be
 * tapped. That does not need a plugin system, GeoJSON, or vector layers.
 *
 * The arithmetic below is standard and verifiable against published tile
 * numbers, which the tests do. Nothing here is a novel idea; it is the same
 * formula every one of those libraries starts from.
 */

/** A tile is 256 CSS pixels square, by universal convention. */
export const TILE_SIZE = 256

/** Below 3 the whole world is smaller than a phone screen; above 19 most tile
 *  servers stop having imagery. */
export const MIN_ZOOM = 3
export const MAX_ZOOM = 18

/**
 * Latitude is clamped to ±85.05113°, where the Mercator projection reaches
 * infinity. Without this, a coordinate near a pole produces an enormous y and
 * the map renders blank — a failure that looks like a bug in the tiles.
 */
const MAX_LAT = 85.05112878

export interface Point {
  x: number
  y: number
}

/** Position in world pixels at this zoom: the top-left of the map is (0, 0). */
export function project(coord: LatLng, zoom: number): Point {
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, coord.lat))
  const scale = TILE_SIZE * Math.pow(2, zoom)
  const x = ((coord.lng + 180) / 360) * scale
  const sin = Math.sin((lat * Math.PI) / 180)
  // The standard Mercator y, written with sin rather than tan+sec because it is
  // numerically better behaved near the equator.
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  return { x, y }
}

/** The inverse, for turning a click back into a place. */
export function unproject(point: Point, zoom: number): LatLng {
  const scale = TILE_SIZE * Math.pow(2, zoom)
  const lng = (point.x / scale) * 360 - 180
  const n = Math.PI - 2 * Math.PI * (point.y / scale)
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return { lat, lng }
}

/**
 * A zoom level at which every one of these points fits in a viewport of this
 * size, with a little room at the edges.
 *
 * Returns MAX_ZOOM for a single point — a lone locker should be shown at street
 * level, not at whatever zoom makes a zero-sized box fit.
 */
export function fitZoom(points: LatLng[], width: number, height: number, padding = 48): number {
  if (points.length === 0) return 12
  if (points.length === 1) return 16

  let lo = MIN_ZOOM
  let hi = MAX_ZOOM
  let best = MIN_ZOOM
  // Binary search rather than a closed form: the projection is not linear in
  // latitude, so the bounding box's pixel size has to be measured per zoom.
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const projected = points.map((p) => project(p, mid))
    const w = Math.max(...projected.map((p) => p.x)) - Math.min(...projected.map((p) => p.x))
    const h = Math.max(...projected.map((p) => p.y)) - Math.min(...projected.map((p) => p.y))
    if (w <= width - padding && h <= height - padding) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/** The centre of a set of points, in projected space rather than as a naive
 *  average of latitudes — which would drift north of the true centre. */
export function centreOf(points: LatLng[], zoom: number): LatLng {
  if (points.length === 0) return { lat: 45.9432, lng: 24.9668 } // Romania
  if (points.length === 1) return points[0]
  const projected = points.map((p) => project(p, zoom))
  const x = (Math.min(...projected.map((p) => p.x)) + Math.max(...projected.map((p) => p.x))) / 2
  const y = (Math.min(...projected.map((p) => p.y)) + Math.max(...projected.map((p) => p.y))) / 2
  return unproject({ x, y }, zoom)
}

/** Which tiles cover this viewport, and where each one sits within it. */
export function tilesFor(
  centre: LatLng,
  zoom: number,
  width: number,
  height: number,
): Array<{ z: number; x: number; y: number; left: number; top: number }> {
  const c = project(centre, zoom)
  const originX = c.x - width / 2
  const originY = c.y - height / 2
  const count = Math.pow(2, zoom)

  const first = { x: Math.floor(originX / TILE_SIZE), y: Math.floor(originY / TILE_SIZE) }
  const last = {
    x: Math.floor((originX + width) / TILE_SIZE),
    y: Math.floor((originY + height) / TILE_SIZE),
  }

  const out: Array<{ z: number; x: number; y: number; left: number; top: number }> = []
  for (let x = first.x; x <= last.x; x++) {
    for (let y = first.y; y <= last.y; y++) {
      // Vertically the world does not repeat, so a row above the top or below
      // the bottom is simply not drawn. Horizontally it wraps, so x is taken
      // modulo the world width and the map scrolls round the date line.
      if (y < 0 || y >= count) continue
      const wrappedX = ((x % count) + count) % count
      out.push({
        z: zoom,
        x: wrappedX,
        y,
        left: x * TILE_SIZE - originX,
        top: y * TILE_SIZE - originY,
      })
    }
  }
  return out
}

/** Where a coordinate lands inside the viewport, in CSS pixels from its
 *  top-left. Used to place a marker over the tiles. */
export function screenPosition(
  coord: LatLng,
  centre: LatLng,
  zoom: number,
  width: number,
  height: number,
): Point {
  const p = project(coord, zoom)
  const c = project(centre, zoom)
  return { x: p.x - (c.x - width / 2), y: p.y - (c.y - height / 2) }
}
