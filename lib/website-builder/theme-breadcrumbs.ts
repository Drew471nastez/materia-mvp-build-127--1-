/**
 * ===========================================================================
 *  BREADCRUMBS ON EVERY PAGE BUT THE HOME PAGE
 * ===========================================================================
 * Home > Shop > the product, Home > Search, Home > About: where a visitor is,
 * under the header, on every page of the website except the first one.
 * Asked for directly, and the way most Shopify themes do it: one switch in
 * Theme settings › Breadcrumbs, not a section somebody has to remember to
 * add to every page.
 *
 * The bar is the Breadcrumbs section (themes/default/sections/
 * breadcrumbs.storelib), placed here just below the Header group when a page
 * is drawn, and never saved into the page. Its trail is the page's own
 * (lib/products/breadcrumbs.ts), so the product page says the product's
 * name and a page of the creator's own says its title.
 *
 * NEVER TWICE. A page that already shows breadcrumbs, as a Breadcrumbs
 * section or as the product section's Breadcrumbs block, keeps its own and
 * gets no second bar.
 *
 * PURE. The live site (through dressPage), the previews and the editor's
 * canvas all call this.
 */
import { groupOf } from "@/lib/storelib-theme/section-groups"
import type { SectionInstance } from "./types"

/** The id of the bar this places. Never saved: a page that has it was drawn, not stored. */
export const THEME_BREADCRUMBS_ID = "theme-breadcrumbs"

const HOME_TEMPLATES = new Set(["index", "home", ""])

/** Theme settings › Breadcrumbs › Show. On unless it was turned off. */
export function breadcrumbsOn(theme: Record<string, unknown> | null | undefined): boolean {
  return theme?.breadcrumbs_enabled !== false
}

type BlockLike = { type?: unknown; hidden?: unknown; blocks?: unknown }

function hasTrailBlock(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return (blocks as BlockLike[]).some((b) => !!b && !b.hidden && (b.type === "breadcrumbs" || hasTrailBlock(b.blocks)))
}

/** The page shows breadcrumbs of its own: a Breadcrumbs section, or a Breadcrumbs block in a section. */
export function pageHasBreadcrumbs(sections: readonly SectionInstance[]): boolean {
  return sections.some((s) => !s.hidden && s.id !== THEME_BREADCRUMBS_ID && (s.type === "breadcrumbs" || hasTrailBlock(s.blocks)))
}

const pick = (v: unknown, allowed: readonly string[], fallback: string) => (typeof v === "string" && allowed.includes(v) ? v : fallback)

/**
 * The page's sections with the bar placed under the Header group, or the
 * same list when the bar does not belong: switched off, the home page, or a
 * page with breadcrumbs of its own.
 */
export function withThemeBreadcrumbs(
  sections: SectionInstance[],
  theme: Record<string, unknown> | null | undefined,
  template: string,
): SectionInstance[] {
  if (!breadcrumbsOn(theme) || HOME_TEMPLATES.has(template || "")) return sections
  if (sections.some((s) => s.id === THEME_BREADCRUMBS_ID) || pageHasBreadcrumbs(sections)) return sections

  let at = 0
  sections.forEach((s, i) => {
    if (groupOf(s) === "header") at = i + 1
  })
  /* Drawn on the colours of what it sits on, so it reads as the top of the page, not a strip of its own. */
  const below = sections.slice(at).find((s) => !s.hidden && groupOf(s) === "template")
  const scheme = typeof below?.settings?.color_scheme === "string" && below.settings.color_scheme ? below.settings.color_scheme : "white"
  const bar: SectionInstance = {
    id: THEME_BREADCRUMBS_ID,
    type: "breadcrumbs",
    name: "Breadcrumbs",
    settings: {
      separator: pick(theme?.breadcrumbs_separator, ["slash", "chevron", "line", "arrow", "dot", "pipe"], "slash"),
      style: pick(theme?.breadcrumbs_style, ["plain", "pill"], "plain"),
      home_icon: theme?.breadcrumbs_home_icon === true,
      align: pick(theme?.breadcrumbs_align, ["left", "center", "right"], "left"),
      home_label: "Home",
      shop_label: "Shop",
      size: 13,
      max_width: "wide",
      color_scheme: scheme,
      padding_top: 16,
      padding_bottom: 0,
    },
    blocks: [],
    hidden: false,
  } as SectionInstance
  return [...sections.slice(0, at), bar, ...sections.slice(at)]
}
