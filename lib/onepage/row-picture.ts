/**
 * ===========================================================================
 *  THE PICTURE A BLOCK'S ROW SHOWS IN THE EDITOR'S LIST (round AT)
 * ===========================================================================
 * The owner: "make sure that the blocks that I add in the list of the links
 * actually carry on their thumbnail. For example, Google Maps doesn't have
 * the thumbnail." Each row of the Links tab had a picture only for a link, a
 * product, a booking, a PDF and a menu; every other block drew a generic
 * glyph even when the block holds a real picture.
 *
 * rowPictureOf reads the one picture the block already has, in the order the
 * page itself would show it:
 *
 *   link          its own thumbnail, the visual card's picture, or the
 *                 address's preview image (unless the creator removed it)
 *   product       its custom thumbnail or the product's picture
 *   image         the first picture
 *   video         its poster, or YouTube's own still for a YouTube address
 *   music         the cover read from the address
 *   course        the course's picture
 *   signup        the layout's picture or the free product's
 *   free gift     its picture or the product's
 *   shelf         the first picked product's picture, from the catalogue
 *   header        the creator's own photo
 *   map           a map of the place: OpenStreetMap's public tile around the
 *                 point when the place has one (a pasted point or a link with
 *                 coordinates), else a drawn street map (no paid API, no key)
 *
 * Anything else (an app block's brand mark, an embed's mark, a glyph) is left
 * to the row as before. Pure: no React, no network. tests/onepage-at2.test.ts.
 */

import { mapPlaceOf } from "./map-place"
import { shelfPickedIds, shelfSource, shelfTakes } from "./storelib-blocks"

export type RowPicture =
  | { kind: "image"; src: string }
  /* A map tile: its address, and where the place sits in it (0..1 from the left and the top). */
  | { kind: "map"; src: string; x: number; y: number; label: string }
  /* A place with no point to put on a tile: a drawn map with a pin. */
  | { kind: "map-drawn"; label: string }

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

/** A picture address a row can draw: https, a site path, or a data/blob picture. */
export function drawablePicture(v: unknown): string | null {
  const s = text(v)
  if (!s || s.length > 200_000) return null
  if (/^https:\/\//i.test(s) || /^\/(?!\/)/.test(s) || /^data:image\//i.test(s) || /^blob:/i.test(s)) return s
  /* An old http address is asked for over https; the page's CSP takes only https pictures. */
  if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, "https:")
  return null
}

const MAP_ZOOM: Record<string, number> = { street: 16, area: 14, city: 11 }

/**
 * The OpenStreetMap tile a point falls in at `zoom`, and where in it. The
 * standard Web Mercator tiling: x from the longitude, y from the latitude.
 */
export function mapTile(lat: number, lng: number, zoom = 14): { src: string; x: number; y: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85.05 || Math.abs(lng) > 180) return null
  const z = Math.max(1, Math.min(18, Math.round(zoom)))
  const n = 2 ** z
  const fx = ((lng + 180) / 360) * n
  const rad = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  const tx = Math.min(n - 1, Math.max(0, Math.floor(fx)))
  const ty = Math.min(n - 1, Math.max(0, Math.floor(fy)))
  return { src: `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`, x: fx - tx, y: fy - ty }
}

type Product = { id: string; thumbnail_url?: string | null; type?: string | null; archived?: boolean | null }

export function rowPictureOf(
  block: { type: string; data?: unknown; style?: unknown } | null | undefined,
  context: { avatarUrl?: string | null; products?: readonly Product[] | null } = {},
): RowPicture | null {
  if (!block) return null
  const d = (block.data ?? {}) as Record<string, any>
  const img = (...candidates: unknown[]): RowPicture | null => {
    for (const c of candidates) {
      const src = drawablePicture(c)
      if (src) return { kind: "image", src }
    }
    return null
  }
  switch (block.type) {
    case "link_button": {
      const preview = d.link_preview && typeof d.link_preview === "object" ? d.link_preview : null
      const presentation = (block.style as { presentation?: { image_url?: unknown } } | undefined)?.presentation
      /* A mark the creator chose (an icon) beats the address's preview picture; their own thumbnail beats both. */
      return img(d.thumbnail_url, presentation?.image_url) ?? (text(d.icon) ? null : img(preview && !preview.image_hidden ? preview.image : null))
    }
    case "product":
      return img(d.custom_thumbnail, d.product_thumbnail)
    case "image":
      return img(Array.isArray(d.images) ? d.images.find((i: any) => drawablePicture(i?.image_url))?.image_url : null, d.image_url)
    case "pdf_document":
    case "food_menu":
    case "calendly":
      return img(d.thumbnail_url)
    case "video": {
      const yt = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(text(d.url))
      return img(d.poster_url, yt ? `https://i.ytimg.com/vi/${yt[1]}/mqdefault.jpg` : null)
    }
    case "music":
      return img(d.artwork_url)
    case "course":
      return img(d.course_thumbnail)
    case "email_capture":
      return img(d.product_image, d.digital_product_thumbnail)
    case "lead_magnet":
      return img(d.image_url, d.product_thumbnail)
    case "storelib_shelf": {
      const products = (context.products ?? []).filter((p) => !p.archived)
      if (!products.length) return null
      /* The ones the creator picked, in their order; "all" is every product the shelf's source takes. */
      const ids = shelfPickedIds(d as Parameters<typeof shelfPickedIds>[0])
      const source = shelfSource(d.source)
      const picked = ids === null ? products.filter((p) => shelfTakes(source, p.type)) : (ids.map((id) => products.find((p) => p.id.toLowerCase() === id)).filter(Boolean) as Product[])
      return img(...picked.map((p) => p.thumbnail_url))
    }
    case "header":
      return img(context.avatarUrl)
    case "map": {
      const place = mapPlaceOf(d as { address?: string; place?: { from?: string; url?: string } })
      if (!place) return null
      const label = place.label || text(d.address)
      if (typeof place.lat === "number" && typeof place.lng === "number") {
        const tile = mapTile(place.lat, place.lng, MAP_ZOOM[text(d.zoom)] ?? 14)
        if (tile) return { kind: "map", ...tile, label }
      }
      return { kind: "map-drawn", label }
    }
    default:
      return null
  }
}
