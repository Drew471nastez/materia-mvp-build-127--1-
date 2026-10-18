/**
 * ===========================================================================
 *  WHERE A SECTION THE AI IS WRITING GOES, BEFORE AND AFTER IT EXISTS
 * ===========================================================================
 * Writing a section takes tens of seconds: the model writes a file, the
 * compiler checks it, and a file that fails goes back for up to two more
 * attempts. For all of that the canvas used to show nothing, and when it was
 * done the section was not on the page at all. The chat said it was "in Add
 * Section under Created by you", and the creator had to go and find it.
 *
 * Now a placeholder holds the spot in the canvas while the file is written,
 * and the section replaces it the moment it compiles.
 *
 * THE PLACEHOLDER IS NEVER A SECTION OF THE PAGE. It is added only to the
 * list the canvas draws, never to the page's own sections, so it cannot be
 * saved, published, undone or selected. If the writing fails, it simply
 * stops being drawn.
 *
 * Pure functions of a section list, so the placement is tested without an
 * editor (tests/ai-section-placement.test.ts).
 */
import { freshBlocks } from "./block-tree"
import { groupOf } from "@/lib/storelib-theme/section-groups"
import type { BlockInstance, SectionInstance } from "./types"

/** The type and id of the placeholder. Nothing real can have either. */
export const WRITING_SECTION_TYPE = "__storelib_writing__"
export const WRITING_SECTION_ID = "__storelib_writing__"

/** The first and last index a body section may take: after the header group, before the footer group. */
function bodyRange(sections: SectionInstance[]): { min: number; max: number } {
  let lastHeader = -1
  let firstFooter = -1
  sections.forEach((s, i) => {
    const g = groupOf(s)
    if (g === "header") lastHeader = i
    else if (g === "footer" && firstFooter === -1) firstFooter = i
  })
  return { min: lastHeader + 1, max: firstFooter !== -1 ? Math.max(lastHeader + 1, firstFooter) : sections.length }
}

function clampToBody(sections: SectionInstance[], index: number): number {
  const { min, max } = bodyRange(sections)
  return Math.max(min, Math.min(max, index))
}

/**
 * WHERE THE SECTION WILL LAND, held as "after this section" rather than as a
 * number. Writing takes long enough that the creator keeps working, and an
 * index is wrong the moment they add or remove a section above it: the
 * placeholder would slide into a different gap and the finished section
 * would land somewhere nobody chose. The section above the spot is what they
 * were looking at, so that is what the spot is tied to.
 *
 * `index` is kept as the fallback for the one case the anchor cannot answer:
 * the section it named was deleted while the file was being written.
 */
export interface WritingAnchor {
  /** The section the new one goes directly under, or null for the top of the body. */
  afterId: string | null
  /** Where that was when the writing started. */
  index: number
}

/**
 * Decided when the writing STARTS, so the placeholder and the section that
 * replaces it are in the same place.
 *
 *   a gap the creator chose    that gap, when they opened the writer from one
 *   a section they have open   directly after it: "add a section" while
 *                              looking at the hero means under the hero
 *   neither                    the end of the page, above the footer, which
 *                              is where Add Section puts one too
 */
export function writingAnchor(
  sections: SectionInstance[],
  opts: { chosenIndex?: number | null; selectedId?: string | null; prompt?: string } = {},
): WritingAnchor {
  let index: number
  const selected = opts.selectedId ? sections.findIndex((s) => s.id === opts.selectedId) : -1
  /* Asked to go under or over the open section, in so many words. */
  const near = opts.prompt ? /\b(?:below|under|after|beneath|underneath)\s+(?:this|that|it|the selected)\b/i.test(opts.prompt) ? "after" : /\b(?:above|before|over)\s+(?:this|that|it|the selected)\b/i.test(opts.prompt) ? "before" : null : null
  /* At the end, said in words. */
  const atEnd = !!opts.prompt && /\b(?:at|to)\s+the\s+(?:end|bottom)\b|\bbottom of the page\b|\blast section\b/i.test(opts.prompt)
  if (opts.chosenIndex != null) index = clampToBody(sections, opts.chosenIndex)
  else if (near && selected !== -1 && groupOf(sections[selected]) === "template") {
    index = clampToBody(sections, near === "after" ? selected + 1 : selected)
  } else if (atEnd) index = bodyRange(sections).max
  /* Round AK, the owner: a new section the AI writes goes first on the page, where it is seen being written, unless a spot was picked or named. */
  else index = bodyRange(sections).min
  const above = sections[index - 1]
  return { afterId: above ? above.id : null, index }
}

/** The list index the anchor points at in the page as it is NOW. */
export function anchorIndex(sections: SectionInstance[], anchor: WritingAnchor): number {
  if (anchor.afterId === null) return bodyRange(sections).min
  const above = sections.findIndex((s) => s.id === anchor.afterId)
  return clampToBody(sections, above === -1 ? anchor.index : above + 1)
}

/** The canvas's list with the placeholder in it. The page's own list is untouched. */
export function withWritingPlaceholder(
  sections: SectionInstance[],
  anchor: WritingAnchor,
  prompt: string,
): SectionInstance[] {
  const placeholder: SectionInstance = {
    id: WRITING_SECTION_ID,
    type: WRITING_SECTION_TYPE,
    name: "Writing a section",
    settings: { prompt: prompt.slice(0, 160) },
    blocks: [],
  }
  const next = [...sections]
  next.splice(anchorIndex(sections, anchor), 0, placeholder)
  return next
}

/** The finished section, at the spot the placeholder held. */
export function placeWrittenSection(
  sections: SectionInstance[],
  anchor: WritingAnchor,
  section: SectionInstance,
): SectionInstance[] {
  const next = [...sections]
  next.splice(anchorIndex(sections, anchor), 0, section)
  return next
}

/**
 * A gap in the canvas, counted with the placeholder in the list, as the gap
 * the page itself has. The strips above and below the placeholder are one
 * gap in the page, so the one below is not drawn (`null`), and every gap
 * after it is one fewer.
 */
export function gapWithoutPlaceholder(canvas: SectionInstance[], at: number): number | null {
  const body = canvas.filter((s) => groupOf(s) === "template")
  const held = body.findIndex((s) => s.id === WRITING_SECTION_ID)
  if (held === -1 || at <= held) return at
  if (at === held + 1) return null
  return at - 1
}

/** A new instance of a section type, arriving the way its first preset says. */
export function instanceFromSchema(
  id: string,
  type: string,
  schema: { name?: string; presets?: { settings?: Record<string, unknown>; blocks?: unknown[] }[] },
): SectionInstance {
  const preset = schema.presets?.[0]
  return {
    id,
    type,
    name: schema.name ?? type,
    settings: { ...(preset?.settings ?? {}) },
    /* A copy with ids of its own, derived from this section's id: two sections added from one preset share neither block objects nor block ids. A static block keeps its id. */
    blocks: (() => {
      let n = 0
      return freshBlocks(preset?.blocks ? (JSON.parse(JSON.stringify(preset.blocks)) as BlockInstance[]) : [], () => `${id}-b${++n}`)
    })(),
    hidden: false,
  }
}
