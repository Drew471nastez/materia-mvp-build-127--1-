/**
 * ===========================================================================
 *  COPY AND PASTE A SECTION, ITS SETTINGS, OR A BLOCK
 * ===========================================================================
 * What the builder's Copy section, Copy settings and Copy block put on the
 * clipboard, and what Paste reads back. One slot, like the system clipboard:
 * the last thing copied. It is kept in this browser per creator account
 * (components/website-builder/editor/use-section-clipboard.ts) and written to
 * the system clipboard as JSON with a marker, so it survives a page change, a
 * reload and a switch to another theme of the same account, and Cmd/Ctrl+V
 * finds it.
 *
 *   A SECTION   everything it is: its type, name, the name the creator gave
 *               it, every setting (pictures and styling are settings), its
 *               blocks at every depth in their order, hidden or not, and for
 *               a section drawn from the creator's own file, that file, so a
 *               theme without it can be offered the file too.
 *   SETTINGS    the section's settings and its type, with the type of each
 *               setting its schema declares.
 *   A BLOCK     the block and everything inside it.
 *
 * Pasted, everything gets new ids (the section's and every block's), so a
 * paste is never the same section or block in two places. A static block
 * inside keeps its id, as Duplicate does: its template finds it by that id.
 *
 * Text read from the clipboard is untrusted: decodeClip takes only what has
 * the shape of a copy, within limits, and every save checks it again.
 *
 * Pure. Tested in tests/section-actions-v.test.ts.
 */
import { cloneTree, countAll, depthOf } from "./block-tree"
import { blockRoom } from "./block-room"
import { LIMITS, MAX_BLOCK_DEPTH } from "@/lib/storelib-theme/types"
import type { BlockInstance, SectionInstance } from "./types"

export const CLIP_MARK = "storelib/clipboard"
export const CLIP_VERSION = 1
/** A copy bigger than this is not a section somebody copied. */
export const CLIP_MAX_CHARS = 1_500_000

const TYPE = /^[a-z0-9][a-z0-9_-]{0,63}$/i
/* A block's type also starts with _ (a theme's private block) or @ (@app), or is an app block's address. */
const BLOCK_TYPE = /^[@_a-z0-9][a-z0-9_@\-/:.]{0,255}$/i
const CODE_PATH = /^sections\/[a-z0-9][a-z0-9_-]{0,63}\.storelib$/

export interface ClipBase {
  mark: typeof CLIP_MARK
  v: typeof CLIP_VERSION
  /** The creator account it was copied in. A copy from another account is not pasted. */
  owner: string | null
  /** When, in ms. */
  at: number
  /** The theme and page it came from: a paste back onto the same page is still a new section. */
  from: { installId: string; page: string }
}

export interface CopiedSection {
  type: string
  name: string
  label?: string
  settings: Record<string, unknown>
  blocks: BlockInstance[]
  hidden?: boolean
}

export interface SectionClip extends ClipBase {
  kind: "section"
  /** What the section's code calls it, for the words in a menu. */
  typeName: string
  /** Each setting's type, from the schema it was copied under. */
  fieldTypes: Record<string, string>
  section: CopiedSection
  /** The creator's own file it is drawn from, when it is. */
  code?: { path: string; source: string }
}

export interface SettingsClip extends ClipBase {
  kind: "settings"
  type: string
  typeName: string
  fieldTypes: Record<string, string>
  settings: Record<string, unknown>
}

export interface BlockClip extends ClipBase {
  kind: "block"
  /** The section type it came from, and the block's own name. */
  sectionType: string
  blockName: string
  block: BlockInstance
}

export type Clip = SectionClip | SettingsClip | BlockClip

interface CopyContext {
  owner: string | null
  from: { installId: string; page: string }
  now?: number
}

const deep = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const base = (ctx: CopyContext): ClipBase => ({ mark: CLIP_MARK, v: CLIP_VERSION, owner: ctx.owner, at: ctx.now ?? Date.now(), from: { ...ctx.from } })
const typesOf = (fields: readonly { id: string; type: string }[] | undefined): Record<string, string> =>
  Object.fromEntries((fields ?? []).map((f) => [f.id, f.type]))

/* ── Copy ─────────────────────────────────────────────────────────────── */

export function copySection(
  section: SectionInstance,
  ctx: CopyContext & { typeName: string; fields?: readonly { id: string; type: string }[]; code?: { path: string; source: string } | null },
): SectionClip {
  const s = deep(section)
  const out: SectionClip = {
    ...base(ctx),
    kind: "section",
    typeName: ctx.typeName,
    fieldTypes: typesOf(ctx.fields),
    section: {
      type: s.type,
      name: s.name,
      ...(s.label ? { label: s.label } : {}),
      settings: s.settings ?? {},
      blocks: s.blocks ?? [],
      ...(s.hidden ? { hidden: true } : {}),
    },
  }
  if (ctx.code && CODE_PATH.test(ctx.code.path) && ctx.code.source.length < CLIP_MAX_CHARS / 2) out.code = { path: ctx.code.path, source: ctx.code.source }
  return out
}

export function copySettings(section: SectionInstance, ctx: CopyContext & { typeName: string; fields?: readonly { id: string; type: string }[] }): SettingsClip {
  return { ...base(ctx), kind: "settings", type: section.type, typeName: ctx.typeName, fieldTypes: typesOf(ctx.fields), settings: deep(section.settings ?? {}) }
}

export function copyBlock(sectionType: string, block: BlockInstance, ctx: CopyContext & { blockName: string }): BlockClip {
  const b = deep(block)
  /* It arrives as a block of its own wherever it is pasted: placed by nobody's template. */
  delete b.static
  return { ...base(ctx), kind: "block", sectionType, blockName: ctx.blockName, block: b }
}

/* ── The text on the clipboard ────────────────────────────────────────── */

export function encodeClip(clip: Clip): string {
  return JSON.stringify(clip)
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const isText = (v: unknown, max = 200): v is string => typeof v === "string" && v.length <= max

function readBlocks(list: unknown, depth: number, count: { n: number }): BlockInstance[] | null {
  if (list === undefined) return []
  if (!Array.isArray(list)) return null
  if (depth > MAX_BLOCK_DEPTH) return null
  const out: BlockInstance[] = []
  /*
    ONE ODD BLOCK NEVER LOSES THE COPY. A block this cannot read (no id, a
    type that is not a type) is left out and the rest of the section is
    kept; settings that are not an object arrive as none. Refusing the whole
    copy over one block made Copy say "Copied" and Paste find nothing.
  */
  for (const item of list) {
    if (!isRecord(item)) continue
    if (!isText(item.id, 400) || !item.id || !isText(item.type, 256) || !BLOCK_TYPE.test(item.type)) continue
    count.n += 1
    if (count.n > LIMITS.blocksPerSection) break
    const kids = depth >= MAX_BLOCK_DEPTH ? [] : readBlocks(Array.isArray(item.blocks) ? item.blocks : undefined, depth + 1, count) ?? []
    const b: BlockInstance = { id: item.id, type: item.type, settings: isRecord(item.settings) ? item.settings : {} }
    if (item.hidden === true) b.hidden = true
    if (item.static === true) b.static = true
    if (kids.length) b.blocks = kids
    out.push(b)
  }
  return out
}

function readFieldTypes(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, t] of Object.entries(v)) if (typeof t === "string" && k.length <= 128) out[k] = t
  return out
}

/** A copy, or null for anything that is not one: plain text, another app's JSON, a copy too big or malformed. */
export function decodeClip(text: string | null | undefined): Clip | null {
  if (typeof text !== "string" || text.length > CLIP_MAX_CHARS || !text.includes(CLIP_MARK)) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.mark !== CLIP_MARK || raw.v !== CLIP_VERSION) return null
  const from = isRecord(raw.from) && isText(raw.from.installId) && isText(raw.from.page) ? { installId: raw.from.installId, page: raw.from.page } : null
  if (!from) return null
  const head: ClipBase = {
    mark: CLIP_MARK,
    v: CLIP_VERSION,
    owner: isText(raw.owner) ? raw.owner : null,
    at: typeof raw.at === "number" && Number.isFinite(raw.at) ? raw.at : 0,
    from,
  }
  if (raw.kind === "section") {
    const s = raw.section
    if (!isRecord(s) || !isText(s.type, 64) || !TYPE.test(s.type)) return null
    const blocks = readBlocks(Array.isArray(s.blocks) ? s.blocks : undefined, 1, { n: 0 }) ?? []
    const section: CopiedSection = { type: s.type, name: isText(s.name, 256) ? s.name : s.type, settings: isRecord(s.settings) ? s.settings : {}, blocks }
    if (typeof s.label === "string" && s.label.trim()) section.label = s.label.slice(0, 80)
    if (s.hidden === true) section.hidden = true
    const clip: SectionClip = { ...head, kind: "section", typeName: isText(raw.typeName) ? raw.typeName : s.type, fieldTypes: readFieldTypes(raw.fieldTypes), section }
    const code = raw.code
    if (isRecord(code) && isText(code.path) && CODE_PATH.test(code.path) && typeof code.source === "string" && code.source.length < CLIP_MAX_CHARS) {
      clip.code = { path: code.path, source: code.source }
    }
    return clip
  }
  if (raw.kind === "settings") {
    if (!isText(raw.type, 64) || !TYPE.test(raw.type) || !isRecord(raw.settings)) return null
    return { ...head, kind: "settings", type: raw.type, typeName: isText(raw.typeName) ? raw.typeName : raw.type, fieldTypes: readFieldTypes(raw.fieldTypes), settings: raw.settings }
  }
  if (raw.kind === "block") {
    if (!isText(raw.sectionType, 64)) return null
    const list = readBlocks([raw.block], 1, { n: 0 })
    if (!list || list.length !== 1) return null
    const block = list[0]
    delete block.static
    return { ...head, kind: "block", sectionType: raw.sectionType, blockName: isText(raw.blockName) ? raw.blockName : block.type, block }
  }
  return null
}

/* ── Paste ────────────────────────────────────────────────────────────── */

export interface Mint {
  section: (type: string) => string
  block: (type: string) => string
}

/** The copied section as a new one: new ids everywhere, everything else as it was copied. */
export function sectionFromClip(clip: SectionClip, mint: Mint): SectionInstance {
  const s = deep(clip.section)
  const out: SectionInstance = {
    id: mint.section(s.type),
    type: s.type,
    name: s.name,
    settings: s.settings,
    blocks: (s.blocks ?? []).map((b) => cloneTree(b, mint.block)),
  }
  if (s.label) out.label = s.label
  if (s.hidden) out.hidden = true
  return out
}

/** The copied block as a new one, its own blocks new too. */
export function blockFromClip(clip: BlockClip, mint: Mint): BlockInstance {
  const b = deep(clip.block)
  delete b.static
  return cloneTree(b, mint.block)
}

export type Check = { ok: true } | { ok: false; reason: string }

const article = (name: string) => (/^[aeiou]/i.test(name) ? "an" : "a")

/** The words for a copy, in a menu: "a Hero", "an Image banner". */
export function clipNoun(clip: Clip): string {
  if (clip.kind === "block") return `${article(clip.blockName)} ${clip.blockName} block`
  return `${article(clip.typeName)} ${clip.typeName}`
}

/**
 * Whether the copied section can go on this page, and whether its file has
 * to come with it. A type the theme has is pasted as it is. A type it lacks
 * comes with its file when the copy carries one; otherwise there is nothing
 * to draw it with.
 */
export function pasteSectionCheck(
  clip: Clip | null,
  target: { hasType: (type: string) => boolean },
): { ok: true; needsCode: boolean } | { ok: false; reason: string } {
  if (!clip) return { ok: false, reason: "Copy a section first" }
  if (clip.kind === "settings") return { ok: false, reason: "Settings are copied, not a section" }
  if (clip.kind === "block") return { ok: false, reason: "A block is copied, not a section" }
  if (clip.section.type === "header" || clip.section.type === "footer") return { ok: false, reason: `A site has one ${clip.section.type}` }
  if (target.hasType(clip.section.type)) return { ok: true, needsCode: false }
  if (clip.code) return { ok: true, needsCode: true }
  return { ok: false, reason: `${clip.typeName} isn't in this theme` }
}

/** Which copied settings a different type of section would take: the ids its schema has, of the same kind. */
export interface SettingsPlan {
  /** The same type: every setting is replaced by the copy. */
  same: boolean
  next: Record<string, unknown>
  /** What changes, by the label the target's panel shows. */
  changes: { id: string; label: string }[]
}

/**
 * PASTE SETTINGS. Onto a section of the same type, the copy replaces every
 * setting. Onto another type, only what both share: a setting id the
 * target's schema declares with the same type of field, and the styling
 * every section has beside its schema (scheme, type styles, animation),
 * which neither schema declares. Nothing in common, and the menu says what
 * the copy is for instead.
 */
export function pasteSettingsPlan(
  clip: Clip | null,
  target: { type: string; settings: Record<string, unknown>; fields: readonly { id: string; label: string; type: string }[] },
): ({ ok: true } & SettingsPlan) | { ok: false; reason: string } {
  if (!clip) return { ok: false, reason: "Copy a section first" }
  if (clip.kind === "block") return { ok: false, reason: "A block is copied, not settings" }
  const type = clip.kind === "section" ? clip.section.type : clip.type
  const copied = clip.kind === "section" ? clip.section.settings : clip.settings
  const fieldTypes = clip.fieldTypes
  const labelOf = (id: string) => target.fields.find((f) => f.id === id)?.label || humanize(id)
  const differs = (id: string, value: unknown) => JSON.stringify(target.settings[id]) !== JSON.stringify(value)
  if (type === target.type) {
    const next = deep(copied)
    const ids = new Set([...Object.keys(target.settings), ...Object.keys(next)])
    const changes = [...ids].filter((id) => differs(id, next[id])).map((id) => ({ id, label: labelOf(id) }))
    return { ok: true, same: true, next, changes }
  }
  const byId = new Map(target.fields.map((f) => [f.id, f]))
  const next: Record<string, unknown> = { ...target.settings }
  const changes: { id: string; label: string }[] = []
  for (const [id, value] of Object.entries(copied)) {
    const field = byId.get(id)
    const from = fieldTypes[id]
    if (field ? from !== undefined && from !== field.type : !STYLE_KEYS.has(id)) continue
    if (!differs(id, value)) continue
    next[id] = deep(value)
    changes.push({ id, label: labelOf(id) })
  }
  if (changes.length === 0) {
    return { ok: false, reason: `Copied settings are for ${clipNoun(clip)}` }
  }
  return { ok: true, same: false, next, changes }
}

/** The styling the section panel gives every section, beside what its schema declares (design-panels.tsx). */
export const STYLE_KEYS = new Set(["color_scheme", "heading_style", "body_style", "custom_heading", "custom_body", "animation", "colors", "color_overrides"])

function humanize(id: string): string {
  const words = id.replace(/[_-]+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Whether the copied block can go in this level of this section: a type the
 * level takes, and room for it by the same rules Add block keeps
 * (./block-room.ts): max_blocks, the type's limit, the section's total and
 * the depth, counting everything inside the block.
 */
export function pasteBlockCheck(
  clip: Clip | null,
  target: {
    sectionName: string
    section: { blocks?: BlockInstance[] }
    /** Whether this level takes a block of the type. */
    takes: (type: string) => boolean
    owner: { name: string; max_blocks?: number } | undefined
    siblings: readonly BlockInstance[]
    def: { name: string; limit?: number } | undefined
    /** The depth the pasted block lands at: 1 for the section's own level. */
    depth: number
  },
): Check {
  if (!clip) return { ok: false, reason: "Copy a block first" }
  if (clip.kind !== "block") return { ok: false, reason: clip.kind === "section" ? "A section is copied, not a block" : "Settings are copied, not a block" }
  if (!target.takes(clip.block.type)) return { ok: false, reason: `${target.sectionName} doesn't take ${clipNoun(clip)}` }
  const block = clip.block
  return blockRoom(target.owner, target.siblings, target.def, block.type, target.section, { depth: target.depth, size: countAll([block]), height: depthOf([block]) })
}
