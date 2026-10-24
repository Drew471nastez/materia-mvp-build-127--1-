"use client"

/**
 * ===========================================================================
 *  THE EMAIL SIGNUP, DRAWN ONE WAY FOR THE PREVIEW AND THE LIVE PAGE
 * ===========================================================================
 * The "Join my newsletter" block's five layouts (lib/onepage/email-signup).
 * components/onepage/public-onepage.tsx keeps what the form does (the
 * address, the name, the hidden field, the send to /api/onepage/leads, the
 * download after) and hands its form in; this draws what is around it.
 * The editor's preview is the live page in a frame, so it is this drawing
 * too, and the editor's Layout tab draws a small copy of each from
 * EmailLayoutThumb below, in the page's own colours.
 *
 * Every layout looks finished without an image: where the picture goes, a
 * soft mail mark (Featured), a soft band (Cover), or nothing at all (Classic,
 * Bold, Simple). The soft fills are the page's text colour at a few percent,
 * not the button colour: on a page with white buttons that was white on
 * white, and the card and the band were not there.
 */

import * as React from "react"
import { Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { boldColors, tintOf, type EmailSignupLayout } from "@/lib/onepage/email-signup"

type SignupTheme = {
  text_color?: string
  secondary_text_color?: string | null
  button_color?: string
  button_text_color?: string
}

export type EmailSignupFormOptions = {
  /** The box over a full-width button, or both in one row. */
  stacked: boolean
  /** On the Bold card: the button in the card's own text colour, with the card's colour for its words (lib/onepage/email-signup boldColors). */
  inverted: { fill: string; text: string } | null
  /** Simple has no card: the box gets a hairline in the text colour, or a white box on a white page is not there. */
  outlined?: boolean
}

function MailMark({ color, size }: { color: string; size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      data-email-mark=""
      className={cn("grid shrink-0 place-items-center", size === "sm" ? "h-14 w-14 rounded-xl" : "h-12 w-12 rounded-full")}
      style={{ backgroundColor: tintOf(color, size === "sm" ? 8 : 10), color }}
    >
      <Mail className={size === "sm" ? "h-6 w-6" : "h-5 w-5"} strokeWidth={1.6} />
    </span>
  )
}

export function EmailSignupView({
  layout,
  headline,
  description,
  image,
  theme,
  stackedForm,
  renderForm,
  submitted,
  successMessage,
  afterSignup,
  animationClass,
}: {
  layout: EmailSignupLayout
  headline: string
  description?: string | null
  image: string | null
  theme: SignupTheme
  /** For the layouts that may sit in one row: whether this button's words are too long for it. */
  stackedForm: boolean
  renderForm: (options: EmailSignupFormOptions) => React.ReactNode
  submitted: boolean
  successMessage: string
  afterSignup: React.ReactNode
  animationClass?: string
}) {
  const ink = theme.text_color || "#111113"
  const soft = theme.secondary_text_color || ink
  const accent = theme.button_color || "#1a1a2e"
  const bold = boldColors(ink)

  const thanks = (color: string, align: "center" | "left") =>
    submitted ? (
      <div data-email-thanks="">
        <p className={cn("mt-2 text-xs opacity-75", align === "center" ? "text-center" : "text-left")} style={{ color }}>
          {successMessage}
        </p>
        {afterSignup}
      </div>
    ) : null

  const title = (color: string, align: "center" | "left", extra?: string) =>
    headline ? (
      <h3 className={cn("text-base font-semibold leading-snug sm:text-lg", align === "center" ? "text-center" : "text-left", extra)} style={{ color }}>
        {headline}
      </h3>
    ) : null
  const words = (color: string, align: "center" | "left", extra?: string) =>
    description ? (
      <p className={cn("text-xs leading-relaxed sm:text-sm", align === "center" ? "text-center" : "text-left", extra)} style={{ color }}>
        {description}
      </p>
    ) : null

  if (layout === "pro") {
    return (
      <div data-email-layout="pro" className={cn("w-full rounded-xl p-4 sm:rounded-2xl sm:p-5", animationClass)} style={{ backgroundColor: tintOf(ink, 5) }}>
        <div className="mb-3 flex items-center gap-3 sm:gap-4">
          {image ? (
            <img src={image} alt={headline} className="h-14 w-14 shrink-0 rounded-xl object-cover sm:h-16 sm:w-16" />
          ) : (
            <MailMark color={ink} size="sm" />
          )}
          <div className="min-w-0 flex-1">
            {title(ink, "left")}
            {words(soft, "left", "mt-0.5 line-clamp-2")}
          </div>
        </div>
        {renderForm({ stacked: stackedForm, inverted: null })}
        {thanks(ink, "center")}
      </div>
    )
  }

  if (layout === "cover") {
    return (
      <div data-email-layout="cover" className={cn("w-full overflow-hidden rounded-xl sm:rounded-2xl", animationClass)} style={{ backgroundColor: tintOf(ink, 5) }}>
        {image ? (
          <img src={image} alt={headline} className="block aspect-[2/1] w-full object-cover" />
        ) : (
          <div aria-hidden data-email-band="" className="grid h-24 place-items-center" style={{ backgroundColor: tintOf(ink, 6) }}>
            <MailMark color={ink} size="lg" />
          </div>
        )}
        <div className="p-5 sm:p-6">
          {title(ink, "center", "mb-1")}
          {words(soft, "center", "mb-4")}
          {renderForm({ stacked: true, inverted: null })}
          {thanks(ink, "center")}
        </div>
      </div>
    )
  }

  if (layout === "bold") {
    return (
      <div
        data-email-layout="bold"
        className={cn("w-full rounded-xl p-5 sm:rounded-2xl sm:p-6", animationClass)}
        style={{ backgroundColor: bold.fill, boxShadow: "0 1px 2px rgba(16,24,40,0.06), 0 8px 24px -12px rgba(16,24,40,0.25)" }}
      >
        {image ? <img src={image} alt={headline} className="mx-auto mb-3 h-14 w-14 rounded-full object-cover" /> : null}
        {title(bold.on, "center", "mb-1")}
        {words(bold.on, "center", "mb-4 opacity-80")}
        {renderForm({ stacked: true, inverted: { fill: bold.on, text: bold.fill } })}
        {thanks(bold.on, "center")}
      </div>
    )
  }

  if (layout === "minimal") {
    return (
      <div data-email-layout="minimal" className={cn("w-full px-1 py-2", animationClass)}>
        <div className="mb-3 flex items-center gap-3">
          {image ? <img src={image} alt={headline} className="h-11 w-11 shrink-0 rounded-lg object-cover" /> : null}
          <div className="min-w-0 flex-1">
            {title(ink, "left")}
            {words(soft, "left", "mt-0.5")}
          </div>
        </div>
        {renderForm({ stacked: stackedForm, inverted: null, outlined: true })}
        {thanks(ink, "left")}
      </div>
    )
  }

  /* Classic: as the block has always looked. */
  return (
    <div data-email-layout="default" className={cn("w-full rounded-xl p-5 sm:rounded-2xl sm:p-6", animationClass)} style={{ backgroundColor: tintOf(ink, 5) }}>
      {title(ink, "center", "mb-1")}
      {words(soft, "center", "mb-4")}
      {renderForm({ stacked: stackedForm, inverted: null })}
      {thanks(ink, "center")}
    </div>
  )
}

/**
 * A layout's small picture for the editor's Layout tab, drawn in the page's
 * own colours and with its image when it has one, so it looks like what
 * choosing it gives. 56px tall: three fit across a phone.
 */
export function EmailLayoutThumb({ layout, image, theme }: { layout: EmailSignupLayout; image: string | null; theme: SignupTheme & { background_color?: string } }) {
  const accent = theme.button_color || "#1a1a2e"
  const ink = theme.text_color || "#111113"
  const bold = boldColors(ink)
  const page = theme.background_color && /^#|^rgb|^hsl/.test(theme.background_color) ? theme.background_color : "#ffffff"
  const line = (w: string, strong = false, color = ink) => (
    <span className={cn("block h-1 rounded-full", w)} style={{ backgroundColor: color, opacity: strong ? 0.7 : 0.3 }} />
  )
  const row = (inverted = false, stacked = false) =>
    stacked ? (
      <span className="mt-1 flex flex-col gap-[3px]">
        <span className="block h-[9px] rounded-[2px] bg-white ring-1 ring-black/5" />
        <span className="block h-[9px] rounded-[2px] ring-1 ring-black/10" style={{ backgroundColor: inverted ? bold.on : accent }} />
      </span>
    ) : (
      <span className="mt-1 flex gap-[3px]">
        <span className="block h-[9px] flex-1 rounded-[2px] bg-white ring-1 ring-black/5" />
        <span className="block h-[9px] w-[30%] rounded-[2px] ring-1 ring-black/10" style={{ backgroundColor: accent }} />
      </span>
    )
  const mark = (cls: string) =>
    image ? (
      <img src={image} alt="" className={cn("shrink-0 object-cover", cls)} />
    ) : (
      <span className={cn("grid shrink-0 place-items-center", cls)} style={{ backgroundColor: tintOf(ink, 10), color: ink }}>
        <Mail className="h-2.5 w-2.5" strokeWidth={2} />
      </span>
    )

  let card: React.ReactNode
  if (layout === "pro") {
    card = (
      <span className="block w-full rounded-[5px] p-1.5" style={{ backgroundColor: tintOf(ink, 6) }}>
        <span className="flex items-center gap-1">
          {mark("h-4 w-4 rounded-[3px]")}
          <span className="flex flex-1 flex-col gap-[3px]">{line("w-4/5", true)}{line("w-1/2")}</span>
        </span>
        {row()}
      </span>
    )
  } else if (layout === "cover") {
    card = (
      <span className="block w-full overflow-hidden rounded-[5px]" style={{ backgroundColor: tintOf(ink, 6) }}>
        {image ? (
          <img src={image} alt="" className="block h-3.5 w-full object-cover" />
        ) : (
          <span className="grid h-3.5 place-items-center" style={{ backgroundColor: tintOf(ink, 9), color: ink }}>
            <Mail className="h-2 w-2" strokeWidth={2.2} />
          </span>
        )}
        <span className="flex flex-col items-center gap-[3px] px-1.5 pb-1.5 pt-1">
          {line("w-3/5", true)}
          <span className="w-full">{row(false, true)}</span>
        </span>
      </span>
    )
  } else if (layout === "bold") {
    card = (
      <span className="flex w-full flex-col items-center gap-[3px] rounded-[5px] p-1.5" style={{ backgroundColor: bold.fill }}>
        {image ? <img src={image} alt="" className="h-2.5 w-2.5 rounded-full object-cover" /> : null}
        {line("w-3/5", true, bold.on)}
        {line("w-2/5", false, bold.on)}
        <span className="w-full">{row(true, true)}</span>
      </span>
    )
  } else if (layout === "minimal") {
    card = (
      <span className="block w-full px-0.5">
        <span className="flex items-center gap-1">
          {image ? <img src={image} alt="" className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-cover" /> : null}
          <span className="flex flex-1 flex-col gap-[3px]">{line("w-3/5", true)}{line("w-2/5")}</span>
        </span>
        {row()}
      </span>
    )
  } else {
    card = (
      <span className="flex w-full flex-col items-center gap-[3px] rounded-[5px] p-1.5" style={{ backgroundColor: tintOf(ink, 6) }}>
        {line("w-3/5", true)}
        {line("w-2/5")}
        <span className="w-full">{row()}</span>
      </span>
    )
  }
  return (
    <span aria-hidden data-email-thumb={layout} className="flex h-[60px] w-full items-center overflow-hidden rounded-lg px-2.5" style={{ backgroundColor: page }}>
      {card}
    </span>
  )
}
