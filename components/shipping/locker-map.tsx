"use client"

import { ExternalLink, MapPin } from "lucide-react"

/**
 * Where this easybox actually is, on a map.
 *
 * ---------------------------------------------------------------------------
 * NO MAP LIBRARY, ON PURPOSE
 * ---------------------------------------------------------------------------
 * OpenStreetMap publishes an embeddable map as a plain URL, so this is an
 * <iframe> and nothing else — no Leaflet, no MapLibre, no tile-provider
 * account, no API key, and nothing added to the JavaScript every buyer
 * downloads. A mapping library is 40–150 KB to draw one pin.
 *
 * The trade is that this map SHOWS rather than SELECTS: you cannot click a pin
 * to choose a locker. Selection is done by the search above it, which is
 * distance-sorted when the buyer shares their location — so the question this
 * map answers is "is that the one near my office?", which is the one people
 * actually ask before committing.
 *
 * A clickable-pin map is a real feature and a bigger decision: it needs a
 * mapping library and a tile provider with a commercial allowance, since
 * OpenStreetMap's own tile servers are explicitly not for heavy production
 * traffic. Worth doing deliberately, not by accident.
 *
 * ---------------------------------------------------------------------------
 * "Open in maps" is the escape hatch
 * ---------------------------------------------------------------------------
 * A static frame cannot give directions. The link hands the coordinates to
 * whatever the device already uses — Apple Maps on an iPhone, Google Maps on
 * Android, a browser tab on a desktop — which is better than any map that
 * could be embedded here.
 */

/** How much ground the frame shows. Small enough to recognise the street,
 *  large enough to place it in a neighbourhood. */
const SPAN_DEG = 0.004

export function LockerMap({
  lat,
  lng,
  name,
  address,
  className = "",
}: {
  lat: number | null | undefined
  lng: number | null | undefined
  name?: string | null
  address?: string | null
  className?: string
}) {
  // The provider does not have coordinates for every locker. Rendering an
  // iframe with NaN in the URL produces a map of the middle of the ocean, which
  // is worse than no map — it looks like an answer.
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }
  if (lat === 0 && lng === 0) return null

  const bbox = [lng - SPAN_DEG, lat - SPAN_DEG / 2, lng + SPAN_DEG, lat + SPAN_DEG / 2].join(",")
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`
  // Resolves to the native app on a phone and to the web on a desktop, without
  // this component having to know which it is.
  const directions = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

  return (
    <div className={`overflow-hidden rounded-xl border border-neutral-200 ${className}`}>
      <iframe
        src={embed}
        title={name ? `Hartă — ${name}` : "Hartă easybox"}
        className="block h-44 w-full border-0"
        loading="lazy"
        // The frame is a third-party document; it has no business reaching back
        // into this page or knowing where the visitor came from.
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
      />
      <div className="flex items-center gap-2 border-t border-neutral-200 bg-white px-3 py-2">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-neutral-600">
          {[name, address].filter(Boolean).join(" · ") || "Easybox"}
        </span>
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-[#7c3aed]"
        >
          Deschide
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
