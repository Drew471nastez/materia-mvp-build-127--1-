/**
 * Website settings › General › Preview, from what the canvas is drawn in:
 * the editor's usePreviewLanguage and usePreviewMarket, and the same setters
 * the theme's own selectors on the page call, so the two agree both ways.
 * Worked out once, here, for the editor and for its probe
 * (scripts/check-editor-preview-controls.mjs).
 */
import type { PreviewControls } from "@/components/website-builder/website-settings/types"
import type { PreviewMarketOption } from "@/components/website-builder/use-preview-market"

export function previewControlsOf(x: {
  ready: boolean
  defaultLanguage: string
  /** Every language of the website (empty for one in a single language). */
  languages: string[]
  published: string[]
  /** The language picked; null, the default. */
  locale: string | null
  setLocale: (code: string | null) => void
  base: string
  /** The markets a visitor can be shown prices in today (usePreviewMarket options). */
  options: PreviewMarketOption[]
  /** The market picked; null, the store's own currency. */
  marketId: string | null
  pickMarket: (id: string | null) => void
}): PreviewControls {
  const def = x.defaultLanguage
  return {
    ready: x.ready,
    languages: [def, ...x.languages.filter((l) => l !== def)].map((code) => ({ code, published: code === def || x.published.includes(code) })),
    defaultLanguage: def,
    locale: x.locale ?? def,
    setLocale: x.setLocale,
    currencies: [
      { id: "home", currency: x.base, name: "" },
      ...x.options.map((m) => ({ id: m.id, currency: m.currency, name: m.name || m.countries.join(", ") })),
    ],
    market: x.marketId ?? "home",
    setMarket: (id: string) => x.pickMarket(id === "home" ? null : id),
  }
}
