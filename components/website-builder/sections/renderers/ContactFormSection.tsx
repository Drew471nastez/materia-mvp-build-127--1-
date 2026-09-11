"use client"

// Contact form — centered or split form. Submission is stubbed at the
// renderer level (success/error state is local); the host app is
// responsible for wiring the POST target if it wants real submissions.

import { useState } from "react"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

export function ContactFormSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const [state, setState] = useState<"idle" | "success" | "error">("idle")
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const inputBg = str(s.input_bg_color) || c.input_background
  const inputBorder = str(s.input_border_color) || c.input_border
  const btnBg = str(s.button_color) || c.primary_btn_bg
  const btnText = str(s.button_text_color) || c.primary_btn_text
  const layout = str(s.layout, "centered")
  const splitImage = str(s.split_image)
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 80
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 80

  const inputStyle: React.CSSProperties = { background: inputBg, border: `1px solid ${inputBorder}`, color }
  const inputClass = "w-full px-4 py-3 rounded text-sm"

  /**
   * IT SAID THE MESSAGE HAD BEEN SENT AND SENT NOTHING.
   *
   * `onSubmit` set the success state and stopped. Both controls the section
   * offers for delivery — Recipient Email and Subject Prefix — were declared
   * and read by nothing, so there was no address for a message to go to even
   * in principle, and every visitor who filled the form in was told it had
   * arrived.
   *
   * Composing a `mailto:` is the honest thing a section can do with no server
   * of its own: the visitor's mail client opens with the message ready to
   * send, addressed to the recipient the creator typed, subject prefixed as
   * they asked. Where no recipient has been set the form still cannot deliver
   * anything, so it says so instead of claiming success.
   */
  const recipient = str(s.recipient_email).trim()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isEditing) {
      // The canvas is not a place to open a mail client.
      setState("success")
      return
    }
    if (!recipient) {
      setState("error")
      return
    }
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? "").trim()
    const prefix = str(s.subject_prefix, "[Contact Form]")
    const subject = [prefix, value("subject") || "Message from your website"]
      .filter(Boolean)
      .join(" ")
    const body = [
      value("name") && `Name: ${value("name")}`,
      value("email") && `Email: ${value("email")}`,
      value("company") && `Company: ${value("company")}`,
      value("phone") && `Phone: ${value("phone")}`,
      "",
      value("message"),
    ]
      .filter((line) => line !== undefined && line !== "")
      .join("\n")

    window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setState("success")
  }

  const form = (
    <form onSubmit={submit} className="space-y-3 max-w-md w-full">
      {state === "success" ? (
        <div className="text-sm py-4">{str(s.success_message, "Thanks! Your message has been sent.")}</div>
      ) : state === "error" ? (
        <div className="text-sm py-4 text-red-600">{str(s.error_message, "Something went wrong. Please try again.")}</div>
      ) : (
        <>
          {bool(s.show_name, true) && <input type="text" name="name" placeholder="Name" required className={inputClass} style={inputStyle} />}
          <input type="email" name="email" placeholder="Email" required className={inputClass} style={inputStyle} />
          {bool(s.show_company, false) && <input type="text" name="company" placeholder="Company" className={inputClass} style={inputStyle} />}
          {bool(s.show_phone, false) && <input type="tel" name="phone" placeholder="Phone" className={inputClass} style={inputStyle} />}
          {bool(s.show_subject, true) && <input type="text" name="subject" placeholder="Subject" className={inputClass} style={inputStyle} />}
          {bool(s.show_message, true) && <textarea name="message" placeholder="Message" rows={5} required className={inputClass} style={inputStyle} />}
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
      <div className="max-w-(--theme-page-width) mx-auto px-(--theme-padding-x)" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
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
