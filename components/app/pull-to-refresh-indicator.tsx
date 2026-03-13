"use client"

import { type PullPhase } from "@/hooks/use-pull-to-refresh"

interface Props {
  pullDistance: number
  phase: PullPhase
  /** Same threshold used in usePullToRefresh (default: 72) */
  threshold?: number
}

/**
 * Pull-to-refresh indicator that floats above the dashboard content.
 *
 * Visual states:
 *   pulling   — circle + partial-rotation arc, follows finger 1:1
 *   ready     — full arc, "release" pulse
 *   refreshing — spinning ring, pinned at rest position above content
 *   idle      — invisible, off-screen above
 */
export function PullToRefreshIndicator({ pullDistance, phase, threshold = 72 }: Props) {
  // Progress 0→1 as pull extends toward threshold
  const progress = Math.min(pullDistance / threshold, 1)

  // Where the pill sits vertically:
  //   idle      → –52px (above viewport, invisible)
  //   pulling   → pullDistance – 52 (follows finger, starting off-screen)
  //   ready     → pullDistance – 52 (same, just changes ring colour)
  //   refreshing → 8px below top of scroll container
  const pillSize = 44
  const restOffset = 8 // px below scroll container top when refreshing

  const translateY =
    phase === "refreshing"
      ? restOffset
      : phase === "idle"
        ? -(pillSize + 8)
        : pullDistance - pillSize - 8

  const isSpinning = phase === "refreshing"

  // SVG arc for pull progress
  const radius = 13
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - progress)

  return (
    <div
      aria-hidden
      className="absolute left-0 right-0 flex justify-center pointer-events-none z-20"
      style={{
        top: 0,
        transform: `translateY(${translateY}px)`,
        transition:
          phase === "idle" || phase === "refreshing"
            ? "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)"
            : "none",
        willChange: "transform",
      }}
    >
      <div
        className="flex items-center justify-center bg-white rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.12)] border border-gray-100"
        style={{ width: pillSize, height: pillSize }}
      >
        {isSpinning ? (
          /* Spinning ring when data is loading */
          <svg
            width="22"
            height="22"
            viewBox="0 0 32 32"
            fill="none"
            style={{ animation: "ptr-spin 0.7s linear infinite" }}
          >
            <circle cx="16" cy="16" r={radius} stroke="#e5e7eb" strokeWidth="3" />
            <circle
              cx="16"
              cy="16"
              r={radius}
              stroke="#8b5cf6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * 0.75}
              transform="rotate(-90 16 16)"
            />
          </svg>
        ) : (
          /* Arc that fills as user pulls */
          <svg
            width="22"
            height="22"
            viewBox="0 0 32 32"
            fill="none"
            style={{
              transform: `rotate(${progress * 360 - 90}deg)`,
              transition: "none",
            }}
          >
            <circle cx="16" cy="16" r={radius} stroke="#e5e7eb" strokeWidth="3" />
            <circle
              cx="16"
              cy="16"
              r={radius}
              stroke={progress >= 1 ? "#8b5cf6" : "#a78bfa"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 16 16)"
              style={{
                transition: progress >= 1 ? "stroke 0.15s" : "none",
              }}
            />
          </svg>
        )}
      </div>

      {/* Keyframe for the spinning state */}
      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
