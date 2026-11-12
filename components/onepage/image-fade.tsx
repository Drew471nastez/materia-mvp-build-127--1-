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

/** How much room a picture has: one picture, a slide with others beside it, a two column tile, or a small tile. */
export type FadeSize = "full" | "compact" | "small" | "tiny"

export function fadeSizeFor(display: "single" | "grid" | "carousel", columns: number, view: number): FadeSize {
  if (display === "grid") return columns >= 3 ? "tiny" : "small"
  if (display === "carousel") return view >= 2 ? "tiny" : view > 1.2 ? "compact" : "full"
  return "full"
}

/*
  What each size shows, kept to about two thirds of a 4:3 picture at most
  (scripts/check-onepage-design-r3.mjs measures it): one picture has the
  title, two lines of caption and the button; a slide beside others, the
  title and the button (or the caption when there is no button); a tile,
  the title alone. The whole tile is the link wherever the button is left out.
*/
const TYPE: Record<FadeSize, { title: number; titleLines: number; caption: number; captionLines: number; pad: number; lead: number; button: number; buttonH: number }> = {
  full: { title: 18, titleLines: 2, caption: 14, captionLines: 2, pad: 18, lead: 56, button: 14, buttonH: 40 },
  compact: { title: 15, titleLines: 1, caption: 12.5, captionLines: 1, pad: 12, lead: 32, button: 13, buttonH: 30 },
  small: { title: 14, titleLines: 1, caption: 0, captionLines: 0, pad: 10, lead: 28, button: 0, buttonH: 0 },
  tiny: { title: 13, titleLines: 1, caption: 0, captionLines: 0, pad: 8, lead: 24, button: 0, buttonH: 0 },
}

export function FadeWords({
  theme,
  title,
  caption,
  button,
  size,
  align = "left",
  radius = "0px",
}: {
  theme: OnePageTheme
  title?: string | null
  caption?: string | null
  /** The button's words; only passed when the picture has somewhere to go. */
  button?: string | null
  size: FadeSize
  align?: "left" | "center" | "right"
  /** The picture's corner, which the words' box follows a pixel further out. */
  radius?: string
}) {
  const t = TYPE[size]
  const buttonWords = t.button ? button?.trim() || "" : ""
  /* A slide beside others has room for the button or the caption, the button first. */
  const words = { title: title?.trim() || "", caption: t.caption && !(size === "compact" && buttonWords) ? caption?.trim() || "" : "", button: buttonWords }
  const colours = React.useMemo(() => fadeColours(theme), [theme])
  const press = React.useMemo(() => {
    const g = parseColor(colours.ground)
    return pressableProps(g ? buttonThemeOn(theme, [g]) : theme, true)
  }, [theme, colours.ground])
  if (!words.title && !words.caption && !words.button) return null
  const edge = /^0(px)?$/.test(radius.trim()) ? "0px" : radius
  /*
    The words' box sits on the picture's foot. Its top `lead` px fade in from
    clear; under the words the ground is solid. So the picture shows down to
    the words and melts into them, and the words always read.
  */
  return (
    <span
      data-image-fade=""
      data-fade-ground={colours.ground}
      data-fade-size={size}
      /*
        A pixel past the picture's frame on three sides, with that frame's
        corner a pixel wider: the picture's own anti-aliased edge is covered,
        so no hairline of the picture shows round the words.
      */
      className="pointer-events-none absolute -inset-x-px -bottom-px flex flex-col overflow-hidden"
      style={{
        borderBottomLeftRadius: `calc(${edge} + 1px)`,
        borderBottomRightRadius: `calc(${edge} + 1px)`,
        backgroundImage: fadeGradient(colours.ground, t.lead),
        color: colours.ink,
        padding: `${t.lead}px ${t.pad}px ${t.pad}px`,
        textAlign: align,
        alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      }}
    >
      {words.title ? (
        <span data-image-fade-title="" className="block max-w-full font-semibold leading-tight" style={{ fontSize: t.title, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: t.titleLines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {words.title}
        </span>
      ) : null}
      {words.caption ? (
        <span data-image-fade-caption="" className="mt-1 block max-w-full leading-snug" style={{ fontSize: t.caption, color: colours.muted, display: "-webkit-box", WebkitLineClamp: t.captionLines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {words.caption}
        </span>
      ) : null}
      {words.button ? (
        <span
          data-image-fade-button=""
          className={press.className}
          data-shadow={press["data-shadow"]}
          style={{ ...press.style, marginTop: size === "full" ? 12 : 8, display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: t.buttonH, padding: `0 ${size === "full" ? 18 : 12}px`, fontSize: t.button, fontWeight: 600, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {words.button}
        </span>
      ) : null}
    </span>
  )
}
