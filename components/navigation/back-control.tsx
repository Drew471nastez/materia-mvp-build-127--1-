"use client"

/**
 * ===========================================================================
 *  A ROUND BACK CHEVRON THAT ANSWERS THE FIRST TAP
 * ===========================================================================
 * The settings page, the receipt: a 44px round chevron at the top left that
 * goes back where the person came from, or to `fallback` when nothing of
 * ours is behind (a receipt opened from an email, settings opened cold).
 *
 *   ON THE FRAME THE FINGER LANDS its ground darkens, and nothing about
 *   its size or place changes (lib/navigation/press-feedback.ts), with no
 *   render behind it.
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
import { swallowGhostTaps } from "@/lib/navigation/swallow-ghost-taps"
import { goBackOr, pushBackOnce } from "@/lib/navigation/go-back"
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
  onBack,
  className: extraClassName,
  ...data
}: {
  fallback: string
  label?: string
  /** The page behind, when it is one this control must not go back to. */
  skipBack?: (path: string) => boolean
  /** When set, the tap closes in place instead of changing the address. */
  onBack?: () => void
  className?: string
} & { [key: `data-${string}`]: string | undefined }) {
  const router = useRouter()
  const press = usePressFeedback<HTMLAnchorElement>()
  const tap = useFirstTap<HTMLElement>(() => {
    if (onBack) {
      onBack()
      return true
    }
    const behind = previousPath() ?? referrerPath()
    if (behind && skipBack?.(behind)) {
      pushBackOnce(fallback, (to) => router.push(to))
      return
    }
    goBackOr(fallback, (to) => router.push(to))
  })
  const className = cn(
        "relative flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-[10px]",
        "border border-[#e4e7ec] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)]",
        "touch-manipulation [-webkit-tap-highlight-color:transparent]",
        /* 48px of reach around an 44px control. */
        "before:absolute before:-inset-[2px] before:rounded-[12px] before:content-['']",
        /*
          PRESSED IS A TINT, NOTHING MOVES (round 11: "no bump on press").
          It shrank to 0.94 and lost its shadow, which on a 40px circle is a
          visible hop in and back out. Now only the ground darkens, on the
          frame the finger lands, and eases back over 200ms on the lift; the
          size, the hairline's place and the shadow never change.
        */
        "transition-[background-color,border-color] duration-200 ease-out",
        "data-[pressed]:border-[#dcdfe4] data-[pressed]:bg-[#eceef1] data-[pressed]:duration-0",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#f7f8fa]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20",
        "print:hidden",
        extraClassName,
      )
  const handlers = {
    ...tap,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      press.onPointerDown(e as React.PointerEvent<HTMLAnchorElement>)
      tap.onPointerDown(e)
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      press.onPointerUp()
      tap.onPointerUp(e)
    },
    onPointerCancel: () => {
      press.onPointerUp()
      tap.onPointerCancel()
    },
    onPointerLeave: press.onPointerUp,
  }

  if (onBack) {
    return (
      <button
        type="button"
        aria-label={label}
        {...data}
        {...handlers}
        data-back-control=""
        className={className}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
    )
  }

  return (
    <Link href={fallback} prefetch={false} aria-label={label} {...data} {...handlers} data-back-control="" className={className}>
      <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
    </Link>
  )
}
