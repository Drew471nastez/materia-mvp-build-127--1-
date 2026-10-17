/**
 * ===========================================================================
 *  THE THEME, READ ONCE PER VERSION, IN A FEW HUNDRED TOKENS
 * ===========================================================================
 * Before writing or changing a section, a designer looks at the site's
 * system: its colours, its type scale, its buttons and corners, its spacing,
 * whether things move, which sections the creator wrote themselves and what
 * the page is built from. The writer used to be told the colour schemes and
 * a list of section names; the page agent was told the settings as a JSON
 * dump and had to work out the rest itself, on every run.
 *
 * So this reads it once and says it compactly:
 *
 *   TOKENS     the values the theme's CSS variables resolve to on THIS
 *              site (lib/website-builder/theme-css.ts, themeVars): page
 *              width, side padding, spacing scale, the corners of buttons,
 *              cards and pictures, the type scale at desktop and phone
 *              sizes, and motion. The framework reference in the cached
 *              system prompt names the variables; this says their values.
 *   OWN FILES  the sections the creator wrote, with their type, kind,
 *              controls and whether they read the store
 *   THE PAGE   what it is built from, in order, and which sections show
 *              the store's products
 *
 * CACHED PER THEME VERSION. The version is a hash of exactly what the brief
 * is made from (the theme settings without the AI's notes, the files, the
 * page), so an unchanged theme is never read again and any change makes a
 * new one. The cache is small and bounded, and holds text derived only from
 * the content it is keyed by. BOUNDED: the text never passes
 * MAX_BRIEF_CHARS, however many sections and files the theme has.
 *
 * Pure, server and browser safe.
 */

import { describeThemeForAuthoring, type ThemeContextInput } from "@/lib/storelib-ai/theme-context"
import { parseStorelib } from "@/lib/storelib-theme/storelib/parse"
import { resolveControlType } from "@/lib/storelib-theme/controls/registry"
import { themeTypography } from "@/lib/storelib-theme/typography"
import { themeVars } from "../theme-css"
import type { ThemeSettingsValues } from "../types"
import { BRIEF_KEY } from "./project-state"

export const MAX_BRIEF_CHARS = 2_400
/** Theme versions kept. A server answers many installs; each brief is a couple of kilobytes. */
export const BRIEF_CACHE_SIZE = 64

export interface ThemeBriefInput extends ThemeContextInput {
  /** The install's own files, path to source: the sections the creator wrote. */
  sources?: Record<string, string>
  /** The open page, in order. */
  sections?: { id?: string; type: string; name?: string; settings?: Record<string, unknown> }[]
  /**
   * "writer": everything, for a surface that is told nothing else about the site (the section writer).
   * "page": what the page agent is not already shown (it has the palette, the house style and the settings).
   */
  for?: "writer" | "page"
}

export interface ThemeBrief {
  version: string
  text: string
  /** The facts the text is made from, for a caller that wants one of them. */
  facts: {
    ownSections: { type: string; name: string; kind?: string; controls: number; blocks: string[]; store: boolean }[]
    productSections: string[]
  }
}

const cache = new Map<string, ThemeBrief>()
let hits = 0
let misses = 0

/** How often the cache answered, for tests and the run's log. */
export function themeBriefStats(): { hits: number; misses: number; size: number } {
  return { hits, misses, size: cache.size }
}

/** FNV-1a, 32 bit: a version, not a secret. */
function fnv(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** The version: everything the brief is made from, and nothing it is not. */
export function themeVersion(input: ThemeBriefInput): string {
  const settings = { ...(input.settings ?? {}) } as Record<string, unknown>
  /* The AI's own notes change on every run and say nothing about the design. */
  delete settings[BRIEF_KEY]
  let h = fnv(JSON.stringify(settings))
  for (const [path, source] of Object.entries(input.sources ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!path.startsWith("sections/")) continue
    h = fnv(`${path}\u0000${source}`, h)
  }
  const page = (input.sections ?? []).map((s) => `${s.type}:${s.name ?? ""}:${String(s.settings?.color_scheme ?? "")}:${String(s.settings?.padding_top ?? "")}:${String(s.settings?.padding_bottom ?? "")}`).join("|")
  h = fnv(`${input.for ?? "writer"}\u0000${page}\u0000${JSON.stringify(input.neighbours ?? [])}`, h)
  return h.toString(16).padStart(8, "0")
}

const STORE_CONTROLS = new Set(["product_picker", "product_list", "collection_picker", "collection_list"])

function ownSections(sources: Record<string, string>): ThemeBrief["facts"]["ownSections"] {
  const out: ThemeBrief["facts"]["ownSections"] = []
  for (const [path, source] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^sections\/[a-z0-9_-]+\.storelib$/.test(path)) continue
    const parsed = parseStorelib(source, path)
    if (parsed.ok === false) continue
    let schema: { type?: unknown; name?: unknown; kind?: unknown; settings?: { type?: unknown }[]; blocks?: { type?: unknown; settings?: { type?: unknown }[] }[] }
    try {
      schema = JSON.parse(parsed.value.schema.text)
    } catch {
      continue
    }
    const all = [...(schema.settings ?? []), ...(schema.blocks ?? []).flatMap((b) => b.settings ?? [])]
    out.push({
      type: String(schema.type ?? path.slice(9, -9)),
      name: String(schema.name ?? schema.type ?? ""),
      ...(schema.kind === "header" || schema.kind === "footer" ? { kind: schema.kind } : {}),
      controls: all.length,
      blocks: (schema.blocks ?? []).map((b) => String(b.type ?? "")).filter(Boolean).slice(0, 6),
      store: all.some((s) => STORE_CONTROLS.has(String(resolveControlType(String(s.type ?? "")) ?? ""))) || /\{%-?\s*for\s+\w+\s+in\s+products\b/.test(parsed.value.template.text),
    })
  }
  return out
}

function tokens(settings: Record<string, unknown>): string {
  let vars: Record<string, string> = {}
  try {
    vars = themeVars(settings as unknown as ThemeSettingsValues)
  } catch {
    return ""
  }
  const typo = themeTypography(settings)
  const size = (k: "h1" | "h2" | "h3" | "body") => `${k} ${typo.styles[k].size.desktop}/${typo.styles[k].size.mobile}px`
  const motion = settings.animations_enabled === true ? `on, ${String(settings.animation_style ?? "fade")} over ${vars["--theme-animation-duration"] ?? "600ms"}` : "off (a section's own motion still plays)"
  return [
    `TOKENS ON THIS SITE (what the theme's variables are here): page width ${vars["--theme-page-width"]}, side padding ${vars["--theme-padding-x"]}, spacing scale ${vars["--theme-spacing-scale"]}, section gap ${vars["--theme-section-gap"]}.`,
    `Corners: buttons ${vars["--theme-button-radius"]}, cards ${vars["--theme-radius"]}, pictures ${vars["--theme-image-radius"]}. Card shadow ${vars["--theme-card-shadow"] === "none" ? "none" : "on"}.`,
    `Type scale, desktop/phone: ${size("h1")}, ${size("h2")}, ${size("h3")}, ${size("body")}; fonts: heading ${typo.fonts.heading}, body ${typo.fonts.body}.`,
    `Theme entrance animation: ${motion}.`,
  ].join("\n")
}

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** The brief for this theme version: from the cache when it was read before. */
export function themeBrief(input: ThemeBriefInput): ThemeBrief {
  const version = themeVersion(input)
  const known = cache.get(version)
  if (known) {
    hits++
    /* Most recently used last, so the oldest goes first. */
    cache.delete(version)
    cache.set(version, known)
    return known
  }
  misses++
  const settings = (input.settings ?? {}) as Record<string, unknown>
  const own = ownSections(input.sources ?? {})
  const ownByType = new Map(own.map((o) => [o.type, o]))
  const page = input.sections ?? []
  const productSections = page.filter((s) => ownByType.get(s.type)?.store || /product|collection|shop|catalog/i.test(s.type)).map((s) => s.name?.trim() || s.type)

  const parts: string[] = []
  if (input.for !== "page") {
    const site = describeThemeForAuthoring({ settings, neighbours: input.neighbours })
    if (site) parts.push(site)
  }
  const t = tokens(settings)
  if (t) parts.push(t)
  if (own.length) {
    const shown = own.slice(0, 10).map((o) => `  ${o.type} "${cut(o.name, 40)}"${o.kind ? ` (the site's ${o.kind})` : ""}: ${o.controls} controls${o.blocks.length ? `, blocks ${o.blocks.join(", ")}` : ""}${o.store ? ", reads the store" : ""}`)
    parts.push([`SECTIONS THE CREATOR WROTE (their own files, editable with the code tools):`, ...shown, own.length > 10 ? `  and ${own.length - 10} more` : ""].filter(Boolean).join("\n"))
  }
  if (page.length && input.for === "page") {
    if (productSections.length) parts.push(`THE STORE ON THIS PAGE: ${cut(productSections.join(", "), 200)} show the store's products; keep them bound to it.`)
  } else if (page.length) {
    parts.push(`THE PAGE, IN ORDER: ${cut(page.map((s) => s.name?.trim() || s.type).join(", "), 400)}.${productSections.length ? ` ${cut(productSections.join(", "), 160)} show the store's products.` : ""}`)
  }
  const brief: ThemeBrief = { version, text: cut(parts.join("\n\n"), MAX_BRIEF_CHARS), facts: { ownSections: own, productSections } }
  cache.set(version, brief)
  while (cache.size > BRIEF_CACHE_SIZE) cache.delete(cache.keys().next().value as string)
  return brief
}
