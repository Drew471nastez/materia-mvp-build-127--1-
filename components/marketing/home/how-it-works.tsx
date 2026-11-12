"use client"

/**
 * ===========================================================================
 *  HOW IT WORKS: FIVE MOTION TILES AND THE PROFIT PICKER (home, section 8)
 * ===========================================================================
 * Light and rounded. Each tile is a small loop drawn in HTML and CSS, not a
 * video: merch designed, priced, printed and shipped; a product sheet sliding
 * up over a OnePage; a file dropped into a product and the download email;
 * lessons stacking into a course; tips popping into a tip jar. Under them,
 * the picker: choose what you sell and a price, and see what one sale leaves
 * you after the example production cost and Storelib's real fee.
 *
 * Every loop is transform and opacity only, and runs only while the section
 * is on screen and the tab is visible (data-commerce-live). Reduced motion
 * shows each tile's finished frame, still.
 *
 * TRUE TO THE PRODUCT. Merch without stock is print on demand through a
 * print partner the seller connects (lib/physical/providers.ts: Printful,
 * Printify, Gelato); the sheet over a OnePage is instant checkout; digital
 * files are delivered on payment; courses track each student's progress;
 * tips are added at checkout. The fee is lib/payments/fees/calculate's.
 */
import type { SectionStyle } from "./lazy-section"
import { useState } from "react"
import { StoryHeading } from "../story-heading"
import { COMMERCE_PRODUCTS, CommerceKindIcon, CommerceKindPicker, COMMERCE_KIT_STYLE, CommerceKitStyle, CommerceNumber, CommerceSlider, commerceProduct, commerceSale, commerceUsd, useCommerceLive, type CommerceKind } from "./commerce-kit"

const IMG = "/home/commerce"

export function HowItWorks() {
  const [ref] = useCommerceLive<HTMLElement>(undefined, false)
  return (
    <section ref={ref} className="cmh" data-story-section="how-it-works" aria-labelledby="cmh-title">
      <CommerceKitStyle />
      <style href="w12-commerce-how" precedence="default">
        {HOW_CSS}
      </style>
      <div className="cmh-wrap">
        <div className="story-section-heading">
          <p className="story-eyebrow">How it works</p>
          <StoryHeading id="cmh-title" text="Sell what your fans love. We handle the rest." accent={["love"]} />
          <p className="text-neutral-500">Merch with no stock to buy, downloads that deliver themselves, courses, memberships and tips, all paid for without your fans leaving your page.</p>
        </div>

        <div className="cmh-grid">
          <Tile wide caption={<><b>Sell your own merch, no inventory.</b> Design it, set your price, and a print partner you connect prints and ships each order as it comes in.</>}>
            <MerchScene />
          </Tile>
          <Tile tone="violet" caption={<><b>Fans buy without leaving your page.</b> Tap a product on your OnePage and checkout slides up right there.</>}>
            <SheetScene />
          </Tile>
          <Tile caption={<><b>Sell digital products.</b> Drop in a file once. Every buyer gets it by email the moment they pay.</>}>
            <DigitalScene />
          </Tile>
          <Tile tone="lilac" caption={<><b>Build and sell a course.</b> Lessons, videos and files, with each student&apos;s progress saved as they go.</>}>
            <CourseScene />
          </Tile>
          <Tile tone="warm" caption={<><b>Take tips from fans.</b> A thank-you button for the people who just want to support you.</>}>
            <TipScene />
          </Tile>
        </div>

        <ProfitPicker />
      </div>
    </section>
  )
}

function Tile({ children, caption, wide = false, tone }: { children: React.ReactNode; caption: React.ReactNode; wide?: boolean; tone?: "violet" | "lilac" | "warm" }) {
  return (
    <article className="cmh-tile" data-wide={wide || undefined}>
      <div className="cmh-stage" data-tone={tone} aria-hidden="true">
        {children}
      </div>
      <p className="cmh-cap">{caption}</p>
    </article>
  )
}

function Check({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

/* 1. Merch: the design lands on the tee, the price is set, printed, shipped. */
function MerchScene() {
  const sale = commerceSale(3000, "tee")
  return (
    <div className="cmh-merch">
      <div className="cmh-ed">
        <div className="cmh-ed-pic">
          <img src={`${IMG}/float-tee.webp`} alt="" loading="lazy" decoding="async" width={302} height={440} />
          <span className="cmh-design">
            <span className="cmh-badge">
              <img src={`${IMG}/art-golden.webp`} alt="" loading="lazy" decoding="async" width={96} height={96} />
              <span>GOLDEN HOUR</span>
            </span>
          </span>
        </div>
        <div className="cmh-ed-rows">
          <div className="cmh-ed-name">Golden Hour heavyweight tee</div>
          <div className="cmh-ed-grid">
            <span>
              <small>Your price</small>
              <b>{commerceUsd(sale.priceCents)}</b>
            </span>
            <span>
              <small>Production cost</small>
              <b>{commerceUsd(sale.baseCents)}</b>
            </span>
            <span className="cmh-ed-profit">
              <small>Your profit</small>
              <b>{commerceUsd(sale.profitCents)}</b>
            </span>
          </div>
        </div>
      </div>
      <ol className="cmh-steps">
        {["Design", "Set a price", "Printed", "Shipped"].map((s, i) => (
          <li key={s} style={{ "--i": i } as React.CSSProperties}>
            <span className="cmh-step-dot">
              <Check />
            </span>
            {s}
          </li>
        ))}
      </ol>
      <div className="cmh-ship">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
          <path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" />
        </svg>
        <span>
          <b>Order #1042 shipped</b>
          <small>Tracking sent to the buyer</small>
        </span>
      </div>
    </div>
  )
}

/* 2. A OnePage, a tap on a product, the checkout sheet up over it. */
function SheetScene() {
  return (
    <div className="cmh-op">
      <div className="cmh-op-page">
        <img className="cmh-op-av" src={`${IMG}/creator-amara.webp`} alt="" loading="lazy" decoding="async" width={160} height={160} />
        <div className="cmh-op-name">Amara Okafor</div>
        <div className="cmh-op-bio">Photographer · Lagos</div>
        <div className="cmh-op-link">Watch my latest shoot</div>
        <div className="cmh-op-prod">
          <img src={`${IMG}/art-golden.webp`} alt="" loading="lazy" decoding="async" width={96} height={96} />
          <span>
            <b>Golden Hour presets</b>
            <small>$19</small>
          </span>
          <span className="cmh-tap" />
        </div>
        <div className="cmh-op-link">Join the Inner Circle</div>
        <div className="cmh-op-sheet">
          <span className="cmh-grab" />
          <div className="cmh-sh-row">
            <img src={`${IMG}/art-golden.webp`} alt="" loading="lazy" decoding="async" width={96} height={96} />
            <span>
              <b>Golden Hour</b>
              <small>24 presets</small>
            </span>
            <b className="cmh-sh-price">$19</b>
          </div>
          <div className="cmh-sh-ap">
            <svg viewBox="0 0 17 20" width="12" height="14" fill="currentColor">
              <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.8 1.3 10.3.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.2zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
            </svg>
            Pay
          </div>
          <div className="cmh-sh-buy">Pay $19.00</div>
        </div>
      </div>
    </div>
  )
}

/* 3. A file falls into the product; the buyer's email arrives. */
function DigitalScene() {
  return (
    <div className="cmh-dig">
      <div className="cmh-drop">
        <span className="cmh-file">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
            <path d="M14 2.8H7a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.8L14 2.8Z" />
            <path d="M14 2.8v5h5" />
          </svg>
          <span>
            <b>golden-hour.zip</b>
            <small>48 MB</small>
          </span>
        </span>
        <span className="cmh-drop-l">Golden Hour presets</span>
        <span className="cmh-drop-s">Digital download · $19</span>
        <span className="cmh-drop-ok">
          <Check size={11} /> File added
        </span>
      </div>
      <div className="cmh-mail">
        <span className="cmh-mail-ic">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="m4 7 8 6 8-6" />
          </svg>
        </span>
        <span className="cmh-mail-t">
          <small>Maya Ellis Studio · now</small>
          <b>Your download is ready</b>
        </span>
        <span className="cmh-mail-b">Download</span>
      </div>
    </div>
  )
}

/* 4. Lessons stack in, each one ticked, the bar fills. */
function CourseScene() {
  const lessons = ["Light and exposure", "Aperture, simply", "Shutter speed", "Your first manual shoot"]
  return (
    <div className="cmh-course">
      <div className="cmh-c-head">
        <img src={`${IMG}/course-camera.webp`} alt="" loading="lazy" decoding="async" width={160} height={100} />
        <span>
          <b>Shoot in manual</b>
          <small>4 lessons · Theo Marsh</small>
        </span>
      </div>
      <div className="cmh-c-list">
        {lessons.map((l, i) => (
          <div key={l} className="cmh-lesson" style={{ "--i": i } as React.CSSProperties}>
            <span className="cmh-l-dot">
              <Check size={10} />
            </span>
            <span className="cmh-l-n">{i + 1}</span>
            {l}
          </div>
        ))}
      </div>
      <div className="cmh-c-bar">
        <span />
      </div>
    </div>
  )
}

/* 5. A tip jar: amounts, a tap, tips floating up. */
function TipScene() {
  return (
    <div className="cmh-tip">
      <div className="cmh-tip-card">
        <div className="cmh-tip-who">
          <img src={`${IMG}/creator-maya.webp`} alt="" loading="lazy" decoding="async" width={160} height={160} />
          <span>
            <b>Support Maya</b>
            <small>Say thanks for the free tutorials</small>
          </span>
        </div>
        <div className="cmh-amts">
          <span>$3</span>
          <span className="cmh-amt-on">$5</span>
          <span>$10</span>
          <span>Other</span>
        </div>
        <div className="cmh-tip-btn">Send $5 tip</div>
      </div>
      {["+$5", "+$10", "+$3", "+$5"].map((t, i) => (
        <span key={i} className="cmh-pop" style={{ "--i": i } as React.CSSProperties}>
          {t}
        </span>
      ))}
    </div>
  )
}

/* ── The profit picker ───────────────────────────────────────────────── */

function ProfitPicker() {
  const [kind, setKind] = useState<CommerceKind>("tee")
  const [prices, setPrices] = useState<Record<CommerceKind, number>>(() => Object.fromEntries(COMMERCE_PRODUCTS.map((p) => [p.id, p.price])) as Record<CommerceKind, number>)
  const p = commerceProduct(kind)
  const price = prices[kind]
  const sale = commerceSale(price * 100, kind)
  const frac = (c: number) => Math.max(0, Math.min(1, c / sale.priceCents))
  return (
    <div className="cmh-pick" data-commerce-picker="">
      <div className="cmh-pick-head">
        <h3>What you keep on every sale</h3>
        <p>Pick a product and set your price.</p>
      </div>
      <CommerceKindPicker value={kind} onChange={setKind} label="Product" />
      <div className="cmh-pick-body">
        <div className="cmh-pick-vis">
          <span key={kind} className="cmh-pick-icon">
            <CommerceKindIcon kind={kind} className="h-full w-full" />
          </span>
          <div className="cmh-pick-name">{p.label}</div>
          <div className="cmh-stack" aria-hidden="true">
            <span className="cmh-st-cost" />
            <span className="cmh-st-fee" style={{ transform: `scaleX(${frac(sale.profitCents + sale.feeCents)})` }} />
            <span className="cmh-st-profit" style={{ transform: `scaleX(${frac(sale.profitCents)})` }} />
          </div>
          <div className="cmh-hundred">
            <span>On 100 sales you keep</span>
            <CommerceNumber cents={sale.profitCents * 100} whole className="cmh-hundred-n" />
          </div>
          <div className="cmh-legend" aria-hidden="true">
            <span data-k="profit">Profit</span>
            <span data-k="fee">Storelib fee</span>
            {sale.baseCents ? <span data-k="cost">Production</span> : null}
          </div>
        </div>
        <div className="cmh-pick-figs">
          <CommerceSlider
            id="cmh-price"
            label="Your price"
            value={price}
            min={p.min}
            max={p.max}
            onChange={(v) => setPrices((s) => ({ ...s, [kind]: v }))}
            display={commerceUsd(price * 100)}
            valueText={`${commerceUsd(price * 100)}, ${commerceUsd(sale.profitCents)} profit`}
            hint={
              <>
                <span>{commerceUsd(p.min * 100)}</span>
                <span>{commerceUsd(p.max * 100)}</span>
              </>
            }
          />
          <dl className="cmh-rows">
            <div>
              <dt>{sale.baseCents ? "Production cost (example)" : "Production cost"}</dt>
              <dd>{sale.baseCents ? `−${commerceUsd(sale.baseCents)}` : "$0"}</dd>
            </div>
            <div>
              <dt>Storelib fee on Free</dt>
              <dd>−{commerceUsd(sale.feeCents)}</dd>
            </div>
          </dl>
          <div className="cmh-profit">
            <span>Your profit per sale</span>
            <CommerceNumber cents={sale.profitCents} className="cmh-profit-n" />
          </div>
          <p className="cmh-note">{p.note}</p>
        </div>
      </div>
      <p className="cmh-fine">
        Example figures. Production costs are typical print partner prices and vary by partner, product and print. Storelib&apos;s fee is 5% + $0.25 a sale on Free and 3% + $0.25 on Pro (under $4.00, a percentage only). Stripe&apos;s card processing fee is separate.
      </p>
    </div>
  )
}

/* Each step and lesson gets its own keyframes, so they tick in order and all reset together. */
const STEP_AT = [10, 27, 44, 61]
const STEP_KEYS = STEP_AT.map(
  (t, i) =>
    `.cmh-steps li:nth-child(${i + 1}){animation-name:cmh-s${i}}.cmh-steps li:nth-child(${i + 1}) .cmh-step-dot::before{animation-name:cmh-d${i}}` +
    `@keyframes cmh-s${i}{0%,${t - 3}%{opacity:.4}${t}%,92%{opacity:1}97%,100%{opacity:.4}}` +
    `@keyframes cmh-d${i}{0%,${t - 1}%{opacity:0;transform:scale(.5)}${t + 2}%{opacity:1;transform:scale(1.15)}${t + 5}%,92%{opacity:1;transform:scale(1)}97%,100%{opacity:0;transform:scale(.5)}}`,
).join("")
const TICK_AT = [24, 38, 52, 66]
const TICK_KEYS = TICK_AT.map(
  (t, i) => `.cmh-lesson:nth-child(${i + 1}) .cmh-l-dot{animation-name:cmh-t${i}}@keyframes cmh-t${i}{0%,${t - 1}%{opacity:0;transform:scale(.4)}${t + 3}%,90%{opacity:1;transform:scale(1)}96%,100%{opacity:0;transform:scale(.4)}}`,
).join("")

const HOW_CSS = `
.cmh{background:#fff;color:#18181b}
.cmh-wrap{max-width:1320px;margin:0 auto;padding:0 var(--landing-gutter,clamp(20px,5vw,72px))}
.cmh-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(16px,2vw,24px);margin-top:clamp(36px,5vw,64px)}
.cmh-tile{grid-column:span 2;min-width:0}
.cmh-tile[data-wide]{grid-column:span 4}
.cmh-stage{position:relative;height:clamp(300px,27vw,380px);border-radius:clamp(22px,2.4vw,32px);background:#f4f4f6;overflow:hidden;display:grid;place-items:center;contain:paint}
.cmh-tile[data-wide] .cmh-stage{background:radial-gradient(90% 120% at 100% 0%,#e7defe 0%,transparent 55%),radial-gradient(70% 90% at 0% 100%,#e3e7ff 0%,transparent 60%),#f4f4f6}
.cmh-stage[data-tone=violet]{background:linear-gradient(160deg,#4c1d95,#312e81 55%,#1e1b4b)}
.cmh-stage[data-tone=lilac]{background:linear-gradient(160deg,#efeafe,#e4e2f6)}
.cmh-stage[data-tone=warm]{background:linear-gradient(160deg,#f7efff,#ffe9f1)}
.cmh-cap{margin:16px 4px 0;font-size:15.5px;line-height:1.55;color:#71717a;max-width:52ch;text-wrap:pretty}
.cmh-cap b{color:#18181b;font-weight:600}
/* Named, not *, so going live restyles only the moving parts. */
.cmh-design,.cmh-ed-grid>span,.cmh-steps li,.cmh-step-dot::before,.cmh-drop::after,.cmh-ship,.cmh-tap,.cmh-op-sheet,.cmh-drop-ok,.cmh-file,.cmh-mail,.cmh-lesson,.cmh-l-dot,.cmh-c-bar span,.cmh-amt-on,.cmh-pop{animation-play-state:paused!important}
[data-commerce-live] .cmh-design,[data-commerce-live] .cmh-ed-grid>span,[data-commerce-live] .cmh-steps li,[data-commerce-live] .cmh-step-dot::before,[data-commerce-live] .cmh-drop::after,[data-commerce-live] .cmh-ship,[data-commerce-live] .cmh-tap,[data-commerce-live] .cmh-op-sheet,[data-commerce-live] .cmh-drop-ok,[data-commerce-live] .cmh-file,[data-commerce-live] .cmh-mail,[data-commerce-live] .cmh-lesson,[data-commerce-live] .cmh-l-dot,[data-commerce-live] .cmh-c-bar span,[data-commerce-live] .cmh-amt-on,[data-commerce-live] .cmh-pop{animation-play-state:running!important}

/* merch */
.cmh-merch{position:relative;display:flex;align-items:center;gap:clamp(18px,3vw,44px);padding:0 24px}
.cmh-ed{width:clamp(230px,22vw,300px);background:#fff;border-radius:20px;padding:12px;box-shadow:0 1px 2px rgba(24,24,27,.05),0 20px 50px -20px rgba(76,29,149,.25)}
.cmh-ed-pic{position:relative;height:clamp(150px,13vw,190px);border-radius:12px;background:#f1f1f3;display:grid;place-items:center;overflow:hidden}
/* Sized by its width: the same box before and after the file arrives (a height in % resolved only before it, so the tee jumped from 118px to 254px wide as it loaded) */
.cmh-ed-pic>img{width:92%;height:auto}
.cmh-design{position:absolute;left:44%;top:27%;width:28%;aspect-ratio:1;margin-left:-14%;border:1.5px dashed #7c3aed;border-radius:6px;padding:5px;animation:cmh-drop 8s cubic-bezier(.2,.8,.2,1) infinite}
.cmh-badge{position:relative;display:grid;place-items:center;width:100%;height:100%;border-radius:50%;overflow:hidden}
.cmh-badge img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cmh-badge span{position:relative;font-size:7px;font-weight:800;letter-spacing:.08em;color:#fff;text-align:center;line-height:1}
@keyframes cmh-drop{0%{opacity:0;transform:translate3d(0,-70px,0) scale(1.5) rotate(-12deg)}12%,100%{opacity:1;transform:none}92%{opacity:1}97%{opacity:0}}
.cmh-ed-rows{padding:10px 4px 2px}
.cmh-ed-name{font-size:14px;font-weight:600}
.cmh-ed-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
.cmh-ed-grid small{display:block;font-size:10.5px;color:#8b8b94}
.cmh-ed-grid b{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.cmh-ed-profit b{color:#15803d}
.cmh-ed-grid>span:nth-child(1){animation:cmh-price 8s ease infinite}
@keyframes cmh-price{0%,24%{opacity:.25;transform:translate3d(0,4px,0)}29%,94%{opacity:1;transform:none}100%{opacity:.25}}
.cmh-steps{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.cmh-steps li{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:500;color:#3f3f46;opacity:.4;animation:8s ease infinite}
.cmh-step-dot{position:relative;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#fff;color:#fff;box-shadow:inset 0 0 0 1.5px #d4d4d8}
.cmh-step-dot::before{content:"";position:absolute;inset:0;border-radius:50%;background:#7c3aed;opacity:0;transform:scale(.5);animation:8s ease infinite}
.cmh-step-dot svg{position:relative}
${STEP_KEYS}
.cmh-ship{position:absolute;right:20px;bottom:20px;display:flex;align-items:center;gap:10px;padding:10px 14px 10px 12px;border-radius:14px;background:#18181b;color:#fff;box-shadow:0 14px 30px -12px rgba(0,0,0,.45);animation:cmh-ship 8s cubic-bezier(.2,.8,.2,1) infinite}
.cmh-ship b{display:block;font-size:13px;font-weight:600}
.cmh-ship small{font-size:11.5px;color:#a1a1aa}
@keyframes cmh-ship{0%,62%{opacity:0;transform:translate3d(0,18px,0) scale(.96)}68%,92%{opacity:1;transform:none}98%,100%{opacity:0;transform:translate3d(0,8px,0)}}

/* OnePage + sheet */
.cmh-op{width:100%;height:100%;display:flex;justify-content:center;align-items:flex-start}
.cmh-op-page{position:relative;width:min(240px,74%);height:100%;margin-top:34px;padding:22px 16px;border-radius:30px 30px 0 0;background:#fff;text-align:center;overflow:hidden;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)}
.cmh-op-av{width:56px;height:56px;border-radius:50%;object-fit:cover;margin:0 auto;display:block}
.cmh-op-name{margin-top:8px;font-size:15px;font-weight:600}
.cmh-op-bio{font-size:12px;color:#71717a}
.cmh-op-link{margin-top:10px;height:38px;display:grid;place-items:center;border-radius:12px;background:#f4f4f6;font-size:12.5px;font-weight:500}
.cmh-op-prod{position:relative;margin-top:8px;display:flex;align-items:center;gap:10px;padding:7px;border-radius:12px;border:1px solid #ececf0;text-align:left}
.cmh-op-prod img,.cmh-sh-row img{width:36px;height:36px;border-radius:8px;object-fit:cover}
.cmh-op-prod b,.cmh-sh-row b{display:block;font-size:12.5px;font-weight:600}
.cmh-op-prod small,.cmh-sh-row small{font-size:11.5px;color:#71717a}
.cmh-tap{position:absolute;right:16px;top:50%;width:26px;height:26px;margin-top:-13px;border-radius:50%;background:rgba(124,58,237,.35);opacity:0;animation:cmh-tap 7s ease infinite}
@keyframes cmh-tap{0%,14%{opacity:0;transform:scale(.4)}18%{opacity:1;transform:scale(1)}24%,100%{opacity:0;transform:scale(1.6)}}
.cmh-op-sheet{position:absolute;left:0;right:0;bottom:0;padding:8px 14px 56px;border-radius:22px 22px 0 0;background:#fff;box-shadow:0 -14px 40px rgba(30,27,75,.28);text-align:left;animation:cmh-sheet 7s cubic-bezier(.2,.8,.2,1) infinite}
@keyframes cmh-sheet{0%,22%{transform:translate3d(0,110%,0)}34%,82%{transform:none}94%,100%{transform:translate3d(0,110%,0)}}
.cmh-grab{display:block;width:34px;height:4px;border-radius:4px;background:#e4e4e7;margin:0 auto 10px}
.cmh-sh-row{display:flex;align-items:center;gap:10px}
.cmh-sh-row>span{flex:1;min-width:0}
.cmh-sh-row>span b,.cmh-sh-row>span small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-sh-row>b{flex:none}
.cmh-sh-price{margin-left:auto}
.cmh-sh-ap{margin-top:12px;height:38px;display:flex;align-items:center;justify-content:center;gap:3px;border-radius:10px;background:#000;color:#fff;font-size:14px;font-weight:600}
.cmh-sh-buy{margin-top:7px;height:38px;display:grid;place-items:center;border-radius:10px;border:1px solid #e4e4e7;font-size:13px;font-weight:600}

/* digital */
.cmh-dig{position:relative;width:100%;height:100%;display:grid;place-items:center}
.cmh-drop{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;width:min(240px,76%);padding:66px 16px 18px;border-radius:20px;background:#fff;border:1.5px dashed #d4d4d8}
.cmh-drop::after{content:"";position:absolute;inset:-1.5px;border-radius:20px;border:1.5px dashed #7c3aed;opacity:0;animation:cmh-zone 7s ease infinite}
@keyframes cmh-zone{0%,20%{opacity:0}26%,70%{opacity:1}80%,100%{opacity:0}}
.cmh-drop-l{font-size:14px;font-weight:600}
.cmh-drop-s{font-size:12px;color:#71717a}
.cmh-drop-ok{display:inline-flex;align-items:center;gap:4px;margin-top:8px;padding:3px 9px;border-radius:99px;background:#f0fdf4;color:#15803d;font-size:11.5px;font-weight:600;animation:cmh-ok 7s ease infinite}
@keyframes cmh-ok{0%,26%{opacity:0;transform:scale(.8)}32%,88%{opacity:1;transform:none}96%,100%{opacity:0}}
.cmh-file{position:absolute;left:50%;top:14px;display:flex;align-items:center;gap:8px;width:164px;margin-left:-82px;padding:8px 10px;border-radius:12px;background:#18181b;color:#fff;box-shadow:0 12px 30px -10px rgba(0,0,0,.45);animation:cmh-file 7s cubic-bezier(.3,1.2,.4,1) infinite}
.cmh-file b{display:block;font-size:12px;font-weight:600}
.cmh-file small{font-size:11px;color:#a1a1aa}
@keyframes cmh-file{0%{opacity:0;transform:translate3d(0,-90px,0) rotate(-8deg)}6%{opacity:1}22%,88%{opacity:1;transform:none}96%,100%{opacity:0;transform:translate3d(0,-10px,0)}}
.cmh-mail{position:absolute;right:14px;bottom:16px;left:14px;max-width:290px;margin-left:auto;display:flex;align-items:center;gap:10px;padding:10px 10px 10px 12px;border-radius:16px;background:rgba(255,255,255,.96);box-shadow:0 16px 40px -14px rgba(24,24,27,.35);animation:cmh-mail 7s cubic-bezier(.2,.8,.2,1) infinite}
@keyframes cmh-mail{0%,40%{opacity:0;transform:translate3d(0,24px,0)}48%,88%{opacity:1;transform:none}96%,100%{opacity:0;transform:translate3d(0,10px,0)}}
.cmh-mail-ic{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:#ede9fe;color:#6d28d9;flex:none}
.cmh-mail-t{flex:1;min-width:0}
.cmh-mail-t small{display:block;font-size:11px;color:#8b8b94}
.cmh-mail-t b{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-mail-b{padding:6px 10px;border-radius:9px;background:#18181b;color:#fff;font-size:11.5px;font-weight:600}

/* course */
.cmh-course{width:min(270px,82%);padding:12px;border-radius:20px;background:#fff;box-shadow:0 20px 50px -24px rgba(76,29,149,.35)}
.cmh-c-head{display:flex;align-items:center;gap:10px}
.cmh-c-head img{width:58px;height:40px;border-radius:9px;object-fit:cover}
.cmh-c-head b{display:block;font-size:14px;font-weight:600}
.cmh-c-head small{font-size:11.5px;color:#71717a}
.cmh-c-list{display:grid;gap:6px;margin-top:10px}
.cmh-lesson{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border-radius:10px;background:#f6f5fb;font-size:12.5px;font-weight:500;animation:cmh-lesson 8s cubic-bezier(.2,.8,.2,1) infinite;animation-delay:calc(var(--i) * .35s)}
@keyframes cmh-lesson{0%{opacity:0;transform:translate3d(0,14px,0)}8%,90%{opacity:1;transform:none}97%,100%{opacity:0}}
.cmh-l-n{width:14px;color:#a1a1aa;font-variant-numeric:tabular-nums}
.cmh-l-dot{order:3;margin-left:auto;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#7c3aed;color:#fff;opacity:0;transform:scale(.4);animation:8s cubic-bezier(.3,1.5,.5,1) infinite}
${TICK_KEYS}
.cmh-c-bar{position:relative;height:6px;margin-top:12px;border-radius:6px;background:#ede9fe;overflow:hidden}
.cmh-c-bar span{position:absolute;inset:0;background:linear-gradient(90deg,#7c3aed,#6366f1);transform-origin:0 50%;animation:cmh-bar 8s cubic-bezier(.2,.8,.2,1) infinite}
@keyframes cmh-bar{0%,22%{transform:scaleX(0)}27%,36%{transform:scaleX(.25)}41%,50%{transform:scaleX(.5)}55%,64%{transform:scaleX(.75)}69%,90%{transform:scaleX(1)}97%,100%{transform:scaleX(0)}}

/* tips */
.cmh-tip{position:relative;width:100%;height:100%;display:grid;place-items:center}
.cmh-tip-card{width:min(260px,80%);padding:14px;border-radius:20px;background:#fff;box-shadow:0 20px 50px -24px rgba(190,24,93,.3)}
.cmh-tip-who{display:flex;gap:10px;align-items:center}
.cmh-tip-who img{width:40px;height:40px;border-radius:50%;object-fit:cover}
.cmh-tip-who b{display:block;font-size:14px;font-weight:600}
.cmh-tip-who small{font-size:11.5px;color:#71717a}
.cmh-amts{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}
.cmh-amts span{height:36px;display:grid;place-items:center;border-radius:10px;border:1px solid #e4e4e7;font-size:13px;font-weight:600}
.cmh-amt-on{border-color:#18181b!important;box-shadow:0 0 0 1px #18181b;animation:cmh-amt 3s ease infinite}
@keyframes cmh-amt{0%,40%,100%{transform:none}46%{transform:scale(.92)}54%{transform:scale(1.04)}}
.cmh-tip-btn{margin-top:8px;height:40px;display:grid;place-items:center;border-radius:11px;background:#18181b;color:#fff;font-size:13px;font-weight:600}
.cmh-pop{position:absolute;left:calc(50% + (var(--i) - 1.5) * 52px);bottom:22%;padding:5px 10px;border-radius:99px;background:#fff;color:#be185d;font-size:13px;font-weight:700;box-shadow:0 8px 20px -8px rgba(190,24,93,.45);opacity:0;animation:cmh-pop 6s cubic-bezier(.2,.8,.2,1) infinite;animation-delay:calc(var(--i) * 1.5s)}
@keyframes cmh-pop{0%{opacity:0;transform:translate3d(0,0,0) scale(.6)}6%{opacity:1;transform:translate3d(0,-30px,0) scale(1)}30%{opacity:0;transform:translate3d(0,-150px,0) scale(.9)}100%{opacity:0}}

/* picker */
.cmh-pick{margin-top:clamp(20px,2.4vw,28px);padding:clamp(22px,3.4vw,48px);border-radius:clamp(24px,2.6vw,36px);background:#f4f4f6}
.cmh-pick-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 24px;margin-bottom:20px}
.cmh-pick-head h3{margin:0;font-size:clamp(26px,3vw,40px);font-weight:500;letter-spacing:-.04em;line-height:1.1}
.cmh-pick-head p{margin:0;color:#71717a;font-size:15.5px}
.cmh-pick-body{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(20px,3vw,40px);margin-top:24px}
.cmh-pick-vis{display:flex;flex-direction:column;justify-content:center;padding:clamp(22px,2.6vw,36px);border-radius:24px;background:#fff;min-height:280px}
.cmh-pick-icon{display:block;width:72px;height:72px;padding:16px;border-radius:20px;background:linear-gradient(145deg,#ede9fe,#e0e7ff);color:#5b21b6;animation:cmh-pop-in .5s cubic-bezier(.3,1.4,.5,1) both}
@keyframes cmh-pop-in{from{opacity:0;transform:scale(.7) rotate(-8deg)}to{opacity:1;transform:none}}
.cmh-pick-name{margin-top:16px;font-size:22px;font-weight:600;letter-spacing:-.02em}
.cmh-hundred{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:22px;font-size:14.5px;color:#71717a}
.cmh-hundred-n{font-size:20px;font-weight:600;color:#18181b;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.cmh-stack{position:relative;height:14px;margin-top:14px;border-radius:99px;overflow:hidden;background:#e4e4e7}
.cmh-stack span{position:absolute;inset:0;transform-origin:0 50%;transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.cmh-st-cost{background:#d4d4d8}
.cmh-st-fee{background:#c4b5fd}
.cmh-st-profit{background:linear-gradient(90deg,#7c3aed,#6366f1)}
.cmh-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:12px;font-size:12.5px;color:#71717a}
.cmh-legend span::before{content:"";display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:50%;vertical-align:1px}
.cmh-legend [data-k=profit]::before{background:#7c3aed}
.cmh-legend [data-k=fee]::before{background:#c4b5fd}
.cmh-legend [data-k=cost]::before{background:#d4d4d8}
.cmh-pick-figs{display:flex;flex-direction:column;gap:14px;padding:4px 0}
.cmh-rows{margin:0;display:grid;gap:10px;padding:16px 0;border-block:1px solid #e4e4e7}
.cmh-rows div{display:flex;justify-content:space-between;gap:12px;font-size:15px}
.cmh-rows dt{color:#71717a}
.cmh-rows dd{margin:0;font-weight:500;font-variant-numeric:tabular-nums}
.cmh-profit{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cmh-profit>span:first-child{font-size:16px;font-weight:500;padding-bottom:10px}
.cmh-profit-n{font-size:clamp(44px,5vw,68px);font-weight:500;letter-spacing:-.05em;line-height:1;font-variant-numeric:tabular-nums;background:linear-gradient(90deg,#6d28d9,#4f46e5);-webkit-background-clip:text;background-clip:text;color:transparent}
.cmh-note{margin:0;font-size:14px;color:#71717a}
.cmh-fine{margin:22px 0 0;font-size:12.5px;line-height:1.6;color:#8b8b94;max-width:110ch}

@media (max-width:1023px){
  .cmh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cmh-tile,.cmh-tile[data-wide]{grid-column:span 1}
  .cmh-tile[data-wide]{grid-column:1/-1}
}
@media (max-width:767px){
  .cmh-pick-body{grid-template-columns:1fr}
  .cmh-pick-vis{min-height:0;padding:22px}
}
@media (max-width:639px){
  .cmh-grid{grid-template-columns:1fr}
  .cmh-tile[data-wide]{grid-column:auto}
  .cmh-stage{height:300px}
  .cmh-tile[data-wide] .cmh-stage{height:auto;padding:22px 0 84px}
  .cmh-merch{flex-direction:column;gap:16px;padding:0 18px}
  .cmh-ed{width:min(280px,100%)}
  .cmh-steps{grid-template-columns:repeat(2,auto);gap:10px 18px}
  .cmh-ship{left:18px;right:auto}
}
@media (prefers-reduced-motion:reduce){
  .cmh-design,.cmh-ed-grid>span,.cmh-steps li,.cmh-step-dot::before,.cmh-drop::after,.cmh-ship,.cmh-tap,.cmh-op-sheet,.cmh-drop-ok,.cmh-file,.cmh-mail,.cmh-lesson,.cmh-l-dot,.cmh-c-bar span,.cmh-amt-on,.cmh-pop,.cmh-pick-icon{animation:none!important}
  .cmh-op-sheet,.cmh-mail,.cmh-ship,.cmh-file{transform:none;opacity:1}
  .cmh-l-dot,.cmh-drop-ok{opacity:1;transform:none}
  .cmh-pop,.cmh-tap{display:none}
  .cmh-c-bar span{transform:scaleX(.75)}
  .cmh-step-dot::before{opacity:1;transform:none}
  .cmh-steps li{opacity:1}
  .cmh-stack span{transition:none}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const HOW_IT_WORKS_STYLES: readonly SectionStyle[] = [COMMERCE_KIT_STYLE, { href: "w12-commerce-how", precedence: "default", css: HOW_CSS }]
