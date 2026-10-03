"use client"

/**
 * ===========================================================================
 *  RICH TEXT
 * ===========================================================================
 * The body is a `richtext` field and it was rendered inside a `<p>` as plain
 * text, so a paragraph break or a link showed as markup on the page. Eleven of
 * its sixteen controls did nothing besides: the eyebrow, the whole button —
 * text, link, style, colour, label colour, corner radius — the colours, the
 * heading size and the padding.
 */

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import {
  num,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps, schemeButton } from "../_shared"
import { stableHtml } from "../stable-html"

const WIDTH: Record<string, string> = {
  narrow: "max-w-xl",
  medium: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-(--theme-page-width)",
}

export function RichTextSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.text_color) || c.heading
  const bodyColor = str(s.text_color) || c.paragraph
  const align = str(s.alignment, "left")

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
        className={cn("px-8 mx-auto", WIDTH[str(s.max_width, "medium")] ?? WIDTH.medium)}
        style={{ textAlign: align as CSSProperties["textAlign"], ...sectionPadding(s, 60) }}
      >
        {!!s.eyebrow && (
          <span
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: buttonColor }}
          >
            {str(s.eyebrow)}
          </span>
        )}
        {!!s.heading && (
          <h2
            className="font-bold mb-4 text-2xl @[768px]:text-[length:var(--rt-heading)]"
            style={
              {
                color: headingColor,
                fontFamily: theme.font_heading,
                "--rt-heading": `${num(s.font_size_heading, 36)}px`,
              } as CSSProperties
            }
          >
            {str(s.heading)}
          </h2>
        )}
        {!!s.body && (
          <div
            className="text-lg leading-relaxed [&_a]:underline [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_blockquote]:mb-4 [&_blockquote]:border-l-2 [&_blockquote]:border-current [&_blockquote]:pl-4 [&_blockquote]:opacity-80"
            style={{ color: bodyColor }}
            dangerouslySetInnerHTML={stableHtml(str(s.body))}
          />
        )}
        {!!s.button_text && (
          <a
            href={str(s.button_url, "#")}
            className="mt-6 inline-block px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            data-sl-button={filled ? "primary" : undefined}
            style={button}
          >
            {str(s.button_text)}
          </a>
        )}
      </div>
    </SectionWrapper>
  )
}

export default RichTextSection
