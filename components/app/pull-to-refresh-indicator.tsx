"use client"

import {
  PULL_TO_REFRESH,
  RING_CIRCUMFERENCE,
} from "@/hooks/use-pull-to-refresh"

interface Props {
  /**
   * The hook's `indicatorRef`. Everything that moves in here is written to
   * these nodes by usePullToRefresh, one write per frame, never through React.
   */
  ref?: React.Ref<HTMLDivElement>
  /**
   * Pixels from the top of the scroll container to anchor the indicator.
   * Use this to push the ring below a fixed bar (e.g. the announcement bar)
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
 * ===========================================================================
 *  THE RING. IT RENDERS ONCE.
 * ===========================================================================
 *
 * This used to take `pullDistance` and `phase` and recompute a transform, an
 * opacity, a scale and a strokeDasharray on every render — which meant React
 * ran, and the dashboard around it re-rendered, on every frame of a drag.
 *
 * Nothing here is derived from a prop that changes any more. The markup is
 * static; usePullToRefresh holds a ref to it and writes:
 *
 *   [data-ptr-indicator]  transform (translate + scale), opacity
 *   [data-ptr-turn]       the rotation the pull itself puts on the ring
 *   [data-ptr-spin]       the CSS spin, started when the refresh starts
 *   [data-ptr-arc]        stroke-dasharray, the only per-frame attribute
 *
 * THE TWO ROTATIONS ARE NESTED ON PURPOSE. The spin is a keyframe animation
 * on `transform`, so it overwrites whatever inline rotation it lands on. When
 * they shared one element, starting the spin threw away the angle the pull had
 * reached and the ring visibly jumped; ending it threw the angle back to zero
 * and the ring jerked backwards while it was still fading out. Nested, the
 * pull's angle sits on the outer node and stays put, the spin runs on the
 * inner one, and the two compose into one continuous turn from the first
 * millimetre of the drag to the last frame of the fade.
 */
export function PullToRefreshIndicator({
  ref,
  topOffset = 0,
  refreshHold = PULL_TO_REFRESH.refreshHold,
}: Props) {
  const size = PULL_TO_REFRESH.ringSize
  const strokeWidth = 2
  const radius = (size - strokeWidth) / 2

  /**
   * Where the ring sits with nothing happening, which is also where a refresh
   * leaves it and where it fades out from — so the exit involves no vertical
   * movement at all. Clamped at 0, so no phase can place it above its anchor
   * and over the bar sitting there.
   */
  const restingY = Math.max((refreshHold - size) / 2, 0)

  return (
    <div
      ref={ref}
      aria-hidden
      data-ptr-indicator=""
      className="absolute left-0 right-0 flex justify-center pointer-events-none z-20"
      style={{
        top: topOffset,
        /* The first frame, before a finger has touched anything. The hook owns
           every frame after it. No will-change here: it is added while a pull
           or a settle is in flight and taken off again, rather than holding a
           compositor layer for the whole life of the page. */
        transform: `translate3d(0, ${restingY}px, 0) scale(0.82)`,
        opacity: 0,
      }}
    >
      <svg
        data-ptr-turn=""
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {/* Arc. Starts at twelve o'clock and grows clockwise with the pull. */}
        <g
          data-ptr-spin=""
          style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}
        >
          <circle
            data-ptr-arc=""
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#9ca3af"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`0 ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={0}
            style={{
              transformOrigin: `${size / 2}px ${size / 2}px`,
              transform: "rotate(-90deg)",
            }}
          />
        </g>
      </svg>

      {/*
        The spin keeps running under prefers-reduced-motion, and that is the
        right way round: it is the only sign that the page is fetching
        anything, and a 19px ring turning in place is not the motion that
        setting is there to stop. What it does stop is the page's own travel,
        which usePullToRefresh handles by putting the content where it belongs
        in one step instead of springing it there.
      */}
      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
