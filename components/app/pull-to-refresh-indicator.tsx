"use client"

import { type PullPhase } from "@/hooks/use-pull-to-refresh"

interface Props {
  pullDistance: number
  phase: PullPhase
  /** Same threshold used in usePullToRefresh (default: 72) */
  threshold?: number
}

/**
 * Small, native-iOS-style pull-to-refresh indicator.
 *
 * Mimics the UIActivityIndicatorView spinner from the reference screenshot:
 * a compact light-gray spinner, no container pill, no shadow — just the
 * spinner itself appearing above the content.
 *
 * Visual states:
 *   pulling    → partial arc rotates with pull progress (light gray)
 *   ready      → full arc (darker gray, ready to release)
 *   refreshing → continuous spin (light gray, iOS-style)
 *   idle       → fades out and slides up, extremely smooth
 */
export function PullToRefreshIndicator({ pullDistance, phase, threshold = 72 }: Props) {
  const progress = Math.min(pullDistance / threshold, 1)

  // Spinner size — small like iOS native (20×20)
  const size = 20

  // Vertical position follows pull; pinned when refreshing; off-screen when idle
  const translateY =
    phase === "refreshing"
      ? 14
      : phase === "idle"
        ? -30
        : Math.max(pullDistance - 28, -30)

  const opacity =
    phase === "refreshing"
      ? 1
      : phase === "idle"
        ? 0
        : Math.min(progress * 1.5, 1)

  // Use a very smooth spring-like easing for the return/pin transitions
  const hasTransition = phase === "idle" || phase === "refreshing"

  // SVG arc
  const r = 7.5
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference * (1 - progress)

  // Light gray palette matching iOS UIActivityIndicatorView
  const trackColor = "transparent"
  const arcColor =
    phase === "refreshing"
      ? "#9ca3af" // gray-400 — spinning
      : progress >= 1
        ? "#6b7280" // gray-500 — ready
        : "#d1d5db" // gray-300 — pulling

  return (
    <div
      aria-hidden
      className="absolute left-0 right-0 flex justify-center pointer-events-none z-20"
      style={{
        top: 0,
        transform: `translateY(${translateY}px)`,
        opacity,
        transition: hasTransition
          ? "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.35s ease-out"
          : "none",
        willChange: "transform, opacity",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        style={
          phase === "refreshing"
            ? { animation: "ptr-spin 0.65s linear infinite" }
            : { transform: `rotate(${progress * 270 - 90}deg)` }
        }
      >
        <circle cx="10" cy="10" r={r} stroke={trackColor} strokeWidth="2" />
        <circle
          cx="10"
          cy="10"
          r={r}
          stroke={arcColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={
            phase === "refreshing" ? circumference * 0.72 : dashOffset
          }
          transform="rotate(-90 10 10)"
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
