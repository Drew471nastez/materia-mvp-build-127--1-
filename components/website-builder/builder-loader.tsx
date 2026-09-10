"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

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
