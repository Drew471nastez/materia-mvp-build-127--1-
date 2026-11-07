/**
 * ===========================================================================
 *  THE PICTURE INSIDE THE PADDING (round AK)
 * ===========================================================================
 * The product editor stores a digital product's cover as a 1280x720 JPEG: a
 * portrait ebook cover is drawn in the middle of a light grey canvas
 * (processImageToWidescreen in app/(storelib)/app/products/new/product-editor.tsx).
 * Every frame that shows that file shows the grey too: two empty bars beside
 * the cover in the product sheet, and in the instant checkout's head.
 *
 * The bars are in the pixels, so they are found in the pixels: a small copy
 * of the picture is read once, and the columns (or rows) at its two edges
 * that are one flat colour, light or dark, on both sides about equally, are
 * the padding. What is left is the picture the creator uploaded, and a frame
 * can then fill with it (lib/images/letterbox `coverBox`).
 *
 * Careful about real pictures: a white-backed photo has flat light edges
 * too. Bars count only when they are on BOTH sides, about the same width
 * (the editor centres the picture), at least 6% of the width together, and
 * leave a picture of a sensible shape. A one-sided white margin is the
 * picture's own and is kept.
 */

/** Where the picture is inside its file, as fractions of the file's width and height. */
export type ContentBox = { x: number; y: number; w: number; h: number }

/** A flat line of pixels: little spread in brightness, no colour, and light (a grey pad) or dark (a black bar). */
function flatLine(px: ArrayLike<number>, width: number, at: number, along: "column" | "row", length: number): { flat: boolean; light: number } {
  let min = 255
  let max = 0
  let chroma = 0
  let sum = 0
  for (let i = 0; i < length; i++) {
    const x = along === "column" ? at : i
    const y = along === "column" ? i : at
    const o = (y * width + x) * 4
    const r = px[o]
    const g = px[o + 1]
    const b = px[o + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    if (lum < min) min = lum
    if (lum > max) max = lum
    chroma = Math.max(chroma, Math.max(r, g, b) - Math.min(r, g, b))
    sum += lum
  }
  const light = sum / Math.max(1, length)
  return { flat: max - min <= 18 && chroma <= 14 && (light >= 196 || light <= 34), light }
}

function edgeRun(px: ArrayLike<number>, width: number, height: number, along: "column" | "row", fromEnd: boolean): { run: number; light: number } {
  const count = along === "column" ? width : height
  const length = along === "column" ? height : width
  let run = 0
  let light = 0
  for (let k = 0; k < count; k++) {
    const at = fromEnd ? count - 1 - k : k
    const line = flatLine(px, width, at, along, length)
    if (!line.flat) break
    light = line.light
    run++
  }
  return { run, light }
}

/**
 * The picture's box inside a padded file, or null when there are no bars.
 * `px` is RGBA, row by row, `width` x `height` (a small copy is plenty: 96 to 160px wide).
 */
export function findLetterbox(px: ArrayLike<number>, width: number, height: number): ContentBox | null {
  if (!(width >= 8) || !(height >= 8) || px.length < width * height * 4) return null
  const sides = (along: "column" | "row"): [number, number] | null => {
    const size = along === "column" ? width : height
    const a = edgeRun(px, width, height, along, false)
    const b = edgeRun(px, width, height, along, true)
    if (!a.run || !b.run) return null
    /* One flat colour across: a blank picture, not bars. */
    if (a.run + b.run >= size * 0.9) return null
    if (Math.abs(a.run - b.run) > Math.max(2, size * 0.04)) return null
    if (a.run + b.run < size * 0.06) return null
    /* Both light or both dark: one pad colour. */
    if (Math.abs(a.light - b.light) > 40) return null
    /* One line further in on each side: a JPEG smears the pad's edge into the picture. */
    const start = Math.min(size, a.run + 1)
    const end = Math.max(start, size - b.run - 1)
    return [start / size, (end - start) / size]
  }
  const across = sides("column")
  const down = sides("row")
  if (!across && !down) return null
  const box: ContentBox = { x: across ? across[0] : 0, y: down ? down[0] : 0, w: across ? across[1] : 1, h: down ? down[1] : 1 }
  if (box.w < 0.2 || box.h < 0.2) return null
  return box
}

/** The picture's own shape, width over height, once the padding is taken off. */
export function contentRatio(naturalRatio: number, box: ContentBox | null): number {
  if (!box) return naturalRatio
  return (naturalRatio * box.w) / box.h
}

/**
 * Where the whole file goes, as percentages of a frame of `frame` (width over height), so that the picture inside
 * it fills the frame (`cover`) or sits whole in it (`contain`), centred on `focus` (fractions of the picture). The
 * frame clips the rest: the bars are outside it.
 */
export function coverBox(naturalRatio: number, box: ContentBox, frame: number, fit: "cover" | "contain" = "cover", focus: { x: number; y: number } = { x: 0.5, y: 0.5 }): { left: number; top: number; width: number; height: number } {
  /* Units: the frame is 1 wide and 1/frame tall; the file is W x H in the same units once scaled. */
  const W = 1
  const H = 1 / naturalRatio
  const cw = box.w * W
  const ch = box.h * H
  const scale = fit === "cover" ? Math.max(1 / cw, 1 / frame / ch) : Math.min(1 / cw, 1 / frame / ch)
  const fileW = W * scale
  const fileH = H * scale
  const shownW = cw * scale
  const shownH = ch * scale
  /* The picture's focus point at the frame's centre, clamped so the picture never leaves an edge of the frame open. */
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, Math.min(lo, hi)), Math.max(lo, hi))
  const picLeft = clamp(0.5 - focus.x * shownW, 1 - shownW, 0)
  const picTop = clamp(0.5 / frame - focus.y * shownH, 1 / frame - shownH, 0)
  const left = picLeft - box.x * fileW
  const top = picTop - box.y * fileH
  return { left: left * 100, top: top * frame * 100, width: fileW * 100, height: fileH * frame * 100 }
}
