"use client"

/**
 * ===========================================================================
 *  A PICKER'S FRAME: A SHEET ON A PHONE, A POPOVER OR A DIALOG ON A COMPUTER
 * ===========================================================================
 * Round 39 (the owner: "The new message should be more smooth and clean").
 * New message and Send in a message both open in this.
 *
 *   ON A PHONE   a sheet from the bottom edge of what the keyboard leaves
 *                (--vv-top, --vv-h, as the messages screen itself), so the
 *                search field at its top and the button at its foot stay in
 *                sight while typing. A fixed height: results changing under
 *                the field never move the sheet.
 *   ON A COMPUTER  `place="panel"`: a popover inside the messages panel,
 *                under its bar, growing from the top right where the pen
 *                button is. `place="page"`: a dialog over the page.
 *
 * THE MOTION. opacity, `translate` and `scale` (the individual properties,
 * never the combined matrix property), so the compositor runs it and nothing is laid out
 * again as it moves. The first frame is the closed one: the layer is
 * committed closed, its style is read once (a forced style read in a layout
 * effect, before paint), and only then marked open, so the transition always
 * has a start. With reduced motion it simply appears.
 *
 * Escape closes it (and only it: the panel under it stays). Focus goes back
 * to whatever had it when the picker opened.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const ENTER_MS = { sheet: 340, pop: 200 }
const EXIT_MS = { sheet: 240, pop: 150 }

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

export function PickerShell({ open, onClose, label, place, children }: { open: boolean; onClose: () => void; label: string; place: "page" | "panel"; children: React.ReactNode }) {
  const phone = usePhone()
  const [mounted, setMounted] = useState(open)
  const [on, setOn] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const kind = phone ? "sheet" : "pop"

  if (open && !mounted) setMounted(true)

  useLayoutEffect(() => {
    if (!open || !mounted || on) return
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    /* The closed frame's style read before it is marked open: the transition's start. */
    frame.current?.getBoundingClientRect()
    setOn(true)
  }, [open, mounted, on])

  useEffect(() => {
    if (open || !mounted) return
    setOn(false)
    const t = window.setTimeout(() => setMounted(false), EXIT_MS[kind])
    const back = returnTo.current
    if (back && document.contains(back)) back.focus({ preventScroll: true })
    return () => window.clearTimeout(t)
  }, [open, mounted, kind])

  if (!mounted || typeof document === "undefined") return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }
  const ms = on ? ENTER_MS[kind] : EXIT_MS[kind]
  const ease = on ? "var(--ease-sheet, cubic-bezier(0.32, 0.72, 0, 1))" : "cubic-bezier(0.4, 0, 1, 1)"
  const motion = { transitionDuration: `${ms}ms`, transitionTimingFunction: ease }
  const dialog = { role: "dialog" as const, "aria-modal": true, "aria-label": label, onKeyDown }

  if (phone) {
    const layer = place === "page" ? "fixed inset-x-0 top-[var(--vv-top,0px)] z-[145] h-[var(--vv-h,100dvh)]" : "absolute inset-0 z-30"
    return wrap(
      place,
      <div className={`${layer} flex flex-col justify-end ${on ? "" : "pointer-events-none"}`} data-picker="sheet">
        <div aria-hidden onClick={onClose} style={motion} className={`absolute inset-0 bg-black/40 transition-opacity motion-reduce:transition-none ${on ? "opacity-100" : "opacity-0"}`} />
        <div
          ref={frame}
          {...dialog}
          style={motion}
          className={`relative flex h-[min(720px,calc(100%-44px))] flex-col overflow-hidden rounded-t-[20px] bg-white shadow-[0_-12px_40px_-12px_rgba(17,24,39,0.22)] transition-[translate] motion-reduce:transition-none ${on ? "translate-y-0" : "translate-y-full"}`}
          data-picker-frame=""
        >
          {children}
        </div>
      </div>,
    )
  }

  if (place === "panel") {
    return (
      <div className={`absolute inset-0 z-30 ${on ? "" : "pointer-events-none"}`} data-picker="popover">
        <div aria-hidden onClick={onClose} style={motion} className={`absolute inset-0 bg-white/50 transition-opacity motion-reduce:transition-none ${on ? "opacity-100" : "opacity-0"}`} />
        <div
          ref={frame}
          {...dialog}
          style={motion}
          className={`absolute inset-x-2 top-[58px] flex h-[min(540px,calc(100%-68px))] origin-top-right flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_18px_48px_-14px_rgba(17,24,39,0.26),0_2px_6px_rgba(17,24,39,0.06)] transition-[opacity,scale,translate] motion-reduce:transition-none ${
            on ? "translate-y-0 scale-100 opacity-100" : "-translate-y-1 scale-[0.96] opacity-0"
          }`}
          data-picker-frame=""
        >
          {children}
        </div>
      </div>
    )
  }

  return wrap(
    place,
    <div className={`fixed inset-0 z-[145] flex items-start justify-center px-4 pt-[min(12vh,120px)] ${on ? "" : "pointer-events-none"}`} data-picker="dialog">
      <div aria-hidden onClick={onClose} style={motion} className={`absolute inset-0 bg-black/30 transition-opacity motion-reduce:transition-none ${on ? "opacity-100" : "opacity-0"}`} />
      <div
        ref={frame}
        {...dialog}
        style={motion}
        className={`relative flex h-[min(580px,calc(100vh-max(12vh,40px)-40px))] w-full max-w-[460px] origin-top flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_24px_60px_-16px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)] transition-[opacity,scale,translate] motion-reduce:transition-none ${
          on ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0"
        }`}
        data-picker-frame=""
      >
        {children}
      </div>
    </div>,
  )
}

/** A page picker goes to the body (above an opened post); a panel picker stays inside the panel that holds it. */
function wrap(place: "page" | "panel", node: React.ReactElement) {
  return place === "page" ? createPortal(node, document.body) : node
}

/** The picker's top line: its name and a close button. */
export function PickerHead({ title, onClose, right }: { title: string; onClose: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 pl-4 pr-1.5">
      <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[#1a1a2e]">{title}</h2>
      {right}
      <button type="button" onClick={onClose} className="h-9 shrink-0 cursor-pointer rounded-full px-3 text-[14px] font-medium text-[#6b7280] outline-none transition-colors hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-picker-close="">
        Cancel
      </button>
    </div>
  )
}
