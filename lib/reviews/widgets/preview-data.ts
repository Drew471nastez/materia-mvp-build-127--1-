/**
 * ===========================================================================
 *  WHAT THE GALLERY PREVIEWS ARE DRAWN FROM
 * ===========================================================================
 * The store's own published reviews (/api/reviews/storefront, the builder's
 * read), so a widget is judged on what it will really show. A product
 * widget is shown on the product with the most reviews, as on that
 * product's page. Only while the store has none yet are the reviews
 * samples (`sample`, said on every preview), and only then do they carry
 * sample photos, drawn here, so the photo wall has something to lay out.
 * A website never gets any of this: its pages read real reviews only.
 * Pure.
 */
import { summaryOf, type StorefrontReview } from "../storefront"
import type { WidgetReviews } from "./render"

const TONES = [
  ["#e9d8c4", "#b98b5e"],
  ["#d5e3dc", "#5f8f7a"],
  ["#dfe1ec", "#6c75a3"],
  ["#f0dcdc", "#b46a6a"],
  ["#e6e2d3", "#8d8457"],
  ["#d9e6ee", "#5a87a3"],
]

/** A plain picture for a sample review: a soft colour and a simple shape, nothing that looks like a real product. */
export function samplePhoto(i: number): string {
  const [bg, fg] = TONES[i % TONES.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="${bg}"/><circle cx="${140 + (i % 3) * 60}" cy="${170 + (i % 2) * 40}" r="${70 + (i % 4) * 12}" fill="${fg}" opacity=".55"/><rect x="${60 + (i % 5) * 20}" y="250" width="220" height="90" rx="18" fill="${fg}" opacity=".35"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const EXTRA_SAMPLES: Omit<StorefrontReview, "id" | "iso" | "date" | "product_id" | "product_title" | "product_url" | "product_image">[] = [
  { rating: 5, title: "Lovely quality", body: "Looks even better in person. Packed with care and arrived quickly.", author: "Lena W.", initial: "L", verified: true, featured: false, photos: [], has_photos: false, reply: "" },
  { rating: 4, title: "Very happy", body: "Great value. Took a few days to arrive but worth the wait.", author: "Omar H.", initial: "O", verified: true, featured: false, photos: [], has_photos: false, reply: "" },
  { rating: 5, title: "", body: "Second time ordering. Still just as good.", author: "Chloe B.", initial: "C", verified: false, featured: false, photos: [], has_photos: false, reply: "" },
]

/**
 * The reviews a gallery preview reads: the store's, with `product` set to
 * its most reviewed product so product widgets look as on that product's
 * page. Samples get a few more reviews and pictures.
 */
export function previewReviews(input: WidgetReviews | null | undefined): WidgetReviews | null {
  if (!input || !input.all) return null
  let items = input.all.items
  if (input.sample) {
    const base = items[0]
    const more = EXTRA_SAMPLES.map((r, i) => ({ ...base, ...r, id: `sample-x${i}`, featured: false }))
    items = [...items, ...more].map((r, i) => {
      const photos = i % 2 === 0 ? [samplePhoto(i), ...(i % 4 === 0 ? [samplePhoto(i + 3)] : [])] : []
      return { ...r, photos, has_photos: photos.length > 0 }
    })
  }
  const all = input.sample ? { ...input.all, items, summary: summaryOf(items.map((r) => r.rating)) } : input.all
  const counts = new Map<string, number>()
  for (const r of items) counts.set(r.product_id, (counts.get(r.product_id) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const own = input.product ?? (top ? { id: top, title: items.find((r) => r.product_id === top)?.product_title ?? "", summary: summaryOf(items.filter((r) => r.product_id === top).map((r) => r.rating)), items: items.filter((r) => r.product_id === top) } : null)
  return { ...input, all, product: own }
}
