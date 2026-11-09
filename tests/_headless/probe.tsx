/**
 * The probe page for tests/storefront-headless-n2.test.ts: sections of the
 * site's own, drawn on the server by the real renderer (the test does that and
 * hands the markup in as window.__PROBE__), each mounted the way
 * components/website-builder/sections/StorelibSection.tsx mounts it: its
 * markup, its click capture and the real hooks
 * (components/website-builder/sections/site-chrome-hooks.tsx), inside the
 * real cart and storefront providers. Nothing here stands in for the code
 * under test.
 *
 *   #live      a live page: creator id, two languages, two currencies
 *   #canvas    the builder's canvas: install id, the preview's own switch
 *   #fallback  sections with plain openers and no panels of their own
 */
import { useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorefrontHooks } from "@/components/website-builder/sections/site-chrome-hooks"
import { StorefrontProvider, type Storefront } from "@/components/website-builder/theme/storefront-context"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

type Drawn = { id: string; html: string; css: string }
type Probe = { live: Drawn[]; fallback: Drawn[] }
type ProbeWindow = Window & { __PROBE__: Probe; __preview: string[]; __ready?: boolean }

const w = window as unknown as ProbeWindow
w.__preview = []
const mode = (location.hash.replace("#", "") || "live") as "live" | "canvas" | "fallback"
const sections = mode === "fallback" ? w.__PROBE__.fallback : w.__PROBE__.live
const theme = { site_chrome: "home" } as unknown as ThemeSettingsValues

const language = {
  code: "en",
  defaultLanguage: "en",
  languages: [
    { code: "en", name: "English" },
    { code: "fr", name: "Français" },
  ],
  currency: {
    options: [
      { id: "home", label: "USD $", country: "US" },
      { id: "eu", label: "EUR €", country: "FR" },
    ],
    current: "home",
    note: null,
  },
}

const storefront: Storefront =
  mode === "canvas"
    ? {
        installId: "33333333-3333-4333-8333-333333333333",
        inEditor: true,
        language,
        preview: { language: (c: string) => { w.__preview.push(`language:${c}`) }, currency: (c: string) => { w.__preview.push(`currency:${c}`) } },
      }
    : { creatorId: "11111111-1111-4111-8111-111111111111", language }

function Section({ drawn }: { drawn: Drawn }) {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const trigger = useRef<((e: React.MouseEvent<HTMLElement>) => boolean) | null>(null)
  const section = { id: drawn.id, type: drawn.id, settings: {}, blocks: [] } as unknown as SectionInstance
  return (
    <>
      {drawn.css ? <style>{drawn.css}</style> : null}
      <div
        ref={setRoot}
        data-probe-section={drawn.id}
        onClickCapture={(e) => {
          if (trigger.current?.(e)) return
          if (mode === "canvas" && (e.target as HTMLElement).closest("a")) {
            e.preventDefault()
            w.__preview.push(`navigate:${(e.target as HTMLElement).closest("a")?.getAttribute("href")}`)
          }
        }}
        dangerouslySetInnerHTML={{ __html: drawn.html }}
      />
      <StorefrontHooks
        section={section}
        theme={theme}
        html={drawn.html}
        scriptRoot={root}
        inCanvas={mode === "canvas"}
        onEditorNavigate={(href) => { w.__preview.push(`navigate:${href}`) }}
        trigger={trigger}
      />
    </>
  )
}

createRoot(document.getElementById("app")!).render(
  <StorefrontProvider value={storefront}>
    <SiteCartProvider shopId={mode === "canvas" ? undefined : "shop-1"}>
      {sections.map((s) => (
        <Section key={s.id} drawn={s} />
      ))}
    </SiteCartProvider>
  </StorefrontProvider>,
)
w.__ready = true
