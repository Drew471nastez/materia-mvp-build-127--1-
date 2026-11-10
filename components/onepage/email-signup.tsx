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
  /**
   * Round 43. "pill": the box and the button in one rounded pill, the button grey with the creator's picture in it
   * (Connect). "line": the box drawn as a line in the text colour, the button as words with an arrow at its end
   * (Letter). Unset: the box and the button as before.
   */
  shape?: "pill" | "line"
  /** The creator's picture, for Connect's button. */
  avatar?: { src: string | null; name: string } | null
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

/** The creator's picture in a circle, or the first letter of their name on a soft disc. */
export function Face({ avatar, ink, size }: { avatar: { src: string | null; name: string } | null | undefined; ink: string; size: number }) {
  if (avatar?.src) {
    return <img src={avatar.src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} data-email-face="" />
  }
  const letter = (avatar?.name || "").trim().charAt(0).toUpperCase()
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full font-semibold" style={{ width: size, height: size, fontSize: Math.round(size * 0.42), backgroundColor: tintOf(ink, 12), color: ink }} data-email-face="">
      {letter || <Mail style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={1.8} />}
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
  avatar = null,
  buttonStyle,
  buttonPress,
  buttonText,
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
  /** Round 43: the creator's picture and name (Connect, Letter, Bar). */
  avatar?: { src: string | null; name: string } | null
  /** Round 43: the page's own button and its words, for Bar's button that opens the form. */
  buttonStyle?: React.CSSProperties
  /** Round AR: the page's hover for that button (lib/onepage/block-look pressableProps: its class and data attributes). */
  buttonPress?: { className: string; "data-hover": string; "data-shadow": string }
  buttonText?: string
}) {
  const [barOpen, setBarOpen] = React.useState(false)
  const barForm = React.useRef<HTMLDivElement>(null)
  const ink = theme.text_color || "#111113"
  /* Round AR: the card's tint, chosen with its words (lib/onepage/contrast signupCard); the words' own colour unless that leaves them unreadable. */
  const cardTint = (theme as { signup_tint?: string }).signup_tint || ink
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

  /* Round 43: Connect, one pill with the creator's picture in its button. */
  if (layout === "connect") {
    return (
      <div data-email-layout="connect" className={cn("w-full px-0.5 py-1", animationClass)}>
        {title(ink, "center", "mb-1")}
        {words(soft, "center", "mb-3")}
        {renderForm({ stacked: false, inverted: null, shape: "pill", avatar })}
        {thanks(ink, "center")}
      </div>
    )
  }

  /* Round 43: Letter, a note from the creator, signed with their picture and name. */
  if (layout === "letter") {
    return (
      <div data-email-layout="letter" className={cn("w-full rounded-xl p-5 sm:rounded-2xl sm:p-6", animationClass)} style={{ backgroundColor: tintOf(cardTint, 4), boxShadow: `inset 0 0 0 1px ${tintOf(ink, 8)}` }}>
        <div className="mb-3.5 flex items-center gap-2.5">
          <Face avatar={avatar} ink={ink} size={36} />
          {avatar?.name ? (
            <span className="min-w-0 truncate text-[13px] font-medium" style={{ color: soft }}>
              {avatar.name}
            </span>
          ) : null}
        </div>
        {headline ? (
          <h3 className="text-[19px] font-semibold leading-snug tracking-[-0.01em] sm:text-[21px]" style={{ color: ink }}>
            {headline}
          </h3>
        ) : null}
        {words(soft, "left", "mt-1.5")}
        <div className="mt-4">{renderForm({ stacked: false, inverted: null, shape: "line" })}</div>
        {thanks(ink, "left")}
      </div>
    )
  }

  /* Round 43: Bar, one slim row whose button slides the form open under it. */
  if (layout === "bar") {
    const open = barOpen || submitted
    return (
      <div data-email-layout="bar" data-open={open ? "" : undefined} className={cn("w-full rounded-xl px-3 py-3 sm:rounded-2xl sm:px-4", animationClass)} style={{ backgroundColor: tintOf(cardTint, 5) }}>
        <div className="flex items-center gap-3">
          {image ? <img src={image} alt={headline} className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <Face avatar={avatar} ink={ink} size={40} />}
          <div className="min-w-0 flex-1">
            {headline ? (
              <p className="truncate text-[15px] font-semibold leading-snug" style={{ color: ink }}>
                {headline}
              </p>
            ) : null}
            {description ? (
              <p className="truncate text-[13px] leading-snug" style={{ color: soft, opacity: 0.85 }}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-expanded={open}
            tabIndex={open ? -1 : undefined}
            onClick={() => {
              setBarOpen(true)
              /* Into the box once it is there: the keyboard comes up with the form. */
              window.setTimeout(() => barForm.current?.querySelector<HTMLInputElement>("input[type=email]")?.focus({ preventScroll: true }), 220)
            }}
            className={cn(buttonPress?.className, "h-9 shrink-0 px-4 text-[13.5px] font-medium transition-[opacity,scale] duration-200", open ? "pointer-events-none scale-95 opacity-0" : "opacity-100")}
            data-hover={buttonPress?.["data-hover"]}
            data-shadow={buttonPress?.["data-shadow"]}
            style={{ ...buttonStyle, borderRadius: buttonStyle?.borderRadius ?? 999 }}
            data-email-bar-open=""
          >
            {buttonText || "Subscribe"}
          </button>
        </div>
        <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!open || undefined} data-email-bar-form="">
          <div ref={barForm} className="min-h-0 overflow-hidden">
            <div className="pt-3">{renderForm({ stacked: stackedForm, inverted: null })}</div>
            {thanks(ink, "center")}
          </div>
        </div>
      </div>
    )
  }

  if (layout === "pro") {
    return (
      <div data-email-layout="pro" className={cn("w-full rounded-xl p-4 sm:rounded-2xl sm:p-5", animationClass)} style={{ backgroundColor: tintOf(cardTint, 5) }}>
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
      <div data-email-layout="cover" className={cn("w-full overflow-hidden rounded-xl sm:rounded-2xl", animationClass)} style={{ backgroundColor: tintOf(cardTint, 5) }}>
        {image ? (
          <img src={image} alt={headline} className="block aspect-[2/1] w-full object-cover" />
        ) : (
          <div aria-hidden data-email-band="" className="grid h-24 place-items-center" style={{ backgroundColor: tintOf(cardTint, 6) }}>
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
    <div data-email-layout="default" className={cn("w-full rounded-xl p-5 sm:rounded-2xl sm:p-6", animationClass)} style={{ backgroundColor: tintOf(cardTint, 5) }}>
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
export function EmailLayoutThumb({ layout, image, theme, avatar = null, headline = null }: { layout: EmailSignupLayout; image: string | null; theme: SignupTheme & { background_color?: string }; avatar?: string | null; headline?: string | null }) {
  const accent = theme.button_color || "#1a1a2e"
  const ink = theme.text_color || "#111113"
  const bold = boldColors(ink)
  const page = theme.background_color && /^#|^rgb|^hsl/.test(theme.background_color) ? theme.background_color : "#ffffff"
  const line = (w: string, strong = false, color = ink) => (
    <span className={cn("block h-1 rounded-full", w)} style={{ backgroundColor: color, opacity: strong ? 0.7 : 0.3 }} />
  )
  /* Round AQ: the block's own headline, small, where the strong line was; the line only while it has none. */
  const head = (w: string, color = ink) =>
    headline?.trim() ? (
      <span className={cn("block min-w-0 max-w-full truncate text-[7px] font-semibold leading-none", w === "w-1/2" || w === "w-3/5" ? "text-center" : "")} style={{ color }}>
        {headline.trim()}
      </span>
    ) : (
      line(w, true, color)
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

  const face = (cls: string) =>
    avatar ? <img src={avatar} alt="" className={cn("shrink-0 rounded-full object-cover", cls)} /> : <span className={cn("block shrink-0 rounded-full", cls)} style={{ backgroundColor: tintOf(ink, 22) }} />

  let card: React.ReactNode
  if (layout === "connect") {
    card = (
      <span className="flex w-full flex-col items-center gap-[4px]">
        {head("w-1/2")}
        <span className="flex h-[14px] w-full items-center rounded-full bg-white pl-1.5 pr-[2px] ring-1 ring-black/10">
          <span className="block h-[2px] w-1/3 rounded-full bg-black/20" />
          <span className="ml-auto flex h-[10px] items-center gap-[2px] rounded-full pl-1 pr-[1px]" style={{ backgroundColor: "#ececef" }}>
            <span className="block h-[2px] w-2.5 rounded-full bg-black/45" />
            {face("h-2 w-2")}
          </span>
        </span>
      </span>
    )
  } else if (layout === "letter") {
    card = (
      <span className="block w-full rounded-[5px] p-1.5" style={{ backgroundColor: tintOf(ink, 5) }}>
        <span className="flex items-center gap-1">
          {face("h-2.5 w-2.5")}
          {line("w-1/3")}
        </span>
        <span className="mt-[3px] flex flex-col gap-[3px]">{head("w-4/5")}</span>
        <span className="mt-[5px] flex items-end gap-1 border-b pb-[2px]" style={{ borderColor: tintOf(ink, 35) }}>
          <span className="block h-[2px] flex-1" />
          <span className="block h-[3px] w-3 rounded-full" style={{ backgroundColor: ink, opacity: 0.75 }} />
        </span>
      </span>
    )
  } else if (layout === "bar") {
    card = (
      <span className="flex w-full items-center gap-1 rounded-[5px] p-1.5" style={{ backgroundColor: tintOf(ink, 6) }}>
        {image ? <img src={image} alt="" className="h-3.5 w-3.5 shrink-0 rounded-full object-cover" /> : face("h-3.5 w-3.5")}
        <span className="flex flex-1 flex-col gap-[3px]">{head("w-4/5")}{line("w-1/2")}</span>
        <span className="block h-[9px] w-[26%] rounded-full ring-1 ring-black/10" style={{ backgroundColor: accent }} />
      </span>
    )
  } else if (layout === "pro") {
    card = (
      <span className="block w-full rounded-[5px] p-1.5" style={{ backgroundColor: tintOf(ink, 6) }}>
        <span className="flex items-center gap-1">
          {mark("h-4 w-4 rounded-[3px]")}
          <span className="flex flex-1 flex-col gap-[3px]">{head("w-4/5")}{line("w-1/2")}</span>
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
          {head("w-3/5")}
          <span className="w-full">{row(false, true)}</span>
        </span>
      </span>
    )
  } else if (layout === "bold") {
    card = (
      <span className="flex w-full flex-col items-center gap-[3px] rounded-[5px] p-1.5" style={{ backgroundColor: bold.fill }}>
        {image ? <img src={image} alt="" className="h-2.5 w-2.5 rounded-full object-cover" /> : null}
        {head("w-3/5", bold.on)}
        {line("w-2/5", false, bold.on)}
        <span className="w-full">{row(true, true)}</span>
      </span>
    )
  } else if (layout === "minimal") {
    card = (
      <span className="block w-full px-0.5">
        <span className="flex items-center gap-1">
          {image ? <img src={image} alt="" className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-cover" /> : null}
          <span className="flex flex-1 flex-col gap-[3px]">{head("w-3/5")}{line("w-2/5")}</span>
        </span>
        {row()}
      </span>
    )
  } else {
    card = (
      <span className="flex w-full flex-col items-center gap-[3px] rounded-[5px] p-1.5" style={{ backgroundColor: tintOf(ink, 6) }}>
        {head("w-3/5")}
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
