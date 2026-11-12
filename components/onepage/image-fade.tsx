/**
 * An image block's picture with its words on a fade (lib/onepage/image-fade):
 * the title, the caption and, when the picture has a link, a button, laid on
 * the bottom of the picture where it runs smoothly into a colour from the
 * page. The same piece draws one picture, a grid's tiles and a carousel's
 * slides, smaller where the picture is smaller.
 */
import * as React from "react"
import { pressableProps } from "@/lib/onepage/block-look"
import { buttonThemeOn } from "@/lib/onepage/button-style"
import { parseColor } from "@/lib/onepage/contrast"
import { fadeColours, fadeGradient } from "@/lib/onepage/image-fade"
import type { OnePageTheme } from "@/lib/onepage/types"

/** How much room a picture has: one picture, a two-up tile or slide, or a small tile. */
export type FadeSize = "full" | "compact" | "tiny"

export function fadeSizeFor(display: "single" | "grid" | "carousel", columns: number, view: number): FadeSize {
  if (display === "grid") return columns >= 3 ? "tiny" : "compact"
  if (display === "carousel") return view >= 2 ? "tiny" : view > 1.2 ? "compact" : "full"
  return "full"
}

const TYPE: Record<FadeSize, { title: number; caption: number; pad: number; button: number }> = {
  full: { title: 18, caption: 14, pad: 18, button: 14 },
  compact: { title: 15, caption: 12.5, pad: 12, button: 13 },
  tiny: { title: 13, caption: 0, pad: 9, button: 0 },
}

export function FadeWords({
  theme,
  title,
  caption,
  button,
  size,
  align = "left",
}: {
  theme: OnePageTheme
  title?: string | null
  caption?: string | null
  /** The button's words; only passed when the picture has somewhere to go. */
  button?: string | null
  size: FadeSize
  align?: "left" | "center" | "right"
}) {
  const t = TYPE[size]
  const words = { title: title?.trim() || "", caption: t.caption ? caption?.trim() || "" : "", button: t.button ? button?.trim() || "" : "" }
  const colours = React.useMemo(() => fadeColours(theme), [theme])
  const press = React.useMemo(() => {
    const g = parseColor(colours.ground)
    return pressableProps(g ? buttonThemeOn(theme, [g]) : theme, true)
  }, [theme, colours.ground])
  if (!words.title && !words.caption && !words.button) return null
  /* The fade starts higher when there is more to read on it. */
  const start = words.caption || words.button ? 22 : 40
  return (
    <span
      data-image-fade=""
      className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end"
      style={{ top: 0, backgroundImage: fadeGradient(colours.ground, start), color: colours.ink, padding: `0 ${t.pad}px ${t.pad}px`, textAlign: align, alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" }}
    >
      {words.title ? (
        <span data-image-fade-title="" className="block max-w-full font-semibold leading-tight" style={{ fontSize: t.title, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: size === "tiny" ? 1 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {words.title}
        </span>
      ) : null}
      {words.caption ? (
        <span data-image-fade-caption="" className="mt-1 block max-w-full leading-snug" style={{ fontSize: t.caption, color: colours.muted, display: "-webkit-box", WebkitLineClamp: size === "full" ? 3 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {words.caption}
        </span>
      ) : null}
      {words.button ? (
        <span
          data-image-fade-button=""
          className={press.className}
          data-shadow={press["data-shadow"]}
          style={{ ...press.style, marginTop: size === "full" ? 12 : 9, display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: size === "full" ? 40 : 34, padding: `0 ${size === "full" ? 18 : 14}px`, fontSize: t.button, fontWeight: 600, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {words.button}
        </span>
      ) : null}
    </span>
  )
}
