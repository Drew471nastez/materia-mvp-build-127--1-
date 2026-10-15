"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { toggleAppRail, type RailState } from "@/lib/ui/app-rail"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  THE SIDEBAR'S COLLAPSE CONTROL (round 31)
 * ===========================================================================
 * Round 29 put it in a band above Dashboard; round 30 made it a round handle
 * on the sidebar's border that only showed while the pointer was over the
 * sidebar. The owner, on that: "I don't like the collapsible one that
 * appears on hover. Put the collapse toggle above the 'Upgrade to Pro' card
 * in the sidebar, as a line/row. It must not be a hover thing: just an icon
 * like Shopify has, always visible, I click it to collapse and click again
 * to expand."
 *
 * So it is a row now, at the foot of the sidebar directly above the Upgrade
 * card (components/app/sidebar-desktop-nav), drawn the way every other row
 * there is drawn: the same 38px height, 14px padding, 20px icon, grey and
 * hover background, which the caller hands in so there is one palette. Its
 * icon is a panel with its left side marked off, the way Shopify draws
 * theirs, and it never moves sideways: 31px from the sidebar's left, open
 * and collapsed, like every other icon. "Collapse" beside it while the
 * sidebar is open; collapsed, the word fades with the other labels, the card
 * folds away under it, and the icon stays where it is, above Settings.
 *
 * Under the pointer, after a short wait, a small tooltip says what it does
 * and its shortcut: ⌘B on a Mac, Ctrl+B elsewhere, read from the platform
 * and never from the user agent string. The shortcut works anywhere in /app
 * except while typing (lib/ui/app-rail).
 */

const SHOW_AFTER_MS = 350

/** A Mac, an iPad or an iPhone with a keyboard: ⌘. Everything else: Ctrl. */
function macLike(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform || nav.platform || ""
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** Typing somewhere: the keys are the text's, not the sidebar's. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== "string") return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest?.("[contenteditable=''], [contenteditable='true']")
}

/** A panel with its left side marked off: the sidebar, in Shopify's way of drawing it. Stroked at the rows' weight. */
function PanelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 4.5V19.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function RailToggle({
  rowClassName,
  paint,
}: {
  /** The rows' own geometry (sidebar-desktop-nav's ROW). */
  rowClassName: string
  /** The rows' own colours for a row that is not the page you are on, resting or hovered. */
  paint: (hovered: boolean) => CSSProperties
}) {
  const [state, setState] = useState<RailState>("open")
  const [mac, setMac] = useState<boolean | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const [hovered, setHovered] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const wait = useRef<number | undefined>(undefined)

  useEffect(() => {
    const isMac = macLike()
    setMac(isMac)
    const root = document.querySelector<HTMLElement>("[data-app-rail]")
    if (root?.getAttribute("data-app-rail") === "collapsed") setState("collapsed")
    const onChange = (e: Event) => {
      setState((e as CustomEvent<RailState>).detail)
      window.clearTimeout(wait.current)
      setTip(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey || e.key.toLowerCase() !== "b") return
      /* ⌘ on a Mac, Ctrl everywhere else, and not both. */
      if (isMac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return
      if (typingIn(e.target) || typingIn(document.activeElement)) return
      e.preventDefault()
      toggleAppRail()
    }
    window.addEventListener("storelib:app-rail", onChange)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("storelib:app-rail", onChange)
      window.removeEventListener("keydown", onKey)
      window.clearTimeout(wait.current)
    }
  }, [])

  const place = () => {
    const r = button.current?.getBoundingClientRect()
    /* Beside the icon while the sidebar is a column of icons, beside the sidebar while it is open. */
    if (r) setTip({ x: Math.round(r.right + 8), y: Math.round(r.top + r.height / 2) })
  }
  const show = (after: number) => {
    window.clearTimeout(wait.current)
    wait.current = window.setTimeout(place, after)
  }
  const hide = () => {
    window.clearTimeout(wait.current)
    setTip(null)
  }

  const open = state === "open"
  const label = open ? tt("Collapse sidebar") : tt("Expand sidebar")
  /* The key as the keyboard prints it: Strg on a German one. */
  const keys = mac === null ? null : mac ? ["⌘", "B"] : [tt("Ctrl"), "B"]

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => {
          hide()
          toggleAppRail()
        }}
        onPointerEnter={(e) => {
          setHovered(true)
          if (e.pointerType === "mouse") show(SHOW_AFTER_MS)
        }}
        onPointerLeave={() => {
          setHovered(false)
          hide()
        }}
        onPointerDown={hide}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show(0)
        }}
        onBlur={hide}
        onKeyDown={(e) => {
          if (e.key === "Escape") hide()
        }}
        aria-label={label}
        aria-expanded={open}
        aria-controls="app-rail"
        aria-keyshortcuts={mac === null ? undefined : mac ? "Meta+B" : "Control+B"}
        data-rail-toggle=""
        className={`${rowClassName} outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 [-webkit-tap-highlight-color:transparent]`}
        /* Its box-shadow is the focus ring's: a row that is never the page you are on has no depth to give it. */
        style={{ ...paint(hovered), boxShadow: undefined }}
      >
        <span data-nav-icon="outline" className="relative flex h-5 w-5 min-w-5 shrink-0 items-center justify-center">
          <PanelIcon />
        </span>
        <span data-nav-label="" className="whitespace-nowrap">{tt("Collapse")}</span>
      </button>
      {tip && keys
        ? createPortal(
            <div
              role="tooltip"
              data-rail-tip=""
              className="rail-tip-in pointer-events-none fixed z-[70] flex items-center gap-2 whitespace-nowrap rounded-[8px] bg-[#1a1a2e] py-[5px] pl-2.5 pr-[5px] font-sans text-[12px] font-medium leading-[18px] text-white shadow-[0_6px_16px_-6px_rgba(16,24,40,0.35)]"
              style={{ left: tip.x, top: tip.y }}
            >
              <span>{label}</span>
              <span className="flex items-center gap-[3px]">
                {keys.map((k) => (
                  <kbd key={k} className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-white/[0.14] px-1 font-sans text-[11px] font-medium leading-none text-white/85">
                    {k}
                  </kbd>
                ))}
              </span>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
