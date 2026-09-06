"use client"

import { type PullPhase } from "@/hooks/use-pull-to-refresh"

interface Props {
  pullDistance: number
  phase: PullPhase
  /** Same threshold used in usePullToRefresh (default: 72) */
  threshold?: number
  /**
   * Pixels from the top of the scroll container to anchor the indicator.
   * Use this to push the indicator below a fixed bar (e.g. announcement bar)
   * so it never overlaps it. Default: 0.
   */
  topOffset?: number
  /**
   * The gap, in px, that the page holds open while refreshing — the same value
   * the caller translates its content by. The ring centres itself in it.
   *
   * Passed in rather than hardcoded so the two cannot drift: the position used
   * to be a literal 10px against a 34px gap, which was never actually centred
   * and would have silently gone wrong the moment the hold distance changed.
   */
  refreshHold?: number
}

/**
 * Clean, minimal circular arc pull-to-refresh indicator.
 *
 * Visual states:
 *   pulling    → arc fills progressively as you pull (progress ring)
 *   ready      → arc fully filled, slight scale-up hint
 *   refreshing → smooth continuous rotation
 *   idle       → fades out and slides up off-screen
 */
export function PullToRefreshIndicator({
  pullDistance,
  phase,
  threshold = 72,
  topOffset = 0,
  refreshHold = 34,
}: Props) {
  const progress = Math.min(pullDistance / threshold, 1)

  // Ring geometry
  // 15% smaller than the original 22px
  const size = 19
  const strokeWidth = 2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  /**
   * ===========================================================================
   *  THE RING NEVER TRAVELS ABOVE ITS ANCHOR. NOT EVEN ON THE WAY OUT.
   * ===========================================================================
   *
   * The exit used to slide it to -(size + 8) — up and out — while the opacity
   * was still fading. So at the END of a refresh the ring visibly rose over the
   * purple announcement bar sitting above it. Parking off-screen was meant to
   * stop it "peeking through", but opacity 0 already does that, and the cost was
   * an animation that crossed the one element it was supposed to stay clear of.
   *
   * `translateY` is now clamped to >= 0 in EVERY phase. The ring is centred in
   * whatever gap is open — the live pull distance while dragging, the held gap
   * while refreshing — and on the way out it simply fades and shrinks where it
   * stands. There is no phase left in which it can overlap anything above it.
   */
  const gap = phase === "refreshing" ? refreshHold : pullDistance
  const translateY = phase === "idle" ? 0 : Math.max((gap - size) / 2, 0)

  const containerOpacity =
    phase === "refreshing"
      ? 1
      : phase === "idle"
        ? 0
        : Math.min(progress * 1.4, 1)

  // Shrinks away on exit instead of sliding away, so the eye reads it as
  // settling rather than escaping upwards.
  const scale =
    phase === "idle"
      ? 0.8
      : phase === "ready"
        ? 1.06
        : phase === "refreshing"
          ? 1
          : 0.9 + progress * 0.1

  const hasTransition = phase === "idle" || phase === "refreshing"

  // Progress arc (fills as you pull)
  const progressDash =
    phase === "refreshing"
      ? circumference * 0.75  // fixed arc length while spinning
      : circumference * progress

  return (
    <div
      aria-hidden
      className="absolute left-0 right-0 flex justify-center pointer-events-none z-20"
      style={{
        top: topOffset,
        transform: `translateY(${translateY}px) scale(${scale})`,
        opacity: containerOpacity,
        // The same curve and duration the caller uses to slide its content back,
        // so the ring and the page settle as one movement rather than two that
        // nearly agree. No transition while dragging — that must track the
        // finger exactly.
        transition: hasTransition
          ? "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.26s cubic-bezier(0.25, 1, 0.5, 1)"
          : "none",
        willChange: "transform, opacity",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        style={{
          ...(phase === "refreshing"
            ? { animation: "ptr-spin 0.75s linear infinite" }
            : {}),
        }}
      >
        {/* Track ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {/* Progress / spinner arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#9ca3af"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progressDash} ${circumference}`}
          strokeDashoffset={0}
          style={{
            transformOrigin: `${size / 2}px ${size / 2}px`,
            transform: "rotate(-90deg)",
          }}
        />
      </svg>

      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
