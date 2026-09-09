"use client"

/**
 * ===========================================================================
 *  THE CALL TO ACTION
 * ===========================================================================
 * It rendered no button.
 *
 * The schema declares `btn_primary_text` and `btn_primary_url`. The renderer
 * read `s.button_text` and `s.button_url` — names that appear nowhere in the
 * schema, so they were never saved and never set. `{!!s.button_text && …}` was
 * therefore always false, and the one section whose entire purpose is a button
 * shipped without one. Nothing could see it: settings are
 * `Record<string, unknown>`, so there is no type error, and the section
 * rendered "successfully" every time.
 *
 * The badge, the second button, the layout, the gradient, the background
 * image, the decorative image, the countdown and the padding were declared and
 * ignored in the same way.
 */

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import {
  bool,
  hexToRgba,
  num,
  sectionColors,
  sectionPadding,
  str,
  useCountdown,
  SectionWrapper,
  type SectionProps,
} from "../_shared"

export function CtaSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const bgType = str(s.bg_type, "color")
  const bgColor = str(s.bg_color) || c.bg
  const textColor = str(s.text_color) || c.heading
  const image = bgType === "image" ? str(s.bg_image) : ""
  const gradient =
    bgType === "gradient"
      ? str(s.gradient_from) && str(s.gradient_to)
        ? `linear-gradient(135deg, ${str(s.gradient_from)} 0%, ${str(s.gradient_to)} 100%)`
        : ""
      : ""

  const layout = str(s.layout, "centered")
  /** "split" puts the copy and the buttons on one row; everything else stacks. */
  const split = layout === "split"

  const countdown = useCountdown(bool(s.countdown) ? str(s.countdown_end) : "")

  const surface: CSSProperties = image
    ? {}
    : gradient
      ? { background: gradient }
      : { background: bgColor }

  const buttons = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        !split && layout === "centered" && "justify-center",
      )}
    >
      {!!s.btn_primary_text && (
        <a
          href={str(s.btn_primary_url, "#")}
          className="inline-block px-8 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90"
          style={{
            background: c.primary_btn_bg,
            color: c.primary_btn_text,
            border: `1px solid ${c.primary_btn_border}`,
            borderRadius: `${num(theme.button_border_radius, 8)}px`,
          }}
        >
          {str(s.btn_primary_text)}
        </a>
      )}
      {!!s.btn_secondary_text && (
        <a
          href={str(s.btn_secondary_url, "#")}
          className="inline-block px-8 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "transparent",
            color: textColor,
            border: `1px solid ${hexToRgba(textColor, 0.45)}`,
            borderRadius: `${num(theme.button_border_radius, 8)}px`,
          }}
        >
          {str(s.btn_secondary_text)}
        </a>
      )}
    </div>
  )

  return (
    <SectionWrapper
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      className="relative overflow-hidden"
      style={surface}
    >
      {!!image && (
        <>
          <img
            src={image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0" style={{ background: hexToRgba(bgColor, 0.75) }} />
        </>
      )}

      <div
        className={cn(
          "relative z-10 mx-auto flex max-w-(--theme-page-width) gap-6 px-(--theme-padding-x)",
          split ? "flex-col @[820px]:flex-row @[820px]:items-center @[820px]:justify-between" : "flex-col",
          !split && layout === "centered" && "text-center items-center",
          layout === "left" && "text-left items-start",
        )}
        style={sectionPadding(s, 64)}
      >
        <div className={cn("flex flex-col gap-3", split && "@[820px]:max-w-xl")}>
          {!!s.badge_text && (
            <span
              className={cn(
                "inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                !split && layout === "centered" && "mx-auto",
              )}
              style={{ background: hexToRgba(c.primary_btn_bg, 0.18), color: c.primary_btn_bg }}
            >
              {str(s.badge_text)}
            </span>
          )}
          {!!s.heading && (
            <h2
              className="text-3xl font-bold"
              style={{ color: textColor, fontFamily: theme.font_heading }}
            >
              {str(s.heading)}
            </h2>
          )}
          {!!s.subheading && (
            <p
              className={cn("text-lg max-w-xl", !split && layout === "centered" && "mx-auto")}
              style={{ color: str(s.text_color) || c.paragraph }}
            >
              {str(s.subheading)}
            </p>
          )}
          {!!countdown && (
            <div
              className={cn(
                "flex gap-4 text-sm font-semibold tabular-nums",
                !split && layout === "centered" && "justify-center",
              )}
              style={{ color: textColor }}
            >
              {countdown.parts.map((part) => (
                <span key={part.label}>
                  {String(part.value).padStart(2, "0")}
                  <span className="ml-1 text-xs font-normal opacity-70">{part.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className={cn("flex flex-col gap-4", !split && layout === "centered" && "items-center")}>
          {buttons}
          {!!s.decorative_image && (
            <img
              src={str(s.decorative_image)}
              alt=""
              className="max-h-40 w-auto object-contain"
              loading="lazy"
              decoding="async"
            />
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default CtaSection
