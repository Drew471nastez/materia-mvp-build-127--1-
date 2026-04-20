"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * PageTransition — wraps /app page content so it lands with a subtle fade +
 * slide-up animation (Shopify-style) each time the user navigates between
 * pages. Re-triggers on pathname change by remounting via `key`.
 *
 * Props:
 *   stagger  — if true, direct children each animate in sequentially with a
 *              40 ms offset for a gentle cascade. Default false.
 *
 * The animation is pure CSS (see .app-page-enter in globals.css) so it runs
 * off the compositor with no JS in the render path, and is skipped entirely
 * for users with prefers-reduced-motion.
 */
export function PageTransition({
  children,
  stagger = false,
  className,
}: {
  children: ReactNode
  stagger?: boolean
  className?: string
}) {
  const pathname = usePathname()

  return (
    <div
      key={pathname}
      className={cn(
        stagger ? "app-page-enter-stagger" : "app-page-enter",
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * DeferredSkeleton — hides a loading skeleton for `delay` ms so it never
 * flashes on fast loads. If content becomes ready inside the window, the
 * skeleton is skipped entirely. For slow loads it fades in smoothly.
 *
 * The fade-in itself is handled by the CSS class .skeleton-deferred (see
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
    <div className={cn("skeleton-deferred", className)} aria-hidden="true">
      {children}
    </div>
  )
}
