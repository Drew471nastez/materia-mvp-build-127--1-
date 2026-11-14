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
 * too, and the editor's Layout tab draws each, made small, with
 * EmailLayoutThumb below (wave 16: this very view, scaled down).
 *
 * Every layout looks finished without an image: where the picture goes, a
 * soft mail mark (Featured), a soft band (Cover), or nothing at all (Classic,
 * Bold, Simple). The soft fills are the page's text colour at a few percent,
 * not the button colour: on a page with white buttons that was white on
 * white, and the card and the band were not there.
 */

import * as React from "react"
import { ArrowRight, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { boldColors, emailSignupStacked, tintOf, type EmailSignupLayout } from "@/lib/onepage/email-signup"
import { readableInk, readableTheme, signupCard } from "@/lib/onepage/contrast"
import { buttonThemeOn } from "@/lib/onepage/button-style"
import { pressableProps, type PressableProps } from "@/lib/onepage/block-look"
import { fontStack } from "@/lib/onepage/fonts"
import { skinRootProps, skinVars } from "@/lib/onepage/theme-skin"
import { ThemeSkinScene } from "@/components/onepage/themes/theme-skin-scene"

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


/*
 * ===========================================================================
 *  WAVE 16: EACH LAYOUT'S PICTURE IS THE BLOCK ITSELF, MADE SMALL
 * ===========================================================================
 * The owner: "the layout thumbnail previews of the join-my-newsletter block
 * must be accurate, with no shifting layout or weirdness" (Featured and Bar
 * cut "Join my newsletter" off at the right). The pictures were drawn apart
 * from the block, in 7px words that reflowed with the card's width, so they
 * drifted from what each layout draws and ran out of room in narrow cards.
 *
 * Each picture is now EmailSignupView, the very drawing the live page makes,
 * laid out at a phone's real size (a 358px block, as on a 390px phone, with 12px of page round it: STAGE_W)
 * with the page's colours as the live page works them out (readableTheme,
 * signupCard, buttonThemeOn: public-onepage's email_capture), the page's
 * font, wallpaper and skin, the block's own headline, description, image,
 * button words and placeholder, and the creator's picture and name. Then it
 * is scaled down as one picture (a transform, so nothing reflows and every
 * word keeps its real proportions) to fit its frame: the frame's width, or
 * its height for a tall layout (Cover with a picture). The frame's size is
 * set by the picker alone, so a picture loading, a font arriving or the
 * theme changing only changes the scale, never the card.
 *
 * Nothing in it can be pressed or reached: it is inert and hidden from
 * assistive technology, its fields are read-only and its buttons dead.
 */
const STAGE_W = 382
const STAGE_PAD = 12
/* The live page's own defaults under a saved theme (public-onepage mergedTheme). */
const LIVE_DEFAULTS = {
  background_type: "solid",
  background_color: "#ffffff",
  text_color: "#000000",
  secondary_text_color: "#666666",
  button_color: "#000000",
  button_text_color: "#ffffff",
  button_style: "filled",
  button_border_radius: 8,
  button_border_width: 0,
  button_border_color: "#000000",
  font_family: "Inter",
}

type ThumbTheme = SignupTheme & { background_color?: string; background_type?: string; background_gradient?: string; background_image_url?: string; font_family?: string; [key: string]: unknown }

/** The form as the live page draws it for each shape (public-onepage renderEmailFields), with nothing that takes a press or a key. */
function StillForm({ options, theme, ink, placeholder, buttonText, press }: { options: EmailSignupFormOptions; theme: ThumbTheme; ink: string; placeholder: string | null; buttonText: string; press: PressableProps }) {
  const { stacked, inverted, outlined, shape, avatar } = options
  if (shape === "pill") {
    return (
      <div className="flex h-[52px] items-center gap-1.5 rounded-full bg-white py-1.5 pl-4 pr-1.5" style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 14%, transparent), 0 1px 2px rgba(16,24,40,0.05)` }} data-email-form="pill">
        <input type="email" readOnly tabIndex={-1} placeholder={placeholder ?? "Your email"} className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[#111113] outline-none placeholder:text-[#8b8f98] sm:text-[15px]" />
        <button type="submit" tabIndex={-1} className="inline-flex h-10 max-w-[58%] shrink-0 items-center gap-2 rounded-full bg-[#ececef] pl-4 pr-1 text-[14px] font-medium text-[#111113]" data-email-connect="">
          <span className="truncate">{buttonText}</span>
          {avatar?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar.src} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover shadow-[0_0_0_2px_#fff]" data-email-connect-face="" />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[13px] font-semibold text-[#111113]" data-email-connect-face="">
              {(avatar?.name || "").trim().charAt(0).toUpperCase() || "@"}
            </span>
          )}
        </button>
      </div>
    )
  }
  if (shape === "line") {
    return (
      <div className="flex items-center gap-3 border-b-[1.5px]" style={{ borderColor: `color-mix(in srgb, ${ink} 28%, transparent)`, color: ink }} data-email-form="line">
        <input type="email" readOnly tabIndex={-1} placeholder={placeholder ?? "Your email"} className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:opacity-55 sm:text-[15px]" style={{ color: ink }} />
        <button type="submit" tabIndex={-1} className="inline-flex h-12 shrink-0 items-center gap-1.5 text-[14.5px] font-semibold" style={{ color: ink }} data-email-send="">
          {buttonText}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
    )
  }
  const submit = inverted
    ? pressableProps({ ...theme, button_style: "filled", button_color: inverted.fill, button_text_color: inverted.text, button_border_color: inverted.fill, button_border_width: 0, button_shadow: "none" } as never, true)
    : press
  return (
    <div className={stacked ? "flex flex-col gap-2" : "flex flex-row items-stretch gap-2"} data-email-form={stacked ? "stacked" : "row"}>
      <input
        type="email"
        readOnly
        tabIndex={-1}
        placeholder={placeholder ?? "Enter your email"}
        className={cn("min-h-[46px] border-0 bg-white/90 px-3 py-3 text-[16px] outline-none sm:px-4 sm:text-sm", stacked ? "w-full" : "min-w-0 flex-1", inverted && "ring-1 ring-black/10")}
        style={{ color: "#000", borderRadius: press.style.borderRadius, backgroundColor: inverted ? "#fff" : undefined, boxShadow: outlined ? `inset 0 0 0 1px color-mix(in srgb, ${theme.text_color || "#111113"} 18%, transparent)` : undefined }}
      />
      <button type="submit" tabIndex={-1} className={cn(submit.className, "whitespace-nowrap px-4 py-3 text-sm font-medium sm:px-5", stacked ? "w-full" : "shrink-0")} style={submit.style} data-hover="none" data-shadow={submit["data-shadow"]} data-email-submit="">
        {buttonText}
      </button>
    </div>
  )
}

export function EmailLayoutThumb({
  layout,
  image,
  theme,
  avatar = null,
  name = null,
  headline = null,
  description = null,
  buttonText = "Subscribe",
  placeholder = null,
}: {
  layout: EmailSignupLayout
  image: string | null
  theme: ThumbTheme
  /** The creator's picture (Connect, Letter and Bar draw it). */
  avatar?: string | null
  /** The page's name, which Letter signs with. */
  name?: string | null
  headline?: string | null
  description?: string | null
  buttonText?: string
  placeholder?: string | null
}) {
  const frame = React.useRef<HTMLSpanElement>(null)
  const stage = React.useRef<HTMLDivElement>(null)

  /* The live page's colours for the block (public-onepage, case "email_capture"). */
  const safe = readableTheme({ ...LIVE_DEFAULTS, ...theme } as ThumbTheme & typeof LIVE_DEFAULTS)
  const { tint, ink, grounds } = signupCard(safe as never)
  const signupTheme = { ...safe, text_color: ink, signup_tint: tint, secondary_text_color: safe.secondary_text_color ? readableInk(safe.secondary_text_color, grounds) : safe.secondary_text_color }
  const press = pressableProps(buttonThemeOn(safe as never, grounds), true)
  const words = buttonText || "Subscribe"
  const face = { src: avatar || null, name: (name || "").trim() }

  /* The page behind the block: its colour, gradient or photo, and a skin's scene and look. */
  const ground = safe.background_color || "#ffffff"
  const paint =
    safe.background_type === "gradient" && safe.background_gradient
      ? safe.background_gradient
      : safe.background_type === "image" && safe.background_image_url
        ? `center / cover no-repeat url("${String(safe.background_image_url).replace(/"/g, "%22")}") ${ground}`
        : ground

  /* One scale, the largest that shows the whole block: set straight on the frame, so no render follows a measure. */
  React.useLayoutEffect(() => {
    const f = frame.current
    const s = stage.current
    if (!f || !s) return
    let last = ""
    const fit = () => {
      const w = f.clientWidth
      const h = f.clientHeight
      const sh = s.offsetHeight
      if (!w || !h || !sh) return
      const next = String(Math.min(w / STAGE_W, h / sh))
      if (next !== last) {
        last = next
        f.style.setProperty("--email-thumb-scale", next)
      }
    }
    fit()
    if (typeof ResizeObserver !== "function") return
    const ro = new ResizeObserver(fit)
    ro.observe(f)
    ro.observe(s)
    return () => ro.disconnect()
  }, [])

  return (
    <span
      ref={frame}
      aria-hidden
      inert
      data-email-thumb={layout}
      data-tp-page=""
      {...skinRootProps(safe as never)}
      className="pointer-events-none relative block h-full w-full select-none overflow-hidden"
      style={{ ...skinVars(safe as never), background: ground }}
    >
      {/* The wallpaper and a skin's scene at the block's own scale, so a cloud or a bubble is as big beside it as on the page, and a gradient spread over a phone's screen as the page spreads it (the picture shows its top). */}
      <span
        className="absolute left-0 top-0 block origin-top-left"
        style={{ width: "calc(100% / var(--email-thumb-scale, 0.36))", height: "max(calc(100% / var(--email-thumb-scale, 0.36)), 844px)", transform: "scale(var(--email-thumb-scale, 0.36))", background: paint }}
      >
        <ThemeSkinScene theme={safe as never} />
      </span>
      <div
        ref={stage}
        className="absolute left-1/2 top-1/2 origin-center text-left"
        style={{
          width: STAGE_W,
          padding: STAGE_PAD,
          transform: "translate(-50%, -50%) scale(var(--email-thumb-scale, 0.36))",
          fontFamily: fontStack(safe.font_family),
          color: ink,
          lineHeight: 1.5,
        }}
      >
        <EmailSignupView
          layout={layout}
          headline={headline?.trim() || ""}
          description={description}
          image={image}
          theme={signupTheme}
          stackedForm={emailSignupStacked(layout, words)}
          renderForm={(options) => <StillForm options={options} theme={safe} ink={ink} placeholder={placeholder} buttonText={words} press={press} />}
          submitted={false}
          successMessage=""
          afterSignup={null}
          avatar={face}
          buttonStyle={press.style}
          buttonPress={{ className: press.className, "data-hover": "none", "data-shadow": press["data-shadow"] }}
          buttonText={words}
        />
      </div>
    </span>
  )
}
