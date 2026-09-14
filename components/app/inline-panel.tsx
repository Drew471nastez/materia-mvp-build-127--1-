"use client"

/**
 * ===========================================================================
 *  A PANEL THAT LEAVES THE WAY IT ARRIVED
 * ===========================================================================
 * Every inline panel in this workspace was `open && <div className="wb-settings-in">`.
 * That opens on a curve and then DISAPPEARS ON ONE FRAME, because unmounting
 * is instantaneous and there is no such thing as an exit animation on an
 * element that is no longer in the tree. Opening felt considered and closing
 * felt like the panel had crashed.
 *
 * So the open flag is not what decides whether the markup exists. `render`
 * stays true for the length of the exit animation, during which the panel
 * carries `wb-settings-out`, and only then does it go. One timer, cleared on
 * unmount and on a reopen, so a panel opened again mid-exit simply comes
 * back rather than vanishing when the old timer fires.
 *
 * The scrim gets the same treatment. Fading the panel out over a backdrop
 * that has already gone is worse than no animation at all.
 */

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/** Matches the `wb-settings-out` / `wb-scrim-out` durations in globals.css. */
const EXIT_MS = 160

export function useInlinePresence(open: boolean): { render: boolean; leaving: boolean } {
  const [render, setRender] = useState(open)
  const [leaving, setLeaving] = useState(false)
  const rendered = useRef(open)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (open) {
      rendered.current = true
      setRender(true)
      setLeaving(false)
      return
    }
    /* Nothing to animate out of if it was never in. */
    if (!rendered.current) return
    setLeaving(true)
    timer.current = setTimeout(() => {
      rendered.current = false
      setRender(false)
      setLeaving(false)
    }, EXIT_MS)
  }, [open])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return { render, leaving }
}

/**
 * The panel, its scrim, and the click-outside that closes it.
 *
 * `className` positions it — this component decides nothing about where a
 * panel sits, only that it arrives and leaves like every other one.
 */
export function InlinePanel({
  open,
  onClose,
  className,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  className?: string
  label?: string
  children: React.ReactNode
}) {
  const { render, leaving } = useInlinePresence(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!render) return null

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn("absolute inset-0 z-20 bg-black/10", leaving ? "wb-scrim-out" : "wb-scrim-in")}
      />
      <div
        role="dialog"
        aria-label={label}
        aria-modal="true"
        className={cn(
          leaving ? "wb-settings-out" : "wb-settings-in",
          "absolute z-30 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]",
          className,
        )}
      >
        {children}
      </div>
    </>
  )
}
