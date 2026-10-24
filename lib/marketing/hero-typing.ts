/**
 * The front page heading's typing, as numbers (components/marketing/
 * hero-typed-heading). Pure, so a test can hold the cadence and the phases
 * without a browser.
 *
 * ONE CLOCK. A phrase's whole life is a function of how long it has been on
 * screen: when each letter starts to fade in, how long it holds, when it
 * fades out. The component keeps that one number, adds each frame's time to
 * it (never more than MAX_STEP_MS at once), and draws whatever the number
 * says. So a pause, a hidden tab or a busy main thread stops the clock where
 * it is and starting again carries on from exactly that letter, with no
 * burst of letters to catch up and no wait to start over.
 */

/**
 * Each takes exactly two lines in the hero at 390px and at 1280px, so the
 * heading's height, which is the tallest phrase's, never leaves a blank line
 * under a short one. scripts/check-home-hero.mjs measures that in Chromium
 * with Inter.
 *
 * A "\n" is where a phrase breaks: "Build your online store." is narrower
 * than one line at every width the first phrase still needs two lines at,
 * so it says where its second line starts. The heading draws it with
 * white-space: pre-line; the typing counts it as a space.
 */
export const HERO_PHRASES = [
  "Build a business around what you create.",
  "Build your\nonline store.",
  "Your links and products on one page.",
  "Run a community for your audience.",
]

/** A phrase as words on one line: what a screen reader or a test compares. */
export const phraseText = (phrase: string) => phrase.replace(/\s+/g, " ")

/** A letter's gap: the base, a little either way, more after a space or a stop. */
export const TYPE_MS = 54
export const TYPE_SPREAD_MS = 14
export const SPACE_EXTRA_MS = 30
export const STOP_EXTRA_MS = 110
/** A letter fades and sharpens in over this long, starting at its own time. */
export const FADE_MS = 210
/** A full phrase stays this long, then fades out from its last letter back. */
export const HOLD_MS = 2400
export const OUT_MS = 260
export const OUT_STAGGER_MS = 5
/** Nothing on the line before the next phrase starts. */
export const EMPTY_MS = 160
/** The most a single frame moves the clock: a long task is a pause, never a jump. */
export const MAX_STEP_MS = 48

/** A small seeded generator, so the cadence is the same on every visit and in the test. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type PhraseTimeline = {
  /** When each letter starts to fade in, in ms from the start of the phrase. */
  reveal: number[]
  /** The last letter is fully in. */
  typed: number
  /** The fade out starts. */
  outStart: number
  /** The line is empty: the next phrase starts. */
  end: number
}

export function phraseTimeline(phrase: string, index: number): PhraseTimeline {
  const rand = seeded(index * 7919 + phrase.length)
  const reveal: number[] = []
  let t = 0
  /* A soft wave rather than noise: neighbouring letters keep a similar pace, like a hand does. */
  let drift = 0
  for (let i = 0; i < phrase.length; i++) {
    reveal.push(t)
    drift = drift * 0.6 + (rand() * 2 - 1) * 0.4
    let gap = TYPE_MS + drift * TYPE_SPREAD_MS
    const ch = phrase[i]
    if (ch === " " || ch === "\n") gap += SPACE_EXTRA_MS
    if (ch === "," || ch === ".") gap += STOP_EXTRA_MS
    t += gap
  }
  const typed = (reveal[reveal.length - 1] ?? 0) + FADE_MS
  const outStart = typed + HOLD_MS
  const end = outStart + OUT_MS + OUT_STAGGER_MS * Math.max(0, phrase.length - 1) + EMPTY_MS
  return { reveal, typed, outStart, end }
}

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x)
/** Ease out: quick to arrive, soft to settle. */
const easeOut = (x: number) => 1 - (1 - x) * (1 - x) * (1 - x)

/** How visible letter `i` is at `t` ms into the phrase: 0 to 1. */
export function letterAlpha(tl: PhraseTimeline, i: number, t: number): number {
  const n = tl.reveal.length
  if (t < tl.outStart) return easeOut(clamp01((t - tl.reveal[i]) / FADE_MS))
  /* Out from the last letter back, each a few ms after the one after it. */
  const at = tl.outStart + (n - 1 - i) * OUT_STAGGER_MS
  return 1 - easeOut(clamp01((t - at) / OUT_MS))
}

/** How many letters have started at `t` (the caret sits after the last of them). */
export function lettersStarted(tl: PhraseTimeline, t: number): number {
  if (t >= tl.outStart) return 0
  let k = 0
  while (k < tl.reveal.length && tl.reveal[k] <= t) k++
  return k
}

/**
 * The first moment at or after `t` where the clock may stop when the heading
 * goes out of sight: just before the next word's first letter, while the
 * phrase holds, or once the line is empty. Never part way through a word,
 * and never half way through the fade out.
 */
export function restTime(phrase: string, tl: PhraseTimeline, t: number): number {
  if (t >= tl.outStart) return Math.max(t, tl.end - EMPTY_MS)
  if (t >= tl.typed) return t
  for (let j = lettersStarted(tl, t); j < phrase.length; j++) {
    if (j === 0 || phrase[j - 1] === " " || phrase[j - 1] === "\n") return Math.max(t, tl.reveal[j] - 0.01)
  }
  /* In the last word: it is finished, and the phrase holds. */
  return tl.typed
}
