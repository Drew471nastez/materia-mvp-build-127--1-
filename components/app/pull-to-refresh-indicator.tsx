"use client"

import { SPINNER_SPOKES } from "@/components/community/member/place-spinner"
import { SPOKES_HOLD, SPOKES_SIZE } from "@/hooks/use-pull-to-refresh"

interface Props {
  /**
   * The hook's `indicatorRef`. Everything that moves in here is written to
   * these nodes by usePullToRefresh, one write per frame, never through React.
   */
  ref?: React.Ref<HTMLDivElement>
  /**
   * Pixels from the top of the scroll container to anchor the indicator.
   * Use this to push the spinner below a fixed bar (e.g. the announcement bar)
   * so it never overlaps it. Default: 0.
   */
  topOffset?: number
  /**
   * The gap, in px, that the page holds open while refreshing — the same value
   * the caller translates its content by. The spinner centres itself in it.
   *
   * Passed in rather than hardcoded so the two cannot drift: the position used
   * to be a literal 10px against a 34px gap, which was never actually centred
   * and would have silently gone wrong the moment the hold distance changed.
   */
  refreshHold?: number
}

/**
 * ===========================================================================
 *  iOS'S SPINNER, THE COMMUNITY'S OWN. IT RENDERS ONCE.
 * ===========================================================================
 * Round 13: "the iOS spinner the community uses" on the /app home. It was a
 * ring that drew itself round as the page was pulled; it is now the eight
 * spokes of components/community/member/place-spinner, appearing one by one
 * with the pull and turning with their fading tail while the page refreshes,
 * exactly as components/ui/pull-to-refresh.tsx draws them for /app analytics
 * and the community, so the three pulls are one.
 *
 * Nothing here is derived from a prop that changes. The markup is static;
 * usePullToRefresh holds a ref to it and writes, one write per frame, never
 * through React:
 *
 *   [data-ptr-indicator]  where it sits in the room the pull opens, how
 *                         large (never larger than that room), how visible
 *   [data-ptr-turn]       the box will-change is put on while it moves
 *   [data-ptr-spin]       the turn while refreshing (a CSS animation)
 *   [data-ptr-spoke]      each spoke's opacity
 *
 * The light tick as the pull crosses the line is the hook's (hapticTap:
 * @capacitor/haptics in the app, a vibration on Android, nothing in an
 * iPhone's browser).
 */
export function PullToRefreshIndicator({
  ref,
  topOffset = 0,
  refreshHold = SPOKES_HOLD,
}: Props) {
  /* The hold the hook was given: the spokes are drawn inside it, never larger (hooks/use-pull-to-refresh THE SPOKES). */
  void refreshHold
  return (
    <div
      ref={ref}
      aria-hidden
      data-ptr-indicator=""
      className="absolute left-1/2 pointer-events-none z-20 -ml-[12px] origin-center text-[#8a8f98]"
      style={{
        top: topOffset,
        width: SPOKES_SIZE,
        height: SPOKES_SIZE,
        /* The first frame, before a finger has touched anything: nothing, at the top of the room. The hook owns every frame after it. */
        transform: "translate3d(0, 0, 0) scale(0)",
        opacity: 0,
      }}
    >
      <span data-ptr-turn="" className="block h-full w-full">
        <span data-ptr-spin="" className="block h-full w-full">
          <svg viewBox="0 0 24 24" width={SPOKES_SIZE} height={SPOKES_SIZE} className="block">
            {SPINNER_SPOKES.map((l, i) => (
              <line key={i} data-ptr-spoke="" data-rest={l.opacity} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0 }} />
            ))}
          </svg>
        </span>
      </span>
      {/*
        The spin keeps running under prefers-reduced-motion: it is the only
        sign that the page is fetching anything. What that setting stops is
        the page's own travel, which the hook puts in place in one step.
      */}
      <style>{"@keyframes ptr-spokes-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>
    </div>
  )
}
