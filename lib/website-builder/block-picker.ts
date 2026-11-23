/**
 * ===========================================================================
 *  ADD BLOCK, THE PICKER'S ARITHMETIC
 * ===========================================================================
 * The picker (components/website-builder/editor/block-picker.tsx) shows the
 * block under the pointer drawn inside the section it is being added to, at
 * the place it will land. Everything here is pure, so it is tested as plain
 * values (tests/block-picker.test.ts):
 *
 *   previewBlock      the block as Add block makes it: the schema's
 *                     defaults, then the preset's settings and blocks
 *   sectionWith       the section as it will be once the block is in, at
 *                     the level and the index that were asked for
 *   matchChoices      the search: by name and by type, words in any order
 *   cropFor           the window onto the drawn section that shows the
 *                     block, and the scale that fits it into the preview
 *   fitPreview        the preview box sized to that window: as wide as the
 *                     pane, as tall as the scaled block (between a floor
 *                     and a ceiling), the block in its middle
 *   splitChoices      the blocks that can be added, then the ones that
 *                     cannot, with one heading for the second group
 *   placePicker       where the one panel goes on a computer, and its
 *                     size: beside the sidebar, level with the row it came
 *                     from, or in the middle when there is no room beside it
 *   previewStrip      the strip of the section the block is shown on, inside
 *                     the preview's canvas
 */
import { freshBlocks, insertAt } from "./block-tree"
import type { BlockInstance, BlockSchema, SectionInstance, SectionPreset } from "./types"

/** The id the block being previewed carries: the drawn markup is searched for it. */
export const PREVIEW_BLOCK_ID = "block-picker-preview"

export interface PickerChoice {
  type: string
  label: string
  preset?: SectionPreset
}

/** A block's own defaults, the way the editor's addBlock fills a new block. */
export function blockDefaults(def: Pick<BlockSchema, "fields"> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of def?.fields ?? []) if (f.default !== undefined) out[f.id] = f.default
  return out
}

/** The block a choice adds, with its children, as addBlock builds it. */
export function previewBlock(choice: PickerChoice, def: Pick<BlockSchema, "fields"> | undefined): BlockInstance {
  let n = 0
  const children = freshBlocks(choice.preset?.blocks, (type) => `${PREVIEW_BLOCK_ID}-${type}-${n++}`)
  return {
    id: PREVIEW_BLOCK_ID,
    type: choice.type,
    settings: { ...blockDefaults(def), ...(choice.preset?.settings ?? {}) },
    ...(children.length ? { blocks: children } : {}),
  }
}

/**
 * The section with the block in it, drawn under an id of its own so its
 * scoped styles never reach the canvas's copy. Shown, whatever the section
 * is in the canvas: a hidden section's block is still what is being picked.
 */
export function sectionWith(section: SectionInstance, parent: readonly string[], index: number | undefined, block: BlockInstance): SectionInstance {
  return {
    ...section,
    id: `${PREVIEW_BLOCK_ID}-${section.id}`,
    hidden: false,
    blocks: insertAt(section.blocks, parent, block, index),
  }
}

/** The choices a search keeps, in their own order. Every word has to be in the name or the type. */
export function matchChoices<C extends PickerChoice>(choices: readonly C[], query: string): C[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...choices]
  return choices.filter((c) => {
    const hay = `${c.label} ${c.type.replace(/[_-]+/g, " ")}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * THE BLOCK, FITTED INTO THE PREVIEW. `block` is where the block was laid out
 * inside the drawn section (`stage` is the section's own size), both at the
 * width the section is drawn at. The window is the block and `pad` around it,
 * kept inside the section; the scale fits the window into the pane, never
 * above `maxScale`, so a short line of text is shown at its own size rather
 * than blown up; and the window sits in the middle of the pane.
 */
export function cropFor(block: Rect, stage: { w: number; h: number }, pane: { w: number; h: number }, pad = 24, maxScale = 1): { scale: number; x: number; y: number; window: Rect } {
  const x0 = Math.max(0, block.x - pad)
  const y0 = Math.max(0, block.y - pad)
  const x1 = Math.min(Math.max(stage.w, block.x + block.w), block.x + block.w + pad)
  const y1 = Math.min(Math.max(stage.h, block.y + block.h), block.y + block.h + pad)
  const win = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }
  const scale = Math.max(0.05, Math.min(maxScale, pane.w / win.w, pane.h / win.h))
  return {
    scale,
    x: Math.round((pane.w / 2 - (win.x + win.w / 2) * scale) * 100) / 100,
    y: Math.round((pane.h / 2 - (win.y + win.h / 2) * scale) * 100) / 100,
    window: win,
  }
}

/**
 * THE PREVIEW BOX, SIZED TO WHAT IT SHOWS. The pane has a width of its own
 * (the card's) and takes the height the scaled block needs, between `minH`
 * and `maxH`, so a divider gets a short box and a picture a tall one, and
 * nothing floats in a box made for something else. A phone passes the same
 * number for both, so the list under the preview never moves as it changes.
 *
 * The block is laid out at the section's real width, then scaled as one
 * piece to fit: `left`, `top`, `width` and `height` are the box that holds
 * the scaled window (the crop), in the pane's own pixels.
 */
export function fitPreview(
  shown: Rect,
  stage: { w: number; h: number },
  pane: { w: number; minH: number; maxH: number; inset: number },
  pad = 16,
  maxScale = 1,
): { scale: number; window: Rect; paneH: number; left: number; top: number; width: number; height: number } {
  const room = { w: Math.max(1, pane.w - pane.inset * 2), h: Math.max(1, pane.maxH - pane.inset * 2) }
  const { scale, window: win } = cropFor(shown, stage, room, pad, maxScale)
  const width = Math.round(win.w * scale * 100) / 100
  const height = Math.round(win.h * scale * 100) / 100
  const paneH = Math.round(Math.max(pane.minH, Math.min(pane.maxH, height + pane.inset * 2)))
  return {
    scale,
    window: win,
    paneH,
    left: Math.round(((pane.w - width) / 2) * 100) / 100,
    top: Math.round(((paneH - height) / 2) * 100) / 100,
    width,
    height,
  }
}

/**
 * THE LIST, IN TWO GROUPS. What can be added first, in its own order, then
 * what cannot. The second group has one heading instead of a reason on every
 * row: the reason itself when every row shares it (the section is full, the
 * level is as deep as blocks go), "Already used" when each is a kind of
 * block the level holds only so many of. Each row's own reason is still
 * there for the row (its tooltip, the line under the preview).
 */
export function splitChoices<C extends PickerChoice>(shown: readonly C[], reasonOf: (c: C) => string | null): { open: C[]; closed: C[]; heading: string | null; shared: boolean } {
  const open: C[] = []
  const closed: C[] = []
  for (const c of shown) (reasonOf(c) ? closed : open).push(c)
  if (!closed.length) return { open, closed, heading: null, shared: false }
  const reasons = new Set(closed.map((c) => reasonOf(c)))
  const shared = closed.length > 1 && reasons.size === 1
  return { open, closed, heading: shared ? [...reasons][0] : null, shared }
}

/**
 * THE PANEL ON A COMPUTER (round 36). One card: the search and the list on
 * the left, `list` wide, and the preview filling the rest, divided by a
 * hairline. The owner, after two separate cards: "it's split from the main
 * one and it's too short and small". After one 820 by 540 panel: "too big".
 * So it is `width` wide (`minWidth` where the window has less room beside the
 * sidebar) and between `minH` and `maxH` tall: as tall as the list wants
 * inside those, and never taller than the window.
 */
export const PICKER_SIZE = { list: 260, width: 760, minWidth: 640, minH: 420, maxH: 560, gap: 8, margin: 12, canvasPad: 24, inset: 20 }

export interface PickerPlace {
  mode: "beside" | "center"
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where the panel goes: beside the sidebar, its top level with the row it was
 * opened from, lifted as far as it must be to stay in the window; or, with no
 * room beside the sidebar, in the middle of the window over a dimmed editor.
 * `listHeight` is what the list side would like to be (its search and every
 * row): the panel takes that height between `minH` and `maxH`, so a level
 * with three blocks does not get a tall empty column, nor a long one a short
 * scroller.
 */
export function placePicker(
  anchor: { top: number },
  sidebar: { right: number } | null,
  viewport: { w: number; h: number },
  listHeight: number,
  size = PICKER_SIZE,
): PickerPlace {
  const height = Math.round(Math.max(1, Math.min(Math.max(size.minH, Math.min(size.maxH, listHeight)), viewport.h - size.margin * 2)))
  const left = (sidebar?.right ?? 0) + size.gap
  const room = viewport.w - left - size.margin
  if (sidebar && room >= size.minWidth) {
    const top = Math.round(Math.max(size.margin, Math.min(anchor.top - 8, viewport.h - height - size.margin)))
    return { mode: "beside", left: Math.round(left), top, width: Math.round(Math.min(size.width, room)), height }
  }
  const width = Math.round(Math.min(size.width, viewport.w - size.margin * 2))
  return { mode: "center", left: Math.round((viewport.w - width) / 2), top: Math.round(Math.max(size.margin, (viewport.h - height) / 2)), width, height }
}

/**
 * THE STRIP THE BLOCK IS SHOWN ON. The preview side is a quiet canvas; on it
 * a strip of the section (its own background) as wide as the canvas allows,
 * as tall as the scaled block, never shorter than `floor` of the room (so a
 * line of text is not a sliver in a big grey field) and never taller than the
 * room. `area` is the canvas, `pad` its padding, `below` what a caption under
 * the strip takes.
 */
export function previewStrip(area: { w: number; h: number }, pad: number, inset: number, below = 0, floor = 0.5): { w: number; minH: number; maxH: number; inset: number } {
  const w = Math.max(1, Math.round(area.w - pad * 2))
  const maxH = Math.max(1, Math.round(area.h - pad * 2 - below))
  const minH = Math.min(maxH, Math.max(96, Math.round(maxH * floor)))
  return { w, minH, maxH, inset }
}

/** The editor's phone layout starts under this width (its sections sheet, its bottom bar): the picker is a sheet there. */
const PHONE_MAX = 767

/**
 * Whether an opening is a phone's: the row pressed is in the sections sheet,
 * or the window is a phone's width. Round 58: it used to be the first alone,
 * so Add block pressed ON THE CANVAS of a phone (between two blocks, or in an
 * imported theme's frame) opened the computer's panel, 366 wide, its preview
 * a 56px sliver holding the block at a tenth of its size.
 */
export function pickerIsPhone(inSheet: boolean, width: number): boolean {
  return inSheet || width <= PHONE_MAX
}

/** The block types at one level of a section: its own blocks for [], else the blocks inside the block the path names. */
export function typesAt(section: { blocks?: { id: string; type: string; blocks?: unknown[] }[] }, parent: readonly string[]): Set<string> {
  type Level = { id: string; type: string; blocks?: unknown[] }[]
  let level: Level = section.blocks ?? []
  for (const id of parent) level = (level.find((b) => b.id === id)?.blocks ?? []) as Level
  return new Set(level.map((b) => b.type))
}
