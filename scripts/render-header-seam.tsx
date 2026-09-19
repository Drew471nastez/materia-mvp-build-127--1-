/**
 * Mounts the real website builder header over the section that follows it,
 * once per colour scheme, so a browser can photograph the join and read the
 * pixels across it. Bundled and driven by scripts/check-header-seam.mjs.
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

const section = (id: string, colorScheme: string): SectionInstance =>
  ({
    id,
    type: "header",
    settings: {
      color_scheme: colorScheme,
      menu_items: [
        { label: "Shop", url: "/shop", open_in_new: false },
        { label: "About", url: "/about", open_in_new: false },
      ],
      /* Not sticky: a sticky header is taken out of flow and the block below
         slides under it, which is a different join from the one on the page
         when nobody has scrolled. This measures the join itself. */
      header_sticky: false,
    },
  }) as unknown as SectionInstance

for (const host of Array.from(document.querySelectorAll<HTMLElement>("[data-mount]"))) {
  const key = host.dataset.scheme!
  createRoot(host).render(
    createElement(SiteCartProvider, { shopId: undefined }, createElement(HeaderSection, {
      section: section(host.id, key),
      theme,
      deviceMode: host.dataset.device === "mobile" ? "mobile" : "desktop",
    })),
  )
}
