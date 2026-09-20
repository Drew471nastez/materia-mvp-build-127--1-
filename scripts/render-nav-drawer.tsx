/**
 * Mounts the real website builder header twice, once the way the editor
 * mounts it and once the way a published site does, so a browser can open
 * the mobile menu and measure where it lands and what moves underneath.
 * Bundled and driven by scripts/check-nav-drawer.mjs.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { HeaderSection } from "@/components/website-builder/sections/renderers/HeaderSection"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) =>
    (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues

const section = (id: string): SectionInstance =>
  ({
    id,
    type: "header",
    settings: {
      menu_items: [
        { label: "Shop", url: "/shop", open_in_new: false },
        { label: "About", url: "/about", open_in_new: false },
        { label: "Contact", url: "/contact", open_in_new: false },
      ],
      header_sticky: true,
    },
  }) as unknown as SectionInstance

/*
  THE EDITOR CANVAS, AS IT IS ON THE PAGE.

  `#wb-preview-root` is copied from the editor verbatim: the same classes,
  and therefore the same two facts that the drawer has to survive — it is
  `position: relative`, and it is the scroller. Measuring against a plain
  `overflow: auto` div would measure a different element.
*/
const scoped = document.getElementById("scoped")!
createRoot(scoped).render(
  createElement(SiteCartProvider, { shopId: undefined }, createElement(HeaderSection, {
    section: section("scoped"),
    theme,
    deviceMode: "mobile",
    insideEditor: true,
    /*
      A SPY, NOT A NO-OP.

      The canvas intercept the probe installs runs in the CAPTURE phase, so it
      records a link's href before React's own handler has run — which means it
      reports "the nav went somewhere" whatever the editor handler does, or
      whether it is called at all. The whole editor path was invisible to it.

      This records what the drawer actually asks for: the address, the second
      argument (`true` means "this link is the site's navigation", which is
      what makes the editor follow it while the inspector is on), and the
      moment, because the drawer closes before it says anything and the order
      of those two is the thing being measured.
    */
    onEditorNavigate: (href: string, fromNav?: boolean) => {
      const w = window as unknown as { __nav?: { href: string; fromNav: boolean; at: number }[] }
      ;(w.__nav ??= []).push({ href, fromNav: !!fromNav, at: Math.round(performance.now()) })
    },
  })),
)

const live = document.getElementById("live")!
/*
  The published mount is told which site it is, because the header's field
  will not ask anything without that: no creator and no install means no
  address to ask, so no suggestions, so nothing to measure. The probe answers
  the request itself.
*/
createRoot(live).render(
  createElement(StorefrontProvider, {
    value: { installId: "00000000-0000-4000-8000-000000000000" },
  }, createElement(SiteCartProvider, { shopId: "probe-shop" }, createElement(HeaderSection, {
    section: section("live"),
    theme,
    deviceMode: "mobile",
  }))),
)
