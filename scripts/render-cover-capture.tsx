/**
 * A page shaped like a real creator's home page, photographed by the same
 * function the editor uses to make the website page's cover.
 *
 * Nothing had ever looked at what that function produces. The cover pipeline
 * was only ever checked by its parts — the route's magic bytes, the path
 * rules, the debounce — so a picture that came out blank, cropped wrong or
 * missing its images would have passed every test there is. This mounts the
 * real ThemePage at the width the editor photographs it at and hands the
 * result back to scripts/check-cover-capture.mjs to measure and to look at.
 *
 * The page is modelled on the one the cover was reported against: a coral
 * header with a submenu, a split hero with a photograph beside the heading.
 */
import { createRoot } from "react-dom/client"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { captureNode, readyForCapture } from "@/lib/website-builder/snapshot-capture"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/*
  THE PHOTOGRAPH, DRAWN HERE. A picture from the network would make the
  probe depend on the network; a data URL is an image the capture has to
  inline exactly as it would a real one, and it has a colour the probe can
  look for in the result.
*/
function photo(): string {
  const c = document.createElement("canvas")
  c.width = 800
  c.height = 600
  const g = c.getContext("2d")!
  const grad = g.createLinearGradient(0, 0, 800, 600)
  grad.addColorStop(0, "#c8742f")
  grad.addColorStop(1, "#7a3e14")
  g.fillStyle = grad
  g.fillRect(0, 0, 800, 600)
  return c.toDataURL("image/png")
}

const base = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((grp) =>
    (grp.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues

const theme = {
  ...base,
  color_schemes: {
    ...(base as unknown as { color_schemes?: Record<string, unknown> }).color_schemes,
    coral: {
      name: "Coral",
      background: "#FF6B6B",
      text: "#FFFFFF",
      heading: "#FFFFFF",
      border: "#1A1A2E",
      link: "#FFFFFF",
      accent: "#FFFFFF",
    },
  },
} as unknown as ThemeSettingsValues

const sections: SectionInstance[] = [
  {
    id: "hdr",
    type: "header",
    settings: { color_scheme: "coral", header_sticky: false, brand_name: "THE CHAIR" },
    blocks: [
      { id: "n1", type: "nav_item", settings: { label: "Home", url: "/" } },
      { id: "n2", type: "nav_item", settings: { label: "Services", url: "/services" } },
      { id: "n3", type: "nav_item", settings: { label: "Book now", url: "/book", parent_id: "n2" } },
      { id: "n4", type: "nav_item", settings: { label: "Our shop", url: "/shop" } },
    ],
  },
  /*
    FROM ITS PRESET, THE WAY THE EDITOR ADDS IT. The first version of this
    passed a hand-written settings object, the .storelib section rendered at
    0px tall, the whole page came to 68px, and captureNode — which refuses
    anything shorter than 120 — returned nothing. That was the fixture, not
    the product: a section added in the editor starts from its preset with
    every setting filled in. Only the words and the picture are changed.
  */
  {
    id: "hero",
    type: "hero_split",
    blocks: STORELIB_SCHEMAS.hero_split?.presets?.[0]?.blocks ?? [],
    settings: {
      ...(STORELIB_SCHEMAS.hero_split?.presets?.[0]?.settings ?? {}),
      heading: "Made by hand, sent the same week",
      subheading: "Small batches, honest materials and a note in every parcel.",
      image: photo(),
    },
  },
] as unknown as SectionInstance[]

declare global {
  interface Window {
    __capture: () => Promise<{ type: string; bytes: number; dataUrl: string } | null>
    __why: () => Promise<string>
    __stageCapture: () => Promise<{ type: string; bytes: number; dataUrl: string; ms: number } | null>
  }
}

/* When captureNode returns nothing, the editor swallows it by design. This
   asks the same library directly so the probe can say what went wrong. */
/*
  THE STAGE, THE WAY THE EDITOR BUILDS IT: a fresh copy of the page in a
  fixed, invisible wrapper marked data-snapshot-stage, photographed as soon
  as readyForCapture says it can be. Three things can go wrong here that the
  capture above cannot see, because that page has been sitting there for
  seconds: the wrapper's opacity leaking into the picture, the entrance
  animation still running, and pictures not yet decoded.
*/
window.__stageCapture = async () => {
  const t0 = performance.now()
  const wrap = document.createElement("div")
  wrap.setAttribute("data-snapshot-stage", "")
  Object.assign(wrap.style, {
    position: "fixed", left: "0", top: "0", width: "1200px", height: "800px",
    overflow: "hidden", opacity: "0", pointerEvents: "none", zIndex: "-1",
  })
  const inner = document.createElement("div")
  Object.assign(inner.style, { display: "flex", flexDirection: "column", width: "100%" })
  wrap.appendChild(inner)
  document.body.appendChild(wrap)
  const root = createRoot(inner)
  root.render(
    <StorelibLiveProvider sources={{}} inEditor>
      <SiteCartProvider shopId={undefined}>
        <ThemePage theme={theme} sections={sections} storefront={{ inEditor: true }} />
      </SiteCartProvider>
    </StorelibLiveProvider>,
  )
  await readyForCapture(inner)
  const blob = await captureNode(inner)
  root.unmount()
  wrap.remove()
  if (!blob) return null
  const dataUrl = await new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.readAsDataURL(blob)
  })
  return { type: blob.type, bytes: blob.size, dataUrl, ms: Math.round(performance.now() - t0) }
}

window.__why = async () => {
  const node = document.getElementById("canvas")!
  const r = node.getBoundingClientRect()
  try {
    const { toCanvas } = await import("html-to-image")
    const c = await toCanvas(node, { width: Math.round(r.width), height: Math.round(Math.min(r.height, r.width / 1.6)), pixelRatio: 1, skipAutoScale: true })
    return `toCanvas worked: ${c.width}x${c.height}; node ${Math.round(r.width)}x${Math.round(r.height)}`
  } catch (e) {
    return `toCanvas threw: ${e instanceof Error ? e.message : String(e)}; node ${Math.round(r.width)}x${Math.round(r.height)}`
  }
}

window.__capture = async () => {
  const node = document.getElementById("canvas")!
  const blob = await captureNode(node)
  if (!blob) return null
  const dataUrl = await new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.readAsDataURL(blob)
  })
  return { type: blob.type, bytes: blob.size, dataUrl }
}

createRoot(document.getElementById("app")!).render(
  /* The editor photographs its canvas at whatever width the canvas is; on a
     laptop that is about this. */
  <div style={{ width: 1200 }}>
    <div id="canvas" style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {/* The editor's own provider, with the theme's bundled sources: a
          .storelib section has no engine of its own and draws nothing
          without one. */}
      <StorelibLiveProvider sources={{}} inEditor>
        <SiteCartProvider shopId={undefined}>
          <ThemePage theme={theme} sections={sections} storefront={{ inEditor: true }} />
        </SiteCartProvider>
      </StorelibLiveProvider>
    </div>
  </div>,
)
