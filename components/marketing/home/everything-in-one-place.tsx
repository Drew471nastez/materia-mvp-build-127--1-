"use client"

/*
  HOME SECTION 3: "MAKE THE WORK. SKIP THE BUSYWORK." (wave 13)

  Four cards in a two by two grid, laid out the way the owner's reference
  does it: a wide card and a narrower one, then a narrower one and a wide
  one. Each is one big picture with a caption under it, a bold lead sentence
  and a grey continuation. Every picture is Storelib's own, with believable
  products and numbers:

    1. Sell anything you make: a product card that slides through merch, a
       PDF guide, a course and a community, the calm colour behind it
       changing with each; the tabs pick one, and it plays by itself while
       on screen.
    2. A store that looks like you: creators' storefronts drifting past
       without a stop.
    3. Sell anywhere in the world: a globe the visitor can spin, with orders
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

export const EVERYTHING_HEADING = { lead: "Make the work.", rest: "Skip the busywork." } as const

const IMG = "/home/everything"

/* ── 1. Sell anything you make ───────────────────────────────────────── */

type Slide = {
  tab: string
  name: string
  /** How the product's picture is drawn in the card: a photo on its own, or a cover built from one. */
  kind: "tee" | "guide" | "course" | "community"
  img: string
  w: number
  h: number
  stats: Array<[string, string]>
  status: string
}

/*
  Landing round: four real-looking products, each a calm photograph or a
  plain cover on a light grey tile, in place of the preset box render and
  the gradient membership card the owner read as AI. Each product's numbers
  add up: sold times price is the revenue.
*/
export const EVERYTHING_SLIDES: Slide[] = [
  {
    tab: "Merch",
    name: "Midnight Studio Tee",
    kind: "tee",
    img: `${IMG}/tee.webp`,
    w: 480,
    h: 480,
    stats: [
      ["Price", "$32.00"],
      ["Sold", "214"],
      ["Revenue", "$6,848.00"],
    ],
    status: "In stock",
  },
  {
    tab: "Digital",
    name: "Sourdough at Home",
    kind: "guide",
    img: `${IMG}/guide-bread.webp`,
    w: 400,
    h: 361,
    stats: [
      ["Price", "$19.00"],
      ["Downloads", "612"],
      ["Revenue", "$11,628.00"],
    ],
    status: "Live",
  },
  {
    tab: "Course",
    name: "Wheel Throwing Basics",
    kind: "course",
    img: `${IMG}/course.webp`,
    w: 480,
    h: 480,
    stats: [
      ["Price", "$129.00"],
      ["Students", "92"],
      ["Revenue", "$11,868.00"],
    ],
    status: "Enrolling",
  },
  {
    tab: "Community",
    name: "Saturday Run Club",
    kind: "community",
    img: `${IMG}/community.webp`,
    w: 480,
    h: 480,
    stats: [
      ["Price", "$12 / month"],
      ["Members", "418"],
      ["Monthly", "$5,016.00"],
    ],
    status: "Open",
  },
]

/** The product's picture: the photo, or for the PDF guide its cover, standing on the tile. */
function ProductPicture({ s }: { s: Slide }) {
  const photo = (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={s.img} alt="" width={s.w} height={s.h} loading="lazy" decoding="async" draggable={false} />
  )
  if (s.kind === "guide")
    return (
      <span className="ev-p-book">
        <span className="ev-p-book-photo">{photo}</span>
        <span className="ev-p-book-title">Sourdough at Home</span>
        <span className="ev-p-book-sub">A 52 page guide</span>
      </span>
    )
  if (s.kind === "course")
    return (
      <>
        {photo}
        <span className="ev-p-lesson">
          <span className="ev-p-play" />
          <span className="ev-p-lesson-t">Lesson 3 · Centering</span>
        </span>
        <span className="ev-p-progress" />
      </>
    )
  return photo
}

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
              <div key={s.tab} className={`ev-p-img ev-p-${s.kind}`} data-pos={pos === 0 ? "on" : pos === n - 1 ? "prev" : "next"}>
                <ProductPicture s={s} />
              </div>
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

/*
  Landing round: storefronts in the layout of a real Storelib store as a
  phone shows it (the cover, the round avatar, the name and handle, Home /
  Products / Communities, the product cards), each in its creator's own
  colours, drifting past without a stop, like the creators rail further
  down. Fictional creators, stock photography.
*/
type StoreProduct = { src: string; w: number; h: number; name: string; price: string; rating: string }
type Storefront = {
  key: string
  name: string
  handle: string
  bio: string
  cover: string
  avatar: string
  look: "light" | "cream" | "dark" | "sage" | "blush"
  products: [StoreProduct, StoreProduct]
}

const SC = "/home/showcase"
export const EVERYTHING_STORES: readonly Storefront[] = [
  {
    key: "northbound",
    name: "Northbound",
    handle: "@northbound",
    bio: "Outdoor layers, small runs",
    cover: `${SC}/lt-field.webp`,
    avatar: `${SC}/av-g.webp`,
    look: "light",
    products: [
      { src: `${IMG}/store-hoodie.webp`, w: 420, h: 520, name: "Trail Hoodie", price: "$64", rating: "4.9" },
      { src: `${IMG}/store-cap.webp`, w: 220, h: 220, name: "Ridge Cap", price: "$28", rating: "5.0" },
    ],
  },
  {
    key: "kiln",
    name: "Kiln & Clay",
    handle: "@kilnandclay",
    bio: "Stoneware, made by hand",
    cover: `${SC}/cm-cups.webp`,
    avatar: `${SC}/av-o.webp`,
    look: "cream",
    products: [
      { src: `${SC}/cm-vases.webp`, w: 640, h: 480, name: "Vase Set", price: "$86", rating: "4.9" },
      { src: `${SC}/cm-plates.webp`, w: 640, h: 480, name: "Dinner Plates", price: "$54", rating: "4.8" },
    ],
  },
  {
    key: "lumen",
    name: "Lumen Harbor",
    handle: "@lumenharbor",
    bio: "Indie band from Bristol",
    cover: `${SC}/hp-stage.webp`,
    avatar: `${SC}/av-e.webp`,
    look: "dark",
    products: [
      { src: `${SC}/hp-vinyl.webp`, w: 520, h: 640, name: "Night Swim LP", price: "$28", rating: "5.0" },
      { src: `${SC}/hp-tee.webp`, w: 480, h: 600, name: "Tour Tee", price: "$32", rating: "4.8" },
    ],
  },
  {
    key: "solsage",
    name: "Sol & Sage",
    handle: "@solandsage",
    bio: "Home cooking and classes",
    cover: `${SC}/ss-bowl.webp`,
    avatar: `${SC}/av-priya.webp`,
    look: "sage",
    products: [
      { src: `${IMG}/guide-bread.webp`, w: 400, h: 361, name: "Sourdough Guide", price: "$19", rating: "4.9" },
      { src: `${SC}/ss-pasta.webp`, w: 480, h: 480, name: "Weeknight Pasta", price: "$14", rating: "4.7" },
    ],
  },
  {
    key: "mila",
    name: "Mila Draws",
    handle: "@miladraws",
    bio: "Illustrator in Lisbon",
    cover: `${SC}/bb-brush.webp`,
    avatar: `${SC}/av-j.webp`,
    look: "blush",
    products: [
      { src: `${SC}/bb-brushes.webp`, w: 520, h: 400, name: "Brush Pack", price: "$18", rating: "5.0" },
      { src: `${SC}/bb-palette.webp`, w: 520, h: 400, name: "Color Course", price: "$49", rating: "4.9" },
    ],
  },
  {
    key: "theo",
    name: "Theo Marsh",
    handle: "@theomarsh",
    bio: "Landscape prints from the road",
    cover: `${SC}/sl-hero.webp`,
    avatar: `${SC}/av-l.webp`,
    look: "light",
    products: [
      { src: `${SC}/sl-lake.webp`, w: 520, h: 640, name: "Lake Morning", price: "$45", rating: "5.0" },
      { src: `${SC}/sl-desert.webp`, w: 520, h: 640, name: "Red Rock", price: "$45", rating: "4.9" },
    ],
  },
]

function Pic({ src, w, h, className }: { src: string; w: number; h: number; className: string }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img className={className} src={src} alt="" width={w} height={h} loading="lazy" decoding="async" draggable={false} />
}

function StoreCard({ store }: { store: Storefront }) {
  return (
    <div className={`ev-st ev-st-${store.look}`}>
      <Pic className="ev-st-cover" src={store.cover} w={600} h={240} />
      <Pic className="ev-st-av" src={store.avatar} w={96} h={96} />
      <span className="ev-st-name">{store.name}</span>
      <span className="ev-st-handle">{store.handle}</span>
      <span className="ev-st-bio">{store.bio}</span>
      <span className="ev-st-tabs">
        <span data-on="">Home</span>
        <span>Products</span>
        <span>Communities</span>
      </span>
      <span className="ev-st-h">Products</span>
      <span className="ev-st-grid">
        {store.products.map((p) => (
          <span key={p.name} className="ev-st-prod">
            <Pic className="ev-st-img" src={p.src} w={p.w} h={p.h} />
            <span className="ev-st-rate">★ {p.rating}</span>
            <span className="ev-st-pn">{p.name}</span>
            <span className="ev-st-pp">{p.price}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

function Storefronts() {
  /* The stores twice over: the strip drifts by one set's width and starts again where it looks the same. */
  const strip = [...EVERYTHING_STORES, ...EVERYTHING_STORES]
  return (
    <div className="ev-vis ev-s" aria-hidden="true">
      <div className="ev-s-track ev-loop">
        {strip.map((store, i) => (
          <div key={i} className="ev-s-slot">
            <StoreCard store={store} />
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
        sub="Order #4821 · Sourdough at Home"
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
  { key: "world", wide: false, lead: "Sell anywhere in the world.", rest: "Buyers see your prices in their currency and your pages in their language, wherever they find you." },
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

/* 1. Product slides: a calm, plain colour behind each product (landing round: no purple gradients), the product on a light grey tile */
.ev-p{background:#d9d5ce}
.ev-p-bg{position:absolute;inset:0;opacity:0;transition:opacity 1s cubic-bezier(.4,0,.2,1)}
.ev-p-bg[data-on]{opacity:1}
.ev-p-bg0{background:linear-gradient(180deg,#e2ded8,#d4cfc7)}
.ev-p-bg1{background:linear-gradient(180deg,#e3e1d6,#d3d2c3)}
.ev-p-bg2{background:linear-gradient(180deg,#e6ddd3,#d6cabd)}
.ev-p-bg3{background:linear-gradient(180deg,#dfe3e4,#ccd3d6)}
.ev-p-card{position:absolute;left:50%;top:44%;display:flex;align-items:center;gap:clamp(12px,1.8vw,20px);width:min(88%,470px);padding:10px;border-radius:18px;background:#fff;box-shadow:0 24px 48px -30px rgba(40,32,20,.45),0 1px 3px rgba(40,32,20,.08);transform:translate(-50%,-50%)}
.ev-p-media{position:relative;flex:0 0 42%;aspect-ratio:1;border-radius:12px;overflow:hidden;background:#ededed}
.ev-p-img{position:absolute;inset:0;opacity:0;transform:translate(32%,0) scale(.9);transition:opacity .4s ease,transform .9s ${EASE}}
.ev-p-img > img{display:block;width:100%;height:100%;object-fit:cover}
.ev-p-img[data-pos="prev"]{transform:translate(-32%,0) scale(.9)}
.ev-p-img[data-pos="on"]{opacity:1;transform:none;transition:opacity .6s ease .1s,transform 1s ${EASE} .06s}
.ev-p-guide{display:grid;place-items:center;background:#ecebe7}
.ev-p-book{position:relative;display:flex;flex-direction:column;width:60%;aspect-ratio:3/4;padding:6% 6% 0;box-sizing:border-box;border-radius:3px 5px 5px 3px;background:#fbf8f2;box-shadow:inset 3px 0 0 rgba(0,0,0,.05),2px 0 0 #f1ede5,3px 0 0 #e2ddd2,0 14px 22px -12px rgba(40,30,15,.45)}
.ev-p-book-photo{display:block;overflow:hidden;aspect-ratio:400/361;border-radius:2px}
.ev-p-book-photo img{display:block;width:100%;height:100%;object-fit:cover}
.ev-p-book-title{margin-top:9%;font-family:Georgia,"Times New Roman",serif;font-size:clamp(10px,1.05vw,13px);line-height:1.1;color:#2b2419}
.ev-p-book-sub{margin-top:5%;font-size:clamp(6.5px,.62vw,8px);letter-spacing:.06em;text-transform:uppercase;color:#8a8070}
.ev-p-lesson{position:absolute;left:8px;bottom:12px;display:flex;align-items:center;gap:6px;padding:4px 8px 4px 4px;border-radius:999px;background:rgba(20,20,20,.55);color:#fff;font-size:10.5px;line-height:1;white-space:nowrap}
.ev-p-play{position:relative;width:16px;height:16px;border-radius:99px;background:#fff}
.ev-p-play::after{content:"";position:absolute;left:6px;top:4.5px;border-left:6px solid #18181b;border-top:3.5px solid transparent;border-bottom:3.5px solid transparent}
.ev-p-progress{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.35)}
.ev-p-progress::after{content:"";position:absolute;inset:0 62% 0 0;background:#fff}
.ev-p-info{position:relative;display:grid;flex:1 1 auto;min-width:0;align-self:stretch;align-items:center}
.ev-p-text{grid-area:1/1;min-width:0}
.ev-p-rise{opacity:0;transform:translate(0,10px);transition:opacity .25s ease,transform .3s ease}
.ev-p-text[data-on] .ev-p-rise{opacity:1;transform:none;transition:opacity .55s ease,transform .8s ${EASE};transition-delay:calc(.2s + var(--d,0) * 55ms)}
.ev-p-name{margin:0 0 12px;font-size:clamp(14px,1.45vw,18px);font-weight:600;line-height:1.2;letter-spacing:-.02em;color:#18181b}
.ev-p-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin:0}
.ev-p-k{margin:0 0 2px;font-size:11px;color:#8b8994}
.ev-p-v{margin:0;display:flex;align-items:center;gap:6px;font-size:clamp(12.5px,1.15vw,14.5px);font-weight:500;color:#18181b;white-space:nowrap;font-variant-numeric:tabular-nums}
.ev-p-money{color:#18181b}
.ev-p-dot{width:7px;height:7px;flex:none;border-radius:99px;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18)}
.ev-tabs{position:absolute;left:50%;bottom:16px;display:flex;gap:2px;padding:4px;border-radius:999px;background:rgba(255,255,255,.5);transform:translate(-50%,0)}
.ev-tab{position:relative;overflow:hidden;height:30px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:#55525c;font-family:inherit;font-size:13px;font-weight:500;line-height:30px;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .35s ease}
.ev-tab::before{content:"";position:absolute;inset:0;border-radius:inherit;background:#fff;opacity:0;transform:scale(.85);transition:opacity .35s ease,transform .5s ${EASE}}
.ev-tab[data-on]{color:#18181b}
.ev-tab[data-on]::before{opacity:1;transform:none}
@media(hover:hover){.ev-tab:not([data-on]):hover{color:#18181b}}
.ev-tab:focus-visible{outline:2px solid #18181b;outline-offset:2px}
.ev-tab-label{position:relative}
.ev-tab-fill{position:absolute;inset:0;border-radius:inherit;background:rgba(24,24,27,.07);transform:scaleX(0);transform-origin:0 50%;opacity:0}
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

/*
  2. Storefronts (landing round): the stores twice over in one row, moved by
  one set's width in a single linear animation, so the drift never stops or
  steps and the compositor plays it alone. Paused off screen like every loop.
*/
.ev-s{background:#ebeae6;container-type:inline-size}
.ev-s-track{--slot:43cqw;position:absolute;top:28px;bottom:0;left:0;display:flex;width:max-content;animation:ev-stores 52s linear infinite}
@media(max-width:767px){.ev-s-track{--slot:58cqw;top:22px}}
.ev-s-slot{flex:none;width:var(--slot);height:100%;padding:0 7px;box-sizing:border-box}
@keyframes ev-stores{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
.ev-st{--u:calc(var(--slot) / 25);--st-bg:#fff;--st-ink:#18181b;--st-mute:#71717a;--st-line:rgba(24,24,27,.09);--st-card:#fff;position:relative;display:flex;flex-direction:column;align-items:center;height:calc(100% + 40px);overflow:hidden;border-radius:calc(var(--u) * 2.2) calc(var(--u) * 2.2) 0 0;background:var(--st-bg);color:var(--st-ink);font-size:var(--u);line-height:1.3;text-align:center;box-shadow:0 18px 36px -26px rgba(30,24,16,.4),0 0 0 1px rgba(30,24,16,.07)}
.ev-st-cream{--st-bg:#f6f0e6;--st-ink:#3b2a1e;--st-mute:#8c7a68;--st-line:rgba(59,42,30,.12);--st-card:#fffaf2}
.ev-st-dark{--st-bg:#111216;--st-ink:#f4f4f5;--st-mute:#9a9aa3;--st-line:rgba(255,255,255,.1);--st-card:#1b1c21}
.ev-st-sage{--st-bg:#eef1ea;--st-ink:#1f2a20;--st-mute:#6b7a6c;--st-line:rgba(31,42,32,.1);--st-card:#fff}
.ev-st-blush{--st-bg:#fcf0f3;--st-ink:#2a1820;--st-mute:#8f6f7b;--st-line:rgba(42,24,32,.1);--st-card:#fff}
.ev-st-cover{display:block;flex:none;width:100%;height:8.6em;object-fit:cover}
.ev-st-av{display:block;flex:none;width:5.2em;height:5.2em;margin-top:-2.6em;border:.3em solid var(--st-bg);border-radius:50%;object-fit:cover}
.ev-st-name{margin-top:.55em;font-size:1.55em;font-weight:600;letter-spacing:-.01em}
.ev-st-handle{margin-top:.1em;font-size:1.05em;color:var(--st-mute)}
.ev-st-bio{max-width:90%;margin-top:.55em;font-size:1.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev-st-tabs{display:flex;gap:1.6em;align-self:stretch;margin:1.3em 1.4em 0;padding:0 .2em;border-bottom:1px solid var(--st-line);font-size:1.05em;color:var(--st-mute)}
.ev-st-tabs span{padding-bottom:.6em}
.ev-st-tabs span[data-on]{color:var(--st-ink);box-shadow:inset 0 -.14em 0 currentColor}
.ev-st-h{align-self:flex-start;margin:1.1em 1.4em 0;font-size:1.4em;font-weight:600}
.ev-st-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8em;align-self:stretch;margin:.9em 1.4em 0;text-align:left}
.ev-st-prod{display:flex;flex-direction:column;min-width:0;overflow:hidden;border-radius:.9em;background:var(--st-card);box-shadow:0 0 0 1px var(--st-line)}
.ev-st-img{display:block;width:100%;aspect-ratio:1;object-fit:cover}
.ev-st-rate{margin:.7em .8em 0;font-size:.9em;color:var(--st-mute)}
.ev-st-pn{margin:.2em .8em 0;font-size:1.05em;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev-st-pp{margin:.35em .8em .9em;font-size:1.05em;font-weight:600}

/* 3. Globe */
.ev-g{background:#060608}
.ev-globe{position:absolute;inset:0;cursor:grab;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.ev-globe[data-dragging]{cursor:grabbing}
.ev-globe-canvas{display:block;width:100%;height:100%}
.ev-globe-pills{position:absolute;inset:0;pointer-events:none}
.ev-globe-pill{position:absolute;left:0;top:0}
.ev-globe-pill[data-on]{will-change:transform}
.ev-globe-pill[data-glide]{transition:transform .1s linear}
.ev-globe-pill-in{position:absolute;left:0;bottom:12px;display:flex;width:max-content;align-items:center;gap:7px;padding:7px 12px 7px 9px;border-radius:999px;background:#fff;color:#18181b;font-size:13px;line-height:1.2;white-space:nowrap;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);opacity:0;transform:translate(-50%,6px) scale(.92);transform-origin:50% 100%;transition:opacity .3s ease,transform .45s ${EASE}}
.ev-globe-pill[data-on] .ev-globe-pill-in{opacity:1;transform:translate(-50%,0)}
.ev-globe-flag{display:block;width:16px;height:12px;border-radius:2px;object-fit:cover}
.ev-globe-city{color:#55535c}
.ev-globe-price{font-weight:600;font-variant-numeric:tabular-nums}

/* 4. Support */
.ev-c{background:linear-gradient(180deg,#e4e6ea,#d3d7de)}
.ev-c-thread{position:absolute;left:50%;top:50%;width:min(80%,430px);padding:18px 18px 20px;border-radius:16px;background:#fff;box-shadow:0 24px 48px -30px rgba(20,24,40,.4),0 1px 3px rgba(20,24,40,.07);opacity:0;transform:translate3d(-50%,-46%,0) scale(.97);animation:ev-thread 22s ${EASE} infinite}
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
