/**
 * ===========================================================================
 *  THE THEME REGISTRY
 * ===========================================================================
 * Every theme Storelib ships, in one place, importable from both the server
 * and the browser (no Supabase, no `server-only`).
 *
 * The catalogue used to live in two places that disagreed: the `themes` table
 * had three rows, the website-builder page had six cards, and three of those
 * cards carried ids like `ebook-author-theme-001` that are not UUIDs — so
 * "Add" on half the library was a guaranteed 404 from the day it shipped. The
 * add route, meanwhile, kept its own copy of each theme's colours.
 *
 * Now a theme is ONE definition: its identity (a real UUID, matching the
 * database row), what it looks like (palette, fonts, button shape), who it is
 * for (industry), and how a fresh install of it is built (`buildThemePreset`).
 * The add route installs from this file and inserts the catalogue row itself
 * if the database has not heard of the theme yet, so shipping a new theme is
 * one entry below, not a migration and a deploy in lockstep.
 *
 * The presets are written against the section schemas in
 * `themes/default/sections/*.json` — the same field ids the editor's
 * inspector and the renderers read — and a test (`tests/website-builder.test.ts`)
 * checks every field id here exists in its schema, so a preset cannot drift
 * into settings the renderer silently ignores.
 */

import type { SectionInstance, ThemeSettingsValues } from "./types"
import { mainProductSection } from "./product-page"

export type ThemeIndustryKey =
  | "general"
  | "creators"
  | "digital"
  | "ebooks"
  | "courses"
  | "design"
  | "photography"
  | "coaching"
  | "music"
  | "software"

export interface ThemeIndustry {
  key: ThemeIndustryKey
  label: string
  /** One line under the label on the marketplace filter. */
  blurb: string
}

export const THEME_INDUSTRIES: ThemeIndustry[] = [
  { key: "general", label: "General", blurb: "Any kind of digital store" },
  { key: "creators", label: "Creators", blurb: "Personal brands and influencers" },
  { key: "digital", label: "Digital products", blurb: "Downloads, presets, assets" },
  { key: "ebooks", label: "Books & ebooks", blurb: "Authors and publishers" },
  { key: "courses", label: "Courses", blurb: "Educators and cohorts" },
  { key: "design", label: "Design & templates", blurb: "Designers and template shops" },
  { key: "photography", label: "Photography", blurb: "Photographers and presets" },
  { key: "coaching", label: "Coaching", blurb: "Coaches and consultants" },
  { key: "music", label: "Music & audio", blurb: "Producers, sample packs, beats" },
  { key: "software", label: "Software & tools", blurb: "Indie apps, plugins, scripts" },
]

export interface ThemePalette {
  primary: string
  secondary: string
  accent: string
  bg: string
  surface: string
  text: string
  textSecondary: string
  border: string
  /** The hero's own background and text — the cover is drawn from these. */
  heroBg: string
  heroText: string
}

export type ThemeCoverLayout = "center" | "split" | "left"

export interface ThemeDefinition {
  /** The `themes.id` row. A real UUID — the add route validates it. */
  id: string
  slug: string
  name: string
  /** One short line for a card. */
  tagline: string
  /** A paragraph for the marketplace detail view. */
  description: string
  industry: ThemeIndustryKey
  tags: string[]
  palette: ThemePalette
  fonts: { heading: string; body: string }
  buttonStyle: NonNullable<ThemeSettingsValues["button_style"]>
  borderRadius: number
  /** Which hero the theme's cover art draws. */
  coverLayout: ThemeCoverLayout
  /** Sample copy that makes the cover look like the theme's own store. */
  sample: { brand: string; headline: string; sub: string; cta: string }
  /** The sections a fresh home page is built from, in order. Informational
   *  for the marketplace; `buildThemePreset` is the source of truth. */
  homeSections: string[]
  featured?: boolean
  version: string
}

/** How many websites a creator keeps: one live and the rest drafts. Every count, message and check reads this. */
export const THEME_INSTALL_LIMIT = 7

export const STORELIB_DEFAULT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
const CREATOR_MINIMAL_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901"
const DIGITAL_WAVE_ID = "c3d4e5f6-a7b8-9012-cdef-123456789012"

export const THEME_REGISTRY: ThemeDefinition[] = [
  {
    id: STORELIB_DEFAULT_ID,
    slug: "storelib-default",
    name: "Storelib Default",
    tagline: "A clean, modern storefront for any digital product",
    description:
      "The theme every Storelib store starts on. Balanced spacing, a confident hero, a product grid that stays readable at any count, and colours that get out of the way of your own brand.",
    industry: "general",
    tags: ["minimal", "clean", "modern", "versatile"],
    palette: {
      primary: "#6366f1", secondary: "#8b5cf6", accent: "#f59e0b",
      bg: "#ffffff", surface: "#f8fafc", text: "#0f172a", textSecondary: "#64748b", border: "#e2e8f0",
      heroBg: "#0f172a", heroText: "#ffffff",
    },
    fonts: { heading: "Inter", body: "Inter" },
    buttonStyle: "rounded",
    borderRadius: 8,
    coverLayout: "center",
    sample: { brand: "Northwind", headline: "Digital products, made simple", sub: "Templates, presets and guides from a studio that ships.", cta: "Shop now" },
    homeSections: ["header", "hero", "feature_grid", "product_list", "testimonials", "cta", "footer"],
    featured: true,
    version: "1.1.0",
  },
  {
    id: CREATOR_MINIMAL_ID,
    slug: "creator-minimal",
    name: "Creator Minimal",
    tagline: "Quiet, editorial, and all about the work",
    description:
      "Near-monochrome with sharp corners and generous whitespace. Built for creators whose products speak for themselves: a plain hero, an honest product grid, and nothing that competes with your covers.",
    industry: "creators",
    tags: ["minimal", "editorial", "monochrome"],
    palette: {
      primary: "#171717", secondary: "#525252", accent: "#a855f7",
      bg: "#ffffff", surface: "#f5f5f5", text: "#0a0a0a", textSecondary: "#737373", border: "#e5e5e5",
      heroBg: "#fafafa", heroText: "#0a0a0a",
    },
    fonts: { heading: "Plus Jakarta Sans", body: "Inter" },
    buttonStyle: "square",
    borderRadius: 4,
    coverLayout: "left",
    sample: { brand: "Mara Lin", headline: "Notes, kits and small tools", sub: "Everything I use, packaged so you can too.", cta: "Browse the shop" },
    homeSections: ["header", "hero", "product_list", "split_content", "newsletter", "footer"],
    featured: true,
    version: "1.1.0",
  },
  {
    id: DIGITAL_WAVE_ID,
    slug: "digital-wave",
    name: "Digital Wave",
    tagline: "Dark mode, bold gradients, pill buttons",
    description:
      "A dark storefront with saturated gradients and pill-shaped calls to action. For creators who want their store to feel like a launch, not a catalogue.",
    industry: "digital",
    tags: ["dark", "gradient", "bold", "launch"],
    palette: {
      primary: "#7c3aed", secondary: "#db2777", accent: "#f59e0b",
      bg: "#0a0a0f", surface: "#1a1a2e", text: "#e2e8f0", textSecondary: "#94a3b8", border: "#2a2a4a",
      heroBg: "#0a0a0f", heroText: "#ffffff",
    },
    fonts: { heading: "Space Grotesk", body: "Inter" },
    buttonStyle: "pill",
    borderRadius: 9999,
    coverLayout: "center",
    sample: { brand: "WAVEFORM", headline: "Presets that hit different", sub: "Lightroom, Premiere and Resolve packs by working colourists.", cta: "Get the packs" },
    homeSections: ["header", "hero", "stats", "product_list", "feature_grid", "cta", "footer"],
    featured: true,
    version: "1.1.0",
  },
  {
    id: "d8febbc1-fb76-422e-b56b-dd9152475dab",
    slug: "ebook-author",
    name: "Ebook Author",
    tagline: "Warm serif pages for authors and publishers",
    description:
      "A bookshop feel: warm paper tones, a serif headline, a book showcase with mockup and table of contents, an author bio, and reader reviews. Made for selling one book well — and a shelf of them just as well.",
    industry: "ebooks",
    tags: ["serif", "warm", "author", "books"],
    palette: {
      primary: "#b45309", secondary: "#92400e", accent: "#d97706",
      bg: "#fffbeb", surface: "#fef3c7", text: "#451a03", textSecondary: "#78350f", border: "#fde68a",
      heroBg: "#78350f", heroText: "#fef3c7",
    },
    fonts: { heading: "Playfair Display", body: "Inter" },
    buttonStyle: "rounded",
    borderRadius: 6,
    coverLayout: "split",
    sample: { brand: "Jane Harlow", headline: "The Complete Guide to Modern Business", sub: "Strategies, systems and secrets for the decade ahead.", cta: "Buy the book" },
    homeSections: ["header", "hero", "ebook_showcase", "author_bio", "testimonials", "faq", "footer"],
    version: "1.0.0",
  },
  {
    id: "7178fefc-9142-49a1-aa9f-b6002192461b",
    slug: "course-creator",
    name: "Course Creator",
    tagline: "Built for online courses and cohorts",
    description:
      "Teal and clear. A hero that states the outcome, a three-step 'how it works', numbers that build trust, the course catalogue, and student stories. Everything a course landing page needs, already in order.",
    industry: "courses",
    tags: ["education", "clean", "trust", "cohort"],
    palette: {
      primary: "#0891b2", secondary: "#0e7490", accent: "#f97316",
      bg: "#ffffff", surface: "#ecfeff", text: "#0f172a", textSecondary: "#475569", border: "#cffafe",
      heroBg: "#134e4a", heroText: "#ccfbf1",
    },
    fonts: { heading: "DM Sans", body: "DM Sans" },
    buttonStyle: "rounded",
    borderRadius: 10,
    coverLayout: "center",
    sample: { brand: "Learn Loop", headline: "Ship your first product in 30 days", sub: "A cohort course with live reviews and a community that lasts.", cta: "Enrol now" },
    homeSections: ["header", "hero", "process_steps", "stats", "product_list", "testimonials", "cta", "footer"],
    featured: true,
    version: "1.0.0",
  },
  {
    id: "dacc698c-228f-4225-821a-06c0c923fdef",
    slug: "designer-portfolio",
    name: "Designer Portfolio",
    tagline: "Show templates and assets the way designers do",
    description:
      "Charcoal and rose on a near-white page, with pill buttons and a wide product grid. A short manifesto, a features row, and a closing call to action. For UI kits, icon sets, fonts and Figma files.",
    industry: "design",
    tags: ["portfolio", "templates", "modern", "grid"],
    palette: {
      primary: "#e11d48", secondary: "#18181b", accent: "#f43f5e",
      bg: "#fafafa", surface: "#f4f4f5", text: "#18181b", textSecondary: "#52525b", border: "#e4e4e7",
      heroBg: "#18181b", heroText: "#fafafa",
    },
    fonts: { heading: "Sora", body: "Inter" },
    buttonStyle: "pill",
    borderRadius: 9999,
    coverLayout: "left",
    sample: { brand: "Studio Ora", headline: "Design systems you can ship today", sub: "Figma kits, icon sets and templates built by a product team.", cta: "See the kits" },
    homeSections: ["header", "hero", "product_list", "rich_text", "feature_grid", "cta", "footer"],
    version: "1.0.0",
  },
  {
    id: "25d46628-1a94-4b07-843f-b5ebae16fe2a",
    slug: "studio-noir",
    name: "Studio Noir",
    tagline: "Black, white and your photographs",
    description:
      "A gallery-dark theme for photographers selling presets, prints and workshops. Full-bleed hero, a wide portrait-card product grid, a proof bar with your numbers, and a newsletter for the next drop.",
    industry: "photography",
    tags: ["dark", "gallery", "presets", "prints"],
    palette: {
      primary: "#f5f5f4", secondary: "#a8a29e", accent: "#eab308",
      bg: "#0c0a09", surface: "#1c1917", text: "#fafaf9", textSecondary: "#a8a29e", border: "#292524",
      heroBg: "#0c0a09", heroText: "#fafaf9",
    },
    fonts: { heading: "Cormorant Garamond", body: "Inter" },
    buttonStyle: "square",
    borderRadius: 0,
    coverLayout: "center",
    sample: { brand: "NOIR", headline: "Light, shaped", sub: "Film-inspired presets and limited prints from the studio.", cta: "Shop the collection" },
    homeSections: ["header", "hero", "social_proof_bar", "product_list", "split_content", "newsletter", "footer"],
    version: "1.0.0",
  },
  {
    id: "ae2bb49a-b6de-4847-b8f5-97b0a7e44f72",
    slug: "bright-coach",
    name: "Bright Coach",
    tagline: "Friendly, confident, and built to convert",
    description:
      "Soft green on cream with a split hero and rounded corners. Programs as products, a how-it-works, client results, and an FAQ that answers the objections before the call. For coaches, consultants and communities.",
    industry: "coaching",
    tags: ["friendly", "conversion", "programs", "community"],
    palette: {
      primary: "#16a34a", secondary: "#166534", accent: "#f59e0b",
      bg: "#fefdf8", surface: "#f0fdf4", text: "#14532d", textSecondary: "#4d7c5a", border: "#dcfce7",
      heroBg: "#f0fdf4", heroText: "#14532d",
    },
    fonts: { heading: "Plus Jakarta Sans", body: "Inter" },
    buttonStyle: "rounded",
    borderRadius: 14,
    coverLayout: "split",
    sample: { brand: "Clear Path", headline: "Get unstuck in 90 days", sub: "One-to-one coaching and a self-paced program with weekly check-ins.", cta: "Book a call" },
    homeSections: ["header", "hero", "product_list", "process_steps", "testimonials", "faq", "cta", "footer"],
    version: "1.0.0",
  },
  {
    id: "b615c493-5e0f-4898-a928-649f1692c0ff",
    slug: "beat-drop",
    name: "Beat Drop",
    tagline: "Loud colours for beats, kits and sample packs",
    description:
      "Electric violet on deep navy with a bold display font. A hero built for a release, a product grid for packs and beats, a numbers row, and a newsletter so nobody misses the next drop.",
    industry: "music",
    tags: ["dark", "bold", "music", "release"],
    palette: {
      primary: "#a78bfa", secondary: "#22d3ee", accent: "#fb7185",
      bg: "#0b1020", surface: "#141a33", text: "#eef2ff", textSecondary: "#a5b4fc", border: "#27305a",
      heroBg: "#0b1020", heroText: "#eef2ff",
    },
    fonts: { heading: "Space Grotesk", body: "Inter" },
    buttonStyle: "pill",
    borderRadius: 9999,
    coverLayout: "left",
    sample: { brand: "LOWKEY", headline: "Drum kits for the late shift", sub: "Sample packs, one-shots and loops, produced and mixed in house.", cta: "Get the kit" },
    homeSections: ["header", "hero", "product_list", "stats", "feature_grid", "newsletter", "footer"],
    version: "1.0.0",
  },
  {
    id: "8af18c61-122c-433f-ab00-0fb97b8f3173",
    slug: "soft-launch",
    name: "Soft Launch",
    tagline: "A product page for indie apps, plugins and scripts",
    description:
      "Blue on white with a clear split hero: what it does, one button. Features as a grid, a pricing-ready product list, trust badges, and an FAQ. Built for software people who would rather ship than design.",
    industry: "software",
    tags: ["saas", "clean", "blue", "product"],
    palette: {
      primary: "#2563eb", secondary: "#1d4ed8", accent: "#06b6d4",
      bg: "#ffffff", surface: "#f1f5f9", text: "#0f172a", textSecondary: "#475569", border: "#e2e8f0",
      heroBg: "#ffffff", heroText: "#0f172a",
    },
    fonts: { heading: "Inter", body: "Inter" },
    buttonStyle: "rounded",
    borderRadius: 8,
    coverLayout: "split",
    sample: { brand: "Pinpoint", headline: "The clipboard your team will actually use", sub: "A tiny Mac app for snippets, links and screenshots. One-time purchase.", cta: "Download for Mac" },
    homeSections: ["header", "hero", "feature_grid", "product_list", "trust_badges", "faq", "cta", "footer"],
    version: "1.0.0",
  },
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

/**
 * WHAT BROWSE THEMES OFFERS. The registry's other themes are the same
 * sections in other palettes; offering all of them was ten choices that did
 * not differ. They stay defined, because websites already made from them
 * read their definition for covers and names, but only these can be added.
 */
/*
  Changed on purpose (r63): none. The native Storelib Default was the last one Add took; the Storelib Default a
  creator is offered and starts on is the Materia template (lib/themes/marketplace-shared.ts DEFAULT_CODE_TEMPLATE).
  Websites already made from the native theme keep working: they read its definition, they are never changed.
*/
export const BROWSABLE_THEME_IDS: readonly string[] = []
export const BROWSABLE_THEMES: ThemeDefinition[] = THEME_REGISTRY.filter((t) => BROWSABLE_THEME_IDS.includes(t.id))

export function getThemeDefinition(themeId: string): ThemeDefinition | null {
  return THEME_REGISTRY.find((t) => t.id === themeId) ?? null
}

export function getThemeBySlug(slug: string): ThemeDefinition | null {
  return THEME_REGISTRY.find((t) => t.slug === slug) ?? null
}

export function getIndustry(key: ThemeIndustryKey): ThemeIndustry {
  return THEME_INDUSTRIES.find((i) => i.key === key) ?? THEME_INDUSTRIES[0]
}

/** The row the `themes` table should hold for a definition. */
export function themeCatalogRow(def: ThemeDefinition) {
  return {
    id: def.id,
    name: def.name,
    slug: def.slug,
    description: def.description,
    author: "Storelib",
    version: def.version,
    is_built_in: true,
    is_free: true,
    price_cents: 0,
    tags: def.tags,
    category: def.industry,
    preview_image_url: null as string | null,
  }
}

// ── Presets ─────────────────────────────────────────────────────────────

export interface ThemePreset {
  settings: ThemeSettingsValues
  pages: { home: SectionInstance[]; product: SectionInstance[] }
}

function section(
  id: string,
  type: string,
  name: string,
  settings: Record<string, unknown>,
  blocks: SectionInstance["blocks"] = [],
): SectionInstance {
  return { id, type, name, hidden: false, settings, blocks }
}

function block(id: string, type: string, settings: Record<string, unknown>) {
  return { id, type, settings }
}

const PAD = { padding_top: 80, padding_bottom: 80 }

/**
 * A fresh install of a theme: its global settings and its home and product
 * pages. Deterministic — same theme, same preset — so a test can check every
 * field against the section schemas.
 */
export function buildThemePreset(def: ThemeDefinition): ThemePreset {
  const p = def.palette
  const brand = def.sample.brand

  const settings: ThemeSettingsValues = {
    brand_name: brand,
    primary_color: p.primary,
    secondary_color: p.secondary,
    accent_color: p.accent,
    background_color: p.bg,
    surface_color: p.surface,
    text_color: p.text,
    text_secondary_color: p.textSecondary,
    border_color: p.border,
    font_heading: def.fonts.heading,
    font_body: def.fonts.body,
    font_size_base: 16,
    button_style: def.buttonStyle,
    border_radius: def.borderRadius,
  }

  const dark = isDark(p.bg)

  const header = section("header", "header", "Header", {
    logo_text: brand,
    header_layout: "logo_left_nav_right",
    header_sticky_enabled: true,
    show_bottom_border: true,
    border_style: "subtle",
    color_scheme: dark ? "black" : "white",
    show_cta_button: true,
    cta_text: def.sample.cta,
    cta_url: "/products",
    cta_color: p.primary,
    cta_text_color: contrastText(p.primary),
  }, [
    block("nav-home", "nav_link", { label: "Home", url: "/", link_type: "custom" }),
    block("nav-shop", "nav_link", { label: "Shop", url: "/products", link_type: "custom" }),
    block("nav-about", "nav_link", { label: "About", url: "/about", link_type: "custom" }),
  ])

  const footer = section("footer", "footer", "Footer", {
    logo_text: brand,
    tagline: def.sample.sub,
    copyright: `© ${new Date().getFullYear()} ${brand}. All rights reserved.`,
    show_newsletter: false,
    show_social: true,
    color_scheme: "dark",
    bg_color: dark ? p.surface : p.heroBg,
    text_color: dark ? p.textSecondary : withAlpha(p.heroText, 0.72),
    heading_color: dark ? p.text : p.heroText,
    accent_color: p.primary,
    divider_color: dark ? p.border : withAlpha(p.heroText, 0.16),
    columns: "3",
    padding_top: 56,
    padding_bottom: 32,
  })

  const heroLayout = def.coverLayout === "split" ? "split" : def.coverLayout
  const hero = section("hero", "hero", "Hero", {
    eyebrow: getIndustry(def.industry).label,
    heading: def.sample.headline,
    subheading: def.sample.sub,
    animate_heading: false,
    button_text: def.sample.cta,
    button_url: "/products",
    button_style: "filled",
    button_color: p.primary,
    button_text_color: contrastText(p.primary),
    button_border_radius: Math.min(def.borderRadius, 999),
    button2_text: "Learn more",
    button2_url: "/about",
    button2_style: "outline",
    bg_type: "color",
    bg_color: p.heroBg,
    color_scheme: isDark(p.heroBg) ? "dark" : "white",
    text_color: p.heroText,
    layout: heroLayout,
    max_width: "wide",
    full_height: false,
    padding_top: 112,
    padding_bottom: 112,
  })

  const products = (id: string, heading: string, sub: string, surface = false) =>
    section(id, "product_list", heading, {
      heading,
      subheading: sub,
      columns: "3",
      products_count: 6,
      max_width: "wide",
      card_style: def.buttonStyle === "square" ? "minimal" : "bordered",
      card_aspect_ratio: def.industry === "photography" ? "portrait" : "square",
      show_price: true,
      show_quick_add: true,
      pagination_style: "none",
      color_scheme: dark ? "black" : "white",
      bg_color: surface ? p.surface : p.bg,
      text_color: p.text,
      ...PAD,
    })

  const features = (id: string, heading: string, sub: string, items: [string, string, string][]) =>
    section(id, "feature_grid", heading, {
      heading,
      subheading: sub,
      columns: "3",
      max_width: "wide",
      alignment: "left",
      color_scheme: dark ? "black" : "light",
      bg_color: p.surface,
      text_color: p.text,
      icon_color: p.primary,
      card_bg_color: p.bg,
      ...PAD,
    }, items.map(([icon, title, description], i) => block(`${id}-${i + 1}`, "feature", { icon, title, description })))

  const testimonials = (id: string, quotes: [string, string, string][]) =>
    section(id, "testimonials", "Testimonials", {
      heading: "What customers say",
      subheading: "Real words from real buyers.",
      layout: "card",
      show_rating: true,
      show_date: false,
      color_scheme: dark ? "black" : "white",
      accent_color: p.accent,
      card_bg_color: p.surface,
      bg_color: p.bg,
      text_color: p.text,
      ...PAD,
    }, quotes.map(([quote, author, role], i) => block(`${id}-${i + 1}`, "testimonial", { quote, author, role, rating: 5, verified: true })))

  const cta = (id: string, heading: string, sub: string) =>
    section(id, "cta", "Call to action", {
      heading,
      subheading: sub,
      btn_primary_text: def.sample.cta,
      btn_primary_url: "/products",
      layout: "centered",
      bg_type: "gradient",
      gradient_from: p.primary,
      gradient_to: p.secondary,
      bg_color: p.primary,
      color_scheme: "highlight",
      text_color: contrastText(p.primary),
      padding_top: 96,
      padding_bottom: 96,
    })

  const faq = (id: string, items: [string, string][]) =>
    section(id, "faq", "FAQ", {
      heading: "Frequently asked questions",
      subheading: "Everything you might want to know before you buy.",
      style: "accordion",
      expanded_first: true,
      icon_style: "chevron",
      color_scheme: dark ? "black" : "white",
      bg_color: p.bg,
      text_color: p.text,
      ...PAD,
    }, items.map(([question, answer], i) => block(`${id}-${i + 1}`, "faq_item", { question, answer: `<p>${answer}</p>`, open_by_default: i === 0 })))

  const steps = (id: string, items: [string, string][]) =>
    section(id, "process_steps", "How it works", {
      heading: "How it works",
      subheading: "Three steps, no surprises.",
      layout: "horizontal",
      show_numbers: true,
      connector_color: p.border,
      bg_color: p.surface,
      text_color: p.text,
      ...PAD,
    }, items.map(([title, description], i) => block(`${id}-${i + 1}`, "step", { number: `0${i + 1}`, title, description })))

  const stats = (id: string, items: [string, string, string][]) =>
    section(id, "stats", "Numbers", {
      heading: "Trusted by people who ship",
      layout: "row",
      show_icon: false,
      animate_numbers: true,
      color_scheme: dark ? "black" : "white",
      divider_color: p.border,
      bg_color: p.bg,
      text_color: p.text,
      padding_top: 56,
      padding_bottom: 56,
    }, items.map(([value, suffix, label], i) => block(`${id}-${i + 1}`, "stat", { value, suffix, label, color: p.primary })))

  const newsletter = (id: string) =>
    section(id, "newsletter", "Newsletter", {
      heading: "Be first to the next drop",
      subheading: "New releases, early access and the occasional discount. No noise.",
      placeholder: "you@example.com",
      button_text: "Subscribe",
      disclaimer: "Unsubscribe any time.",
      layout: "centered",
      bg_color: p.surface,
      text_color: p.text,
      ...PAD,
    })

  const split = (id: string, eyebrow: string, heading: string, body: string) =>
    section(id, "split_content", heading, {
      eyebrow,
      heading,
      body: `<p>${body}</p>`,
      image_position: "right",
      image_aspect_ratio: "square",
      button_text: "About us",
      button_url: "/about",
      button_style: "outline",
      color_scheme: dark ? "black" : "white",
      bg_color: p.bg,
      text_color: p.text,
      max_width: "wide",
      ...PAD,
    })

  const richText = (id: string, eyebrow: string, heading: string, body: string) =>
    section(id, "rich_text", heading, {
      eyebrow,
      heading,
      body: `<p>${body}</p>`,
      alignment: "center",
      max_width: "medium",
      color_scheme: dark ? "black" : "white",
      bg_color: p.bg,
      text_color: p.text,
      ...PAD,
    })

  const home: SectionInstance[] = [header]

  switch (def.industry) {
    case "ebooks": {
      home.push(
        hero,
        section("book", "ebook_showcase", "The book", {
          heading: def.sample.headline,
          subheading: def.sample.sub,
          author_name: brand,
          author_title: "Author",
          price_text: "$29",
          badge_text: "New release",
          format_tags: "PDF, EPUB, Kindle",
          mockup_style: "perspective",
          show_mockup_shadow: true,
          page_count: 240,
          chapter_count: 12,
          read_time: "6 hours",
          description: "A practical, chapter-by-chapter guide you can read in a weekend and use for years.",
          show_table_of_contents: true,
          toc_items: "Why now\nThe system\nThe first 30 days\nScaling what works",
          rating_value: 4.8,
          review_count: 312,
          show_stars: true,
          buy_button_text: def.sample.cta,
          buy_button_url: "/products",
          buy_button_color: p.primary,
          buy_button_text_color: contrastText(p.primary),
          sample_button_text: "Read a sample",
          sample_button_url: "#",
          sample_button_style: "outline",
          layout: "left",
          bg_color: p.bg,
          text_color: p.text,
          accent_color: p.primary,
          ...PAD,
        }),
        section("author", "author_bio", "About the author", {
          name: brand,
          title_line: "Author and educator",
          bio: "Writes about building calm, profitable businesses. Six books, two decades of doing the work first.",
          featured_quote: "Write the book you needed ten years ago.",
          quote_attribution: brand,
          books_count: 6,
          years_experience: 20,
          students_count: "40,000+",
          layout: "left",
          show_stats: true,
          show_social: true,
          bg_color: p.surface,
          text_color: p.text,
          accent_color: p.primary,
          ...PAD,
        }),
        testimonials("reviews", [
          ["I read it in one sitting and rebuilt my week the next morning.", "Priya N.", "Founder"],
          ["Finally a business book that respects your time.", "Tom A.", "Consultant"],
          ["The chapter on systems alone paid for the book.", "Léa M.", "Designer"],
        ]),
        faq("faq", [
          ["Which formats do I get?", "PDF, EPUB and Kindle files, delivered instantly after purchase."],
          ["Can I read a sample first?", "Yes — the first two chapters are free to download above."],
          ["Do you offer refunds?", "If it is not for you, reply to your receipt within 30 days for a full refund."],
        ]),
      )
      break
    }
    case "courses": {
      home.push(
        hero,
        steps("steps", [
          ["Enrol", "Pick the cohort that fits your calendar and reserve your seat."],
          ["Learn together", "Weekly live sessions, recorded, with feedback on your actual work."],
          ["Ship", "Finish with something real, and a community that keeps you accountable."],
        ]),
        stats("stats", [["1,200", "+", "Students"], ["4.9", "", "Average rating"], ["92", "%", "Completion rate"], ["30", "", "Days to launch"]]),
        products("courses", "Courses", "Self-paced and live cohorts.", true),
        testimonials("stories", [
          ["I launched during week three. The feedback loop is the whole product.", "Daniel K.", "Student"],
          ["Clear, practical, and the community is the best part.", "Ana R.", "Student"],
          ["Worth every cent. I have taken three cohorts now.", "Mikael S.", "Student"],
        ]),
        cta("cta", "Next cohort starts soon", "Seats are limited so everyone gets feedback."),
      )
      break
    }
    case "design": {
      home.push(
        hero,
        products("kits", "Latest kits", "Figma, icons and templates.", false),
        richText("manifesto", "Our approach", "Fewer, better files", "Every kit is used in a real product before it is sold. Variables, auto layout and naming you will not have to fix."),
        features("features", "What you get", "Every purchase includes", [
          ["download", "Instant download", "Files land in your inbox the moment you buy."],
          ["refresh-cw", "Free updates", "Every future version, at no extra cost."],
          ["globe", "Team licence", "Use it across your whole team on one licence."],
        ]),
        cta("cta", "Build faster this week", "Pick a kit and start on Monday with the boring parts done."),
      )
      break
    }
    case "photography": {
      home.push(
        hero,
        section("proof", "social_proof_bar", "Proof", {
          show_rating: true,
          rating_value: 4.9,
          review_count: "1,800+",
          rating_label: "from 1,800+ reviews",
          show_customer_count: true,
          customer_count: "12,000+",
          customer_label: "photographers",
          show_guarantee: true,
          guarantee_text: "30-day guarantee",
          show_security: false,
          show_trust_logos: false,
          bg_color: p.surface,
          text_color: p.text,
          star_color: p.accent,
          icon_color: p.primary,
          divider_color: p.border,
          show_dividers: true,
          alignment: "center",
          max_width: "wide",
          padding_top: 28,
          padding_bottom: 28,
        }),
        products("presets", "Presets and prints", "Made in the field, finished in the studio.", false),
        split("story", "The studio", "Light, shaped", "Fifteen years of editorial and documentary work, distilled into presets you can trust on a deadline."),
        newsletter("newsletter"),
      )
      break
    }
    case "coaching": {
      home.push(
        hero,
        products("programs", "Programs", "Pick the pace that fits your life.", false),
        steps("steps", [
          ["Book a call", "A free 30-minute conversation about where you are and where you want to be."],
          ["Choose a program", "One-to-one, group, or self-paced. Same method, different pace."],
          ["Do the work", "Weekly check-ins and a plan you can actually follow."],
        ]),
        testimonials("results", [
          ["Six months in, I have a business that runs without me on Fridays.", "Sarah J.", "Studio owner"],
          ["The clarity alone was worth it. The plan is why I stayed.", "Omar B.", "Consultant"],
          ["Kind, direct, and relentlessly practical.", "Grace L.", "Founder"],
        ]),
        faq("faq", [
          ["Is this for me?", "If you are stuck between where you are and where you want to be, yes. Book a call and we will find out together."],
          ["How much time does it take?", "Two to three hours a week, including our check-in."],
          ["What if it does not work?", "There is a 14-day guarantee on every program. No forms, no questions."],
        ]),
        cta("cta", "Ready when you are", "Book a free call and leave with one clear next step."),
      )
      break
    }
    case "music": {
      home.push(
        hero,
        products("packs", "Latest packs", "Drums, one-shots, loops and full kits.", false),
        stats("stats", [["48", "", "Packs released"], ["3,400", "+", "Producers"], ["100", "%", "Royalty free"], ["24", "bit", "WAV"]]),
        features("features", "Built for producers", "Every pack ships with", [
          ["star", "Key and BPM labelled", "Every sample named so you can drag and go."],
          ["download", "Instant download", "WAV files, delivered the second you check out."],
          ["shield", "Royalty free", "Use them in released music, forever, no credits required."],
        ]),
        newsletter("newsletter"),
      )
      break
    }
    case "software": {
      home.push(
        hero,
        features("features", "Everything you need, nothing you don't", "Built for people who ship", [
          ["zap", "Fast by default", "Opens in under a second and never gets in your way."],
          ["shield", "Private", "Your data stays on your machine. No accounts required."],
          ["refresh-cw", "Free updates", "Buy once. Every update is included."],
        ]),
        products("pricing", "Pricing", "One-time purchase. No subscription.", false),
        section("trust", "trust_badges", "Trust", {
          heading: "Buy with confidence",
          layout: "row",
          style: "icon-text",
          bg_color: p.surface,
          text_color: p.text,
          padding_top: 40,
          padding_bottom: 40,
        }, [
          block("trust-1", "badge", { icon: "shield", title: "Secure checkout", description: "Payments handled by Stripe.", color: p.primary }),
          block("trust-2", "badge", { icon: "refresh", title: "14-day refunds", description: "Not for you? Full refund.", color: p.primary }),
          block("trust-3", "badge", { icon: "lock", title: "No lock-in", description: "Your data is yours, in open formats.", color: p.primary }),
        ]),
        faq("faq", [
          ["Which platforms are supported?", "macOS 13 and later. Windows is on the roadmap."],
          ["Is there a free trial?", "Yes — 14 days, every feature, no card."],
          ["Do I need an account?", "No. Your licence is a file; keep it somewhere safe."],
        ]),
        cta("cta", "Try it free for 14 days", "No account, no card. Download and start."),
      )
      break
    }
    case "creators": {
      home.push(
        hero,
        products("shop", "The shop", "Notes, kits and small tools.", false),
        split("about", "About", "Made by one person, used by thousands", "I make the things I wish existed and sell them here so they keep existing. Every product is something I use every week."),
        newsletter("newsletter"),
      )
      break
    }
    case "digital": {
      home.push(
        hero,
        stats("stats", [["25,000", "+", "Downloads"], ["4.9", "", "Average rating"], ["120", "+", "Products"], ["24", "h", "Support"]]),
        products("packs", "Best sellers", "The packs everyone starts with.", false),
        features("features", "Why creators choose us", "Built for the way you actually work", [
          ["zap", "Instant download", "Files are in your inbox before you close the tab."],
          ["refresh-cw", "Lifetime updates", "Every new version, free, forever."],
          ["shield", "Commercial licence", "Use everything in client work without a second thought."],
        ]),
        cta("cta", "Start with a pack", "Pick one, install it, and see the difference tonight."),
      )
      break
    }
    default: {
      home.push(
        hero,
        features("features", "Why choose us", "Built to grow with your business", [
          ["zap", "Instant download", "Get your files immediately after purchase, no waiting."],
          ["shield", "Secure and safe", "Every transaction is encrypted and your data is protected."],
          ["refresh-cw", "Lifetime access", "Purchase once and access your content forever."],
        ]),
        products("featured", "Featured products", "Handpicked just for you.", false),
        testimonials("testimonials", [
          ["Absolutely love this. It saves me hours every week.", "Sarah J.", "Designer"],
          ["Best purchase I have made this year.", "Mike R.", "Developer"],
          ["Clean, fast, and exactly as described.", "Ana P.", "Marketer"],
        ]),
        cta("cta", "Ready to get started?", "Join thousands of creators who trust this store."),
      )
    }
  }

  home.push(footer)

  /*
    THE PRODUCT TEMPLATE STARTS WITH THE PRODUCT. This was a Split Content
    section reading "Product name" with a Buy button to `#`, so every
    product on a site whose creator never opened the product page in the
    builder was drawn as that placeholder. The `product` section is the one
    that draws the real product: see lib/website-builder/product-page.ts,
    which repairs templates saved before this.
  */
  const product: SectionInstance[] = [
    header,
    /* Its blocks too: a product section with none draws only the pictures. */
    section("main-product", "product", "Product", {
      ...mainProductSection().settings,
      color_scheme: dark ? "black" : "white",
    }, mainProductSection().blocks),
    features("product-features", "What's included", "Everything you get with your purchase", [
      ["download", "Instant download", "Get immediate access to all files after purchase."],
      ["refresh-cw", "Free updates", "Receive all future updates at no extra cost."],
      /* No refund promise and no reviews here: this is every product's page in a new store, and it printed a thirty day money back promise and two five star quotes marked verified, for a store that had promised and received neither. A store adds its own, or Storelib Reviews shows its real ones. */
      ["mail", "Help when you need it", "Write to us about your order and we will answer."],
    ]),
    products("product-related", "You might also like", "More from this store.", true),
    footer,
  ]

  return { settings, pages: { home, product } }
}

// ── Colour helpers (tiny, dependency-free, shared with the cover art) ────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6)
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.35
}

export function contrastText(hex: string): string {
  return isDark(hex) ? "#ffffff" : "#0f172a"
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
