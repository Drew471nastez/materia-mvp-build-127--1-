"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, X } from "lucide-react"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * The one edge-anchored drawer the mobile web header uses for both its panels —
 * the hamburger menu on the left and the account menu on the right.
 *
 * Everything here exists because a drawer is judged almost entirely on the two
 * seconds it is moving:
 *
 *  • Only `transform` and `opacity` are animated. Both are composited off the
 *    main thread, so the slide holds its frame rate even while the page behind
 *    is still hydrating or fetching — which is exactly when the drawer is most
 *    likely to be opened.
 *  • The panel stays mounted through the closing transition and only leaves the
 *    tree once it has finished travelling. Unmounting on `open === false` is the
 *    single most common way a drawer ends up vanishing instead of closing, and
 *    that one detail is what makes the whole thing read as cheap.
 *  • It renders through a portal into <body>. Anywhere up the tree a transform,
 *    a filter or an `overflow: clip` would re-parent a fixed element or crop it,
 *    and the marketing layout has both a transformed header and a clipped <main>.
 */

const OPEN_MS = 300
const CLOSE_MS = 260
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export type SideDrawerProps = {
  open: boolean
  onClose: () => void
  /** Which edge it is anchored to, and therefore which way it travels. */
  side: "left" | "right"
  /** Accessible name — an unnamed dialog is announced as nothing but "dialog". */
  label: string
  /** Sits in the top row alongside the close button. */
  header?: React.ReactNode
  children: React.ReactNode
}

export function SideDrawer({ open, onClose, side, label, header, children }: SideDrawerProps) {
  const pathname = usePathname()

  // `mounted` outlives `open` by the length of the close animation; `shown` is
  // the flag the transform reads, so the two together give a real open AND a
  // real close rather than an instant disappearance.
  const [mounted, setMounted] = useState(false)
  const [shown, setShown] = useState(false)
  const [host, setHost] = useState<HTMLElement | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  // Whatever had focus when the drawer opened — almost always the trigger, which
  // is where focus has to land again or a keyboard user is dropped at the top of
  // the document with no idea what just happened.
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const everOpenedRef = useRef(false)
  const reducedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  // Its own node rather than <body> itself, so the aria-hidden sweep below has
  // something to recognise and skip.
  useEffect(() => {
    const el = document.createElement("div")
    el.setAttribute("data-side-drawer-host", "")
    document.body.appendChild(el)
    setHost(el)
    return () => {
      el.remove()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    // Read the preference at open time, not at module load — a user can change
    // it between page load and the first tap.
    reducedRef.current =
      typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    returnFocusRef.current = (document.activeElement as HTMLElement | null) ?? null
    everOpenedRef.current = true
    setMounted(true)
    void triggerHaptic("light")
  }, [open])

  // Two frames, not one: the panel has to be painted at its off-screen transform
  // before the on-screen transform is applied, or the browser collapses both into
  // a single style computation and the drawer simply appears in place.
  useEffect(() => {
    if (!open || !mounted || !host) return
    if (reducedRef.current) {
      setShown(true)
      return
    }
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [open, mounted, host])

  useEffect(() => {
    if (open || !everOpenedRef.current) return
    setShown(false)
    const timer = window.setTimeout(
      () => {
        setMounted(false)
        returnFocusRef.current?.focus?.({ preventScroll: true })
      },
      reducedRef.current ? 0 : CLOSE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [open])

  // The page behind a modal is not there as far as assistive tech is concerned.
  // Every top-level sibling is marked instead of one known wrapper because the
  // App Router puts several unrelated nodes directly under <body>.
  useEffect(() => {
    if (!mounted || !host) return
    const marked: Element[] = []
    for (const el of Array.from(document.body.children)) {
      if (el === host || el.hasAttribute("aria-hidden")) continue
      el.setAttribute("aria-hidden", "true")
      marked.push(el)
    }
    return () => marked.forEach((el) => el.removeAttribute("aria-hidden"))
  }, [mounted, host])

  // Tied to `open` rather than to `mounted`, so the lock is gone the instant a
  // drawer link is tapped instead of a quarter-second later, mid-navigation,
  // while the router is trying to set the new page's scroll position. Nothing
  // moves on screen when it releases — a fixed body with a negative top renders
  // at exactly the offset it is restored to — so the close animation is
  // unaffected by letting go this early.
  useEffect(() => {
    if (!open) return
    const body = document.body
    const y = window.scrollY
    const lockedPath = pathnameRef.current
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    // Fixing the body is the only lock iOS Safari actually honours; `overflow:
    // hidden` alone still rubber-bands the page behind the drawer.
    body.style.position = "fixed"
    body.style.top = `-${y}px`
    body.style.left = "0"
    body.style.right = "0"
    body.style.width = "100%"
    body.style.overflow = "hidden"
    return () => {
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.left = previous.left
      body.style.right = previous.right
      body.style.width = previous.width
      body.style.overflow = previous.overflow
      // Only put the page back where it was if it is still the same page. After
      // a navigation the router has already chosen where the new page starts,
      // and restoring the old offset would drop the visitor part-way down
      // something they have not seen yet.
      if (pathnameRef.current === lockedPath) window.scrollTo(0, y)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  // A drawer that survives the navigation it just started is a drawer sitting
  // over the page the user asked for. This also fires once on mount, which is a
  // no-op against an already-closed drawer.
  useEffect(() => {
    onCloseRef.current()
  }, [pathname])

  useEffect(() => {
    if (!open || !mounted) return
    const panel = panelRef.current
    if (!panel) return
    const target = panel.querySelector<HTMLElement>("[data-drawer-autofocus]") ?? panel
    target.focus({ preventScroll: true })
  }, [open, mounted])

  // aria-modal is a promise to the user that Tab cannot walk out the back of the
  // dialog; browsers do not enforce it, so it is enforced here.
  const onPanelKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return
    const panel = panelRef.current
    if (!panel) return
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  if (!mounted || !host) return null

  const reduced = reducedRef.current
  const duration = shown ? OPEN_MS : CLOSE_MS
  const offscreen = side === "left" ? "translateX(-100%)" : "translateX(100%)"

  return createPortal(
    <div className="fixed inset-0 z-[200] md:hidden">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/45"
        style={{
          opacity: shown ? 1 : 0,
          transition: reduced ? undefined : `opacity ${duration}ms ${EASE}`,
          willChange: "opacity",
        }}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
        className={cn(
          "absolute inset-y-0 flex w-[86%] max-w-[360px] flex-col bg-white shadow-[0_0_60px_rgba(0,0,0,0.28)] outline-none",
          side === "left" ? "left-0" : "right-0",
        )}
        style={{
          transform: reduced ? undefined : shown ? "translateX(0)" : offscreen,
          opacity: reduced && !shown ? 0 : 1,
          transition: reduced ? undefined : `transform ${duration}ms ${EASE}`,
          willChange: "transform",
          // The drawer runs the full height of the screen, so on a notched phone
          // it owns both the status-bar strip and the home-indicator strip.
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-3 px-4 pb-2 pt-3",
            side === "right" && "flex-row-reverse",
          )}
        >
          <div className="min-w-0 flex-1">{header}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-700 transition-transform active:scale-[0.97]"
          >
            <X className="h-[22px] w-[22px]" strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    host,
  )
}

/**
 * A section heading inside a drawer. Quiet on purpose — it is a label for the
 * rows underneath it, not a thing to read on the way past.
 */
export function DrawerSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.09em] text-neutral-400">
      {children}
    </div>
  )
}

/**
 * One row of a drawer list.
 *
 * `soon` renders the row muted and inert instead of dropping it. A destination
 * we have not built yet is still information — leaving the row out makes the
 * menu look like it is missing things, and wiring it to a href that 404s is
 * worse than saying so.
 */
export function DrawerRow({
  href,
  label,
  icon,
  soon = false,
  onNavigate,
}: {
  href?: string
  label: string
  icon?: React.ReactNode
  soon?: boolean
  onNavigate?: () => void
}) {
  const body = (
    <>
      {icon ? <span className="shrink-0 text-neutral-400">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {soon ? (
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          În curând
        </span>
      ) : (
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-neutral-300" />
      )}
    </>
  )

  if (soon || !href) {
    return (
      <div
        aria-disabled="true"
        className="flex items-center gap-3 px-5 py-3.5 text-[15px] font-medium text-neutral-400"
      >
        {body}
      </div>
    )
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 px-5 py-3.5 text-[15px] font-medium text-neutral-900 transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-neutral-100"
    >
      {body}
    </Link>
  )
}
