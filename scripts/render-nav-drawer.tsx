/**
 * Mounts the real website builder header twice, once the way the editor
 * mounts it and once the way a published site does, so a browser can open
 * the mobile menu and measure where it lands and what moves underneath.
 * Bundled and driven by scripts/check-nav-drawer.mjs.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { HeaderSection } from "@/components/website-builder/sections/renderers/HeaderSection"
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
  createElement(HeaderSection, {
    section: section("scoped"),
    theme,
    deviceMode: "mobile",
    insideEditor: true,
    onEditorNavigate: () => {},
  }),
)

const live = document.getElementById("live")!
createRoot(live).render(
  createElement(HeaderSection, {
    section: section("live"),
    theme,
    deviceMode: "mobile",
  }),
)
