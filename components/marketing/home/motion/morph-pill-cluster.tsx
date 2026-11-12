"use client"

import { useEffect, useRef, useState } from "react"
import { MOTION_STYLE_PRECEDENCE, useMotionGate } from "./use-motion-gate"

/**
 * A pill that changes what it says and morphs to fit, with a satellite bubble
 * riding its tail. The pill is three layers (left cap, stretched middle, right
 * cap), so the width morph is transform only: the middle scales on X and the
 * tail translates. Nothing is laid out again while it moves.
 *
 * Server markup shows the first label as a plain pill; the client measures the
 * labels once and takes over. Reduced motion keeps the first label, still.
 */
export function MorphPillCluster({
  labels,
  prefix,
  interval = 2200,
  tone = "light",
  size = "md",
  className = "",
}: {
  labels: readonly string[]
  /** Static words before the pill, e.g. "Sell". */
  prefix?: string
  interval?: number
  tone?: "light" | "dark"
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const root = useRef<HTMLSpanElement>(null)
  const items = useRef<(HTMLSpanElement | null)[]>([])
  const running = useMotionGate(root)
  const [index, setIndex] = useState(0)
  const [previous, setPrevious] = useState(-1)
  const [metrics, setMetrics] = useState<{ widths: number[]; height: number } | null>(null)

  useEffect(() => {
    const measure = () => {
      const pill = root.current?.querySelector<HTMLElement>("[data-mp-pill]")
      if (!pill) return
      const height = pill.offsetHeight
      const pad = height * 0.62
      const widths = items.current.map((n) => Math.ceil((n?.offsetWidth ?? 0) + pad * 2))
      if (height && widths.every((w) => w > 0)) setMetrics({ widths, height })
    }
    // Fonts change label widths; measure again once they are in.
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
  }, [labels])

  useEffect(() => {
    if (!running || labels.length < 2) return
    const id = window.setInterval(() => {
      setIndex((i) => {
        setPrevious(i)
        return (i + 1) % labels.length
      })
    }, interval)
    return () => window.clearInterval(id)
  }, [running, interval, labels.length])

  const width = metrics?.widths[index] ?? 0
  const height = metrics?.height ?? 0
  const max = metrics ? Math.max(...metrics.widths) : 0

  return (
    <span
      ref={root}
      className={`mp-root ${className}`}
      data-tone={tone}
      data-size={size}
      data-motion-paused={running ? undefined : ""}
    >
      <style href="w12-morph-pill" precedence={MOTION_STYLE_PRECEDENCE}>{MORPH_PILL_CSS}</style>
      <span className="mp-sr">{[prefix, labels.join(", ")].filter(Boolean).join(" ")}</span>
      {prefix ? (
        <span className="mp-prefix" aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      <span
        className="mp-pill"
        data-mp-pill=""
        data-ready={metrics ? "" : undefined}
        aria-hidden="true"
        style={metrics ? { width: max + height * 0.9, height } : undefined}
      >
        {metrics ? (
          <>
            <span className="mp-cap" />
            <span
              className="mp-mid"
              style={{ left: height / 2, transform: `scaleX(${((width - height) / 100).toFixed(3)})` }}
            />
            <span className="mp-tail" style={{ transform: `translate3d(${width - height}px,0,0)` }}>
              <span className="mp-cap" />
              <span key={index} className="mp-sat" style={{ left: height + 6 }} />
            </span>
          </>
        ) : null}
        {labels.map((label, i) => (
          <span
            key={label}
            ref={(n) => {
              items.current[i] = n?.firstElementChild as HTMLSpanElement | null
            }}
            className="mp-label"
            data-state={i === index ? "on" : i === previous ? "out" : "off"}
            style={metrics ? { left: height * 0.62 } : undefined}
          >
            <span className="mp-text">{label}</span>
          </span>
        ))}
      </span>
    </span>
  )
}

export const MORPH_PILL_CSS = `
.mp-root{--mp-bg:linear-gradient(100deg,#7c3aed,#5b4cf0 55%,#4f46e5);--mp-ink:#fff;--mp-sat:#c4b5fd;--mp-prefix:inherit;--mp-spring:cubic-bezier(.34,1.56,.64,1);display:inline-flex;align-items:center;gap:.32em;vertical-align:middle;font-size:15px;line-height:1}
@supports (transition-timing-function:linear(0,1)){.mp-root{--mp-spring:linear(0,.009,.035 2.1%,.141,.281 6.7%,.723 12.9%,.938 16.7%,1.017,1.077,1.121,1.149 24.3%,1.159,1.163,1.161,1.154 29.9%,1.129 32.8%,1.051 39.6%,1.017 43.1%,.991,.977 51%,.974 53.8%,.975 57.1%,.997 69.8%,1.003 76.9%,1)}}
.mp-root[data-size="sm"]{font-size:13px}
.mp-root[data-size="lg"]{font-size:clamp(20px,2.2vw,30px);letter-spacing:-.02em}
.mp-root[data-tone="dark"]{--mp-sat:#a78bfa}
.mp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.mp-prefix{font-weight:500;color:var(--mp-prefix)}
.mp-pill{position:relative;display:inline-flex;align-items:center;height:2.3em;color:var(--mp-ink);font-weight:500;white-space:nowrap}
.mp-pill:not([data-ready]) .mp-label{position:absolute;visibility:hidden}
.mp-pill:not([data-ready]) .mp-label[data-state="on"]{position:relative;top:auto;visibility:visible;margin:0;display:inline-flex;align-items:center;height:100%;padding:0 .95em;border-radius:999px;background:var(--mp-bg)}
.mp-cap{position:absolute;left:0;top:0;height:100%;aspect-ratio:1;border-radius:999px;background:var(--mp-bg)}
.mp-mid{position:absolute;top:0;width:100px;height:100%;background:var(--mp-bg);transform-origin:0 50%;transition:transform 760ms var(--mp-spring)}
.mp-tail{position:absolute;inset:0 auto 0 0;height:100%;aspect-ratio:1;transition:transform 760ms var(--mp-spring)}
.mp-tail .mp-cap{background:linear-gradient(100deg,#5b4cf0,#4f46e5)}
.mp-sat{position:absolute;top:50%;width:.62em;height:.62em;margin-top:-.31em;border-radius:999px;background:var(--mp-sat);animation:mp-pop 900ms var(--mp-spring) both,mp-float 3.2s ease-in-out 900ms infinite}
.mp-label{position:absolute;top:50%;margin-top:-.5em;line-height:1;transition:opacity 260ms ease,transform 520ms var(--mp-spring)}
.mp-pill[data-ready] .mp-label[data-state="off"]{opacity:0;transform:translate3d(0,.9em,0)}
.mp-pill[data-ready] .mp-label[data-state="out"]{opacity:0;transform:translate3d(0,-.9em,0);transition:opacity 180ms ease,transform 300ms ease}
@keyframes mp-pop{0%{transform:scale(.2);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes mp-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(.12em,-.28em,0)}}
.mp-root[data-motion-paused] .mp-sat{animation-play-state:paused}
@media(prefers-reduced-motion:reduce){.mp-root *{transition:none!important;animation:none!important}}
`
