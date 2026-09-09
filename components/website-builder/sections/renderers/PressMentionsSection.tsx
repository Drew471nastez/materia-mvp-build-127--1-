"use client"

import type { CSSProperties }  from "react"

// Press mentions — logos (optionally grayscale) with optional pull
// quotes. Supports logos-only, logos-with-quotes, or a single featured
// quote + logo row layout.

import { cn } from "@/lib/utils"
import { str, bool, SectionWrapper, type SectionProps } from "../_shared"

/**
 * A press logo, optionally tinted to one colour.
 *
 * A dozen mastheads in a dozen brand colours is noise, which is why the panel
 * has offered a "Logo tint color" from the start — and why nothing reading it
 * left every press row either full-colour or grey.
 *
 * A CSS filter cannot recolour an arbitrary image, so the tint is a MASK: the
 * wrapper is painted in the chosen colour and the logo's own transparency
 * becomes the stencil. The image stays in the tree, sized and laid out as
 * before but invisible, so the wrapper takes exactly its dimensions and
 * `object-contain` and `mask-size: contain` agree about where the mark sits.
 */
function Logo({
  src,
  alt,
  tint,
  style,
  className,
}: {
  src: string
  alt: string
  tint: string
  style: CSSProperties
  className?: string
}) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={src} alt={alt} className={cn("h-8 object-contain", !tint && className)} style={tint ? { ...style, opacity: 0 } : style} />
  if (!tint) return img
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block", className)}
      style={{
        backgroundColor: tint,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    >
      {img}
    </span>
  )
}

export function PressMentionsSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const blocks = section.blocks ?? []
  const bg = str(s.bg_color, "#ffffff")
  const color = str(s.text_color, "#0f172a")
  const accent = str(s.accent_color, "#6366f1")
  const cardBg = str(s.card_bg_color, "#f8fafc")
  const layout = str(s.layout, "logos_only")
  const cols = str(s.columns, "4")
  const grayscale = bool(s.grayscale, true)
  const hoverColor = bool(s.hover_color, true)
  const maxWidthMap: Record<string, string> = { narrow: "max-w-xl", medium: "max-w-3xl", wide: "max-w-(--theme-page-width)", full: "max-w-none" }
  const mw = maxWidthMap[str(s.max_width, "wide")] ?? "max-w-(--theme-page-width)"
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60

  const gridCols = cols === "3" ? "grid-cols-2 @[768px]:grid-cols-3"
    : cols === "5" ? "grid-cols-2 @[768px]:grid-cols-5"
    : cols === "6" ? "grid-cols-2 @[768px]:grid-cols-6"
    : "grid-cols-2 @[768px]:grid-cols-4"

  /**
   * `logo_color` tints the marks to one colour, which is what a press row
   * usually wants: a dozen brand logos in a dozen brand colours is noise. The
   * picker was in the panel and nothing read it, so every logo kept its own
   * colours or went grey.
   *
   * A CSS filter cannot recolour an arbitrary image, so the tint is applied as
   * a mask — the logo becomes a stencil filled with the chosen colour, which
   * works for the transparent PNGs and SVGs press logos come as.
   */
  const tint = str(s.logo_color)

  const logoStyle = grayscale && !tint
    ? { filter: "grayscale(1)", opacity: 0.7, transition: "filter 0.2s, opacity 0.2s" }
    : { opacity: 0.85 }

  const featured = layout === "featured" ? blocks[0] : undefined
  const logoBlocks = layout === "featured" ? blocks.slice(1) : blocks

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={`${mw} mx-auto px-6`} style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {(!!s.eyebrow || !!s.heading || !!s.subheading) && (
          <div className="text-center mb-10">
            {!!s.eyebrow && <p className="text-xs uppercase tracking-widest opacity-70 mb-2">{str(s.eyebrow)}</p>}
            {!!s.heading && <h2 className="text-3xl font-bold mb-2">{str(s.heading)}</h2>}
            {!!s.subheading && <p className="opacity-70">{str(s.subheading)}</p>}
          </div>
        )}
        {featured && (
          <blockquote className="text-center mb-10 max-w-2xl mx-auto">
            <p className="text-2xl font-serif italic" style={{ color: accent }}>{str(featured.settings.quote)}</p>
            <footer className="mt-3 text-sm opacity-70">— {str(featured.settings.publication_name)}</footer>
          </blockquote>
        )}
        {layout === "logos_quotes" ? (
          <div className={`grid ${gridCols} gap-6`}>
            {logoBlocks.map(b => (
              <div key={b.id} className="p-6 rounded" style={{ background: cardBg }}>
                {!!b.settings.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <Logo
                    src={str(b.settings.logo_url)}
                    alt={str(b.settings.publication_name)}
                    tint={tint}
                    style={logoStyle}
                    className="mb-3"
                  />
                )}
                {!!b.settings.quote && (
                  <p className="text-sm opacity-80 mb-2">{str(b.settings.quote)}</p>
                )}
                <p className="text-xs opacity-60">{str(b.settings.publication_name)} {!!b.settings.date && `· ${str(b.settings.date)}`}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className={`grid ${gridCols} gap-8 items-center justify-items-center`}>
            {logoBlocks.map(b => {
              const logo = str(b.settings.logo_url)
              return (
                <a key={b.id} href={str(b.settings.url, "#")} className={hoverColor ? "hover:opacity-100 hover:[filter:none] transition" : ""}>
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <Logo src={logo} alt={str(b.settings.publication_name)} tint={tint} style={logoStyle} />
                  ) : (
                    <div className="text-lg font-serif opacity-60">{str(b.settings.publication_name, "Publication")}</div>
                  )}
                </a>
              )
            })}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default PressMentionsSection
