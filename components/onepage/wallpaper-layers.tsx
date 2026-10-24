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
import type * as React from "react"
import { NOISE_IMAGE, noiseOpacity, patternStyle } from "@/lib/onepage/wallpaper"
import { optimizedImageUrl } from "@/lib/images/optimized-url"

type ThemeLike = { background_type?: unknown; background_pattern?: unknown; pattern_color?: unknown; pattern_opacity?: unknown } | null | undefined

/** Does this theme draw a pattern? Only over a flat colour or a gradient, as before. */
export function themePattern(theme: ThemeLike) {
  if (!theme) return null
  if (theme.background_type !== "solid" && theme.background_type !== "gradient") return null
  return patternStyle(theme.background_pattern, theme.pattern_color ?? "#00000090", theme.pattern_opacity ?? "medium")
}

export function WallpaperPattern({
  theme,
  pattern,
  color,
  level,
  className = "absolute inset-0",
  style,
}: {
  /** Read the pattern from a theme, or pass `pattern`, `color` and `level` for a thumbnail. */
  theme?: ThemeLike
  pattern?: string
  color?: string
  level?: string
  className?: string
  style?: React.CSSProperties
}) {
  const s = theme !== undefined ? themePattern(theme) : patternStyle(pattern, color ?? "#00000090", level ?? "medium")
  if (!s) return null
  const id = theme !== undefined ? theme?.background_pattern : pattern
  return (
    <div
      aria-hidden
      data-wallpaper-pattern={String(id)}
      className={`pointer-events-none ${className}`}
      /* Stars twinkle: the layer's opacity breathes, which the compositor does on its own, no repaint. */
      style={{ ...s, ...style, ...(id === "stars" ? ({ "--o": s.opacity, animation: "onepageTwinkle 5s ease-in-out infinite" } as React.CSSProperties) : null) }}
    >
      {id === "stars" ? <style>{"@keyframes onepageTwinkle{0%,100%{opacity:calc(var(--o) * .5)}50%{opacity:var(--o)}}@media (prefers-reduced-motion:reduce){[data-wallpaper-pattern=stars]{animation:none!important}}"}</style> : null}
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
