"use client"

/**
 * ===========================================================================
 *  HOW IT WORKS: FIVE MOTION TILES (home, section 8)
 * ===========================================================================
 * Light and rounded. Each tile is a small loop drawn in HTML and CSS, not a
 * video, and each one is the product as it really looks:
 *
 *   merch      a print-on-demand product card cycling through five pieces of
 *              one artist's merch (tee, hoodie, crewneck, tote, mug), each
 *              with its price, example production cost, profit and an order
 *              moving from placed to printing to shipped
 *   checkout   a OnePage on a phone (Amara's page in the Swiss theme, drawn
 *              by the theme picker's ThemePreview): a tap on a product, the product sheet
 *              slides up, Buy now, Payment complete, and it slides away
 *   digital    the product editor uploading a ZIP, publishing, then the
 *              buyer's "Thanks for your purchase" email with Get your files
 *   course     the course builder: a lesson added and uploaded, the course
 *              published, then a student's progress coming in
 *   tips       a tip card choosing an amount, sending it, and the tip landing
 *
 * Every loop is CSS keyframes on transform and opacity only, stacked layers
 * in fixed-size boxes (grid overlap, never absolute heights that change), so
 * nothing lays out while they play. They run only while their tile is on
 * screen and the tab is visible (data-commerce-live); reduced motion shows
 * each tile's finished frame, still.
 *
 * TRUE TO THE PRODUCT. Merch without stock is print on demand through a
 * print partner the seller connects (lib/physical/providers.ts). The sheet's
 * words are the OnePage product sheet's (components/onepage/product-sheet:
 * "Buy now · $19"), the email's are the purchase receipt's
 * (lib/notify/templates/catalog.ts PURCHASE_CONFIRMATION), the builder's are
 * the course builder's ("Add lesson", "Publish", "Free preview"). Profit is
 * after Storelib's real fee (lib/payments/fees/calculate).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import type { SectionStyle } from "./lazy-section"
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { StoryHeading } from "../story-heading"
import { commerceProduct, commerceUsd } from "./commerce-kit"
import { AMARA, HomeOnePage, HomeOnePageStyle } from "./onepage-sample"

const IMG = "/home/commerce"
const HOW = "/home/how"

/** One sale of a merch piece: Storelib's Free-plan fee, worked out by checkout's own function. */
function merchSale(priceCents: number, baseCents: number) {
  const fee = calculateStorelibFee({ grossMinor: priceCents, currency: "USD", sellerPlan: "free" }).totalStorelibFeeMinor
  return { priceCents, baseCents, profitCents: priceCents - fee - baseCents }
}

/** Night Swim's merch (a fictional band). Production costs are example print partner prices. */
export const HOW_MERCH = [
  { id: "tee", name: "705 Club heavyweight tee", order: "#2041", city: "Austin, TX", ...merchSale(3000, commerceProduct("tee").baseCents) },
  { id: "hoodie", name: "Night Swim tour hoodie", order: "#2042", city: "Leeds, UK", ...merchSale(5500, commerceProduct("hoodie").baseCents) },
  { id: "crew", name: "Night Swim crewneck", order: "#2043", city: "Toronto, ON", ...merchSale(4800, commerceProduct("sweatshirt").baseCents) },
  { id: "tote", name: "World Tour tote bag", order: "#2044", city: "Berlin, DE", ...merchSale(2400, 1150) },
  { id: "mug", name: "Morning After mug", order: "#2045", city: "Denver, CO", ...merchSale(1800, 725) },
] as const

const SLIDE_S = 3.6
const CYCLE_S = SLIDE_S * HOW_MERCH.length

const vars = (v: Record<string, string | number>) => v as CSSProperties

/**
 * Wave 13 perf: each tile runs its loops only while that tile is on screen
 * (data-commerce-live on the tile, which the CSS reads), not all five while
 * any part of the section is: on a phone the tiles stack 2,700px tall, and
 * every running loop is restyled on every frame of a scroll.
 */
function useTilesLive() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const tiles = [...root.querySelectorAll<HTMLElement>(".cmh-tile")]
    const near = new Set<Element>()
    const apply = () => {
      for (const t of tiles) t.toggleAttribute("data-commerce-live", near.has(t) && !document.hidden)
    }
    if (typeof IntersectionObserver !== "function") {
      for (const t of tiles) near.add(t)
      apply()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) near.add(e.target)
          else near.delete(e.target)
        }
        apply()
      },
      { rootMargin: "120px 0px" },
    )
    for (const t of tiles) io.observe(t)
    document.addEventListener("visibilitychange", apply)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", apply)
    }
  }, [])
  return ref
}

export function HowItWorks() {
  const ref = useTilesLive()
  return (
    <section ref={ref} className="cmh" data-story-section="how-it-works" aria-labelledby="cmh-title">
      <style href="w12-commerce-how" precedence="default">
        {HOW_CSS}
      </style>
      <div className="cmh-wrap">
        <div className="story-section-heading">
          <StoryHeading id="cmh-title" text="Sell what you make. We handle the rest." accent={["make"]} />
        </div>

        <div className="cmh-grid">
          <Tile wide tone="merch" caption={<><b>Sell your own merch, no inventory.</b> Design it, set your price, and a print partner you connect prints and ships each order as it comes in.</>}>
            <MerchScene />
          </Tile>
          <Tile tone="violet" caption={<><b>People buy without leaving your page.</b> Tap a product on your OnePage and checkout slides up right there.</>}>
            <SheetScene />
          </Tile>
          <Tile caption={<><b>Sell digital products.</b> Upload a file once. Every buyer gets it by email the moment they pay.</>}>
            <DigitalScene />
          </Tile>
          <Tile tone="lilac" caption={<><b>Build and sell a course.</b> Lessons, videos and files, with each student&apos;s progress saved as they go.</>}>
            <CourseScene />
          </Tile>
          <Tile tone="warm" caption={<><b>Take tips.</b> A thank-you button for the people who just want to support you.</>}>
            <TipScene />
          </Tile>
        </div>
        <p className="cmh-fine">Example prices. Profit is shown after Storelib&apos;s 5% + $0.25 fee on Free; production costs are typical print partner prices, and Stripe&apos;s card processing fee is separate.</p>
      </div>
    </section>
  )
}

function Tile({ children, caption, wide = false, tone }: { children: ReactNode; caption: ReactNode; wide?: boolean; tone?: "merch" | "violet" | "lilac" | "warm" }) {
  return (
    <article className="cmh-tile" data-wide={wide || undefined}>
      <div className="cmh-stage" data-tone={tone} aria-hidden="true">
        {children}
      </div>
      <p className="cmh-cap">{caption}</p>
    </article>
  )
}

const Spark = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

/* 1. Merch: one product card, five products, each order printed and shipped. */
function MerchScene() {
  const slide = (i: number) => vars({ "--d": `${i * SLIDE_S - CYCLE_S}s` })
  return (
    <div className="cmh-merch" style={vars({ "--cycle": `${CYCLE_S}s`, "--slide": `${SLIDE_S}s` })}>
      <div className="cmh-mc">
        <div className="cmh-mc-pic">
          {HOW_MERCH.map((p, i) => (
            <img key={p.id} className="cmh-a cmh-mc-img" style={slide(i)} src={`${HOW}/merch-${p.id}.webp`} alt="" width={360} height={360} loading="lazy" decoding="async" />
          ))}
        </div>
        <div className="cmh-mc-info">
          <div className="cmh-stack cmh-mc-name">
            {HOW_MERCH.map((p, i) => (
              <span key={p.id} className="cmh-a cmh-sl" style={slide(i)}>
                <b>{p.name}</b>
                <small>
                  Order {p.order} · {p.city}
                </small>
              </span>
            ))}
          </div>
          <dl className="cmh-mc-facts">
            {(
              [
                ["Selling price", "priceCents", ""],
                ["Production cost", "baseCents", ""],
                ["Your profit", "profitCents", "cmh-mc-profit"],
              ] as const
            ).map(([label, key, cls]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd className={`cmh-stack ${cls}`}>
                  {HOW_MERCH.map((p, i) => (
                    <span key={p.id} className="cmh-a cmh-sl" style={slide(i)}>
                      {commerceUsd(p[key], true)}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <div className="cmh-trk">
            <span className="cmh-trk-line">
              <span className="cmh-a cmh-trk-fill" />
            </span>
            {["Ordered", "Printing", "Shipped"].map((s, i) => (
              <span key={s} className="cmh-trk-step" style={vars({ "--i": i })}>
                <span className="cmh-trk-dot">
                  <span className="cmh-a cmh-trk-on" data-step={i}>
                    <Spark />
                  </span>
                </span>
                <span className="cmh-a cmh-trk-l" data-step={i}>
                  {s}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="cmh-thumbs">
        {HOW_MERCH.map((p) => (
          <img key={p.id} src={`${HOW}/merch-${p.id}.webp`} alt="" width={40} height={40} loading="lazy" decoding="async" />
        ))}
        <span className="cmh-a cmh-thumb-ring" />
      </div>
    </div>
  )
}

/* 2. A OnePage on a phone: tap a product, the product sheet slides up, Buy now, paid. */
function SheetScene() {
  return (
    <div className="cmh-op">
      <HomeOnePageStyle />
      <div className="cmh-ph">
        <div className="cmh-ph-scr">
          <div className="cmh-ph-sb">
            <b>9:41</b>
            <span className="cmh-ph-isl" />
            <svg viewBox="0 0 34 12" width="34" height="12" fill="currentColor">
              <rect x="0" y="7" width="3" height="5" rx="1" />
              <rect x="4.5" y="5" width="3" height="7" rx="1" />
              <rect x="9" y="2.5" width="3" height="9.5" rx="1" />
              <rect x="20" y="1.5" width="12" height="9" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="21.8" y="3.3" width="7.5" height="5.4" rx="1.4" />
            </svg>
          </div>
          {/* Amara's OnePage in Swiss, a theme the picker ships, drawn by the picker's own ThemePreview (./onepage-sample); the tap lands on her presets. */}
          <HomeOnePage theme="swiss" who={AMARA} className="cmh-op-page" />
          <span className="cmh-op-hit">
            <span className="cmh-a cmh-tap cmh-tap-dark" />
          </span>
          <span className="cmh-a cmh-dim" />
          <div className="cmh-a cmh-sheet">
            <span className="cmh-grab" />
            <div className="cmh-stack">
              <div className="cmh-a cmh-sh-buy">
                <div className="cmh-sh-row">
                  <img src="/home/showcase/lt-field.webp" alt="" loading="lazy" decoding="async" width={320} height={200} />
                  <span>
                    <b>Golden Hour presets</b>
                    <small>ZIP · 48 MB</small>
                    <b className="cmh-sh-price">$19.00</b>
                  </span>
                </div>
                <div className="cmh-a cmh-sh-btn">
                  <span className="cmh-stack">
                    <span className="cmh-a cmh-sh-btn-a">Buy now · $19</span>
                    <span className="cmh-a cmh-sh-btn-b">
                      <span className="cmh-a cmh-spin" />
                    </span>
                  </span>
                </div>
              </div>
              <div className="cmh-a cmh-sh-done">
                <span className="cmh-sh-ok">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <b>Payment complete</b>
                <small>We sent your receipt and your access to sam@hey.com</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* 3. The product editor uploads the file and publishes; the buyer's receipt email arrives. */
function DigitalScene() {
  return (
    <div className="cmh-dg">
      <div className="cmh-dg-ed">
        <div className="cmh-dg-top">
          <span>Products / Digital download</span>
          <span className="cmh-stack">
            <span className="cmh-a cmh-dg-draft">Draft</span>
            <span className="cmh-a cmh-dg-live">Published</span>
          </span>
        </div>
        <div className="cmh-dg-head">
          <img src="/home/showcase/lt-field.webp" alt="" loading="lazy" decoding="async" width={320} height={200} />
          <span>
            <b>Highland Mist presets</b>
            <small>$19.00 · Instant download</small>
          </span>
        </div>
        <div className="cmh-dg-file">
          <span className="cmh-dg-zip">ZIP</span>
          <span className="cmh-dg-fn">
            <b>Highland-Mist-Presets.zip</b>
            <span className="cmh-stack">
              <small className="cmh-a cmh-dg-up">Uploading…</small>
              <small className="cmh-a cmh-dg-done">48.2 MB · Uploaded</small>
            </span>
            <span className="cmh-dg-bar">
              <span className="cmh-a cmh-dg-fill" />
            </span>
          </span>
          <span className="cmh-a cmh-dg-check">
            <Spark />
          </span>
        </div>
      </div>
      <div className="cmh-a cmh-dg-mail">
        <div className="cmh-dg-from">
          <span className="cmh-dg-av">CR</span>
          <span>
            <b>Callum Reid</b>
            <small>Your order from Callum Reid</small>
          </span>
          <small className="cmh-dg-now">now</small>
        </div>
        <div className="cmh-dg-body">
          <b>Thanks for your purchase</b>
          <p>Thanks for buying Highland Mist presets from Callum Reid. Your files are ready.</p>
          <span className="cmh-dg-get">
            Get your files
            <span className="cmh-a cmh-tap cmh-tap-dark" />
          </span>
        </div>
      </div>
    </div>
  )
}

/* 4. The course builder: a lesson added and uploaded, the course published, a student's progress in. */
function CourseScene() {
  const play = (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  )
  return (
    <div className="cmh-cb">
      <div className="cmh-cb-card">
        <div className="cmh-cb-head">
          <img src={`${IMG}/course-camera.webp`} alt="" loading="lazy" decoding="async" width={160} height={100} />
          <span>
            <b>Shoot in Manual</b>
            <small>Course · 4 lessons</small>
          </span>
          <span className="cmh-stack cmh-cb-pub">
            <span className="cmh-a cmh-cb-btn">
              Publish
              <span className="cmh-a cmh-tap" />
            </span>
            <span className="cmh-a cmh-cb-live">Published</span>
          </span>
        </div>
        <div className="cmh-cb-mod">Module 1 · The basics</div>
        <div className="cmh-cb-row">
          <span className="cmh-cb-ic">{play}</span>
          <span className="cmh-cb-t">Light and exposure</span>
          <span className="cmh-cb-tag">Free preview</span>
          <span className="cmh-cb-d">6:24</span>
        </div>
        <div className="cmh-cb-row">
          <span className="cmh-cb-ic">{play}</span>
          <span className="cmh-cb-t">Aperture, simply</span>
          <span className="cmh-cb-d">8:10</span>
        </div>
        <div className="cmh-cb-row">
          <span className="cmh-cb-ic cmh-cb-ic-f">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
              <path d="M14 3v5h5" />
            </svg>
          </span>
          <span className="cmh-cb-t">Exposure cheat sheet</span>
          <span className="cmh-cb-d">PDF</span>
        </div>
        <div className="cmh-stack cmh-cb-slot">
          <div className="cmh-a cmh-cb-add">
            + Add lesson
            <span className="cmh-a cmh-tap" />
          </div>
          <div className="cmh-a cmh-cb-row cmh-cb-new">
            <span className="cmh-cb-ic">{play}</span>
            <span className="cmh-cb-t">Shutter speed</span>
            <span className="cmh-stack cmh-cb-d">
              <span className="cmh-a cmh-cb-up">Uploading</span>
              <span className="cmh-a cmh-cb-len">9:02</span>
            </span>
            <span className="cmh-cb-bar">
              <span className="cmh-a cmh-cb-fill" />
            </span>
          </div>
        </div>
      </div>
      <div className="cmh-a cmh-cb-toast">
        <span className="cmh-cb-av">JK</span>
        <span className="cmh-cb-tt">
          <b>Jordan K. finished Shutter speed</b>
          <span className="cmh-cb-prog">
            <span className="cmh-cb-pbar">
              <span />
            </span>
            3 of 4 lessons
          </span>
        </span>
      </div>
    </div>
  )
}

/* 5. A tip card: an amount chosen, sent, and the tip landing. */
function TipScene() {
  return (
    <div className="cmh-tip">
      <div className="cmh-tip-card">
        <div className="cmh-tip-who">
          <img src={`${IMG}/tip-niamh.webp`} alt="" loading="lazy" decoding="async" width={160} height={160} />
          <span>
            <b>Support Niamh</b>
            <small>Thanks for the free patterns</small>
          </span>
        </div>
        <div className="cmh-amts">
          <span className="cmh-a cmh-amt-hl" />
          <span>$3</span>
          <span>$5</span>
          <span>$10</span>
          <span>Other</span>
        </div>
        <div className="cmh-a cmh-tip-btn">
          <span className="cmh-stack">
            <span className="cmh-a cmh-tb-3">Send $3 tip</span>
            <span className="cmh-a cmh-tb-5">Send $5 tip</span>
            <span className="cmh-a cmh-tb-ok">
              <Spark /> Thank you!
            </span>
          </span>
        </div>
      </div>
      <span className="cmh-a cmh-tip-pop">
        <b>+$5.00</b> tip from Joel
      </span>
    </div>
  )
}

/* The merch slide: each product's layers hold for one slide, then hand over in a short crossfade (in at 97.5 to 100%, out at 17.5 to 20% of the cycle, the same moment). */
const SLIDE_IN = 97.5
const SLIDE_OUT = [17.5, 20]
/* Words don't cross: the old line is gone (17.5 to 18.8%) before the new one comes in (98.8 to 100%, the same moment as 18.8 to 20% of the one before). */
const TEXT_OUT = 18.8
const TEXT_IN = 98.8

const HOW_CSS = `
.cmh{background:#fff;color:#18181b}
.cmh-wrap{max-width:1320px;margin:0 auto;padding:0 var(--landing-gutter,clamp(20px,5vw,72px))}
.cmh-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(16px,2vw,24px)}
.cmh-tile{grid-column:span 2;min-width:0}
.cmh-tile[data-wide]{grid-column:span 4}
.cmh-stage{position:relative;height:clamp(340px,28vw,400px);border-radius:clamp(22px,2.4vw,32px);background:#f4f4f6;overflow:hidden;contain:paint;font-family:inherit}
.cmh-stage[data-tone=merch]{background:radial-gradient(80% 110% at 100% 0%,#e4dafe 0%,rgba(228,218,254,0) 60%),radial-gradient(70% 100% at 0% 100%,#ece7ff 0%,rgba(236,231,255,0) 65%),#f5f3fb}
.cmh-stage[data-tone=violet]{background:linear-gradient(160deg,#4c1d95,#312e81 60%,#1e1b4b)}
.cmh-stage[data-tone=lilac]{background:linear-gradient(160deg,#efeafe,#e6e2f7)}
.cmh-stage[data-tone=warm]{background:linear-gradient(160deg,#f6f0ff,#fdeef5)}
.cmh-cap{margin:16px 4px 0;font-size:15.5px;line-height:1.55;color:#71717a;max-width:52ch;text-wrap:pretty}
.cmh-cap b{color:#18181b;font-weight:600}
.cmh-fine{margin:28px 4px 0;font-size:12.5px;line-height:1.6;color:#8b8b94;max-width:110ch}

/* Every loop is one of these, so going live restyles only the moving parts (a class, never * or a tag, in the rule keyed on data-commerce-live). */
.cmh-a{animation-duration:8s;animation-timing-function:cubic-bezier(.22,1,.36,1);animation-iteration-count:infinite;animation-fill-mode:both;animation-play-state:paused!important}
[data-commerce-live] .cmh-a{animation-play-state:running!important}
/* Stacked layers share one grid cell: the box is the size of the largest, before and after they swap. */
.cmh-stack{display:grid}
.cmh-stack>.cmh-a,.cmh-stack>.cmh-sl{grid-area:1/1}
.cmh-tap{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(124,58,237,.32);opacity:0;pointer-events:none}
.cmh-tap-dark{background:rgba(255,255,255,.4)}

/* ── merch ── */
.cmh-merch{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:20px}
.cmh-mc{display:flex;align-items:center;gap:20px;width:min(540px,100%);padding:14px 22px 14px 14px;border-radius:22px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.05),0 24px 50px -26px rgba(76,29,149,.35);box-sizing:border-box}
.cmh-mc-pic{position:relative;flex:none;width:clamp(150px,13vw,184px);aspect-ratio:1;border-radius:14px;overflow:hidden;background:#f1f1f3}
.cmh-mc-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;animation-name:cmh-img;animation-duration:var(--cycle);animation-delay:var(--d);animation-timing-function:ease}
.cmh-mc-img:first-child{opacity:1}
@keyframes cmh-img{0%{opacity:1;transform:none}${SLIDE_OUT[0]}%{opacity:1;transform:none}${SLIDE_OUT[1]}%{opacity:0;transform:none}${SLIDE_IN}%{opacity:0;transform:scale(1.04)}100%{opacity:1;transform:none}}
.cmh-mc-info{flex:1;min-width:0;display:grid;gap:14px}
.cmh-sl{display:block;min-width:0;opacity:0;animation-name:cmh-sl;animation-duration:var(--cycle);animation-delay:var(--d)}
.cmh-sl:first-child{opacity:1}
@keyframes cmh-sl{0%{opacity:1;transform:none}${SLIDE_OUT[0]}%{opacity:1;transform:none}${TEXT_OUT}%{opacity:0;transform:translate3d(0,-6px,0)}${TEXT_IN}%{opacity:0;transform:translate3d(0,6px,0)}100%{opacity:1;transform:none}}
.cmh-mc-name b{display:block;font-size:16px;font-weight:600;letter-spacing:-.015em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-mc-name small{display:block;margin-top:2px;font-size:12.5px;color:#8b8b94}
.cmh-mc-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0}
.cmh-mc-facts dt{font-size:11.5px;color:#8b8b94;white-space:nowrap}
.cmh-mc-facts dd{margin:3px 0 0;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.cmh-mc-profit{color:#15803d}
.cmh-trk{position:relative;display:grid;grid-template-columns:repeat(3,1fr);padding-top:2px}
.cmh-trk-line{position:absolute;left:9px;right:calc(33.333% - 9px);top:11px;height:2px;border-radius:2px;background:#ececf1;overflow:hidden}
.cmh-trk-fill{position:absolute;inset:0;background:#7c3aed;transform-origin:0 50%;transform:none;animation-name:cmh-trk;animation-duration:var(--slide);animation-timing-function:linear}
@keyframes cmh-trk{0%,6%{transform:scaleX(0)}40%,48%{transform:scaleX(.5)}80%,90%{transform:scaleX(1)}96%,100%{transform:scaleX(0)}}
.cmh-trk-step{position:relative;display:grid;gap:6px;justify-items:start}
.cmh-trk-dot{position:relative;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 1.5px #d9d9e0}
.cmh-trk-on{position:absolute;inset:0;display:grid;place-items:center;border-radius:50%;background:#7c3aed;color:#fff;animation-duration:var(--slide);animation-timing-function:ease}
.cmh-trk-on[data-step="1"]{animation-name:cmh-on1}
.cmh-trk-on[data-step="2"]{animation-name:cmh-on2}
@keyframes cmh-on1{0%,38%{opacity:0;transform:scale(.4)}44%,92%{opacity:1;transform:none}97%,100%{opacity:0;transform:scale(.4)}}
@keyframes cmh-on2{0%,78%{opacity:0;transform:scale(.4)}84%,92%{opacity:1;transform:none}97%,100%{opacity:0;transform:scale(.4)}}
.cmh-trk-l{font-size:12px;font-weight:500;color:#3f3f46;animation-duration:var(--slide);animation-timing-function:ease}
.cmh-trk-l[data-step="1"]{animation-name:cmh-l1}
.cmh-trk-l[data-step="2"]{animation-name:cmh-l2}
@keyframes cmh-l1{0%,38%{opacity:.45}44%,92%{opacity:1}97%,100%{opacity:.45}}
@keyframes cmh-l2{0%,78%{opacity:.45}84%,92%{opacity:1}97%,100%{opacity:.45}}
.cmh-thumbs{position:relative;display:flex;gap:8px;padding:5px;border-radius:16px;background:rgba(255,255,255,.7);box-shadow:0 0 0 1px rgba(76,29,149,.06)}
.cmh-thumbs img{width:40px;height:40px;border-radius:10px;object-fit:cover;background:#f1f1f3}
.cmh-thumb-ring{position:absolute;left:3px;top:3px;width:44px;height:44px;border-radius:12px;box-shadow:inset 0 0 0 2px #7c3aed;animation-name:cmh-ring;animation-duration:var(--cycle);animation-timing-function:cubic-bezier(.65,0,.35,1)}
@keyframes cmh-ring{0%,17.5%{transform:none}20%,37.5%{transform:translate3d(48px,0,0)}40%,57.5%{transform:translate3d(96px,0,0)}60%,77.5%{transform:translate3d(144px,0,0)}80%,97.5%{transform:translate3d(192px,0,0)}100%{transform:none}}

/* ── OnePage + product sheet ── */
.cmh-op{position:absolute;inset:0;display:flex;justify-content:center}
.cmh-ph{position:absolute;top:30px;bottom:0;width:236px;padding:7px 7px 0;border-radius:40px 40px 0 0;background:#0c0c0e;box-shadow:0 30px 60px -20px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.08);box-sizing:border-box}
.cmh-ph-scr{position:relative;height:100%;border-radius:33px 33px 0 0;background:#f2f1ec;overflow:hidden}
.cmh-ph-sb{display:flex;align-items:center;justify-content:space-between;height:34px;padding:0 20px 0 24px;font-size:12px;color:#111}
.cmh-ph-sb b{font-weight:600}
.cmh-ph-isl{width:64px;height:20px;border-radius:12px;background:#0c0c0e}
.cmh-op-page{position:absolute;left:0;right:0;top:26px;bottom:0}
.cmh-op .cmh-ph-sb{position:relative;z-index:1}
.cmh-op-hit{position:absolute;left:0;right:0;top:26px;height:0}
/* On her presets: the product block is 211 to 288px down the page at this phone's size (one size at every width). */
.cmh-op-hit .cmh-tap{left:58%;top:236px}
.cmh-tap{animation-name:cmh-tap;animation-timing-function:ease-out}
@keyframes cmh-tap{0%,11%{opacity:0;transform:scale(.4)}14%{opacity:1;transform:scale(1)}19%,100%{opacity:0;transform:scale(1.7)}}
.cmh-dim{position:absolute;inset:0;background:rgba(10,10,12,.32);opacity:0;animation-name:cmh-dim;animation-timing-function:ease}
@keyframes cmh-dim{0%,15%{opacity:0}24%,84%{opacity:1}93%,100%{opacity:0}}
.cmh-sheet{position:absolute;left:0;right:0;bottom:0;padding:8px 14px 18px;border-radius:22px 22px 0 0;background:#fff;box-shadow:0 -10px 30px rgba(17,17,19,.18);transform:none;animation-name:cmh-sheet;animation-timing-function:cubic-bezier(.32,.72,0,1)}
@keyframes cmh-sheet{0%,15%{transform:translate3d(0,105%,0)}25%,84%{transform:none}94%,100%{transform:translate3d(0,105%,0)}}
.cmh-grab{display:block;width:36px;height:4px;border-radius:4px;background:#e4e4e7;margin:0 auto 12px}
.cmh-sh-buy{animation-name:cmh-buy;animation-timing-function:ease;opacity:0}
@keyframes cmh-buy{0%,52%{opacity:1;transform:none}57%,100%{opacity:0;transform:scale(.98)}}
.cmh-sh-row{display:flex;gap:11px;align-items:center}
.cmh-sh-row img{width:58px;height:58px;border-radius:12px;object-fit:cover;flex:none}
.cmh-sh-row b{display:block;font-size:13px;font-weight:600;line-height:1.3}
.cmh-sh-row small{display:block;font-size:11.5px;color:#71717a;margin-top:1px}
.cmh-sh-row .cmh-sh-price{margin-top:5px;font-size:14px}
.cmh-sh-btn{margin-top:14px;height:42px;display:grid;place-items:center;border-radius:999px;background:#111113;color:#fff;font-size:13.5px;font-weight:600;animation-name:cmh-press;animation-timing-function:ease}
@keyframes cmh-press{0%,38%{transform:none}40.5%{transform:scale(.96)}44%,100%{transform:none}}
.cmh-sh-btn .cmh-stack{place-items:center}
.cmh-sh-btn-a{animation-name:cmh-ba;animation-timing-function:ease}
@keyframes cmh-ba{0%,41%{opacity:1}43%,100%{opacity:0}}
.cmh-sh-btn-b{opacity:0;animation-name:cmh-bb;animation-timing-function:ease}
@keyframes cmh-bb{0%,41%{opacity:0}43%,52%{opacity:1}55%,100%{opacity:0}}
.cmh-spin{display:block;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:cmh-spin .8s linear infinite}
@keyframes cmh-spin{to{transform:rotate(360deg)}}
.cmh-sh-done{display:grid;justify-items:center;align-content:center;gap:3px;text-align:center;animation-name:cmh-done;animation-timing-function:ease}
@keyframes cmh-done{0%,54%{opacity:0;transform:translate3d(0,6px,0)}59%,100%{opacity:1;transform:none}}
.cmh-sh-ok{display:grid;place-items:center;width:40px;height:40px;margin-bottom:6px;border-radius:50%;background:#dcfce7;color:#15803d}
.cmh-sh-done b{font-size:14px;font-weight:600}
.cmh-sh-done small{max-width:24ch;font-size:11.5px;line-height:1.4;color:#71717a}

/* ── digital ── */
.cmh-dg{position:absolute;inset:0;padding:18px;box-sizing:border-box}
.cmh-dg-ed{width:min(300px,92%);padding:14px;border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.05),0 18px 40px -24px rgba(24,24,27,.3);box-sizing:border-box}
.cmh-dg-top{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:#8b8b94}
.cmh-dg-draft,.cmh-dg-live{padding:3px 8px;border-radius:99px;font-size:11px;font-weight:600;justify-self:end;white-space:nowrap}
.cmh-dg-draft{background:#f4f4f5;color:#52525b;opacity:0;animation-name:cmh-x1}
.cmh-dg-live{background:#dcfce7;color:#15803d;animation-name:cmh-x2}
@keyframes cmh-x1{0%,40%{opacity:1}43%,100%{opacity:0}}
@keyframes cmh-x2{0%,40%{opacity:0;transform:scale(.9)}44%,100%{opacity:1;transform:none}}
.cmh-dg-head{display:flex;align-items:center;gap:10px;margin-top:10px}
.cmh-dg-head img{width:44px;height:44px;border-radius:10px;object-fit:cover}
.cmh-dg-head b{display:block;font-size:14px;font-weight:600}
.cmh-dg-head small{font-size:11.5px;color:#71717a}
.cmh-dg-file{display:flex;align-items:center;gap:10px;margin-top:12px;padding:9px 10px;border-radius:12px;box-shadow:inset 0 0 0 1px #ececf1}
.cmh-dg-zip{display:grid;place-items:center;width:32px;height:38px;flex:none;border-radius:6px;background:#ede9fe;color:#6d28d9;font-size:9.5px;font-weight:700;letter-spacing:.04em}
.cmh-dg-fn{flex:1;min-width:0;display:grid;gap:2px}
.cmh-dg-fn b{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-dg-fn small{font-size:11px;color:#8b8b94}
.cmh-dg-up{opacity:0;animation-name:cmh-u1}
.cmh-dg-done{animation-name:cmh-u2}
@keyframes cmh-u1{0%,30%{opacity:1}33%,100%{opacity:0}}
@keyframes cmh-u2{0%,30%{opacity:0}33%,100%{opacity:1}}
.cmh-dg-bar{position:relative;height:4px;margin-top:3px;border-radius:4px;background:#ececf1;overflow:hidden}
.cmh-dg-fill{position:absolute;inset:0;background:#7c3aed;transform-origin:0 50%;animation-name:cmh-fill;animation-timing-function:linear}
@keyframes cmh-fill{0%,4%{transform:scaleX(0)}12%{transform:scaleX(.34)}20%{transform:scaleX(.58)}30%,94%{transform:scaleX(1)}98%,100%{transform:scaleX(0)}}
.cmh-dg-check{display:grid;place-items:center;width:20px;height:20px;flex:none;border-radius:50%;background:#7c3aed;color:#fff;animation-name:cmh-pop1}
@keyframes cmh-pop1{0%,30%{opacity:0;transform:scale(.4)}34%,94%{opacity:1;transform:none}98%,100%{opacity:0;transform:scale(.4)}}
.cmh-dg-mail{position:absolute;right:14px;bottom:14px;width:min(286px,calc(100% - 44px));padding:12px 14px 13px;border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.06),0 24px 48px -18px rgba(24,24,27,.38);box-sizing:border-box;animation-name:cmh-mail}
@keyframes cmh-mail{0%,48%{opacity:0;transform:translate3d(0,26px,0)}55%,92%{opacity:1;transform:none}98%,100%{opacity:0;transform:translate3d(0,10px,0)}}
.cmh-dg-from{display:flex;align-items:center;gap:9px}
.cmh-dg-from>span:nth-child(2){flex:1;min-width:0}
.cmh-dg-av{display:grid;place-items:center;width:30px;height:30px;flex:none;border-radius:50%;background:#18181b;color:#fff;font-size:11px;font-weight:600}
.cmh-dg-from b{display:block;font-size:12.5px;font-weight:600}
.cmh-dg-from small{display:block;font-size:11px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-dg-now{align-self:flex-start;font-size:11px;color:#a1a1aa}
.cmh-dg-body{margin-top:9px;padding-top:9px;border-top:1px solid #f0f0f3}
.cmh-dg-body b{font-size:13.5px;font-weight:600}
.cmh-dg-body p{margin:3px 0 0;font-size:11.5px;line-height:1.45;color:#52525b}
.cmh-dg-get{position:relative;display:inline-grid;place-items:center;margin-top:9px;height:30px;padding:0 14px;border-radius:9px;background:#7c3aed;color:#fff;font-size:12px;font-weight:600;overflow:hidden}
.cmh-dg-get .cmh-tap{animation-name:cmh-tap2}
@keyframes cmh-tap2{0%,70%{opacity:0;transform:scale(.4)}73%{opacity:1;transform:scale(1)}79%,100%{opacity:0;transform:scale(2.2)}}

/* ── course builder ── */
.cmh-cb{position:absolute;inset:0;display:grid;place-items:center;padding:18px;box-sizing:border-box}
.cmh-cb-card{width:min(300px,100%);padding:12px;border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.05),0 20px 46px -26px rgba(76,29,149,.4);box-sizing:border-box;margin-bottom:34px}
.cmh-cb .cmh-a{animation-duration:9s}
.cmh-cb-head{display:flex;align-items:center;gap:9px}
.cmh-cb-head img{width:46px;height:32px;border-radius:7px;object-fit:cover;flex:none}
.cmh-cb-head>span:nth-child(2){flex:1;min-width:0}
.cmh-cb-head b{display:block;font-size:13px;font-weight:600}
.cmh-cb-head small{font-size:11px;color:#8b8b94}
.cmh-cb-pub{justify-items:end}
.cmh-cb-btn{position:relative;padding:5px 11px;border-radius:8px;background:#111113;color:#fff;font-size:11px;font-weight:600;overflow:hidden;opacity:0;animation-name:cmh-c1}
.cmh-cb-btn .cmh-tap{background:rgba(255,255,255,.45);animation-name:cmh-ctap}
.cmh-cb-live{align-self:center;padding:4px 9px;border-radius:99px;background:#dcfce7;color:#15803d;font-size:11px;font-weight:600;animation-name:cmh-c2}
@keyframes cmh-c1{0%,56%{opacity:1}59%,100%{opacity:0}}
@keyframes cmh-c2{0%,56%{opacity:0;transform:scale(.9)}60%,93%{opacity:1;transform:none}97%,100%{opacity:0}}
@keyframes cmh-ctap{0%,51%{opacity:0;transform:scale(.4)}54%{opacity:1;transform:scale(1)}58%,100%{opacity:0;transform:scale(1.8)}}
.cmh-cb-mod{margin:12px 2px 6px;font-size:11px;font-weight:600;color:#6b6b76}
.cmh-cb-row{position:relative;display:flex;align-items:center;gap:8px;height:34px;padding:0 9px;margin-top:5px;border-radius:9px;background:#f7f6fb;font-size:12px;font-weight:500;overflow:hidden}
.cmh-cb-ic{display:grid;place-items:center;width:20px;height:20px;flex:none;border-radius:6px;background:#ede9fe;color:#6d28d9}
.cmh-cb-ic-f{background:#f4f4f5;color:#52525b}
.cmh-cb-t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-cb-tag{padding:2px 6px;border-radius:5px;background:#fff;box-shadow:inset 0 0 0 1px #e4e4e7;font-size:10px;color:#52525b;white-space:nowrap}
.cmh-cb-d{font-size:11px;color:#8b8b94;font-variant-numeric:tabular-nums;justify-items:end}
.cmh-cb-slot{margin-top:5px}
.cmh-cb-slot .cmh-cb-row{margin-top:0}
.cmh-cb-add{position:relative;display:flex;align-items:center;justify-content:center;height:34px;border-radius:9px;box-shadow:inset 0 0 0 1.5px #d4d0e6;color:#6d28d9;font-size:12px;font-weight:600;overflow:hidden;opacity:0;animation-name:cmh-add}
.cmh-cb-add .cmh-tap{animation-name:cmh-atap}
@keyframes cmh-add{0%,13%{opacity:1;transform:none}17%,95%{opacity:0;transform:scale(.97)}99%,100%{opacity:1;transform:none}}
@keyframes cmh-atap{0%,8%{opacity:0;transform:scale(.4)}11%{opacity:1;transform:scale(1)}15%,100%{opacity:0;transform:scale(1.8)}}
.cmh-cb-new{animation-name:cmh-new}
@keyframes cmh-new{0%,14%{opacity:0;transform:translate3d(0,6px,0)}19%,94%{opacity:1;transform:none}98%,100%{opacity:0}}
.cmh-cb-up{opacity:0;animation-name:cmh-cu1}
.cmh-cb-len{animation-name:cmh-cu2}
@keyframes cmh-cu1{0%,43%{opacity:1}46%,100%{opacity:0}}
@keyframes cmh-cu2{0%,43%{opacity:0}46%,100%{opacity:1}}
.cmh-cb-bar{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(124,58,237,.12)}
.cmh-cb-fill{position:absolute;inset:0;background:#7c3aed;transform-origin:0 50%;transform:scaleX(0);opacity:0;animation-name:cmh-cfill;animation-timing-function:linear}
@keyframes cmh-cfill{0%,19%{transform:scaleX(0);opacity:1}30%{transform:scaleX(.45)}44%{transform:scaleX(1);opacity:1}47%,100%{transform:scaleX(1);opacity:0}}
.cmh-cb-toast{position:absolute;left:50%;bottom:18px;display:flex;align-items:center;gap:10px;width:min(270px,calc(100% - 36px));margin-left:min(-135px,calc(-50% + 18px));padding:10px 12px;border-radius:14px;background:#111113;color:#fff;box-shadow:0 18px 36px -14px rgba(17,17,19,.55);box-sizing:border-box;animation-name:cmh-toast}
@keyframes cmh-toast{0%,64%{opacity:0;transform:translate3d(0,18px,0)}70%,92%{opacity:1;transform:none}97%,100%{opacity:0;transform:translate3d(0,8px,0)}}
.cmh-cb-av{display:grid;place-items:center;width:30px;height:30px;flex:none;border-radius:50%;background:#7c3aed;font-size:11px;font-weight:600}
.cmh-cb-tt{flex:1;min-width:0;display:grid;gap:5px}
.cmh-cb-tt b{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-cb-prog{display:flex;align-items:center;gap:8px;font-size:10.5px;color:#a1a1aa;white-space:nowrap}
.cmh-cb-pbar{position:relative;flex:1;height:4px;border-radius:4px;background:rgba(255,255,255,.16);overflow:hidden}
.cmh-cb-pbar span{position:absolute;inset:0;background:#a78bfa;transform-origin:0 50%;transform:scaleX(.75)}

/* ── tips ── */
.cmh-tip{position:absolute;inset:0;display:grid;place-items:center;padding:18px;box-sizing:border-box}
.cmh-tip .cmh-a{animation-duration:7s}
.cmh-tip-card{width:min(270px,100%);padding:14px;border-radius:20px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.05),0 22px 48px -26px rgba(157,23,77,.35);box-sizing:border-box}
.cmh-tip-who{display:flex;gap:10px;align-items:center}
.cmh-tip-who img{width:40px;height:40px;border-radius:50%;object-fit:cover}
.cmh-tip-who b{display:block;font-size:14px;font-weight:600}
.cmh-tip-who small{font-size:11.5px;color:#71717a}
.cmh-amts{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}
.cmh-amts>span:not(.cmh-amt-hl){position:relative;height:36px;display:grid;place-items:center;border-radius:10px;box-shadow:inset 0 0 0 1px #e4e4e7;font-size:13px;font-weight:600}
.cmh-amt-hl{position:absolute;left:0;top:0;width:calc((100% - 18px) / 4);height:36px;border-radius:10px;box-shadow:inset 0 0 0 2px #18181b;background:#faf9fb;transform:translate3d(calc(100% + 6px),0,0);animation-name:cmh-hl;animation-timing-function:cubic-bezier(.32,.72,0,1)}
@keyframes cmh-hl{0%,10%{transform:none}16%,88%{transform:translate3d(calc(100% + 6px),0,0)}94%,100%{transform:none}}
.cmh-tip-btn{margin-top:8px;height:40px;display:grid;place-items:center;border-radius:11px;background:#18181b;color:#fff;font-size:13px;font-weight:600;animation-name:cmh-tpress}
@keyframes cmh-tpress{0%,30%{transform:none}32.5%{transform:scale(.96)}36%,100%{transform:none}}
.cmh-tip-btn .cmh-stack{place-items:center}
.cmh-tb-3{opacity:0;animation-name:cmh-t3}
.cmh-tb-5{opacity:0;animation-name:cmh-t5}
.cmh-tb-ok{display:inline-flex;align-items:center;gap:6px;animation-name:cmh-tok}
@keyframes cmh-t3{0%,12%{opacity:1}15%,89%{opacity:0}92%,100%{opacity:1}}
@keyframes cmh-t5{0%,12%{opacity:0}15%,33%{opacity:1}36%,74%{opacity:0}77%,89%{opacity:1}92%,100%{opacity:0}}
@keyframes cmh-tok{0%,33%{opacity:0;transform:scale(.94)}37%,72%{opacity:1;transform:none}75%,100%{opacity:0}}
.cmh-tip-pop{position:absolute;left:50%;top:calc(50% - 128px);display:inline-flex;gap:5px;align-items:baseline;padding:7px 12px;border-radius:99px;background:#fff;color:#3f3f46;font-size:12px;white-space:nowrap;box-shadow:0 10px 24px -10px rgba(157,23,77,.4);transform:translate3d(-50%,0,0);animation-name:cmh-tpop}
.cmh-tip-pop b{color:#15803d;font-weight:700;font-size:13px}
@keyframes cmh-tpop{0%,36%{opacity:0;transform:translate3d(-50%,14px,0) scale(.94)}42%,70%{opacity:1;transform:translate3d(-50%,0,0)}78%,100%{opacity:0;transform:translate3d(-50%,-10px,0)}}

@media (max-width:1023px){
  .cmh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cmh-tile,.cmh-tile[data-wide]{grid-column:span 1}
  .cmh-tile[data-wide]{grid-column:1/-1}
}
@media (max-width:639px){
  .cmh-grid{grid-template-columns:1fr}
  .cmh-tile[data-wide]{grid-column:auto}
  .cmh-stage{height:360px}
  .cmh-tile[data-wide] .cmh-stage{height:420px}
  .cmh-merch{padding:16px}
  .cmh-mc{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px 14px;padding:12px}
  .cmh-mc-pic{width:96px}
  .cmh-mc-info{display:contents}
  .cmh-mc-name{align-self:center}
  .cmh-mc-facts,.cmh-trk{grid-column:1/-1}
  .cmh-trk{padding:2px 4px 4px}
  .cmh-mc-name b{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
}
@media (prefers-reduced-motion:reduce){
  .cmh-a,.cmh-spin{animation:none!important}
  .cmh-tap,.cmh-dim,.cmh-tip-pop{display:none}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const HOW_IT_WORKS_STYLES: readonly SectionStyle[] = [{ href: "w12-commerce-how", precedence: "default", css: HOW_CSS }]
