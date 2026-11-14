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
 *
 * Landing round 3. The kinds are half digital and community, half merch:
 * an e-book, a course and a community, then a tee, a hoodie and a cap (a
 * community's membership costs nothing to make and pays the same fee, so it
 * is worked out as a download is). The product chips and the plan switch are
 * the tabs "Make the work" uses: a soft grey track, the chosen one a white
 * pill, plain line icons in the text colour.
 *
 * Landing round 4, the owner: no Free and Pro switch and no black "Monthly
 * revenue" card. One white panel: what you sell, the price and the sales a
 * day on one side; on the other the month's total, three figures under it
 * and a Start earning button. The photograph stays. Figures are on the
 * Free plan's fee (5% + $0.25 a sale), which the line under them says.
 *
 * Landing round 5, the owner: "I don't like the pill shapes ... they look
 * bad, cut and not consistent on desktop and mobile." What you sell is six
 * even tiles now (three across, two on a narrow phone), each a soft grey
 * with a 12px corner, the chosen one white with an ink outline; the same
 * shape at every width, and no label is ever cut (checked from 320 to
 * 1440): a tile too narrow for its icon and its word drops the icon (a
 * container query on the tile). "Example" is a quiet word, not a pill.
 */
import type { SectionStyle } from "./lazy-section"
import Link from "next/link"
import { useId, useRef, useState } from "react"
import { StoryHeading } from "../story-heading"
import { COMMERCE_PRO_MONTHLY_CENTS, CommerceKindIcon, COMMERCE_KIT_STYLE, CommerceKitStyle, CommerceNumber, CommerceSlider, commerceSale, commerceUsd, useCommerceLive, type CommerceKind, type CommercePlan } from "./commerce-kit"

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

/**
 * What the calculator offers: three things made of files and people, then
 * three that are printed. `as` is the kind whose fee and production cost it
 * is worked out with (./commerce-kit).
 */
export const EARN_KINDS = [
  { id: "ebook", label: "E-book", as: "download", price: 19, min: 2, max: 99, unit: "orders" },
  { id: "course", label: "Course", as: "course", price: 129, min: 9, max: 499, unit: "orders" },
  { id: "community", label: "Community", as: "download", price: 15, min: 3, max: 99, unit: "new members" },
  { id: "tee", label: "T-shirt", as: "tee", price: 30, min: 15, max: 60, unit: "orders" },
  { id: "hoodie", label: "Hoodie", as: "hoodie", price: 55, min: 35, max: 110, unit: "orders" },
  { id: "cap", label: "Cap", as: "cap", price: 28, min: 18, max: 55, unit: "orders" },
] as const satisfies ReadonlyArray<{ id: string; label: string; as: CommerceKind; price: number; min: number; max: number; unit: string }>
type EarnKind = (typeof EARN_KINDS)[number]["id"]

/** The figures are worked out on the Free plan: no monthly price, this fee a sale. */
const FREE_TERMS = "5% + $0.25 a sale"

function KindIcon({ id, as }: { id: EarnKind; as: CommerceKind }) {
  if (id !== "community") return <CommerceKindIcon kind={as} className="cme-kind-i" />
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="cme-kind-i" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c.4-3.2 2.8-5.2 6-5.2s5.6 2 6 5.2M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.8 14.8c1.8.7 2.9 2.3 3.2 4.7" />
    </svg>
  )
}

/** The kinds: a radio group in one grey track, arrow keys move between them. */
function KindTabs({ value, onChange, label }: { value: EarnKind; onChange: (k: EarnKind) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const n = EARN_KINDS.length
  const move = (i: number) => {
    const j = (i + n) % n
    onChange(EARN_KINDS[j].id)
    refs.current[j]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="cme-kinds">
      {EARN_KINDS.map((k, i) => {
        const on = k.id === value
        return (
          <button
            key={k.id}
            ref={(node) => {
              refs.current[i] = node
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(k.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault()
                move(i + 1)
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault()
                move(i - 1)
              }
            }}
            className="cme-kind"
            data-kind={k.id}
          >
            <KindIcon id={k.id} as={k.as} />
            <span>{k.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function EarningsCalculator() {
  const [ref] = useCommerceLive<HTMLElement>(undefined, false)
  const uid = useId()
  const [kindId, setKind] = useState<EarnKind>("ebook")
  const [prices, setPrices] = useState<Partial<Record<EarnKind, number>>>({})
  const [perDay, setPerDay] = useState(5)
  const p = EARN_KINDS.find((k) => k.id === kindId) ?? EARN_KINDS[0]
  const price = prices[kindId] ?? p.price
  const m = commerceMonth(p.as, price, perDay, "free")

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
              sizes="(min-width: 1280px) 400px, (min-width: 900px) 100vw, calc(100vw - 40px)"
              width={960}
              height={1448}
              alt="A seller in a printed tee and cap, photographed at night with a flash"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="cme-panel">
            <div className="cme-inputs">
              <div>
                <div className="cme-label" id={`${uid}-what`}>
                  What you sell
                </div>
                <KindTabs value={kindId} onChange={setKind} label="What you sell" />
              </div>
              <CommerceSlider
                id={`${uid}-price`}
                label="Selling price"
                value={price}
                min={p.min}
                max={p.max}
                onChange={(v) => setPrices((s) => ({ ...s, [kindId]: v }))}
                display={<NumberField label="Selling price in dollars" value={price} min={p.min} max={p.max} prefix="$" onChange={(v) => setPrices((s) => ({ ...s, [kindId]: v }))} />}
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
            </div>

            <div className="cme-out" aria-live="off">
              <div className="cme-out-top">
                <span>You keep each month</span>
                <span className="cme-example">Example</span>
              </div>
              <CommerceNumber cents={m.keep} whole className="cme-big" />
              <dl className="cme-stats">
                <div>
                  <dt>A year</dt>
                  <dd>
                    <CommerceNumber cents={m.keep * 12} whole />
                  </dd>
                </div>
                <div>
                  <dt>Sales</dt>
                  <dd>{commerceUsd(m.revenue, false)}</dd>
                </div>
                <div>
                  <dt>{p.unit === "orders" ? "Orders" : "Members"}</dt>
                  <dd>{m.orders.toLocaleString("en-US")}</dd>
                </div>
              </dl>
              <p className="cme-note">
                After Storelib&apos;s {FREE_TERMS}
                {m.production ? " and printing" : ""}. Stripe&apos;s card processing fee is separate.
              </p>
              <Link href="/signup" className="cme-cta" data-earnings-cta="">
                Start earning
                <svg aria-hidden viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h12M11 5l5 5-5 5" />
                </svg>
              </Link>
            </div>
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
.cme-wrap{max-width:1400px;margin:0 auto;padding:0 var(--landing-gutter,clamp(20px,5vw,72px))}
.cme-card{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(16px,2vw,24px);align-items:stretch}
.cme-photo{position:relative;height:clamp(240px,30vw,320px);border-radius:clamp(21px,2.4vw,31px);overflow:hidden;background:#141218}
.cme-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 47%;display:block}
.cme-panel{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);border-radius:clamp(21px,2.4vw,31px);background:#fff;box-shadow:0 0 0 1px #ececf0,0 24px 48px -36px rgba(24,24,27,.25)}
.cme-inputs{display:flex;flex-direction:column;gap:clamp(22px,2.4vw,30px);padding:clamp(22px,3vw,40px)}
.cme-label{margin-bottom:12px;font-size:14px;font-weight:500;color:#71717a}
.cme-num{display:inline-flex;align-items:baseline;gap:1px;padding:2px 10px;border-radius:9px;background:#f6f6f8;box-shadow:inset 0 0 0 1px #ececf0}
.cme-num input{min-width:2ch;border:0;outline:0;background:transparent;font:inherit;color:inherit;text-align:right;padding:0;font-variant-numeric:tabular-nums}
.cme-num:focus-within{box-shadow:inset 0 0 0 2px #7c3aed}
.cme-kinds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.cme-kind{position:relative;display:flex;align-items:center;justify-content:flex-start;gap:9px;min-width:0;height:48px;padding:0 14px;border:0;border-radius:12px;background:#f6f6f8;color:#55525e;font:500 14.5px/1 var(--font-inter,Inter),Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;box-shadow:inset 0 0 0 1px transparent;transition:background-color .2s ease,color .2s ease,box-shadow .2s ease}
.cme-kind{container-type:inline-size}
.cme-kind>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
@container (max-width:136px){.cme-kind-i{display:none}.cme-kind>span{flex:1;text-align:center}}
.cme-kind-i{width:18px;height:18px;flex:none}
@media (hover:hover) and (pointer:fine){.cme-kind:hover{background:#efeff2;color:#18181b}}
.cme-kind[aria-checked="true"]{background:#fff;color:#18181b;box-shadow:inset 0 0 0 1.5px #18181b}
.cme-kind:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}
@media (max-width:479px){.cme-kinds{grid-template-columns:repeat(2,minmax(0,1fr))}.cme-kind{height:46px;padding:0 12px}}
@media (min-width:900px) and (max-width:1100px){.cme-kind{gap:7px;padding:0 10px;font-size:14px}}
.cme-out{position:relative;display:flex;flex-direction:column;padding:clamp(24px,3vw,40px);border-left:1px solid #ececf0}
.cme-out-top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:15px;color:#71717a}
.cme-example{font-size:13px;color:#a1a1aa}
.cme-big{display:block;margin-top:12px;font-size:clamp(46px,5vw,76px);font-weight:400;letter-spacing:-.055em;line-height:1;color:#0f0e13;font-variant-numeric:tabular-nums}
.cme-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:clamp(22px,2.4vw,30px) 0 0;padding-top:18px;border-top:1px solid #ececf0}
.cme-stats div{min-width:0}
.cme-stats div+div{padding-left:14px;border-left:1px solid #ececf0}
.cme-stats dt{font-size:13px;color:#71717a}
.cme-stats dd{margin:4px 0 0;font-size:clamp(16px,1.4vw,19px);font-weight:500;color:#18181b;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cme-note{margin:16px 0 24px;font-size:12.5px;line-height:1.5;color:#8a8a93}
.cme-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:52px;margin-top:auto;padding:0 26px;border-radius:999px;background:#0f0e13;color:#fff;font-size:16px;font-weight:600;align-self:flex-start;transition:background-color .2s}
.cme-cta:hover{background:#2a2833}
.cme-cta:focus-visible{outline:2px solid #7c3aed;outline-offset:3px}
.cme-cta svg{transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.cme-cta:hover svg{transform:translateX(3px)}
@media (min-width:1280px){
  .cme-card{grid-template-columns:minmax(0,.62fr) minmax(0,2fr)}
  .cme-photo{height:auto;min-height:100%}
  .cme-photo img{object-position:54% 50%}
}
@media (max-width:899px){
  .cme-panel{grid-template-columns:1fr}
  .cme-out{border-left:0;border-top:1px solid #ececf0}
  .cme-photo{height:auto;aspect-ratio:16/10;max-height:300px}
  .cme-photo img{object-position:50% 45%}
  .cme-cta{align-self:stretch}
}
@media (prefers-reduced-motion:reduce){
  .cme-kind,.cme-cta,.cme-cta svg{transition:none}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const EARNINGS_STYLES: readonly SectionStyle[] = [COMMERCE_KIT_STYLE, { href: "w12-commerce-earn", precedence: "default", css: EARN_CSS }]
