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
 * somewhere better, out of the way of the rows. Round 29 put it in a 40px
 * band above Dashboard, and the owner did not like the empty space that
 * made: "another solution, more smooth, subtle, clean".
 *
 * ROUND 30, A HANDLE ON THE EDGE. A 24px round button centred on the
 * sidebar's border, level with Dashboard, the way Atlassian's products and
 * Shopify's admin keep theirs. It takes no room from the rows at all. It
 * shows while the pointer is anywhere over the sidebar and on keyboard
 * focus, stays on a touch screen, and otherwise is out of sight and lets
 * clicks through to the page under it (app/globals.css). It is a child of
 * the sidebar, placed against its right edge, so it travels with that edge
 * every frame; its chevron points the way the sidebar will go and turns
 * over on the sidebar's own curve.
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

/** A small chevron pointing left, to close; globals.css turns it over while the sidebar is collapsed. */
function EdgeChevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M7.25 3L4.25 6L7.25 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
        /* On the 1px border (its centre on the border's inner edge, whole pixels so its own hairline stays crisp), its centre level with Dashboard's (12px of gutter + half a 38px row). A 32px hit area round a 24px circle. */
        className="absolute -right-[12px] top-[19px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-[#8a8a8a] shadow-[0_1px_2px_rgba(16,18,27,0.06)] outline-none before:absolute before:-inset-1 before:content-[''] hover:border-neutral-300 hover:text-[#333333] active:bg-[#f3f3f3] focus-visible:ring-2 focus-visible:ring-neutral-300 [-webkit-tap-highlight-color:transparent]"
      >
        <EdgeChevron />
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
