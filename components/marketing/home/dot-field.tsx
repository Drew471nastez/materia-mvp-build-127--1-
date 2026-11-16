"use client"

/*
  A FIELD OF FAINT DOTS FOR A DARK OR PURPLE GROUND.

  Landing round 4 drew a strict CSS grid of dots with a light drifting
  through it. Landing round 5, the owner: "smoother, dispersed, clean, and
  work with the mouse as I move, very smooth, in real time, more subtle".
  Landing round 7, the owner: the purple stretch and the closing call "had
  some patterns, smooth, flowing, following the mouse cursor and going auto
  there, very subtle": bring them back, more subtle and clean.

  So it is one <canvas>:

    dots     an even grid of `gap` px, centred in the box: clean, no clumps.
    flow     a soft wave of light flows slowly across the grid by itself,
             two long sine waves bent into each other, so the bands drift
             and curl like a current instead of marching. Each dot also
             rides the wave by under a pixel.
    pointer  where a mouse is, the dots within ~180px brighten a little and
             part around it. The pointer is followed with a lerp in the
             frame loop, so the light glides after the hand instead of
             jumping with it. When the mouse leaves, the light eases out.
    touch    no pointer to follow: the same soft light wanders very slowly
             on its own (a long Lissajous path), at half strength.
    fade     the field fades out toward the edges or the bottom (a static CSS
             mask on the box), so it never ends in a hard line.

  What it costs: one canvas the size of its box at no more than 1.5 device
  pixels per CSS pixel; the dots drawn in batches by alpha (24 fills a
  frame, no per-dot style changes). The loop runs only while the box is on
  screen and the tab is visible (an IntersectionObserver and
  visibilitychange). While a mouse is moving it draws at up to 60
  frames a second (a 120Hz screen draws every other frame, evenly); with no
  mouse, the flow and the wandering light move under a pixel a frame, so 30
  a second look the same and cost half. The pointer's lerp is timed by dt.
  Each dot's place in the two waves is worked out once, on resize, so a
  frame is two sines a dot.
  Nothing is React state: the loop writes the canvas and nothing else, and
  it reads no layout (the box's place on the page is read on resize and at
  most twice a second while the mouse moves). Reduced motion: one still
  frame.

  Landing round 8, the owner, of the closing call: the dots "a little more
  visible, just a little bit", "they can autoplay motion graphics alone,
  and also follow the mouse", and smoother and cleaner. So:

    visible  the dark tone rests at 0.19 (was 0.15) and lights to 0.46
             (was 0.4); the purple sheet's tone is unchanged.
    round    each dot is a small round dot (an arc), not a 1.25px square
             that read as a pixel, in 32 levels of brightness (was 24), so
             the bands of the flow shade smoothly.
    alone    the light wanders through the field by itself at 0.6 of its
             strength on every device, mouse or not, so the field moves
             with nobody touching it.
    mouse    while the mouse is over the field the light glides after it at
             full strength; when the mouse leaves the field (it is compared
             with the box's place, already known, never measured in the
             loop) the light glides back onto its own path. No jump either
             way: the same dt-timed lerp carries every change.
    even     it draws at up to 60 frames a second whenever it runs (a 120Hz
             screen draws every other frame, evenly), not 30 when only the
             flow moves: at 30 the wandering light stepped.
    close    fade="close" (the closing call): faded at the sides like
             "edges" and well before the bottom, so the section's dots are
             gone by the time the footer starts.

  Landing round 11, the owner, of the closing call: "the pattern dots
  should be more smooth and clean and more visible at the bottom as well"
  (the AI tools card got a still grid of the same dots, in its own file).
  So:

    visible  the dark tone rests at 0.34 (was 0.19) and lights to 0.68
             (was 0.46), and the trough of the flow keeps 45% of a
             dot (was 30%); the purple sheet's tone is unchanged.
    clean    each dot stands still on its point of the grid: the flow and
             the light change only its brightness (the parting under the
             light stays). A sub-pixel drift of a 0.8px dot is what read as
             shimmer. And the canvas is drawn at up to 2 device pixels per
             CSS pixel (was 1.5), so a dot is a round dot on a phone's
             screen, not a soft blur scaled up.
    bottom   fade="close" keeps the field to the section's foot: faded at
             the sides, clear down the middle to the bottom, and only the
             last 56px fade out, so no edge meets the footer's hairline.

  Landing round 6 (performance, the owner: the page lags and stutters): the
  drawing left the page's thread. The engine is dot-field-engine.ts (no DOM;
  every number above lives there, one config object per look), run in a Web
  Worker on OffscreenCanvases (dot-field-worker.ts, started by
  dot-field-driver.ts) and on this thread only where the browser cannot hand a
  canvas over. This file keeps the markup and the CSS; dot-field-mount.ts is
  the page's side: it makes the canvases (tiles of 640px, so a tall box is
  never one huge canvas and what is off screen is neither drawn nor looped),
  observes visibility and size, sends the mouse at most once a frame, and
  pauses the field under a sheet that covers it.

  Put <DotField /> as the first child of a dark block that is a stacking
  context (position plus z-index, or isolation: isolate); it fills it,
  behind everything else (z-index -1, pointer-events: none). `style` can
  limit it, e.g. to the top of a tall block.

    <DotField />                      dots, edges faded
    <DotField fade="bottom" gap={16} tone="purple" />
*/

import { useEffect, useRef, type CSSProperties } from "react"
import { mountDotField } from "./dot-field-mount"
import { DOT_FIELD_MAX_DPR, DOT_FIELD_TONES, dotFieldFlow, dotFieldPoints } from "./dot-field-engine"

/** The tones, the largest device pixel ratio and the dots' maths live in the engine (worker safe); re-exported here, where they were. */
export { DOT_FIELD_MAX_DPR, DOT_FIELD_TONES, dotFieldFlow, dotFieldPoints }

export const DOT_FIELD_CSS = `
.dotf{position:absolute;inset:0;z-index:-1;overflow:clip;pointer-events:none}
.dotf[data-fade="edges"]{-webkit-mask-image:radial-gradient(120% 90% at 50% 45%,#000 35%,transparent 80%);mask-image:radial-gradient(120% 90% at 50% 45%,#000 35%,transparent 80%)}
.dotf[data-fade="close"]{-webkit-mask-image:linear-gradient(#000 calc(100% - 56px),transparent),radial-gradient(120% 135% at 50% 42%,#000 42%,transparent 82%);-webkit-mask-composite:source-in;mask-image:linear-gradient(#000 calc(100% - 56px),transparent),radial-gradient(120% 135% at 50% 42%,#000 42%,transparent 82%);mask-composite:intersect}
.dotf[data-fade="bottom"]{-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 100%);mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 100%)}
.dotf canvas{position:absolute;left:0;display:block;width:100%;opacity:0;transition:opacity .9s ease-out}
.dotf canvas[data-drawn]{opacity:1}
@media (prefers-reduced-motion:reduce){.dotf canvas{transition:none}}
`

export function DotField({
  gap = 18,
  fade = "edges",
  tone = "dark",
  className,
  style,
}: {
  /** Distance between dots in CSS pixels. Default 18. */
  gap?: number
  /** Where the field fades out: toward every edge, toward the bottom, toward the sides and well before the bottom (the closing call), or not at all. */
  fade?: "edges" | "bottom" | "close" | "none"
  /** "dark" for a near-black ground, "purple" for the brand purple. */
  tone?: "dark" | "purple"
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = ref.current
    if (!box) return
    return mountDotField(box, { kind: tone, gap, pointer: "window" })
  }, [gap, tone])

  return (
    <div ref={ref} className={`dotf${className ? ` ${className}` : ""}`} data-fade={fade === "none" ? undefined : fade} data-tone={tone} style={style} aria-hidden="true">
      <style href="dot-field" precedence="default">
        {DOT_FIELD_CSS}
      </style>
    </div>
  )
}
