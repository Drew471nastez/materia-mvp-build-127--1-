"use client"

/**
 * ===========================================================================
 *  THE TOUCH OF A TAB BAR, SHARED BY BOTH OF STORELIB'S
 * ===========================================================================
 * Two bars of tabs answer a finger on a phone: the pill inside /app
 * (components/app/sidebar-mobile-nav.tsx) and the plain white bar on the
 * buyer's side of storelib.com (components/nav/buyer-tab-bar.tsx). The owner
 * asked for the second to "inherit the touch feel" of the first: the finger
 * sliding along it, the glass lens under the finger, the icon filling, the
 * little give on a tap. So those are here, once, and each bar draws its own
 * shape around them.
 *
 * Everything below was written for the pill and moved out of it unchanged,
 * notes included; where a note says "the pill" it is the bar that taught it.
 * tests/app-mobile-nav.test.ts reads this file together with the pill's, and
 * scripts/check-app-mobile-nav.mjs and scripts/check-buyer-tab-bar.mjs press
 * both bars through it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { hapticTap } from "@/lib/native-bridge"
import { FILL_TRANSITION, type NavIconPair } from "@/components/app/sidebar-desktop-nav"

/**
 * ===========================================================================
 *  THE SOLID IS DRAWN AT THE OUTLINE'S SIZE
 * ===========================================================================
 * A 22x22 box with both variants of the glyph stacked in it, cross-faded: the
 * line one while the tab is off, the solid one while it is on.
 *
 * They do not come out the same size. A stroke sits astride its path and so
 * reaches half a stroke beyond it, where a solid stops at its edge, and three
 * of these four are separate drawings from the icon set besides. Photographed
 * on and off in scripts/check-app-mobile-nav.mjs, every one of them came out
 * smaller when its tab turned on, about half a pixel on each edge, which is
 * the icon changing size under the finger that pressed it.
 *
 * TWO OTHER WAYS OF FIXING THAT WERE TRIED AND ARE WRONG, and this is written
 * down because both look reasonable and both wreck the icons.
 *
 *   Drawing the outline over the solid in both states pins the silhouette
 *   exactly. It also fills in the gaps the solid is drawn WITH: the lines
 *   inside the receipt closed up and it went out as a dark blob. Shipped, and
 *   reported back within the hour.
 *
 *   Giving the solid its own 1.5px stroke pins the silhouette exactly too,
 *   and closes the same gaps for the same reason, a stroke runs along every
 *   contour a shape has, including the ones cut out of its middle.
 *
 * What does not touch the drawing is scaling it. The cutouts scale with
 * everything else, so the glyph is the glyph, and both centres were already
 * in the same place, so growing it about its centre is enough. Six per cent
 * lands it on the outline's box: +0 x +0 on three of the four and half a
 * pixel short on Products, against a stroke's soft edge that is worth half a
 * pixel by itself.
 */
/**
 * How much bigger the solid glyph is drawn so that it occupies the same box
 * as the outline it replaces. Measured, not chosen: see NavIcon below.
 */
export const FILL_MATCH = 1.06

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT THE LENS TAKES ITS TIME OVER
 * ═══════════════════════════════════════════════════════════════════════════
 * This used to say NOTHING IN THIS BAR FADES, and it was the rule that
 * produced the clipped band NavIcon no longer uses. The reasoning behind it
 * was about one specific fade: the glyph DIMMING OUT AND COMING BACK, a dip
 * to nothing and a return, landing on the press. That is still the thing to
 * avoid, and nothing here does it.
 *
 * A cross-fade between two glyphs is not that. Neither one dips: one is
 * arriving exactly as fast as the other leaves, and because FILL_MATCH puts
 * them in the same box the pair never goes light or changes size. It is what
 * the desktop sidebar has always done, and it is what was asked for after
 * the band shipped.
 *
 * INK_MS and INK_EASE are now the LENS's timing, not the glyph's, the glass
 * emptying for the frame it changes slot and filling back. The icon is
 * quicker than the glass on purpose: the thing you pressed answers first and
 * the weight of the bar follows it.
 */
export const INK_MS = 360
export const INK_EASE = `${INK_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`

/**
 * ===========================================================================
 *  THE SAME FILL THE SIDEBAR HAS
 * ===========================================================================
 * This was a band of ink opening out from the centre line of the glyph: the
 * solid clipped to the band, the outline drawn twice and clipped to the two
 * halves outside it, the three exact complements at every moment. It was
 * built that way to avoid a fade, because a fade had been reported as cheap,
 * and to avoid a one-frame swap, because a swap had been reported as a bump.
 *
 * It was still wrong. Ink travelling out of the middle of a glyph is a
 * gesture, it draws attention to itself, and the icon reads as performing
 * rather than as being on. What was asked for after seeing it is the fill
 * the DESKTOP SIDEBAR has, which is none of that: both variants stacked in
 * the same box, cross-faded, nothing moving.
 *
 * So this is now sidebar-desktop-nav's NavIcon, on a 22px box instead of a
 * 20px one, down to importing its transition rather than restating it. The
 * things that were learned the hard way and still apply are kept:
 *
 *   FILL_MATCH stays. The solid and the outline are different drawings and
 *   the solid reads about six per cent smaller; cross-fading two glyphs of
 *   different sizes shows the size changing through the blend, which is the
 *   bump that was reported over and over. Matched, the blend has nothing
 *   left to change but the ink inside the outline. It is a constant and
 *   never animates.
 *
 *   Neither glyph is drawn over the other, and the solid gets no stroke of
 *   its own. Both close up the gaps the solid is drawn WITH, a stroke runs
 *   along every contour including the ones cut out of the middle, and the
 *   receipt icon goes out as a dark blob. That shipped once.
 *
 * The lens's glass keeps its own timing (INK_EASE, INK_MS). That part was
 * not what was objected to, and it is the bar's weight rather than the
 * icon's.
 */
/**
 * `layer`: each glyph on a compositor layer of its own for good. In the pill
 * the lens moves under the icons, on its own layer, and a glyph that is not
 * on one is drawn into whichever layer the browser puts over the lens at
 * that moment. As the lens came to rest under the next icon that choice
 * changed, and the glyph was drawn again on another layer's pixel grid: half
 * a device pixel over, on the frame you let go. "Exactly at that moment the
 * button icon glitches and moves a little bit." A glyph that is always on
 * its own layer is always drawn the same way, and its fade is a change of
 * opacity and nothing else.
 *
 * `box`: a CSS length the icon is drawn at instead of `size` pixels. The pill
 * passes its own glyph size (--app-nav-glyph), which follows the width of
 * the phone, and both glyphs are drawn at it rather than scaled to it.
 */
export function NavIcon({ icon, active, color, size = 22, box, layer = false }: { icon: NavIconPair; active: boolean; color: string; size?: number; box?: string; layer?: boolean }) {
  const Line = icon.line
  const Fill = icon.fill
  const piece = { position: "absolute", inset: 0, transition: FILL_TRANSITION, ...(layer ? { willChange: "opacity" } : {}) } as const
  /* On a layer of its own the solid is DRAWN at the matched size rather than
     scaled to it: a layer is painted before its transform, so a scaled one
     would be a 22px drawing stretched by the compositor, a pixel softer at
     the edge than the outline it replaces. Drawn at 23.3px it is as crisp. */
  const grow = (size * (FILL_MATCH - 1)) / 2
  const fit = box ? { width: "100%", height: "100%" } : {}
  const matched = box
    ? { inset: `calc(${box} * ${-Math.round(((FILL_MATCH - 1) / 2) * 10000) / 10000})`, width: `calc(${box} * ${FILL_MATCH})`, height: `calc(${box} * ${FILL_MATCH})` }
    : { inset: -grow }
  /*
    ── A GLYPH IN A BOX IS DRAWN AT THE BOX, AND NOT AT `size` ────────────
    "Make sure the settings button icon sits there correctly centred in the
    white circle."

    Solar's IconBase takes the `size` prop and writes it into the inline
    style as `width` and `height`, AFTER spreading the style it was handed.
    So the `width: 100%` above lost, silently, and every Solar glyph was
    drawn at 22px inside a box that is --app-nav-glyph: 21px on a 390px
    phone, 20 on a 360. `inset: 0` on an absolutely positioned element that
    carries its own width resolves to left and top, so the whole of that
    extra pixel hung off the RIGHT and the BOTTOM, and the ink sat a pixel
    down and to the right of the middle of its circle.

    The hand-drawn icons in this family (Home, OnePage, Payouts) put `size`
    on the svg's width ATTRIBUTE, which a style beats, so they were already
    the size of their box, which is why only four of the nine were off, and
    why the gear, alone in a white circle beside a menu glyph made of divs,
    was the one that got reported.

    So a glyph with a box is handed no `size` at all: the box's own width
    and height are then the only ones in the style, whichever family the
    icon came from. `size` still draws the rail's icons, which have no box.
  */
  const noSize = box != null
  return (
    <span className="relative block shrink-0" style={{ color, width: box ?? size, height: box ?? size }}>
      <Line
        {...(noSize ? {} : { size })}
        strokeWidth={1.5}
        data-part="outline"
        style={{ ...piece, ...fit, opacity: active ? 0 : 1 }}
      />
      <Fill
        {...(noSize ? {} : { size: layer ? size * FILL_MATCH : size })}
        data-part="ink"
        style={layer ? { ...piece, ...matched, opacity: active ? 1 : 0 } : { ...piece, ...fit, opacity: active ? 1 : 0, scale: String(FILL_MATCH) }}
      />
    </span>
  )
}

/** The bar as drawn on this screen, in screen pixels: read off the DOM, never computed. */
export type Geometry = { pad: number; slot: number; dot: number }
/** The last bar's numbers, for the next bar drawn on this screen (A BAR DRAWN AGAIN, in useSlide). */
let lastGeometry: Geometry | null = null
/**
 * The lens's left edge on slot `index`. The one place this is worked out:
 * the pill at rest and the gesture under a finger both call it.
 */
export const slotLeft = (index: number, g: Geometry): number =>
  Math.round((g.pad + index * g.slot + (g.slot - g.dot) / 2) * 100) / 100

/**
 * ===========================================================================
 *  HOW THE CIRCLE MOVES
 * ===========================================================================
 * Two different jobs, and one mechanism cannot do both.
 *
 * UNDER A FINGER it is where the finger is. Not where the finger's SLOT is:
 * the first version moved the circle slot to slot, each hop on a 90ms
 * transition, and that is what "very snappy, very direct, landing on it,
 * not smooth at all" describes. So while a finger is down there is no
 * transition on the circle's position at all.
 *
 * AND NOW IT IS UNDER THE FINGER, NOT A LITTLE BEHIND IT. It used to close
 * the distance by 72% a frame (and lean 22% of the way into the slot under
 * the finger), which left it a few pixels behind a quick finger and never
 * quite under a slow one: "smoother, cleaner, and accurate". So it tracks
 * the finger one to one. The only lag left is the pick up: a drag begins
 * with the circle on its slot and the finger somewhere in that slot, so the
 * gap between them is carried as an offset that dies away over about a
 * tenth of a second (CATCH_UP a frame), rather than a jump.
 *
 * LET GO OF IT and it springs onto the slot, carrying the speed the finger
 * gave it (settleSpring below). A spring started at the finger's speed has
 * no seam at the release, where a curve from rest had one; it is sampled
 * into keyframes and played by the compositor, so a page rendering on the
 * main thread cannot stall it; and it ends on the slot's exact centre,
 * because the last keyframe and the resting style are the same number.
 * Position and size are separate CSS properties (`translate`, `scale`), and
 * the stretch is `transform`, so each keeps its own motion.
 */
const CATCH_UP = 0.6
/**
 * The spring a released drag lands on: stiff enough to be there in about a
 * third of a second, damped to a single small overshoot (about 3% of the
 * distance left), which reads as arriving rather than as stopping.
 */
const SPRING = { stiffness: 520, damping: 34 }
/**
 * WHICH SLOT A RELEASE MEANS: the one under the finger, and only that.
 *
 * A release used to be projected PROJECT_MS ahead at the speed it had, so a
 * finger that let go while still moving opened the tab it was heading for
 * rather than the one it was over. On a scroller that is right; on a row of
 * four targets it meant a quick flick opened the tab PAST the one you
 * stopped on. The projection is gone (see onPointerUp): what you are
 * pointing at when you lift is what opens. The glass still springs across
 * on its own curve, so letting go still feels thrown.
 */
/**
 * LIQUID, LIKE A DROP OF GLASS. It stretches along the way it is moving, by
 * how fast it is moving, and rounds off as it slows: up to STRETCH_MAX wider
 * (a little narrower top to bottom, so it reads as the same drop pulled
 * along rather than a bigger one), on top of the lift, for about 1.15 in
 * all. From the speed, smoothed over a few frames, so a finger's uneven
 * events do not make it wobble. Stretch is written as `transform`, which
 * composes with `translate` and `scale` without touching either.
 */
const STRETCH_MAX = 0.11
/**
 * px per ms of speed for all of STRETCH_MAX. It was 0.6, three slots in a
 * quarter of a second, which is a quick slide: an ordinary drag across the
 * bar reached barely half the stretch, so the glass read as a box being
 * carried rather than as a drop being pulled. 0.5 puts the whole stretch
 * within an ordinary slide's reach, and the cap is what keeps a flick from
 * going further (STRETCH_MAX).
 */
const STRETCH_AT = 0.5
const stretchFor = (speed: number) => Math.min(STRETCH_MAX, (Math.abs(speed) / STRETCH_AT) * STRETCH_MAX)

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A DROP OF WATER, NOT A RUBBER STAMP
 * ═══════════════════════════════════════════════════════════════════════════
 * "Make the glassy bubble a bit more fluid, like a drop of water stretching
 * slightly in the drag direction and settling." The stretch used to BE the
 * speed: as fast as the finger went, that wide, and as the finger stopped it
 * went round again on the same curve, like a shape being redrawn rather than
 * a thing with a little weight in it.
 *
 * So the stretch has a body of its own now: a small underdamped spring
 * (DROP_SPRING) chasing what the speed asks for. Pulled along, it leans into
 * the stretch a moment after the finger does; stopped, it runs on past round
 * into a slight squash (at most SQUASH_MAX, a little narrower and taller)
 * and settles in one soft wobble. And it leads: the stretch reaches a touch
 * further ahead of the finger than behind it (DROP_LEAD of it), the way a
 * drop pulled across glass is fuller at its front, by rather more than it
 * used to be. All of it is one
 * `transform` on the lens, written once a frame under a finger and sampled
 * into the landing spring's keyframes after it, so it runs on the
 * compositor like the rest. It never passes STRETCH_MAX, so the widest the
 * lens gets is unchanged.
 */
/*
  SOFTER AND LATER (this round: "that bubble liquid more flowing"). 420 was
  stiff enough that the stretch arrived almost with the finger, so the lean
  was not read as weight. At 360 with a touch less damping the drop leans in
  a frame or two behind the finger and runs on a little further when it
  stops, which is what makes it read as liquid rather than as a shape being
  redrawn. The clamp (SQUASH_MAX, STRETCH_MAX) is unchanged, so the widest
  and narrowest it ever gets are the same as before.
*/
const DROP_SPRING = { stiffness: 360, damping: 8 }
const SQUASH_MAX = 0.03
/** How far ahead of the finger the stretch reaches: a drop pulled across glass is fuller at its front. */
const DROP_LEAD = 0.26
type Drop = { d: number; dv: number; dir: number }
/** One step of the drop's spring towards the stretch `speed` asks for; `ms` is split so a slow frame stays stable. */
function stepDrop(drop: Drop, speed: number, ms: number) {
  if (Math.abs(speed) > 0.02) drop.dir = Math.sign(speed)
  const target = stretchFor(speed)
  let left = ms / 1000
  while (left > 0) {
    const dt = Math.min(left, 1 / 120)
    left -= dt
    drop.dv += (DROP_SPRING.stiffness * (target - drop.d) - DROP_SPRING.damping * drop.dv) * dt
    drop.d = Math.max(-SQUASH_MAX, Math.min(STRETCH_MAX, drop.d + drop.dv * dt))
  }
}
/** The lens's shape for a drop: wider and a little flatter while stretched, leaning the way it goes; narrower and taller in the squash. `dot` is the lens's width on this screen. */
function dropStyle(drop: Drop, dot: number): string {
  const d = drop.d
  if (Math.abs(d) < 0.002) return "scale(1, 1)"
  const lead = d > 0 ? Math.round(drop.dir * d * dot * DROP_LEAD * 100) / 100 : 0
  return `translateX(${lead}px) scale(${Math.round((1 + d) * 1000) / 1000}, ${Math.round((1 - d * 0.5) * 1000) / 1000})`
}
const dropSettled = (drop: Drop) => Math.abs(drop.d) < 0.002 && Math.abs(drop.dv) < 0.05

/**
 * The spring from `from` (px, with `speed` px/ms) to `to`, as keyframes of
 * position and stretch, one per 1/240s. Semi implicit Euler at that step is
 * stable for these constants and ends when both the distance and the speed
 * are below what a screen can show.
 *
 * SAMPLED FOR A SCREEN FASTER THAN 120Hz. It was one keyframe per 1/120s,
 * which is exact on a 120Hz phone and interpolated on anything quicker; the
 * compositor runs between keyframes in a straight line, so on a faster panel
 * the landing was a chain of short straight segments rather than a curve.
 * Halving the step costs nothing at run time (the compositor plays the list
 * either way, and the list is built once per landing) and makes the sampled
 * spring the shape the numbers describe at any refresh rate.
 */
function settleSpring(from: number, speed: number, to: number, dot: number, drop: Drop = { d: stretchFor(speed), dv: 0, dir: Math.sign(speed) }): { frames: Keyframe[]; ms: number } {
  const dt = 1 / 240
  let x = from - to
  let v = speed * 1000
  const frames: Keyframe[] = []
  let t = 0
  for (let i = 0; i < 480; i++) {
    const place = `${Math.round((to + x) * 100) / 100}px 0`
    /* The drop's shape rides along on its own spring, from the stretch it
       had under the finger: the landing and the settling are one motion. */
    frames.push({ translate: place, transform: dropStyle(drop, dot) })
    if (Math.abs(x) < 0.05 && Math.abs(v) < 5 && dropSettled(drop)) break
    v += (-SPRING.stiffness * x - SPRING.damping * v) * dt
    x += v * dt
    stepDrop(drop, v / 1000, dt * 1000)
    t += dt
  }
  const rest = `${to}px 0`
  frames.push({ translate: rest, transform: "scale(1, 1)" })
  return { frames, ms: Math.max(1, Math.round(t * 1000)) }
}
/**
 * AND A PRESS DOES NOT TRAVEL.
 *
 * "When I click on the icon, make sure that it doesn't bump, scale, or do any
 * of the movements left and right."
 *
 * A finger sliding along the bar carries the circle with it, and letting go
 * of it springs it into the slot; that is the gesture this was built for. A
 * press is not that gesture. The circle is simply on the
 * icon that was pressed, on the frame it was pressed, with no journey across
 * the bar to watch and nothing to be caught halfway through.
 */
export const NO_TRAVEL = "translate 0s"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE BAR ANSWERS A FINGER, AND IT ANSWERS IT THE SAME WAY EVERY TIME
 * ═══════════════════════════════════════════════════════════════════════════
 * Everything that moved on a press has been taken out of this bar one piece
 * at a time, and taking the last of it out left a control that does not react
 * to being touched at all.
 *
 * So it reacts, in the one way that cannot drift: the lens brightens under
 * the finger. No size, no position, nothing that can be a pixel out.
 *
 * AND IT GOES ON INSTANTLY AND COMES OFF SLOWLY. This is the whole trick, and
 * it is what the old lift got wrong. That was 200ms of easing IN, and a tap
 * lasts about sixty, so it was cut off partway, at a different point every
 * time, which is why a press looked like a different amount of something on
 * every press and read as a glitch. A press that is full the instant a finger
 * lands is the same press whether it is held for a frame or a second. The
 * release is where the easing belongs, because nothing interrupts a release.
 */
/*
 * CLEARER THAN THE BAR, AND LIT. "Should feel more like glass, like iOS
 * 2026." It was a disc of 82% white on a bar of 93% white: a white disc with
 * a ring, which is a badge. Now the fill is thinner and the glass is in the
 * light: its own blur and saturation over what is behind it (LENS_GLASS), a
 * highlight along the top edge and a band of refracted light low inside it
 * (LENS_LIGHT, REST_EDGE), and a soft shadow that lifts it off the bar
 * (DROP). A press still brightens it, by 0.18.
 */
export const PRESS_FILL = "rgba(255,255,255,0.9)"
export const REST_FILL = "rgba(255,255,255,0.72)"
export const LENS_GLASS = "blur(8px) saturate(180%)"
export const LENS_LIGHT =
  "radial-gradient(80% 55% at 50% 4%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 72%)," +
  " radial-gradient(70% 38% at 50% 100%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 75%)," +
  " linear-gradient(180deg, rgba(255,255,255,0) 45%, rgba(16,18,27,0.03) 100%)"
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE LENS ARRIVES AS A COLOUR, THE WAY THE INK DOES
 * ═══════════════════════════════════════════════════════════════════════════
 * With the fades gone the lens was simply THERE, at full strength, on the
 * frame the finger landed, and that is what reads as too direct. The only
 * thing in the bar taking any time at all was the ink filling the icon.
 *
 * It is not dipped back out to fix that. A dip is a thing going away and
 * coming back, on an element that was already where it belonged, and that
 * flicker is the cheapness. This is the other kind of change entirely and it
 * is the one the reference button makes: a colour going from one value to
 * another, once, in one direction. The lens is drawn in no colour at all on
 * the frame it changes slot, and its glass arrives over INK_EASE.
 *
 * ITS OPACITY NEVER MOVES. Not a detail, it is what keeps this from being
 * the fade that was thrown out. The element is fully opaque the whole way
 * through; what changes is the colour painted in it, which is the same thing
 * the icon's ink does, on the same curve, starting on the same frame. One
 * movement of colour across the whole bar.
 */
export const ARRIVING_FILL = "rgba(255,255,255,0)"
/* The glass's edge: light caught along the top, a hairline of shade along
   the bottom, and a rim all round, a touch stronger under a finger. */
export const PRESS_EDGE = "inset 0 1px 0.5px rgba(255,255,255,1), inset 0 -1px 1px rgba(16,18,27,0.06), inset 0 0 0 0.5px rgba(16,18,27,0.08)"
export const REST_EDGE = "inset 0 1px 0.5px rgba(255,255,255,0.95), inset 0 -1px 1px rgba(16,18,27,0.05), inset 0 0 0 0.5px rgba(16,18,27,0.06)"
export const DROP = "0 1px 1.5px rgba(16,18,27,0.08), 0 4px 12px -2px rgba(16,18,27,0.14)"
/** On instantly, off over this. Never the other way round. */
/* The same length and the same curve as the ink, so a press and the icon it
   fills are one movement of colour rather than two of different lengths. */
const PRESS_OFF = "background-color 360ms cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 360ms cubic-bezier(0.22, 0.61, 0.36, 1)"
export const PRESS_ON = "background-color 0s, box-shadow 0s"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE LENS IS SIMPLY ON THE ICON YOU PRESSED
 * ═══════════════════════════════════════════════════════════════════════════
 * It has been three things. It slid across the bar, and the slide overshot
 * and came back by an amount that depended on how fast you tapped, the glitch
 * that started all of this. It teleported, which was correct and read as
 * abrupt. Then it dipped almost out of sight, moved while faint, and came
 * back, which covered the move and put a fade on every press.
 *
 * The fade is what reads as cheap, and it is a wait however short it is. So
 * there is none: on the frame the finger lands the lens is on the icon under
 * it, at full strength, and nothing about it is ever half-visible.
 *
 * Which leaves the change of place in the open, and that is fine, because
 * there is no longer anything to see it happen against. It does not travel,
 * so there is no path to follow; it does not fade, so there is no flicker to
 * catch; and the thing that carries the smoothness is the ink filling the
 * icon over INK_EASE, which starts on the same frame and takes its time.
 */

/**
 * Under a finger the circle LIFTS a little, which is the tell of the newer
 * system bars: the thing you are holding is the thing that is bigger. 4%, so
 * that with the stretch on top (STRETCH_MAX) it is never more than about
 * 1.15 wide.
 */
export const LIFT = 1.04
export const LIFT_EASE = `scale 200ms cubic-bezier(0.32, 0.72, 0, 1)`

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A TAP HAS A LITTLE GIVE
 * ═══════════════════════════════════════════════════════════════════════════
 * "Make tapping an icon feel a touch more satisfying: a subtle press scale,
 * a spring, nothing big." The icon you touch gives under the finger, to 0.9,
 * and springs back through 1.03 to rest, in 420ms.
 *
 * What it is careful not to be is the bump this bar spent so long losing:
 * the lens does not move or grow on a tap (it is still simply on the icon),
 * the glyph does not change its box or its place (a scale about its own
 * centre, on its own `scale` property), and it is the same every time. That
 * last is why it is one fixed animation started on the touch rather than a
 * pressed state eased in and out: a tap is over in sixty milliseconds, so a
 * held squeeze would be cut off at a different depth on every tap, which is
 * exactly what the old lift did. Played by the compositor with no fill, so
 * when it ends nothing is left on the icon.
 */
export const TAP_PULSE: Keyframe[] = [
  { scale: "1", easing: "cubic-bezier(0.3, 0, 0.7, 1)" },
  { scale: "0.9", offset: 0.2, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
  { scale: "1.03", offset: 0.6, easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
  { scale: "1", offset: 1 },
]
export const TAP_PULSE_MS = 420

/**
 * ===========================================================================
 *  A FINGER CAN SLIDE ALONG THIS, NOT ONLY LAND ON IT
 * ===========================================================================
 * "The new iOS feeling, like I can drag left and right."
 *
 * The selector is one circle that lives at the bar's coordinates rather than
 * inside any slot, so it can be anywhere between two of them. Put a finger
 * down and it comes to meet you; slide, and it follows to whichever slot the
 * finger is over, ticking once per slot crossed; lift, and that slot is the
 * one you navigated to.
 *
 * WHY IT IS A POINTER LISTENER AND NOT FIVE onClick HANDLERS. A press is a
 * drag of zero length, there is no second code path for a tap, which is how
 * the two can never disagree about which slot was chosen. And it means the
 * answer to "which one am I on" is a number this component owns for the
 * length of the gesture, so the circle can be drawn anywhere on the way.
 *
 * `touch-action: none` on the bar only. The page under it still scrolls;
 * this is 54px of the screen that has to be able to refuse a horizontal
 * gesture, because a horizontal gesture is what the bar is for.
 */
/**
 * A gesture that has left the bar vertically was never for the bar.
 *
 * The whole strip answers a press, which is what a tab bar does, but a finger
 * that lands on it and then travels right up the screen was trying to reach
 * the card above, and navigating on the lift would be a page change nobody
 * asked for. Sideways has no such limit: sideways is the gesture.
 *
 * HOW FAR IS FAR ENOUGH. It was 72px, a little over one bar. A thumb
 * dragging along a bar at the very foot of the screen does not stay inside
 * 56px of it: the hand rolls, and the glass was following the finger the
 * whole way and then, on the lift, opening nothing. "More accuracy" is partly
 * this. The x is clamped into the bar and the y is ignored while the finger
 * is down (leftFor, move), so tracking never cared; only the lift did. Two
 * bars' worth (120px) is past anything a drag along the bar does and well
 * short of a deliberate reach up into the page.
 *
 * At module scope because the press that misses the bar entirely is held to
 * the same reach (A PRESS THAT FELL THROUGH THE BAR, below).
 */
const ESCAPED = 120

export function useSlide(count: number, onPick: (index: number) => void, onPress?: (index: number) => void) {
  const [at, setAt] = useState<number | null>(null)
  /* Whether the gesture that just ended was a drag, which is what decides
     whether the circle bounces into the slot or lands on it. A route change
     with no gesture behind it lands too. */
  const [bounce, setBounce] = useState(false)
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A PRESS IS NOT A HOLD
   * ═════════════════════════════════════════════════════════════════════════
   * The circle grows under a finger, which is the tell that you are holding
   * something you can drag. It read `dragging` to decide, and `dragging` meant
   * "a finger is down", so every tap grew it and shrank it back with nothing
   * being held: measured at 1.047x, 2.35px across, on a 60ms press.
   *
   * And it was never the same twice. The lift takes 200ms and a tap is over in
   * sixty, so how big it got depended on how long you happened to press, which
   * is the "sometimes" and the "for no reason" in the report. Every check in
   * scripts/check-app-mobile-nav.mjs read the circle's POSITION, which was
   * clean, so none of them ever saw it.
   *
   * This is the gesture actually dragging: false on the way down, true only
   * once a finger has travelled far enough to mean it. The lift, the brighter
   * fill and the glyphs waiting all belong to it. Where the circle IS still
   * belongs to the press, from the moment it lands.
   */
  const [following, setFollowing] = useState(false)
  /* A finger is on the bar. Nothing geometric reads this, it is what the
     lens brightens for, and brightness cannot be a pixel out of place. */
  const [pressed, setPressed] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  /**
   * THE BAR AS IT IS DRAWN, READ OFF THE BAR ITSELF. CSS decides how big the
   * pill is on this phone (--app-nav-*, app/globals.css), and where the lens
   * sits is arithmetic here. Rather than work the size out a second time from
   * the window's width, this reads the three lengths the arithmetic needs
   * from what was drawn: the bar's padding, a tab's width, the lens's width.
   * Read before the first paint, and again when the bar changes size (a
   * phone turned on its side). Null until then, and nothing is placed.
   */
  const [geometry, setGeometry] = useState<Geometry | null>(lastGeometry)
  const geoRef = useRef<Geometry>(lastGeometry ?? { pad: 0, slot: 0, dot: 0 })
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  AND THE BAR'S BOX IS NOT MEASURED AGAIN INSIDE THE GESTURE
   * ═════════════════════════════════════════════════════════════════════════
   * Where the finger is, in the bar's own coordinates, needs the bar's box.
   * Both of the functions that want it (`leftFor`, `slotAt`) used to ask the
   * element for it, and both are called on every pointermove, so a finger
   * moving at the screen's refresh rate forced the browser to lay the page
   * out twice a frame, on the main thread, between the finger and the frame
   * it is drawn in. It is the same box for the whole of a gesture: the bar is
   * fixed to the foot of the screen and `touch-action: none` means nothing
   * under it is scrolling. So it is read once, when the finger lands, and
   * when the bar itself changes size.
   */
  const boxRef = useRef<{ left: number; width: number; top: number; bottom: number } | null>(null)
  const readBox = () => {
    const bar = barRef.current
    if (!bar) return null
    const r = bar.getBoundingClientRect()
    boxRef.current = { left: r.left, width: r.width, top: r.top, bottom: r.bottom }
    return boxRef.current
  }
  useLayoutEffect(() => {
    const bar = barRef.current
    const lens = dotRef.current
    if (!bar || !lens) return
    const read = () => {
      readBox()
      const tab = bar.querySelector("a")
      if (!tab) return
      const next = {
        pad: Number.parseFloat(getComputedStyle(bar).paddingLeft),
        slot: Number.parseFloat(getComputedStyle(tab).width),
        dot: Number.parseFloat(getComputedStyle(lens).width),
      }
      if (!(next.slot > 0) || !(next.dot > 0) || !(next.pad >= 0)) return
      const was = geoRef.current
      if (was.pad === next.pad && was.slot === next.slot && was.dot === next.dot) return
      geoRef.current = next
      lastGeometry = next
      setGeometry(next)
    }
    /*
      ROUND 21: A BAR DRAWN AGAIN STARTS FROM THE LAST BAR'S NUMBERS. The account and the community each draw their own tab bar,
      so Home from the account mounted this one fresh, and its read here laid the whole arriving page out in the commit (100 to
      180ms at 4x CPU, scripts/nav18-real-router). The bar is the same size on the same screen: the last numbers stand, and the
      observer's first report, which comes after the browser's own layout, checks them. Only the very first bar reads at once.
    */
    if (!lastGeometry || typeof ResizeObserver === "undefined") read()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(read)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])
  const lastRef = useRef<number | null>(null)
  /* React state answers a render later; a move handler that asks it whether
     a finger is down can be told no about the finger that just landed. */
  const activeRef = useRef(false)
  /* The circle's left edge in the bar's own coordinates: where the finger
     puts it, where it is drawn, and the frame loop between them. */
  const targetRef = useRef(0)
  const posRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  /* The gap between the circle and the finger when a drag picks it up,
     dying away by CATCH_UP a frame. */
  const offsetRef = useRef(0)
  /* How fast it is going, px per ms, smoothed; and when it was last drawn. */
  const speedRef = useRef(0)
  /* The drop's shape and its spring (A DROP OF WATER, above). */
  const dropRef = useRef<Drop>({ d: 0, dv: 0, dir: 1 })
  const stampRef = useRef(0)
  /* The spring a released drag is on, and the slot it is landing on. */
  const settleRef = useRef<Animation | null>(null)
  const settleToRef = useRef<number | null>(null)

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A TAP IS NOT A ONE-PIXEL DRAG
   * ═════════════════════════════════════════════════════════════════════════
   * Reported as the icons glitching and bumping when you press one to
   * navigate, and it was the circle rather than the icons.
   *
   * The press began by aiming the circle at `leftFor(clientX)`, the point
   * the FINGER landed on. Nobody taps the exact centre of a 55px slot, so the
   * circle set off towards a spot a dozen or twenty pixels off-centre, got
   * part of the way there in the time a tap lasts, and was then written to
   * the slot's centre when the finger lifted. Out and back, every press, by a
   * distance that depends on where in the slot you happened to hit: exactly
   * the "moving, misaligned, bump" in the report, and random-looking for the
   * same reason the last one was.
   *
   * So the finger's own x is only the target once the gesture has proved it
   * is a drag. Until then the target is the centre of the slot under it,
   * which is where the circle is going to end up anyway, so a tap is one
   * movement to one place, and the lift writes the value it already has.
   */
  const movedRef = useRef(false)
  const downXRef = useRef(0)
  /** Past this the gesture is a drag, and the circle belongs under the finger. */
  const DRAG_SLOP = 8

  /** The circle's left edge when it is sitting on a slot. The same function
      the component uses at rest, so the two cannot disagree by a pixel. */
  const leftForSlot = (index: number): number => slotLeft(index, geoRef.current)

  /**
   * The circle's left edge that puts its centre under a finger, kept inside
   * the bar. THE Y IS NOT READ: a finger above or below the bar's row is as
   * accurate as one on it, because only its x is used and that x is clamped
   * into the bar. From the cached box, so this costs no layout.
   */
  const leftFor = (clientX: number): number => {
    const { pad, dot } = geoRef.current
    const box = boxRef.current ?? readBox()
    if (!box) return pad
    const centre = Math.max(pad + dot / 2, Math.min(box.width - pad - dot / 2, clientX - box.left))
    return centre - dot / 2
  }

  const paint = () => {
    const dot = dotRef.current
    if (!dot || posRef.current == null) return
    dot.style.translate = `${Math.round(posRef.current * 100) / 100}px 0`
    dot.style.transform = dropSettled(dropRef.current) ? "" : dropStyle(dropRef.current, geoRef.current.dot)
  }
  /**
   * One frame under a finger: the finger's place, plus what is left of the
   * pick up gap. Runs for as long as the finger is dragging, still or not,
   * so the gap and the stretch both settle while it holds still.
   */
  const step = (now: number) => {
    frameRef.current = 0
    if (posRef.current == null || !activeRef.current) return
    const dt = stampRef.current ? Math.min(64, Math.max(1, now - stampRef.current)) : 16.7
    stampRef.current = now
    offsetRef.current *= Math.pow(CATCH_UP, dt / 16.7)
    if (Math.abs(offsetRef.current) < 0.05) offsetRef.current = 0
    const next = targetRef.current + offsetRef.current
    /* Speed as an average over the last few frames: the finger's own events
       are uneven, and a stretch read off one of them would wobble. */
    const blend = 1 - Math.pow(0.55, dt / 16.7)
    speedRef.current += ((next - posRef.current) / dt - speedRef.current) * blend
    posRef.current = next
    stepDrop(dropRef.current, speedRef.current, dt)
    paint()
    frameRef.current = requestAnimationFrame(step)
  }
  const wake = () => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(step)
  }
  /** Where the circle is drawn right now, mid-spring included, so a press
      during a spring picks it up from where it is rather than where it was going. */
  const drawnAt = (): number | null => {
    const dot = dotRef.current
    if (!dot) return null
    const m = /^(-?[\d.]+)px/.exec(getComputedStyle(dot).translate || "")
    return m ? Number.parseFloat(m[1]) : null
  }
  /**
   * Stop a spring where it is: the drawn place becomes the resting style, so
   * whatever comes next (a drag picking it up, a press moving it) starts
   * from what the eye last saw.
   */
  const stopSettle = () => {
    const a = settleRef.current
    if (!a) return
    const dot = dotRef.current
    const at = drawnAt()
    a.cancel()
    settleRef.current = null
    settleToRef.current = null
    if (dot && at != null) { dot.style.translate = `${at}px 0`; dot.style.transform = "" }
  }
  /**
   * A released drag onto `to`: the spring, from where the circle is and at
   * the speed it had. The resting style is the landing place before the
   * first keyframe plays, so when the spring ends there is nothing to hand
   * over: it is on the slot's exact centre.
   */
  const settle = (to: number) => {
    const dot = dotRef.current
    const from = posRef.current ?? drawnAt()
    if (!dot || from == null) return
    const speed = speedRef.current
    const drop = { ...dropRef.current }
    dropRef.current = { d: 0, dv: 0, dir: drop.dir }
    dot.style.translate = `${to}px 0`
    dot.style.transform = ""
    if (typeof dot.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const { frames, ms } = settleSpring(from, speed, to, geoRef.current.dot, drop)
    const a = dot.animate(frames, { duration: ms, easing: "linear" })
    settleRef.current = a
    settleToRef.current = to
    a.onfinish = () => { if (settleRef.current === a) { settleRef.current = null; settleToRef.current = null } }
  }

  const slotAt = (clientX: number): number => {
    const box = boxRef.current ?? readBox()
    if (!box) return 0
    const pad = geoRef.current.pad
    const inner = box.width - pad * 2
    const x = clientX - box.left - pad
    return Math.max(0, Math.min(count - 1, Math.floor((x / inner) * count)))
  }
  /* `slotNearest`, which read a slot back out of the circle's own position, went
     with the projection: the finger's position is the only thing that picks now. */

  const escaped = (clientY: number): boolean => {
    const box = boxRef.current ?? readBox()
    if (!box) return false
    return clientY < box.top - ESCAPED || clientY > box.bottom + ESCAPED
  }

  const move = (clientX: number) => {
    if (!movedRef.current && Math.abs(clientX - downXRef.current) > DRAG_SLOP) {
      movedRef.current = true
      /* Pick the circle up from where it is drawn (a spring still running
         included), so following it on starts where the eye last saw it, and
         carry the gap to the finger as an offset that dies away. */
      stopSettle()
      const drawn = drawnAt() ?? leftFor(clientX)
      posRef.current = drawn
      offsetRef.current = drawn - leftFor(clientX)
      speedRef.current = 0
      dropRef.current = { d: 0, dv: 0, dir: 1 }
      stampRef.current = 0
      setFollowing(true)
      /* And a drag, released, is the gesture the spring was asked for. */
      setBounce(true)
    }
    const next = slotAt(clientX)
    if (movedRef.current) {
      /* Under the finger, one to one, every frame, with no transition to be
         a delay. */
      targetRef.current = leftFor(clientX)
      wake()
    }
    /* A press writes nothing here. `at` below moves the slot, and the effect
       that draws the resting position puts the circle on it, in one frame. */
    if (lastRef.current !== next) {
      /*
        THE FIRST TICK OF A GESTURE IS THE DECISIVE ONE, and it is the moment
        a finger lands. A tap used to fire twice, light going down, medium
        coming up, sixty milliseconds apart, which is a stutter rather than a
        tick. One tick, at the instant of contact, at the same moment the lens
        brightens and the icon fills, so the touch and the answer are the same
        event. The lighter ticks are the slots counted off under a finger that
        is dragging, which is a different thing and still worth feeling.
      */
      const first = lastRef.current === null
      lastRef.current = next
      /*
        A RENDER ONLY FOR THE PRESS, NEVER FOR A SLOT CROSSED UNDER A DRAG.
        The slot under the finger is what lays the glass down on a press, so
        the press renders. A DRAG does not: the glass is written straight to
        the element by the frame loop below, and the glyphs deliberately wait
        for the pick (THE GLYPHS DO NOT CHANGE UNDER A MOVING FINGER), so a
        render on each of the three slots a drag across the bar crosses
        changed nothing on the screen and put a whole React render inside the
        gesture. That is where the dropped frame in a slow drag came from,
        measured at 33ms against a 16.7ms budget. The tick still counts the
        slots off, which is the part a thumb can feel.
      */
      if (!movedRef.current) setAt(next)
      /*
        LIGHT IS THE FLOOR, AND THAT IS A PROPERTY OF THE PHONE.

        These went medium, then light, then soft, and soft turned the bar
        silent. Not broken: soft is selection feedback, the generator behind a
        picker wheel, and it is so slight that on a real device it could not
        be felt at all. The plugin has three impact styles, Heavy, Medium and
        Light, and nothing between Light and selection, so Light is the
        quietest thing here that a thumb can actually notice.

        So the tick a press makes is Light, and the only place selection
        feedback still earns its keep is counting slots off under a finger
        that is dragging, there are several of those in a row, and slight is
        exactly right when they come in a stream.
      */
      hapticTap(first ? "light" : "soft")
    }
  }

  const end = () => {
    if (!activeRef.current) return
    activeRef.current = false
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    posRef.current = null
    stampRef.current = 0
    /* Round again as it lets go: the spring that lands it (the pill's layout
       effect, settleTo) starts from the stretch its speed gives it, in the
       same frame, so this is never painted on its own. */
    if (dotRef.current) dotRef.current.style.transform = ""
    setFollowing(false)
    setPressed(false)
    setAt(null)
    lastRef.current = null
    movedRef.current = false
  }

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }, [])

  /**
   * Land a released drag on `to`, once: a spring already landing there is
   * left to finish, and a circle already resting there has nowhere to go.
   */
  const settleTo = (to: number) => {
    if (settleToRef.current === to) return
    stopSettle()
    const at = drawnAt()
    if (at != null && Math.abs(at - to) < 0.05 && Math.abs(speedRef.current) < 0.01 && dropSettled(dropRef.current)) {
      if (dotRef.current) dotRef.current.style.translate = `${to}px 0`
      return
    }
    posRef.current = at
    settle(to)
    posRef.current = null
  }

  /* The spring's controls, for the pill's layout effect: one ref for the life
     of the bar, its contents refreshed each render (they read only refs). */
  const motion = useRef({ settleTo, stopSettle, settlingTo: () => settleToRef.current })
  motion.current = { settleTo, stopSettle, settlingTo: () => settleToRef.current }

  return {
    barRef,
    dotRef,
    geometry,
    following,
    pressed,
    bounce,
    at,
    motion,
    /* Whether a finger is on the bar right now, as a ref: read from a window
       listener, which runs before this component could be told anything. */
    down: activeRef,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        /* Keeps the moves coming even when the finger leaves the bar, which
           it will: 54px is not much to stay inside of. */
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        /* The one measurement of the gesture (AND THE BAR'S BOX IS NOT
           MEASURED AGAIN INSIDE THE GESTURE): everything after this reads it. */
        readBox()
        activeRef.current = true
        /* Left null: the loop paints nothing until a finger proves it is
           dragging, so a press never animates. */
        posRef.current = null
        setPressed(true)
        /* Every gesture starts as a press: no lift, and it lands rather than
           bouncing. Both are promoted if a finger goes anywhere. */
        setFollowing(false)
        setBounce(false)
        lastRef.current = null
        movedRef.current = false
        downXRef.current = e.clientX
        move(e.clientX)
        onPress?.(slotAt(e.clientX))
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!activeRef.current) return
        move(e.clientX)
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (!activeRef.current) return
        const dragged = movedRef.current
        /*
          IT LANDS ON THE TAB UNDER THE FINGER, AND ONLY THAT.
          ────────────────────────────────────────────────────
          A drag used to pick the slot the circle was HEADING for: where it
          stood, projected PROJECT_MS on at the speed it had. That reads
          well on a scroller, where momentum is the point, but this is a
          row of four targets, and it meant a quick flick opened the tab
          PAST the one you stopped on. "When I drop it, it lands on that
          thing I want to click."

          So the pick is the slot the finger is over when it lifts, for a
          drag exactly as for a tap: what you are pointing at is what
          opens, every time, however fast you got there. The glass still
          springs over on its own curve, so letting go still feels thrown
          rather than cut; only the choice is no longer a guess about
          where you were going.
        */
        const picked = slotAt(e.clientX)
        const away = escaped(e.clientY)
        end()
        if (away) return
        /* A drag lands, and landing is worth a tick of its own. A tap already
           ticked, at the better moment: when the finger arrived. */
        if (dragged) hapticTap("light")
        onPick(picked)
      },
      onPointerCancel: end,
      /* Capture can be taken away by the system, a call arriving, a gesture
         the shell claims. Without this the bar would believe a finger is
         still on it and keep drawing the circle under one that has gone. */
      onLostPointerCapture: end,
    },
  }
}

/**
 * ===========================================================================
 *  WHERE THE LENS RESTS, AND HOW IT ARRIVES THERE
 * ===========================================================================
 * Everything a bar of tabs needs between a finger and a route: the slide
 * (useSlide above), the pick remembered until the page arrives, the pulse on
 * the icon pressed, and the lens laid down on its slot, emptied for the frame
 * it changes slot and filled back over the ink's curve.
 *
 * It was the body of the /app pill, and it moved here unchanged so the buyer
 * bar outside /app (components/nav/buyer-tab-bar.tsx) answers a finger the
 * same way rather than with a copy that drifts the first time either is
 * tuned. What differs between the two bars is only what they look like and
 * where a pick goes, which is what the arguments are:
 *
 *   count      how many slots
 *   current    the slot of the page you are on, or -1 for none
 *   heading    the slot the navigation underway is going to, -1 for a page
 *              with no slot, null with none underway
 *   nav        the navigation underway, or null: a pick stops being
 *              remembered once a navigation that is not it ends
 *   onPick     a slot was chosen (the finger lifted on it, or Enter). It
 *              may REFUSE: `false`, or a promise of one, means the pick did
 *              not happen and nothing moves: not the lens, not the route.
 *              The /app pill refuses while the page it is leaving is asking
 *              whether its unsaved work may be thrown away
 *              (lib/ui/leave-guard); a bar with nothing to ask returns
 *              nothing and every pick is taken, as it always was.
 *   onPress    a finger landed on a slot: the head start for its page
 *   give       whether the tapped icon gives a little (TAP_PULSE); the
 *              buyer's bar asks for none
 *   onSwallowed  a press this bar had to take back off the screen (A PRESS
 *              THAT FELL THROUGH THE BAR, below), before the rest of the
 *              gesture: the caller's chance to give the screen back
 */
/**
 * Is the document a photograph right now? A running view transition draws the
 * page as pictures and hit tests none of it, which is the whole of why a tap
 * on a tab can reach nothing (see below). React says so on the document while
 * one of its own runs, and it says so from the moment the pictures are taken,
 * which is earlier than any mark a page puts up for itself.
 */
function screenIsAPicture(): boolean {
  if (typeof document === "undefined") return false
  return !!(document as Document & { __reactViewTransition?: unknown }).__reactViewTransition
}

/**
 * A click this long after a pick is not that pick's own click: the gesture
 * that picked was over, and this one is a press the pointer handlers never
 * answered. Generous, because a click follows its pointerup by a frame or
 * two and a slow phone can stretch that.
 */
const CLICK_AFTER_PICK_MS = 400

export function useTabLens({
  count,
  current,
  heading,
  nav,
  onPick,
  onPress,
  give = true,
  onSwallowed,
}: {
  count: number
  current: number
  heading: number | null
  nav: unknown
  onPick: (index: number) => void | boolean | Promise<boolean>
  onPress?: (index: number) => void
  /** Whether a tapped icon gives a little (TAP_PULSE). The buyer's bar turns it off. */
  give?: boolean
  onSwallowed?: () => void
}) {
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE CIRCLE DOES NOT SNAP BACK WHILE THE PAGE IS STILL ARRIVING
   * ═══════════════════════════════════════════════════════════════════════
   * This is the glitch. Press Products: the circle follows the finger to
   * Products. Lift: the gesture is over, the drag's own answer is thrown
   * away, and `current` is still HOME, because the route has not changed
   * yet, so the circle springs all the way back to the first slot, waits
   * for the navigation, and then travels to Products a second time.
   *
   * Reported as "randomly glitchy when I click on icons", and random is
   * exactly right: how far it goes back and how long it stays there depend
   * on how quickly the route resolves, which is different every time.
   *
   * So a pick is remembered until the route catches up with it, for as long
   * as its navigation is underway, however long that is. It used to be let go
   * of after 1500ms on a timer, which put the glitch back on every page that
   * took longer than that: the circle went home at 1.5s and came out again
   * when the page landed. Now it is let go of when the route arrives, when
   * the navigation ends without arriving (it failed, or was sent somewhere
   * else), or when another navigation replaces it. The timer is left only for
   * a pick that no navigation record ever answered.
   */
  const [pending, setPending] = useState<number | null>(null)
  const answered = useRef(false)
  useEffect(() => {
    if (pending == null) return
    if (current === pending) { setPending(null); return }
    if (heading === pending) { answered.current = true; return }
    if (nav || answered.current) { setPending(null); return }
    const t = window.setTimeout(() => setPending(null), 1500)
    return () => window.clearTimeout(t)
  }, [pending, current, heading, nav])

  /* When the last pick was made, so a click the gesture already answered is
     not answered a second time (THE LINK IS THE LAST WAY IN, below). */
  const pickedAt = useRef(0)
  /*
    A PICK THE CALLER REFUSED IS NOT A PICK. The lens moves to the slot the
    finger chose and stays there until the page arrives, which is right for a
    pick that is going to happen and wrong for one that is not: a tab over the
    product editor asks before it throws unsaved work away, and the lens
    sliding over to Home and back again while the question is on the screen
    answers it before the reader does. So the slot is remembered only once the
    caller has taken the pick.
  */
  const pick = (index: number) => {
    if (index < 0 || index >= count) return
    pickedAt.current = performance.now()
    const take = () => {
      answered.current = false
      setPending(index)
    }
    const taken = onPick(index)
    if (taken === false) return
    if (taken && typeof (taken as Promise<boolean>).then === "function") {
      void (taken as Promise<boolean>).then((yes) => { if (yes) take() })
      return
    }
    take()
  }

  /**
   * THE LINK IS THE LAST WAY IN. Each tab is a real link whose click this
   * bar prevents, because the POINTER gesture is what decides. A gesture the
   * browser took back (a pointercancel, because the system claimed it or
   * the content under the finger changed) never reaches the lift that picks,
   * and that tap did nothing at all. The click still arrives, so it picks
   * when the gesture did not, which is also how Enter and Space on a focused
   * link work (`detail === 0`, a click no pointer made).
   */
  const pickFromClick = (index: number, detail: number) => {
    if (detail === 0 || performance.now() - pickedAt.current > CLICK_AFTER_PICK_MS) pick(index)
  }

  /* The page under the finger starts coming the moment it lands, not when it
     lifts: the length of the tap is a head start for the server, and a page
     already warm is not fetched again (prefetchAppPage). */
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const pulse = (index: number) => {
    const glyph = linkRefs.current[index]?.firstElementChild as HTMLElement | null | undefined
    if (!glyph || typeof glyph.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    for (const a of glyph.getAnimations()) if (a.id === "tap") a.cancel()
    const a = glyph.animate(TAP_PULSE, { duration: TAP_PULSE_MS })
    a.id = "tap"
  }
  const slide = useSlide(count, pick, (index) => {
    if (give) pulse(index)
    onPress?.(index)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  A PRESS THAT FELL THROUGH THE BAR IS STILL THE BAR'S
   * ═══════════════════════════════════════════════════════════════════════
   * "Sometimes when I'm on the add new product page, or on the edit product
   * page, the mobile bottom navigation pill, when I click it, doesn't work
   * sometimes to navigate."
   *
   * The handlers above only run when the browser hit tests the press onto the
   * bar, and while a VIEW TRANSITION is running it hit tests nothing at all:
   * the document is a photograph and the whole of it is untouchable, the bar
   * included. Measured against the real product editor rising over the real
   * list (scripts/check-pill-nav-from-editor.mjs): from 166ms after the press
   * on a product to 730ms, document.elementFromPoint at the centre of a tab,
   * and at the middle of the screen, is <html>, and every event of a tap in
   * that window is dispatched on <html>. 20 of 20 taps mid-rise went nowhere.
   *
   * So the bar also answers a press that FELL THROUGH it. Three ways in, all
   * on the window in the capture phase, because nothing in the page is going
   * to see these:
   *
   *   a press that landed on nothing inside the bar's box, and its lift;
   *
   *   a lift, for a gesture that started ON the bar while the screen was
   *   still live and ended inside the transition: the browser takes the
   *   pointer capture back when the bar stops being painted, the bar ends
   *   the gesture as though the system had claimed it, and the lift that
   *   follows is dropped. While the bar still holds the press it answers it
   *   itself, projection and all; once it has let go, this does;
   *
   *   a cancel the MACHINE sent. The bar is `touch-action: none`, so the
   *   browser never takes a gesture on it for a scroll; a cancel of a gesture
   *   the bar has already let go of, while a transition runs, is the
   *   transition taking the tap away, and it is answered like a lift. A
   *   cancel anywhere else ends the gesture as it always did.
   *
   * WHAT COUNTS AS "FELL THROUGH": the press's target CONTAINS the bar, so
   * nothing inside that element, the bar included, took it. <html> is what
   * a press on a photograph hits, and an engine that lands on <body> or on
   * the shell's own box says the same thing. Anything drawn OVER the bar on
   * purpose (a sheet's scrim) is a sibling, never an ancestor, and its press
   * is its own. And only while the bar is a bar: whatever turns its pointer
   * events or its visibility off in the stylesheet is read here rather than
   * kept as a second copy of when a sheet is up.
   */
  const rescue = useRef({ pick, pickFromClick, geometry: slide.geometry, letGo: slide.handlers.onPointerCancel, onSwallowed })
  rescue.current = { pick, pickFromClick, geometry: slide.geometry, letGo: slide.handlers.onPointerCancel, onSwallowed }
  useEffect(() => {
    /*
      STRICTLY AN ANCESTOR. `Node.contains` counts the node itself, and a
      gesture the bar has captured reports the BAR as the target of every
      event in it: a flick released over Products would have been read here as
      a press that fell through, and answered with the slot under the finger
      instead of the one the drag was heading for (scripts/check-app-mobile-nav
      flicks past a slot and watches where it goes). A gesture that started on
      the bar is answered by `began` below, not by this.
    */
    const fellThrough = (e: PointerEvent, bar: HTMLElement) =>
      e.target instanceof Node && e.target !== bar && e.target.contains(bar)
    /** The bar, when a press that reached nothing belongs to it; nothing otherwise. */
    const barFor = (e: PointerEvent): HTMLElement | undefined => {
      const bar = slide.barRef.current
      if (!bar || !bar.isConnected) return
      /* It reached the bar after all: its own handlers have it. */
      if (e.target instanceof Node && bar.contains(e.target)) return
      if (!fellThrough(e, bar)) return
      const style = window.getComputedStyle(bar)
      if (style.pointerEvents === "none" || style.visibility === "hidden") return
      return bar
    }
    const boxOf = (bar: HTMLElement) => bar.getBoundingClientRect()
    /** The slot a point is over, the way the bar's own slotAt reads it. */
    const slotOf = (bar: HTMLElement, clientX: number): number => {
      const box = boxOf(bar)
      const pad = rescue.current.geometry?.pad ?? 0
      const inner = Math.max(1, box.width - pad * 2)
      const x = clientX - box.left - pad
      return Math.max(0, Math.min(count - 1, Math.floor((x / inner) * count)))
    }
    /* The bar's own rule for a gesture that left it: sideways is the gesture, 72px up or down is not. */
    const inReach = (e: PointerEvent, bar: HTMLElement) => {
      const box = boxOf(bar)
      return e.clientY >= box.top - ESCAPED && e.clientY <= box.bottom + ESCAPED
    }
    /* A press that fell through, ours from the moment it landed. */
    let held: number | null = null
    /*
      And a press that landed ON the bar, which is the bar's, until the bar
      lets go of it without answering. It captures the pointer, and a captured
      gesture keeps being delivered even while the document is a photograph;
      but the browser takes the capture back when the element it is on stops
      being painted, which is exactly what a transition does, and the bar
      then ends the gesture as though the system had claimed it
      (onLostPointerCapture). The lift that follows reaches the bar's own
      handler and is dropped, because the bar no longer believes a finger is
      on it. So: while the bar still has the press it answers it, drag
      projection and all; once it has let go, this does.
    */
    let began: number | null = null
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      const onBar = slide.barRef.current
      if (onBar?.isConnected && e.target instanceof Node && onBar.contains(e.target)) { began = e.pointerId; return }
      const bar = barFor(e)
      if (!bar) return
      const box = boxOf(bar)
      if (box.width <= 0 || e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) return
      held = e.pointerId
      hapticTap("light")
      /* The screen comes back under the finger on this frame rather than when whatever is moving ends. */
      rescue.current.onSwallowed?.()
    }
    /** Did this gesture start on the bar and get let go of before it was answered? */
    const abandoned = (e: PointerEvent) => began === e.pointerId && !slide.down.current
    const up = (e: PointerEvent) => {
      const mine = held === e.pointerId
      const ours = !mine && abandoned(e)
      held = null
      if (began === e.pointerId) began = null
      if (!mine && !ours) return
      const bar = slide.barRef.current
      if (!bar || !bar.isConnected) return
      if (!inReach(e, bar)) return
      rescue.current.pick(slotOf(bar, e.clientX))
    }
    const lose = (e: PointerEvent) => {
      const mine = held === e.pointerId
      /* A cancel the MACHINE sent, not the reader: only while the screen is a picture. */
      const ours = !mine && abandoned(e) && screenIsAPicture()
      held = null
      if (began === e.pointerId) began = null
      if (!mine && !ours) return
      const bar = slide.barRef.current
      if (!bar || !bar.isConnected) return
      if (!inReach(e, bar)) return
      rescue.current.pick(slotOf(bar, e.clientX))
    }
    /*
      AND THE CLICK, WHICH FALLS THROUGH TOO. A tap the transition swallowed
      whole sends its click past the bar as well, so the tab's own link never
      sees it either and the last way in is shut with the rest. Held to the
      same rule as the link's (pickFromClick): it picks only when the pointer
      gesture did not, so a tap the bar has already answered is not answered
      twice.
    */
    const clicked = (e: MouseEvent) => {
      const bar = slide.barRef.current
      if (!bar || !bar.isConnected) return
      if (!(e.target instanceof Node) || e.target === bar || !e.target.contains(bar)) return
      const style = window.getComputedStyle(bar)
      if (style.pointerEvents === "none" || style.visibility === "hidden") return
      const box = boxOf(bar)
      if (box.width <= 0 || e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) return
      rescue.current.pickFromClick(slotOf(bar, e.clientX), e.detail)
    }
    window.addEventListener("pointerdown", down, true)
    window.addEventListener("pointerup", up, true)
    window.addEventListener("pointercancel", lose, true)
    window.addEventListener("click", clicked, true)
    return () => {
      window.removeEventListener("pointerdown", down, true)
      window.removeEventListener("pointerup", up, true)
      window.removeEventListener("pointercancel", lose, true)
      window.removeEventListener("click", clicked, true)
    }
  }, [count, slide.barRef, slide.down])
  /* Under the finger while one is down, then on the slot that was picked,
     then on the page being opened, then on the page you are actually on. The
     third is what answers a press anywhere else (a menu row, a link in the
     page) on the press, rather than when the page arrives. */
  const marked = slide.at ?? pending ?? heading ?? current
  /*
    THE GLYPHS DO NOT CHANGE UNDER A MOVING FINGER. The circle follows the
    finger; the fill and the ink colour follow only what has been COMMITTED.
    Cross-fading four glyphs on every slot the circle crossed is what read as
    "icons glitch, scale randomly, jumpy": each crossing flipped a line glyph
    to a filled one and back within a frame or two. The system bars this is
    modelled on do the same thing, the lens moves, the icons wait.
  */
  const shown = slide.following ? (pending ?? heading ?? current) : marked

  /**
   * Where it FADES OUT, which is not where slot zero is.
   *
   * On a page with no slot of its own, Analytics, say, the circle has
   * nothing to sit on and goes. Reading its position as 0 at that moment
   * would send it flying back to Home as it shrank, which is a second thing
   * moving for no reason. It shrinks where it stands.
   */
  const restRef = useRef(0)
  if (marked >= 0) restRef.current = marked
  const restSlot = marked >= 0 ? marked : restRef.current
  /* In screen pixels, at the size the bar is drawn on this phone; null until it has been measured. */
  const x = slide.geometry ? slotLeft(restSlot, slide.geometry) : null
  /*
    The circle's position is never a style prop. Under a finger the frame
    loop in useSlide writes it straight to the element, and a prop rendered
    on the way would either fight that or, on the lift, be the same string
    React last rendered and so never be written at all, leaving the circle
    the few pixels off where the loop left it. So at rest the position is
    written here, after the render, from wherever the loop left it to the
    slot it belongs on: by the spring after a drag, in one step otherwise.
  */
  /*
    Where the lens was last put down, so a change of slot can be told from a
    re-render that changes nothing, only the first of those is a hand-over.
  */
  /*
    Which slot the glass was last laid down on, so a change of slot can be
    told from a re-render that changes nothing: only the first of those is an
    arrival. A slot and not a position, so a bar that changes size (the first
    measurement, a phone turned on its side) moves the glass with it rather
    than fading it out and in again.
  */
  const laidAt = useRef(restSlot)
  const [arriving, setArriving] = useState(false)
  /*
    AND WHILE THE GLASS IS COMING IN, IT IS THE INK'S CURVE THAT RULES.

    A press makes the lens brighten instantly, on purpose: easing that IN is
    what made the old lift a different amount on every press, because a tap is
    over in sixty milliseconds and interrupts it. But both of those are
    background-color on the same element, so the press's instant was
    swallowing the arrival as well and the glass was switched on rather than
    filling. Measured as zero values between empty and full.

    So an arrival says so for as long as it lasts, and wins.
  */
  const [filling, setFilling] = useState(false)
  useLayoutEffect(() => {
    if (slide.following) { laidAt.current = restSlot; return }
    const dot = slide.dotRef.current
    if (!dot || x == null) return
    const lay = () => { dot.style.translate = `${x}px 0`; laidAt.current = restSlot }
    /* A released drag brings its own arrival with it: it springs onto the
       slot from where the finger left it, at the finger's speed (settleTo,
       once per landing place). */
    if (slide.bounce) { slide.motion.current.settleTo(x); laidAt.current = restSlot; return }
    /* A lens already where it belongs has not moved. */
    if (laidAt.current === restSlot) { lay(); return }
    /* One frame with no colour in it, and the next one somewhere else, where
       the glass comes in. The move is invisible because there is nothing
       painted to see move. A spring still landing somewhere else stops, or
       it would carry on over the new place until it ended. */
    if (!arriving) { setArriving(true); return }
    if (slide.motion.current.settlingTo() != null) slide.motion.current.stopSettle()
    lay()
    setFilling(true)
    const id = requestAnimationFrame(() => setArriving(false))
    return () => cancelAnimationFrame(id)
  }, [x, restSlot, arriving, slide.following, slide.bounce, slide.dotRef, slide.motion])
  useEffect(() => {
    if (!filling) return
    const t = window.setTimeout(() => setFilling(false), INK_MS)
    return () => window.clearTimeout(t)
  }, [filling, x])

  return {
    slide,
    pick,
    pickFromClick,
    /** Forget a pick: something other than a tab is taking the page elsewhere. */
    release: () => setPending(null),
    linkRefs,
    marked,
    shown,
    arriving,
    filling,
  }
}
