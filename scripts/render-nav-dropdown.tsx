/**
 * Mounts the website builder header once per built-in colour scheme, each
 * with a nav item that has children, so a browser can hover the item, open
 * the desktop dropdown and read the colours the panel actually paints.
 *
 * The panel used to be `bg-white` with `text-gray-800` children whatever the
 * scheme was, which is a white card with dark text hanging off a black bar
 * on `dark` and `black`. Rendering every scheme is the point: the bug only
 * shows on some of them, and a probe that renders one scheme is a probe that
 * picks in advance whether it can see the defect.
 *
 * Bundled and driven by scripts/check-nav-dropdown.mjs.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { HeaderSection } from "@/components/website-builder/sections/renderers/HeaderSection"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { BUILT_IN_SCHEME_KEYS } from "@/lib/storelib-theme/color-schemes"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const base = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) =>
    (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues

/*
  A SCHEME LIKE THE ONE THE DEFECT WAS REPORTED ON.

  The five built-ins are all tuned sets: their `border` reads as a hairline
  against their own background, so the old dropdown — which took its edge
  from that slot — passed on every one of them. It was reported on a CORAL
  header, where the scheme's border had been left near-black, and there the
  same code drew a hard outline round the menu.

  A probe that only renders tidy schemes cannot see that, and said so: the
  break-test that put the old border back came up green across all five.
  So the fixture carries a sixth scheme, saturated, with a dark border and
  light text, which is the shape a creator actually builds.
*/
const theme = {
  ...base,
  color_schemes: {
    ...(base as unknown as { color_schemes?: Record<string, unknown> }).color_schemes,
    coral: {
      name: "Coral",
      background: "#E8736B",
      text: "#FFFFFF",
      heading: "#FFFFFF",
      /* Left at a page-background value, which is the whole point. */
      border: "#1A1A2E",
      link: "#FFFFFF",
      accent: "#FFFFFF",
    },
  },
} as unknown as ThemeSettingsValues

/*
  A PARENT AND TWO CHILDREN, VIA BLOCKS.

  The dropdown is built from `section.blocks` grouped by `parent_id`, not
  from `menu_items`. A section whose blocks are all roots renders no
  dropdown at all and the probe would measure an empty page.
*/
const section = (scheme: string): SectionInstance =>
  ({
    id: `hdr-${scheme}`,
    type: "header",
    settings: { color_scheme: scheme, header_sticky: false },
    blocks: [
      { id: `shop-${scheme}`, type: "nav_item", settings: { label: "Shop", url: "/shop" } },
      { id: `t-${scheme}`, type: "nav_item", settings: { label: "T-shirts", url: "/shop/tees", parent_id: `shop-${scheme}` } },
      { id: `h-${scheme}`, type: "nav_item", settings: { label: "Hoodies", url: "/shop/hoodies", parent_id: `shop-${scheme}` } },
      { id: `about-${scheme}`, type: "nav_item", settings: { label: "About", url: "/about" } },
    ],
  }) as unknown as SectionInstance

for (const key of [...BUILT_IN_SCHEME_KEYS, "coral"]) {
  const host = document.getElementById(`scheme-${key}`)
  if (!host) continue
  createRoot(host).render(
    createElement(SiteCartProvider, { shopId: undefined }, createElement(HeaderSection, {
      section: section(key),
      theme,
      deviceMode: "desktop",
    })),
  )
}
