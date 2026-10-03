"use client"

// Contact form: centered or split. The message goes to the creator through
// the website's own contact route (see `submit` below): kept in Emails,
// emailed to them with Reply going to the visitor. Ticking "Keep me updated"
// also makes the sender a subscriber, and nothing else does.

import { useEffect, useRef, useState } from "react"
import { sectionColors, str, bool, SectionWrapper, type SectionProps, schemeButton } from "../_shared"
import { useStorefront } from "../../theme/storefront-context"
import { useStorelibPage } from "../storelib-sources"
import { pageKeyOfTemplate, sendContactMessage } from "@/lib/website-builder/contact-client"

export function ContactFormSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle")
  const [problem, setProblem] = useState<string | null>(null)
  const { creatorId, inEditor } = useStorefront()
  const { template } = useStorelibPage()
  /* When the form appeared, for how long it was on the screen before it was sent. */
  const shownAt = useRef(0)
  useEffect(() => { shownAt.current = Date.now() }, [])
  const offerOptIn = bool(s.show_subscribe_opt_in, true)
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const inputBg = str(s.input_bg_color) || c.input_background
  const inputBorder = str(s.input_border_color) || c.input_border
  const layout = str(s.layout, "centered")
  const splitImage = str(s.split_image)
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 80
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 80

  const inputStyle: React.CSSProperties = { background: inputBg, border: `1px solid ${inputBorder}`, color }
  const inputClass = "w-full px-4 py-3 rounded text-sm"

  /**
   * IT SAID THE MESSAGE HAD BEEN SENT AND SENT NOTHING.
   *
   * First `onSubmit` set the success state and stopped. Then it opened the
   * visitor's own mail app with a `mailto:` link, which kept nothing, reached
   * nobody when the creator had left Recipient Email empty, and told every
   * visitor without a mail app set up that their message had gone.
   *
   * It posts to the website's contact route now (lib/site-contact): the
   * message is kept for the creator in Emails and emailed to them, to the
   * Recipient Email when they set one (read on the server from the published
   * section, never from this page) and otherwise to their support email.
   * Company and Phone ride in the message; the Subject Prefix goes in front
   * of the subject, as it always did. `hp_company` is the field no person
   * sees, which a script fills in.
   *
   * A CONTACT MESSAGE IS NOT A SIGN-UP. The sender joins the creator's
   * Subscribers only when they ticked the box, which starts unticked;
   * otherwise they are kept as a contact who wrote, and never emailed news.
   */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isEditing || inEditor) {
      // The canvas is not a place to send anything.
      setState("success")
      return
    }
    if (!creatorId) {
      setProblem(null)
      setState("error")
      return
    }
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? "").trim()
    const prefix = str(s.subject_prefix, "[Contact Form]")
    const extra = [value("company") && `Company: ${value("company")}`, value("phone") && `Phone: ${value("phone")}`]
      .filter(Boolean)
      .join("\n")
    setState("sending")
    const result = await sendContactMessage({
      creatorId,
      name: value("name"),
      email: value("email"),
      subject: [prefix, value("subject")].filter(Boolean).join(" "),
      message: [value("message"), extra].filter(Boolean).join("\n\n"),
      consent: offerOptIn && data.get("subscribe") === "yes",
      company: value("hp_company"),
      elapsed: shownAt.current ? Date.now() - shownAt.current : 0,
      page: pageKeyOfTemplate(template),
      sectionId: section.id,
    })
    if (result.ok === false) {
      setProblem(result.error)
      setState("error")
      return
    }
    setState("success")
  }

  const form = (
    <form onSubmit={submit} className="space-y-3 max-w-md w-full">
      {state === "success" ? (
        <div className="text-sm py-4" role="status">{str(s.success_message, "Thanks! Your message has been sent.")}</div>
      ) : (
        <>
          {bool(s.show_name, true) && <input type="text" name="name" placeholder={str(s.name_placeholder, "Your name")} autoComplete="name" maxLength={120} required className={inputClass} style={inputStyle} />}
          <input type="email" name="email" placeholder={str(s.email_placeholder, "you@example.com")} autoComplete="email" maxLength={254} required className={inputClass} style={inputStyle} />
          {bool(s.show_company, false) && <input type="text" name="company" placeholder="Company" className={inputClass} style={inputStyle} />}
          {bool(s.show_phone, false) && <input type="tel" name="phone" placeholder="Phone" className={inputClass} style={inputStyle} />}
          {bool(s.show_subject, true) && <input type="text" name="subject" placeholder={str(s.subject_placeholder, "What it is about")} maxLength={150} className={inputClass} style={inputStyle} />}
          {bool(s.show_message, true) && <textarea name="message" placeholder={str(s.message_placeholder, "Write your message")} rows={5} maxLength={5000} required className={inputClass} style={inputStyle} />}
          {/* For scripts only: nobody sees it or can tab to it. */}
          <div aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)", opacity: 0, pointerEvents: "none" }}>
            <input type="text" name="hp_company" tabIndex={-1} autoComplete="off" />
          </div>
          {offerOptIn && (
            <label className="flex items-center gap-2 text-sm" style={{ color }}>
              {/* Unticked, always. Consent is something a person gives. */}
              <input type="checkbox" name="subscribe" value="yes" className="h-4 w-4" />
              Keep me updated
            </label>
          )}
          {state === "error" && (
            <p className="text-sm text-red-600" role="alert">
              {problem || str(s.error_message, "Something went wrong. Please try again.")}
            </p>
          )}
          {/* For the creator in the builder only: where these messages go. */}
          {(isEditing || inEditor) && (
            <p className="text-xs opacity-60">
              {str(s.recipient_email).trim()
                ? `Messages are emailed to ${str(s.recipient_email).trim()} and kept in Emails.`
                : "Messages are emailed to your support email and kept in Emails."}
            </p>
          )}
          <button
            type="submit"
            disabled={state === "sending"}
            className="px-5 py-3 rounded text-sm font-semibold disabled:opacity-60"
            data-sl-button="primary"
            style={schemeButton(c, "primary", { background: str(s.button_color), text: str(s.button_text_color) }).style}
          >
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
      <div className="relative max-w-(--theme-page-width) mx-auto px-(--theme-padding-x)" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
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
