"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toggleAppRail, type RailState } from "@/lib/ui/app-rail"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  THE SIDEBAR'S COLLAPSE CONTROL (round 29)
 * ===========================================================================
 * The owner: the full "Collapse" button under Settings should be an icon,
 * somewhere better, out of the way of the rows. It is a 30px icon in the
 * sidebar's top corner now (components/app/sidebar-desktop-nav), lined up
 * with the rows' chevrons while the sidebar is open. It is anchored to the
 * sidebar's right edge, so it travels with that edge as the sidebar closes
 * and ends over the column of icons (the last few pixels are a transform,
 * app/globals.css), never jumping between two places.
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

/** The sidebar drawn as a panel with its divider on the left, at the rail's 1.5 stroke. */
function PanelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 11C2 7.22876 2 5.34315 3.17157 4.17157C4.34315 3 6.22876 3 10 3H14C17.7712 3 19.6569 3 20.8284 4.17157C22 5.34315 22 7.22876 22 11V13C22 16.7712 22 18.6569 20.8284 19.8284C19.6569 21 17.7712 21 14 21H10C6.22876 21 4.34315 21 3.17157 19.8284C2 18.6569 2 16.7712 2 13V11Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M9 21L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function RailToggle() {
  const [state, setState] = useState<RailState>("open")
  const [mac, setMac] = useState<boolean | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
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
          if (e.pointerType === "mouse") show(SHOW_AFTER_MS)
        }}
        onPointerLeave={hide}
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
        className="absolute right-[12px] top-[8px] flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[#8a8a8a] outline-none transition-[background-color,color] duration-[140ms] ease-out hover:bg-[#f3f3f3] hover:text-[#333333] active:bg-[#e8e8e8] focus-visible:ring-2 focus-visible:ring-neutral-300 [-webkit-tap-highlight-color:transparent]"
      >
        <PanelIcon />
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
