/**
 * ===========================================================================
 *  HOW MUCH OF A PICTURE IS BARE SKIN (the built-in picture check)
 * ===========================================================================
 * A pure function over raw pixels: no model, no download, no dependency, so
 * it runs anywhere (a Vercel function, the suite, a browser). It is the
 * fallback picture check for communities when no classifier is switched on
 * (lib/security/images/classify.ts), or when it fails on a picture.
 *
 * WHAT IT DOES. Every pixel of a small copy of the picture (at most 128px
 * on its longest side) is called skin or not by two published colour rules
 * that must BOTH agree, which keeps sand, wood and orange cats out far more
 * often than either rule alone:
 *
 *   RGB rule    Kovac, Peer and Solina (2003): R > 95, G > 40, B > 20,
 *               max - min > 15, |R - G| > 15, R > G, R > B
 *   YCbCr rule  Chai and Ngan (1999): 77 <= Cb <= 127, 133 <= Cr <= 173
 *
 * Then the skin pixels are joined into regions (4 neighbours), and the
 * picture is SKIN HEAVY when, after the region rules of Ap-apid (2005):
 *
 *   skin covers at least 35% of the picture, and
 *   the largest region is at least 20% of the picture, and
 *   the three largest regions hold at least 45% of the skin
 *     (a body, not a scatter of small warm patches)
 *
 * Ap-apid's own lines are 30% and 15%. On 58 ordinary photos (round 13:
 * portraits, a family, babies, beaches, yoga, a massage, tattoos, food,
 * wood, sand dunes) those called 14 skin heavy; these call 9.
 *
 * WHAT IT CANNOT DO, said plainly. It sees colour, not people. A close up
 * face, a baby, a hand, a peach wall or a desert at sunset can look like
 * skin; a nude picture in black and white, under blue light, or very dark
 * skin under poor light may not. So it never REFUSES anything: a skin heavy
 * picture from a member on their first day is held for a moderator, and
 * that is all (lib/security/images/classify.ts judgePicture).
 */

export interface SkinReading {
  /** Share of the picture that is skin coloured, 0 to 1. */
  skin: number
  /** Share of the picture covered by the largest skin region. */
  largest: number
  /** Share of the skin held by the three largest regions. */
  top3: number
  /** How many separate skin regions (of at least 0.2% of the picture). */
  regions: number
  /** The rule's answer. */
  heavy: boolean
}

/** The thresholds above, in one place for the suite and the notes. */
export const SKIN_RULE = {
  /** The longest side the picture is read at. */
  edge: 128,
  minSkin: 0.35,
  minLargest: 0.2,
  minTop3: 0.45,
  /** A region smaller than this share of the picture is noise. */
  minRegion: 0.002,
} as const

/** Whether one pixel is skin coloured by both rules. */
export function isSkinPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (!(r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b)) return false
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173
}

/**
 * Reads raw pixels (RGB or RGBA, row by row, as sharp's raw() gives them).
 * A picture with no pixels reads as no skin.
 */
export function readSkin(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number, channels: 3 | 4): SkinReading {
  const total = width * height
  const none: SkinReading = { skin: 0, largest: 0, top3: 0, regions: 0, heavy: false }
  if (!(total > 0) || pixels.length < total * channels) return none
  const mask = new Uint8Array(total)
  let skinCount = 0
  for (let i = 0, p = 0; i < total; i++, p += channels) {
    /* A transparent pixel is not skin, whatever colour it stores. */
    if (channels === 4 && pixels[p + 3] < 128) continue
    if (isSkinPixel(pixels[p], pixels[p + 1], pixels[p + 2])) {
      mask[i] = 1
      skinCount++
    }
  }
  if (!skinCount) return none

  /* Regions, by a flood fill with an explicit stack (no recursion depth to run out of). */
  const sizes: number[] = []
  const stack = new Int32Array(total)
  for (let start = 0; start < total; start++) {
    if (mask[start] !== 1) continue
    let top = 0
    let size = 0
    stack[top++] = start
    mask[start] = 2
    while (top) {
      const i = stack[--top]
      size++
      const x = i % width
      if (x > 0 && mask[i - 1] === 1) { mask[i - 1] = 2; stack[top++] = i - 1 }
      if (x < width - 1 && mask[i + 1] === 1) { mask[i + 1] = 2; stack[top++] = i + 1 }
      if (i >= width && mask[i - width] === 1) { mask[i - width] = 2; stack[top++] = i - width }
      if (i + width < total && mask[i + width] === 1) { mask[i + width] = 2; stack[top++] = i + width }
    }
    sizes.push(size)
  }
  sizes.sort((a, b) => b - a)
  const skin = skinCount / total
  const largest = sizes[0] / total
  const top3 = (sizes[0] + (sizes[1] ?? 0) + (sizes[2] ?? 0)) / skinCount
  const regions = sizes.filter((s) => s / total >= SKIN_RULE.minRegion).length
  const heavy = skin >= SKIN_RULE.minSkin && largest >= SKIN_RULE.minLargest && top3 >= SKIN_RULE.minTop3
  return { skin: round(skin), largest: round(largest), top3: round(top3), regions, heavy }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
