"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Check, Minus, Plus } from "lucide-react"

import type { LockerOption } from "@/components/shipping/locker-picker"
import { formatDistance, isUsableCoord, type LatLng } from "@/lib/geo"
import { clusterByScreenGrid, zoomToBreakUp } from "@/lib/shipping/cluster"
import {
  centreOf,
  fitZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  screenPosition,
  tilesFor,
  unproject,
  project,
  TILE_SIZE,
} from "@/lib/geo-tiles"

/**
 * Every locker in the current search, on a map, each one tappable.
 *
 * ---------------------------------------------------------------------------
 * No mapping library
 * ---------------------------------------------------------------------------
 * Tiles are images at predictable URLs and a marker is a div at a computed
 * offset, so the whole map is those two facts plus `lib/geo-tiles.ts`. Leaflet
 * would be 42 KB and a CSS file to do the same job, and would bring a plugin
 * system, GeoJSON and vector layers that nothing here uses.
 *
 * The projection is not improvised — it is the standard Web Mercator every one
 * of those libraries starts from, and the tests check it against the canonical
 * formula rather than against itself.
 *
 * ---------------------------------------------------------------------------
 * Tiles come from OpenStreetMap, which has conditions
 * ---------------------------------------------------------------------------
 * openstreetmap.org serves tiles free, requires the attribution rendered at the
 * bottom of this component, and asks that heavy production traffic move to a
 * dedicated provider. This is fine for a marketplace at this size; the swap is
 * one URL when it stops being fine, which is why that URL is a single constant.
 */

const TILE_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`

/** Ignore a drag of a pixel or two so a tap on a marker is not read as a pan. */
const DRAG_THRESHOLD_PX = 4

export function LockerMapPicker({
  lockers,
  value,
  onSelect,
  origin,
  height = 340,
  fill = false,
}: {
  lockers: LockerOption[]
  value: LockerOption | null
  onSelect: (l: LockerOption) => void
  /** The buyer's own position, when they have shared it. */
  origin?: LatLng | null
  height?: number
  /** Fill the parent instead of taking a fixed height — for the full-screen
   *  picker, where the container decides and the map must follow it through
   *  address-bar changes and orientation flips. */
  fill?: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  /** The pannable layer. Moved imperatively during a drag so React stays out
   *  of the way; see applyOffset. */
  const layerRef = useRef<HTMLDivElement | null>(null)
  const offset = useRef({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 0, height })
  const [centre, setCentre] = useState<LatLng | null>(null)
  const [zoom, setZoom] = useState(12)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  /** Every finger currently down, so a pinch can be told from a pan. */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; accumulated: number } | null>(null)

  const pointerDistance = () => {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return 0
    return Math.hypot(b.x - a.x, b.y - a.y)
  }
  const pointerMidpoint = () => {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return { x: 0, y: 0 }
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  const pins = lockers.filter((l) => isUsableCoord({ lat: l.lat, lng: l.lng })) as Array<
    LockerOption & { lat: number; lng: number }
  >

  // Recomputed only when the pins or the zoom change — NOT while panning, which
  // does not re-render at all. A pass over a few hundred points once per zoom
  // is far below anything the eye can notice.
  const clusters = useMemo(
    () =>
      // Spread rather than rebuilt: the objects that come back out are the same
      // LockerOptions that went in, so a marker can hand one straight to
      // onSelect without a lookup.
      clusterByScreenGrid(
        pins.map((l) => ({ ...l, latitude: l.lat, longitude: l.lng })),
        zoom,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pins.map((p) => p.id).join(","), zoom],
  )

  // Measured rather than assumed: the width is whatever the column gives us,
  // and the tile grid has to cover exactly that.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // In fill mode the HEIGHT is measured too, not assumed. That is what keeps
    // the tile grid correct through an iOS address-bar collapse, a rotation, or
    // a sheet opening underneath — all of which change the box without any
    // React state changing.
    const measure = () =>
      setSize({ width: el.clientWidth, height: fill ? el.clientHeight : height })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [height, fill])

  // Frame the results whenever the SET of lockers changes — but never while the
  // user is looking around, which is why this keys off the ids rather than the
  // array identity, and why panning does not reset it.
  const key = pins.map((p) => p.id).join(",")
  useEffect(() => {
    if (!size.width || pins.length === 0) return
    const points = pins.map((p) => ({ lat: p.lat, lng: p.lng }))
    if (origin) points.push(origin)
    const z = fitZoom(points, size.width, size.height)
    setZoom(z)
    setCentre(centreOf(points, z))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size.width, size.height])

  /**
   * Zoom while keeping one point on screen exactly where it is.
   *
   * Zooming to the centre is the easy version and it is subtly awful: the thing
   * you were looking at slides away as you zoom in on it. Instead the geographic
   * point under the cursor — or under the middle of a pinch — is measured
   * first, and the centre is recomputed afterwards so that point has not moved.
   */
  const zoomAround = useCallback(
    (delta: number, focal?: { x: number; y: number }) => {
      setZoom((z) => {
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta))
        if (next === z) return z
        setCentre((c) => {
          if (!c || !size.width) return c
          const fx = focal?.x ?? size.width / 2
          const fy = focal?.y ?? size.height / 2
          // Where is that screen point, geographically, right now?
          const before = project(c, z)
          const anchor = unproject(
            { x: before.x - size.width / 2 + fx, y: before.y - size.height / 2 + fy },
            z,
          )
          // Put the new centre where it needs to be for the anchor to land back
          // under the same pixel.
          const a = project(anchor, next)
          return unproject({ x: a.x + size.width / 2 - fx, y: a.y + size.height / 2 - fy }, next)
        })
        return next
      })
    },
    [size.width, size.height],
  )

  const zoomBy = useCallback((delta: number) => zoomAround(delta), [zoomAround])

  /**
   * Whenever React repositions the map, the layer's transform must go back to
   * zero — the new tile positions already account for the new centre, so a
   * leftover translate would double-apply it and shift everything.
   */
  useEffect(() => {
    offset.current = { x: 0, y: 0 }
    const el = layerRef.current
    if (el) el.style.transform = "translate3d(0px, 0px, 0px)"
  }, [centre, zoom])

  /** Where a pointer is, relative to the map's own top-left. */
  const localPoint = (e: React.PointerEvent | React.WheelEvent) => {
    const r = ref.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // A second finger ends the pan and starts a pinch. Whatever had been
      // dragged so far is folded into the centre first — leaving it in the
      // layer transform would make the zoom anchor calculation work from a
      // centre the map is not actually showing.
      commitOffset()
      pinch.current = { distance: pointerDistance(), accumulated: 0 }
      if (drag.current) drag.current.moved = true
      return
    }
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  /**
   * Move the map WITHOUT telling React.
   *
   * This is the difference between a map that drags smoothly and one that
   * stutters. The previous version called setCentre on every pointermove, which
   * re-rendered a dozen tiles and up to sixty markers — at pointer-event rate,
   * which on a 120 Hz phone is 120 times a second. Every one of those was a
   * layout pass.
   *
   * Now the whole layer is translated on the compositor and React is not
   * involved at all until the finger lifts. Tiles are rendered with a ring of
   * buffer around the viewport so there is always something to drag into view.
   */
  const applyOffset = (dx: number, dy: number) => {
    offset.current = { x: dx, y: dy }
    const el = layerRef.current
    if (el) el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
  }

  /** Fold the dragged pixels back into the real centre and reset the layer. */
  const commitOffset = () => {
    const { x, y } = offset.current
    if ((x === 0 && y === 0) || !centre) return
    const c = project(centre, zoom)
    setCentre(unproject({ x: c.x - x, y: c.y - y }, zoom))
    applyOffset(0, 0)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    // ── PINCH ────────────────────────────────────────────────────────────────
    const p = pinch.current
    if (p && pointers.current.size >= 2) {
      const now = pointerDistance()
      if (now > 0 && p.distance > 0) {
        // Tiles exist only at whole zoom levels, so the continuous pinch ratio
        // is accumulated and spent one level at a time. A doubling of finger
        // distance is one level, which is what the projection actually means.
        const accumulated = p.accumulated + Math.log2(now / p.distance)
        if (Math.abs(accumulated) >= 1) {
          const steps = Math.trunc(accumulated)
          const mid = pointerMidpoint()
          const r = ref.current?.getBoundingClientRect()
          zoomAround(steps, { x: mid.x - (r?.left ?? 0), y: mid.y - (r?.top ?? 0) })
          pinch.current = { distance: now, accumulated: accumulated - steps }
        } else {
          pinch.current = { distance: p.distance, accumulated }
        }
      }
      return
    }

    // ── PAN ──────────────────────────────────────────────────────────────────
    const d = drag.current
    if (!d || !centre) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    d.moved = true
    // The layer follows the finger; the centre catches up on release. Measured
    // from where the drag STARTED, not from the last event, so the offset is
    // absolute and cannot accumulate rounding error over a long drag.
    applyOffset(dx, dy)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) {
      commitOffset()
      drag.current = null
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    // Trackpads emit a stream of small deltas; one notch of intent is one level.
    zoomAround(e.deltaY < 0 ? 1 : -1, localPoint(e))
  }

  if (pins.length === 0) return null

  // One ring of buffer: panning does not re-render, so anything dragged into
  // view must already be mounted. 256 px of slack in every direction is more
  // than a thumb covers before the finger lifts.
  const tiles = centre && size.width ? tilesFor(centre, zoom, size.width, size.height, 1) : []

  return (
    <div
      className={
        fill
          ? "flex h-full flex-col overflow-hidden"
          : "overflow-hidden rounded-xl border border-neutral-200"
      }
    >
      <div
        ref={ref}
        className={`relative touch-none select-none bg-neutral-100 ${fill ? "min-h-0 flex-1" : ""}`}
        style={{
          // In fill mode the parent sizes it; forcing a pixel height here would
          // fight the flex layout and reintroduce the iOS viewport problem.
          height: fill ? undefined : size.height,
          cursor: drag.current ? "grabbing" : "grab",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {/* ONE transformed layer holding tiles and markers together. Panning
            moves this and nothing else, so a drag is a compositor operation
            rather than a React render — and the markers stay glued to the map
            because they are inside it. */}
        <div
          ref={layerRef}
          className="absolute inset-0 will-change-transform"
          style={{ transform: "translate3d(0px, 0px, 0px)" }}
        >
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${t.z}/${t.x}/${t.y}`}
              src={TILE_URL(t.z, t.x, t.y)}
              alt=""
              width={TILE_SIZE}
              height={TILE_SIZE}
              draggable={false}
              // decoding=async keeps a newly-arrived tile from blocking the
              // frame it lands in, which is what produced the visible hitch
              // when panning into fresh tiles.
              decoding="async"
              className="pointer-events-none absolute max-w-none"
              style={{ left: t.left, top: t.top }}
            />
          ))}

          {/* The buyer's own position, drawn differently from a locker because
              it is not somewhere a parcel can go. Inside the layer, so it pans
              with the map instead of sliding across it. */}
          {origin && centre && size.width > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute z-[1] -ml-[7px] -mt-[7px] h-3.5 w-3.5 rounded-full border-2 border-white bg-[#2563eb] shadow"
            style={(() => {
              const p = screenPosition(origin, centre, zoom, size.width, size.height)
              return { left: p.x, top: p.y }
            })()}
          />
        )}

          {centre &&
          size.width > 0 &&
          clusters.map((cluster) => {
            const p = screenPosition(cluster.centre, centre, zoom, size.width, size.height)
            // Markers well outside the buffered area are not rendered — a
            // hundred absolutely-positioned buttons off-screen is a hundred
            // things the browser still lays out. The margin matches the tile
            // buffer so a pin does not pop in at the edge of a drag.
            if (
              p.x < -TILE_SIZE ||
              p.y < -TILE_SIZE ||
              p.x > size.width + TILE_SIZE ||
              p.y > size.height + TILE_SIZE
            )
              return null

            // ── A CLUSTER ────────────────────────────────────────────────────
            if (cluster.items.length > 1) {
              const holdsSelected = value ? cluster.items.some((i) => i.id === value.id) : false
              return (
                <button
                  key={cluster.key}
                  type="button"
                  aria-label={`${cluster.items.length} easybox-uri în această zonă. Apropie pentru a le vedea.`}
                  onClick={() => {
                    if (drag.current?.moved) return
                    // Zoom in on the knot rather than guessing which of them
                    // was meant — picking one for the user would be wrong.
                    const target = zoomToBreakUp(cluster, zoom)
                    setCentre(cluster.centre)
                    setZoom(Math.min(MAX_ZOOM, target))
                  }}
                  className="absolute z-[2] -translate-x-1/2 -translate-y-1/2 transition-transform active:scale-95"
                  style={{ left: p.x, top: p.y }}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-[12px] font-bold shadow-md ${
                      holdsSelected
                        ? "border-white bg-emerald-600 text-white"
                        : "border-white bg-[#7c3aed] text-white"
                    }`}
                  >
                    {cluster.items.length}
                  </span>
                </button>
              )
            }

            // ── ONE LOCKER ───────────────────────────────────────────────────
            const l = cluster.items[0]
            const selected = value?.id === l.id
            return (
              <button
                key={cluster.key}
                type="button"
                title={l.name}
                aria-label={`${l.name}, ${l.address}${selected ? " — selectat" : ""}`}
                aria-pressed={selected}
                onClick={() => {
                  // A pan that ended on a marker is a pan, not a choice.
                  if (drag.current?.moved) return
                  onSelect(l)
                }}
                className="group absolute z-[2] -translate-x-1/2 -translate-y-full transition-transform active:scale-95"
                style={{ left: p.x, top: p.y }}
              >
                <span
                  className={`flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-bold shadow-sm transition-colors ${
                    selected
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-neutral-300 bg-white text-neutral-800 md:group-hover:border-neutral-900 md:group-hover:bg-neutral-900 md:group-hover:text-white"
                  }`}
                >
                  {/* A tick as well as the colour: selection must not be
                      communicated by hue alone. */}
                  {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                  {typeof l.distanceKm === "number" ? formatDistance(l.distanceKm) : "easybox"}
                </span>
              </button>
            )
          })}
        </div>

        <div className="absolute right-2 top-2 z-[3] flex flex-col overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm">
          <button
            type="button"
            aria-label="Apropie"
            onClick={() => zoomBy(1)}
            className="flex h-8 w-8 items-center justify-center border-b border-neutral-200 active:bg-neutral-100"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Depărtează"
            onClick={() => zoomBy(-1)}
            className="flex h-8 w-8 items-center justify-center active:bg-neutral-100"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Required by OpenStreetMap's terms, and not optional. */}
      <p className="border-t border-neutral-200 bg-white px-3 py-1.5 text-[10.5px] text-neutral-500">
        Hartă{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          © OpenStreetMap
        </a>{" "}
        · atinge un easybox pentru a-l alege
      </p>
    </div>
  )
}
