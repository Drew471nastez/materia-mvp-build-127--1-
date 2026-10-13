/**
 * ===========================================================================
 *  PAGE CHANGES FROM A CONNECTED AGENT, CHECKED BEFORE ANYTHING IS WRITTEN
 * ===========================================================================
 * Claude Code or Codex over MCP changes a page with the same operations
 * Storelib AI streams to the builder (lib/website-builder/agent/operations
 * .ts): add_section, update_section, add_block and the rest, applied by the
 * same `applyOps`. One vocabulary, one applier, so a change an outside agent
 * makes is a change the builder already knows how to replay.
 *
 * WHAT THIS FILE DECIDES is whether a batch may be applied at all. Every
 * operation is checked against the page as it will be after the ones before
 * it, and against the section's own schema, with the same `checkSettings`
 * the builder's assistant is held to: a setting id the section does not
 * declare, or a value its control cannot take, is refused with the list of
 * what it does take. The renderer would ignore either silently, which is how
 * "it said it changed it and nothing moved" happens.
 *
 * ALL OR NOTHING. The first operation that fails refuses the batch, and
 * nothing is written. Half a patch is a page nobody asked for.
 *
 * IDS ARE MINTED HERE, never taken from the agent, so an agent cannot name
 * a section into an id that is already somebody else's on the page.
 *
 * Pure: no database, no request. tests/agent-mcp.test.ts drives it.
 */

import { blockAt, countAll, resolvePath } from "@/lib/website-builder/block-tree"
import { addableBlocks, themeBlockCatalog } from "@/lib/website-builder/storelib-schemas"
import {
  applyOp,
  blockFieldsFor,
  blockSpecs,
  checkSettings,
  fieldsFor,
  maxBlocks,
  themeFieldsFor,
  type ThemeOp,
  type ThemeState,
} from "@/lib/website-builder/agent/operations"
import { schemaOf, type SchemaMap } from "@/lib/website-builder/agent/schemas"
import { themeExtraFields, typographyWrite } from "@/lib/website-builder/agent/theme-extras"
import { tabSwitchUpgrade } from "@/lib/website-builder/section-anchors"
import { LIMITS, MAX_BLOCK_DEPTH } from "@/lib/storelib-theme/types"

/** What an agent sends: an operation with settings as objects, ids its own. */
export type PageOpInput =
  | { op: "add_section"; section_type: string; index?: number; settings?: Record<string, unknown> }
  | { op: "update_section"; section_id: string; settings: Record<string, unknown> }
  | { op: "move_section"; section_id: string; index: number }
  | { op: "remove_section"; section_id: string }
  | { op: "rename_section"; section_id: string; name: string }
  | { op: "set_section_visibility"; section_id: string; hidden: boolean }
  | { op: "add_block"; section_id: string; block_type: string; index?: number; settings?: Record<string, unknown>; parent_block_id?: string }
  | { op: "update_block"; section_id: string; block_id: string; settings: Record<string, unknown> }
  | { op: "move_block"; section_id: string; block_id: string; index: number }
  | { op: "remove_block"; section_id: string; block_id: string }
  | { op: "update_theme"; settings: Record<string, unknown> }

export const PAGE_OP_NAMES = [
  "add_section",
  "update_section",
  "move_section",
  "remove_section",
  "rename_section",
  "set_section_visibility",
  "add_block",
  "update_block",
  "move_block",
  "remove_block",
  "update_theme",
] as const

/** A batch larger than this is a rewrite, and a rewrite is a new page. */
export const MAX_OPS_PER_BATCH = 60

export type OpsCheck =
  | { ok: true; ops: ThemeOp[]; state: ThemeState; notes: string[]; created: string[] }
  | { ok: false; error: string; at: number }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === "string" ? v : "")

/** Short, unguessable enough to never collide on one page, and readable. */
export function mintId(prefix: string): string {
  const safe = prefix.replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "item"
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  return `${safe}-${rand}`
}

function sectionList(state: ThemeState): string {
  return state.sections.map((s) => `[${s.id}] ${s.type}`).join(", ") || "none"
}

/**
 * Check one operation against the page as it stands. Returns the ThemeOp to
 * apply, or why not. `mint` is injectable so a test can predict ids.
 */
export function checkOp(
  state: ThemeState,
  input: unknown,
  schemas: SchemaMap,
  mint: (prefix: string) => string = mintId,
): { op?: ThemeOp; error?: string; note?: string } {
  if (!isObj(input)) return { error: "Each operation is an object with an `op` field." }
  const kind = str(input.op)
  const sectionId = str(input.section_id)
  const found = state.sections.find((s) => s.id === sectionId)
  const notFound = () => ({ error: `There is no section "${sectionId}" on this page. The sections are: ${sectionList(state)}` })
  const settingsOf = (v: unknown) => (isObj(v) ? v : null)

  switch (kind) {
    case "add_section": {
      const type = str(input.section_type)
      if (!schemaOf(schemas, type)) return { error: `There is no section type "${type}". storelib_search_components lists them.` }
      if (type === "header" || type === "footer") return { error: `A page already has its ${type}; it is shared by every page.` }
      if (state.sections.length >= LIMITS.sectionsPerTemplate) {
        return { error: `A page holds ${LIMITS.sectionsPerTemplate} sections and this one is full.` }
      }
      let settings: Record<string, unknown> | undefined
      let note: string | undefined
      if (input.settings !== undefined) {
        const raw = settingsOf(input.settings)
        if (!raw) return { error: "settings is an object of setting id to value." }
        const checked = checkSettings(fieldsFor(type, schemas), raw, type)
        if (checked.error) return { error: checked.error }
        settings = checked.settings
        note = checked.notes.join("; ") || undefined
      }
      const index = typeof input.index === "number" && Number.isFinite(input.index) ? input.index : undefined
      return { op: { kind: "add_section", id: mint(type), sectionType: type, index, settings }, note }
    }

    case "update_section": {
      if (!found) return notFound()
      const raw = settingsOf(input.settings)
      if (!raw || Object.keys(raw).length === 0) return { error: "settings is a non-empty object of setting id to value." }
      const checked = checkSettings(fieldsFor(found.type, schemas), raw, found.type)
      if (checked.error) return { error: checked.error }
      /* A tabs section saved before `tab_animation`: the write carries its switch under the new name (section-anchors tabSwitchUpgrade). */
      const upgraded = tabSwitchUpgrade(found, checked.settings!)
      return { op: { kind: "update_section", id: found.id, settings: upgraded.settings, ...(upgraded.unset.length ? { unset: upgraded.unset } : {}) }, note: checked.notes.join("; ") || undefined }
    }

    case "move_section": {
      if (!found) return notFound()
      if (found.type === "header" || found.type === "footer") return { error: `The ${found.type} stays where it is on every page.` }
      if (typeof input.index !== "number" || !Number.isFinite(input.index)) return { error: "index is a number." }
      return { op: { kind: "move_section", id: found.id, index: input.index } }
    }

    case "remove_section": {
      if (!found) return notFound()
      if (found.type === "header" || found.type === "footer") return { error: `The ${found.type} cannot be removed.` }
      return { op: { kind: "remove_section", id: found.id } }
    }

    case "rename_section": {
      if (!found) return notFound()
      const name = str(input.name).replace(/\s+/g, " ").trim().slice(0, 60)
      if (!name) return { error: "name is a short label." }
      return { op: { kind: "rename_section", id: found.id, name } }
    }

    case "set_section_visibility": {
      if (!found) return notFound()
      if (typeof input.hidden !== "boolean") return { error: "hidden is true or false." }
      if (found.type === "header" || found.type === "footer") return { error: `The ${found.type} cannot be hidden from here.` }
      return { op: { kind: "set_section_visibility", id: found.id, hidden: input.hidden } }
    }

    case "add_block": {
      if (!found) return notFound()
      const blockType = str(input.block_type)
      /* Inside another block (a group) when parent_block_id names one, by path or id. */
      const parentKey = str(input.parent_block_id)
      const parentPath = parentKey ? resolvePath(found.blocks, parentKey) : []
      if (!parentPath) return { error: `${found.type} has no block "${parentKey}" to add inside.` }
      const parentBlock = parentPath.length ? blockAt(found.blocks, parentPath)?.block ?? null : null
      const catalog = themeBlockCatalog()
      const specs = parentBlock ? addableBlocks({ accepts: catalog[parentBlock.type]?.accepts }, catalog) : blockSpecs(found.type, schemas)
      if (!specs.some((b) => b.type === blockType)) {
        return { error: `${parentBlock ? `A ${parentBlock.type} block` : found.type} does not take a "${blockType}" block. It takes: ${specs.map((b) => b.type).join(", ") || "no blocks"}.` }
      }
      const siblings = (parentBlock ? parentBlock.blocks : found.blocks) ?? []
      const count = siblings.filter((b) => !b.static).length
      const cap = Math.min((parentBlock ? catalog[parentBlock.type]?.max_blocks : maxBlocks(found.type, schemas)) ?? LIMITS.blocksPerSection, LIMITS.blocksPerSection)
      if (count >= cap) return { error: `${parentBlock ? `This ${parentBlock.type}` : found.type} takes at most ${cap} blocks and has ${count}.` }
      if (countAll(found.blocks) >= LIMITS.blocksPerSection) return { error: `A section holds ${LIMITS.blocksPerSection} blocks at every depth together, and this one is full.` }
      if (parentPath.length >= MAX_BLOCK_DEPTH) return { error: `Blocks nest ${MAX_BLOCK_DEPTH} deep at most.` }
      const raw = input.settings === undefined ? {} : settingsOf(input.settings)
      if (!raw) return { error: "settings is an object of setting id to value." }
      const fields = (specs.find((b) => b.type === blockType)?.fields ?? []).filter((f) => f.type !== "header" && f.type !== "paragraph")
      const checked = checkSettings(fields, raw, `a ${blockType} block`)
      if (checked.error) return { error: checked.error }
      const index = typeof input.index === "number" && input.index >= 0 ? input.index : undefined
      return {
        op: {
          kind: "add_block",
          sectionId: found.id,
          blockId: mint(blockType),
          blockType,
          index,
          settings: checked.settings!,
          ...(parentPath.length ? { parentId: parentPath.join("/") } : {}),
        },
        note: checked.notes.join("; ") || undefined,
      }
    }

    case "update_block":
    case "move_block":
    case "remove_block": {
      if (!found) return notFound()
      const blockId = str(input.block_id)
      const path = resolvePath(found.blocks, blockId)
      const block = path ? blockAt(found.blocks, path)?.block : undefined
      if (!block || !path) {
        return { error: `${found.type} has no block "${blockId}". Its blocks: ${(found.blocks ?? []).map((b) => `[${b.id}] ${b.type}`).join(", ") || "none"}.` }
      }
      const key = path.join("/")
      if (kind === "remove_block") {
        if (block.static) return { error: `[${key}] is placed by the section's template. Change its settings, or hide it; it cannot be removed.` }
        return { op: { kind: "remove_block", sectionId: found.id, blockId: key } }
      }
      if (kind === "move_block") {
        if (typeof input.index !== "number" || !Number.isFinite(input.index)) return { error: "index is a number." }
        return { op: { kind: "move_block", sectionId: found.id, blockId: key, index: input.index } }
      }
      const raw = settingsOf(input.settings)
      if (!raw || Object.keys(raw).length === 0) return { error: "settings is a non-empty object of setting id to value." }
      const checked = checkSettings(blockFieldsFor(found.type, block.type, schemas), raw, `a ${block.type} block`)
      if (checked.error) return { error: checked.error }
      return { op: { kind: "update_block", sectionId: found.id, blockId: key, settings: checked.settings! }, note: checked.notes.join("; ") || undefined }
    }

    case "update_theme": {
      const raw = settingsOf(input.settings)
      if (!raw || Object.keys(raw).length === 0) return { error: "settings is a non-empty object of theme setting id to value." }
      /* The same theme settings the builder's assistant may write, the sidebar's own outside the schema included (website-builder/agent/theme-extras). */
      const rest = { ...raw }
      let typography: { value: Record<string, unknown>; notes: string[] } | null = null
      if (rest.typography_styles !== undefined) {
        const t = typographyWrite(state.settings as Record<string, unknown>, rest.typography_styles)
        if ("error" in t) return { error: t.error }
        typography = t
        delete rest.typography_styles
      }
      const checked = Object.keys(rest).length ? checkSettings([...themeFieldsFor(), ...themeExtraFields(state.settings as Record<string, unknown>)], rest, "The theme") : { settings: {}, notes: [] as string[] }
      if (checked.error) return { error: checked.error }
      const settings = { ...checked.settings!, ...(typography ? { typography_styles: typography.value } : {}) }
      const notes = [...checked.notes, ...(typography?.notes ?? [])]
      return { op: { kind: "update_theme", settings }, note: notes.join("; ") || undefined }
    }

    default:
      return { error: `Unknown op "${kind}". The ops are: ${PAGE_OP_NAMES.join(", ")}.` }
  }
}

/**
 * Check a whole batch, each operation against the page as the ones before it
 * left it. The state that comes back is what will be written.
 */
export function checkOps(
  start: ThemeState,
  inputs: unknown,
  schemas: SchemaMap,
  mint: (prefix: string) => string = mintId,
): OpsCheck {
  if (!Array.isArray(inputs) || inputs.length === 0) return { ok: false, error: "ops is a non-empty list of operations.", at: -1 }
  if (inputs.length > MAX_OPS_PER_BATCH) {
    return { ok: false, error: `At most ${MAX_OPS_PER_BATCH} operations at once. Split the change.`, at: -1 }
  }
  let state = start
  const ops: ThemeOp[] = []
  const notes: string[] = []
  const created: string[] = []
  for (let i = 0; i < inputs.length; i++) {
    const r = checkOp(state, inputs[i], schemas, mint)
    if (!r.op) return { ok: false, error: `Operation ${i + 1}: ${r.error ?? "refused"}\nNothing was changed.`, at: i }
    state = applyOp(state, r.op, schemas)
    ops.push(r.op)
    if (r.note) notes.push(`${i + 1}: ${r.note}`)
    if (r.op.kind === "add_section") created.push(r.op.id)
  }
  return { ok: true, ops, state, notes, created }
}

/** Whether a batch touches the page, the theme, or both. */
export function opsScope(ops: ThemeOp[]): { page: boolean; theme: boolean } {
  return {
    page: ops.some((o) => o.kind !== "update_theme"),
    theme: ops.some((o) => o.kind === "update_theme"),
  }
}
