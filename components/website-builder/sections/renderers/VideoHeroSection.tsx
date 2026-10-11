"use client"

// Video hero — full-width hero with a background video (self-hosted or
// poster image fallback) and an overlay text/CTA block on top.

import { sectionColors, str, bool, SectionWrapper, hexToRgba, type SectionProps, schemeButton, firstPicture } from "../_shared"

export function VideoHeroSection({ section, theme, isEditing, isSelected, onClick, pageIndex }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const fullHeight = bool(s.full_height, true)
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const overlayColor = str(s.overlay_color, "#000000")
  const overlayOp = typeof s.overlay_opacity === "number" ? s.overlay_opacity : 45
  const textColor = str(s.text_color, "#ffffff")
  const alignment = str(s.alignment, "center")
  const headingSize = typeof s.font_size_heading === "number" ? s.font_size_heading : 56
  /**
   * The surface behind the video — and the whole section before one has
   * been chosen. It shipped white text over no background at all, which on
   * the default scheme is white on white: an empty-looking section the
   * second somebody clicks Add.
   */
  const bg = str(s.bg_color) || (str(s.video_poster) ? "#000" : c.bg)
  const maxWidthMap: Record<string, string> = { narrow: "max-w-xl", medium: "max-w-3xl", wide: "max-w-5xl", full: "max-w-none" }
  const mw = maxWidthMap[str(s.max_width, "medium")] ?? "max-w-3xl"
  const videoUrl = str(s.video_url)
  const poster = str(s.video_poster)
  const btnStyle = str(s.button_style, "outline")
  const btnColor = str(s.button_color) || c.primary_btn_bg
  const btnText = str(s.button_text_color) || c.primary_btn_text
  const btnRadius = typeof s.button_border_radius === "number" ? s.button_border_radius : 8

  const alignClass = alignment === "left" ? "items-start text-left" : alignment === "right" ? "items-end text-right" : "items-center text-center"
  const heightStyle = fullHeight ? { minHeight: "calc(var(--sl-vh, 1vh) * 100)" } : {}

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="relative w-full overflow-hidden" style={{ ...heightStyle, paddingTop: padTop, paddingBottom: padBottom }}>
        {videoUrl ? (
          <video
            src={videoUrl}
            poster={poster || undefined}
            autoPlay={bool(s.autoplay, true)}
            loop={bool(s.loop_video, true)}
            muted={bool(s.mute_video, true)}
            controls={bool(s.show_controls, false)}
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" fetchPriority={firstPicture(pageIndex).fetchPriority} />
        ) : null}
        <div className="absolute inset-0" style={{ background: hexToRgba(overlayColor, overlayOp / 100) }} />
        <div className={`relative flex flex-col ${alignClass} justify-center px-6 py-16 ${mw} mx-auto`} style={{ color: textColor, minHeight: fullHeight ? "calc(var(--sl-vh, 1vh) * 100)" : undefined }}>
          {!!s.heading && (
            <h1 className="font-bold mb-4 leading-tight" style={{ fontSize: headingSize }}>
              {str(s.heading)}
            </h1>
          )}
          {!!s.subheading && (
            <p className="text-lg mb-8 max-w-2xl opacity-95">{str(s.subheading)}</p>
          )}
          {!!s.button_text && (
            <a
              href={str(s.button_url, "#")}
              className="inline-block px-7 py-3 font-semibold"
              data-sl-button={btnStyle === "filled" ? "primary" : undefined}
              style={
                btnStyle === "filled"
                  ? { ...schemeButton(c, "primary", { background: str(s.button_color), text: str(s.button_text_color) }).style, borderRadius: btnRadius }
                  : btnStyle === "ghost"
                    ? { color: btnText, borderRadius: btnRadius }
                    : { border: `2px solid ${btnColor}`, color: btnText, borderRadius: btnRadius }
              }
            >
              {str(s.button_text)}
            </a>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default VideoHeroSection
