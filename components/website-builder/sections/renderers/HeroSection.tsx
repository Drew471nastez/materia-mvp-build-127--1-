"use client"

/**
 * ===========================================================================
 *  THE HERO, AS A REACT COMPONENT — NO LONGER REGISTERED
 * ===========================================================================
 * The hero renders from themes/default/sections/hero.storelib through the
 * theme engine now (see ../StorelibSection.tsx and the registry). This file
 * stays as the reference that scripts/check-storelib-hero.mjs measures the
 * engine's output against — text, heights, colours, font sizes, buttons —
 * and goes when the next section moves and the measurement no longer needs a
 * React hero to compare with.
 *
 * The schema described a good hero: an eyebrow, a badge, two buttons with
 * their own styles and colours, four background types including a gradient
 * and a video, an overlay, a heading size, a split layout with its own image,
 * a content width, a scroll indicator and its own padding.
 *
 * The renderer implemented five of those thirty controls, and read three
 * settings — `cta_text`, `cta_url`, `image_url` — that the schema has never
 * declared. So the preset called "Gradient hero" rendered as a flat white box
 * with a heading and NO BUTTON, because the button text was saved under
 * `button_text` and the renderer was looking for `cta_text`.
 *
 * Nothing here is invention. Every control below was already in the panel,
 * already in the presets, already being set by the model — and already doing
 * nothing.
 */

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import {
  bool,
  hexToRgba,
  maxWidth,
  num,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps,
} from "../_shared"
import { siteImageProps } from "@/lib/website-builder/site-image"

export function HeroSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const layout = str(s.layout, "center")
  const split = layout === "split"
  const fullHeight = bool(s.full_height)
  const bgType = str(s.bg_type, "color")

  /**
   * The section's own colours win where it has them, and the scheme fills in
   * the rest. A hero is the one section people always want an exact colour
   * for; the scheme is what its buttons and its empty state fall back to.
   */
  const bgColor = str(s.bg_color) || c.bg
  const textColor = str(s.text_color) || c.heading
  const paraColor = str(s.text_color) || c.paragraph

  const backdrop = bgType === "image" ? str(s.bg_image) : ""
  const video = bgType === "video" ? str(s.bg_video) : ""
  const media = !!backdrop || !!video

  /** `bg_type: gradient` with nothing typed would render as nothing at all. */
  const gradient =
    bgType === "gradient"
      ? str(s.bg_gradient) || `linear-gradient(135deg, ${bgColor} 0%, ${c.primary_btn_bg} 100%)`
      : ""

  const surface: CSSProperties = media
    ? {}
    : gradient
      ? { background: gradient }
      : { background: bgColor }

  /**
   * ONE BUTTON BUILDER FOR BOTH BUTTONS. The second button's style is a
   * separate control with the same three values, and writing it twice is how
   * the two drift apart.
   */
  const buttonStyle = (style: string, custom: string, customText: string): CSSProperties => {
    const radius = { borderRadius: `${num(s.button_border_radius, 8)}px` }
    const base = custom || c.primary_btn_bg
    const label = customText || c.primary_btn_text
    if (style === "outline") {
      return { background: "transparent", color: base, border: `2px solid ${base}`, ...radius }
    }
    if (style === "ghost") {
      return { background: "transparent", color: base, border: "1px solid transparent", ...radius }
    }
    return { background: base, color: label, border: `1px solid ${base}`, ...radius }
  }

  const align = split
    ? "items-start text-left"
    : layout === "right"
      ? "items-end text-right"
      : layout === "left"
        ? "items-start text-left"
        : "items-center text-center"

  const heroImage = str(s.hero_image)

  const content = (
    <div className={cn("flex flex-col gap-5 w-full", align)}>
      {!!s.eyebrow && (
        <span
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: paraColor, opacity: 0.85 }}
        >
          {str(s.eyebrow)}
        </span>
      )}
      {!!s.badge_text && (
        <span
          className="inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium"
          style={{
            background: hexToRgba(str(s.button_color) || c.primary_btn_bg, 0.14),
            color: str(s.button_color) || c.primary_btn_bg,
          }}
        >
          {str(s.badge_text)}
        </span>
      )}
      {!!s.heading && (
        <h1
          /**
           * The slider is the DESKTOP size, and a container narrower than
           * 640px steps down to 36px. A viewport unit would have been the
           * usual answer and would be wrong here: the phone preview is a
           * narrow box on a wide screen, so `vw` reads the laptop and the
           * preview lies. The container query reads the box.
           */
          className={cn(
            "font-bold leading-[1.08] max-w-3xl text-4xl @[640px]:text-[length:var(--hero-heading)]",
            bool(s.animate_heading) &&
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700",
          )}
          style={
            {
              color: textColor,
              fontFamily: theme.font_heading ?? "Inter",
              "--hero-heading": `${num(s.font_size_heading, 56)}px`,
            } as CSSProperties
          }
        >
          {str(s.heading)}
        </h1>
      )}
      {!!s.subheading && (
        <p className="text-lg max-w-xl leading-relaxed" style={{ color: paraColor }}>
          {str(s.subheading)}
        </p>
      )}
      {(!!s.button_text || !!s.button2_text) && (
        <div className={cn("flex flex-wrap gap-3", layout === "center" && !split && "justify-center")}>
          {!!s.button_text && (
            <a
              href={str(s.button_url, "#")}
              className="inline-block px-6 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90"
              style={buttonStyle(
                str(s.button_style, "filled"),
                str(s.button_color),
                str(s.button_text_color),
              )}
            >
              {str(s.button_text)}
            </a>
          )}
          {!!s.button2_text && (
            <a
              href={str(s.button2_url, "#")}
              className="inline-block px-6 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90"
              style={buttonStyle(str(s.button2_style, "outline"), textColor, bgColor)}
            >
              {str(s.button2_text)}
            </a>
          )}
        </div>
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
      {!!video && (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={video}
          autoPlay
          muted
          loop
          playsInline
        />
      )}
      {!video && !!backdrop && (
        <img
          src={backdrop}
          {...siteImageProps(backdrop)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      )}
      {media && (
        <div
          className="absolute inset-0"
          style={{
            background: str(s.bg_overlay_color, "#000000"),
            opacity: num(s.bg_overlay_opacity, 40) / 100,
          }}
        />
      )}

      <div
        className={cn(
          "relative z-10 mx-auto flex w-full px-8",
          fullHeight ? "min-h-[calc(var(--sl-vh,1vh)*80)] items-center" : "items-center",
          split ? "flex-col gap-10 @[820px]:flex-row @[820px]:items-center" : "flex-col justify-center",
        )}
        style={{ maxWidth: maxWidth(s.max_width), ...sectionPadding(s, 60) }}
      >
        <div className={cn(split && "@[820px]:w-1/2")}>{content}</div>
        {split && !!heroImage && (
          <div className="@[820px]:w-1/2">
            {/* The picture beside the heading is content, not decoration, so it
                is named by the heading, as hero.storelib names it. The
                backdrop behind the text keeps an empty alt. */}
            <img
              src={heroImage}
              {...siteImageProps(heroImage, "(min-width: 768px) 50vw, 100vw")}
              alt={str(s.heading)}
              className="w-full rounded-2xl object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        )}
      </div>

      {bool(s.scroll_indicator) && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center"
          aria-hidden="true"
        >
          <span
            className="block h-8 w-5 rounded-full border-2 motion-safe:animate-bounce"
            style={{ borderColor: hexToRgba(textColor, 0.55) }}
          />
        </div>
      )}
    </SectionWrapper>
  )
}

export default HeroSection
