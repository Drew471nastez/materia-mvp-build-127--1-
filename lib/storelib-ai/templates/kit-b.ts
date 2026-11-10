/**
 * ===========================================================================
 *  P2b TEMPLATE KIT: HOW THE SIX TEMPLATES ARE WRITTEN
 * ===========================================================================
 * Each template under lib/storelib-ai/templates/<id>/ writes its sections as
 * real .storelib sources (template, scoped style, schema) through
 * `defineSection`, which turns a typed schema into the JSON block, so a
 * schema is never hand-typed JSON that drifts. A section's FILLED preset
 * blocks are part of its schema (`presets[0].blocks`) and `place` copies them
 * onto the page, so every section a template places has its blocks with
 * content.
 *
 * The chrome hook markup (cart lines, search results, language and currency
 * options) is the same contract everywhere (lib/website-builder/
 * storefront-hooks.ts, lib/ai-builder/runtime-contract.ts), so it is written
 * once here with a class prefix; each template styles it its own way.
 *
 * Motion: every moving section reads the round O5 variables (--t-motion-*),
 * has a "motion" select and a "motion_strength" range, keeps the still state
 * as the default, and names the P3 island it wants with
 * data-storelib-motion="..." and data-motion-* params. The CSS here is the
 * fallback that works with no island at all.
 *
 * Pure strings. No React, no I/O.
 */
import type { SectionInstance, BlockInstance } from "@/lib/website-builder/types"
import type { SiteTemplate, TemplateImageSlot } from "./types-b"

/* ── schema settings ──────────────────────────────────────────────────── */

export type Setting = Record<string, unknown> & { type: string; id?: string; label?: string }

export const text = (id: string, label: string, def = ""): Setting => ({ type: "text", id, label, default: def })
export const textarea = (id: string, label: string, def = ""): Setting => ({ type: "textarea", id, label, default: def })
export const richtext = (id: string, label: string, def = ""): Setting => ({ type: "richtext", id, label, default: def })
export const image = (id: string, label: string): Setting => ({ type: "image_picker", id, label })
export const url = (id: string, label: string, def = ""): Setting => ({ type: "url", id, label, default: def })
export const check = (id: string, label: string, def = true): Setting => ({ type: "checkbox", id, label, default: def })
export const range = (id: string, label: string, min: number, max: number, step: number, def: number, unit?: string): Setting => ({ type: "range", id, label, min, max, step, ...(unit ? { unit } : {}), default: def })
export const select = (id: string, label: string, def: string, options: [string, string][]): Setting => ({ type: "select", id, label, default: def, options: options.map(([value, l]) => ({ value, label: l })) })
export const heading = (label: string): Setting => ({ type: "header", id: `hdr_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, label })
export const scheme = (def = "site"): Setting => ({ type: "color_scheme", id: "color_scheme", label: "Colour scheme", default: def })
export const menu = (id = "menu", label = "Menu", def = "main-menu"): Setting => ({ type: "link_list", id, label, default: def })
export const productList = (id = "products", label = "Products (empty shows the newest)"): Setting => ({ type: "product_list", id, label, limit: 12 })
export const collectionPicker = (id = "collection", label = "Collection"): Setting => ({ type: "collection_picker", id, label })

export const spacing = (top: number, bottom: number): Setting[] => [
  heading("Spacing"),
  range("padding_top", "Top padding", 0, 200, 4, top, "px"),
  range("padding_bottom", "Bottom padding", 0, 200, 4, bottom, "px"),
]

/** The round O5 motion params every moving section exposes. */
export const motion = (def: "site" | "off" = "site", strength = 100): Setting[] => [
  heading("Motion"),
  select("motion", "Motion", def, [["site", "Follow the site"], ["off", "Still"]]),
  range("motion_strength", "Motion strength", 0, 150, 10, strength, "%"),
]

/* ── the section root's variables ─────────────────────────────────────── */

/** Scheme colours and spacing as CSS variables on the section's root. */
export const vars = (extra = "") =>
  `--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-heading: {{ scheme.heading }}; --s-accent: {{ scheme.accent }}; --s-btn: {{ scheme.primary_btn_bg }}; --s-btn-text: {{ scheme.primary_btn_text }}; --s-btn-hover: {{ scheme.primary_btn_hover_bg }}; --s-btn-hover-text: {{ scheme.primary_btn_hover_text }}; --s-border: {{ scheme.border }}; --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px; --m-k: calc({{ settings.motion_strength }} / 100);${extra ? ` ${extra}` : ""}`

/** The same for chrome (no spacing, no strength). */
export const chromeVars = (extra = "") =>
  `--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-heading: {{ scheme.heading }}; --s-accent: {{ scheme.accent }}; --s-btn: {{ scheme.primary_btn_bg }}; --s-btn-text: {{ scheme.primary_btn_text }}; --s-border: {{ scheme.border }};${extra ? ` ${extra}` : ""}`

/** The padding every section box uses: the setting times the site's spacing scale. */
export const BOX = `padding: calc(var(--s-pt) * var(--theme-spacing-scale, 1)) var(--theme-padding-x, 20px) calc(var(--s-pb) * var(--theme-spacing-scale, 1)); background: var(--s-bg); color: var(--s-text); container-type: inline-size;`

/**
 * A reveal on the visitor's own scroll (view timeline), the still state the
 * default: nothing is hidden where scroll timelines or motion are missing.
 * `sel` are the elements that rise, `root` the section's class.
 */
export function revealCss(root: string, sel: string, name: string): string {
  return `@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .${root}:not([data-motion="off"]) ${sel} { animation: ${name} linear both; animation-timeline: view(); animation-range: entry 0% entry 70%; }
  }
}
@keyframes ${name} { from { opacity: 0; transform: translateY(calc(var(--t-motion-distance, 24px) * var(--m-k, 1))); } }`
}

/* ── the chrome hooks, written once ───────────────────────────────────── */

/** The words every header's panels need, as settings with plain defaults. */
export function chromeWords(over: Partial<Record<string, string>> = {}): Setting[] {
  const w = (id: string, label: string, def: string) => text(id, label, over[id] ?? def)
  return [
    heading("Words"),
    w("nav_label", "Menu name (read aloud)", "Main"),
    w("menu_label", "Menu button", "Menu"),
    w("close_label", "Close button", "Close"),
    w("search_label", "Search", "Search"),
    w("search_placeholder", "Search hint", "Search the site"),
    w("loading_text", "While searching", "Looking..."),
    w("no_results_text", "No results", "Nothing matches that yet."),
    w("cart_label", "Cart", "Cart"),
    w("empty_text", "Empty cart", "Your cart is empty."),
    w("subtotal_label", "Subtotal", "Subtotal"),
    w("checkout_label", "Checkout button", "Check out"),
    w("remove_label", "Remove", "Remove"),
    w("less_label", "One less (read aloud)", "One less"),
    w("more_label", "One more (read aloud)", "One more"),
    w("language_label", "Language", "Language"),
    w("currency_label", "Currency", "Currency"),
  ]
}

/** The cart drawer: one panel the page fills with the site's one cart. */
export function cartPanel(p: string, extraClass = ""): string {
  return `<aside class="${p}-cart${extraClass ? ` ${extraClass}` : ""}" data-storelib-cart-panel aria-label="{{ settings.cart_label }}">
    <div class="${p}-cart__head"><p class="${p}-cart__title">{{ settings.cart_label }}</p><button class="${p}-x" type="button" data-storelib-cart-close>{{ settings.close_label }}</button></div>
    <p class="${p}-cart__state" data-storelib-cart-empty>{{ settings.empty_text }}</p>
    <ul class="${p}-cart__lines" data-storelib-cart-lines>
      <li class="${p}-cart__line" data-storelib-cart-line hidden>
        <img class="${p}-cart__img" data-line-image alt="" width="72" height="90">
        <div class="${p}-cart__main"><a class="${p}-cart__name" data-line-url><span data-line-title></span></a><span class="${p}-cart__var" data-line-variant></span>
          <div class="${p}-cart__qty"><button type="button" data-line-dec aria-label="{{ settings.less_label }}">-</button><span data-line-qty></span><button type="button" data-line-inc aria-label="{{ settings.more_label }}">+</button><button class="${p}-cart__rm" type="button" data-line-remove>{{ settings.remove_label }}</button></div>
        </div>
        <span class="${p}-cart__price" data-line-price></span>
      </li>
    </ul>
    <div class="${p}-cart__foot" data-storelib-cart-filled>
      <p class="${p}-cart__sub"><span>{{ settings.subtotal_label }}</span><span data-storelib-cart-subtotal></span></p>
      <button class="${p}-cart__go" type="button" data-storelib-checkout>{{ settings.checkout_label }}</button>
    </div>
  </aside>`
}

/** The search window with live results. */
export function searchPanel(p: string): string {
  return `<div class="${p}-search" data-storelib-search-panel role="dialog" aria-label="{{ settings.search_label }}">
    <div class="${p}-search__in">
      <input class="${p}-search__input" type="search" data-storelib-search-input placeholder="{{ settings.search_placeholder }}" aria-label="{{ settings.search_label }}">
      <button class="${p}-x" type="button" data-storelib-search-close>{{ settings.close_label }}</button>
      <p class="${p}-search__state" data-storelib-search-loading hidden>{{ settings.loading_text }}</p>
      <p class="${p}-search__state" data-storelib-search-empty hidden>{{ settings.no_results_text }}</p>
      <ul class="${p}-search__results" data-storelib-search-results>
        <li class="${p}-search__result" data-storelib-search-result hidden><a class="${p}-search__link" data-result-url><img data-result-image alt="" width="64" height="80"><span class="${p}-search__name" data-result-title></span><span class="${p}-search__kind" data-result-kind></span><span class="${p}-search__price" data-result-price></span></a></li>
      </ul>
    </div>
  </div>`
}

/** Language and currency lists (hidden by the page on a one-language, one-currency site). */
export function prefs(p: string): string {
  return `<div class="${p}-prefs">
      <div class="${p}-pref" data-storelib-locale-list><span class="${p}-pref__label">{{ settings.language_label }} <span class="${p}-pref__now" data-storelib-locale-current></span></span><button class="${p}-pref__opt" type="button" data-storelib-locale-option hidden><span data-option-label></span></button></div>
      <div class="${p}-pref" data-storelib-currency-list><span class="${p}-pref__label">{{ settings.currency_label }} <span class="${p}-pref__now" data-storelib-currency-current></span></span><button class="${p}-pref__opt" type="button" data-storelib-currency-option hidden><span data-option-label></span></button></div>
    </div>`
}

/** The mechanics of the panels: shut by default, open on data-open, still for reduced motion. Each template adds its own look. */
export function panelCss(p: string, o: { cartFrom?: "right" | "bottom" | "left"; searchFrom?: "top" | "full" } = {}): string {
  const cart = o.cartFrom === "bottom" ? "inset: auto 0 0 0; max-height: 86svh; transform: translateY(100%);" : o.cartFrom === "left" ? "inset: 0 auto 0 0; width: min(440px, 100%); transform: translateX(-100%);" : "inset: 0 0 0 auto; width: min(440px, 100%); transform: translateX(100%);"
  const search = o.searchFrom === "full" ? "inset: 0; transform: scale(0.985);" : "inset: 0 0 auto 0; max-height: 100svh; transform: translateY(-12px);"
  return `.${p}-search, .${p}-cart { position: fixed; z-index: 40; visibility: hidden; opacity: 0; background: var(--s-bg); color: var(--s-text); overflow-y: auto; transition: opacity var(--t-motion-hover, 200ms) ease, transform calc(var(--t-motion-duration, 650ms) * 0.6) var(--t-motion-ease, ease), visibility 0s linear calc(var(--t-motion-duration, 650ms) * 0.6); }
.${p}-cart { ${cart} display: flex; flex-direction: column; padding: 18px 20px; }
.${p}-search { ${search} padding: 18px var(--theme-padding-x, 20px) 40px; }
.${p}-search[data-open="true"], .${p}-cart[data-open="true"] { visibility: visible; opacity: 1; transform: none; transition-delay: 0s; }
.${p}-x { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; }
.${p}-cart__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.${p}-cart__title { margin: 0; font-family: var(--theme-font-heading), sans-serif; font-size: 1.5rem; color: var(--s-heading); }
.${p}-cart__state, .${p}-search__state { margin: 8px 0; }
.${p}-cart__lines, .${p}-search__results { margin: 0; padding: 0; list-style: none; }
.${p}-cart__lines { flex: 1; overflow-y: auto; }
.${p}-cart__line { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--s-border); }
.${p}-cart__img { width: 72px; height: 90px; object-fit: cover; }
.${p}-cart__name { color: inherit; }
.${p}-cart__var { display: block; font-size: 0.875rem; opacity: 0.75; }
.${p}-cart__qty { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.${p}-cart__qty button { min-width: 44px; min-height: 44px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; }
.${p}-cart__qty .${p}-cart__rm { min-width: 0; padding: 0 8px; border: 0; text-decoration: underline; }
.${p}-cart__sub { display: flex; justify-content: space-between; margin: 14px 0; font-variant-numeric: tabular-nums; }
.${p}-cart__go { width: 100%; min-height: 54px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 600; cursor: pointer; }
.${p}-search__in { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; max-width: 980px; margin: 0 auto; }
.${p}-search__input { min-width: 0; min-height: 56px; padding: 0 4px; border: 0; border-bottom: 2px solid currentColor; background: none; color: inherit; font: inherit; font-size: clamp(1.25rem, 1rem + 1.4vw, 2.25rem); }
.${p}-search__state, .${p}-search__results { grid-column: 1 / -1; }
.${p}-search__link { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; align-items: center; gap: 4px 14px; padding: 10px 0; border-bottom: 1px solid var(--s-border); color: inherit; text-decoration: none; }
.${p}-search__link img { grid-row: span 2; width: 64px; height: 80px; object-fit: cover; }
.${p}-search__kind { grid-column: 2; font-size: 0.8125rem; opacity: 0.7; }
.${p}-search__price { grid-column: 3; grid-row: 1; font-variant-numeric: tabular-nums; }
.${p}-prefs { display: grid; gap: 12px; }
.${p}-pref { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.${p}-pref__label { font-size: 0.875rem; }
.${p}-pref__opt { min-height: 44px; padding: 0 12px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; }
.${p}-pref__opt[aria-current="true"] { border-color: currentColor; background: var(--s-text); color: var(--s-bg); }
@media (prefers-reduced-motion: reduce) { .${p}-search, .${p}-cart { transition: none; } }`
}

/* ── a section file ───────────────────────────────────────────────────── */

export interface BlockDef {
  type: string
  name: string
  settings: Setting[]
}

export interface SectionDef {
  /** "ai_<prefix>_<name>" */
  type: string
  path: string
  source: string
  /** The filled blocks a new placement gets (the schema's presets[0].blocks). */
  presetBlocks: { type: string; settings: Record<string, unknown> }[]
  settings: Setting[]
  blocks: BlockDef[]
}

export interface SectionSpec {
  type: string
  name: string
  /** One line for the sidebar and the agent: what the section is for. */
  summary: string
  template: string
  style: string
  settings: Setting[]
  blocks?: BlockDef[]
  /** FILLED: every block type declared appears with real content. */
  presetBlocks?: { type: string; settings: Record<string, unknown> }[]
  maxBlocks?: number
  /** Chrome: "header" or "footer" (and the group it is enabled on). */
  kind?: "header" | "footer"
  category?: string
}

export function defineSection(spec: SectionSpec): SectionDef {
  const schema: Record<string, unknown> = {
    schema_version: 1,
    type: spec.type,
    name: spec.name,
    ...(spec.kind ? { kind: spec.kind, enabled_on: { groups: [spec.kind] } } : {}),
    ...(spec.category ? { category: spec.category } : {}),
    settings: spec.settings,
    ...(spec.blocks?.length ? { blocks: spec.blocks, ...(spec.maxBlocks ? { max_blocks: spec.maxBlocks } : {}) } : {}),
    ...(spec.presetBlocks?.length ? { presets: [{ name: spec.name, blocks: spec.presetBlocks }] } : {}),
  }
  const source = `{# ${spec.summary} #}
<template>
${spec.template.trim()}
</template>

<style scoped>
${spec.style.trim()}
</style>

<schema>
${JSON.stringify(schema, null, 2)}
</schema>
`
  return { type: spec.type, path: `sections/${spec.type}.storelib`, source, presetBlocks: spec.presetBlocks ?? [], settings: spec.settings, blocks: spec.blocks ?? [] }
}

/** Each setting's default, for a placement that keeps them. */
function defaultsOf(settings: Setting[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const s of settings) if (s.id && s.type !== "header" && "default" in s) out[s.id] = s.default
  return out
}

/**
 * The section placed on a page: its defaults, any overrides, and its preset
 * blocks (or the blocks given), each with a stable id `<id>-b<n>` an image
 * slot can name.
 */
export function place(def: SectionDef, id: string, settings: Record<string, unknown> = {}, blocks?: { type: string; settings: Record<string, unknown> }[], group?: "header" | "footer"): SectionInstance {
  const list = blocks ?? def.presetBlocks
  const blockDefaults = (type: string) => defaultsOf(def.blocks.find((b) => b.type === type)?.settings ?? [])
  const out: SectionInstance = {
    id,
    type: def.type,
    name: def.type,
    settings: { ...defaultsOf(def.settings), ...settings },
    blocks: list.map((b, i): BlockInstance => ({ id: `${id}-b${i + 1}`, type: b.type, settings: { ...blockDefaults(b.type), ...b.settings } })),
  }
  if (group) out.group = group
  return out
}

/* ── image slots ──────────────────────────────────────────────────────── */

export const slot = (key: string, aspect: string, prompt: string): TemplateImageSlot => ({ key, aspect, prompt })

export interface ImageTarget {
  page: string
  sectionId: string
  blockId?: string
  setting: string
}

/** Where a slot's picture goes; null when the key names nothing on the template. */
export function templateImageTarget(t: Pick<SiteTemplate, "pages">, key: string): (ImageTarget & { section: SectionInstance; block?: BlockInstance }) | null {
  const parts = key.split("/")
  if (parts.length !== 3 && parts.length !== 4) return null
  const [page, sectionId] = parts
  const setting = parts[parts.length - 1]
  const blockId = parts.length === 4 ? parts[2] : undefined
  const section = t.pages.find((p) => p.key === page)?.sections.find((s) => s.id === sectionId)
  if (!section) return null
  if (!blockId) return { page, sectionId, setting, section }
  const block = section.blocks?.find((b) => b.id === blockId)
  return block ? { page, sectionId, blockId, setting, section, block } : null
}

/** A copy of the template's pages with each slot's picture written where it goes (P1 hands the urls). */
export function withImages(t: Pick<SiteTemplate, "pages">, urls: Record<string, string>): SiteTemplate["pages"] {
  const pages = JSON.parse(JSON.stringify(t.pages)) as SiteTemplate["pages"]
  for (const [key, value] of Object.entries(urls)) {
    const hit = templateImageTarget({ pages }, key)
    if (!hit) continue
    if (hit.block) hit.block.settings[hit.setting] = value
    else hit.section.settings[hit.setting] = value
  }
  return pages
}

/** Every file of a template from its section definitions. */
export function filesOf(defs: SectionDef[]): Record<string, string> {
  return Object.fromEntries(defs.map((d) => [d.path, d.source]))
}
