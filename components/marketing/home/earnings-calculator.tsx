"use client"

/**
 * ===========================================================================
 *  THE EARNINGS CALCULATOR (home, section 14)
 * ===========================================================================
 * Pick what you sell, set a price and how many sell a day, and read a month
 * and a year of revenue, with what is left after Storelib's fee (the fee
 * checkout charges, lib/payments/fees/calculate, on Free or Pro, with Pro's
 * $29 a month taken off) and after the example production cost for merch.
 *
 * It shares its chips, slider and counting numbers with the profit picker in
 * how-it-works.tsx (./commerce-kit), so the two read as one system; the
 * picker answers "what does one sale leave me", this one "what could a month
 * look like".
 *
 * A month is 30 days. Every figure is labelled an example. Stripe's card fee
 * is named and not taken off: it depends on the card and the country.
 */
import type { SectionStyle } from "./lazy-section"
import Link from "next/link"
import { useId, useState } from "react"
import { StoryHeading } from "../story-heading"
import { COMMERCE_PRO_MONTHLY_CENTS, CommerceKindPicker, COMMERCE_KIT_STYLE, CommerceKitStyle, CommerceNumber, CommerceSlider, commerceProduct, commerceSale, commerceUsd, useCommerceLive, type CommerceKind, type CommercePlan } from "./commerce-kit"

const DAYS = 30
const SALES_MAX = 100

/** A month's figures, in cents. */
export function commerceMonth(kind: CommerceKind, priceDollars: number, perDay: number, plan: CommercePlan) {
  const sale = commerceSale(Math.round(priceDollars * 100), kind, plan)
  const orders = perDay * DAYS
  const revenue = sale.priceCents * orders
  const fees = sale.feeCents * orders
  const production = sale.baseCents * orders
  const planCost = plan === "pro" ? COMMERCE_PRO_MONTHLY_CENTS : 0
  return { orders, revenue, fees, production, planCost, keep: revenue - fees - production - planCost }
}

export function EarningsCalculator() {
  const [ref] = useCommerceLive<HTMLElement>(undefined, false)
  const uid = useId()
  const [kind, setKind] = useState<CommerceKind>("download")
  const [prices, setPrices] = useState<Partial<Record<CommerceKind, number>>>({})
  const [perDay, setPerDay] = useState(5)
  const [plan, setPlan] = useState<CommercePlan>("free")
  const p = commerceProduct(kind)
  const price = prices[kind] ?? p.price
  const m = commerceMonth(kind, price, perDay, plan)
  const bars = [0.38, 0.45, 0.5, 0.56, 0.62, 0.66, 0.72, 0.78, 0.83, 0.88, 0.94, 1]

  return (
    <section ref={ref} className="cme" data-story-section="earnings" aria-labelledby="cme-title">
      <CommerceKitStyle />
      <style href="w12-commerce-earn" precedence="default">
        {EARN_CSS}
      </style>
      <div className="cme-wrap">
        <div className="story-section-heading">
          <p className="story-eyebrow">Earnings calculator</p>
          <StoryHeading id="cme-title" text="See what your work could earn." accent={["earn"]} />
          <p className="text-neutral-500">Choose a product, a price and a pace. The math uses Storelib&apos;s real fees.</p>
        </div>

        <div className="cme-card">
          <div className="cme-inputs">
            <div>
              <div className="cme-label" id={`${uid}-what`}>
                What you sell
              </div>
              <CommerceKindPicker value={kind} onChange={setKind} label="What you sell" />
            </div>
            <CommerceSlider
              id={`${uid}-price`}
              label="Selling price"
              value={price}
              min={p.min}
              max={p.max}
              onChange={(v) => setPrices((s) => ({ ...s, [kind]: v }))}
              display={<NumberField label="Selling price in dollars" value={price} min={p.min} max={p.max} prefix="$" onChange={(v) => setPrices((s) => ({ ...s, [kind]: v }))} />}
              valueText={commerceUsd(price * 100)}
              hint={
                <>
                  <span>{commerceUsd(p.min * 100)}</span>
                  <span>{commerceUsd(p.max * 100)}</span>
                </>
              }
            />
            <CommerceSlider
              id={`${uid}-sales`}
              label="Sales a day"
              value={perDay}
              min={1}
              max={SALES_MAX}
              onChange={setPerDay}
              display={<NumberField label="Sales a day" value={perDay} min={1} max={SALES_MAX} onChange={setPerDay} />}
              valueText={`${perDay} a day`}
              hint={
                <>
                  <span>1</span>
                  <span>{SALES_MAX}</span>
                </>
              }
            />
            <div>
              <div className="cme-label" id={`${uid}-plan`}>
                Plan
              </div>
              <div role="radiogroup" aria-labelledby={`${uid}-plan`} className="cme-plans">
                {(["free", "pro"] as const).map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={plan === id} onClick={() => setPlan(id)} className="cme-plan" data-on={plan === id || undefined}>
                    <b>{id === "free" ? "Free" : "Pro"}</b>
                    <small>{id === "free" ? "$0 a month · 5% + $0.25" : "$29 a month · 3% + $0.25"}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="cme-out" aria-live="off">
            <div className="cme-out-top">
              <span>Monthly revenue</span>
              <span className="cme-pill">Example</span>
            </div>
            <CommerceNumber cents={m.revenue} whole className="cme-big" />
            <div className="cme-year">
              <CommerceNumber cents={m.revenue * 12} whole className="cme-year-n" /> a year
            </div>
            <div className="cme-bars" aria-hidden="true">
              {bars.map((b, i) => (
                <span key={i} style={{ "--b": b, "--i": i } as React.CSSProperties} />
              ))}
            </div>
            <dl className="cme-rows">
              <div>
                <dt>{m.orders.toLocaleString("en-US")} orders a month</dt>
                <dd>{commerceUsd(m.revenue, false)}</dd>
              </div>
              <div>
                <dt>Storelib fees</dt>
                <dd>−{commerceUsd(m.fees, false)}</dd>
              </div>
              {m.production ? (
                <div>
                  <dt>Production (example)</dt>
                  <dd>−{commerceUsd(m.production, false)}</dd>
                </div>
              ) : null}
              {m.planCost ? (
                <div>
                  <dt>Pro plan</dt>
                  <dd>−{commerceUsd(m.planCost, false)}</dd>
                </div>
              ) : null}
              <div className="cme-keep">
                <dt>You keep each month</dt>
                <dd>
                  <CommerceNumber cents={m.keep} whole />
                </dd>
              </div>
            </dl>
            <Link href="/signup" className="cme-cta" data-earnings-cta="">
              Start earning
              <svg aria-hidden viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10h12M11 5l5 5-5 5" />
              </svg>
            </Link>
            <p className="cme-fine">Example figures, not a forecast. A month is 30 days. Fees are Storelib&apos;s per sale (under $4.00, a percentage only). Stripe&apos;s card processing fee is separate. Production costs are typical print partner prices.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/** The figure beside a slider, typed into directly. Clamped on blur. */
function NumberField({ label, value, min, max, prefix, onChange }: { label: string; value: number; min: number; max: number; prefix?: string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (raw: string) => {
    const n = Math.round(Number(raw.replace(/[^0-9.]/g, "")))
    if (Number.isFinite(n) && raw.trim() !== "") onChange(Math.max(min, Math.min(max, n)))
    setDraft(null)
  }
  return (
    <span className="cme-num">
      {prefix ? <span aria-hidden="true">{prefix}</span> : null}
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (Number.isFinite(n) && n >= min && n <= max) onChange(Math.round(n))
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value)
        }}
        style={{ width: `${Math.max(2, (draft ?? String(value)).length) + 0.4}ch` }}
      />
    </span>
  )
}

const EARN_CSS = `
.cme{background:#fff;color:#18181b}
.cme-wrap{max-width:1320px;margin:0 auto;padding:0 var(--landing-gutter,clamp(20px,5vw,72px))}
.cme-card{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(16px,2vw,24px);padding:clamp(12px,1.4vw,18px);border-radius:clamp(24px,2.8vw,40px);background:#f4f4f6}
.cme-inputs{display:flex;flex-direction:column;gap:clamp(20px,2.4vw,30px);padding:clamp(16px,2.4vw,32px)}
.cme-label{margin-bottom:12px;font-size:15px;font-weight:500;color:#3f3f46}
.cme-num{display:inline-flex;align-items:baseline;gap:1px;padding:2px 10px;border-radius:10px;background:#fff;box-shadow:inset 0 0 0 1px #e4e4e7}
.cme-num input{min-width:2ch;border:0;outline:0;background:transparent;font:inherit;color:inherit;text-align:right;padding:0;font-variant-numeric:tabular-nums}
.cme-num:focus-within{box-shadow:inset 0 0 0 2px #7c3aed}
.cme-plans{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cme-plan{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:56px;padding:10px 14px;border-radius:16px;border:1px solid #e4e4e7;background:#fff;text-align:left;cursor:pointer;transition:border-color .2s,box-shadow .2s}
.cme-plan b{font-size:15px;font-weight:600}
.cme-plan small{font-size:12.5px;color:#71717a}
.cme-plan[data-on]{border-color:#18181b;box-shadow:0 0 0 1px #18181b}
.cme-plan:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}
.cme-out{position:relative;display:flex;flex-direction:column;padding:clamp(22px,3vw,40px);border-radius:clamp(20px,2.2vw,30px);background:#0b0b0c;color:#fff;overflow:hidden}
.cme-out::before{content:"";position:absolute;inset:-30% -20% auto auto;width:70%;aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,rgba(124,58,237,.45),transparent);pointer-events:none}
.cme-out-top{position:relative;display:flex;justify-content:space-between;align-items:center;font-size:15px;color:#a1a1aa}
.cme-pill{padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.08);font-size:12px;color:#d4d4d8}
.cme-big{position:relative;display:block;margin-top:8px;font-size:clamp(48px,6.4vw,92px);font-weight:400;letter-spacing:-.055em;line-height:1;font-variant-numeric:tabular-nums}
.cme-year{position:relative;margin-top:10px;font-size:16px;color:#a1a1aa}
.cme-year-n{color:#fff;font-weight:500;font-variant-numeric:tabular-nums}
.cme-bars{position:relative;display:flex;align-items:flex-end;gap:5px;height:64px;margin-top:22px}
.cme-bars span{flex:1;height:100%;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#a78bfa,#4f46e5);transform-origin:50% 100%;transform:scaleY(var(--b));opacity:calc(.35 + var(--b) * .65)}
[data-commerce-live] .cme-bars span{animation:cme-grow .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 45ms)}
@keyframes cme-grow{from{transform:scaleY(.04)}to{transform:scaleY(var(--b))}}
.cme-rows{position:relative;margin:22px 0 0;display:grid;gap:9px;padding-top:18px;border-top:1px solid rgba(255,255,255,.1)}
.cme-rows div{display:flex;justify-content:space-between;gap:12px;font-size:14.5px}
.cme-rows dt{color:#a1a1aa}
.cme-rows dd{margin:0;font-variant-numeric:tabular-nums}
.cme-keep{margin-top:4px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}
.cme-keep dt{color:#fff!important;font-weight:500}
.cme-keep dd{font-size:18px;font-weight:600;color:#c4b5fd}
.cme-cta{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:52px;margin-top:24px;padding:0 26px;border-radius:999px;background:#fff;color:#0b0b0c;font-size:16px;font-weight:600;align-self:flex-start;transition:transform .25s cubic-bezier(.2,.8,.2,1),background-color .2s}
.cme-cta:hover{background:#ede9fe}
.cme-cta:active{transform:scale(.97)}
.cme-cta:focus-visible{outline:2px solid #bca3ff;outline-offset:3px}
.cme-cta svg{transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.cme-cta:hover svg{transform:translateX(3px)}
.cme-fine{position:relative;margin:16px 0 0;font-size:12px;line-height:1.55;color:#71717a}
@media (max-width:899px){
  .cme-card{grid-template-columns:1fr}
  .cme-inputs{padding:14px 10px 6px}
  .cme-cta{align-self:stretch}
}
@media (prefers-reduced-motion:reduce){
  .cme-bars span{animation:none!important}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const EARNINGS_STYLES: readonly SectionStyle[] = [COMMERCE_KIT_STYLE, { href: "w12-commerce-earn", precedence: "default", css: EARN_CSS }]
