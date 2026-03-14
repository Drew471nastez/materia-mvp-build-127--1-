"use client"

import { type PullPhase } from "@/hooks/use-pull-to-refresh"

interface Props {
  pullDistance: number
  phase: PullPhase
  /** Same threshold used in usePullToRefresh (default: 72) */
  threshold?: number
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
export function PullToRefreshIndicator({ pullDistance, phase, threshold = 72 }: Props) {
  const progress = Math.min(pullDistance / threshold, 1)

  // Vertical position follows pull; pinned when refreshing; off-screen when idle
  const translateY =
    phase === "refreshing"
      ? 16
      : phase === "idle"
        ? -36
        : Math.max(pullDistance - 26, -36)

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

  // Ring geometry
  const size = 28
  const strokeWidth = 2.2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  // Track arc (full circle, very light)
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
        top: 0,
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
