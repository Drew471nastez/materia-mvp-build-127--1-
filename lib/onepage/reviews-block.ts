// OnePage: the Reviews block's rules (round AR)
// Location: lib/onepage/reviews-block.ts
//
// One block (an app block with provider "reviews") that shows reviews three
// ways, the creator's choice:
//
//   storelib     the store's own published reviews (Storelib Reviews), read
//                on the server (lib/onepage/data-blocks-server.ts) with the
//                score and how many
//   trustpilot   Trustpilot's own TrustBox, in Trustpilot's own frame: the
//                creator pastes the TrustBox code Trustpilot Business gives
//                them, and the frame is the one that code would load
//   google       the Google rating as the creator reads it on Google, and a
//                button to the reviews there (Google offers no reviews frame
//                without a Places key, and nothing is scraped)
//
// Layouts (lib/onepage/app-blocks): classic is a list, carousel slides,
// grid is cards two across, and card is the score on one card that opens
// every review in a sheet.

export type ReviewSource = "storelib" | "google" | "trustpilot"

export function reviewSourceOf(data: { review_source?: unknown } | null | undefined): ReviewSource {
  const v = data?.review_source
  return v === "google" || v === "trustpilot" ? v : "storelib"
}

export interface TrustBox {
  templateId: string
  businessUnitId: string
  locale: string
  height: number
  theme: "light" | "dark"
  token: string | null
  stars: string | null
}

const attr = (code: string, name: string) => code.match(new RegExp(`${name}\\s*=\\s*["']([^"']{1,120})["']`, "i"))?.[1] ?? null

/**
 * The TrustBox the pasted code describes, or null. Only the ids are read
 * from it: nothing pasted is ever put on the page as it is.
 */
export function readTrustBox(code: unknown): TrustBox | null {
  if (typeof code !== "string" || code.length > 4000) return null
  const templateId = attr(code, "data-template-id")
  const businessUnitId = attr(code, "data-businessunit-id")
  if (!templateId || !/^[0-9a-f]{24}$/i.test(templateId) || !businessUnitId || !/^[0-9a-f]{24}$/i.test(businessUnitId)) return null
  const locale = attr(code, "data-locale")
  const height = Number.parseInt(attr(code, "data-style-height") ?? "", 10)
  const token = attr(code, "data-token")
  const stars = attr(code, "data-stars")
  return {
    templateId: templateId.toLowerCase(),
    businessUnitId: businessUnitId.toLowerCase(),
    locale: locale && /^[a-z]{2}(-[A-Z]{2})?$/.test(locale) ? locale : "en-US",
    height: Number.isFinite(height) && height >= 20 && height <= 1200 ? height : 140,
    theme: attr(code, "data-theme") === "dark" ? "dark" : "light",
    token: token && /^[0-9a-f-]{8,64}$/i.test(token) ? token : null,
    stars: stars && /^[1-5](,[1-5]){0,4}$/.test(stars) ? stars : null,
  }
}

/** Trustpilot's own frame for a TrustBox: the address its loader script builds from the same ids. */
export function trustBoxSrc(box: TrustBox): string {
  const hash = new URLSearchParams({ locale: box.locale, styleHeight: `${box.height}px`, styleWidth: "100%", theme: box.theme })
  if (box.token) hash.set("token", box.token)
  if (box.stars) hash.set("stars", box.stars)
  return `https://widget.trustpilot.com/trustboxes/${box.templateId}/index.html?businessunitId=${box.businessUnitId}#${hash.toString()}`
}

/** Stars as five shares 0..1 for a score, for drawing: 4.6 is four full and one 60%. */
export function starShares(score: number): number[] {
  const s = Math.max(0, Math.min(5, Number.isFinite(score) ? score : 0))
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, s - i)))
}
