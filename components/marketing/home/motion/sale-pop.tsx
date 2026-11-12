"use client"

import { useEffect, useRef, useState } from "react"
import { MOTION_STYLE_PRECEDENCE, useMotionGate } from "./use-motion-gate"

export type SalePopItem = { who: string; what: string; amount: string; initials?: string }

/**
 * An order notification that pops in, holds, and pops out for the next one,
 * like a phone lighting up on the desk. One element moves at a time (scale,
 * translate, opacity), the timer stops offscreen and in background tabs, and
 * reduced motion shows the first order still.
 */
export function SalePop({
  items,
  interval = 3200,
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
  useEffect(() => {
    if (!running || items.length < 2) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % items.length), interval)
    return () => window.clearInterval(id)
  }, [running, interval, items.length])
  const item = items[index]
  if (!item) return null
  return (
    <div ref={root} className={`sp-root ${className}`} data-tone={tone}>
      <style href="w12-sale-pop" precedence={MOTION_STYLE_PRECEDENCE}>{SALE_POP_CSS}</style>
      <div
        key={index}
        className="sp-card"
        data-animate={running ? "" : undefined}
        style={{ animationDuration: `${interval}ms` }}
      >
        <span className="sp-avatar" aria-hidden="true">
          {item.initials ?? item.who.slice(0, 1)}
        </span>
        <span className="sp-text">
          <span className="sp-title">
            New order <span className="sp-amount">{item.amount}</span>
          </span>
          <span className="sp-sub">
            {item.who} bought {item.what}
          </span>
        </span>
      </div>
    </div>
  )
}

export const SALE_POP_CSS = `
.sp-root{--sp-bg:#fff;--sp-ink:#18181b;--sp-muted:#6b6b76;--sp-line:rgba(24,24,27,.08);display:inline-grid;min-width:0}
.sp-root[data-tone="dark"]{--sp-bg:#161618;--sp-ink:#fafafa;--sp-muted:#a1a1aa;--sp-line:rgba(255,255,255,.1)}
.sp-card{display:flex;align-items:center;gap:10px;max-width:100%;padding:9px 16px 9px 9px;border-radius:999px;background:var(--sp-bg);box-shadow:0 0 0 1px var(--sp-line),0 14px 30px -18px rgba(24,24,27,.45);transform-origin:20% 50%}
.sp-card[data-animate]{animation:sp-in 3.2s cubic-bezier(.34,1.56,.64,1) both}
.sp-avatar{display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:999px;background:linear-gradient(135deg,#8b5cf6,#4f46e5);color:#fff;font-size:12px;font-weight:600}
.sp-text{display:grid;gap:2px;min-width:0}
.sp-title{font-size:12.5px;font-weight:600;color:var(--sp-ink);line-height:1.2}
.sp-amount{color:#16a34a;font-weight:600;margin-left:4px}
.sp-sub{font-size:12px;color:var(--sp-muted);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@keyframes sp-in{0%{opacity:0;transform:translate3d(0,10px,0) scale(.86)}12%{opacity:1;transform:none}86%{opacity:1;transform:none}100%{opacity:0;transform:translate3d(0,-6px,0) scale(.96)}}
@media(prefers-reduced-motion:reduce){.sp-card{animation:none!important}}
`
