/**
 * The page the cover's browser photographs, as app/(site)/cover-render
 * draws it: ThemePage, the .storelib sections, and the `data-snapshot-stage`
 * wrapper that turns the theme's entrance animation off. The photograph in
 * the hero is fetched over HTTP, as a creator's own would be, so the probe
 * tests the waiting and not only the drawing.
 *
 * Served by scripts/check-cover-shot.mjs, which points the real
 * takeCoverShots (lib/website-builder/cover-shot.ts) at it.
 */
import { createRoot } from "react-dom/client"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const base = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((grp) =>
    (grp.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues

const theme = {
  ...base,
  /* On, as it is by default: the probe has to show that the stage wrapper
     stops it, not that a theme happened to have it off. */
  animations_enabled: true,
  color_schemes: {
    ...(base as unknown as { color_schemes?: Record<string, unknown> }).color_schemes,
    coral: { name: "Coral", background: "#FF6B6B", text: "#FFFFFF", heading: "#FFFFFF", border: "#1A1A2E", link: "#FFFFFF", accent: "#FFFFFF" },
  },
} as unknown as ThemeSettingsValues

const sections = [
  {
    id: "hdr",
    type: "header",
    settings: { color_scheme: "coral", header_sticky: false },
    blocks: [
      { id: "n1", type: "nav_item", settings: { label: "Home", url: "/" } },
      { id: "n2", type: "nav_item", settings: { label: "Services", url: "/services" } },
      { id: "n4", type: "nav_item", settings: { label: "Our shop", url: "/shop" } },
    ],
  },
  {
    id: "hero",
    type: "hero_split",
    blocks: STORELIB_SCHEMAS.hero_split?.presets?.[0]?.blocks ?? [],
    settings: {
      ...(STORELIB_SCHEMAS.hero_split?.presets?.[0]?.settings ?? {}),
      heading: "Made by hand, sent the same week",
      subheading: "Small batches, honest materials and a note in every parcel.",
      image: "/photo.webp",
    },
  },
] as unknown as SectionInstance[]

createRoot(document.getElementById("app")!).render(
  <div data-snapshot-stage="">
    <StorelibLiveProvider sources={{}} inEditor={false}>
      <SiteCartProvider shopId={undefined}>
        <ThemePage theme={theme} sections={sections} storefront={{}} />
      </SiteCartProvider>
    </StorelibLiveProvider>
  </div>,
)
