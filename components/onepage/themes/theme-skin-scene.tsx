/**
 * ===========================================================================
 *  THE SCENE BEHIND A SKINNED PAGE (round W9)
 * ===========================================================================
 * The page's wallpaper for a theme with a skin (lib/onepage/theme-skin):
 * Aero's clouds, sun, glass ribbon, bubbles and meadow; Aqua's pinstripes
 * and light; Messenger's title band and ribbons; Y2K's aurora, horizon grid
 * and sparkles; Playful's paper blobs and doodles; Grunge's photocopy grain,
 * streaks, barbed line art and the name run down the edge.
 *
 * Plain elements, every one drawn by app/onepage-skins.css
 * ([data-skin-scene=...] [data-sk=...]): no state, no effects, nothing that
 * measures, and no images fetched except Renaissance's painting, the site's
 * own file (public/images/onepage-themes/renaissance). Whatever moves moves by transform or
 * opacity alone, slowly, and stands still for a visitor who asked for less
 * motion and inside a theme card.
 *
 * It sits where the page's pattern sits (components/onepage/wallpaper-layers
 * WallpaperPattern): in the phone page, in the desktop card and around it,
 * and in the theme card (components/onepage/themes/theme-swatch).
 */
import type * as React from "react"
/* The skins' stylesheet (scripts/build-onepage-skins.mjs writes it): only a page that can draw a skin loads it. */
import "./theme-skins.css"
import { skinSceneOf, type ThemeSkin } from "@/lib/onepage/theme-skin"

/** How many of each piece a scene draws, in the order the stylesheet places them (nth-child). */
const PIECES: Record<ThemeSkin, ReadonlyArray<readonly [string, number]>> = {
  aero: [["sun", 1], ["swoosh", 1], ["cloud", 3], ["meadow", 1], ["bubble", 9], ["glint", 3]],
  aqua: [["stripes", 1], ["light", 1], ["wave", 2]],
  messenger: [["band", 1], ["ribbon", 2], ["glow", 2]],
  y2k: [["aurora", 3], ["horizon", 1], ["pixels", 1], ["spark", 10]],
  playful: [["paper", 1], ["blob", 4], ["doodle", 5]],
  grunge: [["copy", 1], ["streaks", 1], ["halftone", 1], ["barbed", 2], ["code", 1], ["edge", 1]],
  /* Round W10: the second versions, and three that stand alone (scripts/onepage-skins/). */
  /* Round 17: a lit surface, four plants, five fish and ten bubbles (scripts/onepage-skins/aero.mjs aeroAquarium). */
  aero2: [["surface", 1], ["rays", 1], ["caustics", 1], ["sand", 1], ["weed", 4], ["fish", 5], ["bubble", 10], ["glint", 2]],
  aqua2: [["brush", 1], ["sheen", 1], ["light", 1]],
  messenger2: [["band", 1], ["ribbon", 2], ["glow", 2]],
  y2k2: [["glow", 3], ["floor", 1], ["dots", 1], ["charm", 6], ["spark", 6]],
  playful2: [["paper", 1], ["blob", 4], ["doodle", 5]],
  grunge2: [["copy", 1], ["streaks", 1], ["halftone", 1], ["columns", 2], ["scribble", 1], ["pin", 1], ["edge", 1], ["staple", 2]],
  classic98: [["dither", 1], ["taskbar", 1], ["icon", 2]],
  vaporwave: [["stars", 1], ["sun", 1], ["mountains", 1], ["floor", 1], ["horizon", 1], ["palm", 2], ["vhs", 1]],
  arcade: [["stars", 1], ["twinkle", 5], ["coin", 2], ["hills", 1], ["hud", 1], ["crt", 1]],
  renaissance: [["painting", 1]],
  stoicism: [["stone", 1], ["grid", 1], ["construction", 1], ["vignette", 1]],
}

export function ThemeSkinScene({
  theme,
  label,
  className = "absolute inset-0",
  style,
}: {
  theme: Parameters<typeof skinSceneOf>[0]
  /** The page's name, which Grunge runs down the edge of the page. */
  label?: string | null
  className?: string
  style?: React.CSSProperties
}) {
  const skin = skinSceneOf(theme)
  if (!skin) return null
  const words = (label || "").trim().toUpperCase().slice(0, 40)
  return (
    <div aria-hidden data-skin-scene={skin} className={`pointer-events-none overflow-hidden ${className}`} style={style}>
      {PIECES[skin].flatMap(([piece, n]) => Array.from({ length: n }, (_, i) => <span key={`${piece}${i}`} data-sk={piece} />))}
      {(skin === "grunge" || skin === "grunge2") && words ? (
        <span data-sk="edge-words">{Array.from({ length: 6 }, () => words).join("  ✕  ")}</span>
      ) : null}
    </div>
  )
}
