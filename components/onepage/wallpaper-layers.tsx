/**
 * The layers a OnePage wallpaper lays over its colour: a pattern or texture
 * (lib/onepage/wallpaper patternStyle) and the Noise switch's grain. The
 * editor's phone preview, the live page and the Design tab's thumbnails all
 * draw these, so what the creator picks is what a visitor sees.
 *
 * Both are one element with a CSS background, no <svg> and no ids (see
 * lib/onepage/wallpaper for why ids went wrong), and neither is a component
 * declared inside another's render: the live page's note in
 * public-onepage.tsx explains what that did on every scroll.
 */
import * as React from "react"
import { NOISE_IMAGE, canonicalPatternId, noiseOpacity, patternStyle } from "@/lib/onepage/wallpaper"
import { optimizedImageUrl } from "@/lib/images/optimized-url"

type ThemeLike = { background_type?: unknown; background_color?: unknown; background_gradient?: unknown; background_pattern?: unknown; pattern_color?: unknown; pattern_opacity?: unknown } | null | undefined
type GroundLike = { background_type?: unknown; background_color?: unknown; background_gradient?: unknown }

/**
 * Does this theme draw a pattern? Only over a flat colour or a gradient, as
 * before. With no colour of its own the pattern is black on a light
 * wallpaper and white on a dark one (round W10, lib/onepage/wallpaper
 * resolvedPatternInk): it was black on every wallpaper, so unseen on a dark one.
 */
export function themePattern(theme: ThemeLike) {
  if (!theme) return null
  if (theme.background_type !== "solid" && theme.background_type !== "gradient") return null
  return patternStyle(theme.background_pattern, theme.pattern_color, theme.pattern_opacity ?? "medium", theme)
}

/*
  THE PATTERN STAYS OUT FROM BEHIND THE HEADER (round AL). "Make sure the
  pattern and texture doesn't overlay the social icons." The pattern is a
  page wide layer under the content, and the photo's ring, the name, the bio
  and above all the outline and glass social icons are see-through, so its
  lines ran straight through them. The page measures where its header ends
  (the header block and a social row right under it) once, with
  useHeaderClearance, and writes it as one number, --op-pattern-clear, on
  the box that holds both the content and the pattern. The pattern's mask
  reads that number: nothing above it, then the pattern fading in over the
  next 96px. Before it is measured (the first server drawn frame) the mask
  is fully open, which is how every page looked before.
*/
export const CLEAR_FADE_PX = 96
const CLEAR_MASK = `linear-gradient(to bottom, transparent var(--op-pattern-clear, -${CLEAR_FADE_PX}px), #000 calc(var(--op-pattern-clear, -${CLEAR_FADE_PX}px) + ${CLEAR_FADE_PX}px))`

export function WallpaperPattern({
  theme,
  pattern,
  color,
  level,
  className = "absolute inset-0",
  style,
  clearHeader = false,
  ground,
}: {
  /** Read the pattern from a theme, or pass `pattern`, `color` and `level` for a thumbnail. */
  theme?: ThemeLike
  pattern?: string
  color?: string
  level?: string
  className?: string
  style?: React.CSSProperties
  /** Keep out from behind the page's header, as measured by useHeaderClearance on a box around both. */
  clearHeader?: boolean
  /** For a thumbnail: the wallpaper it is drawn on, so an automatic colour shows on it as it will on the page. */
  ground?: GroundLike
}) {
  const s = theme !== undefined ? themePattern(theme) : patternStyle(pattern, color, level ?? "medium", ground)
  if (!s) return null
  const id = canonicalPatternId(theme !== undefined ? theme?.background_pattern : pattern)
  return (
    <div
      aria-hidden
      data-wallpaper-pattern={String(id)}
      data-pattern-clears-header={clearHeader ? "" : undefined}
      className={`pointer-events-none ${className}`}
      /* Stars twinkle: the layer's opacity breathes, which the compositor does on its own, no repaint. */
      style={{ ...s, ...style, ...(clearHeader ? { maskImage: CLEAR_MASK, WebkitMaskImage: CLEAR_MASK } : null), ...(id === "stars" ? ({ "--o": s.opacity, animation: "onepageTwinkle 5s ease-in-out infinite" } as React.CSSProperties) : null) }}
    >
      {id === "stars" ? <style>{"@keyframes onepageTwinkle{0%,100%{opacity:calc(var(--o) * .5)}50%{opacity:var(--o)}}@media (prefers-reduced-motion:reduce){[data-wallpaper-pattern=stars]{animation:none!important}}"}</style> : null}
    </div>
  )
}

/**
 * Where the page's header ends, measured once and shared: the header block
 * (`[data-op-header]`, or the Hero's `[data-hero-header]`) and a social row
 * that starts within 96px under it. Written on `ref`'s box as
 * --op-pattern-clear, in px from its top, for WallpaperPattern's
 * `clearHeader` mask. Measured again when anything in the box changes size
 * or the blocks change, at most once a frame.
 */
/*
  Where an element sits in the box by layout, not as drawn: the blocks
  arrive with a short rise (a transform), and a measure taken during it was
  8px off for good. Offsets ignore transforms; a chain that never reaches
  the box falls back to the drawn place.
*/
function layoutTop(el: HTMLElement, box: HTMLElement): number {
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== box) {
    y += node.offsetTop
    const parent = node.offsetParent as HTMLElement | null
    if (parent && parent !== box && !box.contains(parent)) break
    node = parent
  }
  if (node === box) return y
  return el.getBoundingClientRect().top - box.getBoundingClientRect().top
}

export function useHeaderClearance(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  React.useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    if (!enabled) {
      box.style.removeProperty("--op-pattern-clear")
      return
    }
    let frame = 0
    const observed = new Set<Element>()
    const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(() => soon()) : null
    const measure = () => {
      frame = 0
      const header = box.querySelector<HTMLElement>("[data-op-header], [data-hero-header]")
      if (!header) {
        box.style.removeProperty("--op-pattern-clear")
        return
      }
      if (sizes && !observed.has(header)) {
        observed.add(header)
        sizes.observe(header)
      }
      let bottom = layoutTop(header, box) + header.offsetHeight
      for (const row of box.querySelectorAll<HTMLElement>("[data-op-social-row]")) {
        const top = layoutTop(row, box)
        if (row.offsetHeight > 0 && top - bottom < CLEAR_FADE_PX) bottom = Math.max(bottom, top + row.offsetHeight)
      }
      box.style.setProperty("--op-pattern-clear", `${Math.max(0, Math.round(bottom))}px`)
    }
    function soon() {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    sizes?.observe(box)
    const blocks = typeof MutationObserver === "function" ? new MutationObserver(soon) : null
    blocks?.observe(box, { childList: true, subtree: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      sizes?.disconnect()
      blocks?.disconnect()
    }
  }, [ref, enabled])
}

/*
  ===========================================================================
   THE GRADIENT, DRIFTING (round AL)
  ===========================================================================
  "Some continuous, very smooth and clean animation of the background when
  it's set to gradient." The page used to animate its own
  background-position over a 200% gradient: a repaint of the whole page on
  every frame, and on a top to bottom gradient (the usual one) a slide
  sideways along colours that do not change sideways, so nothing moved.

  Now it is one layer, half as big again as the page each way, painted once
  with the page's gradient and moved by a transform along the gradient's own
  direction, slowly, there and back. A transform is the compositor's: no
  repaint, no layout. The gradient's stops are placed in the middle of the
  layer, so at rest it shows exactly the page's own colours, and its ends
  carry on in the end colours as they move into view.

  Still for anyone who asked for less motion, and stopped while the tab is
  hidden. The page's own gradient stays under it, so the first frame, a
  reduced motion visitor and a gradient this cannot read all see the page as
  it always was.
*/
const DRIFT_SPAN = 0.25
/** How far the layer travels each way, as a share of its own size (9% of 150% is about 13.5% of the page). */
const DRIFT_PCT = 9

/** The page's gradient with its stops moved into the middle of a layer 1 + 2 * DRIFT_SPAN times the page. Null when it is not a plain linear gradient with percentage stops. */
export function driftGradient(gradient: unknown): { image: string; angle: number } | null {
  if (typeof gradient !== "string") return null
  const m = /^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,(.*)\)$/i.exec(gradient.trim())
  if (!m || /hsl|%\s*\)|var\(/i.test(m[2]) || !/%/.test(m[2])) return null
  const scale = 1 / (1 + 2 * DRIFT_SPAN)
  const offset = DRIFT_SPAN * scale * 100
  const stops = m[2].replace(/(-?\d+(?:\.\d+)?)%/g, (_, n: string) => `${Math.round((offset + Number(n) * scale) * 1000) / 1000}%`)
  return { image: `linear-gradient(${m[1]}deg,${stops})`, angle: Number(m[1]) }
}

export function WallpaperDrift({ gradient, className = "absolute inset-0" }: { gradient: unknown; className?: string }) {
  const layer = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = layer.current
    if (!el) return
    const sync = () => {
      el.style.animationPlayState = document.hidden ? "paused" : ""
    }
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [])
  const drift = driftGradient(gradient)
  if (!drift) return null
  const rad = (drift.angle * Math.PI) / 180
  const dx = Math.round(Math.sin(rad) * DRIFT_PCT * 100) / 100
  const dy = Math.round(-Math.cos(rad) * DRIFT_PCT * 100) / 100
  return (
    <div aria-hidden data-wallpaper-drift="" className={`pointer-events-none overflow-hidden ${className}`}>
      <div
        ref={layer}
        data-wallpaper-drift-layer=""
        /* app/globals.css takes transforms off everything in a .group on a touch screen; this one is the animation itself. */
        data-keep-transform=""
        style={{
          position: "absolute",
          inset: `${-DRIFT_SPAN * 100}%`,
          backgroundImage: drift.image,
          ["--drift-x" as string]: `${dx}%`,
          ["--drift-y" as string]: `${dy}%`,
          animation: "onepageDrift 16s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate both",
          willChange: "transform",
        }}
      />
      <style>{"@keyframes onepageDrift{from{transform:translate3d(calc(var(--drift-x) * -1),calc(var(--drift-y) * -1),0)}to{transform:translate3d(var(--drift-x),var(--drift-y),0)}}@media (prefers-reduced-motion:reduce){[data-wallpaper-drift]{display:none}}"}</style>
    </div>
  )
}

/** The Noise switch: grey grain blended over a gradient or a photo, at the strength chosen (5 to 50). */
export function WallpaperNoise({ strength, className = "absolute inset-0", style }: { strength: unknown; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden
      data-wallpaper-noise=""
      className={`pointer-events-none ${className}`}
      style={{ backgroundImage: NOISE_IMAGE, backgroundSize: "180px 180px", mixBlendMode: "overlay", opacity: noiseOpacity(strength), ...style }}
    />
  )
}

/**
 * A photo wallpaper as a CSS background: the image optimizer's copy, 1920px
 * wide, as AVIF or WebP at quality 75, never the file itself. Nature's
 * photo was drawn from its 1920px JPEG at quality 95 (632KB) on every phone;
 * through the optimizer it is a fraction of that, and the same address is
 * used by both layouts and the editor's preview, so it is fetched once.
 * Quoted, so an address with a bracket or a space in it cannot end the
 * url() early. A host the optimizer will not take is drawn as it is.
 */
export function wallpaperImage(url: string): string {
  const src = optimizedImageUrl(url, 960, 75)
  return `url("${src.replace(/["\\\n]/g, (c) => encodeURIComponent(c))}")`
}
