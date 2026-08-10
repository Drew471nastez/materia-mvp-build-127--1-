"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE QUESTION YOU HAVE TO ANSWER BEFORE THE SCREEN GOES
 * ===========================================================================
 *
 * A centred dialog, not a bottom sheet. The distinction is not decoration: a
 * sheet is something you can dismiss by looking away — pull it down, tap the
 * scrim — and it belongs to work that CONTINUES behind it. This is the other
 * kind. It appears because you are about to lose something, it has exactly two
 * answers, and neither of them is "ignore me": the scrim does not dismiss it,
 * and there is no drag.
 *
 * The motion is the platform's own alert: the scrim fades while the card comes
 * up from 0.94, which reads as the question arriving in front of the screen
 * rather than as a panel travelling across it. Transform and opacity, so both
 * layers are composited; `arming` gives the card a frame to exist off-state in,
 * or the two style changes collapse into one and it appears fully formed.
 */
const IN_MS = 220
const OUT_MS = 160
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

type Stage = "closed" | "arming" | "open" | "leaving"

export type ConfirmAction = {
  label: string
  onClick: () => void
  /** The one that carries the consequence. Drawn as the filled button. */
  primary?: boolean
  /** Losing something. Drawn in the colour that means it. */
  danger?: boolean
  busy?: boolean
}

export function ConfirmDialog({
  open,
  title,
  body,
  actions,
  onDismiss,
}: {
  open: boolean
  title: string
  body?: string
  /** In the order they should be read, top to bottom. */
  actions: ConfirmAction[]
  /** Escape, and the hardware back gesture. NOT the scrim — see above. */
  onDismiss?: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<Stage>("closed")
  const stageRef = useRef<Stage>("closed")
  stageRef.current = stage
  const leaveTimer = useRef(0)

  useEffect(() => {
    window.clearTimeout(leaveTimer.current)
    if (open) {
      if (stageRef.current === "leaving") setStage("open")
      else if (stageRef.current !== "open") setStage("arming")
      return
    }
    if (stageRef.current === "closed") return
    const id = requestAnimationFrame(() => {
      setStage("leaving")
      leaveTimer.current = window.setTimeout(() => setStage("closed"), OUT_MS)
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  useLayoutEffect(() => {
    if (stage !== "arming") return
    void cardRef.current?.offsetHeight
    const id = requestAnimationFrame(() => setStage((s) => (s === "arming" ? "open" : s)))
    return () => cancelAnimationFrame(id)
  }, [stage])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss?.()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onDismiss])

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || typeof document === "undefined" || stage === "closed") return null

  const up = stage === "open"

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center px-7"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/45"
        style={{ opacity: up ? 1 : 0, transition: `opacity ${up ? IN_MS : OUT_MS}ms ${EASE}` }}
      />
      <div
        ref={cardRef}
        className="relative w-full max-w-[320px] rounded-[22px] bg-white p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.4)]"
        style={{
          opacity: up ? 1 : 0,
          transform: up ? "scale(1)" : "scale(0.94)",
          transition: `opacity ${up ? IN_MS : OUT_MS}ms ${EASE}, transform ${up ? IN_MS : OUT_MS}ms ${EASE}`,
          willChange: "transform, opacity",
        }}
      >
        <h2 className="text-center text-[17.5px] font-bold leading-snug tracking-[-0.015em] text-neutral-900">
          {title}
        </h2>
        {body && (
          <p className="mt-2 text-center text-[14px] font-medium leading-relaxed text-neutral-500">{body}</p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={a.busy}
              onClick={() => {
                void triggerHaptic("light")
                a.onClick()
              }}
              className={cn(
                "flex h-[50px] w-full items-center justify-center rounded-lg text-[15.5px] font-semibold transition-colors duration-150 disabled:opacity-60",
                a.primary && !a.danger && "bg-[#7c3aed] text-white active:bg-[#6d28d9]",
                a.primary && a.danger && "bg-rose-600 text-white active:bg-rose-700",
                !a.primary && a.danger && "text-rose-600 active:bg-rose-50",
                !a.primary && !a.danger && "text-neutral-700 active:bg-neutral-100",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
