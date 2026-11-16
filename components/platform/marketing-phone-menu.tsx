"use client"

/*
  ═══════════════════════════════════════════════════════════════════════════
   THE MARKETING PAGES' PHONE MENU, FULL SCREEN (wave 18)
  ═══════════════════════════════════════════════════════════════════════════
  The owner: "not a bottom sheet. A smooth, clean full-screen menu like the
  reference video", calm, every state kept. The reference (Fourthwall, at
  30 fps): the three lines turn into an X in about a tenth of a second, the
  page dims as a dark panel fades in under the bar in about a fifth, the rows
  arrive a frame or two apart with a few pixels of rise, the buttons sit at
  the foot; closing is one fade of the whole panel, no motion.

  Only for storelib.com's own pages (the hamburger at the right of their
  phone bar, platform-header-client.tsx). /app's menus, Explore's navigator
  and the account sheet behind the photo are other components and keep
  their sheets.

  HOW IT STAYS SMOOTH ON A SLOW PHONE. The panel is built once the page is
  idle on a phone and kept, hidden (visibility, inert). A tap only flips one
  attribute; everything that moves is opacity and transform, on the
  compositor. Nothing is measured per frame and nothing animates a height:
  a group opens at once and only its rows fade in.

  THE PAGE UNDER IT holds still without touching its styles: a touch drag
  or a wheel outside the list that can scroll is refused (non passive), the
  list itself has overscroll-behavior: contain, so a scroll that runs out
  does not chain to the page on iOS. No overflow:hidden on <html> and no
  position:fixed body, so nothing is laid out again and the page cannot
  jump to its top when the menu closes.

  ACCESSIBILITY. The hamburger is the disclosure button (aria-expanded,
  aria-controls) and stays the X: Tab cycles the X and the menu's controls
  and nothing else, Escape closes and puts the focus back on the button, and
  the rest of the page is hidden from screen readers while the menu is open
  (they read only the bar and the menu). Reduced motion: a short fade, no
  rise.
*/

import type React from "react"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export const MARKETING_MENU_ID = "marketing-phone-menu"

/* The panel's motion, from the reference's frames. */
const OPEN_MS = 220
const CLOSE_MS = 170

const CSS = `
#${MARKETING_MENU_ID}{opacity:0;visibility:hidden;transition:opacity ${CLOSE_MS}ms cubic-bezier(.4,0,1,1),visibility 0s linear ${CLOSE_MS}ms}
#${MARKETING_MENU_ID}[data-state=open]{opacity:1;visibility:visible;transition:opacity ${OPEN_MS}ms cubic-bezier(.22,1,.36,1),visibility 0s}
#${MARKETING_MENU_ID} [data-menu-rise]{opacity:0;transform:translate3d(0,8px,0);transition:opacity 0s linear ${CLOSE_MS}ms,transform 0s linear ${CLOSE_MS}ms}
#${MARKETING_MENU_ID}[data-state=open] [data-menu-rise]{opacity:1;transform:none;transition:opacity 300ms cubic-bezier(.22,1,.36,1),transform 380ms cubic-bezier(.22,1,.36,1);transition-delay:calc(50ms + var(--i,0) * 24ms)}
#${MARKETING_MENU_ID} [data-menu-group-body] > *{animation:mpm-in 260ms cubic-bezier(.22,1,.36,1) both}
${[2, 3, 4, 5, 6, 7, 8].map((n) => `#${MARKETING_MENU_ID} [data-menu-group-body] > :nth-child(${n}){animation-delay:${(n - 1) * 22}ms}`).join("\n")}
@keyframes mpm-in{from{opacity:0;transform:translate3d(0,-4px,0)}}
@media (prefers-reduced-motion:reduce){
  #${MARKETING_MENU_ID}[data-state=open]{transition:opacity 120ms linear,visibility 0s}
  #${MARKETING_MENU_ID} [data-menu-rise],#${MARKETING_MENU_ID}[data-state=open] [data-menu-rise]{opacity:1;transform:none;transition:none}
  #${MARKETING_MENU_ID} [data-menu-group-body] > *{animation:none}
}
`

/** The panel's colours: the bar's own (dark #16161a, or the light bar's white). */
export function menuTone(light: boolean) {
  return light
    ? {
        panel: "bg-white text-[#1a1a2e]",
        row: "text-[#1a1a2e] active:text-[#1a1a2e]/55 hover:text-[#1a1a2e]/65",
        sub: "text-[#3f4652] active:text-[#1a1a2e]/55 hover:text-[#1a1a2e]",
        muted: "text-[#6b7280]",
        rule: "bg-[#eceef1]",
        focus: "outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
      }
    : {
        panel: "bg-[#16161a] text-white",
        row: "text-white active:text-white/55 hover:text-white/70",
        sub: "text-white/75 active:text-white/50 hover:text-white",
        muted: "text-white/50",
        rule: "bg-white/[0.08]",
        focus: "outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16161a]",
      }
}
export type MenuTone = ReturnType<typeof menuTone>

/** A row of the list: 52px tall, the words at 19px, nothing else. `i` is its place in the arrival. */
export const MENU_ROW = "flex min-h-[52px] w-full items-center justify-between text-left text-[19px] font-[450] tracking-[-0.01em] transition-colors duration-150 cursor-pointer touch-manipulation [-webkit-tap-highlight-color:transparent]"
/** A row inside a group: a step smaller and quieter. */
export const MENU_SUB_ROW = "flex min-h-[46px] w-full items-center gap-3 text-left text-[16px] font-medium transition-colors duration-150 cursor-pointer touch-manipulation [-webkit-tap-highlight-color:transparent]"

export const rise = (i: number) => ({ "data-menu-rise": "", style: { "--i": i } as React.CSSProperties })

/**
 * A group that opens in place (the reference's "Features ▾"): the name and a
 * chevron that turns, the rows under it. It opens at once; only the rows
 * fade in, so nothing animates a height.
 */
export function MenuGroup({
  label,
  tone,
  i,
  children,
  name,
}: {
  label: string
  tone: MenuTone
  i: number
  name: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div data-menu-group={name} data-open={open ? "" : undefined} {...rise(i)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(MENU_ROW, tone.row, tone.focus, "rounded-md")}
      >
        <span>{label}</span>
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn("h-5 w-5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", tone.muted, open && "rotate-180")}
        />
      </button>
      <div id={id} hidden={!open} data-menu-group-body="" className="pb-2">
        {open ? children : null}
      </div>
    </div>
  )
}

/** The list's own scroll: what a drag may move while the menu is open. */
function scrollable(el: HTMLElement | null, dy: number): boolean {
  if (!el || el.scrollHeight <= el.clientHeight + 1) return false
  if (dy > 0) return el.scrollTop > 0
  if (dy < 0) return el.scrollTop < el.scrollHeight - el.clientHeight - 1
  return true
}

export function MarketingPhoneMenu({
  open,
  onClose,
  light,
  headerRef,
  buttonRef,
  label = "Menu",
  children,
  foot,
}: {
  open: boolean
  onClose: () => void
  light: boolean
  /** The bar: the panel starts under its bottom edge. */
  headerRef: React.RefObject<HTMLElement | null>
  /** The hamburger: part of the focus cycle, and where the focus goes back to. */
  buttonRef: React.RefObject<HTMLButtonElement | null>
  label?: string
  children: React.ReactNode
  /** The actions at the foot (sign up and log in, or the dashboard and log out). */
  foot: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const tone = menuTone(light)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  /* Under the bar wherever the page is scrolled to: read once, as the tap lands, before the panel shows. */
  useLayoutEffect(() => {
    if (!open) return
    const b = headerRef.current?.getBoundingClientRect().bottom ?? 0
    setTop(Math.max(0, Math.round(b)))
    if (listRef.current) listRef.current.scrollTop = 0
  }, [open, headerRef])

  /* The page holds still, the keyboard stays in the menu, Escape closes. */
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const list = listRef.current
    let lastY = 0
    const onTouchStart = (e: TouchEvent) => { lastY = e.touches[0]?.clientY ?? 0 }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? lastY
      const dy = y - lastY
      lastY = y
      const inList = !!list && list.contains(e.target as Node)
      if (!inList || !scrollable(list, dy)) { if (e.cancelable) e.preventDefault() }
    }
    const onWheel = (e: WheelEvent) => {
      const inList = !!list && list.contains(e.target as Node)
      if (!inList || !scrollable(list, -e.deltaY)) e.preventDefault()
    }
    const focusables = () => {
      const inside = panel ? Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((el) => !el.closest("[hidden],[inert],[aria-hidden=true]") && el.getClientRects().length > 0) : []
      return buttonRef.current ? [buttonRef.current, ...inside] : inside
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onCloseRef.current()
        buttonRef.current?.focus()
        return
      }
      if (e.key === "Tab") {
        const all = focusables()
        if (!all.length) return
        const at = all.indexOf(document.activeElement as HTMLElement)
        const next = e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : at === -1 || at === all.length - 1 ? 0 : at + 1
        e.preventDefault()
        all[next].focus()
        return
      }
      /* The arrows and the space bar would scroll the page behind. */
      if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key)) {
        const t = e.target as HTMLElement | null
        const typing = t?.closest?.("input,textarea,[contenteditable=true]")
        const pressing = e.key === " " && t?.closest?.("button,a")
        if (!typing && !pressing && !(list && list.contains(t) && scrollable(list, 0))) e.preventDefault()
      }
    }
    document.addEventListener("touchstart", onTouchStart, { passive: true })
    document.addEventListener("touchmove", onTouchMove, { passive: false })
    document.addEventListener("wheel", onWheel, { passive: false })
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("touchstart", onTouchStart)
      document.removeEventListener("touchmove", onTouchMove)
      document.removeEventListener("wheel", onWheel)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, buttonRef])

  /*
    EVERYTHING BUT THE BAR AND THE MENU IS HIDDEN FROM A SCREEN READER while
    it is open (aria-hidden; the keyboard is already kept in by the Tab
    cycle above). Not `inert`: inert is inherited, so setting it on the
    landing restyled the whole page, measured 130ms on a phone at 4x CPU, a
    visible hitch right after the fade; aria-hidden costs 1 to 3ms. Set once
    the panel has faded in and lifted once it has faded out all the same.
  */
  useEffect(() => {
    const keep = [headerRef.current, panelRef.current?.parentElement].filter(Boolean) as HTMLElement[]
    if (!open || !keep.length) return
    const made: HTMLElement[] = []
    const t = window.setTimeout(() => {
      for (const start of keep) {
        let el: HTMLElement | null = start
        while (el && el !== document.body) {
          const parent: HTMLElement | null = el.parentElement
          if (!parent) break
          for (const sib of Array.from(parent.children) as HTMLElement[]) {
            if (sib === el || keep.some((k) => sib.contains(k)) || sib.inert || sib.getAttribute("aria-hidden") === "true" || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(sib.tagName)) continue
            sib.setAttribute("aria-hidden", "true")
            made.push(sib)
          }
          el = parent
        }
      }
    }, OPEN_MS + 40)
    return () => {
      window.clearTimeout(t)
      if (!made.length) return
      window.setTimeout(() => { for (const el of made) el.removeAttribute("aria-hidden") }, CLOSE_MS + 20)
    }
  }, [open, headerRef])

  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const el = document.createElement("div")
    el.setAttribute("data-marketing-menu-host", "")
    document.body.appendChild(el)
    setHost(el)
    return () => { el.remove() }
  }, [])
  if (!host) return null

  return createPortal(
    <>
      <style>{CSS}</style>
      <div
        ref={panelRef}
        id={MARKETING_MENU_ID}
        role="dialog"
        aria-label={label}
        aria-hidden={!open || undefined}
        inert={!open || undefined}
        data-state={open ? "open" : "closed"}
        data-mobile-top-sheet=""
        data-tone={light ? "light" : "dark"}
        /* The dark bar is dark in both looks (gen-theme-dark keeps the header's own colours): so is its menu, which the dark look's class rules leave alone. The light one follows the header into the dark look. */
        data-own-look={light ? undefined : ""}
        className={cn("fixed inset-0 z-[39] flex flex-col md:hidden", tone.panel)}
        style={{ paddingTop: top }}
      >
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3" data-menu-list="">
          {children}
        </div>
        <div className="shrink-0 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)]" data-menu-foot="">
          {foot}
        </div>
      </div>
    </>,
    host,
  )
}
