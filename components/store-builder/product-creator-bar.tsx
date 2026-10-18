"use client"

import { useSitePaint } from "@/lib/appearance/site-paint-context"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { AvatarMark } from "@/components/app/app-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useTap } from "@/lib/gestures/use-tap"
import { creatorPageHref, fallbackHref, isPlainClick, planBack } from "@/lib/navigation/back-plan"
import { goBackOr, readBackEvidence } from "@/lib/navigation/go-back"
import { Mail, ArrowLeft, Check, Flag, MoreHorizontal, Share2 } from "lucide-react"
import { getProductShareUrl } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { isNativeApp } from "@/lib/platform-utils"
import { SmartLink } from "@/components/smart-link"
import { hapticTap } from "@/lib/native-bridge"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { setProductTopBarRendered } from "@/lib/store-builder/product-top-bar"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"

// Button style presets (same as subscribe bar)
export const creatorBarButtonPresets: Record<string, { default: string; subscribed: string }> = {
  style1: { default: "Subscribe", subscribed: "Subscribed" },
  style2: { default: "Join Now", subscribed: "Joined" },
  style3: { default: "Get It", subscribed: "🔥" },
  style4: { default: "Follow", subscribed: "Followed" },
}

export interface ProductCreatorBarSettings {
  visible: boolean
  /**
   * Whether the follow form is on the bar. Absent means yes: every stored
   * config predates the switch, and the bar has had one for as long as it
   * has existed.
   */
  showSubscribe?: boolean
  backgroundColor: string
  textColor: string
  buttonColor: string
  buttonTextColor: string
  buttonStyle: "style1" | "style2" | "style3" | "style4"
  buttonBorderRadius?: number
}

interface ProductCreatorBarProps {
  settings: ProductCreatorBarSettings
  creatorName: string
  creatorId?: string
  creatorUsername?: string
  avatarUrl?: string
  isEditorPreview?: boolean
  isMobile?: boolean
  isSelected?: boolean
  onSelect?: () => void
  /** The creator's own line about themselves, cut to six words on a phone. */
}

/** Desktop max width for editor preview */
const EDITOR_DESKTOP_MAX_W = "max-w-[1150px]"
/** Desktop max width for live pages (30px less than before) */
const LIVE_DESKTOP_MAX_W = "max-w-[1170px]"

/** persistence (60+ days) */
const PERSIST_DAYS = 60
const PERSIST_MS = PERSIST_DAYS * 24 * 60 * 60 * 1000

function makePersistKey(prefix: string, creatorId?: string, creatorName?: string) {
  const id = (creatorId || creatorName || "unknown").toString().trim()
  return `productCreatorBar:${id}:${prefix}`
}

function setWithExpiry(key: string, value: unknown, ttlMs: number) {
  try {
    const payload = { value, exp: Date.now() + ttlMs }
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {}
}

function getWithExpiry<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.exp !== "number") return null
    if (Date.now() > parsed.exp) {
      localStorage.removeItem(key)
      return null
    }
    return (parsed.value as T) ?? null
  } catch {
    return null
  }
}

function normalizeEmail(v: string) {
  return (v || "").trim().toLowerCase()
}

function isDarkHex(bg?: string): boolean {
  if (!bg) return false
  const hex = bg.trim()
  if (!hex.startsWith("#")) return false

  const clean = hex.replace("#", "")
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.length === 6
        ? clean
        : null

  if (!full) return false

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)

  if ([r, g, b].some((n) => Number.isNaN(n))) return false

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance < 150
}

/**
 * Get adaptive input styling based on background color
 * - Dark backgrounds: white/light borders and text
 * - Vibrant/powerful colors (purple, blue, orange, etc.): light white/gray borders
 * - Light/white backgrounds: gray borders
 */
function isVibrantColor(hex?: string): boolean {
  if (!hex) return false
  const clean = hex.replace("#", "")
  if (clean.length !== 6 && clean.length !== 3) return false

  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)

  if ([r, g, b].some((n) => Number.isNaN(n))) return false

  // Calculate saturation - vibrant colors have high saturation
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2 / 255

  // Saturation calculation
  const delta = max - min
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)) / 255

  // Vibrant = saturated and not too dark/light
  return saturation > 0.4 && lightness > 0.2 && lightness < 0.8
}

function getAdaptiveInputClass(isDarkBackground: boolean, backgroundColor?: string) {
  const isVibrant = isVibrantColor(backgroundColor)

  return cn(
    "w-full rounded-md border outline-none transition-colors bg-transparent px-3",
    isDarkBackground || isVibrant
      ? "text-white placeholder:text-white/80 focus:placeholder:text-white/50 border-white/40 focus:border-white/70"
      : "text-gray-900 placeholder:text-gray-500 focus:placeholder:text-gray-400 border-gray-300 focus:border-gray-400",
  )
}

function getButtonText(buttonStyle: string, isSubscribed: boolean): string {
  const preset = creatorBarButtonPresets[buttonStyle] || creatorBarButtonPresets.style4
  return isSubscribed ? preset.subscribed : preset.default
}

/**
 * THE FOLLOW BUTTON IS THE CREATOR'S COLOUR, FULL STRENGTH.
 *
 * It used to sit at 70% until an address had been typed, and drift between
 * 95% and 100% after. The creator page's own bar has never done this: it
 * paints the button and leaves it alone. So the same shop showed a solid
 * button on one page and a washed-out one on the next, and the washed-out
 * one is the first thing a visitor meets on a product page.
 *
 * A faded control reads as disabled, and this one is not: pressing it with
 * an empty field runs the form's own `required` check, which focuses the
 * input and says what is missing. That is a better answer than a button
 * that looks broken until you guess what it wants.
 *
 * `subscribed` is the one state that still steps back, because it is done
 * rather than waiting: the label says Followed and nothing is being asked.
 */
function getButtonOpacityClass(opts: { isSubscribed: boolean; hasEmail: boolean; isFocused: boolean }) {
  return opts.isSubscribed ? "opacity-70" : "opacity-100"
}

function getInputOpacityClass(isSubscribed: boolean, isFocused: boolean) {
  if (isFocused) return "opacity-100"
  return isSubscribed ? "opacity-[0.85]" : "opacity-[0.95]"
}

/**
 * The creator's page, `/<handle>` on the main domain: the page this bar is
 * about, not the website a creator builds on their subdomain. Relative, so it
 * works on a subdomain, on a custom domain and in the app without three
 * branches. Only the username is used: a UUID or a sanitised display name
 * makes an address that 404s or belongs to somebody else. The rule lives in
 * lib/navigation/back-plan, where the product page's server code reads it too.
 */
function getCreatorHref(creatorUsername?: string, _creatorId?: string, _creatorName?: string) {
  return creatorPageHref(creatorUsername)
}

/**
 * ProductCreatorBar - Used in store builder editor preview
 * isMobile prop determines if we're in the 375px mobile preview canvas (on desktop)
 * 
 * When isMobile=true (mobile preview toggle on desktop): show ORIGINAL mobile layout with normal sizes
 * When on actual small viewport (real phone): use CSS to show COMPACT layout to prevent overflow
 */
export function ProductCreatorBar({
  settings,
  creatorName,
  creatorId,
  creatorUsername,
  avatarUrl,
  isEditorPreview,
  isMobile,
  isSelected,
  onSelect,
}: ProductCreatorBarProps) {
  // IMPORTANT: All hooks must be called BEFORE any early returns to avoid React error #310
  const [subscribed, setSubscribed] = useState(false)
  const [subscribedEmail, setSubscribedEmail] = useState<string>("")
  const [email, setEmail] = useState("")
  const [inputFocus, setInputFocus] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [loading, setLoading] = useState(false)

  const isDarkBackground = useMemo(() => isDarkHex(settings.backgroundColor), [settings.backgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, settings.backgroundColor), [isDarkBackground, settings.backgroundColor])
  /*
    ═══════════════════════════════════════════════════════════════════════
     WHITE LETTERS ON A NEAR WHITE DISC
    ═══════════════════════════════════════════════════════════════════════
    Avatar's shared ground is `bg-muted`, light on purpose so a circle is
    never a hole on a white page. This bar is the creator's own colour and
    usually near-black, and the text in it is white, which it inherits: the
    initials were white on a 242,242,242 disc, 1.12:1, which is to say not
    there at all. The phone bar had been fixed for exactly this and the
    other two circles in this file had not.

    A tenth of the bar's own ink, derived from the colour being painted, so
    it is a quiet disc on a dark bar and a quiet disc on a light one.
  */
  const avatarGround = isDarkBackground ? "bg-white/10" : "bg-black/[0.06]"

  const creatorHref = useMemo(
    () => getCreatorHref(creatorUsername, creatorId, creatorName),
    [creatorUsername, creatorId, creatorName],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const emailKey = makePersistKey("email", creatorId, creatorName)
    const subEmailKey = makePersistKey("subscribedEmail", creatorId, creatorName)

    const savedEmail = getWithExpiry<string>(emailKey)
    const savedSubEmail = getWithExpiry<string>(subEmailKey)

    if (savedEmail) setEmail(savedEmail)
    if (savedSubEmail) {
      setSubscribedEmail(savedSubEmail)
      setSubscribed(normalizeEmail(savedEmail || "") === savedSubEmail)
    }
  }, [creatorId, creatorName])

  useEffect(() => {
    if (typeof window === "undefined") return
    const emailKey = makePersistKey("email", creatorId, creatorName)
    if (email) setWithExpiry(emailKey, email, PERSIST_MS)
  }, [email, creatorId, creatorName])

  useEffect(() => {
    if (!subscribedEmail) return
    const norm = normalizeEmail(email)
    if (norm !== subscribedEmail) {
      setSubscribed(false)
    } else if (norm === subscribedEmail) {
      setSubscribed(true)
    }
  }, [email, subscribedEmail])

  // Early return AFTER all hooks
  if (!settings.visible) return null


  const isCurrentEmailSubscribed = subscribed && normalizeEmail(email) === subscribedEmail
  const buttonText = getButtonText(settings.buttonStyle, isCurrentEmailSubscribed)

  const buttonOpacityClass = getButtonOpacityClass({
    isSubscribed: isCurrentEmailSubscribed,
    hasEmail: !!email,
    isFocused: inputFocus,
  })

  const inputOpacityClass = getInputOpacityClass(isCurrentEmailSubscribed, inputFocus)

  const triggerAnim = () => {
    setPulse(true)
    window.setTimeout(() => setPulse(false), 520)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const norm = normalizeEmail(email)
    if (!norm || loading) return
    if (isCurrentEmailSubscribed) return

    setLoading(true)
    try {
      if (creatorId) {
        await fetch("/api/subscribers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: norm, creatorId, origin: pageOrigin() }),
        })
      }
      setSubscribedEmail(norm)
      setSubscribed(true)

      const subEmailKey = makePersistKey("subscribedEmail", creatorId, creatorName)
      setWithExpiry(subEmailKey, norm, PERSIST_MS)

      triggerAnim()
    } catch (error) {
      console.error("Subscribe error:", error)
    } finally {
      setLoading(false)
    }
  }

  const wrapperClass = cn(
    "w-full transition-all relative",
    // Use clip-path instead of overflow-hidden to prevent avatar clipping during scroll
    // while still containing the selection ring
    isSelected && "ring-2 ring-sky-500 ring-inset",
  )

  const handleWrapperClick = () => {
    if (isEditorPreview && onSelect) {
      onSelect()
    }
  }

  /*
    ELEMENTS, NOT COMPONENTS — see the same note in subscribe-bar.tsx.

    Declared as arrow components in a render body, each of these was a new
    component type on every render, so React remounted the whole layout —
    and the creator avatar's <img> with it — every time anything in the
    builder re-rendered. As values, React updates them in place.
  */
  // Mobile layout for store builder preview (375px canvas on desktop)
  // Fits within 375px without overflow
  /*
    WHAT THE VISITOR ACTUALLY SEES ON A PHONE.

    This was two layouts, one for the 375px preview on a desktop and one for
    a real phone editing the page, and both of them were an avatar next to an
    address field. The live bar no longer carries that field at this width,
    so both were showing the creator a bar that does not exist. One row now,
    the same one LiveProductCreatorBar renders: the way back, who is selling,
    and six words about them.
  */
  const phonePreviewRow = (
    <div className="w-full px-4 py-2">
      <div className="flex items-center gap-2.5 w-full">
        <span
          aria-hidden="true"
          className="-ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <a
          href={creatorHref}
          className="flex min-w-0 flex-1 items-center gap-2.5"
          aria-label={`Go to ${creatorName}'s shop`}
          onClick={(e) => {
            if (isEditorPreview) {
              e.preventDefault()
            }
          }}
        >
          {/* Explicit box around the avatar: it clipped during scroll without one. */}
          <div className="relative h-9 w-9 shrink-0">
            <Avatar className={cn("h-9 w-9 shrink-0 absolute inset-0", avatarGround)}>
              {avatarUrl ? <AvatarImage src={optimizedImageUrl(avatarUrl, 48)} alt={creatorName} className="object-cover" /> : null}
              <AvatarFallback delayMs={avatarUrl ? undefined : 0} className={cn("text-[11px]", avatarGround)}><AvatarMark name={(creatorName || "").trim()} size={36} /></AvatarFallback>
            </Avatar>
          </div>
          <span className="truncate text-sm font-semibold leading-tight">{creatorName}</span>
        </a>
      </div>
    </div>
  )

  // Desktop layout for store builder preview
  const desktopLayout = (
    <div className={cn("py-[calc(0.625rem+5px)] px-4 sm:px-5")}>
      <div className={cn("mx-auto w-full", EDITOR_DESKTOP_MAX_W)}>
        <div className="w-full flex items-center justify-between gap-4">
          <a
            href={creatorHref}
            className="flex items-center gap-2 shrink-0 group"
            aria-label={`Go to ${creatorName}'s shop`}
            onClick={(e) => {
              if (isEditorPreview) {
                e.preventDefault()
              }
            }}
          >
            <Avatar className={cn("h-8 w-8 shrink-0 cursor-pointer", avatarGround)}>
              {avatarUrl ? <AvatarImage src={optimizedImageUrl(avatarUrl, 48)} alt={creatorName} /> : null}
              <AvatarFallback delayMs={avatarUrl ? undefined : 0} className={cn("text-xs", avatarGround)}><AvatarMark name={(creatorName || "").trim()} size={32} /></AvatarFallback>
            </Avatar>
            <p className="text-sm md:text-[calc(0.875rem+3px)] font-medium cursor-pointer group-hover:opacity-90">
              {creatorName}
            </p>
          </a>

          <form onSubmit={handleSubmit} className="flex gap-2 items-center shrink-0">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setInputFocus(true)}
              onBlur={() => setInputFocus(false)}
              required
              disabled={loading}
              className={cn(adaptiveInputClass, "h-9 w-48 text-sm", inputOpacityClass)}
            />
            <Button
              size="sm"
              type="submit"
              disabled={loading || isCurrentEmailSubscribed}
              className={cn(
                "shrink-0 h-9 px-4 text-sm md:text-[calc(0.875rem+2px)] flex items-center gap-2 relative overflow-hidden",
                buttonOpacityClass,
                pulse && "animate-[btnPop_520ms_ease-out]",
              )}
              style={{
                backgroundColor: settings.buttonColor || "#4b5563",
                color: settings.buttonTextColor || "#ffffff",
                borderRadius: `${settings.buttonBorderRadius ?? 8}px`,
              }}
            >
              {buttonText === "🔥" ? null : isCurrentEmailSubscribed ? (
                <Check size={16} className="text-current relative z-10" />
              ) : (
                <Mail size={16} className="text-current relative z-10" />
              )}
              <span className="relative z-10">{loading ? "..." : buttonText}</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  )

  return (
    <div
      onClick={handleWrapperClick}
      className={wrapperClass}
      style={{
        backgroundColor: settings.backgroundColor || "#1a1a1a",
        color: settings.textColor || "#ffffff",
        borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
      }}
    >
      {/*
        The mobile preview toggle and a real phone used to get two different
        layouts here; they get the same row now, so the toggle shows what a
        phone shows. `isMobile` is the toggle on a desktop, and the
        breakpoint underneath covers a creator editing on a phone.
      */}
      {isMobile ? (
        phonePreviewRow
      ) : (
        <>
          <div className="block sm:hidden">{phonePreviewRow}</div>
          <div className="hidden sm:block">{desktopLayout}</div>
        </>
      )}

      <style jsx>{`
        @keyframes btnPop {
          0% { transform: scale(1); }
          35% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

/**
 * THE WAY BACK.
 *
 * `router.back()` alone is a trap on a product page: most visits arrive from
 * a link somebody was sent, so there is nothing behind them and the control
 * does nothing at all — which reads as broken rather than as empty.
 *
 * So it asks where the visit came from. A referrer on this site means there
 * IS somewhere of ours to return to, and history is used. Anything else — a
 * search result, a message, a fresh tab — goes to the creator's page, which
 * is the page this product belongs to and the one somebody was on their way
 * to anyway.
 */
/**
 * ===========================================================================
 *  A PRESS YOU CAN SEE, ON A DEVICE WITH NO HOVER
 * ===========================================================================
 * `active:` alone is not enough, and the reason is timing rather than
 * styling. A quick tap holds `:active` for well under a tenth of a second —
 * often a single frame — so the state is technically correct and nobody ever
 * sees it. What is left is a control that goes somewhere without ever
 * appearing to have been touched, which is what "it feels cheap" is.
 *
 * So the press is held. `pressed` goes true on pointerdown and stays for
 * PRESS_HOLD_MS whatever the finger does, which means every tap — however
 * fast — produces the same visible press. Three things move together: the
 * button sinks, a filled disc comes up under it, and the phone answers.
 *
 * `pointerdown`, not `click`: the acknowledgement belongs at the moment of
 * contact. Waiting for the click puts it after the decision, which is the
 * same lateness in a different place.
 */
const PRESS_HOLD_MS = 190

function usePressFeedback(): [boolean, { onPointerDown: () => void }] {
  const [pressed, setPressed] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const onPointerDown = useCallback(() => {
    hapticTap("light")
    setPressed(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPressed(false), PRESS_HOLD_MS)
  }, [])
  return [pressed, { onPointerDown }]
}

/**
 * ===========================================================================
 *  AND THEN IT SAYS IT IS GOING
 * ===========================================================================
 * The press was acknowledged — the disc, the sink, the haptic — and then
 * nothing happened until the next page arrived. On a product page that is a
 * navigation with a server round trip in it, so the gap is real, and a
 * control that answers a touch and then goes quiet reads as a control that
 * did not work. That is what makes going back feel jumpy: nothing, nothing,
 * a new page.
 *
 * So the arrow turns into a spinner while the page is on its way.
 *
 * NOT IMMEDIATELY, and that is the whole craft of it. Most backs are a
 * client-side transition and land in well under a tenth of a second; a
 * spinner shown at once would be a flash of something a person cannot read,
 * which is worse than no spinner at all. It waits SPINNER_DELAY_MS, which is
 * long enough that a fast transition never shows one and short enough that a
 * slow one is covered.
 *
 * The two swap by crossfade, both absolutely placed on the same centre, so
 * the icon does not move, resize or shift the bar. The press disc underneath
 * is untouched: acknowledgement belongs at the moment of contact, and this is
 * about the wait afterwards.
 */
/*
  300, NOT 110. Going back through history lands in 78ms on production, but a
  slower phone can take longer than 110, and then the arrow cross-fades into a
  spinner for the last few frames before the page leaves — a twitch in the
  header on the way out, on the one navigation that needs no explaining. The
  spinner is for the cold path, a push that measures around two seconds, and
  300ms still puts it up well inside that.
*/
const SPINNER_DELAY_MS = 300
/** How long a back is given before the arrow comes back. */
const BACK_GIVE_UP_MS = 4000
/**
 * How long a push to the creator's page may stay pending before the page is
 * loaded as a document instead. Measured cold pushes take two to three and a
 * half seconds; this is well past that, and well short of "for ever".
 */
const PUSH_GIVE_UP_MS = 8000

/**
 * A REAL LINK TO THE CREATOR'S PAGE, taken over by script. Without script,
 * or opened in a new tab, it goes to the creator's page, which is where the
 * product belongs. A plain press or tap goes back instead when there is a
 * page of ours to go back to (lib/navigation/back-plan decides), and to the
 * same creator's page when there is not.
 */
function BackControl({ onBack, href, label, pending }: { onBack: () => void; href: string; label: string; pending: boolean }) {
  const [pressed, press] = usePressFeedback()
  /**
   * THE TAP IS READ FROM THE POINTER, NOT FROM THE CLICK. Measured against
   * production: after scrolling down and back up so the bar returns, the
   * arrow gets a pointerdown and a pointerup and NO click, because the touch
   * that lands while the page is still flinging is spent stopping it. The
   * page did not move and the arrow had to be pressed again. See
   * lib/gestures/use-tap.
   */
  const tap = useTap(onBack)
  /** Pending for long enough to be worth showing, rather than merely pending. */
  const [showSpinner, setShowSpinner] = useState(false)
  useEffect(() => {
    if (!pending) {
      setShowSpinner(false)
      return
    }
    const id = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [pending])

  return (
    <a
      href={href}
      {...tap}
      /* Both want pointerdown: the disc and the haptic answer the contact,
         the tap hook starts watching the gesture. A press with a modifier
         held is a new tab or a new window, and belongs to the browser. */
      onPointerDown={(e) => {
        if (!isPlainClick(e)) return
        press.onPointerDown()
        tap.onPointerDown(e)
      }}
      /* The link's own navigation never runs on a plain press: the tap hook
         has answered the pointer already, or answers the keyboard's click
         here. Anything else (a middle click, cmd or ctrl) opens the href. */
      onClick={(e) => {
        if (!isPlainClick(e)) return
        e.preventDefault()
        tap.onClick(e)
      }}
      draggable={false}
      aria-label={label}
      title={label}
      aria-busy={showSpinner || undefined}
      /*
        ═══════════════════════════════════════════════════════════════════
         THE TARGET IS BIGGER THAN THE DISC, AND THAT IS THE FIX FOR
         "I PRESS BACK AND NOTHING HAPPENS"
        ═══════════════════════════════════════════════════════════════════
        The button used to BE the 36px disc. That is under the 44pt Apple
        minimum, and the tap hook only accepts a release within 10px of the
        element's box, so a thumb that landed a little wide, or drifted a
        little while pressing, was a press that did nothing.

        So the button is now a 56 x 52 box and the disc is a child centred in
        it. The disc still looks and moves exactly as before; what changed is
        how much of the bar around it counts as it. The negative margins hand
        the extra size back to the row so nothing else moves, and the left one
        runs the target to the edge of the screen, which is where a thumb
        reaching for "back" actually lands.
      */
      className="group/back relative -my-2 -ml-4 -mr-2 inline-flex h-[52px] w-[56px] shrink-0 items-center justify-center select-none outline-none"
      style={{ color: "inherit", WebkitTapHighlightColor: "transparent", WebkitTouchCallout: "none" }}
      data-back-control=""
    >
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full" data-back-disc-host="">
        {/*
          A BACK DOES NOT BUMP (round 11: "no bump on press, iOS native feel").
          The bar's other controls sink to 0.95 and their disc swells in from
          the centre with an overshoot (bar-control-pressed, the
          bar-control-press keyframe); on the way back that read as a little
          jump. Here the disc is simply there, full size, on the frame the
          finger lands, at the same 16% of the bar's own colour, and fades
          out over 200ms on the lift. Nothing changes size.
        */}
        <span
          aria-hidden
          data-back-disc=""
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full bg-current transition-opacity ease-out",
            pressed
              ? "opacity-[0.16] duration-0"
              : "opacity-0 duration-200 [@media(hover:hover)_and_(pointer:fine)]:group-hover/back:opacity-[0.08]",
          )}
        />
        {/*
          One box, two icons on the same centre. Laying them out in flow would
          move the arrow by a pixel as the spinner mounted, which is exactly the
          twitch this is supposed to remove.
        */}
        <span className="relative block h-[19px] w-[19px]">
          <ArrowLeft
            className={cn(
              "absolute inset-0 h-[19px] w-[19px] transition-opacity duration-200 ease-sheet",
              showSpinner ? "opacity-0" : "opacity-100",
            )}
            strokeWidth={2}
          />
          <span
            aria-hidden
            className={cn(
              "bar-control-spinner absolute inset-0 transition-opacity duration-200 ease-sheet",
              showSpinner ? "opacity-100" : "opacity-0",
            )}
          />
        </span>
      </span>
    </a>
  )
}

/**
 * ===========================================================================
 *  THE THREE DOTS: SHARE, AND REPORT
 * ===========================================================================
 * AN INLINE MENU, THE SAME ON BOTH SURFACES. It was a dropdown on a desktop
 * and a bottom sheet on a phone, which is the right default for a row of
 * actions somebody is choosing between — and wrong for two. A sheet sliding
 * up over the page to offer Share and Report is a lot of movement for a
 * decision that takes no thought, and it puts the answer at the opposite end
 * of the screen from the finger that asked the question.
 *
 * It opens where it was pressed instead, anchored under the dots, at the
 * size of what is in it, on a phone and on a desktop alike.
 *
 * SHARE uses the phone's own share sheet where there is one, because that is
 * where every app somebody wants to send this to already lives. Where there
 * is not, it copies the address.
 *
 * REPORT opens a mail to support with the address in it. There is no reports
 * table behind this yet, so a form saying "we'll look into it" would be a lie
 * about what happens next.
 */
function ProductBarMenu({ title, slug, handle }: { title: string; slug: string; handle?: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  /* The same reason the arrow reads the pointer: a click after a fling is a
     click the browser withholds. The outside-press handler below ignores
     anything inside the trigger, so opening on pointerup is not undone by
     the pointerdown that preceded it. */
  const tap = useTap(() => setOpen((v) => !v))
  const [pressed, press] = usePressFeedback()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; right: number } | null>(null)

  /**
   * =========================================================================
   *  THE MENU IS PORTALLED, AND THAT IS NOT A DETAIL
   * =========================================================================
   * It was `position: absolute` inside the bar, and the bar's root carries
   * `overflow-hidden`. The menu hangs BELOW the bar, so every pixel of it was
   * clipped away: it opened, it was in the DOM, it had a width and a height
   * and a position, and there was nothing on the screen. "The three dots do
   * not work" was the menu working perfectly inside a box that hid it.
   *
   * Worth saying plainly because the probe for this measured the menu's
   * rectangle and passed — a clipped element still has one. Geometry is not
   * visibility, and the check below now asks the browser what is actually at
   * that point on the screen.
   *
   * In the body it cannot be clipped by anything the bar does, now or later.
   * `position: fixed` from the trigger's own rectangle is what keeps it under
   * the dots once it is out there.
   */
  const place = useCallback(() => {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    setAt({ top: Math.round(r.bottom + 6), right: Math.round(window.innerWidth - r.right) })
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    const onDown = (e: Event) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    /* Closed on scroll rather than followed. The bar is sticky and the page
       under it moves; a menu that chases its trigger down a scrolling page is
       a menu nobody asked to keep open. */
    const onScroll = () => setOpen(false)
    document.addEventListener("pointerdown", onDown, true)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", place)
    return () => {
      document.removeEventListener("pointerdown", onDown, true)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", place)
    }
  }, [open, place])

  /* What gets pasted into a message. The apex address with the handle in it,
     not `/p/<slug>` (which redirects) and not this window's origin (which on
     a subdomain or a custom domain is a page that does not exist there). */
  const url = slug
    ? getProductShareUrl(handle || "", slug)
    : typeof window === "undefined"
      ? ""
      : window.location.href

  const share = async () => {
    setOpen(false)
    const nav = typeof navigator !== "undefined" ? navigator : undefined
    if (nav?.share) {
      try {
        await nav.share({ title: title || document.title, url })
      } catch {
        /* Dismissing the system sheet rejects. Not a failure, and it must not
           fall through to copying something nobody asked for. */
      }
      return
    }
    try {
      await nav?.clipboard?.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* A clipboard that refuses leaves the address in the address bar. */
    }
  }

  const report = () => {
    setOpen(false)
    const subject = encodeURIComponent(`Reporting a product: ${title || slug}`)
    const body = encodeURIComponent(`I want to report this product:\n${url}\n\nWhat is wrong with it:\n`)
    window.location.href = `mailto:support@storelib.com?subject=${subject}&body=${body}`
  }

  /**
   * `sm:hover:` was the wrong question twice over. `sm:` is a WIDTH, and a
   * phone held sideways is 852px wide, so the hover style was live on exactly
   * the device that cannot hover. And `hover:` alone is answered "yes" by
   * several touch browsers, where :hover then sticks to the last thing tapped.
   * Between them, pressing Share left the row grey until something else was
   * pressed. `pointer-fine:` asks whether a real pointer exists.
   */
  const item =
    "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-[#1a1a2e] transition-colors active:bg-[#e9eaee] pointer-fine:hover:bg-[#f3f4f6]"

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        {...tap}
        onPointerDown={(e) => { press.onPointerDown(); tap.onPointerDown(e) }}
        aria-label="More"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "relative -mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          "select-none outline-none",
          pressed ? "bar-control-pressed" : "bar-control",
        )}
        style={{ color: "inherit", WebkitTapHighlightColor: "transparent" }}
      >
        <span aria-hidden className={cn("bar-control-disc", (pressed || open) && "is-on")} />
        <MoreHorizontal className="relative h-[19px] w-[19px]" strokeWidth={2} />
      </button>

      {open && at && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              data-product-bar-menu
              className={cn(
                "product-bar-menu fixed z-[2147483000] w-44 overflow-hidden",
                "rounded-2xl border border-[#e5e7eb]/70 bg-white py-1",
                "shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-12px_rgba(15,23,42,0.28)]",
              )}
              style={{ top: at.top, right: at.right }}
            >
              <button type="button" role="menuitem" className={item} onClick={share}>
                {copied ? <Check className="h-4 w-4 shrink-0" /> : <Share2 className="h-4 w-4 shrink-0" />}
                {copied ? "Link copied" : "Share"}
              </button>
              <button type="button" role="menuitem" className={item} onClick={report}>
                <Flag className="h-4 w-4 shrink-0" />
                Report
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
/**
 * LiveProductCreatorBar - Used on actual live product pages
 * Responsive using CSS breakpoints (sm:, md:, etc.)
 */
interface LiveProductCreatorBarProps {
  settings: ProductCreatorBarSettings
  creatorName: string
  creatorId?: string
  creatorUsername?: string
  avatarUrl?: string
  /**
   * The word on the button, when the creator typed one on their own page.
   * One bar, two places: see the note in the markup below.
   */
  buttonLabel?: string
  /**
   * WHAT THE PHONE'S BAR IS ABOUT.
   *
   * A visitor who has scrolled past the title has nothing telling them which
   * product they are on, and the creator's name is the fact they already had
   * — it is how they got here. The desktop bar still leads with the creator.
   */
  productTitle?: string
  productSlug?: string
}

export function LiveProductCreatorBar({
  settings,
  creatorName,
  creatorId,
  creatorUsername,
  avatarUrl,
  buttonLabel,
  productTitle,
  productSlug,
}: LiveProductCreatorBarProps) {
  // IMPORTANT: All hooks must be called BEFORE any early returns to avoid React error #310
  const [subscribed, setSubscribed] = useState(false)
  const [subscribedEmail, setSubscribedEmail] = useState<string>("")
  const [email, setEmail] = useState("")
  const [inputFocus, setInputFocus] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [hideOnMobileDiscover, setHideOnMobileDiscover] = useState(false)

  const isDarkBackground = useMemo(() => isDarkHex(settings.backgroundColor), [settings.backgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, settings.backgroundColor), [isDarkBackground, settings.backgroundColor])
  /*
    Round 31: on Storelib's own product page a light bar (the default scheme's white) follows the person's look
    (lib/appearance/site-paint): the card's charcoal and light words in the dark, exactly as it was in the light. A dark
    bar is dark in both looks and is left as it is.
  */
  const paint = useSitePaint()
  const barPaint = <T extends string | undefined>(c: T, role: "bg" | "ink" | "line") => (isDarkBackground ? c : paint(c, role))
  /*
    ═══════════════════════════════════════════════════════════════════════
     WHITE LETTERS ON A NEAR WHITE DISC
    ═══════════════════════════════════════════════════════════════════════
    Avatar's shared ground is `bg-muted`, light on purpose so a circle is
    never a hole on a white page. This bar is the creator's own colour and
    usually near-black, and the text in it is white, which it inherits: the
    initials were white on a 242,242,242 disc, 1.12:1, which is to say not
    there at all. The phone bar had been fixed for exactly this and the
    other two circles in this file had not.

    A tenth of the bar's own ink, derived from the colour being painted, so
    it is a quiet disc on a dark bar and a quiet disc on a light one.
  */
  const avatarGround = isDarkBackground ? "bg-white/10" : "bg-black/[0.06]"

  const creatorHref = useMemo(
    () => getCreatorHref(creatorUsername, creatorId, creatorName),
    [creatorUsername, creatorId, creatorName],
  )

  /**
   * THE WAY BACK — and it is declared HERE, after `creatorHref`, on purpose.
   *
   * It was above it, and a useCallback's dependency array is evaluated at
   * render: naming a `const` that is declared further down is a temporal
   * dead zone, so the live bar threw a ReferenceError before it could paint
   * and every product page showed the error screen. TypeScript says exactly
   * that — "Block-scoped variable used before its declaration" — and
   * next.config.mjs sets `ignoreBuildErrors`, so the build was green.
   *
   * `router.back()` alone is a trap on a product page: most visits arrive
   * from a link somebody was sent, so there is nothing behind them and the
   * control would do nothing, which reads as broken rather than as empty. A
   * referrer on this site means there IS somewhere of ours to return to.
   * Anything else goes to the creator's page, which is where the product
   * belongs.
   */
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A TRANSITION, NOT A NEW DOCUMENT
   * ═════════════════════════════════════════════════════════════════════════
   * The fallback used to be `window.location.href = …`, which throws the page
   * away and loads another from scratch: a white flash, the fonts again, the
   * whole shell again. That is the jump. `router.push` keeps the document and
   * swaps the route, so the creator's page arrives the way it does from any
   * other link in the app.
   *
   * `startTransition` is what makes the wait legible. It marks the navigation
   * as non-urgent, and `isPending` is true for exactly as long as React is
   * waiting for the route — which is the signal the spinner needs. Without it
   * there is no way to know the difference between "instant" and "still
   * going", and the control has to either flash a spinner at everybody or
   * show one to nobody.
   *
   * Going BACK cannot report that way: a popstate is the browser's, not
   * React's. So pending is set by hand and left for the page to end by
   * unmounting. If the navigation somehow does not happen — a history entry
   * that is not ours, a blocked back — BACK_GIVE_UP_MS puts the arrow back
   * rather than leaving a creator looking at a spinner for ever.
   */
  const router = useRouter()
  const [backPending, startBackTransition] = useTransition()
  /** True from the moment a back is asked for until this page goes away. */
  const [leaving, setLeaving] = useState(false)
  /** The last resort for a push that never lands; cleared when this page goes. */
  const pushWatch = useRef<number | null>(null)
  useEffect(() => () => { if (pushWatch.current) window.clearTimeout(pushWatch.current) }, [])

  const goBack = useCallback(() => {
    if (typeof window === "undefined") return
    /*
      ═════════════════════════════════════════════════════════════════════
       NO CROSS-FADE HERE, AND THAT WAS TRIED
      ═════════════════════════════════════════════════════════════════════
      A sheet of the page's own colour used to rise over it for 190ms before
      this navigated, so the swap happened underneath something opaque. The
      film said it worked; looking at it said otherwise. On a white product
      page a dissolve through a flat colour is a white flash, and a white
      flash is what a cheap transition looks like — it was worse than the cut
      it replaced.

      The lesson is not "no transition". It is that a page transition has to
      MOVE, the way every native one does: the leaving page slides or scales
      while the one beneath comes forward. Nothing about a colour wash reads
      as an app.

      That is blocked on the buy bar, not on taste. It is `position: fixed`
      inside this page's root (components/store-builder/sticky-add-to-cart),
      and a transform on an ancestor makes that ancestor the containing block
      for it — so the bar would snap from the bottom of the window to the
      bottom of the document on the first frame of any slide. The creator bar
      is already portaled out and would be fine; the buy bar is not. Portal
      it and the spatial version becomes available.
    */
    /**
     * WHICH WAY IS lib/navigation/back-plan's decision, and goBackOr carries
     * it out. There is a page of ours behind this one in this tab: go back to
     * it, instantly and with its scroll. There is not (a shared link opened
     * cold, a new tab): go to the creator's page, which is where the product
     * belongs.
     *
     * It used to ask canReturnInApp alone, which counted this document's
     * route changes. A route that REPLACED its entry (a sign-in finishing
     * with router.replace, the app's start screen) counted as one too, and
     * then `history.back()` ran with nothing behind it:
     * the browser did nothing, the arrow became a spinner, and the page
     * "loaded forever". The browser's own `navigation.canGoBack` now decides
     * wherever it exists, and a back that does not show itself within
     * BACK_WATCH_MS goes to the creator's page instead.
     *
     * The push is a server render behind a network, so the page stays, the
     * arrow becomes a spinner once the wait is long enough to need
     * explaining, and React reports when the route lands. If it never does,
     * PUSH_GIVE_UP_MS loads the creator's page as a document.
     */
    const target = fallbackHref(creatorHref)
    setLeaving(true)
    goBackOr(target, (href) => {
      startBackTransition(() => router.push(href))
      if (pushWatch.current) window.clearTimeout(pushWatch.current)
      pushWatch.current = window.setTimeout(() => window.location.assign(href), PUSH_GIVE_UP_MS)
    })
  }, [creatorHref, router])

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  AND THE FALLBACK IS WARMED, BECAUSE IT IS KNOWN IN ADVANCE
   * ═════════════════════════════════════════════════════════════════════════
   * A visitor who opened a shared link has nothing behind them, so the arrow
   * can only go FORWARD to the creator's page, and that is a fetch. Measured
   * on production it is 1.9 to 2.6 seconds, and the arrow is a spinner for
   * all of it.
   *
   * Which page that will be is known when the bar renders, and whether it
   * will be needed is known too: exactly when there is no history of ours.
   * So it is asked for once, on mount, in the only case that will use it.
   *
   * Not for everybody. The common visit returns through history to a page the
   * router already has, and prefetching the creator page for those would be a
   * request per product view for something nobody is going to fetch.
   */
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!creatorHref || creatorHref === "#") return
    if (planBack(readBackEvidence(), creatorHref).kind === "history") return
    try {
      router.prefetch(creatorHref)
    } catch {
      /* A malformed href is the bar's problem to show, not a reason to throw
         out of an effect. */
    }
  }, [creatorHref, router])

  /**
   * The back half has no completion event of its own, so it is given a limit.
   * Long enough that a slow page still shows the spinner throughout, short
   * enough that a back which did nothing does not look like a hang.
   */
  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(() => setLeaving(false), BACK_GIVE_UP_MS)
    return () => window.clearTimeout(id)
  }, [leaving])

  useEffect(() => {
    setIsHydrated(true)
    if (typeof window === "undefined") return
    const emailKey = makePersistKey("email", creatorId, creatorName)
    const subEmailKey = makePersistKey("subscribedEmail", creatorId, creatorName)

    const savedEmail = getWithExpiry<string>(emailKey)
    const savedSubEmail = getWithExpiry<string>(subEmailKey)

    if (savedEmail) setEmail(savedEmail)
    if (savedSubEmail) {
      setSubscribedEmail(savedSubEmail)
      setSubscribed(normalizeEmail(savedEmail || "") === savedSubEmail)
    }
  }, [creatorId, creatorName])

  useEffect(() => {
    if (typeof window === "undefined") return
    const checkDiscoverContext = () => {
      const params = new URLSearchParams(window.location.search)
      // Only hide on WEB discover mode (query-param based).
      // In Capacitor native app, always SHOW the creator bar (it sits below the header).
      const isWebDiscover =
        (params.get("layout") === "discover" || params.has("recommended")) && !isNativeApp()
      setHideOnMobileDiscover(isWebDiscover)
    }
    checkDiscoverContext()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !isHydrated) return
    const emailKey = makePersistKey("email", creatorId, creatorName)
    if (email) setWithExpiry(emailKey, email, PERSIST_MS)
  }, [email, creatorId, creatorName, isHydrated])

  useEffect(() => {
    if (!subscribedEmail) return
    const norm = normalizeEmail(email)
    if (norm !== subscribedEmail) {
      setSubscribed(false)
    } else if (norm === subscribedEmail) {
      setSubscribed(true)
    }
  }, [email, subscribedEmail])

  /*
    THE BUY BAR NEEDS TO KNOW THIS BAR EXISTS. A creator can switch it off,
    and on a page without it the buy bar has nothing to be exclusive with and
    must go on behaving exactly as it did before. Declared with the other
    hooks and above the early return, because a hook below a `return null` is
    a hook that runs on some renders and not others (React #310).
  */
  /* `isHydrated` is deliberately NOT part of this any more — see the note at
     the return below. The bar is on the page from the server render, so the
     buy bar is told so on the first commit rather than one render later. */
  const barIsOnThePage = settings.visible && !hideOnMobileDiscover
  useEffect(() => {
    setProductTopBarRendered(barIsOnThePage)
    return () => setProductTopBarRendered(false)
  }, [barIsOnThePage])


  // Early return AFTER all hooks
  if (!settings.visible) return null


  const isCurrentEmailSubscribed = subscribed && normalizeEmail(email) === subscribedEmail
  /**
   * THE LABEL THE CREATOR TYPED, when they typed one. `buttonLabel` comes
   * from the same stored subscribeBar the creator page's own bar reads, so
   * the two say the same word; the preset is the fallback, as it always was.
   */
  const buttonText = buttonLabel?.trim() || getButtonText(settings.buttonStyle, isCurrentEmailSubscribed)

  const buttonOpacityClass = getButtonOpacityClass({
    isSubscribed: isCurrentEmailSubscribed,
    hasEmail: !!email,
    isFocused: inputFocus,
  })

  const inputOpacityClass = getInputOpacityClass(isCurrentEmailSubscribed, inputFocus)

  const triggerAnim = () => {
    setPulse(true)
    window.setTimeout(() => setPulse(false), 520)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const norm = normalizeEmail(email)
    if (!norm || loading) return
    if (isCurrentEmailSubscribed) return

    setLoading(true)
    try {
      if (creatorId) {
        await fetch("/api/subscribers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: norm, creatorId, origin: pageOrigin() }),
        })
      }
      setSubscribedEmail(norm)
      setSubscribed(true)

      const subEmailKey = makePersistKey("subscribedEmail", creatorId, creatorName)
      setWithExpiry(subEmailKey, norm, PERSIST_MS)

      triggerAnim()
    } catch (error) {
      console.error("Subscribe error:", error)
    } finally {
      setLoading(false)
    }
  }

  /*
    ═══════════════════════════════════════════════════════════════════════
     NO HYDRATION GATE. THE GATE *WAS* THE WHITE FLASH IN THE HEADER.
    ═══════════════════════════════════════════════════════════════════════
    `if (!isHydrated) return null` stood here. It meant the bar was absent
    from the server HTML and absent from the first paint, so the top 53px of
    every product page was the white body until React hydrated. Filmed on
    production over a real forward navigation (scripts/check-nav-flash.mjs):

         48ms   the creator page, header 138.1 luminance
        713ms   header 246.4 luminance, 0.0% dark pixels — WHITE
       1345ms   still white
       1370ms   header 101.9 in ONE frame, a 149.8 jump

    632ms of white, then a snap. That is the flash that was reported as
    "the white flash in the header", and going back never showed it because
    the bar was already hydrated on the page being returned to.

    THERE WAS NEVER ANYTHING TO GUARD. A hydration gate earns its place when
    the first client render cannot match the server's — a date, a random id,
    a width, a localStorage read used DURING render. This subtree has none:
    every `window` read in it lives in an event handler, the menu's portal is
    behind `open` which starts false, and the two values that do come from
    localStorage (`email`, `subscribedEmail`) are plain state initialised to
    "" and filled in by an effect, which is a post-hydration update and not a
    mismatch. So the server renders the bar, the first paint has the bar, and
    hydration changes nothing visible.

    If you add something here that genuinely differs between server and
    client, gate THAT VALUE. Do not put the gate back on the whole bar: it
    costs a third of a second of white across the top of every product page.
  */

  return (
    <div
      className={cn("relative z-10 w-full overflow-hidden", hideOnMobileDiscover && "hidden")}
      style={{
        backgroundColor: barPaint(settings.backgroundColor || "#1a1a1a", "bg"),
        color: barPaint(settings.textColor || "#ffffff", "ink"),
        /*
          A LITTLE DEPTH, so the bar reads as a bar and not as the top strip
          of the page. A hairline alone is a rule; the soft shadow underneath
          is what says this sits over what follows.

          --bar-depth is defined once in globals.css and the creator page's
          bar uses the same one, so the two strips a visitor moves between
          sit at the same height. It went DOWN to get here: the shadow this
          bar carried was visible as a shadow, which on something that
          appears above every product is too much.
        */
        borderBottom: `1px solid ${barPaint("rgba(0, 0, 0, 0.06)", "line")}`,
        /* The dark value for a dark bar: a slate shadow is lighter than the
           bar above it and reads as a halo at the seam. This bar defaults to
           #1a1a1a, so that is the usual case rather than the exception. */
        boxShadow: isDarkBackground ? "var(--bar-depth-dark)" : "var(--bar-depth)",
      }}
    >
      {/*
        =====================================================================
         WHOSE PRODUCT THIS IS, THE WAY BACK, AND THE FOLLOW
        =====================================================================
        This carried a newsletter form and it was taken out, on the argument
        that the first thing a visitor meets on a page they came to look at a
        thing should not be a request for their address. The owner has asked
        for it back and it is their shop; the argument is answered by ORDER
        rather than by absence — who is selling and the way back come first,
        reading left to right, and the field is at the far end of the row
        where a visitor reaches it after the two facts they came for.

        ON A PHONE the row cannot hold five things. The two facts keep the
        first line and the form gets its own underneath, which is the same
        shape the creator page's bar uses at that width.

        IT IS THE CREATOR PAGE'S BAR. Same colours, same button label, from
        the same stored settings — the page resolves them. Editing the bar on
        the creator page changes this one, because a visitor moving between
        the two is looking at one shop.
      */}
      {/*
        =====================================================================
         THE WAY BACK, WHO IS SELLING, AND A MENU
        =====================================================================
        Three things, and the list has been longer twice. An email field and
        a Follow button asked for an address before a visitor had decided
        anything. A line of the creator's bio, cut to six words, was the
        start of a sentence the bar had no room to finish. Both were taken
        off for the same reason: this strip is read in the second between
        arriving and looking at the product, and everything on it has to earn
        that second.

        The creator's page is one tap away and has the bio in full. The
        desktop bar is unchanged and still
        leads with them — there is room for both at that width.
      */}
      {/*
        =====================================================================
         THE WAY BACK, WHO IS SELLING, AND A MENU
        =====================================================================
        This carried the product's thumbnail and title for a round. The
        argument for it was that a sticky bar should say which product you
        are on once the title has scrolled away — and the answer is that the
        page under it is already the product, in a picture the size of the
        screen, and a visitor who scrolled past the title scrolled past it on
        purpose. What is NOT on the page anywhere else is whose shop this is
        and how to get to it.

        Three things, then, and they are the three a bar can hold at this
        width: out, who, and more.
      */}
      <div data-product-bar="phone" className="flex w-full items-center gap-2.5 px-3 py-2 sm:hidden">
        <BackControl onBack={goBack} href={fallbackHref(creatorHref)} label="Back" pending={backPending || leaving} />

        <SmartLink
          href={creatorHref}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-0.5"
          aria-label={`Go to ${creatorName}'s page`}
        >
          {/*
            bg-white/10, NOT the shared bg-muted. The avatar's default ground is
            a light grey so a circle is never a hole on a white page. This bar
            is #1a1a1a, and on it that ground is a BRIGHT disc that paints for
            the frames before the photo decodes and then vanishes under it —
            a light flash in the header on every arrival, exactly where the
            creator's picture sits. A tenth of white on near-black is the same
            insurance without the flash, and the fallback matches it so the
            initials, if they ever show, sit on the same ground.

            What it holds is the shared mark: the initials, or a plain person
            when the creator has no display name. It was `initials || "?"`.
            And with no picture there is nothing for the 600ms to wait for, so
            the mark paints at once instead of leaving a bare disc.
          */}
          <Avatar className="h-8 w-8 shrink-0 bg-white/10">
            {avatarUrl ? <AvatarImage src={optimizedImageUrl(avatarUrl, 48)} alt={creatorName} /> : null}
            <AvatarFallback delayMs={avatarUrl ? undefined : 0} className="bg-white/10 text-[10px]"><AvatarMark name={(creatorName || "").trim()} size={32} /></AvatarFallback>
          </Avatar>
          {/* min-w-0 is what lets `truncate` work inside a flex row: without
              it the name takes its content's width and runs past the edge of
              the bar instead of ending in an ellipsis. */}
          <span className="truncate text-sm font-semibold leading-tight">{creatorName}</span>
        </SmartLink>

        <ProductBarMenu title={productTitle || creatorName} slug={productSlug || ""} handle={creatorUsername || undefined} />
      </div>

      {/* Desktop - with reduced width (1170px instead of 1200px) */}
      <div className={cn("hidden sm:block py-[calc(0.625rem+5px)] px-4 sm:px-5")}>
        <div className={cn("mx-auto w-full", LIVE_DESKTOP_MAX_W)}>
          <div className="w-full flex items-center gap-3">
            <BackControl onBack={goBack} href={fallbackHref(creatorHref)} label="Back" pending={backPending || leaving} />
            <SmartLink
              href={creatorHref}
              className="flex items-center gap-2 min-w-0 group"
              aria-label={`Go to ${creatorName}'s page`}
            >
              <Avatar className={cn("h-8 w-8 shrink-0 cursor-pointer", avatarGround)}>
                {avatarUrl ? <AvatarImage src={optimizedImageUrl(avatarUrl, 48)} alt={creatorName} /> : null}
                <AvatarFallback delayMs={avatarUrl ? undefined : 0} className={cn("text-xs", avatarGround)}><AvatarMark name={(creatorName || "").trim()} size={32} /></AvatarFallback>
              </Avatar>
              {/*
                THE BIO MOVED HERE FROM THE PHONE BAR. It was added under the
                creator's name on a phone, and the phone bar is the product's
                now — but a line about who is selling is worth having, and
                this is the width that has room for it without taking any
                from anything else.

                70% of the bar's own text colour, so it reads as the quieter
                of the two lines whatever colour the creator picked. A fixed
                grey would disappear on a dark bar and shout on a light one.
              */}
              <span className="truncate text-sm md:text-[calc(0.875rem+3px)] font-medium cursor-pointer group-hover:opacity-90">
                {creatorName}
              </span>
            </SmartLink>

            {settings.showSubscribe !== false && (
              <form onSubmit={handleSubmit} className="ml-auto flex shrink-0 items-center gap-2">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setInputFocus(true)}
                  onBlur={() => setInputFocus(false)}
                  required
                  disabled={loading}
                  className={cn(adaptiveInputClass, "h-9 w-48 text-sm", inputOpacityClass)}
                  style={{ borderRadius: `${settings.buttonBorderRadius ?? 8}px` }}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={loading || isCurrentEmailSubscribed}
                  onClick={() => { if (!loading && email && !isCurrentEmailSubscribed) triggerAnim() }}
                  className={cn("h-9 shrink-0 px-4", buttonOpacityClass, pulse && "animate-[btnPop_520ms_ease-out]")}
                  style={{
                    backgroundColor: barPaint(settings.buttonColor || "#4b5563", "bg"),
                    color: settings.buttonTextColor || "#ffffff",
                    borderRadius: `${settings.buttonBorderRadius ?? 8}px`,
                  }}
                >
                  {loading ? "..." : buttonText}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes btnPop {
          0% { transform: scale(1); }
          35% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

// Default export for backward compatibility
export default ProductCreatorBar
