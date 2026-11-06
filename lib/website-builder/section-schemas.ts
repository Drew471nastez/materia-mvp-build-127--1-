import native_form from "../../themes/default/sections/native_form.json"
// ============================================================
// Website Builder: Section schemas — drives the visual editor
// ============================================================
//
// Stage 1 of the Shopify-style theme refactor: the actual schema
// *data* for every section now lives as one JSON file per section
// under `themes/default/sections/<type>.json`, and the manifest
// (ordering + categories) lives at `themes/default/manifest.json`.
//
// This file is a thin assembler:
//   • imports each JSON file statically (so Next.js/Webpack bundles
//     them at build time — no runtime filesystem access needed)
//   • reassembles the `SECTION_SCHEMAS` record that the editor +
//     the live renderer already consume, unchanged
//   • re-exports `ADDABLE_SECTIONS`, `STRUCTURE_SECTIONS` and
//     `SECTION_CATEGORIES` from the manifest so consumers see the
//     exact same API surface they saw before.
//
// Adding a new section is now a 2-file change:
//   1. Create `themes/default/sections/<new_type>.json`
//   2. Import + register it below
//
// ============================================================

import type { SectionSchema } from "./types"

// ── Manifest (ordering, categories, addable list) ───────────
import manifest from "../../themes/default/manifest.json"

// ── Section schema JSON files (one per section type) ────────
// Order here is irrelevant — `section_order` in the manifest is
// what the editor respects. The imports are just so every JSON
// gets bundled and type-checked.
import announcement_banner from "../../themes/default/sections/announcement_banner.json"
import author_bio from "../../themes/default/sections/author_bio.json"
import banner_packery from "../../themes/default/sections/banner_packery.json"
import brand_logo from "../../themes/default/sections/brand_logo.json"
import chapter_preview from "../../themes/default/sections/chapter_preview.json"
import collection_banner from "../../themes/default/sections/collection_banner.json"
import collection_list from "../../themes/default/sections/collection_list.json"
import comparison_table from "../../themes/default/sections/comparison_table.json"
import contact_form from "../../themes/default/sections/contact_form.json"
import countdown_timer from "../../themes/default/sections/countdown_timer.json"
import counter from "../../themes/default/sections/counter.json"
import cta from "../../themes/default/sections/cta.json"
import custom_html from "../../themes/default/sections/custom_html.json"
import ebook_showcase from "../../themes/default/sections/ebook_showcase.json"
import faq from "../../themes/default/sections/faq.json"
import feature_grid from "../../themes/default/sections/feature_grid.json"
import footer from "../../themes/default/sections/footer.json"
import gallery from "../../themes/default/sections/gallery.json"
import header from "../../themes/default/sections/header.json"
import icon_box from "../../themes/default/sections/icon_box.json"
import image_banner from "../../themes/default/sections/image_banner.json"
import image_comparison from "../../themes/default/sections/image_comparison.json"
import image_section from "../../themes/default/sections/image_section.json"
import logo_bar from "../../themes/default/sections/logo_bar.json"
import lookbook from "../../themes/default/sections/lookbook.json"
import map_embed from "../../themes/default/sections/map_embed.json"
import newsletter from "../../themes/default/sections/newsletter.json"
import press_mentions from "../../themes/default/sections/press_mentions.json"
import pricing from "../../themes/default/sections/pricing.json"
import process_steps from "../../themes/default/sections/process_steps.json"
import product from "../../themes/default/sections/product.json"
import product_list from "../../themes/default/sections/product_list.json"
import products_carousel from "../../themes/default/sections/products_carousel.json"
import promotion_banner from "../../themes/default/sections/promotion_banner.json"
import rich_text from "../../themes/default/sections/rich_text.json"
import scrolling_text from "../../themes/default/sections/scrolling_text.json"
import size_guide from "../../themes/default/sections/size_guide.json"
import slideshow from "../../themes/default/sections/slideshow.json"
import social_proof_bar from "../../themes/default/sections/social_proof_bar.json"
import split_content from "../../themes/default/sections/split_content.json"
import stats from "../../themes/default/sections/stats.json"
import sticky_bar from "../../themes/default/sections/sticky_bar.json"
import tabs_content from "../../themes/default/sections/tabs_content.json"
import team_members from "../../themes/default/sections/team_members.json"
import timeline from "../../themes/default/sections/timeline.json"
import trust_badges from "../../themes/default/sections/trust_badges.json"
import video_embed from "../../themes/default/sections/video_embed.json"
import video_hero from "../../themes/default/sections/video_hero.json"
import { STORELIB_SCHEMAS, addableSections, lazyList } from "./storelib-schemas"

// JSON imports are inferred with very narrow literal types (e.g. every
// `type: "toggle"` is inferred as the string literal `"toggle"`). That's
// actually stronger than `SectionSchema`, but TS still refuses the
// assignment because union arrays are invariant in the literal.
// `as unknown as SectionSchema` is the standard escape hatch and it's
// only evaluated at this single boundary — every consumer downstream
// gets the precise SectionSchema type back.
const asSchema = (s: unknown): SectionSchema => s as SectionSchema

// ============================================================
// Public API — matches what section-schemas.ts used to export.
// Order of keys matches the original file's order so any consumer
// that iterates `Object.keys(SECTION_SCHEMAS)` observes no change.
// ============================================================

const JSON_SCHEMAS: Record<string, SectionSchema> = {
  header: asSchema(header),
  video_hero: asSchema(video_hero),
  rich_text: asSchema(rich_text),
  split_content: asSchema(split_content),
  image_banner: asSchema(image_banner),
  slideshow: asSchema(slideshow),
  product_list: asSchema(product_list),
  feature_grid: asSchema(feature_grid),
  footer: asSchema(footer),
  faq: asSchema(faq),
  cta: asSchema(cta),
  stats: asSchema(stats),
  logo_bar: asSchema(logo_bar),
  gallery: asSchema(gallery),
  pricing: asSchema(pricing),
  team_members: asSchema(team_members),
  countdown_timer: asSchema(countdown_timer),
  trust_badges: asSchema(trust_badges),
  newsletter: asSchema(newsletter),
  process_steps: asSchema(process_steps),
  ebook_showcase: asSchema(ebook_showcase),
  author_bio: asSchema(author_bio),
  chapter_preview: asSchema(chapter_preview),
  lookbook: asSchema(lookbook),
  size_guide: asSchema(size_guide),
  collection_banner: asSchema(collection_banner),
  video_embed: asSchema(video_embed),
  native_form: asSchema(native_form),
  contact_form: asSchema(contact_form),
  timeline: asSchema(timeline),
  custom_html: asSchema(custom_html),
  announcement_banner: asSchema(announcement_banner),
  sticky_bar: asSchema(sticky_bar),
  press_mentions: asSchema(press_mentions),
  tabs_content: asSchema(tabs_content),
  comparison_table: asSchema(comparison_table),
  map_embed: asSchema(map_embed),
  social_proof_bar: asSchema(social_proof_bar),
  product: asSchema(product),
  image_section: asSchema(image_section),
  scrolling_text: asSchema(scrolling_text),
  counter: asSchema(counter),
  image_comparison: asSchema(image_comparison),
  collection_list: asSchema(collection_list),
  icon_box: asSchema(icon_box),
  promotion_banner: asSchema(promotion_banner),
  banner_packery: asSchema(banner_packery),
  products_carousel: asSchema(products_carousel),
  brand_logo: asSchema(brand_logo),
}

/**
 * EVERY SECTION THIS THEME HAS. The ones still described by a JSON schema,
 * and the ones that live in a `.storelib` file — which is where all thirty
 * the library offers now are. A `.storelib` wins where both exist, because
 * the file is the section.
 */
/* The `.storelib` ones as they are in STORELIB_SCHEMAS: read when first asked for (storelib-schemas.ts, READ WHEN ASKED FOR). Same keys, same order as `{ ...JSON_SCHEMAS, ...STORELIB_SCHEMAS }`. */
export const SECTION_SCHEMAS: Record<string, SectionSchema> = Object.defineProperties({ ...JSON_SCHEMAS }, Object.getOwnPropertyDescriptors(STORELIB_SCHEMAS))

// ── Ordered list of sections available in the "Add section" panel ──
// Sourced from the theme manifest so packaged themes can customise order.
/**
 * WHAT ADD SECTION OFFERS. The manifest's list is the library: ten
 * categories of three, all of them `.storelib` files. `addableSections`
 * then drops anything whose file has no preset, so the files stay the
 * authority over the list rather than the other way round.
 *
 * The types the library no longer offers are in `manifest.retired_sections`.
 * They are still in SECTION_SCHEMAS and still render: a page built with one
 * keeps working, it just cannot be added again. Nothing is deleted, because
 * deleting a section type empties every page that used it.
 */
export const ADDABLE_SECTIONS: string[] = lazyList(() => addableSections(manifest.addable_sections, STORELIB_SCHEMAS))

export const RETIRED_SECTIONS: string[] = (manifest as { retired_sections?: string[] }).retired_sections ?? []

/** The order the Add Section categories appear in, from the theme. */
export const SECTION_CATEGORY_ORDER: { id: string; label: string }[] =
  (manifest as { categories?: { id: string; label: string }[] }).categories ?? []

// ── Structure sections (header/footer) — shown separately at top/bottom of sidebar ──
export const STRUCTURE_SECTIONS: string[] = manifest.structure_sections

// ── Category labels for the add-section panel ──
export const SECTION_CATEGORIES: Record<string, string> = manifest.section_categories

// ============================================================
// Stage 3a: theme_pack overlay (runtime)
// ------------------------------------------------------------
// Imported themes may ship a `theme_pack` block in their
// manifest.json (see lib/website-builder/theme-package-schema.ts).
// When the import route saves that block, it stashes it under
// `settings._theme_pack` on the new install. At render/editor
// time we fetch the effective schemas by starting from the
// built-in `SECTION_SCHEMAS` and layering any pack overrides on
// top.
//
// Pack shape:
//   {
//     manifest?: { section_order?, addable_sections?, structure_sections?, section_categories? },
//     sections?: { [type]: SectionSchemaJSON }   // full section schema objects
//   }
//
// Rules:
//   • If a pack defines a section `type`, its schema REPLACES the
//     built-in one (creators can fork a section to tweak fields).
//   • Missing sections fall through to the built-in default —
//     creators don't have to ship every section in a pack.
//   • If a pack ships a manifest override (e.g. a different
//     addable_sections ordering) it REPLACES the matching list;
//     it does not merge. This matches creator expectations that
//     "this is my theme's list" and keeps behaviour predictable.
// ============================================================

export interface ThemePack {
  manifest?: {
    section_order?: string[]
    addable_sections?: string[]
    structure_sections?: string[]
    section_categories?: Record<string, string>
  }
  sections?: Record<string, unknown>
}

export interface ResolvedThemeSchemas {
  SECTION_SCHEMAS: Record<string, SectionSchema>
  ADDABLE_SECTIONS: string[]
  STRUCTURE_SECTIONS: string[]
  SECTION_CATEGORIES: Record<string, string>
}

/** Layer a `theme_pack` on top of the built-in defaults. Pass `null`
 *  or `undefined` to get the built-ins unchanged — callers can treat
 *  the returned value as the single source of truth. */
export function applyThemePack(pack: ThemePack | null | undefined): ResolvedThemeSchemas {
  if (!pack) {
    return {
      SECTION_SCHEMAS,
      ADDABLE_SECTIONS,
      STRUCTURE_SECTIONS,
      SECTION_CATEGORIES,
    }
  }
  const mergedSchemas: Record<string, SectionSchema> = { ...SECTION_SCHEMAS }
  if (pack.sections) {
    for (const [type, raw] of Object.entries(pack.sections)) {
      // Replace (not merge) — packs ship the full schema for a type.
      mergedSchemas[type] = asSchema(raw)
    }
  }
  const pm = pack.manifest ?? {}
  return {
    SECTION_SCHEMAS: mergedSchemas,
    ADDABLE_SECTIONS: pm.addable_sections ?? ADDABLE_SECTIONS,
    STRUCTURE_SECTIONS: pm.structure_sections ?? STRUCTURE_SECTIONS,
    SECTION_CATEGORIES: pm.section_categories ?? SECTION_CATEGORIES,
  }
}

/** Pull the `_theme_pack` from an install's settings blob without
 *  forcing callers to know the reserved key. Returns `null` if the
 *  install has no pack (the common case — creators using the
 *  built-in default theme never have one). */
export function getInstalledThemePack(settings: Record<string, unknown> | null | undefined): ThemePack | null {
  if (!settings) return null
  const pack = (settings as { _theme_pack?: unknown })._theme_pack
  if (!pack || typeof pack !== "object") return null
  return pack as ThemePack
}
