"use client"

// Custom HTML — renders creator-authored HTML inside a padded container.
// The HTML is their OWN site content so we intentionally use
// `dangerouslySetInnerHTML` to match creator expectations (e.g. paste-in
// embed codes, script tags, etc.). This is safe because the install is
// scoped to the creator who authored it.

import { str, SectionWrapper, type SectionProps } from "../_shared"

export function CustomHtmlSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const color = str(s.text_color, "#111111")
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 40
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 40
  const html = str(s.html_content)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="max-w-[1230px] mx-auto px-8"
        style={{ color, paddingTop: padTop, paddingBottom: padBottom }}
      >
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="text-center py-12 text-sm opacity-60 border-2 border-dashed border-current rounded">
            Add custom HTML, CSS or JavaScript in the settings panel.
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default CustomHtmlSection
