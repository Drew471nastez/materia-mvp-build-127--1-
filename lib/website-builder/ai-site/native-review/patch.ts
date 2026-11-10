/**
 * ===========================================================================
 *  A SMALL, TYPED PATCH LANGUAGE FOR A NATIVE DRAFT (round R, R3)
 * ===========================================================================
 * The review fixes what it found by changing the draft's DATA, never by
 * writing the page again: one setting, one block, a section's place, a
 * section hidden. Three operations over JSON-pointer-like paths:
 *
 *   set      /pages/home/sections/<id>/settings/<key>            a value
 *            /pages/home/sections/<id>/blocks/<bid>/settings/<key>
 *            /pages/home/sections/<id>/hidden                     true / false
 *            /theme/<key>                                         a Theme setting
 *   remove   /pages/home/sections/<id>/settings/<key>            back to its default
 *            /pages/home/sections/<id>/blocks/<bid>               the block
 *            /pages/home/sections/<id>                            the section
 *   reorder  /pages/home/sections/<id>                  to: n     its place on the page
 *            /pages/home/sections/<id>/blocks/<bid>     to: n     its place in the section
 *
 * EVERY PATH IS VALIDATED against the section's real schema (the same
 * schemas the editor's panel is drawn from: lib/website-builder/
 * section-schemas.ts, and the install's own files on top): the page and the
 * section exist, the setting is one the section declares, the value is of the
 * setting's type and inside its options or range, a link is not a script
 * address, a picture is https. A patch that fails is refused with the reason,
 * never applied "as near as possible".
 *
 * The registry lookup is an interface (`FieldLookup`) so R2's native registry
 * (lib/website-builder/ai-site/native/registry.ts, on its own branch while
 * this was written) can stand in for the schema map without this file
 * changing; `schemaLookup` is the one built on the schema map.
 *
 * Valid patches compile to the editor's own operations (ThemeOp, applied with
 * ../apply.ts applySiteOps), so every fix is replayed onto the creator's
 * canvas and can be undone there like any edit. Pure.
 */
import type { SchemaMap } from "../../agent/schemas"
import type { ThemeOp } from "../../agent/operations"
import type { SchemaField, SectionInstance } from "../../types"
import { THEME_SETTINGS_GROUPS } from "../../theme-settings-schema"
import { applySiteOps, type PageOp, type SiteState } from "../apply"

export type NativePatch =
  | { op: "set"; path: string; value: unknown; why?: string }
  | { op: "remove"; path: string; why?: string }
  | { op: "reorder"; path: string; to: number; why?: string }

export type PatchTarget =
  | { kind: "theme"; key: string }
  | { kind: "section"; page: string; section: string }
  | { kind: "section-hidden"; page: string; section: string }
  | { kind: "section-setting"; page: string; section: string; key: string }
  | { kind: "block"; page: string; section: string; block: string }
  | { kind: "block-setting"; page: string; section: string; block: string; key: string }

/** What a section's settings and blocks are: the editor's schema, or R2's registry. */
export interface FieldLookup {
  sectionField(sectionType: string, key: string): SchemaField | null
  blockField(sectionType: string, blockType: string, key: string): SchemaField | null
  themeField(key: string): SchemaField | null
}

const THEME_FIELDS: Map<string, SchemaField> = new Map(
  THEME_SETTINGS_GROUPS.flatMap((g) => ((g as { fields?: SchemaField[] }).fields ?? []).map((f) => [f.id, f] as [string, SchemaField])),
)

/** The lookup built on a schema map (the theme's sections and the install's own files). */
export function schemaLookup(schemas: SchemaMap | undefined): FieldLookup {
  return {
    sectionField: (type, key) => schemas?.[type]?.fields?.find((f) => f.id === key) ?? null,
    blockField: (type, blockType, key) => schemas?.[type]?.blocks?.find((b) => b.type === blockType)?.fields?.find((f) => f.id === key) ?? null,
    themeField: (key) => THEME_FIELDS.get(key) ?? null,
  }
}

const SEG = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,119}$/

/** A path as a target, or why it is not one. */
export function parsePath(path: string): PatchTarget | { error: string } {
  if (typeof path !== "string" || !path.startsWith("/")) return { error: "a path starts with /" }
  const p = path.split("/").slice(1)
  if (!p.every((s) => SEG.test(s))) return { error: "a path is made of plain names" }
  if (p[0] === "theme" && p.length === 2) return { kind: "theme", key: p[1] }
  if (p[0] !== "pages" || p[2] !== "sections" || p.length < 4) return { error: "the path names no page section (/pages/<page>/sections/<id>/...)" }
  const page = p[1]
  const section = p[3]
  if (p.length === 4) return { kind: "section", page, section }
  if (p.length === 5 && p[4] === "hidden") return { kind: "section-hidden", page, section }
  if (p.length === 6 && p[4] === "settings") return { kind: "section-setting", page, section, key: p[5] }
  if (p.length === 6 && p[4] === "blocks") return { kind: "block", page, section, block: p[5] }
  if (p.length === 8 && p[4] === "blocks" && p[6] === "settings") return { kind: "block-setting", page, section, block: p[5], key: p[7] }
  return { error: "the path names nothing a patch can change" }
}

export function sectionPath(page: string, id: string, ...rest: string[]): string {
  return ["", "pages", page, "sections", id, ...rest].join("/")
}

const SAFE_LINK = /^(\/[^\s]*|#[A-Za-z][\w:-]*|https:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d\s()-]+)$/i
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** The value, made exact for its field (a range snapped to its step), or why it does not fit. */
export function fitValue(field: SchemaField, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const opts = (field.options ?? []).map((o) => String((o as { value: unknown }).value))
  switch (field.type) {
    case "text":
    case "textarea":
    case "inline_richtext":
    case "header":
      return typeof value === "string" && value.length <= (field.type === "textarea" ? 2_000 : 400) && !/<\s*\/?\s*(script|iframe|object|embed|style)\b/i.test(value) ? { ok: true, value } : { ok: false, error: "plain text, not too long" }
    case "select":
    case "radio":
    case "alignment":
    case "font":
    case "font_picker":
      return opts.includes(String(value)) ? { ok: true, value: typeof value === "number" ? value : String(value) } : { ok: false, error: `one of ${opts.slice(0, 12).join(", ")}` }
    case "color_scheme":
      if (opts.length) return opts.includes(String(value)) ? { ok: true, value: String(value) } : { ok: false, error: `one of ${opts.join(", ")}` }
      return typeof value === "string" && /^[a-z0-9_-]{1,40}$/i.test(value) ? { ok: true, value } : { ok: false, error: "a colour scheme's key" }
    case "range":
    case "number": {
      const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
      if (!Number.isFinite(n)) return { ok: false, error: "a number" }
      if (typeof field.min === "number" && n < field.min) return { ok: false, error: `at least ${field.min}` }
      if (typeof field.max === "number" && n > field.max) return { ok: false, error: `at most ${field.max}` }
      const step = typeof field.step === "number" && field.step > 0 ? field.step : 0
      const base = typeof field.min === "number" ? field.min : 0
      return { ok: true, value: step ? Math.round((Math.round((n - base) / step) * step + base) * 1e6) / 1e6 : n }
    }
    case "toggle":
    case "checkbox":
      return typeof value === "boolean" ? { ok: true, value } : { ok: false, error: "true or false" }
    case "color":
      return value === "" || (typeof value === "string" && HEX.test(value)) ? { ok: true, value } : { ok: false, error: "a #hex colour, or empty" }
    case "link":
    case "url":
      return value === "" || (typeof value === "string" && value.length <= 500 && SAFE_LINK.test(value.trim())) ? { ok: true, value: typeof value === "string" ? value.trim() : value } : { ok: false, error: "a page path, an https address, mailto: or tel:" }
    case "image":
    case "image_picker":
      return value === "" || (typeof value === "string" && /^https:\/\/[^\s"'<>]+$/i.test(value)) ? { ok: true, value } : { ok: false, error: "an https picture address, or empty" }
    default:
      return { ok: false, error: `a ${field.type} setting is not changed by a patch` }
  }
}

export interface PatchOutcome {
  site: SiteState
  /** The patches that were applied, in order. */
  applied: NativePatch[]
  /** The ones refused, each with why. */
  refused: { patch: NativePatch; reason: string }[]
  /** The editor's operations they became (for the job's log and the canvas). */
  ops: PageOp[]
}

/** One patch as the editor's operation, validated against the draft and its schemas; or why not. */
export function compilePatch(site: SiteState, patch: NativePatch, lookup: FieldLookup): { op: PageOp } | { error: string } {
  if (!patch || typeof patch !== "object" || !["set", "remove", "reorder"].includes((patch as { op?: string }).op ?? "")) return { error: "op is set, remove or reorder" }
  const target = parsePath(patch.path)
  if ("error" in target) return target
  if (target.kind === "theme") {
    if (patch.op !== "set") return { error: "a Theme setting is set, not removed or moved" }
    const field = lookup.themeField(target.key)
    if (!field) return { error: `the theme has no setting "${target.key}"` }
    const fit = fitValue(field, patch.value)
    if (fit.ok === false) return { error: `${target.key}: ${fit.error}` }
    return { op: { page: "*", op: { kind: "update_theme", settings: { [target.key]: fit.value } } } }
  }
  const sections = site.pages[target.page]
  if (!sections) return { error: `there is no page "${target.page}"` }
  const section = sections.find((s) => s.id === target.section)
  if (!section) return { error: `the page has no section "${target.section}"` }
  const chrome = section.type === "header" || section.type === "footer"
  const op = (o: ThemeOp): { op: PageOp } => ({ op: { page: target.page, op: o } })
  switch (target.kind) {
    case "section":
      if (patch.op === "remove") return chrome ? { error: "the header and footer stay" } : op({ kind: "remove_section", id: section.id })
      if (patch.op === "reorder") {
        if (chrome) return { error: "the header and footer do not move" }
        if (!Number.isInteger(patch.to) || patch.to < 0 || patch.to >= sections.length) return { error: `to is a place on the page, 0 to ${sections.length - 1}` }
        return op({ kind: "move_section", id: section.id, index: patch.to })
      }
      return { error: "a section is removed or reordered; its settings are set" }
    case "section-hidden":
      if (patch.op !== "set" || typeof patch.value !== "boolean") return { error: "hidden is set to true or false" }
      if (chrome && patch.value) return { error: "the header and footer are not hidden by a review" }
      return op({ kind: "set_section_visibility", id: section.id, hidden: patch.value })
    case "section-setting": {
      const field = lookup.sectionField(section.type, target.key)
      if (!field) return { error: `${section.type} has no setting "${target.key}"` }
      if (patch.op === "remove") return op({ kind: "update_section", id: section.id, settings: {}, unset: [target.key] })
      if (patch.op !== "set") return { error: "a setting is set or removed" }
      const fit = fitValue(field, patch.value)
      if (fit.ok === false) return { error: `${target.key}: ${fit.error}` }
      return op({ kind: "update_section", id: section.id, settings: { [target.key]: fit.value } })
    }
    case "block": {
      const blocks = section.blocks ?? []
      const block = blocks.find((b) => b.id === target.block)
      if (!block) return { error: `the section has no block "${target.block}"` }
      if (block.static) return { error: "a block its template places is edited, never moved or removed" }
      if (patch.op === "remove") return op({ kind: "remove_block", sectionId: section.id, blockId: block.id })
      if (patch.op === "reorder") {
        if (!Number.isInteger(patch.to) || patch.to < 0 || patch.to >= blocks.length) return { error: `to is a place in the section, 0 to ${blocks.length - 1}` }
        return op({ kind: "move_block", sectionId: section.id, blockId: block.id, index: patch.to })
      }
      return { error: "a block is removed or reordered; its settings are set" }
    }
    case "block-setting": {
      const block = (section.blocks ?? []).find((b) => b.id === target.block)
      if (!block) return { error: `the section has no block "${target.block}"` }
      const field = lookup.blockField(section.type, block.type, target.key)
      if (!field) return { error: `a ${block.type} block has no setting "${target.key}"` }
      /* A block's setting has no "unset": back to its declared default. */
      const value = patch.op === "remove" ? (field.default ?? (field.type === "toggle" || field.type === "checkbox" ? false : "")) : patch.op === "set" ? patch.value : undefined
      if (patch.op === "reorder") return { error: "a setting is set or removed" }
      const fit = fitValue(field, value)
      if (fit.ok === false) return { error: `${target.key}: ${fit.error}` }
      return op({ kind: "update_block", sectionId: section.id, blockId: block.id, settings: { [target.key]: fit.value } })
    }
  }
}

/**
 * Apply the patches in order to the draft. Each is validated against the draft as it stands after the ones
 * before it; a refused one changes nothing and the rest still apply. Pure.
 */
export function applyPatches(site: SiteState, patches: NativePatch[], lookup: FieldLookup, schemas?: SchemaMap): PatchOutcome {
  let current = site
  const applied: NativePatch[] = []
  const refused: PatchOutcome["refused"] = []
  const ops: PageOp[] = []
  for (const patch of patches.slice(0, 40)) {
    const c = compilePatch(current, patch, lookup)
    if ("error" in c) {
      refused.push({ patch, reason: c.error })
      continue
    }
    const r = applySiteOps(current, [c.op], schemas)
    if (!r.applied.length) {
      refused.push({ patch, reason: "it would change nothing" })
      continue
    }
    current = r.site
    applied.push(patch)
    ops.push(...r.applied)
  }
  return { site: current, applied, refused, ops }
}

/** A section of the draft by id, with its page. */
export function findSection(site: SiteState, id: string): { page: string; section: SectionInstance; index: number } | null {
  for (const [page, sections] of Object.entries(site.pages)) {
    const index = sections.findIndex((s) => s.id === id)
    if (index >= 0) return { page, section: sections[index], index }
  }
  return null
}
