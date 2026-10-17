/**
 * ===========================================================================
 *  ADD TO WEBSITE: WHERE A WIDGET GOES
 * ===========================================================================
 * Storelib Reviews › Widgets › Add to website asks two things, which page
 * and where on it, with a sensible answer already picked: a product's
 * widgets under the product on the product page, the shop's at the end of
 * the home page. The answer becomes an address in the website builder
 * (`editorAddress`), which adds the section once the page is open
 * (app/website-builder/editor/[installId]/page.tsx, widgetArrival). No AI
 * and no code on the way. Pure.
 */
import { WIDGET_INFO, isWidgetType, type WidgetType } from "./config"

export type WidgetPage = "product" | "home"
export type WidgetPlacement = "below_product" | "top" | "bottom"

export function defaultPlacement(type: WidgetType): { page: WidgetPage; placement: WidgetPlacement } {
  return WIDGET_INFO[type].home === "product" ? { page: "product", placement: "below_product" } : { page: "home", placement: "bottom" }
}

/** What a request asked for, each value from its list, the widget's own default where it said nothing usable. */
export function readPlacement(params: URLSearchParams): { widget: WidgetType; config: string; page: WidgetPage; placement: WidgetPlacement } | null {
  const widget = params.get("widget")
  if (!isWidgetType(widget)) return null
  const fallback = defaultPlacement(widget)
  const page = params.get("page") === "home" ? "home" : params.get("page") === "product" ? "product" : fallback.page
  const asked = params.get("placement")
  let placement: WidgetPlacement = asked === "top" || asked === "bottom" || asked === "below_product" ? asked : fallback.placement
  /* Under the product means nothing on the home page. */
  if (page === "home" && placement === "below_product") placement = "bottom"
  const config = params.get("config") ?? ""
  return { widget, config: /^[0-9a-f-]{36}$/i.test(config) ? config : "", page, placement }
}

/** The builder's address for it: the page to open, and what to add there. */
export function editorAddress(installId: string, want: { widget: WidgetType; config: string; page: WidgetPage; placement: WidgetPlacement }, productSlug: string | null): string {
  const q = new URLSearchParams()
  q.set("previewPath", want.page === "product" && productSlug ? `/products/${productSlug}` : "/")
  q.set("addReviewWidget", want.widget)
  if (want.config) q.set("reviewConfig", want.config)
  q.set("placement", want.page === "product" && !productSlug && want.placement === "below_product" ? "bottom" : want.placement)
  return `/website-builder/editor/${encodeURIComponent(installId)}?${q.toString()}`
}
