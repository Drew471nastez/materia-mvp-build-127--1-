"use client"

/**
 * ===========================================================================
 *  A ROUND BACK CHEVRON THAT ANSWERS THE FIRST TAP
 * ===========================================================================
 * The settings page, the receipt: a 40px round chevron at the top left that
 * goes back where the person came from, or to `fallback` when nothing of
 * ours is behind (a receipt opened from an email, settings opened cold).
 *
 *   ON THE FRAME THE FINGER LANDS it darkens and gives a little
 *   (lib/navigation/press-feedback.ts), with no render behind it.
 *   ON THE LIFT OF THE FIRST TAP it goes (lib/navigation/first-tap.ts), so a
 *   tap iOS does not turn into a click still counts, and the second tap of
 *   a double tap is the same press (lib/navigation/go-back.ts holds it).
 *   BACK, NOT FORWARD: a history back lands on the router's kept copy of
 *   the page behind with its scroll, where a link would push a new copy of
 *   it at the top. `skipBack` names pages that must not be gone back to (the
 *   checkout behind a receipt), and then the fallback is opened instead.
 *
 * It is still a link: a middle click, a long press and a screen reader all
 * get the fallback's address.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { useFirstTap } from "@/lib/navigation/first-tap"
import { backInFlight, goBackOr } from "@/lib/navigation/go-back"
import { previousPath } from "@/lib/navigation/in-app-history"
import { usePressFeedback } from "@/lib/navigation/press-feedback"
import { cn } from "@/lib/utils"

function referrerPath(): string | null {
  try {
    if (!document.referrer) return null
    const ref = new URL(document.referrer)
    return ref.origin === window.location.origin ? ref.pathname : null
  } catch {
    return null
  }
}

export function BackControl({
  fallback,
  label = "Back",
  skipBack,
  className,
  ...data
}: {
  fallback: string
  label?: string
  /** The page behind, when it is one this control must not go back to. */
  skipBack?: (path: string) => boolean
  className?: string
} & { [key: `data-${string}`]: string | undefined }) {
  const router = useRouter()
  const press = usePressFeedback<HTMLAnchorElement>()
  const tap = useFirstTap<HTMLAnchorElement>(() => {
    const behind = previousPath() ?? referrerPath()
    if (behind && skipBack?.(behind)) {
      if (!backInFlight()) router.push(fallback)
      return
    }
    goBackOr(fallback, (to) => router.push(to))
  })
  return (
    <Link
      href={fallback}
      prefetch={false}
      aria-label={label}
      {...data}
      {...tap}
      onPointerDown={(e) => {
        press.onPointerDown(e)
        tap.onPointerDown(e)
      }}
      onPointerUp={(e) => {
        press.onPointerUp()
        tap.onPointerUp(e)
      }}
      onPointerCancel={() => {
        press.onPointerUp()
        tap.onPointerCancel()
      }}
      onPointerLeave={press.onPointerUp}
      data-back-control=""
      className={cn(
        "relative flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full",
        "border border-[#e4e7ec] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)]",
        "touch-manipulation [-webkit-tap-highlight-color:transparent]",
        /* 44px of reach around a 40px circle. */
        "before:absolute before:-inset-[3px] before:rounded-full before:content-['']",
        "transition-[background-color,scale,box-shadow] duration-150 ease-out",
        "data-[pressed]:scale-[0.94] data-[pressed]:bg-[#f1f2f4] data-[pressed]:shadow-none data-[pressed]:duration-0",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#f7f8fa]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20",
        "motion-reduce:data-[pressed]:scale-100 print:hidden",
        className,
      )}
    >
      <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
    </Link>
  )
}
