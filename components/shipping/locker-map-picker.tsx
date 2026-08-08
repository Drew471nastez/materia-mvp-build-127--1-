"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Check, Minus, Plus } from "lucide-react"

import type { LockerOption } from "@/components/shipping/locker-picker"
import { formatDistance, isUsableCoord, type LatLng } from "@/lib/geo"
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
}: {
  lockers: LockerOption[]
  value: LockerOption | null
  onSelect: (l: LockerOption) => void
  /** The buyer's own position, when they have shared it. */
  origin?: LatLng | null
  height?: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
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

  // Measured rather than assumed: the width is whatever the column gives us,
  // and the tile grid has to cover exactly that.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

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

  /** Where a pointer is, relative to the map's own top-left. */
  const localPoint = (e: React.PointerEvent | React.WheelEvent) => {
    const r = ref.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // A second finger ends the pan and starts a pinch. The drag is marked as
      // moved so releasing does not register as a tap on whatever is underneath.
      pinch.current = { distance: pointerDistance(), accumulated: 0 }
      if (drag.current) drag.current.moved = true
      return
    }
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
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
    // Panning moves the map under the finger, so the CENTRE moves the other way.
    const c = project(centre, zoom)
    setCentre(unproject({ x: c.x - dx, y: c.y - dy }, zoom))
    drag.current = { x: e.clientX, y: e.clientY, moved: true }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) drag.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    // Trackpads emit a stream of small deltas; one notch of intent is one level.
    zoomAround(e.deltaY < 0 ? 1 : -1, localPoint(e))
  }

  if (pins.length === 0) return null

  const tiles = centre && size.width ? tilesFor(centre, zoom, size.width, size.height) : []

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200">
      <div
        ref={ref}
        className="relative touch-none select-none bg-neutral-100"
        style={{ height: size.height, cursor: drag.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
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
            className="pointer-events-none absolute max-w-none"
            style={{ left: t.left, top: t.top }}
          />
        ))}

        {/* The buyer's own position, drawn differently from a locker because it
            is not somewhere a parcel can go. */}
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
          pins.map((l) => {
            const p = screenPosition({ lat: l.lat, lng: l.lng }, centre, zoom, size.width, size.height)
            // Off-screen markers are not rendered at all rather than clipped —
            // a hundred absolutely-positioned buttons outside the viewport is
            // a hundred things the browser still has to lay out.
            if (p.x < -40 || p.y < -60 || p.x > size.width + 40 || p.y > size.height + 40) return null
            const selected = value?.id === l.id
            return (
              <button
                key={l.id}
                type="button"
                title={l.name}
                onClick={() => {
                  // A pan that ended on a marker is a pan, not a choice.
                  if (drag.current?.moved) return
                  onSelect(l)
                }}
                className="absolute z-[2] -translate-x-1/2 -translate-y-full transition-transform active:scale-95"
                style={{ left: p.x, top: p.y }}
              >
                <span
                  className={`flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-bold shadow-sm ${
                    selected
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-neutral-300 bg-white text-neutral-800"
                  }`}
                >
                  {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                  {typeof l.distanceKm === "number" ? formatDistance(l.distanceKm) : "easybox"}
                </span>
              </button>
            )
          })}

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
