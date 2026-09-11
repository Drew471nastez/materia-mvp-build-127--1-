"use client"

// Video embed — renders a YouTube, Vimeo, or self-hosted video inside
// an aspect-ratio'd container. Heading + subheading float above.

import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

function toEmbedUrl(raw: string, provider: string, opts: { autoplay: boolean; mute: boolean; loop: boolean; controls: boolean }): string {
  if (!raw) return ""
  try {
    const u = new URL(raw)
    if (provider === "youtube" || u.hostname.includes("youtube") || u.hostname.includes("youtu.be")) {
      let id = u.hostname.includes("youtu.be")
        ? u.pathname.replace(/^\//, "")
        : u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? ""
      id = id.replace(/^embed\//, "")
      const p = new URLSearchParams()
      if (opts.autoplay) p.set("autoplay", "1")
      if (opts.mute) p.set("mute", "1")
      if (opts.loop) { p.set("loop", "1"); p.set("playlist", id) }
      if (!opts.controls) p.set("controls", "0")
      return `https://www.youtube.com/embed/${id}?${p.toString()}`
    }
    if (provider === "vimeo" || u.hostname.includes("vimeo")) {
      const id = u.pathname.split("/").filter(Boolean).pop() ?? ""
      const p = new URLSearchParams()
      if (opts.autoplay) p.set("autoplay", "1")
      if (opts.mute) p.set("muted", "1")
      if (opts.loop) p.set("loop", "1")
      return `https://player.vimeo.com/video/${id}?${p.toString()}`
    }
    return raw
  } catch {
    return raw
  }
}

export function VideoEmbedSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const maxWidth = typeof s.max_width_video === "number" ? s.max_width_video : 800
  const radius = typeof s.border_radius === "number" ? s.border_radius : 8
  const shadow = bool(s.show_shadow, true)
  const align = str(s.alignment, "center")
  const justify = align === "left" ? "mr-auto ml-0" : align === "right" ? "ml-auto mr-0" : "mx-auto"
  const ratio = str(s.aspect_ratio, "16:9")
  const [w, h] = ratio.split(":").map(Number)
  const paddingBottom = w && h ? `${(h / w) * 100}%` : "56.25%"

  const provider = str(s.provider, "youtube")
  const rawUrl = str(s.video_url)
  const isSelfHosted = provider === "self-hosted"
  const embedUrl = isSelfHosted ? rawUrl : toEmbedUrl(rawUrl, provider, {
    autoplay: bool(s.autoplay, false),
    mute: bool(s.mute_video, false),
    loop: bool(s.loop_video, false),
    controls: bool(s.show_controls, true),
  })
  const poster = str(s.video_poster)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-(--theme-page-width) mx-auto px-(--theme-padding-x)" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {(!!s.heading || !!s.subheading) && (
          <div className="text-center mb-8">
            {!!s.heading && <h2 className="text-3xl font-bold mb-2">{str(s.heading)}</h2>}
            {!!s.subheading && <p className="opacity-70">{str(s.subheading)}</p>}
          </div>
        )}
        <div className={`${justify} relative overflow-hidden`} style={{ maxWidth, borderRadius: radius, boxShadow: shadow ? "0 10px 40px rgba(0,0,0,0.15)" : undefined }}>
          <div style={{ paddingBottom }} />
          {embedUrl ? (
            isSelfHosted ? (
              <video
                src={embedUrl}
                poster={poster || undefined}
                autoPlay={bool(s.autoplay, false)}
                muted={bool(s.mute_video, false)}
                loop={bool(s.loop_video, false)}
                controls={bool(s.show_controls, true)}
                className="absolute inset-0 w-full h-full object-cover"
                playsInline
              />
            ) : (
              <iframe
                src={embedUrl}
                className="absolute inset-0 w-full h-full"
                title={str(s.heading, "Embedded video")}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm opacity-60 border-2 border-dashed border-current">
              Paste a YouTube, Vimeo, or direct video URL in the settings panel.
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default VideoEmbedSection
