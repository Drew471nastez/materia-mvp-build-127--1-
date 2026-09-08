"use client"

// Newsletter — centered or split-layout email capture form. Submission
// is stubbed at the renderer level (shows the success message and stays
// there); actual list wiring is done by the host app's form endpoint
// when it chooses to adopt this section.

import { useState } from "react"
import { str, bool, SectionWrapper, type SectionProps } from "../_shared"
import { hexToRgba } from "../_shared"

export function NewsletterSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const [submitted, setSubmitted] = useState(false)
  const bg = str(s.bg_color, "#1e1b4b")
  const color = str(s.text_color, "#ffffff")
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const layout = str(s.layout, "centered")
  const bgImage = str(s.bg_image)
  const overlayOp = typeof s.bg_overlay_opacity === "number" ? s.bg_overlay_opacity : 40

  const form = (
    <form
      onSubmit={e => { e.preventDefault(); setSubmitted(true) }}
      className="w-full max-w-md mx-auto"
    >
      {submitted ? (
        <div className="text-center text-sm py-4" style={{ color }}>
          {str(s.success_message, "You're in! Check your inbox for a confirmation.")}
        </div>
      ) : (
        <>
          {bool(s.show_name_field, false) && (
            <input
              type="text"
              placeholder="First name"
              className="w-full mb-3 px-4 py-3 rounded text-sm"
              style={{ background: hexToRgba(color, 0.1), color, border: `1px solid ${hexToRgba(color, 0.3)}` }}
            />
          )}
          <div className="flex flex-col @[640px]:flex-row gap-2">
            <input
              type="email"
              required
              placeholder={str(s.placeholder, "Enter your email address")}
              className="flex-1 px-4 py-3 rounded text-sm"
              style={{ background: hexToRgba(color, 0.1), color, border: `1px solid ${hexToRgba(color, 0.3)}` }}
            />
            <button
              type="submit"
              className="px-5 py-3 rounded text-sm font-semibold"
              style={{ background: color, color: bg }}
            >
              {str(s.button_text, "Subscribe")}
            </button>
          </div>
          {!!s.disclaimer && (
            <p className="mt-3 text-xs opacity-70 text-center">{str(s.disclaimer)}</p>
          )}
        </>
      )}
    </form>
  )

  const content = (
    <div className="text-center relative z-10">
      {!!s.heading && <h2 className="text-4xl font-bold mb-3">{str(s.heading)}</h2>}
      {!!s.subheading && <p className="mb-2 text-lg opacity-90">{str(s.subheading)}</p>}
      {!!s.incentive_text && (
        <p className="mb-6 text-sm font-medium opacity-90">{str(s.incentive_text)}</p>
      )}
      {form}
    </div>
  )

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="relative" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {bgImage && layout !== "split" && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: bg, opacity: overlayOp / 100 }} />
          </>
        )}
        <div className="max-w-[1230px] mx-auto px-6 relative">
          {layout === "split" ? (
            <div className="grid @[768px]:grid-cols-2 gap-8 items-center">
              {bgImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bgImage} alt="" className="w-full h-80 object-cover rounded" />
              ) : (
                <div className="w-full h-80 rounded border-2 border-dashed border-current opacity-40" />
              )}
              {content}
            </div>
          ) : (
            content
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default NewsletterSection
