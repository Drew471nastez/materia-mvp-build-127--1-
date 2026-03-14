"use client"

import { type PullPhase } from "@/hooks/use-pull-to-refresh"

interface Props {
  pullDistance: number
  phase: PullPhase
  /** Same threshold used in usePullToRefresh (default: 72) */
  threshold?: number
}

/**
 * Native iOS UIActivityIndicatorView-style pull-to-refresh indicator.
 *
 * Uses 12 rounded blades arranged in a clock pattern, each fading with a
 * staggered delay — exactly matching iOS's native activity spinner.
 *
 * Visual states:
 *   pulling    → static blades fade in (gradient opacity) as you pull
 *   ready      → static blades at full opacity (ready to release)
 *   refreshing → animated blade fade cycling (iOS spinner animation)
 *   idle       → fades out and slides up off-screen
 */
export function PullToRefreshIndicator({ pullDistance, phase, threshold = 72 }: Props) {
  const progress = Math.min(pullDistance / threshold, 1)

  // Vertical position follows pull; pinned when refreshing; off-screen when idle
  const translateY =
    phase === "refreshing"
      ? 14
      : phase === "idle"
        ? -30
        : Math.max(pullDistance - 28, -30)

  const containerOpacity =
    phase === "refreshing"
      ? 1
      : phase === "idle"
        ? 0
        : Math.min(progress * 1.5, 1)

  const hasTransition = phase === "idle" || phase === "refreshing"

  // Blade color — matches iOS UIActivityIndicatorView default gray
  const bladeColor = "#69717d"

  return (
    <div
      aria-hidden
      className="absolute left-0 right-0 flex justify-center pointer-events-none z-20"
      style={{
        top: 0,
        transform: `translateY(${translateY}px)`,
        opacity: containerOpacity,
        transition: hasTransition
          ? "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.35s ease-out"
          : "none",
        willChange: "transform, opacity",
      }}
    >
      {/* 24×24 viewBox scaled from the canonical 48×48 iOS spinner geometry */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        {Array.from({ length: 12 }, (_, i) => {
          const rotation = i * 30
          const delay = i * 0.083

          // Static (non-animating) opacity: blade 0 is brightest, fading around
          const staticOpacity =
            phase === "refreshing"
              ? undefined // let CSS animation handle opacity
              : ((12 - i) / 12) * 0.9 * (phase === "ready" ? 1 : progress) + 0.08 * progress

          return (
            <rect
              key={i}
              // Blade centred horizontally (x = 12 − width/2 = 11.1)
              // placed at the bottom of the viewBox (y = 24 − height = 17.35)
              x="11.1"
              y="17.35"
              width="1.78"
              height="6.65"
              rx="1.33"
              fill={bladeColor}
              style={{
                transformOrigin: "12px 12px",
                transform: `rotate(${rotation}deg)`,
                ...(phase === "refreshing"
                  ? { animation: `ptr-blade-fade 1s ${delay}s infinite linear` }
                  : { opacity: staticOpacity }),
              }}
            />
          )
        })}
      </svg>

      <style>{`
        @keyframes ptr-blade-fade {
          0%   { opacity: 1; }
          100% { opacity: 0.15; }
        }
      `}</style>
    </div>
  )
}
