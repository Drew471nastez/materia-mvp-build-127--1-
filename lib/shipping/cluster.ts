import { project, TILE_SIZE } from "@/lib/geo-tiles"
import type { LatLng } from "@/lib/geo"

/**
 * ===========================================================================
 *  GROUPING PINS THAT WOULD OTHERWISE SIT ON TOP OF EACH OTHER
 * ===========================================================================
 *
 * Sixty lockers in one city, zoomed out, is sixty overlapping labels and no
 * information. Clustering replaces each knot with a single marker carrying a
 * count, and the map becomes readable at every zoom instead of only the
 * closest one.
 *
 * ---------------------------------------------------------------------------
 * Grid clustering, in SCREEN space
 * ---------------------------------------------------------------------------
 * The grid is measured in pixels at the current zoom, not in degrees. That
 * matters: a degree of longitude is 111 km at the equator and 50 km in Romania,
 * so a degree-based grid produces cells that visibly change size as you pan
 * north. Pixels are what the eye is actually judging overlap in.
 *
 * Deliberately not a hierarchical algorithm. A single pass over at most a few
 * hundred points, run once per zoom change rather than per frame, is far below
 * the cost of anything the eye can notice — and a quadtree here would be more
 * code to get subtly wrong for no measurable gain.
 *
 * ---------------------------------------------------------------------------
 * THE KNOWN ARTEFACT, stated rather than discovered
 * ---------------------------------------------------------------------------
 * A fixed grid does not know where the pins are. Two lockers twenty metres
 * apart that happen to straddle a cell boundary land in DIFFERENT clusters, and
 * will render as two markers that visually overlap. Distance-based clustering
 * would not do that, at the cost of being order-dependent and O(n²).
 *
 * Accepted here because the failure is cosmetic and self-correcting: the pins
 * are still both tappable, and one zoom step separates them properly. It is
 * worth knowing about before someone reports it as a bug.
 */

/** Roughly two marker widths. Below this, labels touch. */
const CELL_PX = 68

/**
 * The minimum a thing needs to be clusterable.
 *
 * `id` accepts either form because the provider's ids are numbers and the
 * normalised type carries strings — coercing here would mean the caller gets
 * back an object that is no longer the one it passed in, and could not hand it
 * straight to a selection handler.
 */
export interface Clusterable {
  id: string | number
  latitude: number | null
  longitude: number | null
}

export interface Cluster<T extends Clusterable> {
  /** Stable across renders at the same zoom, so React can key on it. */
  key: string
  /** Where the marker is drawn: the mean of its members, not the cell centre,
   *  so a cluster sits on its pins rather than floating beside them. */
  centre: LatLng
  items: T[]
}

export function clusterByScreenGrid<T extends Clusterable>(items: T[], zoom: number): Array<Cluster<T>> {
  const cells = new Map<string, T[]>()

  for (const item of items) {
    if (typeof item.latitude !== "number" || typeof item.longitude !== "number") continue
    const p = project({ lat: item.latitude, lng: item.longitude }, zoom)
    const key = `${Math.floor(p.x / CELL_PX)}:${Math.floor(p.y / CELL_PX)}`
    const bucket = cells.get(key)
    if (bucket) bucket.push(item)
    else cells.set(key, [item])
  }

  const out: Array<Cluster<T>> = []
  for (const [key, group] of cells) {
    let lat = 0
    let lng = 0
    for (const g of group) {
      lat += g.latitude as number
      lng += g.longitude as number
    }
    out.push({
      // The cell key alone would collide across zooms; including the zoom makes
      // React remount rather than animate a marker into a different meaning.
      key: `${zoom}:${key}`,
      centre: { lat: lat / group.length, lng: lng / group.length },
      items: group,
    })
  }
  return out
}

/**
 * How far to zoom in to break a cluster apart.
 *
 * Each zoom level halves the ground covered by a cell, so the number of levels
 * needed is the log2 of how much too big the group's spread currently is.
 * Clamped to a few steps: jumping ten levels because two lockers share a
 * doorway is disorienting, and at that point they genuinely are the same place.
 */
export function zoomToBreakUp(cluster: Cluster<Clusterable>, zoom: number): number {
  if (cluster.items.length < 2) return zoom + 2

  const points = cluster.items
    .filter((i) => typeof i.latitude === "number" && typeof i.longitude === "number")
    .map((i) => project({ lat: i.latitude as number, lng: i.longitude as number }, zoom))
  if (points.length < 2) return zoom + 2

  const spread = Math.max(
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  )
  // Every member at the same coordinate: no zoom separates them.
  if (spread <= 0) return zoom + 2
  const needed = Math.ceil(Math.log2(CELL_PX / spread)) + 1
  return zoom + Math.min(4, Math.max(1, needed))
}

/** The tile size is re-exported so callers sizing a viewport do not have to
 *  import from two modules to reason about one grid. */
export { TILE_SIZE }
