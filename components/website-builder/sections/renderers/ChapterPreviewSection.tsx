"use client"

// Chapter preview — a single chapter excerpt with optional lock/paywall
// gate, reading progress bar, and primary CTA.

import { Lock, Clock, FileText } from "lucide-react"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"
import { stableHtml } from "../stable-html"
import { FillBar } from "@/components/ui/fill-bar"

export function ChapterPreviewSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const borderColor = str(s.border_color) || c.border
  const fontFamily = str(s.font_family, "Georgia, serif")
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const progress = typeof s.progress_percent === "number" ? s.progress_percent : 15
  const isLocked = bool(s.is_locked, false)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-3xl mx-auto px-6" style={{ color, paddingTop: padTop, paddingBottom: padBottom, fontFamily }}>
        <div className="rounded-lg p-8" style={{ border: `1px solid ${borderColor}` }}>
          {!!s.intro_text && (
            <div className="text-xs uppercase tracking-widest opacity-70 mb-3">{str(s.intro_text)}</div>
          )}
          {!!s.chapter_number && (
            <div className="text-sm opacity-70 mb-1">{str(s.chapter_number)}</div>
          )}
          {!!s.chapter_title && (
            <h2 className="text-3xl font-bold mb-4" style={{ fontFamily }}>{str(s.chapter_title)}</h2>
          )}
          <div className="flex gap-5 text-xs opacity-70 mb-6">
            {!!s.word_count && (
              <div className="flex items-center gap-1"><FileText className="w-3 h-3" /> {String(s.word_count).toLocaleString()} words</div>
            )}
            {!!s.read_time_minutes && (
              <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {String(s.read_time_minutes)} min read</div>
            )}
          </div>
          {bool(s.show_progress_bar, true) && (
            <div className="mb-6">
              <FillBar quiet value={progress} size="thin" trackStyle={{ background: borderColor }} fillStyle={{ background: color }} />
              <div className="text-xs opacity-60 mt-1">{progress}% read</div>
            </div>
          )}
          <div
            className="prose max-w-none"
            style={{ fontFamily }}
            dangerouslySetInnerHTML={stableHtml(str(s.preview_text))}
          />
          {isLocked && (
            <div className="mt-8 pt-6 border-t text-center" style={{ borderColor }}>
              <Lock className="w-6 h-6 mx-auto mb-2 opacity-60" />
              <p className="text-sm opacity-80 mb-4">{str(s.lock_message, "Purchase to read the full book")}</p>
              {!!s.cta_text && (
                <a
                  href={str(s.cta_url, "#")}
                  className="inline-block px-6 py-3 rounded font-semibold"
                  style={{ background: color, color: bg }}
                >
                  {str(s.cta_text)}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default ChapterPreviewSection
