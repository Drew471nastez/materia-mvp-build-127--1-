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

      This records what the drawer actually asks for, including the second
      argument: `true` means "this link is the site's navigation", which is
      what makes the editor follow it while the inspector is on. Without it
      the editor refuses, and every link in the menu does nothing.
    */
    onEditorNavigate: (href: string, fromNav?: boolean) => {
      ;(window as unknown as { __editorNav: Array<[string, boolean]> }).__editorNav ??= []
      ;(window as unknown as { __editorNav: Array<[string, boolean]> }).__editorNav.push([href, fromNav === true])
    },
  })),
)

const live = document.getElementById("live")!
createRoot(live).render(
  createElement(SiteCartProvider, { shopId: "probe-shop" }, createElement(HeaderSection, {
    section: section("live"),
    theme,
    deviceMode: "mobile",
  })),
)
