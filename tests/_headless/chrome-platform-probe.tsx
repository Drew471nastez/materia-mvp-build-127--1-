/**
 * The probe page for tests/chrome-platform-q1.test.ts: a whole page the way
 * ThemePage draws it, from parts the test hands in as window.__PROBE__ (all
 * made by the real code on the server side of the test: the theme
 * stylesheet and variables from lib/website-builder/theme-css.ts, each
 * section's markup and CSS from the real renderer, the language choice from
 * lib/markets/choice.ts). Here each section is mounted as SectionRenderer and
 * StorelibSection mount it: the page root (data-storelib-theme), the section
 * box (data-section-box, data-chrome for the Header and Footer groups, a size
 * container), the section wrapper (relative, clipped sideways), its markup,
 * its click capture, the real hooks (sections/site-chrome-hooks.tsx) and the
 * real scroll state (sections/header-scroll.ts), in the real cart and
 * storefront providers. `#canvas` puts the page in a scrolling card with the
 * builder's id, as the editor does.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createRoot } from "react-dom/client"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorefrontHooks } from "@/components/website-builder/sections/site-chrome-hooks"
import { useHeaderScroll } from "@/components/website-builder/sections/header-scroll"
import { StorefrontProvider, type Storefront } from "@/components/website-builder/theme/storefront-context"
import { publishAnchorOffset } from "@/lib/website-builder/section-motion"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

type Drawn = { id: string; html: string; css: string; group?: "header" | "footer" }
type Probe = { sections: Drawn[]; css: string; vars: Record<string, string>; theme: Record<string, unknown>; storefront: Storefront }
type ProbeWindow = Window & { __PROBE__: Probe; __ready?: boolean }

const w = window as unknown as ProbeWindow
const canvas = location.hash === "#canvas"
const probe = w.__PROBE__
const theme = probe.theme as unknown as ThemeSettingsValues
const storefront: Storefront = { ...probe.storefront, ...(canvas ? { inEditor: true, creatorId: undefined, installId: "33333333-3333-4333-8333-333333333333", preview: { language: () => {}, currency: () => {} } } : {}) }

function Section({ drawn }: { drawn: Drawn }) {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const trigger = useRef<((e: React.MouseEvent<HTMLElement>) => boolean) | null>(null)
  const section = { id: drawn.id, type: drawn.id, settings: {}, blocks: [], ...(drawn.group ? { group: drawn.group } : {}) } as unknown as SectionInstance
  useHeaderScroll(root, { inCanvas: canvas, header: drawn.group === "header", html: drawn.html })
  return (
    <div data-section-box="" data-section-type={drawn.id} data-section-key={drawn.id} data-chrome={drawn.group ? "" : undefined} style={{ containerType: "inline-size" }}>
      <div data-section="" style={{ position: "relative", overflowX: "clip" }}>
        {drawn.css ? <style>{drawn.css}</style> : null}
        <div
          ref={setRoot}
          data-probe-section={drawn.id}
          onClickCapture={(e) => {
            if (trigger.current?.(e)) return
            const a = (e.target as HTMLElement).closest("a")
            if (a) e.preventDefault()
          }}
          dangerouslySetInnerHTML={{ __html: drawn.html }}
        />
        <StorefrontHooks section={section} theme={theme} html={drawn.html} scriptRoot={root} inCanvas={canvas} trigger={trigger} onEditorNavigate={() => {}} />
      </div>
    </div>
  )
}

function Page() {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => { if (ref.current) publishAnchorOffset(ref.current) }, [])
  const page = (
    <div ref={ref} data-storelib-theme="" style={{ ...(probe.vars as CSSProperties), containerType: "inline-size" }}>
      <style>{probe.css}</style>
      {probe.sections.map((s) => <Section key={s.id} drawn={s} />)}
    </div>
  )
  return canvas ? <div id="wb-preview-root" style={{ height: "100vh", overflow: "auto" }}>{page}</div> : page
}

createRoot(document.getElementById("app")!).render(
  <StorefrontProvider value={storefront}>
    <SiteCartProvider shopId={canvas ? undefined : "shop-1"}>
      <Page />
    </SiteCartProvider>
  </StorefrontProvider>,
)
w.__ready = true
