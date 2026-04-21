"use client"

// Comparison table — side-by-side pricing/plan comparison. Columns are
// `comparison_column` blocks; rows are `comparison_row` blocks (with an
// optional `is_divider` flag to insert section headers inside the
// table).

import { Check, X } from "lucide-react"
import { str, bool, SectionWrapper, type SectionProps } from "../_shared"

function isYes(v: string): boolean | null {
  const t = v.trim().toLowerCase()
  if (["yes", "true", "y", "✓"].includes(t)) return true
  if (["no", "false", "n", "-", "—"].includes(t)) return false
  return null
}

export function ComparisonTableSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const blocks = section.blocks ?? []
  const columns = blocks.filter(b => b.type === "comparison_column")
  const rows = blocks.filter(b => b.type === "comparison_row")
  const bg = str(s.bg_color, "#ffffff")
  const color = str(s.text_color, "#0f172a")
  const headerBg = str(s.header_bg_color, "#f8fafc")
  const highlightBg = str(s.highlight_bg_color, "#6366f1")
  const highlightText = str(s.highlight_text_color, "#ffffff")
  const rowAlt = str(s.row_alt_bg_color, "#f8fafc")
  const border = str(s.border_color, "#e2e8f0")
  const checkColor = str(s.check_color, "#22c55e")
  const crossColor = str(s.cross_color, "#ef4444")
  const radius = typeof s.border_radius === "number" ? s.border_radius : 12
  const showCheck = bool(s.show_check_icons, true)
  const showCta = bool(s.show_cta_row, true)
  const highlightIdx = typeof s.highlight_column === "number" ? s.highlight_column : 1
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-[1230px] mx-auto px-6" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {(!!s.heading || !!s.subheading) && (
          <div className="text-center mb-10">
            {!!s.heading && <h2 className="text-3xl font-bold mb-2">{str(s.heading)}</h2>}
            {!!s.subheading && <p className="opacity-70">{str(s.subheading)}</p>}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: 0, borderRadius: radius, overflow: "hidden", border: `1px solid ${border}` }}>
            <thead>
              <tr>
                <th className="p-4" style={{ background: headerBg }}></th>
                {columns.map((col, i) => {
                  const isHL = bool(col.settings.is_highlighted, false) || i === highlightIdx
                  return (
                    <th key={col.id} className="p-4 text-center" style={{ background: isHL ? highlightBg : headerBg, color: isHL ? highlightText : color }}>
                      {!!col.settings.badge && (
                        <div className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: isHL ? highlightText : str(col.settings.badge_color, "#f59e0b") }}>
                          {str(col.settings.badge)}
                        </div>
                      )}
                      <div className="text-lg font-bold">{str(col.settings.name)}</div>
                      {!!col.settings.price && <div className="text-2xl font-bold mt-1">{str(col.settings.price)}</div>}
                      {!!col.settings.description && <div className="text-xs opacity-80 mt-1">{str(col.settings.description)}</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                if (bool(row.settings.is_divider, false)) {
                  return (
                    <tr key={row.id}>
                      <td colSpan={columns.length + 1} className="p-3 text-xs font-bold uppercase tracking-widest opacity-70" style={{ background: headerBg }}>
                        {str(row.settings.divider_label)}
                      </td>
                    </tr>
                  )
                }
                const values = str(row.settings.values).split(",").map(v => v.trim())
                return (
                  <tr key={row.id} style={{ background: i % 2 === 1 ? rowAlt : undefined }}>
                    <td className="p-4 border-t" style={{ borderColor: border }}>
                      <div>{str(row.settings.feature)}</div>
                      {!!row.settings.tooltip && <div className="text-xs opacity-60">{str(row.settings.tooltip)}</div>}
                    </td>
                    {columns.map((col, ci) => {
                      const isHL = bool(col.settings.is_highlighted, false) || ci === highlightIdx
                      const v = values[ci] ?? ""
                      const yn = showCheck ? isYes(v) : null
                      return (
                        <td key={col.id} className="p-4 text-center border-t" style={{ borderColor: border, background: isHL ? highlightBg : undefined, color: isHL ? highlightText : undefined }}>
                          {yn === true ? <Check className="w-5 h-5 inline" style={{ color: checkColor }} /> :
                           yn === false ? <X className="w-5 h-5 inline opacity-60" style={{ color: crossColor }} /> :
                           v || "—"}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {showCta && columns.some(c => c.settings.cta_text) && (
                <tr>
                  <td className="p-4 border-t" style={{ borderColor: border }}></td>
                  {columns.map((col, ci) => {
                    const isHL = bool(col.settings.is_highlighted, false) || ci === highlightIdx
                    return (
                      <td key={col.id} className="p-4 text-center border-t" style={{ borderColor: border, background: isHL ? highlightBg : undefined }}>
                        {!!col.settings.cta_text && (
                          <a
                            href={str(col.settings.cta_url, "#")}
                            className="inline-block px-4 py-2 rounded text-sm font-semibold"
                            style={{ background: isHL ? highlightText : highlightBg, color: isHL ? highlightBg : highlightText }}
                          >
                            {str(col.settings.cta_text)}
                          </a>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SectionWrapper>
  )
}

export default ComparisonTableSection
