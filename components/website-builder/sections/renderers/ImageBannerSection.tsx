"use client"

/**
 * ===========================================================================
 *  THE IMAGE BANNER
 * ===========================================================================
 * Twelve of eighteen controls did nothing. The whole button — text, link,
 * style, colour, label colour, radius — was declared and never rendered, so a
 * banner could not have a call to action. The overlay colour was hard-coded to
 * black whatever the picker said, the text colour came from the scheme rather
 * than the control, and the alignment, heading size, content width and padding
 * were ignored.
 *
 * It also shipped white text with no image and no background of its own, which
 * on the default white scheme is white on white. The overlay is what makes the
 * text legible, so it is painted whether or not an image has been chosen yet.
 */

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import {
  maxWidth,
  num,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps, schemeButton, firstPicture } from "../_shared"

const ASPECT: Record<string, string> = {
  "16:9": "aspect-video",
  "3:1": "aspect-[3/1]",
  "4:3": "aspect-[4/3]",
  "21:9": "aspect-[21/9]",
  auto: "min-h-[320px]",
}

export function ImageBannerSection({ section, theme, isEditing, isSelected, onClick, pageIndex }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const aspect = ASPECT[str(s.aspect_ratio, "16:9")] ?? ASPECT["16:9"]
  const textColor = str(s.text_color) || c.image_overlay_text
  const alignment = str(s.alignment, "center")
  const image = str(s.image_url)

  const buttonStyle = str(s.button_style, "filled")
  const buttonColor = str(s.button_color) || c.primary_btn_bg
  const radius = { borderRadius: `${num(s.button_border_radius, 8)}px` }
  const button: CSSProperties =
    buttonStyle === "outline"
      ? { background: "transparent", color: buttonColor, border: `2px solid ${buttonColor}`, ...radius }
      : buttonStyle === "ghost"
        ? { background: "transparent", color: buttonColor, border: "1px solid transparent", ...radius }
        : { ...schemeButton(c, "primary", { background: str(s.button_color), text: str(s.button_text_color) }).style, ...radius }
  /* A filled button is painted by the shared rule, so it has a hover colour:
     the scheme's, or one worked out from a colour typed into this section. */
  const filled = buttonStyle !== "outline" && buttonStyle !== "ghost"

  return (
    <SectionWrapper isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div style={sectionPadding(s, 0)}>
        <div
          className={cn("relative w-full overflow-hidden", aspect)}
          style={{ background: str(s.bg_color) || c.bg }}
        >
          {image ? (
            <img
              src={image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              {...firstPicture(pageIndex)}
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0" style={{ background: str(s.bg_color) || c.bg }} />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: str(s.overlay_color, "#000000"),
              opacity: num(s.overlay_opacity, 30) / 100,
            }}
          />
          <div
            className={cn(
              "absolute inset-0 mx-auto flex flex-col justify-center gap-3 px-8",
              alignment === "left"
                ? "items-start text-left"
                : alignment === "right"
                  ? "items-end text-right"
                  : "items-center text-center",
            )}
            style={{ maxWidth: maxWidth(s.max_width) }}
          >
            {!!s.heading && (
              <h2
                className="font-bold text-3xl @[768px]:text-[length:var(--banner-heading)]"
                style={
                  {
                    color: textColor,
                    fontFamily: theme.font_heading,
                    "--banner-heading": `${num(s.font_size_heading, 48)}px`,
                  } as CSSProperties
                }
              >
                {str(s.heading)}
              </h2>
            )}
            {!!s.subheading && (
              <p className="max-w-xl text-lg opacity-90" style={{ color: textColor }}>
                {str(s.subheading)}
              </p>
            )}
            {!!s.button_text && (
              <a
                href={str(s.button_url, "#")}
                className="mt-2 inline-block px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                data-sl-button={filled ? "primary" : undefined}
            style={button}
              >
                {str(s.button_text)}
              </a>
            )}
            {!s.heading && !s.subheading && !s.button_text && !image && (
              <span className="text-sm text-white/60">Add an image</span>
            )}
          </div>
        </div>
      </div>
    </SectionWrapper>
  )
}

export default ImageBannerSection
