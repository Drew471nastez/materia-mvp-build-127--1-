"use client"

/**
 * ===========================================================================
 *  A PART THAT OPENS BY ITS OWN HEIGHT, AND CLOSES THE SAME WAY
 * ===========================================================================
 * A grid row going from 0fr to 1fr, with its opacity, 200ms: the browser
 * finds the height, nothing is measured in script, and nothing below it
 * jumps, it is carried down and back up. The pattern is the one Settings ›
 * Domains already uses (components/app/settings/domains-panel.tsx), here
 * once so the website settings and the builder's link lists share it.
 *
 * While closing it keeps drawing what it last showed, so a panel folds up
 * with its fields still in it rather than emptying first. Closed, it is
 * inert, then unmounted. With reduced motion it opens and closes at once.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export const REVEAL_MS = 200

export function Reveal({
  open,
  children,
  className,
  innerClassName,
  id,
  ...rest
}: {
  open: boolean
  children: React.ReactNode
  className?: string
  innerClassName?: string
  id?: string
} & Record<`data-${string}`, string | undefined>) {
  const [mounted, setMounted] = React.useState(open)
  const [shown, setShown] = React.useState(open)
  const [settled, setSettled] = React.useState(open)
  const kept = React.useRef<React.ReactNode>(children)
  if (open) kept.current = children

  React.useEffect(() => {
    let frame = 0
    let timer = 0
    if (open) {
      setMounted(true)
      /* One frame at 0fr first, so the browser has a height to move from. */
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setShown(true))
      })
      timer = window.setTimeout(() => setSettled(true), REVEAL_MS + 40)
    } else {
      setShown(false)
      setSettled(false)
      timer = window.setTimeout(() => setMounted(false), REVEAL_MS + 40)
    }
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [open])

  if (!open && !mounted) return null
  return (
    <div
      {...rest}
      id={id}
      data-reveal={shown ? "open" : "closed"}
      inert={!open || undefined}
      aria-hidden={!open || undefined}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
        className,
      )}
      style={{ gridTemplateRows: shown ? "1fr" : "0fr", opacity: shown ? 1 : 0 }}
    >
      {/* Clipped only while it moves, so a focus ring at its edge is not cut once it is open. */}
      <div className={cn("min-h-0 min-w-0", !(settled && open) && "overflow-hidden", innerClassName)}>{open ? children : kept.current}</div>
    </div>
  )
}
