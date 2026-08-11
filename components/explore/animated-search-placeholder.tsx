"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Typing-animation placeholder for the marketplace search inputs.
 *
 * Renders `Search for "vintage levi's 501"` with the quoted part typed out one
 * character at a time, held, deleted, then replaced by the next phrase — looping
 * through DEFAULT_SEARCH_PHRASES.
 *
 * ── Integration ───────────────────────────────────────────────────────────────
 * It is an OVERLAY, not the input's `placeholder` attribute (native placeholders
 * can't be animated per-character without a full attribute rewrite every frame).
 * Mount it as a sibling of the input inside a `relative` wrapper, leave the real
 * input's `placeholder` empty and give it a stable `aria-label`:
 *
 *   <div className="relative">
 *     <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ..." />
 *     <Input
 *       value={value}
 *       onChange={...}
 *       onFocus={() => setFocused(true)}
 *       onBlur={() => setFocused(false)}
 *       placeholder=""
 *       aria-label="Search"
 *       className="h-11 w-full pl-10 pr-10 bg-neutral-100 ... rounded-full text-sm"
 *     />
 *     <AnimatedSearchPlaceholder
 *       active={!value && !focused}
 *       className="absolute left-10 top-1/2 -translate-y-1/2 right-10 text-sm"
 *     />
 *   </div>
 *
 * Keep it MOUNTED and toggle `active` — unmounting resets the phrase cursor, so
 * every focus/blur would restart from "jordan 4 retro". While inactive it renders
 * nothing visible and holds zero timers.
 *
 * It can also wrap a static trigger label (the mobile "Search" button), where the
 * button itself is the positioning context.
 *
 * ── Why it's cheap ────────────────────────────────────────────────────────────
 * The animation writes `textContent` on a ref through a single self-rescheduling
 * setTimeout — one timer alive at a time, ZERO React re-renders per character
 * (same approach as components/marketing/hero.tsx). The component only re-renders
 * when `active` flips. It never re-renders its parent.
 *
 * Respects prefers-reduced-motion (static first phrase, no timers) and pauses on
 * tab hide so background tabs don't queue up work.
 */

// Six second-hand marketplace queries. Lowercase on purpose — they read as things
// a real person typed, not as marketing copy.
export const DEFAULT_SEARCH_PHRASES = [
  "jordan 4 retro",
  "rich dad poor dad book",
  "grey nike sweatpants",
  "vintage levi's 501",
  "north face puffer jacket",
  "y2k baby tee",
]

type Phase = "typing" | "holding" | "deleting"

interface AnimatedSearchPlaceholderProps {
  /** Animate only while true. Drive it with `!value && !isFocused`. */
  active: boolean
  /**
   * Phrases to cycle through. Defaults to DEFAULT_SEARCH_PHRASES.
   * Pass a stable reference (module constant or useMemo) — a fresh array literal
   * on every parent render restarts the timer chain.
   */
  phrases?: string[]
  /** Static text before the typed phrase. */
  prefix?: string
  /** Wrap the typed phrase in curly quotes. */
  quoted?: boolean
  /** Positioning + typography. The component only supplies colour and overflow rules. */
  className?: string
  /** Per-character delay while typing. */
  typeMs?: number
  /** Per-character delay while deleting — deleting reads better slightly faster. */
  deleteMs?: number
  /** Pause on the complete phrase. */
  holdMs?: number
  /** Pause on the empty string before the next phrase starts. */
  gapMs?: number
}

export function AnimatedSearchPlaceholder({
  active,
  phrases = DEFAULT_SEARCH_PHRASES,
  prefix = "Search for",
  quoted = true,
  className,
  typeMs = 55,
  deleteMs = 30,
  holdMs = 1400,
  gapMs = 350,
}: AnimatedSearchPlaceholderProps) {
  const textRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Animation cursor lives in refs so pausing (focus, tab hide) resumes from where
  // it stopped instead of snapping back to the first phrase.
  const phraseIndexRef = useRef(0)
  const charIndexRef = useRef(0)
  const phaseRef = useRef<Phase>("typing")

  // Resolved in an effect, never during render — matchMedia doesn't exist on the server.
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    if (!media) return

    setReducedMotion(media.matches)
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  useEffect(() => {
    const node = textRef.current
    if (!node) return

    const clear = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    if (phrases.length === 0) {
      clear()
      node.textContent = ""
      return
    }

    // Reduced motion: one static phrase, no timers, no cursor movement.
    if (reducedMotion) {
      clear()
      node.textContent = phrases[phraseIndexRef.current % phrases.length]
      return
    }

    const schedule = (delay: number) => {
      timerRef.current = setTimeout(step, delay)
    }

    const step = () => {
      timerRef.current = null
      const phrase = phrases[phraseIndexRef.current % phrases.length] ?? ""

      if (phaseRef.current === "typing") {
        charIndexRef.current = Math.min(charIndexRef.current + 1, phrase.length)
        node.textContent = phrase.slice(0, charIndexRef.current)

        if (charIndexRef.current >= phrase.length) {
          phaseRef.current = "holding"
          schedule(holdMs)
        } else {
          schedule(typeMs)
        }
        return
      }

      if (phaseRef.current === "holding") {
        phaseRef.current = "deleting"
        schedule(deleteMs)
        return
      }

      charIndexRef.current = Math.max(charIndexRef.current - 1, 0)
      node.textContent = phrase.slice(0, charIndexRef.current)

      if (charIndexRef.current === 0) {
        phraseIndexRef.current = (phraseIndexRef.current + 1) % phrases.length
        phaseRef.current = "typing"
        schedule(gapMs)
      } else {
        schedule(deleteMs)
      }
    }

    // Paint the current cursor position immediately so unpausing doesn't flash empty.
    node.textContent = (phrases[phraseIndexRef.current % phrases.length] ?? "").slice(0, charIndexRef.current)

    // A hidden tab throttles timers to ~1/s, which would otherwise land as a burst
    // of characters the moment the user comes back.
    const onVisibilityChange = () => {
      if (document.hidden) {
        clear()
      } else if (timerRef.current === null) {
        schedule(gapMs)
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    if (!document.hidden) schedule(typeMs)

    return () => {
      clear()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [active, phrases, reducedMotion, typeMs, deleteMs, holdMs, gapMs])

  if (!active) return null

  return (
    <span
      // Decorative duplicate of the input's aria-label — screen readers get one
      // stable string from the input itself, not a per-character stream.
      aria-hidden="true"
      className={cn(
        // `gap-[0.3em]`, and this is the space between "Caută" and the opening
        // quote — which was written as a trailing space inside `prefix` and
        // therefore was never there.
        //
        // HTML collapses whitespace at the end of an inline box before the next
        // one, so `<span>Caută </span><span>„…"</span>` renders as `Caută„…"`.
        // The string was correct at every call site and the DOM ate it, which is
        // why it looked like a typo nobody could find. A flex gap is a layout
        // fact rather than a character, so nothing can collapse it — and it
        // scales with the font size, which a hard-coded &nbsp; would not.
        "pointer-events-none flex select-none items-center gap-[0.3em] overflow-hidden whitespace-nowrap text-neutral-500",
        className,
      )}
    >
      <span className="shrink-0">{prefix}</span>
      <span className="truncate">
        {quoted && "“"}
        <span ref={textRef} />
        {!reducedMotion && (
          // Sits inside the same overlay so it always tracks the last character.
          <span className="animate-pulse font-light">|</span>
        )}
        {quoted && "”"}
      </span>
    </span>
  )
}
