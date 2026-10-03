"use client"

/**
 * Newsletter: a centred or split email capture form.
 *
 * IT USED TO CAPTURE NOTHING. The submit handler called `preventDefault()`
 * and set the success message, so a visitor read "you're in, check your
 * inbox" and no address was recorded anywhere, on any site built with this
 * section. A button that plainly does nothing is better than one that says
 * it worked.
 *
 * It posts to /api/website-builder/subscribe now (through subscribeToCreator,
 * the client every email box on a website shares), which writes to the same
 * `subscribers` table as every other capture on the platform and fires the
 * creator's welcome automation. Inside the builder's canvas it still only
 * shows the success state, because designing a page is not subscribing to
 * it.
 */

import { useState } from "react"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"
import { hexToRgba } from "../_shared"
import { useStorefront } from "../../theme/storefront-context"
import { signupMode, subscribeToCreator } from "@/lib/website-builder/subscribe-client"

export function NewsletterSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const { creatorId, inEditor } = useStorefront()
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState("")
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const layout = str(s.layout, "centered")
  const bgImage = str(s.bg_image)
  const overlayOp = typeof s.bg_overlay_opacity === "number" ? s.bg_overlay_opacity : 40

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    /* The canvas is not a place to join a mailing list: it shows the success line (lib/website-builder/subscribe-client signupMode). */
    const mode = signupMode({ inEditor: isEditing || inEditor, creatorId })
    if (mode === "preview") { setSubmitted(true); return }
    /* Nobody to send it to (a cover screenshot). Saying thanks here would be saying it was kept. */
    if (mode === "unavailable" || !creatorId) { setFailed("Sign-ups are not available on this page."); return }
    const data = new FormData(e.currentTarget)
    const email = String(data.get("email") ?? "").trim()
    const name = String(data.get("name") ?? "").trim()
    if (!email) return
    setSending(true)
    setFailed("")
    /* The same client and endpoint as every email box on a website, so the subscriber lands in the creator's Subscribers with where it came from. */
    const result = await subscribeToCreator({ creatorId, email, name, placement: "newsletter" })
    setSending(false)
    /* Said plainly, and the form stays filled in so nobody retypes it. */
    if (result.ok === false) { setFailed(result.error); return }
    setSubmitted(true)
  }

  const form = (
    <form
      onSubmit={submit}
      className="w-full max-w-md mx-auto"
    >
      {submitted ? (
        <div className="text-center text-sm py-4" style={{ color }}>
          {str(s.success_message, "Thanks, you're on the list.")}
        </div>
      ) : (
        <>
          {bool(s.show_name_field, false) && (
            <input
              type="text"
              name="name"
              autoComplete="given-name"
              placeholder="First name"
              className="w-full mb-3 px-4 py-3 rounded text-sm"
              style={{ background: hexToRgba(color, 0.1), color, border: `1px solid ${hexToRgba(color, 0.3)}` }}
            />
          )}
          <div className="flex flex-col @[640px]:flex-row gap-2">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={str(s.placeholder, "Enter your email address")}
              className="flex-1 px-4 py-3 rounded text-sm"
              style={{ background: hexToRgba(color, 0.1), color, border: `1px solid ${hexToRgba(color, 0.3)}` }}
            />
            <button
              type="submit"
              disabled={sending}
              className="px-5 py-3 rounded text-sm font-semibold transition-opacity disabled:opacity-60"
              style={{ background: color, color: bg }}
            >
              {sending ? "Subscribing…" : str(s.button_text, "Subscribe")}
            </button>
          </div>
          {failed && (
            <p role="alert" className="mt-3 text-xs text-center" style={{ color }}>
              {failed}
            </p>
          )}
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
        <div className="max-w-(--theme-page-width) mx-auto px-(--theme-padding-x) relative">
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
