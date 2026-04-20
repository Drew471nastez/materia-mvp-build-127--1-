"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * DeferredSkeleton — hides a loading skeleton for `delay` ms so it never
 * flashes on fast loads. If content becomes ready inside the window, the
 * skeleton is skipped entirely. For slow loads it fades in smoothly.
 *
 * The fade-in itself is handled by the CSS class .skeleton-fade (see
 * globals.css). We gate it with a boolean in JS so React can drop the
 * skeleton from the tree as soon as the content mounts.
 */
export function DeferredSkeleton({
  children,
  delay = 200,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => setShow(true), delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [delay])

  if (!show) return null

  return (
    <div className={cn("skeleton-fade", className)} aria-hidden="true">
      {children}
    </div>
  )
}
