"use client"

// Process steps — horizontal, vertical, or zigzag layout of numbered
// steps with optional icon + image per step.

import { str, bool, SectionWrapper, DynamicIcon, type SectionProps } from "../_shared"

export function ProcessStepsSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const blocks = section.blocks ?? []
  const bg = str(s.bg_color, "#ffffff")
  const color = str(s.text_color, "#111827")
  const connector = str(s.connector_color, "#e5e7eb")
  const showNumbers = bool(s.show_numbers, true)
  const layout = str(s.layout, "horizontal")
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
        <div className={layout === "horizontal" ? "grid gap-6 grid-cols-1 @[768px]:grid-cols-3 @[1024px]:grid-cols-4" : "space-y-8"}>
          {blocks.map((b, i) => {
            const icon = str(b.settings.icon, "zap")
            return (
              <div
                key={b.id}
                className={`relative ${layout === "zigzag" && i % 2 === 1 ? "@[768px]:ml-20" : ""}`}
              >
                <div className="flex gap-4">
                  {showNumbers && (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0"
                      style={{ background: color, color: bg }}
                    >
                      {str(b.settings.number, String(i + 1).padStart(2, "0"))}
                    </div>
                  )}
                  {!showNumbers && icon && (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: connector }}>
                      <DynamicIcon name={icon} className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">{str(b.settings.title, "Step")}</h3>
                    <p className="text-sm opacity-80">{str(b.settings.description)}</p>
                  </div>
                </div>
                {layout === "horizontal" && i < blocks.length - 1 && (
                  <div
                    className="hidden @[1024px]:block absolute top-5 right-0 translate-x-full w-full h-px"
                    style={{ background: connector }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default ProcessStepsSection
