"use client"

// ============================================================
// Storelib Theme Engine — FooterSection
// Extracted from SectionRenderer.tsx (Stage 2 refactor).
// Behaviour is identical to the inline version it replaced.
// ============================================================

import {
  type SectionProps,
  resolveScheme,
  str,
  SectionWrapper,
} from "../_shared"

export function FooterSection({ section, theme, isEditing, isSelected, onClick, canvasRoundedBottomPx }: SectionProps) {
  const s = section.settings
  // Footers default to the "dark" scheme when no scheme is explicitly set
  const schemeKey = typeof s.color_scheme === "string" ? s.color_scheme : "dark"
  const c = resolveScheme(theme, schemeKey)
  const bg = c.bg
  const headingColor = c.heading
  const linkColor = c.footer_link
  const linkUnderlineColor = c.footer_link_underline
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick} canvasRoundedBottomPx={canvasRoundedBottomPx}>
      <div className="px-8 py-10 flex flex-col @[640px]:flex-row items-center justify-between gap-4 max-w-[1230px] mx-auto">
        <div>
          <div className="font-bold text-[15px] mb-1" style={{ color: headingColor }}>
            {str(s.logo_text, theme.brand_name ?? "My Store")}
          </div>
          <div className="text-[12px]" style={{ color: c.paragraph }}>
            {str(s.copyright, `© ${new Date().getFullYear()} My Store`)}
          </div>
        </div>
        {blocks.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap">
            {blocks.map(block => (
              <a
                key={block.id}
                href={str(block.settings.url, "#")}
                className="text-[13px] hover:opacity-100 transition-opacity"
                style={{ color: linkColor, textDecorationColor: linkUnderlineColor }}
              >
                {str(block.settings.label)}
              </a>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default FooterSection
