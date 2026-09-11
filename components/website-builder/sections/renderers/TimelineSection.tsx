"use client"

// Timeline — vertical "our story" section. Supports left-aligned,
// center-aligned, or alternating layouts with a connector line and
// per-item highlight color.

import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function TimelineSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const blocks = section.blocks ?? []
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const connector = str(s.connector_color) || c.border
  const dotColor = str(s.dot_color) || c.accent
  const connectorStyle = str(s.connector_style, "line")
  const dotSize = typeof s.dot_size === "number" ? s.dot_size : 16
  const layout = str(s.layout, "alternating")
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 80
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 80

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-5xl mx-auto px-6" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {(!!s.heading || !!s.subheading) && (
          <div className="text-center mb-12">
            {!!s.heading && <h2 className="text-3xl font-bold mb-2">{str(s.heading)}</h2>}
            {!!s.subheading && <p className="opacity-70">{str(s.subheading)}</p>}
          </div>
        )}
        <div className="relative">
          <div
            /**
             * The Connector Style control offered Line, Dots and Arrows and
             * always drew a line. Dots and arrows are the same one-pixel
             * column painted with a repeating gradient rather than a solid —
             * no extra elements, so the dots line up with the entries exactly
             * as the solid rule did.
             */
            className={`absolute top-0 bottom-0 w-px ${layout === "center" || layout === "alternating" ? "left-1/2 -translate-x-1/2" : "left-5"}`}
            style={
              connectorStyle === "dots"
                ? { backgroundImage: `repeating-linear-gradient(to bottom, ${connector} 0 4px, transparent 4px 10px)` }
                : connectorStyle === "arrows"
                  ? { backgroundImage: `repeating-linear-gradient(to bottom, ${connector} 0 14px, transparent 14px 22px)` }
                  : { background: connector }
            }
          />
          <div className="space-y-12">
            {blocks.map((b, i) => {
              const side = layout === "alternating" ? (i % 2 === 0 ? "left" : "right") : str(b.settings.side, layout === "left" ? "left" : "right")
              const highlight = str(b.settings.highlight_color, "#e67e22")
              const isRight = side === "right" && (layout === "center" || layout === "alternating")
              return (
                <div key={b.id} className="relative">
                  <div
                    className={`absolute ${layout === "left" ? "left-5 -translate-x-1/2" : "left-1/2 -translate-x-1/2"} rounded-full z-10`}
                    style={{ width: dotSize, height: dotSize, background: dotColor, top: 6 }}
                  />
                  <div className={
                    layout === "left"
                      ? "pl-14"
                      : isRight
                        ? "@[768px]:ml-[50%] @[768px]:pl-10"
                        : "@[768px]:mr-[50%] @[768px]:pr-10 @[768px]:text-right"
                  }>
                    <div className="text-sm font-semibold mb-1" style={{ color: highlight }}>{str(b.settings.year)}</div>
                    <h3 className="text-xl font-bold mb-2">{str(b.settings.title)}</h3>
                    <p className="text-sm opacity-80">{str(b.settings.description)}</p>
                    {!!b.settings.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={str(b.settings.image)} alt="" className="mt-3 rounded w-full max-w-sm" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </SectionWrapper>
  )
}

export default TimelineSection
