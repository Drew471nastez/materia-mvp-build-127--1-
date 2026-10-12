/**
 * Mounts the real website builder header for scripts/check-header-icons.mjs (a copy of render-header-drawers.tsx with Add to cart),
 * in one of three places, picked by `?scenario=` on the page's address:
 *
 *   editor-desktop  the editor's canvas showing the desktop layout
 *   editor-phone    the editor's canvas showing the phone layout, 390 wide
 *   live            a published page, the header in the document
 *
 * `window.__set(patch)` changes the header's settings the way the panel
 * does, `window.__openCart()` opens the cart the way Add to cart does.
 */
import { createRoot } from "react-dom/client"
import { createElement, useEffect, useState } from "react"

import { HeaderSection } from "@/components/website-builder/sections/renderers/HeaderSection"
import { SiteCartProvider, useSiteCart } from "@/components/website-builder/site-cart"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const theme = {
  ...Object.fromEntries(
    THEME_SETTINGS_GROUPS.flatMap((g) =>
      (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
    ),
  ),
  brand_name: "Luca Dragoste",
} as unknown as ThemeSettingsValues

/* The links in the report: one with a sub-menu, three without. */
const blocks = [
  { id: "n1", type: "nav_link", settings: { label: "Ghostwriting", url: "/ghostwriting", link_type: "custom" } },
  { id: "n1a", type: "nav_link", settings: { label: "LinkedIn posts", url: "/ghostwriting/linkedin", link_type: "custom", parent_id: "n1" } },
  { id: "n1b", type: "nav_link", settings: { label: "Newsletters", url: "/ghostwriting/newsletters", link_type: "custom", parent_id: "n1" } },
  { id: "n2", type: "nav_link", settings: { label: "Portfolio", url: "#portfolio", link_type: "custom" } },
  { id: "n3", type: "nav_link", settings: { label: "Pricing", url: "/pricing", link_type: "custom" } },
  { id: "n4", type: "nav_link", settings: { label: "Templates", url: "/templates", link_type: "custom" } },
]

const scenario = new URLSearchParams(location.search).get("scenario") ?? "live"
const initial = (() => {
  try { return JSON.parse(new URLSearchParams(location.search).get("settings") ?? "{}") as Record<string, unknown> } catch { return {} }
})()

declare global {
  interface Window {
    __set?: (patch: Record<string, unknown>) => void
    __openCart?: () => void
    __headerProbeReady?: boolean
  }
}

function CartOpener() {
  const { setOpen, add } = useSiteCart()
  useEffect(() => {
    window.__openCart = () => setOpen(true)
    ;(window as unknown as { __addToCart: () => void }).__addToCart = () =>
      add({ productId: "p1", variantId: null, title: "Black Sleeve", variantName: null, priceCents: 3500, thumbnailUrl: null, slug: "black-sleeve", digital: false, physical: true, quantity: 1 } as never)
  }, [setOpen, add])
  return null
}

function Mount() {
  const [settings, setSettings] = useState<Record<string, unknown>>({
    header_sticky_enabled: true,
    show_cart_icon: true,
    show_search_icon: true,
    cta_text: "Ask about a post",
    cta_url: "/contact",
    mobile_menu_style: "left",
    ...initial,
  })
  useEffect(() => {
    window.__set = (patch) => setSettings((s) => ({ ...s, ...patch }))
    window.__headerProbeReady = true
  }, [])
  const section = { id: "header", type: "header", settings, blocks } as unknown as SectionInstance
  const editor = scenario.startsWith("editor")
  const header = createElement(HeaderSection, {
    key: "header",
    section,
    theme,
    ...(editor
      ? {
          deviceMode: (scenario === "editor-phone" ? "mobile" : "desktop") as "mobile" | "desktop",
          insideEditor: true,
          isEditing: true,
          onEditorNavigate: () => {},
        }
      : {}),
  })
  return createElement(StorefrontProvider, {
    value: { installId: "00000000-0000-4000-8000-000000000000", inEditor: editor },
    children: createElement(SiteCartProvider, {
      shopId: "probe-shop",
      children: [createElement(CartOpener, { key: "cart" }), header],
    }),
  })
}

createRoot(document.getElementById("mount")!).render(createElement(Mount))
