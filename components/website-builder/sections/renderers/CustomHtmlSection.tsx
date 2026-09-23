"use client"

// Custom HTML — renders creator-authored HTML inside a padded container.
//
// WHAT MAKES THIS SAFE IS NOT WHO AUTHORED IT. This comment used to say the
// install is scoped to the creator who wrote the HTML, so anything in it was
// their own problem. Neither half holds. The page is served from
// storelib.com, so script here runs on the platform's origin in front of
// whoever is reading the store; and a theme can be imported from a package
// somebody else built, which is a stranger's markup on this creator's site.
//
// What makes it safe is that `html_content` has been through
// lib/website-builder/sanitize.ts before it reaches here: on save, on import,
// and again on every read. Tags that can execute are not in the allow list,
// so what arrives is markup. Keep it that way — a new path that writes this
// setting has to clean it, and tests/theme-sharing.test.ts is what checks.

import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"
import { useMemo } from "react"

export function CustomHtmlSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 40
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 40
  const html = str(s.html_content)
  /* Kept while unchanged, or every render re-parses and re-runs it. See ../stable-html. */
  const htmlProp = useMemo(() => ({ __html: html }), [html])

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="max-w-(--theme-page-width) mx-auto px-(--theme-padding-x)"
        style={{ color, paddingTop: padTop, paddingBottom: padBottom }}
      >
        {html ? (
          <div dangerouslySetInnerHTML={htmlProp} />
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
