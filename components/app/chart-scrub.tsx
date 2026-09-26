"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ONE WAY TO READ A TREND CHART, WITH A POINTER OR A FINGER, ON EVERY CHART
 * ═══════════════════════════════════════════════════════════════════════════
 * The home page's chart, the Analytics chart and the report cards under it
 * each read a pointer their own way, and the owner could feel it: "it is not
 * the same feeling as the chart on the homepage. It needs to be the same
 * smooth moving tooltip at full frame rate."
 *
 * Measured before this existed (scripts/check-chart-feel.mjs, 30 points, one
 * move a frame):
 *
 *   home, finger       the readout followed the thumb (2px behind it), but
 *                      each point crossed re-ran recharts for its dot and its
 *                      crosshair: 2.8 DOM changes and 3.7 to 4.5ms of main
 *                      thread per move
 *   home, mouse        recharts' own tooltip: set beside the pointer, a
 *                      React render of the whole chart per point crossed
 *   Analytics, both    the readout snapped to the point and glided there
 *                      over 140ms, so it trailed a moving finger by 6px and a
 *                      mouse by 17px, and every point crossed was a React
 *                      render of the chart
 *   all three          the readout vanished the instant the pointer left
 *
 * So there is one layer now, and every chart draws it over its plot:
 *
 *   THE READOUT FOLLOWS THE POINTER, every frame, by a transform written
 *   straight to the node. It is never behind the pointer, whichever input.
 *
 *   THE CROSSHAIR AND THE DOTS MARK A REAL POINT. They sit on the nearest
 *   day, because a day is what the readout reports, and move to the next one
 *   by a 120ms transform the compositor runs.
 *
 *   REACT IS NOT INVOLVED WHILE IT MOVES. The readout's text is written when
 *   a new point is crossed and at no other time; nothing is rendered per
 *   move, so a move costs the same whatever the chart has drawn under it.
 *
 *   IT FADES. In over 160ms, out over 120ms on the same curve, from where it
 *   was, so letting go does not make it blink out.
 *
 * THE GESTURE, for a finger. Nothing is taken from the page until the
 * gesture says so: a sideways drag scrubs and the page stays put; a hold of
 * 100ms scrubs too; a drag that goes down the screen first is a scroll and
 * the chart lets go of it, even after a hold, so a slow thumb is never
 * trapped. And once the page is moving (a move the browser will not let be
 * cancelled) the gesture is the page's for good. Each point crossed is a light tick, the first a firmer one.
 * Nothing cancels a touchstart, so the browser can always still scroll.
 *
 * ONE STABLE THING FOR A FINGER TO LAND ON. A touch belongs to the node it
 * started on for the whole gesture, so this layer lies over the plot, is
 * rendered unconditionally and never re-keyed, and every touch lands on it,
 * never on a path recharts might replace mid gesture.
 */
import * as React from "react"
import { hapticTap } from "@/lib/native-bridge"

/** A crosshair or a dot moving from one point to the next. */
export const SCRUB_GLIDE = "transform 120ms cubic-bezier(0.2, 0, 0, 1)"
/** The readout arriving and leaving: one curve, a little longer in than out. */
export const SCRUB_FADE_IN_MS = 160
export const SCRUB_FADE_OUT_MS = 120
export const SCRUB_FADE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)"

const SLOP_X = 8
const SLOP_Y = 12
const HOLD_MS = 100

/** One line's dots, in pixels from the top of the layer, one per point. */
export interface ScrubSeries {
  ys: ReadonlyArray<number | null>
  color: string
  /** A white dot with a coloured ring: the period something is compared with. */
  hollow?: boolean
}

/**
 * One line of the readout: what it is, and its number at a point. The number
 * is asked for each time a new point is crossed; null hides the line there.
 */
export interface ScrubRow {
  label?: string
  value: (i: number) => string | null
  mark: "line" | "dashed" | null
  tone: "value" | "compared" | "note"
  color?: string
}

export interface ChartScrubProps {
  /** How many points the plot spreads across its width. */
  count: number
  /** The plot's inset from the layer's left and right edges, in pixels. */
  left: number
  right: number
  /** Where the crosshair starts and ends, from the layer's top. */
  top: number
  bottom: number
  series: ScrubSeries[]
  title: (i: number) => string
  rows: ScrubRow[]
  /** A placeholder has nothing to read: no readout, and touches pass to the page. */
  disabled?: boolean
  /** Dark on the trend charts, light on the report cards. */
  tone?: "dark" | "light"
  /** Where the readout sits, from the layer's top. */
  readoutTop?: number
  crosshairColor?: string
}

type Input = "mouse" | "touch"

function ChartScrubLayer({
  count,
  left,
  right,
  top,
  bottom,
  series,
  title,
  rows,
  disabled = false,
  tone = "dark",
  readoutTop = 0,
  crosshairColor = "#c4b5fd",
}: ChartScrubProps) {
  const layerRef = React.useRef<HTMLDivElement>(null)
  const markerRef = React.useRef<HTMLDivElement>(null)
  const crossRef = React.useRef<HTMLDivElement>(null)
  const dotRefs = React.useRef<Array<HTMLDivElement | null>>([])
  const tipRef = React.useRef<HTMLDivElement>(null)
  const titleRef = React.useRef<HTMLParagraphElement>(null)
  const rowRefs = React.useRef<Array<HTMLParagraphElement | null>>([])
  const textRefs = React.useRef<Array<HTMLSpanElement | null>>([])

  /*
    EVERYTHING A MOVE READS, IN ONE REF. The props are copied in on every
    render, so the listeners below are attached once and always see the
    chart as it is now, and a new series never re-attaches anything.
  */
  const live = React.useRef({ count, left, right, top, bottom, series, title, rows, disabled })
  live.current = { count, left, right, top, bottom, series, title, rows, disabled }

  const run = React.useRef({
    shown: false,
    input: null as Input | null,
    clientX: 0,
    index: -1,
    frame: 0,
    glide: 0,
  })

  /** The x of a point, from the layer's left edge. */
  const xOf = (i: number, width: number) => {
    const { count: n, left: l, right: r } = live.current
    const plot = Math.max(0, width - l - r)
    return n <= 1 ? l + plot / 2 : l + (i / (n - 1)) * plot
  }

  /** Write the point's numbers into the readout and move the marks to it. */
  const mark = (i: number, width: number) => {
    const { series: s, title: t, rows: rs } = live.current
    const x = xOf(i, width)
    const cross = crossRef.current
    if (cross) cross.style.transform = `translateX(${x.toFixed(1)}px)`
    s.forEach((line, k) => {
      const dot = dotRefs.current[k]
      if (!dot) return
      const y = line.ys[i]
      if (y === null || y === undefined || !Number.isFinite(y)) {
        dot.style.visibility = "hidden"
        return
      }
      dot.style.visibility = ""
      dot.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    })
    if (titleRef.current) titleRef.current.textContent = t(i)
    rs.forEach((row, k) => {
      const text = row.value(i)
      const line = rowRefs.current[k]
      const span = textRefs.current[k]
      if (!line || !span) return
      if (text === null) {
        line.style.display = "none"
        return
      }
      line.style.display = "flex"
      if (span.textContent !== text) span.textContent = text
    })
  }

  /** One frame: the readout to the pointer, and the marks to its point when it is a new one. */
  const paint = () => {
    const r = run.current
    r.frame = 0
    const layer = layerRef.current
    const tip = tipRef.current
    const { count: n, left: l, right: rr } = live.current
    if (!layer || !tip || !r.input || n === 0) return
    const box = layer.getBoundingClientRect()
    const width = box.width
    const x = Math.max(l, Math.min(width - rr, r.clientX - box.left))
    const plot = Math.max(1, width - l - rr)
    const i = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((x - l) / plot) * (n - 1))))

    /* Centred on the pointer, held 8px inside the card by its own width. */
    tip.style.transform = `translateX(clamp(8px, calc(${x.toFixed(1)}px - 50%), calc(${width.toFixed(1)}px - 100% - 8px))) translateZ(0)`

    const arriving = !r.shown
    if (i !== r.index) {
      if (r.input === "touch") hapticTap(r.index < 0 ? "medium" : "light")
      r.index = i
      if (arriving) setGlide(false)
      mark(i, width)
    }
    if (arriving) {
      r.shown = true
      fade(true)
      /*
        The first placement is a cut. After it, under a mouse the marks glide
        from point to point, as the home page's chart always did; under a
        finger they cut, as they did there too, because a thumb covers the
        glide and only feels the lag.
      */
      cancelAnimationFrame(r.glide)
      if (r.input === "mouse") r.glide = requestAnimationFrame(() => setGlide(true))
    }
  }

  const setGlide = (on: boolean) => {
    /* Asked for less motion: the marks cut from point to point; the readout still only fades. */
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const t = on && !calm ? SCRUB_GLIDE : "none"
    if (crossRef.current) crossRef.current.style.transition = t
    dotRefs.current.forEach((d) => d && (d.style.transition = t))
  }

  const fade = (show: boolean) => {
    const ms = show ? SCRUB_FADE_IN_MS : SCRUB_FADE_OUT_MS
    const t = `opacity ${ms}ms ${SCRUB_FADE_EASE}`
    for (const el of [tipRef.current, markerRef.current]) {
      if (!el) continue
      el.style.transition = t
      el.style.opacity = show ? "1" : "0"
    }
  }

  const move = (clientX: number, input: Input) => {
    if (live.current.disabled) return
    const r = run.current
    r.input = input
    r.clientX = clientX
    if (!r.frame) r.frame = requestAnimationFrame(paint)
  }

  const leave = () => {
    const r = run.current
    cancelAnimationFrame(r.frame)
    cancelAnimationFrame(r.glide)
    r.frame = 0
    r.input = null
    if (!r.shown) return
    r.shown = false
    r.index = -1
    fade(false)
  }

  /* The finger. Native listeners, because the move has to be cancellable. */
  React.useEffect(() => {
    const el = layerRef.current
    if (!el) return
    let start: { x: number; y: number } | null = null
    let lastX = 0
    let lock: "horizontal" | "vertical" | null = null
    let scrubbing = false
    let moved = false
    let hold: ReturnType<typeof setTimeout> | null = null

    const release = () => {
      if (hold) clearTimeout(hold)
      hold = null
      start = null
      lock = null
      scrubbing = false
      if (run.current.input === "touch") leave()
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || live.current.disabled) return release()
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY }
      lastX = t.clientX
      lock = null
      moved = false
      hold = setTimeout(() => {
        if (lock === "vertical") return
        lock = "horizontal"
        scrubbing = true
        move(lastX, "touch")
      }, HOLD_MS)
    }

    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      lastX = t.clientX
      const dx = Math.abs(t.clientX - start.x)
      const dy = Math.abs(t.clientY - start.y)
      if (dx > SLOP_X) moved = true

      /*
        THE BROWSER ALREADY HAS IT. A move that cannot be cancelled is one
        the page is scrolling with: the chart never starts a scrub under a
        moving page, and lets go of one that is showing. Without this a
        thumb going down the page at a slant could open the readout halfway
        down, because nothing stopped a later sideways step from claiming a
        gesture the page had already taken.
      */
      if (!e.cancelable) {
        if (hold) clearTimeout(hold)
        hold = null
        lock = "vertical"
        if (scrubbing) {
          scrubbing = false
          leave()
        }
        return
      }

      if (scrubbing) {
        /* A hold that turns into a scroll is a scroll. */
        if (!moved && dy > SLOP_Y) {
          lock = "vertical"
          scrubbing = false
          leave()
          return
        }
        if (e.cancelable) e.preventDefault()
        move(t.clientX, "touch")
        return
      }

      if (lock === null && (dx > SLOP_X || dy > SLOP_Y)) {
        if (dx > dy) {
          lock = "horizontal"
          if (hold) clearTimeout(hold)
          scrubbing = true
          if (e.cancelable) e.preventDefault()
          move(t.clientX, "touch")
        } else if (dy > dx * 1.4) {
          lock = "vertical"
          if (hold) clearTimeout(hold)
        }
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", release, { passive: true })
    el.addEventListener("touchcancel", release, { passive: true })
    return () => {
      release()
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", release)
      el.removeEventListener("touchcancel", release)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
    NEW NUMBERS UNDER A READOUT THAT IS SHOWING (a tab, a refresh) are
    written into it at once, at the point it is on. And a chart that becomes
    a placeholder lets go.
  */
  React.useLayoutEffect(() => {
    const r = run.current
    if (disabled) {
      leave()
      return
    }
    if (!r.shown || r.index < 0 || !layerRef.current) return
    const width = layerRef.current.getBoundingClientRect().width
    r.index = Math.min(r.index, Math.max(0, count - 1))
    mark(r.index, width)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, rows, title, count, left, right, disabled])

  React.useEffect(
    () => () => {
      cancelAnimationFrame(run.current.frame)
      cancelAnimationFrame(run.current.glide)
    },
    [],
  )

  const dark = tone === "dark"
  return (
    <div
      ref={layerRef}
      aria-hidden
      data-chart-touch-shield
      onPointerMove={(e) => {
        if (e.pointerType !== "touch") move(e.clientX, "mouse")
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") leave()
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        /*
          THE VERTICAL AXIS BELONGS TO THE BROWSER. The page scrolls from
          here on the compositor, the way it scrolls from the cards above and
          below; the chart keeps the horizontal axis, which is the one a
          scrub is made of. A constant: it is read once, at touchstart.
        */
        touchAction: "pan-y",
        pointerEvents: disabled ? "none" : "auto",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      } as React.CSSProperties}
    >
      {/*
        THE MARKS ARE BOXES, NOT SVG. A transform on an SVG child is drawn by
        the main thread every frame of its glide; a box with its own layer is
        moved by the compositor. So the crosshair is a 1px strip dashed by a
        gradient and each dot is a round box, drawn at the origin and moved.
      */}
      <div ref={markerRef} data-chart-marker style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none", willChange: "opacity" }}>
        <div
          ref={crossRef}
          data-chart-crosshair
          style={{
            position: "absolute",
            left: 0,
            top,
            width: 1,
            height: Math.max(0, bottom - top),
            marginLeft: -0.5,
            background: `repeating-linear-gradient(to bottom, ${crosshairColor} 0 4px, transparent 4px 7px)`,
            willChange: "transform",
          }}
        />
        {series.map((s, k) => {
          /* The same round marks the SVG drew: r 5.5 with a 2.5 ring, r 3.5 with a 1.5 ring, ring centred on the edge. */
          const ring = s.hollow ? 1.5 : 2.5
          const size = (s.hollow ? 3.5 : 5.5) * 2 - ring
          return (
            <div
              key={k}
              ref={(el) => {
                dotRefs.current[k] = el
              }}
              data-chart-active-dot
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: size,
                height: size,
                margin: -(size / 2 + ring),
                boxSizing: "content-box",
                borderRadius: "50%",
                background: s.hollow ? "#fff" : s.color,
                border: `${ring}px solid ${s.hollow ? s.color : "#fff"}`,
                boxShadow: s.hollow ? undefined : `0 1px 3px ${s.color}66`,
                willChange: "transform",
              }}
            />
          )
        })}
      </div>

      {/* The readout: pinned left, the whole position in the transform, never wider than the card. */}
      <div
        ref={tipRef}
        data-chart-tooltip
        style={{
          position: "absolute",
          top: readoutTop,
          left: 0,
          opacity: 0,
          maxWidth: "calc(100% - 16px)",
          pointerEvents: "none",
          zIndex: 10,
          whiteSpace: "nowrap",
          willChange: "transform, opacity",
          borderRadius: 8,
          padding: dark ? "6px 10px" : "8px 12px",
          fontSize: 12,
          background: dark ? "#1a1a2e" : "#fff",
          color: dark ? "#fff" : "#1a1a2e",
          border: dark ? "none" : "1px solid #e5e7eb",
          boxShadow: dark ? "0 4px 12px rgba(0,0,0,0.15)" : "0 10px 28px -8px rgba(17,24,39,0.22)",
        }}
      >
        <p ref={titleRef} style={{ fontSize: 11, color: dark ? "#9ca3af" : "#6b7280", margin: 0, marginBottom: 2, fontWeight: dark ? 400 : 500 }} />
        {rows.map((row, k) => {
          const swatch =
            row.mark === "line" ? (
              <span style={{ width: dark ? 8 : 12, height: 2, borderRadius: 1, background: row.color ?? "#8b5cf6", display: "inline-block", flexShrink: 0 }} />
            ) : row.mark === "dashed" ? (
              <span style={{ width: dark ? 8 : 12, height: 0, borderTop: `2px dashed ${row.color ?? "#b8bcc6"}`, display: "inline-block", flexShrink: 0 }} />
            ) : null
          const value = (
            <span
              className="tabular-nums"
              ref={(el) => {
                textRefs.current[k] = el
              }}
            />
          )
          const ink = row.tone === "value" ? (dark ? "#fff" : "#1a1a2e") : row.tone === "note" ? "#f59e0b" : dark ? "#c9ccd3" : "#4b5563"
          return (
            <p
              key={k}
              ref={(el) => {
                rowRefs.current[k] = el
              }}
              style={{
                margin: 0,
                marginTop: row.tone === "note" ? 2 : 0,
                display: "flex",
                alignItems: "center",
                justifyContent: dark ? "flex-start" : "space-between",
                gap: dark ? 6 : 16,
                fontSize: row.tone === "note" ? 10 : 12,
                color: ink,
              }}
            >
              {dark ? (
                <>
                  {swatch}
                  <span style={{ fontWeight: row.tone === "value" ? 600 : 400 }}>
                    {row.label ? `${row.label}: ` : null}
                    {value}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, color: row.tone === "value" ? "#4b5563" : "#6b7280" }}>
                    {swatch}
                    {row.label}
                  </span>
                  <span style={{ fontWeight: row.tone === "value" ? 600 : 400 }}>{value}</span>
                </>
              )}
            </p>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Memoised: the charts hand it memoised series, rows and title, so a render
 * of the page above it (a report card morphing its line, a poll landing)
 * does not reach it.
 */
export const ChartScrub = React.memo(ChartScrubLayer)
