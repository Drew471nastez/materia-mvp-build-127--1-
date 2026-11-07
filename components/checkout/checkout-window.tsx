"use client"
import {useAvatarImage} from "@/lib/account/avatar-image"
import { FramedPicture, shownRatio, useLetterbox } from "@/components/ui/framed-picture"

/**
 * ===========================================================================
 *  THE CHECKOUT WINDOW: ONE FRAME FOR THE COMMUNITY AND THE ONEPAGE
 * ===========================================================================
 * The community's "All plans" checkout (components/community/public/join-flow
 * CommunityCheckout) is a centred window over the dimmed page on a computer
 * and a page of its own with an X on a phone: a grey head with the seller's
 * mark and name, a scrolling body, and "Powered by Stripe · Terms · Privacy"
 * at its foot. Round 10 asked for exactly that window on the OnePage, for a
 * download or a course bought without leaving the page
 * (components/checkout/instant-checkout.tsx). So the frame is here, once, and
 * both draw their own body inside it. Nothing about the community's changed:
 * the same classes, the same motion, the same ways out.
 *
 * DARK. Inside a community set dark, app/theme-dark.css redraws every class
 * here through [data-community-theme="dark"]. A OnePage on a dark ground asks
 * for the same (`dark`), so the window is the community's dark one.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { PoweredByStripe } from "@/app/(storelib)/checkout/parts/ui"
import { holdPage } from "@/lib/onepage/page-hold"

/**
 * The page under the window stops scrolling and keeps its width (round 43,
 * lib/onepage/page-hold): it set `overflow: hidden` on <html> alone, which
 * took the scrollbar away, so on a computer the page behind jumped sideways
 * by the bar's width as the window opened and back as it closed.
 */
export function useBodyLock(on: boolean) {
  React.useEffect(() => {
    if (!on) return
    return holdPage()
  }, [on])
}

/**
 * Round AG: a close that is seen. The overlay fades and drops a few px over EXIT_MS, then goes; a second press while it
 * leaves does nothing. Opening is just as short (150ms), so the picker feels quick rather than slow.
 */
export const EXIT_MS = 140
export function useExit(onClose: () => void): [boolean, () => void] {
  const [leaving, setLeaving] = React.useState(false)
  const ref = React.useRef(onClose)
  ref.current = onClose
  const close = React.useCallback(() => {
    setLeaving((was) => {
      if (!was) {
        const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        window.setTimeout(() => ref.current(), reduced ? 0 : EXIT_MS)
      }
      return true
    })
  }, [])
  return [leaving, close]
}

export function useEscape(onClose: () => void) {
  const ref = React.useRef(onClose)
  ref.current = onClose
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      /* Not an Escape a menu or a field inside already used (Radix marks it), nor one that ends an IME word. */
      if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing) ref.current()
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])
}

/** The seller's mark: their picture, or the first letter of their name on ink. */
export function CheckoutMark({ imageUrl, name, size }: { imageUrl?: string | null; name: string; size: number }) {
  const image=useAvatarImage(imageUrl ? optimizedImageUrl(imageUrl,size*2)??imageUrl : null)
  return image.src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image.src} onError={image.onError} alt="" width={size} height={size} className="shrink-0 rounded-[10px] object-cover shadow-[0_0_0_1px_rgba(17,17,19,0.06)]" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-[10px] bg-[#1a1a2e] text-[15px] font-semibold text-white" style={{ width: size, height: size }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/**
 * THE PRODUCT IN THE HEAD (round AK). The picture of what is being bought, never the seller's: its own shape within
 * 3:4 and 4:3 at a fixed height, so a portrait ebook cover shows whole and a wide one is not a sliver, filled with
 * no bars (the editor's grey padding is cut off, components/ui/framed-picture). `sources` are tried in order when
 * one fails to load; with none left, the product's first letter.
 */
export function CheckoutProductMark({ sources, name, height = 76 }: { sources: (string | null | undefined)[]; name: string; height?: number }) {
  const key = sources.filter((s): s is string => typeof s === "string" && !!s.trim()).join("\n")
  const list = React.useMemo(() => [...new Set(key ? key.split("\n") : [])], [key])
  const [failed, setFailed] = React.useState(0)
  React.useEffect(() => setFailed(0), [key])
  const src = list[failed] ?? null
  const shape = useLetterbox(src)
  const own = shownRatio(shape)
  const ratio = Math.min(4 / 3, Math.max(3 / 4, own ?? 1))
  if (!src) {
    return (
      <span aria-hidden className="grid shrink-0 place-items-center rounded-[12px] bg-[#1a1a2e] text-[22px] font-semibold text-white" style={{ width: height, height }} data-checkout-product-mark="">
        {name.slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return (
    <FramedPicture
      key={src}
      src={src}
      displaySrc={optimizedImageUrl(src, 128) ?? src}
      frame={ratio}
      shape={shape}
      focus={{ x: 0.5, y: 0.4 }}
      className="shrink-0 rounded-[12px] bg-[#eef0f2] shadow-[0_0_0_1px_rgba(17,17,19,0.06)] motion-safe:transition-[width] motion-safe:duration-200"
      style={{ width: Math.round(height * ratio), height }}
      imgProps={{ width: Math.round(height * ratio), height, decoding: "async", onError: () => setFailed((n) => n + 1) }}
    />
  )
}

/**
 * FOCUS STAYS IN THE TOP WINDOW (round AK). The window takes focus when it opens, Tab and Shift+Tab go round its own
 * controls, and on close focus goes back to `returnFocus` (the control that started the purchase), or to whatever
 * had it before, when that is still on the page and not hidden.
 */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])'

function useFocusTrap(panel: React.RefObject<HTMLElement | null>, mounted: boolean, returnFocus?: () => HTMLElement | null) {
  const back = React.useRef(returnFocus)
  back.current = returnFocus
  React.useEffect(() => {
    if (!mounted) return
    const el = panel.current
    if (!el) return
    const before = document.activeElement as HTMLElement | null
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.getClientRects().length > 0 && !n.closest("[inert]"))
      if (!items.length) {
        e.preventDefault()
        el.focus({ preventScroll: true })
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const now = document.activeElement
      if (!el.contains(now)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus({ preventScroll: true })
      } else if (e.shiftKey && (now === first || now === el)) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && now === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    /* Only the Tab key is held: a card check Stripe opens in its own frame over the page keeps the focus it takes. */
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      const to = back.current?.() ?? before
      const usable = (n: HTMLElement | null) => !!n && n.isConnected && n !== document.body && n.getClientRects().length > 0 && !n.closest("[inert],[aria-hidden=true]")
      if (usable(to)) to!.focus({ preventScroll: true })
    }
  }, [mounted, panel])
}

export function CloseButton({ onClose, label = "Close" }: { onClose: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClose} aria-label={label} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#4b5563] outline-none transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30" data-join-close="">
      <X aria-hidden className="h-5 w-5" />
    </button>
  )
}

export interface CheckoutWindowProps {
  /** The seller's mark in the head (CheckoutMark). */
  mark: React.ReactNode
  /** The name under it, the window's own title. */
  title: string
  /** A line under the name: the plan, the product. */
  subtitle?: React.ReactNode
  /** The head's left button ("All plans"), when there is somewhere to go back to. */
  onBack?: (() => void) | null
  backLabel?: string
  onClose: () => void
  /** A payment on its way: no way out until it has answered. */
  busy?: boolean
  /** The window drawn dark (app/theme-dark.css, as a community set dark). */
  dark?: boolean
  /**
   * Round 40: drawn in the OnePage's own colours instead (the .op-sheet rules in app/globals.css, the variables
   * from lib/onepage/sheet-theme). Takes the place of `dark`, which would paint over it.
   */
  themed?: boolean
  /** For tests and probes: data-<name>="" on the window's layer. */
  dataName?: string
  /** Where focus goes when the window closes (the control that started the purchase); otherwise where it was. */
  returnFocus?: () => HTMLElement | null
  labelId: string
  children: React.ReactNode
}

export function CheckoutWindow({ mark, title, subtitle, onBack, backLabel = "All plans", onClose, busy = false, dark = false, themed = false, dataName = "community-checkout", labelId, returnFocus, children }: CheckoutWindowProps) {
  useBodyLock(true)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const panel = React.useRef<HTMLDivElement>(null)
  useFocusTrap(panel, mounted, returnFocus)
  const [leaving, closeAnimated] = useExit(onClose)
  const closeIfIdle = React.useCallback(() => {
    if (!busy) closeAnimated()
  }, [busy, closeAnimated])
  useEscape(closeIfIdle)

  if (!mounted) return null
  return createPortal(
    <div className={cn("fixed inset-0 z-[130] flex items-stretch justify-center sm:items-center sm:p-6", themed && "op-sheet")} {...{ [`data-${dataName}`]: "" }} data-community-theme={dark && !themed ? "dark" : undefined} data-leaving={leaving ? "" : undefined}>
      <div aria-hidden className={cn("absolute inset-0 hidden bg-[#0b0b12]/55 animate-in fade-in duration-150 transition-opacity sm:block motion-reduce:animate-none", leaving && "opacity-0 duration-[140ms]")} onClick={closeIfIdle} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full flex-col overflow-hidden bg-white outline-none animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out transition-[opacity,translate] motion-reduce:animate-none sm:h-auto sm:max-h-[min(94vh,900px)] sm:max-w-[520px] sm:rounded-[20px] sm:shadow-[0_24px_64px_-12px_rgba(16,24,40,0.35)]",
          leaving && "translate-y-2 opacity-0 duration-[140ms] ease-in",
        )}
      >
        <div className="relative shrink-0 border-b border-[#eef0f2] bg-[#f8f9fa] px-5 pb-5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:rounded-t-[20px] sm:px-8 sm:pt-4" data-checkout-head="">
          <div className="flex items-center justify-between">
            {onBack ? (
              <button type="button" onClick={onBack} className="-ml-2 inline-flex h-10 items-center rounded-full px-2.5 text-[13.5px] font-medium text-[#4b5563] hover:bg-black/[0.04]" data-checkout-back="">
                {backLabel}
              </button>
            ) : (
              <span />
            )}
            <span className="-mr-2">
              <CloseButton onClose={closeIfIdle} />
            </span>
          </div>
          <div className="-mt-3 flex flex-col items-center text-center">
            {mark}
            <h2 id={labelId} className="mt-2.5 text-[21px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{subtitle}</p> : null}
          </div>
        </div>
        <div className="op-subtle-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-8 sm:pb-6">
          {children}
          <PoweredByStripe />
        </div>
      </div>
    </div>,
    document.body,
  )
}
