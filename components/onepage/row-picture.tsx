"use client"

/**
 * A block row's picture in the editor's Links list (lib/onepage/row-picture,
 * round AT): the block's own image, or a small map of the place for a map
 * block. Fills the row's tile; the tile keeps its size and corners.
 */
import * as React from "react"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import type { RowPicture } from "@/lib/onepage/row-picture"

/* The drawn map's streets: a few roads and a river on the map's paper colour, so a typed address still reads as a map. */
function DrawnMap() {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="40" height="40" fill="#eef0eb" />
      <path d="M-2 29 C 10 24, 18 33, 42 25" stroke="#b9d3ee" strokeWidth="5" fill="none" />
      <path d="M-2 12 L 42 17 M 13 -2 L 9 42 M 30 -2 L 27 42" stroke="#ffffff" strokeWidth="3" fill="none" />
      <path d="M-2 5 L 42 3 M 21 -2 L 23 42" stroke="#ffffff" strokeWidth="1.5" fill="none" />
      <rect x="15" y="20" width="9" height="6" rx="1" fill="#dfe6d6" />
    </svg>
  )
}

function Pin({ x, y }: { x: string; y: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" className="pointer-events-none absolute -translate-x-1/2 -translate-y-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]" style={{ left: x, top: y }}>
      <path d="M12 23s-7-6.4-7-12.2A7 7 0 0 1 19 10.8C19 16.6 12 23 12 23Z" fill="#ea4335" stroke="#fff" strokeWidth="1.5" />
      <circle cx="12" cy="10.5" r="2.6" fill="#fff" />
    </svg>
  )
}

/** The tile is drawn at three times the row's tile, with the place in the middle where the tile allows. */
const MAP_SCALE = 3

export function RowPictureView({ picture, size, imageWidth = 80 }: { picture: RowPicture; size: number; imageWidth?: number }) {
  /* A tile that does not arrive (offline, a blocked host) leaves the drawn map, never a broken picture. */
  const [tileFailed, setTileFailed] = React.useState(false)
  if (picture.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={onePageImageSrc(picture.src, imageWidth) || picture.src} alt="" decoding="async" loading="lazy" draggable={false} className="h-full w-full object-cover" data-row-picture="image" />
  }
  if (picture.kind === "map-drawn" || (picture.kind === "map" && tileFailed)) {
    return (
      <span className="relative block h-full w-full" data-row-picture="map-drawn" title={picture.label}>
        <DrawnMap />
        <Pin x="50%" y="62%" />
      </span>
    )
  }
  const span = size * MAP_SCALE
  /* The tile's left and top so the place sits in the middle, kept so the tile always covers the box. */
  const left = Math.min(0, Math.max(size - span, size / 2 - picture.x * span))
  const top = Math.min(0, Math.max(size - span, size / 2 + 4 - picture.y * span))
  return (
    <span className="relative block h-full w-full overflow-hidden bg-[#eef0eb]" data-row-picture="map" title={`${picture.label} · © OpenStreetMap`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={picture.src} alt="" decoding="async" loading="lazy" draggable={false} referrerPolicy="strict-origin-when-cross-origin" onError={() => setTileFailed(true)} className="absolute max-w-none" style={{ width: span, height: span, left, top }} />
      <Pin x={`${left + picture.x * span}px`} y={`${top + picture.y * span + 2}px`} />
    </span>
  )
}
