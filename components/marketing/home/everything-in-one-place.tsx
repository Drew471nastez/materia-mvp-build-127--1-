"use client"

/*
  HOME SECTION 3: "MAKE THE WORK. SKIP THE BUSYWORK." (wave 13)

  Four cards in a two by two grid, laid out the way the owner's reference
  does it: a wide card and a narrower one, then a narrower one and a wide
  one. Each is one big picture with a caption under it, a bold lead sentence
  and a grey continuation. Every picture is Storelib's own, with believable
  products and numbers:

    1. Sell anything you make: a product card that slides through merch, a
       preset pack, a course and a community, the light behind it changing
       with each; the tabs pick one, and it plays by itself while on screen.
    2. A store that looks like you: three creators' storefronts and three
       OnePages (real OnePage themes, ./onepage-sample) gliding past.
    3. Sell in every country: a globe the visitor can spin, with orders
       arcing to buyers in currencies checkout charges in.
    4. Real support: a creator's question answered by a person at Storelib
       (app/support), and a buyer's question answered by the store.

  Motion is transform and opacity only. usePlatformSection writes
  data-platform-in (the first time the section is seen) and
  data-platform-live (on screen and the tab visible); every loop here is an
  .ev-loop, paused while not live, and the globe stops drawing. Under
  reduced motion nothing loops and the tabs still work by hand.
*/

import { StorelibLogo } from "@/components/brand/storelib-logo"
import { useCallback, useRef, useState, type CSSProperties } from "react"
import type { SectionStyle } from "./lazy-section"
import { usePlatformSection } from "./platform-motion"
import { EverythingGlobe } from "./everything-globe"
import { CLARA, HomeOnePage, HomeOnePageStyle, NOA, THEO, type HomeThemeId } from "./onepage-sample"
import type { PreviewAccount } from "@/components/onepage/themes/preview-account"

export const EVERYTHING_HEADING = { lead: "Make the work.", rest: "Skip the busywork." } as const

const IMG = "/home/everything"

/* ── 1. Sell anything you make ───────────────────────────────────────── */

type Slide = {
  tab: string
  name: string
  img: string
  w: number
  h: number
  cutout: boolean
  stats: Array<[string, string]>
  status: string
}

/** Each product's numbers add up: sold times price is the revenue. */
export const EVERYTHING_SLIDES: Slide[] = [
  {
    tab: "Merch",
    name: "Midnight Studio Tee",
    img: `${IMG}/tee.webp`,
    w: 360,
    h: 360,
    cutout: false,
    stats: [
      ["Price", "$32.00"],
      ["Sold", "214"],
      ["Revenue", "$6,848.00"],
    ],
    status: "In stock",
  },
  {
    tab: "Digital",
    name: "Golden Hour Preset Pack",
    img: `${IMG}/presets.webp`,
    w: 274,
    h: 300,
    cutout: true,
    stats: [
      ["Price", "$24.00"],
      ["Downloads", "486"],
      ["Revenue", "$11,664.00"],
    ],
    status: "Live",
  },
  {
    tab: "Course",
    name: "Shoot in Manual, in a Week",
    img: `${IMG}/course.webp`,
    w: 360,
    h: 360,
    cutout: false,
    stats: [
      ["Price", "$129.00"],
      ["Students", "92"],
      ["Revenue", "$11,868.00"],
    ],
    status: "Enrolling",
  },
  {
    tab: "Community",
    name: "Inner Circle",
    img: `${IMG}/community.webp`,
    w: 400,
    h: 261,
    cutout: true,
    stats: [
      ["Price", "$12 / month"],
      ["Members", "418"],
      ["Monthly", "$5,016.00"],
    ],
    status: "Live",
  },
]

function ProductSlides() {
  const [active, setActive] = useState(0)
  const n = EVERYTHING_SLIDES.length
  const next = useCallback(() => setActive((a) => (a + 1) % n), [n])
  return (
    <div className="ev-vis ev-p">
      {EVERYTHING_SLIDES.map((s, i) => (
        <div key={s.tab} className={`ev-p-bg ev-p-bg${i}`} data-on={i === active || undefined} aria-hidden="true" />
      ))}
      <div className="ev-p-card">
        <div className="ev-p-media" aria-hidden="true">
          {EVERYTHING_SLIDES.map((s, i) => {
            const pos = (i - active + n) % n
            return (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={s.tab}
                src={s.img}
                alt=""
                width={s.w}
                height={s.h}
                loading="lazy"
                decoding="async"
                className={`ev-p-img${s.cutout ? " ev-p-cut" : ""}`}
                data-pos={pos === 0 ? "on" : pos === n - 1 ? "prev" : "next"}
              />
            )
          })}
        </div>
        <div className="ev-p-info">
          {EVERYTHING_SLIDES.map((s, i) => (
            <div key={s.tab} className="ev-p-text" data-on={i === active || undefined} aria-hidden={i !== active || undefined}>
              <p className="ev-p-name ev-p-rise" style={{ "--d": 0 } as CSSProperties}>
                {s.name}
              </p>
              <dl className="ev-p-stats">
                {s.stats.map(([k, v], j) => (
                  <div key={k} className="ev-p-rise" style={{ "--d": j + 1 } as CSSProperties}>
                    <dt className="ev-p-k">{k}</dt>
                    <dd className={j === 2 ? "ev-p-v ev-p-money" : "ev-p-v"}>{v}</dd>
                  </div>
                ))}
                <div className="ev-p-rise" style={{ "--d": 4 } as CSSProperties}>
                  <dt className="ev-p-k">Status</dt>
                  <dd className="ev-p-v">
                    <span className="ev-p-dot" aria-hidden="true" />
                    {s.status}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>
      <div className="ev-tabs" role="group" aria-label="Product types">
        {EVERYTHING_SLIDES.map((s, i) => (
          <button key={s.tab} type="button" aria-pressed={i === active} className="ev-tab" data-on={i === active || undefined} onClick={() => setActive(i)}>
            <span className="ev-tab-fill ev-loop" aria-hidden="true" onAnimationEnd={i === active ? next : undefined} />
            <span className="ev-tab-label">{s.tab}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── 2. A store that looks like you ─────────────────────────────────── */

function Bar({ logo }: { logo: string }) {
  return (
    <div className="ev-ph-bar">
      <span className="ev-ph-burger" />
      <span className="ev-ph-logo">{logo}</span>
      <span className="ev-ph-bag" />
    </div>
  )
}

function Pic({ src, w, h, className }: { src: string; w: number; h: number; className: string }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img className={className} src={`${IMG}/${src}`} alt="" width={w} height={h} loading="lazy" decoding="async" />
}

function StoreNorthbound() {
  return (
    <div className="ev-ph ev-ph-north">
      <Bar logo="NORTHBOUND" />
      <div className="ev-ph-hero">
        <Pic className="ev-ph-hero-img" src="store-hoodie.webp" w={420} h={520} />
        <div className="ev-ph-hero-copy">
          <span className="ev-ph-kicker">Fall 26</span>
          <span className="ev-ph-title">Layers for long walks</span>
        </div>
      </div>
      <div className="ev-ph-cta">Shop the drop</div>
      <div className="ev-ph-grid">
        <div>
          <Pic className="ev-ph-thumb" src="store-crew.webp" w={220} h={220} />
          <span className="ev-ph-pn">Trail Crew</span>
          <span className="ev-ph-pp">$58</span>
        </div>
        <div>
          <Pic className="ev-ph-thumb" src="store-cap.webp" w={220} h={220} />
          <span className="ev-ph-pn">Ridge Cap</span>
          <span className="ev-ph-pp">$28</span>
        </div>
      </div>
    </div>
  )
}

function StoreKiln() {
  return (
    <div className="ev-ph ev-ph-kiln">
      <Bar logo="Kiln & Clay" />
      <div className="ev-ph-serif">
        Spring
        <br />
        Glaze Drop
      </div>
      <Pic className="ev-ph-wide" src="store-cups.webp" w={420} h={340} />
      <div className="ev-ph-row">
        <Pic className="ev-ph-sq" src="store-vases.webp" w={220} h={220} />
        <div>
          <span className="ev-ph-pn">Speckled vase set</span>
          <span className="ev-ph-pp">$86.00</span>
        </div>
      </div>
      <div className="ev-ph-row">
        <span className="ev-ph-sq ev-ph-swatch" />
        <div>
          <span className="ev-ph-pn">Wheel class, Sat 10am</span>
          <span className="ev-ph-pp">$65.00</span>
        </div>
      </div>
    </div>
  )
}

function StoreLumen() {
  return (
    <div className="ev-ph ev-ph-lumen">
      <Bar logo="LUMEN HARBOR" />
      <Pic className="ev-ph-album" src="store-album.webp" w={400} h={400} />
      <div className="ev-ph-album-copy">
        <span className="ev-ph-title">Night Swim</span>
        <span className="ev-ph-sub">New album · 10 tracks</span>
      </div>
      <div className="ev-ph-buy">
        <span>Vinyl LP</span>
        <span>$28.00</span>
      </div>
      <div className="ev-ph-buy ev-ph-buy-ghost">
        <span>Digital album</span>
        <span>$9.00</span>
      </div>
      <div className="ev-ph-tracks">
        {[
          ["1", "Low Tide", "3:42"],
          ["2", "Harbor Lights", "4:05"],
          ["3", "Undertow", "3:18"],
        ].map(([n, t, d]) => (
          <div key={n} className="ev-ph-track">
            <span className="ev-ph-tn">{n}</span>
            {t}
            <span className="ev-ph-td">{d}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/*
  Between the stores, three OnePages (the land round, the owner: "use some of
  the themes that we have on OnePage ... actually representative"): Ember,
  Halo and Atlas as the theme picker ships them, drawn by the picker's own
  ThemePreview (./onepage-sample). Each sits under the link it is shared by (storelib.me/<handle>,
  lib/url-helpers getLinksShareUrl), in a browser's address bar.
*/
function onePage(theme: HomeThemeId, who: PreviewAccount, handle: string) {
  return function OnePagePhone() {
    return (
      <div className="ev-ph ev-ph-op">
        <span className="ev-ph-op-bar">
          <span className="ev-ph-op-link">storelib.me/{handle}</span>
        </span>
        <HomeOnePage theme={theme} who={who} className="ev-ph-op-page" />
      </div>
    )
  }
}
const OnePageNoa = onePage("ember", NOA, "noalind")
const OnePageClara = onePage("halo", CLARA, "clarapaints")
const OnePageTheo = onePage("atlas", THEO, "theomarsh")

/* A store, a OnePage, a store, a OnePage: what the caption says, both ways to sell. */
const STORES = [StoreNorthbound, OnePageNoa, StoreKiln, OnePageClara, StoreLumen, OnePageTheo]

function Storefronts() {
  /* The last one, the six, then the first two again: the strip glides one phone at a time and starts over where it looks the same. */
  const strip = [STORES[5], ...STORES, STORES[0], STORES[1]]
  return (
    <div className="ev-vis ev-s" aria-hidden="true">
      <HomeOnePageStyle />
      <div className="ev-s-track ev-loop">
        {strip.map((Store, i) => (
          <div key={i} className="ev-s-slot">
            <Store />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 4. Support ──────────────────────────────────────────────────────── */

function Thread({ variant, title, sub, ask, askAv, reply, replyAv, replyLogo }: { variant: "a" | "b"; title: string; sub: string; ask: string; askAv: string; reply: string; replyAv: string; replyLogo?: boolean }) {
  return (
    <div className={`ev-c-thread ev-c-${variant} ev-loop`}>
      <div className="ev-c-head">
        <span>{title}</span>
        <span className="ev-c-sub">{sub}</span>
      </div>
      <div className="ev-c-msg ev-c-q ev-loop">
        <p className="ev-c-bubble ev-c-light">{ask}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ev-c-av" src={askAv} alt="" width={96} height={96} loading="lazy" decoding="async" />
      </div>
      <div className="ev-c-slot">
        <div className="ev-c-typing ev-loop">
          <span className="ev-c-dot ev-loop" />
          <span className="ev-c-dot ev-loop" />
          <span className="ev-c-dot ev-loop" />
        </div>
        <div className="ev-c-msg ev-c-r ev-loop">
          <p className="ev-c-bubble ev-c-dark">{reply}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {replyLogo ? <StorelibLogo size={96} alt="" fluid className="ev-c-av ev-c-logo" /> : <img className="ev-c-av" src={replyAv} alt="" width={96} height={96} loading="lazy" decoding="async" />}
        </div>
      </div>
    </div>
  )
}

function Support() {
  return (
    <div className="ev-vis ev-c" aria-hidden="true">
      <Thread
        variant="a"
        title="Storelib support"
        sub="Payout for October"
        ask="My October payout says sent, but it isn't in my bank yet. Can you check?"
        askAv={`${IMG}/av-creator.webp`}
        reply="It left on Nov 4, and banks take 2 to 3 business days, so your $2,184.60 lands by Friday. I'll keep this open until it does."
        replyAv=""
        replyLogo
      />
      <Thread
        variant="b"
        title="From a buyer"
        sub="Order #4821 · Golden Hour Preset Pack"
        ask="The download link in my email won't open on my iPad. Could you send it again?"
        askAv={`${IMG}/av-buyer.webp`}
        reply="Just sent a fresh one. Your files are also in your Storelib library, so you can download them again anytime."
        replyAv={`${IMG}/av-creator.webp`}
      />
    </div>
  )
}

/* ── The section ─────────────────────────────────────────────────────── */

export const EVERYTHING_CARDS = [
  { key: "sell", wide: true, lead: "Sell anything you make.", rest: "Merch, downloads, courses and communities live in one catalog, with one checkout for all of them." },
  { key: "store", wide: false, lead: "Build a store that looks like you.", rest: "Start from a template and make every part yours, or skip the website and share a OnePage link." },
  { key: "world", wide: false, lead: "Sell in every country.", rest: "Buyers see your prices in their currency and your pages in their language, wherever they find you." },
  { key: "support", wide: true, lead: "Real support for you and your buyers.", rest: "A person at Storelib reads and answers every request, and buyers reach you right from their order page." },
] as const

export function EverythingInOnePlace() {
  const ref = useRef<HTMLElement>(null)
  const { live, reduced } = usePlatformSection(ref)
  const visuals = {
    sell: <ProductSlides />,
    store: <Storefronts />,
    world: (
      <div className="ev-vis ev-g">
        <EverythingGlobe live={live} reduced={reduced} />
      </div>
    ),
    support: <Support />,
  }
  return (
    <section ref={ref} id="everything-in-one-place" aria-labelledby="everything-in-one-place-title" className="ev" data-everything="">
      <style href="w13-everything" precedence="w13-home">
        {CSS}
      </style>
      <div className="ev-in">
        <h2 id="everything-in-one-place-title" className="ev-h">
          {EVERYTHING_HEADING.lead} <span className="ev-h-mute">{EVERYTHING_HEADING.rest}</span>
        </h2>
        <div className="ev-grid">
          {EVERYTHING_CARDS.map((c, i) => (
            <article key={c.key} className={`ev-card ${c.wide ? "ev-wide" : "ev-narrow"}`} style={{ "--i": i } as CSSProperties}>
              {visuals[c.key]}
              <p className="ev-cap">
                <b className="ev-cap-lead">{c.lead}</b> {c.rest}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/*
  THE STYLESHEET, one <style href precedence>: React puts it in <head> once,
  and lazy-sections.tsx lists it so it is already there before the section
  mounts. Only transform and opacity animate.
*/
const EASE = "cubic-bezier(.22,1,.36,1)"
const GLIDE = "cubic-bezier(.65,0,.35,1)"
const CSS = `
.ev{position:relative;isolation:isolate;background:#fff;color:#18181b;padding:var(--home-pad,clamp(72px,9vw,128px)) var(--landing-gutter,22px)}
.ev-in{max-width:1240px;margin:0 auto}
.ev-h{margin:0 0 clamp(32px,4.4vw,60px);font-size:clamp(34px,4.6vw,64px);font-weight:500;line-height:1.05;letter-spacing:-.045em;color:#18181b;text-wrap:balance}
.ev-h-mute{color:#8e8c96}
.ev-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:44px}
@media(min-width:768px){
  .ev-grid{grid-template-columns:repeat(24,minmax(0,1fr));column-gap:clamp(16px,2vw,28px);row-gap:clamp(48px,5vw,72px)}
  .ev-wide{grid-column:span 13}
  .ev-narrow{grid-column:span 11}
}
.ev-card{min-width:0;opacity:0;transform:translate(0,28px);transition:opacity .7s ${EASE},transform .9s ${EASE};transition-delay:calc(var(--i,0) * 90ms)}
.ev[data-platform-in] .ev-card{opacity:1;transform:none}
.ev-vis{position:relative;overflow:hidden;height:clamp(300px,86vw,380px);border-radius:18px;isolation:isolate;contain:paint}
@media(min-width:768px){.ev-vis{height:clamp(320px,32vw,440px);border-radius:20px}}
.ev-cap{margin:18px 0 0;max-width:46ch;font-size:15.5px;line-height:1.5;color:#7c7a84;text-wrap:pretty}
.ev-cap-lead{font-weight:500;color:#18181b}
@media(min-width:768px){.ev-cap{font-size:16px}}

.ev[data-platform-live="false"] .ev-loop,.ev:not([data-platform-live]) .ev-loop{animation-play-state:paused}
.ev[data-platform-live="false"] .ev-tab[data-on] .ev-tab-fill,.ev:not([data-platform-live]) .ev-tab[data-on] .ev-tab-fill{animation-play-state:paused}

/* 1. Product slides */
.ev-p{background:#5b2a8a}
.ev-p-bg{position:absolute;inset:0;opacity:0;transition:opacity 1s cubic-bezier(.4,0,.2,1)}
.ev-p-bg[data-on]{opacity:1}
.ev-p-bg0{background:radial-gradient(60% 70% at 18% 20%,#ff9cbd 0%,rgba(255,156,189,0) 70%),radial-gradient(55% 65% at 88% 88%,#ffbb8f 0%,rgba(255,187,143,0) 70%),linear-gradient(135deg,#c2417a 0%,#a947a8 55%,#e27a86 100%)}
.ev-p-bg1{background:radial-gradient(60% 70% at 82% 16%,#ffd89c 0%,rgba(255,216,156,0) 70%),radial-gradient(60% 70% at 12% 92%,#f58ab5 0%,rgba(245,138,181,0) 70%),linear-gradient(140deg,#e9884f 0%,#cb5a8d 55%,#7b3fc4 100%)}
.ev-p-bg2{background:radial-gradient(60% 70% at 18% 14%,#93b6ff 0%,rgba(147,182,255,0) 70%),radial-gradient(55% 65% at 88% 88%,#bda2ff 0%,rgba(189,162,255,0) 70%),linear-gradient(135deg,#2d3a9e 0%,#4a3fbf 50%,#7b5bd9 100%)}
.ev-p-bg3{background:radial-gradient(60% 70% at 86% 14%,#dccaff 0%,rgba(220,202,255,0) 70%),radial-gradient(55% 65% at 10% 88%,#8f6bff 0%,rgba(143,107,255,0) 70%),linear-gradient(135deg,#5b21b6 0%,#7c3aed 50%,#a78bfa 100%)}
.ev-p-card{position:absolute;left:50%;top:44%;display:flex;align-items:center;gap:clamp(12px,1.8vw,20px);width:min(88%,470px);padding:10px;border-radius:14px;background:#fff;box-shadow:0 30px 60px -28px rgba(30,10,60,.55),0 2px 6px rgba(30,10,60,.08);transform:translate(-50%,-50%)}
.ev-p-media{position:relative;flex:0 0 42%;aspect-ratio:1;border-radius:9px;overflow:hidden;background:#f3f2f4}
.ev-p-img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:translate(32%,0) scale(.9);transition:opacity .4s ease,transform .9s ${EASE}}
.ev-p-cut{left:12%;top:12%;width:76%;height:76%;object-fit:contain}
.ev-p-img[data-pos="prev"]{transform:translate(-32%,0) scale(.9)}
.ev-p-img[data-pos="on"]{opacity:1;transform:none;transition:opacity .6s ease .1s,transform 1s ${EASE} .06s}
.ev-p-info{position:relative;display:grid;flex:1 1 auto;min-width:0;align-self:stretch;align-items:center}
.ev-p-text{grid-area:1/1;min-width:0}
.ev-p-rise{opacity:0;transform:translate(0,10px);transition:opacity .25s ease,transform .3s ease}
.ev-p-text[data-on] .ev-p-rise{opacity:1;transform:none;transition:opacity .55s ease,transform .8s ${EASE};transition-delay:calc(.2s + var(--d,0) * 55ms)}
.ev-p-name{margin:0 0 12px;font-size:clamp(14px,1.45vw,18px);font-weight:600;line-height:1.2;letter-spacing:-.02em;color:#18181b}
.ev-p-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin:0}
.ev-p-k{margin:0 0 2px;font-size:11px;color:#8b8994}
.ev-p-v{margin:0;display:flex;align-items:center;gap:6px;font-size:clamp(12.5px,1.15vw,14.5px);font-weight:500;color:#18181b;white-space:nowrap;font-variant-numeric:tabular-nums}
.ev-p-money{color:#6d28d9}
.ev-p-dot{width:7px;height:7px;flex:none;border-radius:99px;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18)}
.ev-tabs{position:absolute;left:50%;bottom:16px;display:flex;gap:2px;padding:4px;border-radius:999px;background:rgba(18,8,36,.3);transform:translate(-50%,0)}
.ev-tab{position:relative;overflow:hidden;height:30px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:rgba(255,255,255,.88);font-family:inherit;font-size:13px;font-weight:500;line-height:30px;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .35s ease}
.ev-tab::before{content:"";position:absolute;inset:0;border-radius:inherit;background:#fff;opacity:0;transform:scale(.85);transition:opacity .35s ease,transform .5s ${EASE}}
.ev-tab[data-on]{color:#18181b}
.ev-tab[data-on]::before{opacity:1;transform:none}
@media(hover:hover){.ev-tab:not([data-on]):hover{color:#fff}}
.ev-tab:focus-visible{outline:2px solid #fff;outline-offset:2px}
.ev-tab-label{position:relative}
.ev-tab-fill{position:absolute;inset:0;border-radius:inherit;background:rgba(124,58,237,.16);transform:scaleX(0);transform-origin:0 50%;opacity:0}
.ev-tab[data-on] .ev-tab-fill{opacity:1;animation:ev-fill 4.6s linear both}
@media(hover:hover){.ev-p:hover .ev-tab-fill{animation-play-state:paused}}
@keyframes ev-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media(max-width:479px){
  .ev-tab{padding:0 10px;font-size:12.5px}
  .ev-p-card{top:43%;width:92%;gap:12px}
  .ev-p-media{flex-basis:40%}
  .ev-p-stats{gap:8px 8px}
  .ev-p-k{font-size:10.5px}
  .ev-p-v{font-size:12px}
}

/* 2. Storefronts */
.ev-s{background:#ececef;container-type:inline-size}
.ev-s-track{--slot:46cqw;position:absolute;top:30px;bottom:0;left:calc(50% - 1.5 * var(--slot));display:flex;animation:ev-stores 27s infinite}
@media(max-width:767px){.ev-s-track{--slot:54cqw;top:24px}}
.ev-s-slot{flex:none;width:var(--slot);height:100%;padding:0 7px;box-sizing:border-box}
@keyframes ev-stores{
  0%,12.67%{transform:translate3d(0,0,0);animation-timing-function:${GLIDE}}
  16.67%,29.33%{transform:translate3d(calc(-100% / 9),0,0);animation-timing-function:${GLIDE}}
  33.33%,46%{transform:translate3d(calc(-200% / 9),0,0);animation-timing-function:${GLIDE}}
  50%,62.67%{transform:translate3d(calc(-300% / 9),0,0);animation-timing-function:${GLIDE}}
  66.67%,79.33%{transform:translate3d(calc(-400% / 9),0,0);animation-timing-function:${GLIDE}}
  83.33%,96%{transform:translate3d(calc(-500% / 9),0,0);animation-timing-function:${GLIDE}}
  100%{transform:translate3d(calc(-600% / 9),0,0)}
}
.ev-ph{--u:calc(var(--slot) / 25);position:relative;height:calc(100% + 40px);overflow:hidden;border-radius:calc(var(--u) * 2.6) calc(var(--u) * 2.6) 0 0;background:#fff;font-size:var(--u);line-height:1.3;box-shadow:0 20px 40px -24px rgba(20,14,40,.35),0 0 0 1px rgba(20,14,40,.06)}
.ev-ph-bar{display:flex;align-items:center;justify-content:space-between;height:4.6em;padding:0 1.5em}
.ev-ph-burger{position:relative;width:1.6em;height:1.1em;border-top:.18em solid currentColor;border-bottom:.18em solid currentColor;box-sizing:border-box}
.ev-ph-burger::after{content:"";position:absolute;left:0;right:0;top:50%;height:.18em;margin-top:-.09em;background:currentColor}
.ev-ph-bag{width:1.5em;height:1.6em;border:.18em solid currentColor;border-radius:.2em .2em .4em .4em;box-sizing:border-box}
.ev-ph-logo{font-size:1.35em;font-weight:700;letter-spacing:.12em;white-space:nowrap}
.ev-ph-hero{position:relative;margin:0 1em;border-radius:1.4em;overflow:hidden}
.ev-ph-hero-img{display:block;width:100%;height:21em;object-fit:cover}
.ev-ph-hero-copy{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:.35em;padding:3.4em 1.3em 1.3em;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.6));color:#fff}
.ev-ph-kicker{font-size:.95em;font-weight:600;letter-spacing:.08em;text-transform:uppercase;opacity:.85}
.ev-ph-title{font-size:1.8em;font-weight:700;line-height:1.08;letter-spacing:-.02em}
.ev-ph-cta{display:grid;place-items:center;height:3.7em;margin:1em 1em 0;border-radius:.9em;font-size:1.1em;font-weight:700;letter-spacing:.03em}
.ev-ph-grid{display:grid;grid-template-columns:1fr 1fr;gap:.9em;margin:1.2em 1em 0}
.ev-ph-thumb{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:1em;background:#fff}
.ev-ph-pn{display:block;margin-top:.5em;font-size:1.1em;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev-ph-pp{display:block;font-size:1.05em;opacity:.7}
.ev-ph-north{background:#2b1d6e;color:#fff}
.ev-ph-north .ev-ph-cta{background:#c9b8ff;color:#1c1150}
.ev-ph-kiln{background:#f5efe6;color:#3b2a1e}
.ev-ph-kiln .ev-ph-logo{font-family:Georgia,"Times New Roman",serif;font-style:italic;font-weight:500;letter-spacing:0;font-size:1.65em}
.ev-ph-serif{padding:.5em .55em .55em;font-family:Georgia,"Times New Roman",serif;font-size:2.7em;line-height:1;letter-spacing:-.02em;color:#8a3b1f}
.ev-ph-wide{display:block;width:calc(100% - 2em);height:15em;margin:0 1em;object-fit:cover;border-radius:1.2em}
.ev-ph-row{display:flex;align-items:center;gap:1em;margin:1em 1em 0;padding:.8em;border-radius:1.1em;background:rgba(255,255,255,.75);min-width:0}
.ev-ph-row > div{min-width:0}
.ev-ph-sq{display:block;flex:none;width:4.6em;height:4.6em;border-radius:.8em;object-fit:cover}
.ev-ph-swatch{background:linear-gradient(135deg,#e2b48c,#8a3b1f)}
.ev-ph-row .ev-ph-pn{margin-top:0}
.ev-ph-lumen{background:#0e0f1a;color:#eef0ff}
.ev-ph-album{display:block;width:calc(100% - 2em);aspect-ratio:1;margin:0 1em;object-fit:cover;border-radius:1.2em}
.ev-ph-album-copy{display:flex;flex-direction:column;gap:.3em;padding:1.2em 1.3em .7em}
.ev-ph-sub{font-size:1.05em;opacity:.6}
.ev-ph-buy{display:flex;justify-content:space-between;align-items:center;height:3.6em;margin:.6em 1em 0;padding:0 1.2em;border-radius:.9em;background:#7c3aed;color:#fff;font-size:1.1em;font-weight:600}
.ev-ph-buy-ghost{background:rgba(255,255,255,.08)}
.ev-ph-tracks{margin:1em 1.3em 0}
.ev-ph-track{display:flex;align-items:center;gap:1em;padding:.75em 0;border-top:1px solid rgba(255,255,255,.08);font-size:1.1em}
.ev-ph-tn{width:1em;opacity:.5}
.ev-ph-td{margin-left:auto;opacity:.5}
.ev-ph-op{background:#f6f6f7}
.ev-ph-op-bar{display:flex;align-items:center;justify-content:center;height:4.6em;color:#18181b}
.ev-ph-op-link{padding:.45em 1.3em;border-radius:999px;background:#e8e8ec;font-size:1.1em;font-weight:600;white-space:nowrap}
.ev-ph-op-page{position:absolute;left:0;right:0;top:calc(var(--u) * 4.6);bottom:0}

/* 3. Globe */
.ev-g{background:#060608}
.ev-globe{position:absolute;inset:0;cursor:grab;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.ev-globe[data-dragging]{cursor:grabbing}
.ev-globe-canvas{display:block;width:100%;height:100%}
.ev-globe-pills{position:absolute;inset:0;pointer-events:none}
.ev-globe-pill{position:absolute;left:0;top:0}
.ev-globe-pill[data-on]{will-change:transform}
.ev-globe-pill::before{content:"";position:absolute;left:-.5px;bottom:2px;width:1px;height:10px;background:linear-gradient(rgba(255,255,255,.9),rgba(255,255,255,0));opacity:0;transition:opacity .3s ease}
.ev-globe-pill[data-on]::before{opacity:1}
.ev-globe-pill-shift{position:absolute;left:0;bottom:0}
.ev-globe-pill-in{position:absolute;left:0;bottom:12px;display:flex;width:max-content;align-items:center;gap:7px;padding:7px 12px 7px 9px;border-radius:999px;background:#fff;color:#18181b;font-size:13px;line-height:1.2;white-space:nowrap;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);opacity:0;transform:translate(-50%,6px) scale(.92);transform-origin:50% 100%;transition:opacity .3s ease,transform .45s ${EASE}}
.ev-globe-pill[data-on] .ev-globe-pill-in{opacity:1;transform:translate(-50%,0)}
.ev-globe-flag{display:block;width:16px;height:12px;border-radius:2px;object-fit:cover}
.ev-globe-city{color:#55535c}
.ev-globe-price{font-weight:600;font-variant-numeric:tabular-nums}

/* 4. Support */
.ev-c{background:radial-gradient(70% 80% at 15% 10%,#f08bb0 0%,rgba(240,139,176,0) 70%),radial-gradient(60% 70% at 90% 95%,#e8a47c 0%,rgba(232,164,124,0) 70%),linear-gradient(160deg,#a8326a 0%,#b0447f 45%,#7c3aed 120%)}
.ev-c-thread{position:absolute;left:50%;top:50%;width:min(80%,430px);padding:18px 18px 20px;border-radius:16px;background:#fff;box-shadow:0 30px 60px -30px rgba(40,6,40,.55);opacity:0;transform:translate3d(-50%,-46%,0) scale(.97);animation:ev-thread 22s ${EASE} infinite}
.ev-c-b,.ev-c-b .ev-c-q,.ev-c-b .ev-c-r,.ev-c-b .ev-c-typing{animation-delay:-11s}
.ev-c-head{display:flex;flex-direction:column;gap:2px;margin:0 0 14px;font-size:14px;font-weight:600;color:#18181b}
.ev-c-sub{font-size:12.5px;font-weight:400;color:#7c7a84}
.ev-c-msg{display:flex;align-items:flex-end;gap:8px;margin-top:10px}
.ev-c-bubble{flex:1 1 auto;margin:0;padding:11px 13px;border-radius:12px;font-size:13.5px;line-height:1.42}
.ev-c-light{background:#f0eff2;color:#18181b}
.ev-c-dark{background:#111113;color:#fff}
.ev-c-av{display:block;flex:none;width:24px;height:24px;border-radius:7px;object-fit:cover}
.ev-c-slot{position:relative}
.ev-c-q{opacity:0;transform:translate3d(0,10px,0);animation:ev-q 22s ${EASE} infinite}
.ev-c-r{opacity:0;transform:translate3d(0,10px,0);animation:ev-r 22s ${EASE} infinite}
.ev-c-typing{position:absolute;left:0;top:10px;display:flex;gap:4px;padding:11px 13px;border-radius:12px;background:#111113;opacity:0;animation:ev-typing 22s ease infinite}
.ev-c-dot{width:6px;height:6px;border-radius:99px;background:#fff;opacity:.5;animation:ev-dot 1.1s ease-in-out infinite}
.ev-c-dot:nth-child(2){animation-delay:.15s}
.ev-c-dot:nth-child(3){animation-delay:.3s}
@keyframes ev-thread{0%{opacity:0;transform:translate3d(-50%,-46%,0) scale(.97)}4%,46%{opacity:1;transform:translate3d(-50%,-50%,0)}50%,100%{opacity:0;transform:translate3d(-50%,-54%,0) scale(.98)}}
@keyframes ev-q{0%,1%{opacity:0;transform:translate3d(0,10px,0)}5%,100%{opacity:1;transform:none}}
@keyframes ev-typing{0%,8%{opacity:0}10%,18%{opacity:1}19%,100%{opacity:0}}
@keyframes ev-r{0%,18.5%{opacity:0;transform:translate3d(0,10px,0)}22%,100%{opacity:1;transform:none}}
@keyframes ev-dot{0%,100%{opacity:.35;transform:translate3d(0,0,0)}50%{opacity:1;transform:translate3d(0,-3px,0)}}
@media(max-width:479px){
  .ev-c-thread{width:90%;padding:14px 14px 16px}
  .ev-c-bubble{font-size:12.5px;padding:9px 11px}
  .ev-c-head{font-size:13px;margin-bottom:10px}
  .ev-c-sub{font-size:11.5px}
}

@media(prefers-reduced-motion:reduce){
  .ev-card,.ev-p-bg,.ev-p-img,.ev-p-rise,.ev-tab,.ev-tab::before,.ev-globe-pill-in{transition:none !important}
  .ev-card{opacity:1;transform:none}
  .ev-loop,.ev-tab[data-on] .ev-tab-fill{animation:none !important}
  .ev-tab-fill{display:none}
  .ev-c-b,.ev-c-typing{display:none}
  .ev-c-a{opacity:1;transform:translate3d(-50%,-50%,0)}
  .ev-c-a .ev-c-q,.ev-c-a .ev-c-r{opacity:1;transform:none}
}
@media(scripting:none){.ev-card{opacity:1;transform:none}}
`

/** The section's stylesheet, put in <head> ahead of it while the browser is idle (lazy-sections.tsx). */
export const EVERYTHING_STYLES: readonly SectionStyle[] = [{ href: "w13-everything", precedence: "w13-home", css: CSS }]
