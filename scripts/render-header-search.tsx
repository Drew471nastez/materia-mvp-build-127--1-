/**
 * The real site header, with the search open, at three header heights.
 * Bundled and driven by scripts/check-header-search.mjs.
 *
 * Three heights because the bug only shows on one of them: the field, the
 * magnifier and the close button all agree in a short header and drift apart
 * as the header grows, which is why it reached a published site.
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

const section = (id: string, pad: number): SectionInstance =>
  ({
    id,
    type: "header",
    settings: {
      color_scheme: "dark",
      vertical_padding: pad,
      show_search: true,
      show_search_icon: true,
      search_behaviour: "header",
      header_sticky: false,
      menu_items: [
        { label: "Shop", url: "/shop", open_in_new: false },
        { label: "About", url: "/about", open_in_new: false },
      ],
    },
  }) as unknown as SectionInstance

for (const host of Array.from(document.querySelectorAll<HTMLElement>("[data-mount]"))) {
  createRoot(host).render(
    /*
      NO `deviceMode`, which is the whole point.

      With one, the header takes the editor's path: it is drawn for a single
      device and its padding goes on the row — including the SEARCH PANEL's
      row, which then has that padding and lays the field out inside it, so
      everything agrees. Published, there is no device mode: both shells are
      rendered with the padding on each, the panel's row gets none, and the
      field is laid out against the header's whole height instead.

      That is the case that broke, it is the only case a visitor ever sees,
      and it is why this was reported from a published site rather than from
      the editor it was built in.
    */
    createElement(SiteCartProvider, { shopId: undefined }, createElement(HeaderSection, {
      section: section(host.id, Number(host.dataset.pad)),
      theme,
    })),
  )
}
