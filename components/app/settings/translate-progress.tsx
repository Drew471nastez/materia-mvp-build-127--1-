"use client"

/**
 * ===========================================================================
 *  HOW FAR A TRANSLATION IS, MOVING THE WAY THE WORK DOES
 * ===========================================================================
 * The background job writes its count after each batch, and the page reads
 * it every two seconds, so the number arrives in steps of forty. Drawn as it
 * comes it jumped; here the bar eases to each new width and the count rolls
 * up to it. Nothing sweeps or flickers over it (the owner found a passing
 * light glitchy): the motion is the fill itself. Reduced motion: the bar and
 * the number are simply set.
 *
 * Shared by the Languages list and the translation sheet, so both move alike.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { FillBar } from "@/components/ui/fill-bar"

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/** `to`, reached over a short ease from wherever the number was. */
export function useRollingNumber(to: number, ms = 700): number {
  const [shown, setShown] = React.useState(to)
  const from = React.useRef(to)
  React.useEffect(() => {
    if (reduced() || from.current === to) {
      from.current = to
      setShown(to)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.round(a + (to - a) * eased)
      setShown(v)
      from.current = v
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return shown
}

export function TranslateBar({ done, total, running, tone = "violet", className, label }: { done: number; total: number; running: boolean; tone?: "violet" | "ink"; className?: string; label?: string }) {
  /* A sliver while the first batch is out, so a running job never looks empty. The job writes in steps of forty, so the fill takes longer than the shared default. */
  return <FillBar value={done} max={Math.max(1, total)} label={label} tone={tone} ms={1200} floor={running ? 3 : 0} className={className} />
}
