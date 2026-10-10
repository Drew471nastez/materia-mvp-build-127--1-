/**
 * ===========================================================================
 *  AN OPENED POST ON A PHONE: THE MORPH OUT OF ITS CARD (round 17)
 * ===========================================================================
 * The owner's first wish (round 15, OWNER15.md) was the post opening out of
 * its card, smoothly. Three styles have been turned down on a real iPhone
 * since: round 14's morph (two copies of the post at partial opacity, a
 * ghost), round 15's push from the right, round 16's page sheet. ARCH17's
 * finding is that the ENGINE was the rough part: round 16 drove every frame
 * from one number, scaled the whole community behind the post and kept a
 * backdrop blur on the moving page, and its own probe saw the open stall.
 * Measured again here (scripts/check-communities-post17.mjs, 390x844, 4x
 * CPU, the compositor's own frames): the open stopped for 344ms part way up.
 *
 * THE ENGINE (post-stage.ts draws it). Every move is a Web Animation on
 * `translate`, `scale` and `opacity` only, handed to the compositor in one go, so a
 * busy main thread cannot stop it. Nothing behind the post moves or scales:
 * only a light scrim fades. No blur on anything while it moves (the top's
 * blur comes on once it has settled). `will-change` only while moving. The
 * post's content is drawn and its first picture decoded BEFORE the move
 * starts (PREPARE_CAP_MS at most), so the move never competes with React or
 * with a picture being decoded.
 *
 * THE STYLE: Material's container morph, done the way that never ghosts.
 * A white container grows from the tapped card's exact rectangle to the
 * screen, and shrinks back into it on close. Its contents FADE THROUGH,
 * never across: the card's content goes over the first FADE_SPLIT of the
 * time, the post's comes over the rest, so the two are never both on screen
 * at partial opacity. The close lands the container exactly on the card's
 * rectangle showing a copy of the card (a clone, drawn the same), and the
 * layer is hidden on the next frame: the swap to the real card cannot be
 * seen, and nothing moves after it.
 *
 * WHY FOUR CLIPS AND NO SCALE. A container grown by `scale` stretches its
 * corners and whatever is in it. Here the container is the intersection of
 * four full screen layers, each moved by `translate` only and each clipping
 * (overflow: hidden while it moves): one sets the right and foot edges, one
 * the top and right, one the left and foot, one the left and top. Each
 * corner is the corner of exactly one of them, so the card's radius is kept
 * on all four, and nothing inside is ever scaled. Every offset is linear in
 * the eased progress, so the same easing on all four keeps them in step to
 * the pixel on every frame.
 *
 * THE STYLE IS ONE CONSTANT. POST_MOTION picks "container" (the default),
 * "sheet" (rises from the foot), "push" (in from the right) or "fade", all
 * on the same engine, so another feel is a one line change.
 *
 * Pure: no DOM, no React, so tests/communities-post17.test.ts holds every
 * number and rule here as written.
 */

/** The four styles, one engine. */
export type PostMotionStyle = "container" | "sheet" | "push" | "fade"

/** THE STYLE, for every post opened on a phone. Change this one word to change the feel. */
export const POST_MOTION: PostMotionStyle = "container"

/** Open: long enough to read as a move out of the card, short enough to never wait for. */
export const OPEN_MS = 300
/** Close: a little quicker than the open, as iOS does. */
export const CLOSE_MS = 250
/** An iOS like ease out: quick off the mark, a long soft landing. */
export const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** With reduced motion: a plain fade, this long. */
export const REDUCED_MS = 160

/** The share of the time the outgoing content takes to go; the incoming takes the rest. Never both at once. */
export const FADE_SPLIT = 0.3

/**
 * "Gone" is this opacity, not 0. A layer at opacity 0 is not rastered, so the post's content made visible part way through
 * the move had to be rastered then, and the compositor stopped for it (measured: 168ms at 4x CPU). At 0.002 every layer is
 * rastered before the move starts, and it cannot show: 0.002 of a step of 255 is under half of one level of any colour, so
 * not one pixel changes. The fade through is still never two contents at once on the screen.
 */
export const GONE = 0.002

/** The scrim over the community at its deepest (black at this alpha): light, the feed reads through it. */
export const SCRIM = 0.16

/** The post is prepared (drawn, laid out, its first picture decoded) for at most this long before the move starts anyway. */
export const PREPARE_CAP_MS = 100

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}
export interface Screen {
  width: number
  height: number
}

/** The whole screen as a rectangle. */
export function screenRect(s: Screen): Rect {
  return { left: 0, top: 0, width: s.width, height: s.height }
}

/**
 * Whether the card can be grown from (or landed on): on screen, at least a sliver of it, and a real size. A card scrolled
 * away, hidden under <Activity> or gone takes the plain fade instead (fallbackFor).
 */
export function usableOrigin(r: Rect | null, s: Screen): boolean {
  if (!r) return false
  if (!(r.width > 8 && r.height > 8)) return false
  return r.top < s.height && r.top + r.height > 0 && r.left < s.width && r.left + r.width > 0
}

/** The style a move takes: the chosen one, or the fade when the container has no card to grow from or land on. */
export function styleFor(chosen: PostMotionStyle, origin: Rect | null, s: Screen, reduced: boolean): PostMotionStyle | "reduced" {
  if (reduced) return "reduced"
  if (chosen === "container" && !usableOrigin(origin, s)) return "fade"
  return chosen
}

/* ── THE CONTAINER: FOUR CLIPS ─────────────────────────────────────────── */

/** The four clip layers, outermost first: which edges each sets, and the corner it rounds. */
export const CLIPS = ["foot-right", "top-right", "foot-left", "top-left"] as const
export type ClipName = (typeof CLIPS)[number]
/** The corner each clip rounds (as a CSS border radius longhand). */
export const CLIP_CORNER: Record<ClipName, "borderBottomRightRadius" | "borderTopRightRadius" | "borderBottomLeftRadius" | "borderTopLeftRadius"> = {
  "foot-right": "borderBottomRightRadius",
  "top-right": "borderTopRightRadius",
  "foot-left": "borderBottomLeftRadius",
  "top-left": "borderTopLeftRadius",
}

/**
 * Each clip's offset from the one outside it (the outermost from the screen), for the container at `r`. Every clip is
 * as big as the screen; where each sits on the screen:
 *
 *   foot-right   (right - W, foot - H)    its right and foot edges are the container's
 *   top-right    (right - W, top)         its top and right
 *   foot-left    (left, foot - H)         its left and foot
 *   top-left     (left, top)              its left and top, and the content's origin
 *
 * so what all four leave visible is exactly [left, right] x [top, foot], and the content inside the last sits at the
 * container's top left corner.
 */
export function clipOffsets(r: Rect, s: Screen): Record<ClipName, { x: number; y: number }> {
  const right = r.left + r.width
  const foot = r.top + r.height
  const at: Record<ClipName, { x: number; y: number }> = {
    "foot-right": { x: right - s.width, y: foot - s.height },
    "top-right": { x: right - s.width, y: r.top },
    "foot-left": { x: r.left, y: foot - s.height },
    "top-left": { x: r.left, y: r.top },
  }
  const out = {} as Record<ClipName, { x: number; y: number }>
  let px = 0
  let py = 0
  for (const name of CLIPS) {
    out[name] = { x: at[name].x - px, y: at[name].y - py }
    px = at[name].x
    py = at[name].y
  }
  return out
}

/** What the four clips leave visible, worked back from their offsets (the test's check that they make the container). */
export function visibleOf(offsets: Record<ClipName, { x: number; y: number }>, s: Screen): Rect {
  let x = 0
  let y = 0
  let left = -Infinity
  let top = -Infinity
  let right = Infinity
  let foot = Infinity
  for (const name of CLIPS) {
    x += offsets[name].x
    y += offsets[name].y
    left = Math.max(left, x)
    top = Math.max(top, y)
    right = Math.min(right, x + s.width)
    foot = Math.min(foot, y + s.height)
  }
  return { left, top, width: right - left, height: foot - top }
}

/** The container between two rectangles at eased progress `e` (0 at `a`, 1 at `b`). */
export function lerpRect(a: Rect, b: Rect, e: number): Rect {
  const m = (p: number, q: number) => p + (q - p) * e
  return { left: m(a.left, b.left), top: m(a.top, b.top), width: m(a.width, b.width), height: m(a.height, b.height) }
}

/* ── THE FADE THROUGH ──────────────────────────────────────────────────── */

/**
 * The two contents' opacities over the move's TIME (not its eased progress), as keyframes with offsets: the one going
 * out from 1 to 0 over [0, FADE_SPLIT], the one coming in from 0 to 1 over [FADE_SPLIT, 1]. At no moment are both above
 * zero (fadeAt says so for any t).
 */
export function fadeOutKeyframes(): Keyframe[] {
  return [
    { opacity: 1, offset: 0, easing: "ease-out" },
    { opacity: GONE, offset: FADE_SPLIT },
    { opacity: GONE, offset: 1 },
  ]
}
export function fadeInKeyframes(): Keyframe[] {
  return [
    { opacity: GONE, offset: 0 },
    { opacity: GONE, offset: FADE_SPLIT, easing: "ease-in-out" },
    { opacity: 1, offset: 1 },
  ]
}

/** Whether an opacity can show on a screen at all (8 bits a channel: under half a level of 255 rounds away). */
export function shows(opacity: number): boolean {
  return opacity * 255 >= 0.5
}

/** Both contents' opacities at time share `t` (0 to 1), as the keyframes above draw them (linear between keyframes, for the test). */
export function fadeAt(t: number): { out: number; in: number } {
  const q = Math.max(0, Math.min(1, t))
  const out = q >= FADE_SPLIT ? 0 : 1 - q / FADE_SPLIT
  const inn = q <= FADE_SPLIT ? 0 : (q - FADE_SPLIT) / (1 - FADE_SPLIT)
  return { out, in: inn }
}

/* ── THE OTHER STYLES, ON THE SAME ENGINE ──────────────────────────────── */

/** Where the post's whole layer is when it is out of sight, per style (the opposite end of the open): its `translate` and opacity. */
export function awayFor(style: PostMotionStyle | "reduced", s: Screen): { translate: string; opacity: number } {
  switch (style) {
    case "sheet":
      return { translate: `0px ${s.height}px`, opacity: 1 }
    case "push":
      return { translate: `${s.width}px 0px`, opacity: 1 }
    case "fade":
      return { translate: "0px 14px", opacity: GONE }
    case "reduced":
      return { translate: "0px 0px", opacity: GONE }
    default:
      /* The container moves its clips, not the layer. */
      return { translate: "0px 0px", opacity: 1 }
  }
}

/* ── THE FINGER ────────────────────────────────────────────────────────── */

/**
 * A pull down `offset` px (or the app's edge swipe, `dx` across): the post follows the finger and shrinks a little about the
 * middle of its top edge, as iOS does under a finger (the `scale` is about the layer's middle, so the `translate` takes
 * back what that moves the top by); the scrim lifts with it.
 */
export const FOLLOW_MIN_SCALE = 0.86
export function followFor(dx: number, offset: number, s: Screen): { translate: string; scale: number; scrim: number } {
  const p = Math.max(0, Math.min(1, Math.max(offset / Math.max(1, s.height * 0.6), Math.abs(dx) / Math.max(1, s.width))))
  const scale = Math.round((1 - (1 - FOLLOW_MIN_SCALE) * p) * 10000) / 10000
  const y = offset - ((1 - scale) * s.height) / 2
  return { translate: `${Math.round(dx * 10) / 10}px ${Math.round(y * 10) / 10}px`, scale, scrim: SCRIM * (1 - p) }
}

/** Where the top edge of a layer drawn with followFor is, on the screen (the test's check that the top follows the finger). */
export function followTop(offset: number, s: Screen): number {
  const f = followFor(0, offset, s)
  const y = parseFloat(f.translate.split(" ")[1])
  return y + ((1 - f.scale) * s.height) / 2
}

/** Let go short of closing: back to rest, this long. */
export const SPRING_BACK_MS = 280

/* ── THE CLOSE, IN ORDER ───────────────────────────────────────────────── */

export type MorphStep =
  /** The keyboard down with the post, not after it. */
  | "blur"
  /** The feed put back to the scroll it had when the post opened, while the post still covers it. */
  | "hold-feed"
  /** The card's rectangle read, AFTER the feed is in place. */
  | "measure-card"
  /** A copy of the card, as it is now, put in the container (unseen: it fades in over the second part). */
  | "clone-card"
  /** The top's blur off: nothing moving carries one. */
  | "blur-off"
  /** The one move: the container to the card, the post's content out, then the copy in, the scrim away. */
  | "move"
  /** The container lands on the card showing the copy; the layer is hidden on the next frame. */
  | "land"
  | "hide-layer"
  /** The tab bar's layer let go, the post taken out, the history step given back (when it was not a Back). */
  | "release-layer"
  | "unmount"
  | "step-back"

/** The close of the container, step by step. Nothing moves after "land". */
export function morphCloseSteps(byHistory: boolean): MorphStep[] {
  const steps: MorphStep[] = ["blur", "hold-feed", "measure-card", "clone-card", "blur-off", "move", "land", "hide-layer", "release-layer", "unmount"]
  if (!byHistory) steps.push("step-back")
  return steps
}
