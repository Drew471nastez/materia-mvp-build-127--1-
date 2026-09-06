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
export function PullToRefreshIndicator({ pullDistance, phase, threshold = 72, topOffset = 0 }: Props) {
  const progress = Math.min(pullDistance / threshold, 1)

  // Ring geometry (declared early so offScreen can use `size`)
  // 15% smaller than the original 22px
  const size = 19
  const strokeWidth = 2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  // Fully hidden above the topOffset anchor so it never peeks through
  const offScreen = -(size + 8)

  // Vertical position follows pull; pinned when refreshing; off-screen when idle.
  // During pulling/ready, center the indicator in the revealed gap (0 → pullDistance)
  // so it never overlaps the announcement bar that starts at y=pullDistance.
  // While VISIBLE the indicator never rises above its anchor: it is centred in
  // the gap the pull reveals, but clamped at 0 so a short pull (gap smaller than
  // the ring) cannot lift it over whatever sits above — the purple announcement
  // bar, in the dashboard's case. Only the hidden `idle` state goes negative,
  // and that is how it parks off-screen at opacity 0.
  const translateY =
    phase === "refreshing"
      ? 10
      : phase === "idle"
        ? offScreen
        : Math.max((pullDistance - size) / 2, 0)

  const containerOpacity =
    phase === "refreshing"
      ? 1
      : phase === "idle"
        ? 0
        : Math.min(progress * 1.4, 1)

  const scale =
    phase === "ready"
      ? 1.08
      : phase === "refreshing"
        ? 1
        : 0.88 + progress * 0.12

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
        transition: hasTransition
          ? "transform 0.38s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.32s ease-out"
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
