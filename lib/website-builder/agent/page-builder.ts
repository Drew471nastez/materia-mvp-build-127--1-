/**
 * ===========================================================================
 *  A WHOLE PAGE, BUILT IN ONE CALL, ON A PAGE THE CREATOR DOES NOT HAVE OPEN
 * ===========================================================================
 * "Build a full website for my clothing brand" asks for a site: a shop, a
 * product page, an about page, a contact page, a FAQ, the policies. The
 * builder's assistant worked on ONE page, the one open in the editor, and
 * streamed its changes into it, so it could make the home page rich and say
 * nothing true about the rest. A site of one page is not what was asked for.
 *
 * The open page still changes the way it always has: operations streamed
 * into the editor's unsaved state, kept or undone with the rest of the run.
 * Every OTHER page is written here, as a draft, the way a connected agent's
 * create_page is (lib/agent-access/project.ts): the editor loads a page's
 * sections from the server each time it opens one, and saves only the page
 * it has open, so a draft written for another page is what the creator sees
 * when they go to it, and nothing it holds is saved over it.
 *
 * This file is the pure half: a list of sections (each with its settings and
 * its blocks, nested blocks too) turned into the checked operations a page
 * goes through, against the schemas, with the same checker a connected agent
 * is held to (lib/agent-access/page-ops.ts checkOp) and the same applier the
 * editor uses (./operations.ts applyOp). A refused section says why and
 * nothing is written. The server half is ./page-builder-server.ts.
 */

import { checkOp, mintId, type PageOpInput } from "@/lib/agent-access/page-ops"
import { applyOp, type ThemeOp, type ThemeState } from "./operations"
import type { SchemaMap } from "./schemas"
import { BUILT_IN_PAGE_KEYS, pageKeyFromSegment } from "@/lib/website-builder/site-pages"
import { toPageSlug } from "@/lib/sites/slug"

/**
 * What the loop is handed to reach the site's other pages, implemented on the
 * server (./page-builder-server.ts). Declared here so the loop imports a type
 * from a pure file, never a server-only module.
 */
export interface SitePageTools {
  list(): Promise<string>
  build(
    args: { page?: unknown; title?: unknown; sections?: unknown; replace?: unknown },
    schemas: SchemaMap,
  ): Promise<{ ok: boolean; text: string; key?: string; title?: string; created?: boolean }>
}

export interface PageBlockInput {
  type: string
  settings?: Record<string, unknown>
  blocks?: PageBlockInput[]
}

export interface PageSectionInput {
  type: string
  /** The name the sidebar shows, when the type's own name would not say what this one is. */
  name?: string
  settings?: Record<string, unknown>
  blocks?: PageBlockInput[]
}

/**
 * THE SECTION A STORE PAGE IS FOR. A product page without its product, an
 * account page without the account, is broken however good the rest of it
 * is, so a rebuild keeps these and builds around them.
 */
export function isPageEssential(type: string): boolean {
  return type === "product" || type === "not_found" || type === "page_content" || type.startsWith("main_")
}

/** Sections a page built in one call may hold, header and footer apart. More is two pages. */
export const MAX_PAGE_SECTIONS = 16
/** Operations one page may take: a full page of filled sections, with room, and a stop for a runaway. */
export const MAX_PAGE_OPS = 400
/** How deep blocks nest when given as a tree here, as the editor allows. */
const MAX_DEPTH = 3

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export type PagePlan =
  | { ok: true; ops: ThemeOp[]; state: ThemeState; notes: string[]; created: string[]; kept: string[] }
  | { ok: false; error: string }

/**
 * The sections the model sent, read loosely and checked strictly: a string
 * type and optional settings, name and blocks per section. Anything else is
 * an error that names the section, so the next call can fix that one.
 */
export function readPageSections(raw: unknown): { sections: PageSectionInput[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "sections is a non-empty list: [{ \"type\": \"hero_split\", \"settings\": {…}, \"blocks\": [{ \"type\": \"…\", \"settings\": {…} }] }]." }
  if (raw.length > MAX_PAGE_SECTIONS) return { error: `A page built at once takes at most ${MAX_PAGE_SECTIONS} sections. Split it into two pages, or build it in two calls.` }
  const sections: PageSectionInput[] = []
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]
    if (!isObj(s) || typeof s.type !== "string" || !s.type.trim()) return { error: `Section ${i + 1} needs a "type".` }
    if (s.settings !== undefined && !isObj(s.settings)) return { error: `Section ${i + 1} (${s.type}): settings is an object of setting id to value.` }
    if (s.blocks !== undefined && !Array.isArray(s.blocks)) return { error: `Section ${i + 1} (${s.type}): blocks is a list.` }
    sections.push({
      type: s.type.trim(),
      ...(typeof s.name === "string" && s.name.trim() ? { name: s.name.replace(/\s+/g, " ").trim().slice(0, 60) } : {}),
      ...(isObj(s.settings) ? { settings: s.settings } : {}),
      ...(Array.isArray(s.blocks) ? { blocks: s.blocks as PageBlockInput[] } : {}),
    })
  }
  return { sections }
}

/**
 * The page's operations, in order: when `replace`, every section that is not
 * the header, the footer or the page's essential one is removed first; then
 * each section is added at the end of the body with its settings, renamed
 * when named, and filled with its blocks (and their blocks).
 *
 * Every operation is checked against the page as the ones before it left it,
 * so a block names the section that was minted for it a moment earlier.
 * `mint` is injectable so a test can predict ids.
 */
export function planPage(
  start: ThemeState,
  sections: PageSectionInput[],
  schemas: SchemaMap,
  opts: { replace?: boolean; mint?: (prefix: string) => string } = {},
): PagePlan {
  const mint = opts.mint ?? mintId
  let state = start
  const ops: ThemeOp[] = []
  const notes: string[] = []
  const created: string[] = []
  const kept: string[] = []

  const run = (input: PageOpInput, where: string): { ok: true; op: ThemeOp } | { ok: false; error: string } => {
    if (ops.length >= MAX_PAGE_OPS) return { ok: false, error: `This page took more than ${MAX_PAGE_OPS} changes at once. Build it in two calls.` }
    const r = checkOp(state, input, schemas, mint)
    if (!r.op) return { ok: false, error: `${where}: ${r.error ?? "refused"}` }
    state = applyOp(state, r.op, schemas)
    ops.push(r.op)
    if (r.note) notes.push(`${where}: ${r.note}`)
    return { ok: true, op: r.op }
  }

  if (opts.replace) {
    for (const s of start.sections) {
      if (s.type === "header" || s.type === "footer") continue
      if (isPageEssential(s.type)) {
        kept.push(s.id)
        continue
      }
      const r = run({ op: "remove_section", section_id: s.id }, `Removing [${s.id}]`)
      if (r.ok === false) return { ok: false, error: r.error }
    }
  }

  const addBlocks = (sectionId: string, blocks: PageBlockInput[] | undefined, parent: string | null, depth: number, where: string): { ok: true } | { ok: false; error: string } => {
    if (!blocks?.length) return { ok: true }
    if (depth > MAX_DEPTH) return { ok: false, error: `${where}: blocks nest ${MAX_DEPTH} deep at most.` }
    for (let j = 0; j < blocks.length; j++) {
      const b = blocks[j]
      const at = `${where}, block ${j + 1}`
      if (!isObj(b) || typeof b.type !== "string" || !b.type.trim()) return { ok: false, error: `${at} needs a "type".` }
      if (b.settings !== undefined && !isObj(b.settings)) return { ok: false, error: `${at} (${b.type}): settings is an object.` }
      const r = run(
        { op: "add_block", section_id: sectionId, block_type: b.type.trim(), ...(b.settings ? { settings: b.settings } : {}), ...(parent ? { parent_block_id: parent } : {}) },
        `${at} (${b.type})`,
      )
      if (r.ok === false) return { ok: false, error: r.error }
      const op = r.op as Extract<ThemeOp, { kind: "add_block" }>
      const path = parent ? `${parent}/${op.blockId}` : op.blockId
      if (Array.isArray(b.blocks) && b.blocks.length) {
        const inner = addBlocks(sectionId, b.blocks, path, depth + 1, at)
        if (inner.ok === false) return { ok: false, error: inner.error }
      }
    }
    return { ok: true }
  }

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    const where = `Section ${i + 1} (${s.type})`
    const added = run({ op: "add_section", section_type: s.type, ...(s.settings ? { settings: s.settings } : {}) }, where)
    if (added.ok === false) return { ok: false, error: added.error }
    const id = (added.op as Extract<ThemeOp, { kind: "add_section" }>).id
    created.push(id)
    if (s.name) {
      const named = run({ op: "rename_section", section_id: id, name: s.name }, where)
      if (named.ok === false) return { ok: false, error: named.error }
    }
    /*
      THE PRESET'S SAMPLE BLOCKS GO when the section's own are given: a FAQ
      arrives with three sample questions, and the six real ones added after
      them made nine, three of them placeholders. A static block is placed by
      the template and stays.
    */
    if (s.blocks?.length) {
      const fresh = state.sections.find((x) => x.id === id)
      for (const b of (fresh?.blocks ?? []).filter((x) => !x.static)) {
        const cleared = run({ op: "remove_block", section_id: id, block_id: b.id }, `${where}, sample block`)
        if (cleared.ok === false) return { ok: false, error: cleared.error }
      }
    }
    const filled = addBlocks(id, s.blocks, null, 1, where)
    if (filled.ok === false) return { ok: false, error: filled.error }
  }

  return { ok: true, ops, state, notes, created, kept }
}

/**
 * The page a call names: a built-in page by its key ("about", "contact",
 * "products", "product", "collections", "search", "404"), an existing page by
 * its key, or a new one from its title. "shop" is the shop. Null when it makes
 * no usable address.
 */
export function pageKeyFor(page: unknown, title: unknown): string | null {
  const raw = typeof page === "string" && page.trim() ? page : typeof title === "string" ? title : ""
  const k = raw.trim().toLowerCase().replace(/^\//, "")
  if (!k) return null
  if (k === "home" || BUILT_IN_PAGE_KEYS.has(k)) return k
  if (k === "shop") return "products"
  const slug = toPageSlug(k.replace(/^pages\//, ""))
  return slug && pageKeyFromSegment(slug) !== null ? slug : null
}
