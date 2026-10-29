/**
 * ===========================================================================
 *  ADD TO WEBSITE, THE BUILDER'S HALF
 * ===========================================================================
 * Storelib Reviews › Widgets › Add to website opens the builder at
 * `?previewPath=<page>&addReviewWidget=<widget>&reviewConfig=<id>&placement=<where>`
 * (./placement.ts editorAddress). The builder reads those words once
 * (`readWidgetArrival`), takes them off the address, and adds the section
 * only when `planWidgetArrival` says the page it was asked for is the page
 * open, with the section's schema in hand.
 *
 * WHY IT WAITS FOR THE PAGE, NOT ONLY FOR THE FIRST SECTIONS. A product
 * page opened from the address is drawn in two steps: the generic product
 * template first, then the chosen product's page put in its place
 * (handleSelectProductPage in the editor). The section used to go in on the
 * first step and the second threw it away, so the builder opened and
 * nothing was added. And an imported theme's own files (where its Reviews
 * widget section lives) can land after its sections: before them the
 * builder took the theme for a Storelib one and added Storelib's section,
 * which an imported theme cannot draw. Pure: no DOM, no React.
 */
import { isWidgetType, type WidgetType } from "./config"
import { isMainProductSectionType, REVIEW_WIDGET_SECTION_TYPE } from "@/lib/storelib-theme/compat/storelib-reviews"

export const WIDGET_ARRIVAL_PARAMS = ["addReviewWidget", "reviewConfig", "placement"] as const

export type WidgetArrival = { widget: WidgetType; config: string; placement: string }

/** What the address asks to add, and the address without those words (null: it asks nothing, and nothing needs taking off). */
export function readWidgetArrival(href: string): { want: WidgetArrival | null; cleaned: string | null } {
  const url = new URL(href)
  const widget = url.searchParams.get("addReviewWidget")
  if (widget === null) return { want: null, cleaned: null }
  const want = isWidgetType(widget) ? { widget, config: url.searchParams.get("reviewConfig") ?? "", placement: url.searchParams.get("placement") ?? "" } : null
  for (const k of WIDGET_ARRIVAL_PARAMS) url.searchParams.delete(k)
  return { want, cleaned: url.pathname + url.search + url.hash }
}

type SectionLike = { type: string; group?: string }
type SchemaLike = { presets?: { settings?: Record<string, unknown> }[] } | undefined

export type ArrivalState = {
  /** The editor is still reading the install, or drawing a page it switched to. */
  busy: boolean
  sections: readonly SectionLike[]
  /** How many of `sections` are the Header group (they come first). */
  headerCount: number
  /** An imported theme, known from the install's settings or from its files. */
  compat: boolean
  schemaOf: (type: string) => SchemaLike
}

export type ArrivalPlan = { type: string; presetIndex: number; settings: Record<string, unknown>; at: number | null }

/** Null while it is too early to add it; the section to add, and where, once it is not. */
export function planWidgetArrival(want: WidgetArrival, state: ArrivalState): ArrivalPlan | null {
  if (state.busy || state.sections.length === 0) return null
  const type = state.compat ? REVIEW_WIDGET_SECTION_TYPE : "reviews_widget"
  const schema = state.schemaOf(type)
  if (!schema) return null
  const presetIndex = Math.max(0, (schema.presets ?? []).findIndex((p) => p.settings?.widget === want.widget))
  const main = state.sections.findIndex((x) => isMainProductSectionType(x.type))
  const at = want.placement === "top" ? state.headerCount : want.placement === "below_product" && main >= 0 ? main + 1 : null
  return { type, presetIndex, settings: { widget: want.widget, review_config: /^[0-9a-f-]{36}$/i.test(want.config) ? want.config : "" }, at }
}
