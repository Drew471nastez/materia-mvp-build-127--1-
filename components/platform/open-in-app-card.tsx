"use client"

/**
 * ===========================================================================
 *  A LINK SHARED THROUGH INSTAGRAM OR WHATSAPP OPENS THE APP
 * ===========================================================================
 * Instagram, WhatsApp, TikTok, Facebook, Messenger, Snapchat, LinkedIn, X,
 * Telegram and Line all open a link in a web view of their own, and a web
 * view honours neither a Universal Link nor an App Link. So a link shared to
 * Instagram showed the page inside Instagram's browser with the app sitting
 * unused on the same phone. This is the one thing that gets out of there:
 * the app's own scheme, which hands over on a tap from inside almost every
 * one of them, with the store after STORE_FALLBACK_MS when nothing answers.
 *
 * IT NEVER BLOCKS THE PAGE. A short card at the foot of the screen, the
 * page's own content reading on behind it, and "Keep reading here" puts it
 * away for OPEN_CARD_QUIET_DAYS. No dimming, no sheet, nothing to dismiss
 * before reading.
 *
 * ONE TAP, NOT AN AUTOMATIC JUMP, UNLESS THE APP IS KNOWN TO BE THERE. An
 * automatic navigation to a scheme nothing answers shows the person a system
 * error ("the address is invalid") in several in-app browsers, so it happens
 * only where that cannot happen: APP_SEEN_COOKIE, which the app's own web
 * view sets on every page it loads, is proof the app is on this phone and in
 * this cookie store. Without it the person taps, by design. Please do not
 * "fix" that into an automatic jump: it would show an error to everybody who
 * has not installed the app, which is most people who see this card.
 *
 * WHO DECIDES. app/api/app-links/in-app-browser, because Android names the
 * hosting app in the `x-requested-with` request header and only the server
 * sees request headers. This asks only when the user agent already looks
 * like a web view, so a page in Safari or Chrome makes no request.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import {
  OPEN_CARD_COOKIE,
  OPEN_CARD_KEY,
  OPEN_CARD_QUIET_DAYS,
  STORE_FALLBACK_MS,
  type HandoffCard,
  inAppBrowser,
  isOurApp,
} from "@/lib/platform/open-in-app"

/** How long after the page settles the card rises in, so nothing moves under a reading eye. */
export const CARD_DELAY_MS = 700

/** The line under the hand off, once the app has had its chance and did not answer. */
export const NOT_THERE_LINE = "Install Storelib, then tap the link again."
/** The same moment on an iPhone with no App Store id configured: say what to do rather than follow a broken address. */
export const NO_STORE_LINE = "Not installed. Find Storelib in the App Store."

function quietAlready(): boolean {
  try {
    const at = Number(localStorage.getItem(OPEN_CARD_KEY) || 0)
    if (at > 0 && Date.now() - at < OPEN_CARD_QUIET_DAYS * 24 * 60 * 60 * 1000) return true
  } catch {
    /* no storage: the cookie below is the other half of the answer */
  }
  return typeof document !== "undefined" && new RegExp(`(?:^|; )${OPEN_CARD_COOKIE}=closed`).test(document.cookie)
}

/**
 * The card itself, given everything it needs. Separate from the asking so
 * scripts/check-open-in-app.mjs can draw it with fixture props.
 */
export function OpenInAppCardView({ card, shown = true, onQuiet }: { card: HandoffCard; shown?: boolean; onQuiet?: () => void }) {
  const [said, setSaid] = useState<string | null>(null)
  const timer = useRef(0)
  const going = useRef(false)

  /* Leaving the page never leaves a timer armed. */
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const open = useCallback(() => {
    if (going.current) return
    going.current = true
    setSaid(null)
    const stop = () => {
      if (document.visibilityState === "hidden") {
        /* The app took the page: nothing of ours runs after this. */
        window.clearTimeout(timer.current)
        going.current = false
      }
    }
    document.addEventListener("visibilitychange", stop, { once: true })
    window.addEventListener("pagehide", () => window.clearTimeout(timer.current), { once: true })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      document.removeEventListener("visibilitychange", stop)
      going.current = false
      if (document.visibilityState !== "visible") return
      setSaid(card.store ? NOT_THERE_LINE : NO_STORE_LINE)
      if (card.store) window.location.href = card.store
    }, STORE_FALLBACK_MS)
    window.location.href = card.scheme
  }, [card.scheme, card.store])

  /*
    THE ATTEMPT WITH NO TAP, where the app is known to be installed and the
    system error cannot happen. Once per mount, and the card still shows
    itself so a hand off that does nothing leaves something to press.
  */
  const tried = useRef(false)
  useEffect(() => {
    if (!card.auto || tried.current) return
    tried.current = true
    open()
  }, [card.auto, open])

  const quiet = () => {
    try {
      localStorage.setItem(OPEN_CARD_KEY, String(Date.now()))
    } catch {
      /* hidden for this visit only */
    }
    try {
      document.cookie = `${OPEN_CARD_COOKIE}=closed; path=/; max-age=${OPEN_CARD_QUIET_DAYS * 24 * 60 * 60}; samesite=lax`
    } catch {
      /* same */
    }
    onQuiet?.()
  }

  return (
    <div
      data-open-app-card={card.phone}
      data-open-app-card-browser={card.browser}
      data-state={shown ? "shown" : "hidden"}
      className="pointer-events-none fixed inset-x-0 z-[71] flex justify-center px-4 [html.capacitor_&]:hidden"
      style={{ bottom: "max(calc(12px + env(safe-area-inset-bottom)), calc(var(--buyer-tabs-h, 0px) + 10px))" }}
    >
      <div
        className="pointer-events-auto w-full max-w-[400px] rounded-2xl bg-white transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none shadow-[0_0_0_1px_rgba(17,24,39,0.07),0_1px_3px_rgba(16,24,40,0.05),0_12px_32px_-12px_rgba(17,24,39,0.22)]"
        style={{ opacity: shown ? 1 : 0, translate: shown ? "0 0" : "0 14px" }}
        aria-hidden={!shown}
      >
        <div className="flex items-center gap-3 px-3 pb-2.5 pt-3">
          <StorelibLogo size={40} alt="" className="block h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-[18px] text-[#1a1a2e]">Open this page in Storelib</p>
            <p data-open-app-card-line="" className="text-[12.5px] leading-[16px] text-[#6b7280]">
              {said ?? card.line}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 pb-3">
          <button
            type="button"
            onClick={open}
            data-open-app-card-open=""
            tabIndex={shown ? 0 : -1}
            className="h-11 flex-1 rounded-xl bg-[#1a1a2e] text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] transition-[scale,background-color] duration-100 active:scale-[0.97] active:bg-[#12121f] [-webkit-tap-highlight-color:transparent]"
          >
            Open
          </button>
          <button
            type="button"
            onClick={quiet}
            data-open-app-card-quiet=""
            tabIndex={shown ? 0 : -1}
            className="h-11 shrink-0 rounded-xl px-3 text-[13px] font-medium text-[#6b7280] transition-colors duration-100 active:bg-[#f3f4f6] active:text-[#4b5563] [-webkit-tap-highlight-color:transparent]"
          >
            Keep reading here
          </button>
        </div>
      </div>
    </div>
  )
}

/** Mounted once by the root layout: it asks, and draws nothing anywhere else. */
export function OpenInAppCard() {
  const pathname = usePathname() || "/"
  const [card, setCard] = useState<HandoffCard | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent || ""
    const bridge = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    /*
      NOT isNativeApp() HERE. Its Android rule is "a web view", and every
      in-app web view is one, so it would hide this card from everybody
      inside Instagram or WhatsApp on Android. isOurApp asks the bridge and
      the appended user agent instead, and the route refuses our own package
      in `x-requested-with` before answering.
    */
    if (isOurApp(ua, !!bridge?.isNativePlatform?.()) || quietAlready()) return
    /* Only a web view is asked about: Safari and Chrome make no request. */
    if (!inAppBrowser(ua, null)) return
    let gone = false
    let rise = 0
    const url = `/api/app-links/in-app-browser?path=${encodeURIComponent(`${pathname}${window.location.search}`)}`
    fetch(url, { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ card: HandoffCard | null }>) : null))
      .then((body) => {
        if (gone || !body?.card) return
        setCard(body.card)
        rise = window.setTimeout(() => setShown(true), CARD_DELAY_MS)
      })
      .catch(() => {
        /* Offline, or a route that answered badly: the page reads on as it is. */
      })
    return () => {
      gone = true
      window.clearTimeout(rise)
    }
  }, [pathname])

  if (!card) return null
  return (
    <OpenInAppCardView
      card={card}
      shown={shown}
      onQuiet={() => {
        setShown(false)
        window.setTimeout(() => setCard(null), 280)
      }}
    />
  )
}
