"use client"

// Press mentions — logos (optionally grayscale) with optional pull
// quotes. Supports logos-only, logos-with-quotes, or a single featured
// quote + logo row layout.

import { str, bool, SectionWrapper, type SectionProps } from "../_shared"

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
  const maxWidthMap: Record<string, string> = { narrow: "max-w-xl", medium: "max-w-3xl", wide: "max-w-[1230px]", full: "max-w-none" }
  const mw = maxWidthMap[str(s.max_width, "wide")] ?? "max-w-[1230px]"
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60

  const gridCols = cols === "3" ? "grid-cols-2 @[768px]:grid-cols-3"
    : cols === "5" ? "grid-cols-2 @[768px]:grid-cols-5"
    : cols === "6" ? "grid-cols-2 @[768px]:grid-cols-6"
    : "grid-cols-2 @[768px]:grid-cols-4"

  const logoStyle = grayscale
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
                  <img src={str(b.settings.logo_url)} alt={str(b.settings.publication_name)} className="h-8 object-contain mb-3" style={logoStyle} />
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
                    <img src={logo} alt={str(b.settings.publication_name)} className="h-8 object-contain" style={logoStyle} />
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
