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
 *   placePicker       where the panel goes on a computer: beside the
 *                     sidebar, level with the row it came from, or in the
 *                     middle when there is no room beside it
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

/** How wide and tall the panel wants to be on a computer, and the least room beside the sidebar it will sit in. */
export const PICKER_SIZE = { w: 820, h: 540, minBeside: 600, gap: 8, margin: 12 }

/**
 * Where the panel goes: beside the sidebar, its top level with the row it was
 * opened from and kept on screen; or, with no room for it beside the
 * sidebar, in the middle of the window over a dimmed editor.
 */
export function placePicker(
  anchor: { top: number },
  sidebar: { right: number } | null,
  viewport: { w: number; h: number },
  size = PICKER_SIZE,
): { mode: "beside" | "center"; left: number; top: number; width: number; height: number } {
  const height = Math.min(size.h, viewport.h - size.margin * 2)
  const left = (sidebar?.right ?? 0) + size.gap
  const room = viewport.w - left - size.margin
  if (sidebar && room >= size.minBeside) {
    const top = Math.round(Math.max(size.margin, Math.min(anchor.top - 16, viewport.h - height - size.margin)))
    return { mode: "beside", left: Math.round(left), top, width: Math.round(Math.min(size.w, room)), height: Math.round(height) }
  }
  const width = Math.min(size.w, viewport.w - size.margin * 2)
  return { mode: "center", left: Math.round((viewport.w - width) / 2), top: Math.round((viewport.h - height) / 2), width: Math.round(width), height: Math.round(height) }
}
