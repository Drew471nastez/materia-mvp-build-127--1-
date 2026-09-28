/**
 * Mounts the built site's header the three ways it is ever drawn — a
 * published page, the editor canvas at desktop width, and the editor's phone
 * preview — so a browser can film the menu opening and the sticky reveal in
 * each of them. `window.__MODE` picks which; the page around it is built by
 * scripts/check-header-motion.mjs, which is the only thing that runs this.
 */
import { createRoot } from "react-dom/client"

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

/* Show on scroll up is ON: it is half of what is being filmed. */
const section: SectionInstance = {
  id: "film",
  type: "header",
  settings: {
    menu_items: [
      { label: "Shop", url: "/shop", open_in_new: false },
      { label: "About", url: "/about", open_in_new: false },
      { label: "Contact", url: "/contact", open_in_new: false },
    ],
    header_sticky_enabled: true,
    header_sticky_on_scroll_up: true,
  },
} as unknown as SectionInstance

const mode = (window as unknown as { __MODE?: string }).__MODE ?? "live"
const host = document.getElementById("mount")!

/*
  JSX rather than createElement calls: React's own types require `children`
  inside the props object, so a provider written as `createElement(P, {…},
  child)` does not typecheck even though it runs. JSX puts it there for us.
*/
createRoot(host).render(
  mode === "live" ? (
    <StorefrontProvider value={{ installId: "00000000-0000-4000-8000-000000000000" }}>
      <SiteCartProvider shopId="film-shop">
        <HeaderSection section={section} theme={theme} deviceMode="mobile" />
      </SiteCartProvider>
    </StorefrontProvider>
  ) : (
    <SiteCartProvider>
      <HeaderSection
        section={section}
        theme={theme}
        deviceMode={mode === "canvas-mobile" ? "mobile" : "desktop"}
        insideEditor
        onEditorNavigate={() => {}}
      />
    </SiteCartProvider>
  ),
)
