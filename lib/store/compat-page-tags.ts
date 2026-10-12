/**
 * Everything an imported theme's live page gets before its </body>
 * (app/api/site-theme/site): the product the page is about for Google
 * Analytics (lib/store/ga.ts gaProductJs), the store's analytics and pixels
 * with consent mode starting as granted (an imported theme shows no
 * Storelib cookie banner to ask with; a visitor's own answer from one still
 * wins), Storelib's own tracker, and the offer of the visitor's language
 * (lib/markets/suggest-script.ts). One string, so the route and the probe
 * (scripts/check-visitors25.ts) put exactly the same thing on the page.
 */
import { compatTrackScript, compatTrackingTags } from "@/lib/storelib-theme/compat/track-script"
import { languageSuggestTag } from "@/lib/markets/suggest-script"
import { trackingTags } from "./tracking"
import { gaProductJs, type GaItem } from "./ga"
import { handleize } from "@/lib/storelib-theme/compat/filters"

type Listed = { id: string; settings: Record<string, unknown> }

/**
 * The id of the product a page is about, from its address
 * (/products/<handle>, also under /collections/<c>/), looked up in the
 * lists the site already holds, the way the page found it
 * (lib/storelib-theme/compat/site.ts findProduct). No read: the page's own
 * product read (the description, each variant's stock) already ran once to
 * draw it, and the tags need only the id.
 */
export function productIdForPath(site: { products: Listed[]; pickable?: Listed[] }, path: string): string | null {
  const raw = path.match(/^(?:\/collections\/[^/]+)?\/products\/([^/]+)\/?$/)?.[1]
  if (!raw) return null
  let handle = raw
  try { handle = decodeURIComponent(raw) } catch { /* kept as written */ }
  const is = (p: Listed) => String(p.settings.slug ?? "") === handle || p.id === handle || handleize(String(p.settings.title ?? "")) === handle
  return (site.products.find(is) ?? site.pickable?.find(is))?.id ?? null
}

export function compatPageTags(input: {
  stored: unknown
  creatorId: string
  productId: string | null
  /** The product, named for Google Analytics, when the store has it on (lib/store/ga-server gaProductFor). */
  named: { item: GaItem; currency: string | null } | null
  i18n: { locale: string; defaultLanguage: string; languages: string[] } | null | undefined
  mainDomain: string
}): string {
  const item = input.named ? gaProductJs(input.named.item, input.named.currency) : ""
  return (
    (item ? `<script data-storelib-tag="ga-item">${item}</script>` : "") +
    compatTrackingTags(trackingTags(input.stored, { creatorId: input.creatorId, asks: false })) +
    compatTrackScript({ creatorId: input.creatorId, productId: input.productId, mainDomain: input.mainDomain }) +
    (input.i18n && input.i18n.languages.length > 1 ? languageSuggestTag({ current: input.i18n.locale, defaultLanguage: input.i18n.defaultLanguage, languages: input.i18n.languages, address: "path" }) : "")
  )
}
