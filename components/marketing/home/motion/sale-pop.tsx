"use client"

import { useEffect, useRef, useState } from "react"
import { MOTION_STYLE_PRECEDENCE, useMotionGate } from "./use-motion-gate"

export type SalePopItem = { who: string; what: string; amount: string }

/**
 * Storelib's "new sale" notification, as it lands on a creator's phone: the
 * app icon, "New sale: $29.00", "Maya Ross bought Drum Kit Vol. 2 for $29.00."
 * (the in-app notice's own words, lib/notify/templates/catalog.ts).
 *
 * A stack, the way a phone shows them: each new sale slides in on top and
 * the earlier ones settle behind it, smaller, then fall away. Every card is
 * always in the DOM in a fixed-height box, and only its transform and
 * opacity move (CSS transitions between data-pos states), so nothing lays
 * out again and nothing shifts. The timer runs only while it is on screen in
 * a visible tab; reduced motion shows the first sale, still.
 */
export function SalePop({
  items,
  interval = 3400,
  tone = "light",
  className = "",
}: {
  items: readonly SalePopItem[]
  interval?: number
  tone?: "light" | "dark"
  className?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const running = useMotionGate(root)
  const [index, setIndex] = useState(0)
  const n = items.length
  useEffect(() => {
    if (!running || n < 2) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % n), interval)
    return () => window.clearInterval(id)
  }, [running, interval, n])
  if (!n) return null
  /* 0 is the front card, 1 and 2 sit behind it, 3 has just fallen away, the rest wait above, unseen. With fewer than five, only the front one shows. */
  const pos = (i: number) => {
    const d = (((index - i) % n) + n) % n
    return n < 5 ? (d === 0 ? 0 : 4) : Math.min(4, d)
  }
  return (
    <div ref={root} className={`sp-root ${className}`} data-tone={tone}>
      <style href="w12-sale-pop" precedence={MOTION_STYLE_PRECEDENCE}>{SALE_POP_CSS}</style>
      {items.map((item, i) => {
        const p = pos(i)
        return (
          <div key={i} className="sp-card" data-pos={p} aria-hidden={p !== 0 || undefined}>
            <img className="sp-icon" src="/storelib-mark.svg" alt="" width={38} height={38} loading="lazy" decoding="async" />
            <span className="sp-text">
              <span className="sp-top">
                <b className="sp-title">New sale: {item.amount}</b>
                <span className="sp-time">now</span>
              </span>
              <span className="sp-body">
                {item.who} bought {item.what} for {item.amount}.
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export const SALE_POP_CSS = `
.sp-root{--sp-bg:#fff;--sp-ink:#111113;--sp-muted:#5f5f6a;--sp-line:rgba(17,17,19,.07);--sp-ease:cubic-bezier(.32,.72,0,1);position:relative;display:block;height:100px;min-width:0}
.sp-root[data-tone="dark"]{--sp-bg:#1c1c1f;--sp-ink:#fafafa;--sp-muted:#a1a1aa;--sp-line:rgba(255,255,255,.08)}
.sp-card{position:absolute;left:0;right:0;top:0;display:flex;align-items:flex-start;gap:12px;padding:12px 14px 12px 12px;border-radius:20px;background:var(--sp-bg);box-shadow:0 0 0 1px var(--sp-line),0 1px 2px rgba(17,17,19,.06),0 12px 28px -14px rgba(17,17,19,.28);transform-origin:50% 0;opacity:0;transform:translate3d(0,-14px,0) scale(.98);transition:transform 640ms var(--sp-ease),opacity 240ms ease;box-sizing:border-box}
.sp-card[data-pos="0"]{z-index:3;opacity:1;transform:none;transition:transform 640ms var(--sp-ease),opacity 200ms ease 70ms}
.sp-card[data-pos="1"]{z-index:2;opacity:.8;transform:translate3d(0,9px,0) scale(.95)}
.sp-card[data-pos="2"]{z-index:1;opacity:.45;transform:translate3d(0,17px,0) scale(.9)}
.sp-card[data-pos="3"]{z-index:0;opacity:0;transform:translate3d(0,22px,0) scale(.86);transition-duration:520ms,260ms}
.sp-card[data-pos="4"]{z-index:0;opacity:0;transform:translate3d(0,-14px,0) scale(.98);transition:none}
.sp-icon{width:38px;height:38px;flex:none;border-radius:9px}
.sp-icon,.sp-text{transition:opacity 110ms ease}
.sp-card[data-pos="0"] .sp-icon,.sp-card[data-pos="0"] .sp-text{transition-duration:200ms}
/* Behind the front card only the card itself peeks out, as on a phone: its words fade so they never show through the one sliding in. */
.sp-card[data-pos="1"] .sp-icon,.sp-card[data-pos="1"] .sp-text,.sp-card[data-pos="2"] .sp-icon,.sp-card[data-pos="2"] .sp-text,.sp-card[data-pos="3"] .sp-icon,.sp-card[data-pos="3"] .sp-text{opacity:0}
.sp-text{display:grid;gap:2px;min-width:0;flex:1 1 auto;padding-top:1px}
.sp-top{display:flex;align-items:baseline;gap:8px}
.sp-title{flex:1 1 auto;min-width:0;font-size:14px;font-weight:600;letter-spacing:-.01em;color:var(--sp-ink);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-time{flex:none;font-size:12px;color:var(--sp-muted)}
.sp-body{font-size:13.5px;line-height:1.35;color:var(--sp-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@media(prefers-reduced-motion:reduce){.sp-card,.sp-icon,.sp-text{transition:none!important}}
`
