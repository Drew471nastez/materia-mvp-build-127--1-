"use client"

// Contact form — centered or split form. Submission is stubbed at the
// renderer level (success/error state is local); the host app is
// responsible for wiring the POST target if it wants real submissions.

import { useState } from "react"
import { str, bool, SectionWrapper, type SectionProps } from "../_shared"

export function ContactFormSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const [state, setState] = useState<"idle" | "success" | "error">("idle")
  const bg = str(s.bg_color, "#ffffff")
  const color = str(s.text_color, "#111111")
  const inputBg = str(s.input_bg_color, "#f9f9f9")
  const inputBorder = str(s.input_border_color, "#d0d0d0")
  const btnBg = str(s.button_color, "#111111")
  const btnText = str(s.button_text_color, "#ffffff")
  const layout = str(s.layout, "centered")
  const splitImage = str(s.split_image)
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 80
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 80

  const inputStyle: React.CSSProperties = { background: inputBg, border: `1px solid ${inputBorder}`, color }
  const inputClass = "w-full px-4 py-3 rounded text-sm"

  const form = (
    <form
      onSubmit={e => { e.preventDefault(); setState("success") }}
      className="space-y-3 max-w-md w-full"
    >
      {state === "success" ? (
        <div className="text-sm py-4">{str(s.success_message, "Thanks! Your message has been sent.")}</div>
      ) : state === "error" ? (
        <div className="text-sm py-4 text-red-600">{str(s.error_message, "Something went wrong. Please try again.")}</div>
      ) : (
        <>
          {bool(s.show_name, true) && <input type="text" placeholder="Name" required className={inputClass} style={inputStyle} />}
          <input type="email" placeholder="Email" required className={inputClass} style={inputStyle} />
          {bool(s.show_company, false) && <input type="text" placeholder="Company" className={inputClass} style={inputStyle} />}
          {bool(s.show_phone, false) && <input type="tel" placeholder="Phone" className={inputClass} style={inputStyle} />}
          {bool(s.show_subject, true) && <input type="text" placeholder="Subject" className={inputClass} style={inputStyle} />}
          {bool(s.show_message, true) && <textarea placeholder="Message" rows={5} required className={inputClass} style={inputStyle} />}
          <button type="submit" className="px-5 py-3 rounded text-sm font-semibold" style={{ background: btnBg, color: btnText }}>
            {str(s.submit_button_text, "Send Message")}
          </button>
        </>
      )}
    </form>
  )

  const header = (
    <div className="mb-6">
      {!!s.heading && <h2 className="text-3xl font-bold mb-2">{str(s.heading)}</h2>}
      {!!s.subheading && <p className="opacity-70">{str(s.subheading)}</p>}
    </div>
  )

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-[1230px] mx-auto px-6" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {layout === "split" ? (
          <div className="grid @[768px]:grid-cols-2 gap-8 items-start">
            <div>
              {splitImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={splitImage} alt="" className="w-full rounded" />
              ) : (
                <div className="w-full aspect-[4/3] rounded border-2 border-dashed border-current opacity-30" />
              )}
            </div>
            <div>{header}{form}</div>
          </div>
        ) : (
          <div className="max-w-xl mx-auto">
            {header}
            {form}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default ContactFormSection
