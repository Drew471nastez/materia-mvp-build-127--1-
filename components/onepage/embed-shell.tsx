"use client"

/**
 * ===========================================================================
 *  THE PLACE AN EMBED ARRIVES IN (round AS)
 * ===========================================================================
 * What a player, a map or a video shows while its frame is on the way: the
 * service's own shape at the service's own size, in the sheet's quiet fill
 * (an artwork square, two lines and a round play button for a song; rows
 * for a list; a video's own picture), so when the frame is ready it takes
 * exactly that place and nothing moves.
 *
 * The frame is drawn from the first render (in the sheet it loads at once,
 * lib/onepage/embed-warm), kept clear until it says it has loaded, then
 * shown at once over the shape; regardless after SHOW_ANYWAY_MS, so a frame
 * whose load is never heard (a blocked service) still shows what it has.
 */
import * as React from "react"
import { useInBlockSheet } from "./block-sheet-context"

export const SHOW_ANYWAY_MS = 4000
export const FRAME_FADE_MS = 160

/** Whether the frame has loaded, and the handler to put on it. Shown anyway after SHOW_ANYWAY_MS. */
export function useFrameShown(src: string | null | undefined): [boolean, () => void] {
  const [loaded, setLoaded] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!src) return
    const t = window.setTimeout(() => setLoaded(src), SHOW_ANYWAY_MS)
    return () => window.clearTimeout(t)
  }, [src])
  return [!!src && loaded === src, React.useCallback(() => setLoaded(src ?? null), [src])]
}

/** "lazy" on the page, "eager" in the sheet: a sheet is on screen the moment it exists, and a lazy frame waits a frame or more to be seen. */
export function useFrameLoading(): "lazy" | "eager" {
  return useInBlockSheet() ? "eager" : "lazy"
}

/**
 * The frame's own style while it arrives: clear until it has loaded, then
 * there at once over its shape (which fades out under it). A fade on the
 * frame itself only made a loaded player later to read
 * (scripts/check-onepage-embed-speed.mjs: 160ms on every open).
 */
export function frameFade(shown: boolean): React.CSSProperties {
  return { opacity: shown ? 1 : 0 }
}

/* The sheet's quiet fill, or a grey that reads on any page outside it. */
const FILL = "var(--sheet-field, rgba(127,127,127,0.12))"
const MARK = "color-mix(in srgb, var(--sheet-ink, #808080) 12%, transparent)"

/**
 * A player's shape: `single` a song (artwork, title, artist, play), else a
 * list (artwork and title above, rows under). Drawn under the frame, fading
 * out once the frame is shown.
 */
export function PlayerShape({ single, shown, radius, art = null }: { single: boolean; shown: boolean; radius: number; art?: string | null }) {
  const bar = (w: string, h = 10) => <span className="block rounded-full" style={{ width: w, height: h, background: MARK }} />
  return (
    <span
      aria-hidden
      data-embed-shape={single ? "single" : "list"}
      className="pointer-events-none absolute inset-0 flex flex-col overflow-hidden motion-safe:transition-opacity"
      style={{ background: FILL, borderRadius: radius, opacity: shown ? 0 : 1, transitionDuration: `${FRAME_FADE_MS}ms`, padding: 16, gap: 14 }}
    >
      <span className="flex items-center" style={{ gap: 14, height: single ? "100%" : 120 }}>
        <span
          className="block shrink-0 bg-cover bg-center"
          style={{ height: single ? "min(100%, 120px)" : 120, aspectRatio: "1 / 1", borderRadius: 8, background: art ? `center / cover no-repeat url("${art}")` : MARK }}
        />
        <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 9 }}>
          {bar("62%", 12)}
          {bar("38%")}
        </span>
        {single ? <span className="block shrink-0 rounded-full" style={{ width: 36, height: 36, background: MARK }} /> : null}
      </span>
      {single
        ? null
        : [0, 1, 2, 3].map((i) => (
            <span key={i} className="flex items-center" style={{ gap: 12 }}>
              {bar("18px", 10)}
              {bar(`${54 - i * 6}%`)}
            </span>
          ))}
    </span>
  )
}
