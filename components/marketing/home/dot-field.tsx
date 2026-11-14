"use client"

/*
  A FINE DOT GRID FOR A DARK OR PURPLE GROUND (landing round 4).

  The owner liked the dark grounds of a merch platform's site: a fine grid of
  faint dots behind the content, softly alive. This is that, small and
  reusable: put <DotField /> as the first child of a dark block that is a
  stacking context (position plus z-index, or isolation: isolate) and it
  fills it, behind everything else in it (z-index -1, pointer-events: none).
  `style` can limit it, e.g. to the top of a tall block: keep it about a
  screen or two tall, since its light is one composited layer.

    dots    one CSS radial-gradient repeated every `gap` px: a dim dot per cell.
    light   the same grid again, a little brighter, cut out of a wide soft
            light that drifts slowly across the block. The grid is a mask
            that never moves; only the light inside it moves, by transform,
            so it runs on the compositor and the dots never shift.
    fade    the whole field fades out toward the edges (or the bottom), so it
            never ends in a hard line.

  It drifts only while it is on screen and the tab is visible (an
  IntersectionObserver writes data-run; no React state, nothing per frame on
  the page's thread). Under reduced motion the light rests in the middle.

    <DotField />                      dots, edges faded
    <DotField fade="bottom" gap={16} tone="purple" />
*/

import { useEffect, useRef, type CSSProperties } from "react"

export const DOT_FIELD_CSS = `
.dotf{position:absolute;inset:0;z-index:-1;overflow:clip;pointer-events:none;--dotf-gap:14px;--dotf-dot:rgba(255,255,255,.11);--dotf-lit:rgba(255,255,255,.55)}
.dotf[data-tone="purple"]{--dotf-dot:rgba(221,214,254,.14);--dotf-lit:rgba(237,233,254,.7)}
.dotf[data-fade="edges"]{-webkit-mask-image:radial-gradient(120% 90% at 50% 45%,#000 35%,transparent 80%);mask-image:radial-gradient(120% 90% at 50% 45%,#000 35%,transparent 80%)}
.dotf[data-fade="bottom"]{-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 100%);mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 100%)}
.dotf-dots,.dotf-lit{position:absolute;inset:0}
.dotf-dots{background-image:radial-gradient(circle at 50% 50%,var(--dotf-dot) 0 .9px,transparent 1.4px);background-size:var(--dotf-gap) var(--dotf-gap);background-position:center}
.dotf-lit{-webkit-mask-image:radial-gradient(circle at 50% 50%,#000 0 .9px,transparent 1.4px);mask-image:radial-gradient(circle at 50% 50%,#000 0 .9px,transparent 1.4px);-webkit-mask-size:var(--dotf-gap) var(--dotf-gap);mask-size:var(--dotf-gap) var(--dotf-gap);-webkit-mask-position:center;mask-position:center}
.dotf-light{position:absolute;left:-25%;top:-25%;width:150%;height:150%;background:radial-gradient(28% 34% at 50% 50%,var(--dotf-lit) 0%,transparent 70%);transform:translate3d(-18%,-8%,0);animation:dotf-drift 22s cubic-bezier(.45,0,.55,1) infinite alternate;animation-play-state:paused}
.dotf[data-run] .dotf-light{animation-play-state:running}
@keyframes dotf-drift{0%{transform:translate3d(-18%,-8%,0)}50%{transform:translate3d(6%,10%,0)}100%{transform:translate3d(20%,-6%,0)}}
@media (prefers-reduced-motion:reduce){.dotf-light{animation:none;transform:none}}
`

export function DotField({
  gap,
  fade = "edges",
  tone = "dark",
  className,
  style,
}: {
  /** Distance between dots in CSS pixels. Default 14. */
  gap?: number
  /** Where the field fades out: toward every edge, toward the bottom, or not at all. */
  fade?: "edges" | "bottom" | "none"
  /** "dark" for a near-black ground, "purple" for the brand purple. */
  tone?: "dark" | "purple"
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let near = false
    const sync = () => el.toggleAttribute("data-run", near && document.visibilityState !== "hidden")
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([e]) => {
            near = e.isIntersecting
            sync()
          })
        : null
    if (io) io.observe(el)
    else {
      near = true
      sync()
    }
    document.addEventListener("visibilitychange", sync)
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])
  return (
    <div
      ref={ref}
      className={`dotf${className ? ` ${className}` : ""}`}
      data-fade={fade === "none" ? undefined : fade}
      data-tone={tone}
      style={gap || style ? ({ ...style, ...(gap ? { "--dotf-gap": `${gap}px` } : null) } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      <style href="dot-field" precedence="default">
        {DOT_FIELD_CSS}
      </style>
      <div className="dotf-dots" />
      <div className="dotf-lit">
        <div className="dotf-light" />
      </div>
    </div>
  )
}
