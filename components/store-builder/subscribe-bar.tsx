"use client"

import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { showPillToast } from "@/components/storefront/pill-toast"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { AvatarMark } from "@/components/app/app-avatar"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { cn } from "@/lib/utils"
import { isNativeApp } from "@/lib/platform-utils"
import { useRevealOnScrollUp } from "@/lib/store-builder/use-reveal-on-scroll-up"

// Button style presets
export type { ButtonStylePreset, SubscribeBarSettings } from "@/lib/store-builder/subscribe-text"
export { buttonStylePresets, getButtonText, getDisplayText } from "@/lib/store-builder/subscribe-text"

import type { ButtonStylePreset, SubscribeBarSettings } from "@/lib/store-builder/subscribe-text"
import { buttonStylePresets, getButtonText, getDisplayText } from "@/lib/store-builder/subscribe-text"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"

interface SubscribeBarProps {
  settings: SubscribeBarSettings
  creatorId: string
  onSubmit?: (email: string) => Promise<void>
  /**
   * THE OWNER'S PENCIL, INSIDE THE BAR'S OWN ROW.
   *
   * It used to be positioned over a wrapper around this component, and that
   * cannot work: a sticky bar renders `position: fixed` plus a 76px spacer,
   * so the wrapper contributes no height of its own and an absolutely
   * positioned child landed on the SPACER — floating in the empty strip under
   * the bar, which is exactly what it looked like.
   *
   * A slot instead. It sits beside the sentence, inside the row, wherever the
   * row happens to be.
   */
  ownerAction?: React.ReactNode
  /**
   * THE WAY BACK, BEFORE THE CREATOR'S PHOTO. A creator page opened from a
   * community, Explore or search puts its back chevron here, at the start
   * of the bar next to the avatar (components/profile/profile-top-bar.tsx
   * TopBarBack), rather than as a pill under the bar.
   */
  leading?: React.ReactNode
}

/** Compute if a hex background is "dark" */
function isDarkHex(bg?: string): boolean {
  if (!bg) return true
  const hex = bg.trim()
  if (!hex.startsWith("#")) return true

  const clean = hex.replace("#", "")
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.length === 6
        ? clean
        : null

  if (!full) return true

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)

  if ([r, g, b].some((n) => Number.isNaN(n))) return true

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance < 150
}

/**
 * Check if color is vibrant (saturated and not too dark/light)
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

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2 / 255
  const delta = max - min
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)) / 255

  return saturation > 0.4 && lightness > 0.2 && lightness < 0.8
}

/** Shared input classes - adaptive to background color */
function getAdaptiveInputClass(isDarkBackground: boolean, backgroundColor?: string, hasCustomColors?: boolean) {
  const isVibrant = isVibrantColor(backgroundColor)

  // If custom colors are provided via theme, use minimal styling and let inline styles take over
  if (hasCustomColors) {
    return cn(
      "w-full rounded-md border outline-none transition-colors bg-transparent px-3",
    )
  }

  return cn(
    "w-full rounded-md border outline-none transition-colors bg-transparent px-3",
    isDarkBackground || isVibrant
      ? "text-white placeholder:text-white/80 focus:placeholder:text-white/50 border-white/40 focus:border-white/70"
      : "text-gray-900 placeholder:text-gray-500 focus:placeholder:text-gray-400 border-gray-300 focus:border-gray-400",
  )
}

/** Generate input style object with theme colors */
function getInputStyle(settings: SubscribeBarSettings) {
  const style: React.CSSProperties = {}

  if (settings.inputBorderColor) {
    style.borderColor = settings.inputBorderColor
  }
  if (settings.inputTextColor) {
    style.color = settings.inputTextColor
  }
  if (settings.inputBackgroundColor) {
    style.backgroundColor = settings.inputBackgroundColor
  }

  return style
}

/** Check if custom input colors are provided by theme */
function hasThemeInputColors(settings: SubscribeBarSettings): boolean {
  return Boolean(
    settings.inputTextColor ||
    settings.inputPlaceholderColor ||
    settings.inputBorderColor ||
    settings.inputBackgroundColor
  )
}

/** Generate placeholder CSS for themed inputs */
function getPlaceholderStyle(placeholderColor?: string): string {
  if (!placeholderColor) return ''
  return `
    .subscribe-input-themed::placeholder {
      color: ${placeholderColor} !important;
    }
    .subscribe-input-themed:focus::placeholder {
      opacity: 0.7;
    }
  `
}

/**
 * Live subscribe bar component used on public pages
 * Uses FIXED positioning when sticky is enabled
 */
export function SubscribeBar({ settings, creatorId, onSubmit, ownerAction, leading }: SubscribeBarProps) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  /**
   * Whether the label may animate. Off for the first frames, so a returning
   * subscriber whose "Subscribed" is read back from storage just has it,
   * rather than watching the button change its mind as the page loads.
   */
  const [labelMotion, setLabelMotion] = useState(false)
  /**
   * Inside the iOS or Android app. Read after mount, never during render: the
   * server cannot know, and a first client render that disagreed with the
   * server's HTML is a hydration error. Until then `html.capacitor` (set
   * before first paint by the root layout) already puts the bar in the flow
   * through globals.css, so the app never sees the web layout either.
   */
  const [inNativeApp, setInNativeApp] = useState(false)
  const { visible: isVisible, ready: barPlaced } = useRevealOnScrollUp(!!settings.enableStickyBar && !!settings.enableStickyOnScrollUp)

  // Extract solid color first, then check if dark
  const computedSolidBgColor = useMemo(() => extractSolidColor(settings.backgroundColor), [settings.backgroundColor])
  const isDarkBackground = useMemo(() => isDarkHex(computedSolidBgColor), [computedSolidBgColor])
  const hasCustomInputColors = useMemo(() => hasThemeInputColors(settings), [settings.inputTextColor, settings.inputPlaceholderColor, settings.inputBorderColor, settings.inputBackgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, settings.backgroundColor, hasCustomInputColors), [isDarkBackground, settings.backgroundColor, hasCustomInputColors])
  const inputStyle = useMemo(() => getInputStyle(settings), [settings.inputBorderColor, settings.inputTextColor, settings.inputBackgroundColor])
  const placeholderStyleCSS = useMemo(() => getPlaceholderStyle(settings.inputPlaceholderColor), [settings.inputPlaceholderColor])

  /**
   * THE SAME HOOK THE PRODUCT PAGE'S BAR USES. This was thirty lines here and
   * nowhere else, so one of Storelib's two top bars got out of the way on the
   * scroll down and the other was pinned forever. See use-reveal-on-scroll-up
   * for the three details that make it usable rather than twitchy.
   */

  /**
   * FIX: prevent “type 1 character then input blurs” on some pages where
   * a parent re-render / layout shift steals focus.
   *
   * We track whether the user is focused in the email input, and if a re-render
   * steals focus while they’re typing, we immediately restore focus.
   */
  const activeInputRef = useRef<HTMLInputElement | null>(null)
  const shouldRestoreFocusRef = useRef(false)

  const setSmartInputRef = (node: HTMLInputElement | null) => {
    if (!node) return
    // Prefer the actually visible input (desktop vs mobile) if both exist in DOM
    const isVisible = !!(node.offsetParent || node.getClientRects().length)
    if (isVisible) activeInputRef.current = node
  }

  const handleInputFocus = () => {
    shouldRestoreFocusRef.current = true
  }

  const handleInputBlur = () => {
    shouldRestoreFocusRef.current = false
  }

  useLayoutEffect(() => {
    if (!shouldRestoreFocusRef.current) return
    const el = activeInputRef.current
    if (!el) return
    if (document.activeElement === el) return

    // Only restore if user is still on the page (avoid weirdness on navigation)
    if (typeof document !== "undefined" && document.hasFocus()) {
      el.focus({ preventScroll: true })
    }
  }, [email, loading, subscribed])

  useEffect(() => {
    const storageKey = `subscriber_${creatorId}`
    const saved = localStorage.getItem(storageKey)

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { email?: string; subscribed?: boolean }
        setEmail(parsed.email || "")
        setSubscribed(Boolean(parsed.subscribed))
      } catch {
        // ignore
      }
    }

    setIsHydrated(true)
    setInNativeApp(isNativeApp())
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setLabelMotion(true)))
    return () => cancelAnimationFrame(frame)
  }, [creatorId])

  useEffect(() => {
    if (!isHydrated) return
    const storageKey = `subscriber_${creatorId}`

    // Write after paint to avoid any chance of janky sync work during typing
    const write = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ email, subscribed }))
      } catch {
        // ignore
      }
    }

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      ;(window as any).requestIdleCallback(write, { timeout: 250 })
    } else {
      setTimeout(write, 0)
    }
  }, [email, subscribed, creatorId, isHydrated])


  // IMPORTANT: All useMemo hooks must be called BEFORE any early returns to avoid React error #310

  // Memoize avatar elements to prevent re-renders when email changes
  /*
    ═══════════════════════════════════════════════════════════════════════════
     THE CIRCLE THAT FLASHED EMPTY AND THEN POPPED
    ═══════════════════════════════════════════════════════════════════════════
    Measured on the live bar, the small avatar reported two faults at once:

        ground      rgb(233, 233, 234)      a near-WHITE disc
        src         ...1788786737198.webp   the raw upload, not /_next/image
        natural     384 x 512               decoded to fill 24 CSS pixels

    Both are the report. The ground is Avatar's shared `bg-muted`, which is
    light because it exists so a circle is never a hole on a WHITE page; on
    this bar, which the creator usually makes near-black, it is a bright disc
    that paints first — that is the flash and the "emptiness", because Radix
    holds the initials back for 600ms and the ground is all there is until the
    photo decodes. And the photo took its time because it was the original:
    a 384x512 file fetched and decoded whole to fill a 24px circle, which is
    the pop at the end.

    So the ground follows the bar instead of assuming a white page, and the
    picture is asked for at the size it is shown at — roughly twenty kilobytes
    of AVIF, which lands inside a frame or two, so the fallback's 600ms means
    the initials never appear at all and there is nothing left to flash.

    The big profile avatar further down the page was already doing both; only
    the bar was not.

    AND WHEN THERE IS NO PICTURE AT ALL, the 600ms wait has nothing to wait
    for: it was 600ms of a bare disc on every load. The fallback is told to
    paint at once in exactly that case, and the wait is untouched whenever a
    photo is coming. What it paints is the shared mark, so a creator with no
    display name gets a plain person rather than the "?" this used to build.
  */
  const avatarGround = isDarkBackground ? "bg-white/10" : "bg-black/[0.06]"

  const mobileAvatar = useMemo(() => (
    settings.showAvatar ? (
      <Avatar className={cn("h-6 w-6 shrink-0", avatarGround)}>
        {settings.avatarUrl ? (
          <AvatarImage src={optimizedImageUrl(settings.avatarUrl, 24)} alt={settings.creatorName || ""} />
        ) : null}
        <AvatarFallback delayMs={settings.avatarUrl ? undefined : 0} className={cn("text-[10px]", avatarGround)}><AvatarMark name={(settings.creatorName || "").trim()} size={24} /></AvatarFallback>
      </Avatar>
    ) : null
  ), [settings.showAvatar, settings.avatarUrl, settings.creatorName, avatarGround])

  const desktopAvatar = useMemo(() => (
    settings.showAvatar ? (
      <Avatar className={cn("h-8 w-8 shrink-0", avatarGround)}>
        {settings.avatarUrl ? (
          <AvatarImage src={optimizedImageUrl(settings.avatarUrl, 32)} alt={settings.creatorName || ""} />
        ) : null}
        <AvatarFallback delayMs={settings.avatarUrl ? undefined : 0} className={cn("text-xs", avatarGround)}><AvatarMark name={(settings.creatorName || "").trim()} size={32} /></AvatarFallback>
      </Avatar>
    ) : null
  ), [settings.showAvatar, settings.avatarUrl, settings.creatorName, avatarGround])

  /*
    `isSticky` is only READ below the early return, but the height effect
    under it depends on it, and that effect has to be above the return. It
    is a pure expression and isNativeApp() is false on the server, so
    computing it here changes nothing about what gets drawn.
  */
  const isSticky = settings.enableStickyBar && !inNativeApp

  /**
   * The bar's real height, for the spacer that stands in for it.
   *
   * `undefined` until it has been measured, which is what makes the Tailwind
   * fallback below the value on the server and on the first frame.
   *
   * THIS HAS TO STAY ABOVE THE EARLY RETURN. It was added below it, and
   * that is React error #310: the first render bails at `isHydrated` false
   * having run the hooks above, the second render gets past the bail and
   * runs three more, and React throws on the count. It took down every
   * creator page carrying a visible bar, for everybody, not just its owner.
   */
  const barRef = useRef<HTMLDivElement>(null)
  const [barHeight, setBarHeight] = useState<number | undefined>(undefined)
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    /* `offsetHeight`, not the rect: the bar slides on `transform` when it
       hides on scroll, and a transformed rect is the drawn box rather than
       the laid-out one — so a hidden bar would have measured as itself
       translated and a rounding of it. offsetHeight ignores the transform. */
    const measure = () => setBarHeight(el.offsetHeight || undefined)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isSticky, settings.style, settings.showAvatar, settings.text, settings.customCtaText])

  // Early return AFTER all hooks. Every hook in this component belongs above
  // this line; see the note on the height effect for what happens otherwise.
  /*
    ═════════════════════════════════════════════════════════════════════════
     THE BAR IS IN THE SERVER'S HTML
    ═════════════════════════════════════════════════════════════════════════
    This also returned null until hydration (`|| !isHydrated`), so that a
    returning subscriber would not see "Subscribe" before storage said
    "Subscribed". The cost was the whole bar: absent from the HTML, it
    arrived with the JavaScript and pushed the cover, the avatar and
    everything under them down by its height, on every visit. Checked on the
    live page: no email field anywhere in the HTML.

    It renders on the server now, as the bar a new visitor sees. For the
    rare returning subscriber the label turns to "Subscribed" on the first
    frames after hydration, in place, in a button that is already the width
    of both words, so nothing moves.
  */
  if (!settings.visible) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || loading) return

    setLoading(true)
    try {
      if (onSubmit) {
        await onSubmit(email)
      } else {
        await fetch("/api/subscribers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, creatorId, origin: pageOrigin() }),
        })
      }

      /**
       * SUBSCRIBING ALSO FOLLOWS, when we know who is subscribing.
       *
       * The bar's job is "keep me posted about this creator", and a newsletter
       * row alone cannot answer "who follows them" — a follow points at an auth
       * user and an emailed address is not one. So a SIGNED-IN visitor gets
       * both: the email list and the follow graph.
       *
       * Deliberately best-effort and not awaited into the success path. A
       * signed-out visitor gets a 401 here and that is correct — they still
       * subscribed, and telling them their subscription failed because they do
       * not have an account would be a lie.
       */
      if (settings.creatorUserId) {
        void fetch("/api/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorUserId: settings.creatorUserId, follow: true }),
        }).catch(() => {})
      }

      setSubscribed(true)
      /*
        A dark pill over the page rather than a green line inside the bar.
        The line made the bar taller for three seconds, which moved the
        whole page down and back up under the reader.
      */
      showPillToast(`Subscribed to ${settings.creatorName || "this creator"}`, { at: "bottom" })
    } catch (error) {
      console.error("Subscribe error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail)
    if (subscribed) setSubscribed(false)
  }

  const displayText = getDisplayText(settings, settings.creatorName)

  /*
    ═════════════════════════════════════════════════════════════════════════
     THREE STATES, ONE BUTTON WIDTH
    ═════════════════════════════════════════════════════════════════════════
    It said "Subscribe", then "...", then "Subscribed", and the button took
    the width of each in turn: narrower while sending, wider when done, with
    the email field beside it stretching and shrinking to match. And the
    disabled style faded the whole button to half while sending and left it
    faded once subscribed, which read as broken rather than done.

    Both words are stacked in the same cell, so the button is always as wide
    as the wider of them and nothing beside it moves. Sending dims the word
    that is there. Done slides it up and out while "Subscribed", with a
    small mark, rises into its place. Opacity and transform only.
  */
  const phase: "idle" | "sending" | "done" = loading ? "sending" : subscribed ? "done" : "idle"
  const idleLabel = getButtonText(settings, false)
  const doneLabel = getButtonText(settings, true)
  const labelMove = labelMotion
    ? "transition-[opacity,translate] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
    : ""
  const buttonFace = (
    <span className="relative inline-grid place-items-center" data-subscribe-phase={phase}>
      <span
        aria-hidden={phase === "done"}
        className={cn(
          "col-start-1 row-start-1",
          labelMove,
          phase === "done" ? "-translate-y-2 opacity-0" : phase === "sending" ? "opacity-55" : "opacity-100",
        )}
      >
        {idleLabel}
      </span>
      <span
        aria-hidden={phase !== "done"}
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center gap-1",
          labelMove,
          phase === "done" ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        {/[a-z]/i.test(doneLabel) && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
            <path d="M3.5 8.4l2.9 2.9 6.1-6.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {doneLabel}
      </span>
    </span>
  )
  /* Not the shared Button: its `transition-all` and its half-opacity
     disabled state are the two things this button must not do. */
  const submitClass =
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium outline-none transition-transform duration-150 active:scale-[0.97] disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-current/40 [-webkit-tap-highlight-color:transparent]"

  // In Capacitor native apps, disable sticky/fixed mode so the subscribe bar
  // sits in normal document flow — avoids overlapping the platform header.

  // Always use solid color for live subscriber bar (no gradients)
  const solidBackgroundColor = extractSolidColor(settings.backgroundColor)

  // Render bar content directly (not as a component) to prevent remounting
  // Avatar elements are memoized separately to prevent re-renders
  const barContent = (
    <>
      {/* Custom placeholder color styles */}
      {placeholderStyleCSS && <style dangerouslySetInnerHTML={{ __html: placeholderStyleCSS }} />}

      {/* MOBILE */}
      <div className="sm:hidden flex flex-col items-center gap-2">
        {/* The way back, when there is one, sits right before the photo; it draws nothing otherwise, so the row stays centred. */}
        <div className="flex items-center gap-1.5 justify-center">
          {leading}
          {mobileAvatar}
          <p className="text-xs font-medium">{displayText}</p>
          {/* On a phone the row is already the whole width; the pencil is the
              smallest thing that can still be tapped and sits right after the
              sentence rather than floating anywhere. */}
          {ownerAction}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 items-center w-full">
          <Input
            ref={setSmartInputRef}
            type="email"
            placeholder={settings.placeholder || "Enter your email"}
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            required
            disabled={loading}
            className={cn(adaptiveInputClass, "h-8 flex-1 text-xs", hasCustomInputColors && "subscribe-input-themed")}
            style={{
              ...inputStyle,
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          />
          <button
            type="submit"
            disabled={loading || subscribed}
            aria-busy={loading || undefined}
            className={cn(submitClass, "h-8 px-3 text-xs")}
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonFace}
          </button>
        </form>
      </div>

      {/* DESKTOP */}
      <div className="hidden sm:flex items-center justify-between gap-4 max-w-[1150px] mx-auto">
        <div className="flex items-center gap-2 shrink-0">
          {leading}
          {desktopAvatar}
          <p className="text-sm font-medium">{displayText}</p>
          {ownerAction}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <Input
            ref={setSmartInputRef}
            type="email"
            placeholder={settings.placeholder || "Enter your email"}
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            required
            disabled={loading}
            className={cn(adaptiveInputClass, "h-9 w-48 text-sm", hasCustomInputColors && "subscribe-input-themed")}
            style={{
              ...inputStyle,
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          />
          <button
            type="submit"
            disabled={loading || subscribed}
            aria-busy={loading || undefined}
            className={cn(submitClass, "h-9 px-4 text-sm")}
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonFace}
          </button>
        </form>
      </div>
    </>
  )

  // STICKY MODE: Use fixed positioning for live pages
  // In Capacitor apps, offset below the platform header and use lower z-index
  // so the subscribe bar sits visually under the header, not on top of it.
  if (isSticky) {
    const stickyTop = inNativeApp ? "calc(env(safe-area-inset-top, 0px) + 68px)" : "0px"
    // z-30 in native app (below header z-40), z-50 on web (above everything)
    const stickyZ = inNativeApp ? "z-30" : "z-50"
    /*
      IN THE FLOW UNTIL ITS HEIGHT IS KNOWN, then fixed over a spacer of
      exactly that height, on the same frame. The spacer used to start as a
      guess (76px on a phone, 52 on a computer) for a bar that measures 85
      and 61 in Inter, so every page moved 9px when the measurement landed.
      A bar in the flow has no height to guess: the page under it is where it
      will stay. At the top of a page, in the flow and fixed are the same
      place, so the switch is invisible.
    */
    const measured = barHeight !== undefined
    return (
      <>
        {/* Fixed bar at top of viewport (below header in native apps) */}
        <div
          ref={barRef}
          className={cn(
            "fixed left-0 right-0 w-full py-2.5 px-3 sm:py-3 sm:px-4 subscribe-bar-fixed",
            !measured && "!relative",
            /*
              THE TRANSITION IS ATTACHED ONLY ONCE THE BAR IS WHERE IT BELONGS.

              Coming back to this page the browser restores the scroll — half
              way down, say — and this component mounts fresh. With the
              transition already on, the bar paints across the top, decides it
              should be hidden, and slides away over 300ms. Filmed on
              production that is a black newsletter bar over the grid for a
              third of a second on every single return, which is what was
              reported as a flash in the header.

              `barPlaced` is false for the first moments after mount, so the
              first frame is a placement rather than a movement. Everything
              after it — hiding on the way down, coming back on the way up —
              animates exactly as before.
            */
            barPlaced && "transition-transform duration-300 ease-out",
            stickyZ,
            isDarkBackground ? "subscribe-bar-border-dark" : "subscribe-bar-border",
            !isVisible && settings.enableStickyOnScrollUp && "-translate-y-full"
          )}
          style={{
            top: stickyTop,
            // Always use solid background color (no gradients) on live published pages
            backgroundColor: solidBackgroundColor,
            color: settings.textColor || "#000000",
          }}
        >
          {barContent}
        </div>
        {/*
          =================================================================
           THE SPACER IS THE BAR'S HEIGHT, MEASURED
          =================================================================
          The bar is `fixed`, so the page needs something in the flow the
          same height as it. That something was `h-[76px] sm:h-[52px]` — a
          guess, written once, at a bar whose height depends on which style
          the creator picked, whether the avatar row is on, and how long
          their headline is. Where the guess was too big, and on a phone it
          was, the difference was a strip of page background between the bar
          and the cover photo under it with nothing in it.

          One number, measured once and shared, is the rule this codebase
          already follows for the browser's own bar and for the sheet's peek.
          Before the first measurement there is no spacer at all: the bar is
          in the flow itself (see `measured` above), which is the one height
          that cannot be wrong.
        */}
        {measured && <div aria-hidden className="subscribe-bar-spacer" style={{ height: barHeight }} />}
      </>
    )
  }

  // NON-STICKY: Normal document flow
  return (
    <div
      className={cn(
        "w-full py-2.5 px-3 sm:py-3 sm:px-4",
        isDarkBackground ? "subscribe-bar-border-dark" : "subscribe-bar-border"
      )}
      style={{
        // Always use solid background color (no gradients) on live published pages
        backgroundColor: solidBackgroundColor,
        color: settings.textColor || "#000000",
      }}
    >
      {barContent}
    </div>
  )
}

/** Editor preview version of subscribe bar */
interface EditorSubscribeBarProps {
  settings: SubscribeBarSettings
  creatorId: string
  isEditorPreview?: boolean
  isMobile?: boolean
  isSelected?: boolean
  onSelect?: () => void
  scrollContainerRef?: React.RefObject<HTMLElement | null>
}

/**
 * Extract solid color from gradient or return the color as-is
 * This ensures subscriber bar only uses solid background colors (no gradients)
 */
function extractSolidColor(color: string | undefined): string {
  if (!color) return "#ffffff"

  // If it's a gradient, extract the first color
  if (color.includes("gradient")) {
    // Match hex colors in gradient like "#ffffff" or "#e2e8f0"
    const hexMatch = color.match(/#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}/)
    if (hexMatch) {
      return hexMatch[0]
    }
    // Fallback to white if no hex found
    return "#ffffff"
  }

  return color
}

export function EditorSubscribeBar({ settings, creatorId, isEditorPreview, isMobile, isSelected, onSelect, scrollContainerRef }: EditorSubscribeBarProps) {
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollY = useRef(0)

  // Extract colors from either top level or nested colors object
  // IMPORTANT: Always use solid colors for subscriber bar (no gradients)
  const rawBackgroundColor = settings.backgroundColor || settings.colors?.backgroundColor || "#ffffff"
  const backgroundColor = extractSolidColor(rawBackgroundColor)
  const textColor = settings.textColor || settings.colors?.textColor || "#000000"

  // Hooks must be called before early return to avoid React error #300
  const isDarkBackground = useMemo(() => isDarkHex(backgroundColor), [backgroundColor])
  const hasCustomInputColors = useMemo(() => hasThemeInputColors(settings), [settings.inputTextColor, settings.inputPlaceholderColor, settings.inputBorderColor, settings.inputBackgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, backgroundColor, hasCustomInputColors), [isDarkBackground, backgroundColor, hasCustomInputColors])
  const inputStyle = useMemo(() => getInputStyle(settings), [settings.inputBorderColor, settings.inputTextColor, settings.inputBackgroundColor])
  const placeholderStyleCSS = useMemo(() => getPlaceholderStyle(settings.inputPlaceholderColor), [settings.inputPlaceholderColor])

  /* The editor preview draws the same bar, so it needs the same ground — see
     the note on avatarGround in the live component above. */
  const avatarGround = isDarkBackground ? "bg-white/10" : "bg-black/[0.06]"

  // Scroll up sticky behavior for editor preview
  useEffect(() => {
    if (!settings.enableStickyBar || !settings.enableStickyOnScrollUp) {
      setIsVisible(true)
      return
    }

    const scrollContainer = scrollContainerRef?.current
    if (!scrollContainer) return

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop

      // Show when scrolling up or at top
      if (currentScrollY < lastScrollY.current || currentScrollY < 50) {
        setIsVisible(true)
      } else {
        // Hide when scrolling down
        setIsVisible(false)
      }

      lastScrollY.current = currentScrollY
    }

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
    return () => scrollContainer.removeEventListener("scroll", handleScroll)
  }, [settings.enableStickyBar, settings.enableStickyOnScrollUp, scrollContainerRef])

  // Early return AFTER all hooks have been called
  if (!settings.visible) return null

  const displayText = getDisplayText(settings, settings.creatorName)
  const buttonText = getButtonText(settings, false)

  // Stop propagation to prevent parent onClick from stealing focus
  const handleInteractiveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  // Handle wrapper click for selection (only on non-interactive areas)
  const handleWrapperClick = () => {
    if (onSelect) {
      onSelect()
    }
  }

  /*
    THESE ARE ELEMENTS, NOT COMPONENTS. DO NOT TURN THEM BACK INTO `() => (...)`.

    They used to be declared as arrow components in this render body and
    rendered as `<... />`. A function declared inside a render body is a NEW
    component type on every render, and React reconciles by type — so every
    single re-render of this bar unmounted the whole subtree and mounted a
    fresh one. The avatar's <img> was destroyed and recreated each time, which
    is why the profile picture in the store-builder canvas flashed and
    "glitched randomly when I click things": every click re-renders the canvas.

    Someone had already noticed the symptom and memoised the avatar ELEMENTS
    further up to stop it. That could never work — a memoised element is still
    thrown away when the component it sits inside is remounted.

    As plain values the element type stays `div`, so React updates in place.
  */
  // Mobile layout content
  const mobileContent = (
    <div className="flex flex-col items-center gap-2">
      {/* Custom placeholder color styles */}
      {placeholderStyleCSS && <style dangerouslySetInnerHTML={{ __html: placeholderStyleCSS }} />}

      <div className="flex items-center gap-2 justify-center">
        {settings.showAvatar && (
          <Avatar className={cn("h-6 w-6 shrink-0", avatarGround)}>
            {settings.avatarUrl ? (
              <AvatarImage src={optimizedImageUrl(settings.avatarUrl, 24)} alt={settings.creatorName || ""} />
            ) : null}
            <AvatarFallback delayMs={settings.avatarUrl ? undefined : 0} className={cn("text-[10px]", avatarGround)}><AvatarMark name={(settings.creatorName || "").trim()} size={24} /></AvatarFallback>
          </Avatar>
        )}
        <p className="text-xs font-medium text-center">{displayText}</p>
      </div>

      <div className="flex gap-2 items-center w-full" onClick={handleInteractiveClick}>
        <Input
          type="email"
          placeholder={settings.placeholder || "Enter your email"}
          className={cn(adaptiveInputClass, "h-8 flex-1 text-xs", hasCustomInputColors && "subscribe-input-themed")}
          style={{
            ...inputStyle,
            borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
          }}
        />
        <Button
          size="sm"
          type="button"
          className="shrink-0 h-8 px-3 text-xs"
          style={{
            backgroundColor: settings.buttonColor || "#2563eb",
            color: settings.buttonTextColor || "#ffffff",
            borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
          }}
        >
          {buttonText}
        </Button>
      </div>
    </div>
  )

  // Desktop layout content
  const desktopContent = (
    <>
      {/* Custom placeholder color styles */}
      {placeholderStyleCSS && <style dangerouslySetInnerHTML={{ __html: placeholderStyleCSS }} />}

      <div className="flex sm:hidden flex-col items-center gap-2">
        <div className="flex items-center gap-2 justify-center">
          {settings.showAvatar && (
            <Avatar className={cn("h-6 w-6 shrink-0", avatarGround)}>
              {settings.avatarUrl ? (
                <AvatarImage src={optimizedImageUrl(settings.avatarUrl, 24)} alt={settings.creatorName || ""} />
              ) : null}
              <AvatarFallback delayMs={settings.avatarUrl ? undefined : 0} className={cn("text-[10px]", avatarGround)}><AvatarMark name={(settings.creatorName || "").trim()} size={24} /></AvatarFallback>
            </Avatar>
          )}
          <p className="text-xs font-medium text-center">{displayText}</p>
        </div>

        <div className="flex gap-2 items-center w-full" onClick={handleInteractiveClick}>
          <Input
            type="email"
            placeholder={settings.placeholder || "Enter your email"}
            className={cn(adaptiveInputClass, "h-8 flex-1 text-xs", hasCustomInputColors && "subscribe-input-themed")}
            style={{
              ...inputStyle,
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          />
          <Button
            size="sm"
            type="button"
            className="shrink-0 h-8 px-3 text-xs"
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonText}
          </Button>
        </div>
      </div>

      <div className="hidden sm:flex items-center justify-between gap-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 shrink-0">
          {settings.showAvatar && (
            <Avatar className={cn("h-8 w-8 shrink-0", avatarGround)}>
              {settings.avatarUrl ? (
                <AvatarImage src={optimizedImageUrl(settings.avatarUrl, 32)} alt={settings.creatorName || ""} />
              ) : null}
              <AvatarFallback delayMs={settings.avatarUrl ? undefined : 0} className={cn("text-xs", avatarGround)}><AvatarMark name={(settings.creatorName || "").trim()} size={32} /></AvatarFallback>
            </Avatar>
          )}
          <p className="text-sm font-medium">{displayText}</p>
        </div>

        <div className="flex gap-2 items-center" onClick={handleInteractiveClick}>
          <Input
            type="email"
            placeholder={settings.placeholder || "Enter your email"}
            className={cn(adaptiveInputClass, "h-9 w-48 text-sm", hasCustomInputColors && "subscribe-input-themed")}
            style={{
              ...inputStyle,
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          />
          <Button
            size="sm"
            type="button"
            className="shrink-0 h-9 px-4"
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonText}
          </Button>
        </div>
      </div>
    </>
  )

  // CSS sticky works when parent scrolls
  return (
    <div
      onClick={handleWrapperClick}
      className={cn(
        "w-full py-2.5 px-3 sm:py-3 sm:px-4 transition-all duration-300 ease-out",
        settings.enableStickyBar && "sticky top-0 z-20",
        settings.enableStickyBar && settings.enableStickyOnScrollUp && !isVisible && "-translate-y-full opacity-0",
        onSelect && "cursor-pointer",
        isSelected && "ring-2 ring-purple-500 ring-inset",
        isDarkBackground ? "subscribe-bar-border-dark" : "subscribe-bar-border",
      )}
      style={{
        // Always use solid backgroundColor - gradients are converted to solid colors
        backgroundColor: backgroundColor,
        color: textColor,
      }}
    >
      {isMobile ? mobileContent : desktopContent}
    </div>
  )
}
