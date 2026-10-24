"use client"

/**
 * ===========================================================================
 *  SPLIT CONTENT
 * ===========================================================================
 * The schema calls the image `image`, the body copy `body` and the button's
 * destination `button_url`. The renderer read `image_url`, `text` and
 * `button_link` — three names the schema has never had. So the image slot
 * showed its grey "Image" placeholder no matter what was uploaded, the body
 * copy never appeared at all, and every button linked to "#".
 *
 * The eyebrow, the aspect ratio, the button's style and colours, the heading
 * size and the content width were declared and ignored.
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
import { stableHtml } from "../stable-html"
import { siteImageProps } from "@/lib/website-builder/site-image"

const ASPECT: Record<string, string> = {
  square: "1 / 1",
  portrait: "3 / 4",
  landscape: "4 / 3",
  wide: "16 / 9",
}

export function SplitContentSection({ section, theme, isEditing, isSelected, onClick, pageIndex }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.text_color) || c.heading
  const paraColor = str(s.text_color) || c.paragraph
  const imagePos = str(s.image_position, "right")
  const image = str(s.image)
  const ratio = ASPECT[str(s.image_aspect_ratio, "square")] ?? ASPECT.square

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
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className={cn(
          "flex flex-col @[768px]:flex-row items-center gap-10 px-8 mx-auto",
          // `image_position` names where the IMAGE goes, so "right" is the
          // reversed row. It read the same way before and defaulted to "left"
          // while the schema defaulted to "right" — so the panel and the page
          // disagreed about which preset you had chosen.
          imagePos === "right" && "@[768px]:flex-row-reverse",
        )}
        style={{ maxWidth: maxWidth(s.max_width), ...sectionPadding(s, 60) }}
      >
        <div className="flex-1 min-w-0 w-full">
          {image ? (
            <img
              src={image}
              {...siteImageProps(image, "(min-width: 768px) 50vw, 100vw")}
              alt=""
              className="w-full rounded-lg object-cover"
              style={{ aspectRatio: ratio }}
              {...firstPicture(pageIndex)}
              decoding="async"
            />
          ) : (
            <div
              className="w-full rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center"
              style={{ aspectRatio: ratio }}
            >
              <span className="text-white/60 text-sm">Image</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {!!s.eyebrow && (
            <span
              className="mb-3 block text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: paraColor, opacity: 0.85 }}
            >
              {str(s.eyebrow)}
            </span>
          )}
          {!!s.heading && (
            <h2
              className="font-bold mb-3 text-3xl @[768px]:text-[length:var(--split-heading)]"
              style={
                {
                  color: headingColor,
                  fontFamily: theme.font_heading,
                  "--split-heading": `${num(s.font_size_heading, 40)}px`,
                } as CSSProperties
              }
            >
              {str(s.heading)}
            </h2>
          )}
          {!!s.subheading && (
            <p className="text-lg mb-4" style={{ color: paraColor, opacity: 0.9 }}>
              {str(s.subheading)}
            </p>
          )}
          {!!s.body && (
            <div
              className="text-base leading-relaxed mb-6 [&_a]:underline [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
              style={{ color: paraColor }}
              // The field is a `richtext` control, which is what the editor
              // writes into it. Rendering it as text showed the markup.
              dangerouslySetInnerHTML={stableHtml(str(s.body))}
            />
          )}
          {!!s.button_text && (
            <a
              href={str(s.button_url, "#")}
              className="inline-block px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              data-sl-button={filled ? "primary" : undefined}
            style={button}
            >
              {str(s.button_text)}
            </a>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default SplitContentSection
