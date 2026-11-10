/**
 * ===========================================================================
 *  THE TEMPLATE KIT: A COMPONENT AS DATA, WRITTEN OUT AS A .storelib FILE
 * ===========================================================================
 * Every template component is described once (`ComponentDef`: markup,
 * scoped CSS, settings, block types and the FILLED blocks it ships with)
 * and turned into two things that can never disagree:
 *
 *   componentFile(def)   the .storelib file (template, style, schema with
 *                        a preset carrying the same filled blocks), what
 *                        the agent's ProjectStore stores and the editor edits
 *   place(def, id, ...)  the section instance a page stores, its blocks
 *                        copied from the preset with stable ids, so a page
 *                        arrives complete and never with an empty block list
 *
 * Settings are written with the helpers in `s` so every one has a label and
 * a control the editor has (lib/storelib-theme/controls/registry.ts).
 *
 * Pure. Browser safe.
 */
import type { BlockInstance, SectionInstance } from "@/lib/website-builder/types"

export type Setting = { type: string; id?: string; label?: string; default?: unknown; [key: string]: unknown }

export interface BlockDef {
  type: string
  name: string
  limit?: number
  settings: Setting[]
}

export interface PresetBlock {
  type: string
  settings: Record<string, unknown>
}

export interface ComponentDef {
  /** ai_<prefix>_<name>. */
  type: string
  /** What Add section and the sidebar show. */
  name: string
  category?: string
  kind?: "header" | "footer"
  /** The markup inside <template>. */
  template: string
  /** The CSS inside <style scoped>. */
  style: string
  settings: Setting[]
  blocks: BlockDef[]
  maxBlocks?: number
  /** The filled blocks the preset (and every placement) starts with. */
  preset: PresetBlock[]
  /** Settings the preset starts with besides the defaults. */
  presetSettings?: Record<string, unknown>
}

/* ── settings ──────────────────────────────────────────────────────────── */

export const s = {
  text: (id: string, label: string, d = "", extra: Record<string, unknown> = {}): Setting => ({ type: "text", id, label, default: d, ...extra }),
  textarea: (id: string, label: string, d = ""): Setting => ({ type: "textarea", id, label, default: d }),
  /** Inline rich text: a heading the creator can put a word of in italics or bold. Printed with | raw. */
  inline: (id: string, label: string, d = ""): Setting => ({ type: "inline_richtext", id, label, default: d }),
  /** Body copy: <p> paragraphs. Printed with | raw inside a <div>. */
  rich: (id: string, label: string, d = ""): Setting => ({ type: "richtext", id, label, default: d }),
  image: (id: string, label: string): Setting => ({ type: "image_picker", id, label }),
  url: (id: string, label: string, d = ""): Setting => ({ type: "url", id, label, default: d }),
  select: (id: string, label: string, d: string, options: [value: string, label: string][]): Setting => ({ type: "select", id, label, default: d, options: options.map(([value, l]) => ({ value, label: l })) }),
  range: (id: string, label: string, min: number, max: number, step: number, unit: string, d: number): Setting => ({ type: "range", id, label, min, max, step, ...(unit ? { unit } : {}), default: d }),
  check: (id: string, label: string, d: boolean): Setting => ({ type: "checkbox", id, label, default: d }),
  color: (id: string, label: string, d: string): Setting => ({ type: "color", id, label, default: d }),
  scheme: (d = "site"): Setting => ({ type: "color_scheme", id: "color_scheme", label: "Colour scheme", default: d }),
  menu: (id: string, label: string, d = "main-menu"): Setting => ({ type: "link_list", id, label, default: d }),
  products: (id: string, label: string, limit = 12): Setting => ({ type: "product_list", id, label, limit }),
  product: (id: string, label: string): Setting => ({ type: "product_picker", id, label }),
  collection: (id: string, label: string): Setting => ({ type: "collection_picker", id, label }),
  form: (id: string, label: string): Setting => ({ type: "form_picker", id, label }),
  file: (id: string, label: string, accept: string[]): Setting => ({ type: "file_picker", id, label, accept }),
  header: (id: string, label: string): Setting => ({ type: "header", id, label }),
}

/** Top and bottom padding, read as --s-pt / --s-pb. */
export function spacing(top = 96, bottom = 96): Setting[] {
  return [s.header("hdr_spacing", "Spacing"), s.range("padding_top", "Top padding", 0, 240, 8, "px", top), s.range("padding_bottom", "Bottom padding", 0, 240, 8, "px", bottom)]
}

/** The round O5 motion params a moving section exposes: follow the site or stand still, and how strong. */
export function motion(): Setting[] {
  return [
    s.header("hdr_motion", "Motion"),
    s.select("motion", "Motion", "site", [
      ["site", "Follow the site"],
      ["off", "Still"],
    ]),
    s.range("motion_strength", "Motion strength", 0, 150, 10, "%", 100),
  ]
}

/**
 * The root element's attributes: the scheme (and its colours as variables),
 * spacing and motion params. Every component's outermost element carries it.
 */
export function rootAttrs(opts: { motion?: boolean; spacing?: boolean } = {}): string {
  const vars = [
    "--s-bg: {{ scheme.bg }}",
    "--s-surface: {{ scheme.background_secondary }}",
    "--s-text: {{ scheme.text }}",
    "--s-muted: {{ scheme.text_muted }}",
    "--s-heading: {{ scheme.heading }}",
    "--s-accent: {{ scheme.accent }}",
    "--s-border: {{ scheme.border }}",
    "--s-btn: {{ scheme.primary_btn_bg }}",
    "--s-btn-text: {{ scheme.primary_btn_text }}",
    "--s-btn-hover: {{ scheme.primary_btn_hover_bg }}",
    "--s-btn-hover-text: {{ scheme.primary_btn_hover_text }}",
    ...(opts.spacing === false ? [] : ["--s-pt: {{ settings.padding_top }}px", "--s-pb: {{ settings.padding_bottom }}px"]),
    ...(opts.motion ? ["--m-k: calc({{ settings.motion_strength }} / 100)"] : []),
  ]
  return `data-scheme="{{ settings.color_scheme }}"${opts.motion ? ' data-motion="{{ settings.motion }}"' : ""} style="${vars.join("; ")};"`
}

/** The section box every body component starts from: scheme colours, the creator's padding, the page gutter. */
export const BOX = "padding: calc(var(--s-pt) * var(--theme-spacing-scale, 1)) var(--theme-padding-x, 20px) calc(var(--s-pb) * var(--theme-spacing-scale, 1)); background: var(--s-bg); color: var(--s-text); container-type: inline-size;"
export const INNER = "max-width: var(--theme-page-width, 1320px); margin: 0 auto;"
export const DISPLAY = "font-family: var(--theme-font-heading), sans-serif; color: var(--s-heading);"
export const LABEL = "font-family: var(--theme-font-accent, var(--theme-font-body)), sans-serif;"

/* ── the file ──────────────────────────────────────────────────────────── */

function schemaOf(def: ComponentDef): Record<string, unknown> {
  return {
    schema_version: 1,
    type: def.type,
    name: def.name,
    ...(def.category ? { category: def.category } : {}),
    ...(def.kind ? { kind: def.kind, enabled_on: { groups: [def.kind] } } : {}),
    settings: def.settings,
    blocks: def.blocks.map((b) => ({ type: b.type, name: b.name, ...(b.limit ? { limit: b.limit } : {}), settings: b.settings })),
    ...(def.maxBlocks ? { max_blocks: def.maxBlocks } : {}),
    presets: [{ name: def.name, ...(def.presetSettings ? { settings: def.presetSettings } : {}), blocks: def.preset.map((b) => ({ type: b.type, settings: b.settings })) }],
  }
}

/** The whole .storelib file. */
export function componentFile(def: ComponentDef): string {
  return `<template>\n${def.template.trim()}\n</template>\n\n<style scoped>\n${def.style.trim()}\n</style>\n\n<schema>\n${JSON.stringify(schemaOf(def), null, 2)}\n</schema>\n`
}

export const pathOf = (type: string) => `sections/${type}.storelib`

/* ── placing it on a page ──────────────────────────────────────────────── */

/**
 * A section instance of `def` with id `id`: the preset's filled blocks (ids
 * `<id>-<n>`, or `blocks` given), the scheme saved (so a footer written for
 * `site_inverse` draws inverse, as set_page_sections does), and overrides.
 */
export function place(def: ComponentDef, id: string, opts: { settings?: Record<string, unknown>; blocks?: PresetBlock[]; group?: "header" | "footer" } = {}): SectionInstance {
  const scheme = def.settings.find((x) => x.type === "color_scheme")
  const settings: Record<string, unknown> = { ...(def.presetSettings ?? {}), ...(typeof scheme?.default === "string" ? { [scheme.id as string]: scheme.default } : {}), ...(opts.settings ?? {}) }
  const blocks: BlockInstance[] = (opts.blocks ?? def.preset).map((b, i) => ({ id: `${id}-${i + 1}`, type: b.type, settings: { ...b.settings } }))
  const group = opts.group ?? def.kind
  return { id, type: def.type, name: def.name, settings, blocks, ...(group ? { group } : {}) }
}

/** The files of a set of components, by path. */
export function filesOf(defs: ComponentDef[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const d of defs) out[pathOf(d.type)] = componentFile(d)
  return out
}
