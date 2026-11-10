/**
 * The probe page for tests/chrome-kit-p4.test.ts: a page of chrome kit
 * sections (lib/storelib-ai/library/examples/chrome), drawn on the server by
 * the real renderer (the test hands the markup in as window.__PROBE__), each
 * mounted the way the live page mounts it: inside the section box
 * SectionRenderer draws (a size container, `@container`), the StorelibSection
 * wrapper (relative, clipped sideways), its markup, its click capture and the
 * real hooks (components/website-builder/sections/site-chrome-hooks.tsx), in
 * the real cart and storefront providers, a live page with two languages and
 * two currencies. Nothing here stands in for the code under test.
 */
import { useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorefrontHooks } from "@/components/website-builder/sections/site-chrome-hooks"
import { StorefrontProvider, type Storefront } from "@/components/website-builder/theme/storefront-context"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

type Drawn = { id: string; html: string; css: string }
type ProbeWindow = Window & { __PROBE__: { sections: Drawn[]; tokens: string }; __ready?: boolean }

const w = window as unknown as ProbeWindow
const theme = {
  site_chrome: "home",
  menus: { "main-menu": { title: "Main", links: [{ title: "Shop", url: "/shop", links: [{ title: "Shirts", url: "/shop" }] }, { title: "About", url: "/about", links: [] }] } },
} as unknown as ThemeSettingsValues

const storefront: Storefront = {
  creatorId: "11111111-1111-4111-8111-111111111111",
  language: {
    code: "en",
    defaultLanguage: "en",
    languages: [
      { code: "en", name: "English" },
      { code: "fr", name: "Français" },
    ],
    currency: { options: [{ id: "home", label: "USD $", country: "US" }, { id: "eu", label: "EUR €", country: "FR" }], current: "home", note: null },
  },
}

function Section({ drawn }: { drawn: Drawn }) {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const trigger = useRef<((e: React.MouseEvent<HTMLElement>) => boolean) | null>(null)
  const section = { id: drawn.id, type: drawn.id, settings: {}, blocks: [] } as unknown as SectionInstance
  return (
    <div data-section-box="" data-section-type={drawn.id} style={{ containerType: "inline-size" }}>
      <div style={{ position: "relative", overflowX: "clip" }}>
        {drawn.css ? <style>{drawn.css}</style> : null}
        <div
          ref={setRoot}
          data-probe-section={drawn.id}
          onClickCapture={(e) => { trigger.current?.(e) }}
          dangerouslySetInnerHTML={{ __html: drawn.html }}
        />
        <StorefrontHooks section={section} theme={theme} html={drawn.html} scriptRoot={root} inCanvas={false} trigger={trigger} />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <StorefrontProvider value={storefront}>
    <SiteCartProvider shopId="shop-1">
      {w.__PROBE__.sections.map((s) => (
        <Section key={s.id} drawn={s} />
      ))}
    </SiteCartProvider>
  </StorefrontProvider>,
)
w.__ready = true
