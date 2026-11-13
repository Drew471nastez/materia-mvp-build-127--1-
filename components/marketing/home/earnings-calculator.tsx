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
 *
 * Wave 13, the owner: no "Earnings calculator" pill and no subheading, and
 * both sides smoother and cleaner. The controls sit on one white panel with
 * a hairline (no grey slab around both halves); the result is one quiet dark
 * panel with a smooth line of the year ahead in place of the bar chart and
 * the purple blob, drawn in by a cover that slides away (transform only).
 *
 * Landing round, the owner: room for one picture "like the one attached", a
 * night photograph lit by the camera's flash, of somebody in a printed tee
 * (Unsplash, public/home/earnings, two sizes). From 1280px it stands as a
 * narrow column at the left of the calculator; under that it is a short band
 * above it, so the section grows neither much wider nor much taller. The
 * small print under the result is gone ("texts like this under sections
 * which just occupy space"); every figure is still labelled an example, and
 * the one fact a seller needs, that Stripe's card fee is not in the figure,
 * is a short line under the fee it qualifies.
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

  return (
    <section ref={ref} className="cme" data-story-section="earnings" aria-labelledby="cme-title">
      <CommerceKitStyle />
      <style href="w12-commerce-earn" precedence="default">
        {EARN_CSS}
      </style>
      <div className="cme-wrap">
        <div className="story-section-heading">
          <StoryHeading id="cme-title" text="See what your work could earn." accent={["earn"]} />
        </div>

        <div className="cme-card">
          <div className="cme-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/home/earnings/night-flash-tee-640.webp"
              srcSet="/home/earnings/night-flash-tee-640.webp 640w, /home/earnings/night-flash-tee-960.webp 960w"
              sizes="(min-width: 1280px) 470px, (min-width: 900px) 100vw, calc(100vw - 40px)"
              width={960}
              height={1448}
              alt="A seller in a printed tee and cap, photographed at night with a flash"
              loading="lazy"
              decoding="async"
            />
          </div>
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
            <YearLine />
            <dl className="cme-rows">
              <div>
                <dt>{m.orders.toLocaleString("en-US")} orders a month</dt>
                <dd>{commerceUsd(m.revenue, false)}</dd>
              </div>
              <div>
                <dt>
                  Storelib fees
                  <small className="cme-aside">Stripe&apos;s card processing fee is separate</small>
                </dt>
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
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * THE YEAR AHEAD, as one smooth line: a shape (a store that grows month on
 * month), not a figure, so it carries no number of its own. Drawn once; a
 * cover over it slides away when the section is first on screen.
 */
const YEAR_PATH = "M0 70 C 40 66, 70 60, 100 56 S 160 50, 200 40 S 260 30, 300 22 S 360 10, 400 6"
function YearLine() {
  return (
    <div className="cme-line" aria-hidden="true">
      <svg viewBox="0 0 400 80" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cme-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${YEAR_PATH} L400 80 L0 80 Z`} fill="url(#cme-fill)" />
        <path d={YEAR_PATH} fill="none" stroke="#a78bfa" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
      <span className="cme-line-cover" />
      <span className="cme-line-ends">
        <span>This month</span>
        <span>In a year</span>
      </span>
    </div>
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
.cme-card{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(16px,2vw,24px);align-items:stretch}
.cme-photo{grid-column:1/-1;position:relative;height:clamp(240px,30vw,320px);border-radius:clamp(21px,2.4vw,31px);overflow:hidden;background:#141218}
.cme-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 47%;display:block}
.cme-inputs{display:flex;flex-direction:column;gap:clamp(22px,2.4vw,30px);padding:clamp(22px,3vw,40px);border-radius:clamp(21px,2.4vw,31px);background:#fff;box-shadow:0 0 0 1px #ececf0,0 24px 48px -36px rgba(24,24,27,.25)}
.cme-label{margin-bottom:12px;font-size:14px;font-weight:500;color:#71717a}
.cme-num{display:inline-flex;align-items:baseline;gap:1px;padding:2px 10px;border-radius:9px;background:#f6f6f8;box-shadow:inset 0 0 0 1px #ececf0}
.cme-num input{min-width:2ch;border:0;outline:0;background:transparent;font:inherit;color:inherit;text-align:right;padding:0;font-variant-numeric:tabular-nums}
.cme-num:focus-within{box-shadow:inset 0 0 0 2px #7c3aed}
.cme-plans{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border-radius:17px;background:#f4f4f6}
.cme-plan{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:56px;padding:9px 14px;border-radius:13px;border:0;background:transparent;text-align:left;cursor:pointer;transition:background-color .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent}
.cme-plan b{font-size:15px;font-weight:600}
.cme-plan small{font-size:12.5px;color:#71717a}
.cme-plan[data-on]{background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.08),0 4px 12px -6px rgba(24,24,27,.18)}
.cme-plan:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}
.cme-out{position:relative;display:flex;flex-direction:column;padding:clamp(24px,3vw,40px);border-radius:clamp(21px,2.4vw,31px);background:#121017;color:#fff;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.cme-out-top{display:flex;justify-content:space-between;align-items:center;font-size:15px;color:#a1a1aa}
.cme-pill{padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.07);font-size:12px;color:#d4d4d8}
.cme-big{display:block;margin-top:10px;font-size:clamp(48px,6.2vw,88px);font-weight:400;letter-spacing:-.055em;line-height:1;font-variant-numeric:tabular-nums}
.cme-year{margin-top:10px;font-size:16px;color:#a1a1aa}
.cme-year-n{color:#fff;font-weight:500;font-variant-numeric:tabular-nums}
.cme-line{position:relative;height:96px;margin-top:22px}
.cme-line svg{display:block;width:100%;height:72px;overflow:visible}
.cme-line-cover{position:absolute;inset:-4px -2px 20px;background:#121017;transform-origin:100% 50%;transform:scaleX(0)}
.cme-line-ends{display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#71717a}
[data-commerce-live] .cme-line-cover{animation:cme-draw 1.4s cubic-bezier(.65,0,.35,1) both}
@keyframes cme-draw{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.cme-rows{margin:20px 0 24px;display:grid;gap:10px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08)}
.cme-rows div{display:flex;justify-content:space-between;gap:12px;font-size:14.5px}
.cme-rows dt{color:#a1a1aa}
.cme-aside{display:block;margin-top:2px;font-size:12px;color:#71717a}
.cme-rows dd{margin:0;font-variant-numeric:tabular-nums}
.cme-keep{margin-top:4px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}
.cme-keep dt{color:#fff!important;font-weight:500}
.cme-keep dd{font-size:18px;font-weight:600;color:#c4b5fd}
.cme-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:52px;margin-top:auto;padding:0 26px;border-radius:999px;background:#fff;color:#0b0b0c;font-size:16px;font-weight:600;align-self:flex-start;transition:background-color .2s}
.cme-cta:hover{background:#ede9fe}
.cme-cta:focus-visible{outline:2px solid #bca3ff;outline-offset:3px}
.cme-cta svg{transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.cme-cta:hover svg{transform:translateX(3px)}
@media (min-width:1280px){
  .cme-card{grid-template-columns:minmax(0,.64fr) minmax(0,1.1fr) minmax(0,.95fr)}
  .cme-photo{grid-column:auto;height:auto;min-height:100%}
  .cme-photo img{object-position:54% 50%}
  .cme-inputs{padding:clamp(24px,2.4vw,34px)}
  .cme-out{padding:clamp(24px,2.4vw,36px)}
  .cme-big{font-size:clamp(48px,5vw,76px)}
}
@media (max-width:899px){
  .cme-card{grid-template-columns:1fr}
  .cme-photo{height:auto;aspect-ratio:16/10;max-height:300px}
  .cme-photo img{object-position:50% 45%}
  .cme-cta{align-self:stretch}
}
@media (prefers-reduced-motion:reduce){
  .cme-line-cover{display:none}
  .cme-plan,.cme-cta,.cme-cta svg{transition:none}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const EARNINGS_STYLES: readonly SectionStyle[] = [COMMERCE_KIT_STYLE, { href: "w12-commerce-earn", precedence: "default", css: EARN_CSS }]
