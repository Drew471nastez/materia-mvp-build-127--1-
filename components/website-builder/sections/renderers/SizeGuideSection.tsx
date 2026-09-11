"use client"

// Size guide — clothing size chart with metric/imperial toggle, fit
// instructions, and optional model measurements. The actual size
// rows are sample data; creators should swap this for their real
// chart data in their own ThemePack override.

import { cn } from "@/lib/utils"
import { useState } from "react"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

const SIZES_METRIC = [
  { label: "XS", chest: "81–86", waist: "61–66", hips: "86–91" },
  { label: "S",  chest: "86–91", waist: "66–71", hips: "91–96" },
  { label: "M",  chest: "91–97", waist: "71–76", hips: "96–102" },
  { label: "L",  chest: "97–104", waist: "76–84", hips: "102–109" },
  { label: "XL", chest: "104–112", waist: "84–94", hips: "109–119" },
]
const SIZES_IMPERIAL = [
  { label: "XS", chest: "32–34", waist: "24–26", hips: "34–36" },
  { label: "S",  chest: "34–36", waist: "26–28", hips: "36–38" },
  { label: "M",  chest: "36–38", waist: "28–30", hips: "38–40" },
  { label: "L",  chest: "38–41", waist: "30–33", hips: "40–43" },
  { label: "XL", chest: "41–44", waist: "33–37", hips: "43–47" },
]

export function SizeGuideSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const [units, setUnits] = useState<"metric" | "imperial">(str(s.unit_system, "metric") as "metric" | "imperial")
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const headerBg = str(s.header_bg_color) || c.background_secondary
  const borderColor = str(s.border_color) || c.border
  const showToggle = bool(s.show_unit_toggle, true)
  const chartStyle = str(s.chart_style, "bordered-table")
  // The size the guide recommends, if the creator named one. The Highlight
  // Color was a picker with nothing to colour until this control existed.
  const highlightRow = str(s.highlight_size).trim().toLowerCase()
  const showFit = bool(s.show_fit_guide, true)
  const showModel = bool(s.show_model_measurements, true)
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const rows = units === "metric" ? SIZES_METRIC : SIZES_IMPERIAL
  const unit = units === "metric" ? "cm" : "in"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-4xl mx-auto px-6" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">{str(s.heading, "Size guide")}</h2>
          {!!s.description && <p className="opacity-70 max-w-2xl mx-auto">{str(s.description)}</p>}
        </div>
        {showToggle && (
          <div className="flex justify-center mb-6">
            <div className="inline-flex rounded-full p-1" style={{ background: headerBg }}>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setUnits("metric") }}
                className={`px-4 py-1.5 text-sm rounded-full ${units === "metric" ? "bg-white shadow" : ""}`}
              >cm</button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setUnits("imperial") }}
                className={`px-4 py-1.5 text-sm rounded-full ${units === "imperial" ? "bg-white shadow" : ""}`}
              >inches</button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          {/*
            `chart_style` offered Minimal Table, Bordered Table, Cards and
            Visual, and every size guide was the bordered table. Minimal drops
            the outer rule and the zebra fill; cards and visual stack each size
            as its own block, which is the only readable shape on a phone.
          */}
          <table
            className={cn("w-full text-left text-sm", chartStyle === "cards" || chartStyle === "visual" ? "block @[560px]:table" : "")}
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              border: chartStyle === "minimal-table" ? "none" : `1px solid ${borderColor}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <thead>
              <tr style={{ background: headerBg }}>
                <th className="p-3 font-semibold">Size</th>
                <th className="p-3 font-semibold">Chest ({unit})</th>
                <th className="p-3 font-semibold">Waist ({unit})</th>
                <th className="p-3 font-semibold">Hips ({unit})</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.label}
                  /**
                   * The Highlight Color picks out the recommended size — the
                   * one thing somebody is looking for in a size chart. It was
                   * in the panel and read by nothing.
                   */
                  style={{
                    background:
                      highlightRow && r.label.toLowerCase() === highlightRow
                        ? str(s.highlight_color, "#fff3e0")
                        : chartStyle === "minimal-table"
                          ? undefined
                          : i % 2 === 1
                            ? headerBg
                            : undefined,
                  }}
                >
                  <td className="p-3 font-semibold border-t" style={{ borderColor }}>{r.label}</td>
                  <td className="p-3 border-t" style={{ borderColor }}>{r.chest}</td>
                  <td className="p-3 border-t" style={{ borderColor }}>{r.waist}</td>
                  <td className="p-3 border-t" style={{ borderColor }}>{r.hips}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!!s.note_text && <p className="text-xs opacity-60 mt-3 text-center">{str(s.note_text)}</p>}
        {showFit && (
          <div className="mt-10 grid @[768px]:grid-cols-2 gap-6 items-start">
            {!!s.fit_guide_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={str(s.fit_guide_image)} alt="Fit guide" className="w-full rounded" />
            ) : (
              <div className="w-full aspect-[3/4] rounded border-2 border-dashed border-current opacity-30" />
            )}
            <div>
              <h3 className="text-lg font-semibold mb-3">How to measure</h3>
              <pre className="whitespace-pre-wrap font-sans text-sm opacity-80">{str(s.fit_guide_text)}</pre>
              {showModel && !!s.model_info && (
                <p className="mt-4 text-sm italic opacity-70">{str(s.model_info)}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default SizeGuideSection
