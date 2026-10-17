/**
 * ===========================================================================
 *  WHAT THE EDITOR SENDS STORELIB AI, MADE READABLE BEFORE IT IS CHECKED
 * ===========================================================================
 * Every run sends the whole page: each section with its settings and blocks.
 * The page is whatever the creator has built, so it carries whatever the
 * editor, an import, a paste or an older version ever wrote into it: a name
 * stored as null, a label longer than the field allows, a block with no
 * settings, an app block whose type is a long shopify:// address.
 *
 * Checked strictly, any one of those refused the WHOLE request, and the
 * creator was told "Describe what you want changed." after describing it.
 * Nothing they could type fixed it, because the problem was in their page,
 * not their words.
 *
 * So the page is tidied first: nulls become absent, text is clipped to its
 * field, a missing settings object becomes an empty one, things that are not
 * sections or blocks at all are left out. The run then works on what is left.
 * The route still refuses a request it truly cannot read, and says which part.
 */

const SECTION_ID = 128
const TYPE = 64
const NAME = 256
const LABEL = 80
const MAX_SECTIONS = 500
const MAX_BLOCKS = 500
const MAX_DEPTH = 8

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max)
  if (typeof value !== "string") return undefined
  return value.slice(0, max)
}

function flag(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

export interface CleanBlock {
  id: string
  type: string
  settings: Record<string, unknown>
  hidden?: boolean
  static?: boolean
  blocks?: CleanBlock[]
}

export interface CleanSection {
  id: string
  type: string
  name: string
  label?: string
  settings: Record<string, unknown>
  blocks?: CleanBlock[]
  hidden?: boolean
  group?: "header" | "footer"
}

function cleanBlocks(raw: unknown, depth: number, budget: { left: number }): CleanBlock[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: CleanBlock[] = []
  for (const item of raw) {
    if (budget.left <= 0) break
    if (!isRecord(item)) continue
    const id = text(item.id, SECTION_ID)
    /* A type longer than the field is an app block's address: kept by its last part, which is the block's own name. */
    const rawType = typeof item.type === "string" ? item.type : ""
    const type = rawType.length > TYPE ? (rawType.split("/").pop() ?? rawType).slice(0, TYPE) : rawType
    if (!id || !type) continue
    budget.left--
    const block: CleanBlock = { id, type, settings: isRecord(item.settings) ? item.settings : {} }
    const hidden = flag(item.hidden)
    if (hidden !== undefined) block.hidden = hidden
    const fixed = flag(item.static)
    if (fixed !== undefined) block.static = fixed
    if (depth < MAX_DEPTH) {
      const inner = cleanBlocks(item.blocks, depth + 1, budget)
      if (inner && inner.length) block.blocks = inner
    }
    out.push(block)
  }
  return out
}

/** The page's sections, tidied so one odd value never refuses the whole run. */
export function cleanSections(raw: unknown): CleanSection[] {
  if (!Array.isArray(raw)) return []
  const out: CleanSection[] = []
  for (const item of raw.slice(0, MAX_SECTIONS)) {
    if (!isRecord(item)) continue
    const id = text(item.id, SECTION_ID)
    const type = text(item.type, TYPE)
    if (!id || !type) continue
    const section: CleanSection = {
      id,
      type,
      name: text(item.name, NAME) ?? "",
      settings: isRecord(item.settings) ? item.settings : {},
    }
    const label = text(item.label, LABEL)
    if (label) section.label = label
    const blocks = cleanBlocks(item.blocks, 1, { left: MAX_BLOCKS })
    if (blocks) section.blocks = blocks
    const hidden = flag(item.hidden)
    if (hidden !== undefined) section.hidden = hidden
    if (item.group === "header" || item.group === "footer") section.group = item.group
    out.push(section)
  }
  return out
}

/**
 * The rest of the request, tidied the same way: a null where a value is
 * optional is the same as no value, and an id too long to be one of ours is
 * no selection at all rather than a refusal.
 */
export function cleanAgentBody(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value === null && key !== "conversationId") continue
    body[key] = value
  }
  if ("sections" in body) body.sections = cleanSections(body.sections)
  if (body.settings !== undefined && !isRecord(body.settings)) body.settings = {}
  if (body.settings === undefined && "sections" in body) body.settings = {}
  for (const key of ["selectedSectionId", "selectedBlockId"] as const) {
    if (typeof body[key] === "string" && (body[key] as string).length > 400) delete body[key]
  }
  if (typeof body.selectedBlockType === "string" && body.selectedBlockType.length > TYPE) {
    body.selectedBlockType = (body.selectedBlockType.split("/").pop() ?? "").slice(0, TYPE)
  }
  if (typeof body.page === "string") body.page = body.page.slice(0, 200)
  if (typeof body.conversationId === "string" && !/^[0-9a-f-]{36}$/i.test(body.conversationId)) body.conversationId = null
  return body
}

/** Which part of a request could not be read, in words a creator can act on. */
export function unreadablePart(issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>): string {
  const first = issues[0]
  if (!first) return "Storelib AI could not read this request. Reload the editor and try again."
  const where = first.path[0]
  if (where === "prompt") return "That message is too long for one request. Split it into two and send the first part."
  if (where === "images") return "Too many pictures at once. Send up to 16."
  if (where === "model" || where === "provider" || where === "tier") return "Pick a model again in the menu under the message box, then send."
  return `Storelib AI could not read part of this page (${first.path.join(".")}). Reload the editor and try again.`
}
