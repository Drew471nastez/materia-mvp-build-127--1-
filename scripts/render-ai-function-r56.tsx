/**
 * The probe page for scripts/check-ai-site-function-r56.mjs: each section
 * drawn on the server by the real renderer (scripts/render-ai-function-r56-
 * html.ts) mounted in the real StorelibSection, inside the real storefront,
 * section sources and cart providers, as the live site mounts it, or as the
 * builder's canvas does (window.__MODE === "canvas": inEditor, insideEditor
 * and the editor's navigate, recorded on window.__nav). Nothing here stands
 * in for the code under test.
 */
import { createRoot } from "react-dom/client"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

type Drawn = { ok: boolean; html: string; css: string; section: SectionInstance }
const w = window as unknown as { __SECTIONS__: Record<string, Drawn>; __MODE: "live" | "canvas"; __CREATOR: string; __nav: string[] }
const drawn = w.__SECTIONS__
const canvas = w.__MODE === "canvas"
w.__nav = []
const onEditorNavigate = canvas ? (href: string) => { w.__nav.push(href) } : undefined
const order = ["agent", "contact", "promo_newsletter", "newsletter_split", "hero_product"].filter((k) => drawn[k]?.ok)
const prerendered = Object.fromEntries(order.map((k) => [drawn[k].section.id, { html: drawn[k].html, css: drawn[k].css }]))

createRoot(document.getElementById("app")!).render(
  <StorefrontProvider value={{ creatorId: w.__CREATOR, currency: "USD", inEditor: canvas } as never}>
    <SiteCartProvider shopId="shop-1" currency="USD">
      <StorelibSourcesProvider prerendered={prerendered as never} page={{ template: "index" }}>
        {order.map((k) => (
          <div key={k} data-probe={k}>
            <StorelibSection section={drawn[k].section} theme={{} as ThemeSettingsValues} insideEditor={canvas} onEditorNavigate={onEditorNavigate} />
          </div>
        ))}
      </StorelibSourcesProvider>
    </SiteCartProvider>
  </StorefrontProvider>,
)
