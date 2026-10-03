/**
 * ===========================================================================
 *  CLICK A THING ON THE CANVAS, LAND ON ITS FIELD
 * ===========================================================================
 * Shopify's editor: click a heading and the sidebar opens the section at its
 * Heading field. This is the half that decides WHICH field, kept free of the
 * DOM so tests/builder-click-edit.test.ts can drive it.
 *
 * Two ways an element says where it came from:
 *
 *  1. A mark. A section drawn from a `.storelib` file has every element that
 *     shows a setting marked by the engine while the builder draws it
 *     (lib/storelib-theme/storelib/marks.ts): `data-sl-setting`, and
 *     `data-sl-block` when it is a block's. The nearest mark wins.
 *
 *  2. Its words or its picture. The older sections are hand-written React and
 *     carry no marks, so an element is matched by what it shows: text that is
 *     exactly a setting's text, or an image whose address is a setting's.
 *     Only an exact match counts, so a near miss selects the section and
 *     opens nothing rather than opening the wrong field.
 */

/** One element on the way up from what was clicked to its section, nearest first. */
export interface HitStep {
  /** `data-sl-setting`, when the element is marked. */
  setting?: string | null
  /** `data-sl-block`, when the mark is a block's. */
  markBlock?: string | null
  /** `data-block-id`: the element is (inside) this block. */
  blockId?: string | null
  /** The element's own words, for the unmarked sections. */
  text?: string | null
  /** An image's address. */
  src?: string | null
}

export interface ClickTarget {
  /** The setting's id. */
  setting: string
  /** The block's path ("a/b" for a block inside a block), or null for the section's own setting. */
  block: string | null
}

interface BlockLike {
  id: string
  settings?: Record<string, unknown>
  blocks?: BlockLike[]
}

export interface SectionLike {
  settings?: Record<string, unknown>
  blocks?: BlockLike[]
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim()

/** A setting's text as a reader sees it: tags taken out, entities read, spaces squashed. */
export function plainOf(v: unknown): string {
  if (typeof v !== "string") return ""
  return squash(
    v
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  )
}

/** The path of block ids from the section down to the block with this id. */
function blockPath(blocks: BlockLike[] | undefined, id: string, above: string[] = []): string[] | null {
  for (const b of blocks ?? []) {
    if (b.id === id) return [...above, b.id]
    const deeper = blockPath(b.blocks, id, [...above, b.id])
    if (deeper) return deeper
  }
  return null
}

function blockAt(blocks: BlockLike[] | undefined, path: string[]): BlockLike | null {
  let list = blocks
  let found: BlockLike | null = null
  for (const id of path) {
    found = (list ?? []).find((b) => b.id === id) ?? null
    if (!found) return null
    list = found.blocks
  }
  return found
}

/** Which of these settings shows exactly these words, or this picture. */
function matchIn(settings: Record<string, unknown> | undefined, step: HitStep): string | null {
  if (!settings) return null
  const text = squash(step.text ?? "")
  const src = (step.src ?? "").trim()
  for (const [id, v] of Object.entries(settings)) {
    if (typeof v !== "string" || !v.trim()) continue
    if (src && (src === v.trim() || (v.trim().length > 8 && src.endsWith(v.trim())))) return id
    if (text && text.length <= 600 && plainOf(v) === text) return id
  }
  return null
}

/**
 * The field a click is for, or null when the click was on the section and not
 * on any one thing in it.
 */
export function clickTarget(chain: HitStep[], section: SectionLike): ClickTarget | null {
  /* 1. The nearest mark. */
  for (const step of chain) {
    if (!step.setting) continue
    if (step.markBlock) {
      const path = blockPath(section.blocks, step.markBlock)
      /* A block the sidebar does not hold (a static one never edited) still has its id as its path. */
      return { setting: step.setting, block: path ? path.join("/") : step.markBlock }
    }
    return { setting: step.setting, block: null }
  }
  /* 2. By what it shows: the block it sits in first, then the section. */
  const innermostBlock = chain.find((s) => s.blockId)?.blockId ?? null
  const path = innermostBlock ? blockPath(section.blocks, innermostBlock) : null
  const block = path ? blockAt(section.blocks, path) : null
  for (const step of chain) {
    if (!step.text && !step.src) continue
    if (block) {
      const hit = matchIn(block.settings, step)
      if (hit) return { setting: hit, block: path!.join("/") }
    }
    const hit = matchIn(section.settings, step)
    if (hit) return { setting: hit, block: null }
  }
  return null
}

/** What the DOM half needs from an element. Structural, so a test can hand in plain objects. */
export interface ElementLike {
  getAttribute(name: string): string | null
  hasAttribute?(name: string): boolean
  parentElement: ElementLike | null
  tagName?: string
  textContent?: string | null
  childElementCount?: number
}

/**
 * The steps from a clicked element up to (not including) the element where
 * the section starts. Only a leaf's words are read: a wrapper's text is all
 * of its children's, which would match nothing or the wrong thing.
 */
export function chainFrom(el: ElementLike | null, stop: (el: ElementLike) => boolean, maxSteps = 12): HitStep[] {
  const out: HitStep[] = []
  let cur = el
  while (cur && out.length < maxSteps && !stop(cur)) {
    const tag = (cur.tagName ?? "").toLowerCase()
    const leaf = (cur.childElementCount ?? 0) === 0 || ["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "button", "span", "li", "blockquote"].includes(tag)
    out.push({
      setting: cur.getAttribute("data-sl-setting"),
      markBlock: cur.getAttribute("data-sl-block"),
      blockId: cur.getAttribute("data-block-id"),
      text: leaf ? (cur.textContent ?? null) : null,
      src: tag === "img" || tag === "video" || tag === "source" ? cur.getAttribute("src") : null,
    })
    cur = cur.parentElement
  }
  return out
}

/** How long the field keeps its ring after the sidebar lands on it. globals.css fades it over the same. */
export const FIELD_FLASH_MS = 1600
