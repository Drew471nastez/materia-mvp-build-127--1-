"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * True only once `active` has been true for `delay` milliseconds.
 *
 * A loader that appears the instant something starts turns every fast load
 * into a flash of machinery. Below about a third of a second a person reads
 * a wait as the interface being quick; a spinner in that window makes it
 * feel slower than showing nothing at all. It goes false the moment `active`
 * does, so nothing lingers after the work finishes.
 */
export function useDelayedFlag(active: boolean, delay = 350): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const id = window.setTimeout(() => setShown(true), delay)
    return () => window.clearTimeout(id)
  }, [active, delay])
  return shown
}

/**
 * True while `active` is, and for `ms` after it stops being.
 *
 * The other half of useDelayedFlag: that one keeps a loader from appearing
 * too soon, this keeps it from disappearing too fast. A surface that is
 * unmounted the instant its work ends cannot fade; one that stays for a beat
 * can, and what it fades over is the thing that has arrived.
 */
export function useLinger(active: boolean, ms = 280): boolean {
  const [lingering, setLingering] = useState(active)
  useEffect(() => {
    if (active) {
      setLingering(true)
      return
    }
    const id = window.setTimeout(() => setLingering(false), ms)
    return () => window.clearTimeout(id)
  }, [active, ms])
  return lingering
}

/**
 * ===========================================================================
 *  WHAT THE BUILDER SHOWS WHILE IT IS BUSY
 * ===========================================================================
 *
 * Nine squares fading on a stagger, and one line of text at a time.
 *
 * A bar with nothing written under it is a bar: it says something is
 * happening and nothing about what, and on a slow connection the silence is
 * what makes a wait feel broken. The lines change every couple of seconds
 * and stop on the last one rather than looping, because a message that comes
 * back round says the work started over.
 *
 * The squares are nine opacity animations, each on its own layer. A spinner
 * is one rotation, which the compositor also carries — but a rotation
 * implies a clock, and a clock that has been going for eight seconds reads
 * as stuck where a stagger just reads as working.
 */
export function BuilderLoader({
  lines,
  className,
  tone = "dark",
}: {
  /** Shown in order, one every 2.2 seconds. The last one stays. */
  lines: string[]
  className?: string
  /** Which surface it is drawn on, since the squares take `currentColor`. */
  tone?: "dark" | "light"
}) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (lines.length < 2) return
    const id = window.setInterval(() => {
      // Stops on the last line. Looping would say the work restarted.
      setIndex((i) => (i >= lines.length - 1 ? i : i + 1))
    }, 2200)
    return () => window.clearInterval(id)
  }, [lines.length])

  const line = lines[Math.min(index, lines.length - 1)] ?? ""

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center gap-5", tone === "dark" ? "text-white/70" : "text-neutral-400", className)}
    >
      <span className="wb-squares" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} />
        ))}
      </span>
      {/* Keyed by the text, so React replaces the node and the fade runs
          again on every change rather than only on the first. */}
      <span
        key={line}
        className={cn(
          "wb-loading-line text-[13.5px] font-medium",
          tone === "dark" ? "text-white/75" : "text-neutral-500",
        )}
      >
        {line}
      </span>
    </div>
  )
}
