/**
 * The editor's preview language and currency, alone, for
 * scripts/check-editor-preview-controls.mjs: the real hooks the canvas
 * reads (usePreviewLanguage, usePreviewMarket) over stubbed routes, Website
 * settings open on General with the Preview card made from them, and the
 * theme's own selector played by window.__theme, which calls the same
 * setters the canvas's selector does. `?mode=note` draws a section panel's
 * column, 288px, with the line the inspector shows in another language.
 */
import * as React from "react"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import { usePreviewLanguage } from "@/components/website-builder/use-preview-language"
import { usePreviewMarket } from "@/components/website-builder/use-preview-market"
import { previewControlsOf } from "@/components/website-builder/preview-controls"
import { PreviewLanguageNote } from "@/components/website-builder/editor/preview-language-note"

declare global {
  interface Window {
    __calls?: string[]
    __theme?: { language: (code: string) => void; currency: (id: string) => void }
    __canvas?: { locale: string | null; marketId: string | null; currency: string | null }
  }
}

const params = new URLSearchParams(location.search)
const single = params.get("store") === "single"

function stubFetch() {
  const calls: string[] = (window.__calls = [])
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }))
  const languages = single ? ["en"] : ["en", "fr", "es"]
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? "GET"} ${url}`)
    if (url.startsWith("/api/store/translations")) {
      const locale = new URL(url, location.origin).searchParams.get("locale")
      return json({ locale: locale ?? "en", defaultLanguage: "en", languages, published: single ? [] : ["fr"], values: {} })
    }
    if (url === "/api/store/markets?preview=1") {
      return json({
        saved: true,
        base: "USD",
        chargeCurrency: "USD",
        home: { name: "United States", country: "US" },
        markets: single ? [] : [{ id: "eu", name: "Europe", currency: "EUR", countries: ["FR", "DE"], rounding: "none", adjustBps: 0, rate: 0.92 }],
        fx: null,
      })
    }
    if (url === "/api/store/markets") {
      return json({
        baseCurrency: "USD",
        localization: {
          defaultLanguage: "en",
          languages: languages.map((code) => ({ code, published: code !== "es" })),
          markets: single ? [] : [{ id: "eu", name: "Europe", currency: "EUR", countries: ["FR", "DE"], active: true }],
        },
      })
    }
    return json({})
  }) as typeof fetch
}

function Editor() {
  const lang = usePreviewLanguage("install-1")
  const market = usePreviewMarket("install-1")
  const pickMarket = React.useCallback((id: string | null) => market.setMarket(id), [market.setMarket])
  /* The theme's own selector on the page: the setters the canvas's calls (page.tsx canvasSwitch). */
  React.useEffect(() => {
    window.__theme = { language: (code) => lang.setLocale(code), currency: (id) => pickMarket(id === "home" ? null : id) }
    window.__canvas = { locale: lang.locale, marketId: market.marketId, currency: market.pricing?.currency ?? null }
  })
  const preview = previewControlsOf({
    ready: lang.ready && market.ready,
    defaultLanguage: lang.defaultLanguage,
    languages: lang.languages,
    published: lang.published,
    locale: lang.locale,
    setLocale: lang.setLocale,
    base: market.base,
    options: market.options,
    marketId: market.marketId,
    pickMarket,
  })
  return (
    <ProjectSettings
      open
      onClose={() => {}}
      installId="install-1"
      name="Astrid Studio"
      onRenamed={() => {}}
      websiteUrl="https://astrid.storelib.com"
      websiteUrlDisplay="astrid.storelib.com"
      live
      publishedAt="2026-09-22T09:30:00Z"
      onNavigate={(href) => window.__calls?.push(`navigate ${href}`)}
      preview={preview}
    />
  )
}

function NoteColumn() {
  return (
    <div className="bg-background text-foreground" style={{ width: 288, borderRight: "1px solid #e5e7eb", height: "100vh" }} data-probe-column="">
      <div data-sheet-scroll="">
        <PreviewLanguageNote locale="es" onEdit={(href) => window.__calls?.push(`navigate ${href}`)} />
        <div className="space-y-3.5 px-3.5 py-3.5">
          <label className="block text-[13px] font-medium">Heading</label>
          <input className="h-9 w-full rounded-md border border-border px-2 text-[13px]" defaultValue="Film presets for slow travel" />
        </div>
      </div>
    </div>
  )
}

export function boot(mount: (el: React.ReactElement) => void) {
  stubFetch()
  mount(params.get("mode") === "note" ? <NoteColumn /> : <Editor />)
}
