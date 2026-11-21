"use client"

/*
  HOME SECTION 3: "MAKE THE WORK. SKIP THE BUSYWORK." (wave 13)

  Four cards in a two by two grid, laid out the way the owner's reference
  does it: a wide card and a narrower one, then a narrower one and a wide
  one. Each is one big picture with a caption under it, a bold lead sentence
  and a grey continuation. Every picture is Storelib's own, with believable
  products and numbers:

    1. Sell anything you make: a product card that slides through merch, a
       LUT pack, a course and a community card, a bright gradient behind it
       cross fading with each; the tabs pick one, and it plays by itself
       while on screen. Under a mouse the white card leans away from the pointer,
       as if pressed, and springs back when the pointer leaves.
    2. A store that looks like you: merch stores and creators' link pages
       as a phone shows them, tall cards on a light grey picture (landing
       round 6, the owner's reference), drifting past, and the strip can be
       dragged and flicked. Pictures only: nothing inside it can be hovered,
       clicked or selected.
    3. Sell anywhere in the world: a globe the visitor can spin, with orders
       arcing to buyers in currencies checkout charges in.
    4. Real support: three requests take turns, a question and its answer,
       from Storelib's support or from the creator to a buyer.

  Motion is transform and opacity only. Each card rises in once, the first
  time it comes on screen (useCardReveal). usePlatformSection writes
  data-platform-live (on screen and the tab visible); every loop here is an
  .ev-loop, paused while not live, and the globe stops drawing. Under
  reduced motion nothing loops, the card does not lean, and the tabs still
  work by hand.
*/

import { useCallback, useEffect, useRef, type CSSProperties, type RefObject } from "react"
import type { SectionStyle } from "./lazy-section"
import { LIVE_AHEAD, usePartsLive, usePlatformSection } from "./platform-motion"
import { EverythingGlobe, SWIPE_SLOP, swipeAxis } from "./everything-globe"
import { StorelibLogo } from "@/components/brand/storelib-logo"

/*
  Landing round 4 (the owner: the old line was "too broad and vague"): what the four cards below say, in the same two tones.
  Landing round 5 (the owner: "Sell anything, anywhere. Support included." was "really bad"): what a seller does and
  what comes back, in plain words.
*/
export const EVERYTHING_HEADING = { lead: "Sell what you make.", rest: "Get paid worldwide." } as const

const IMG = "/home/everything"
const ST = `${IMG}/stores`

/* ── 1. Sell anything you make ───────────────────────────────────────── */

type Slide = {
  tab: string
  name: string
  /** How the product's picture is drawn in the card: a photo on its own, or a cover or page built around one. */
  kind: "tee" | "luts" | "course" | "community"
  img: string
  w: number
  h: number
  stats: Array<[string, string]>
  status: string
}

/*
  Landing round: four real-looking products on a light grey tile. Each
  product's numbers add up: sold times price is the revenue. The community
  is its page as a member sees it (components/community/member): the top
  bar with the community's mark, the places, "Share something..." and a post.

  Landing round 3 (the owner: no "cover with a landscape", an actual digital
  product, named like one, "LUTs or whatever"): the digital product is a LUT
  pack for video. Landing round 5 (the owner: its panel was "too complex and
  non realistic"): it is the cover such a pack is uploaded with, one photo
  split down the middle, flat on the left and graded on the right, with the
  pack's name (LutCover). Landing round 6 (the owner: "LUT pack without the
  12, just LUT pack", and a cover "more clean and smooth, more bold, black,
  modern"): "Cine Tones LUT Pack", no count anywhere, on a black cover. The course is a 28 day mat Pilates program in
  place of the knitting course the owner did not want.
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
    name: "Cine Tones LUT Pack",
    kind: "luts",
    img: `${IMG}/lut-still.webp`,
    w: 720,
    h: 405,
    stats: [
      ["Price", "$29.00"],
      ["Downloads", "386"],
      ["Revenue", "$11,194.00"],
    ],
    status: "Live",
  },
  {
    tab: "Course",
    name: "28 Day Mat Pilates",
    kind: "course",
    img: `${IMG}/pilates.webp`,
    w: 480,
    h: 480,
    stats: [
      ["Price", "$39.00"],
      ["Students", "412"],
      ["Revenue", "$16,068.00"],
    ],
    status: "Enrolling",
  },
  {
    tab: "Community",
    name: "AI Builders Masterclass",
    kind: "community",
    img: `${IMG}/ai-builders.webp`,
    w: 720,
    h: 380,
    stats: [
      ["Price", "$29 / month"],
      ["Members", "860"],
      ["Monthly", "$24,940.00"],
    ],
    status: "Open",
  },
]

/* eager: the store strip's pictures (landing round 8), so a page coming round the loop never arrives before its photos. */
function Img({ src, w, h, className, eager, piece }: { src: string; w: number; h: number; className?: string; eager?: boolean; piece?: boolean }) {
  /*
    Landing round 9 (the size drawn): a piece in the store strip is about 85px wide on a phone and 150px on a
    computer, so it comes at 240px wide where that is enough (every phone, a 1x screen) and at 360px on a 2x computer.
  */
  const set = piece ? { srcSet: `${src.replace(/\.webp$/, "-240.webp")} 240w, ${src} 360w`, sizes: PIECE_SIZES } : SLIDE_SETS[src] ? { srcSet: `${SLIDE_SETS[src].srcSet}, ${src} ${w}w`, sizes: SLIDE_SETS[src].sizes } : null
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img className={className} src={src} {...set} alt="" width={w} height={h} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} />
}
export const PIECE_SIZES = "(max-width:767px) 80px, 150px"
/*
  Landing round 19 (perf on a phone): the slides' two wide photos are drawn about 110px wide on a phone (the LUT pack's
  still at 720px and the community's cover at 720px were decoded whole), 12.5% of a screen from 1024px. Smaller copies
  from scripts/build-home-image-variants.mjs.
*/
const SLIDE_SETS: Record<string, { srcSet: string; sizes: string }> = {
  [`${IMG}/lut-still.webp`]: { srcSet: `${IMG}/lut-still-240.webp 240w, ${IMG}/lut-still-480.webp 480w`, sizes: "(max-width:1023px) 112px, 12.5vw" },
  [`${IMG}/ai-builders.webp`]: { srcSet: `${IMG}/ai-builders-360.webp 360w`, sizes: "(max-width:1023px) 112px, 12.5vw" },
}

/*
  Landing round 4 (the owner: "a real looking community card"): the
  community card a Storelib community shows at the top of its left column
  (components/community/member), small: the cover, the name and address,
  one line about it, Members, Online and Admins, and the faces of a few
  members. Drawn at 260px and scaled to the tile.
  Landing round 7 (the owner: get rid of the book club, "something more good and clean like AI Builders
  Masterclass"): a cohort community on a light card. A photo of a live session across the top with when the next
  one is, the name and address, the next session as its own row (the date, what gets built, the time and the
  cohort), and the members' faces with how many there are.
*/
const COMMUNITY_FACES = ["av-n", "av-e", "av-h", "av-f"] as const
function CommunityCard({ s }: { s: Slide }) {
  return (
    <span className="ev-cm">
      <span className="ev-cm-top">
        <Img className="ev-cm-cover" src={s.img} w={s.w} h={s.h} />
        <span className="ev-cm-badge">
          <span className="ev-cm-live" />
          Live Thursday
        </span>
      </span>
      <span className="ev-cm-body">
        <span className="ev-cm-name">{s.name}</span>
        <span className="ev-cm-url">storelib.com/community/ai-builders</span>
        <span className="ev-cm-next">
          <span className="ev-cm-date">
            <i>Thu</i>
            <b>14</b>
          </span>
          <span className="ev-cm-what">
            <b>Ship an agent with tools</b>
            <i>6:00 PM · Cohort 4, week 3</i>
          </span>
        </span>
        <span className="ev-cm-faces">
          {COMMUNITY_FACES.map((f) => (
            <Img key={f} className="ev-cm-face" src={`/home/showcase/${f}.webp`} w={96} h={96} />
          ))}
          <span className="ev-cm-count">860 members</span>
        </span>
      </span>
    </span>
  )
}

/*
  Landing round 6 (the owner: "more clean and smooth, more bold, black, modern", and no "12"): the cover a colorist
  sells a pack with. A black square, one graded film still across its top that fades into the black, "LUT Pack" small
  over it, and the pack's name set big and heavy at the foot. Nothing else.
*/
function LutCover({ s }: { s: Slide }) {
  return (
    <span className="ev-lut">
      <Img className="ev-lut-still" src={s.img} w={s.w} h={s.h} />
      <span className="ev-lut-tag">LUT Pack</span>
      <span className="ev-lut-name">
        <span>Cine</span>
        <span>Tones</span>
      </span>
    </span>
  )
}

/** The product's picture: the photo, or for the LUT pack its looks, standing on the tile. */
function ProductPicture({ s }: { s: Slide }) {
  const photo = <Img src={s.img} w={s.w} h={s.h} />
  if (s.kind === "luts") return <LutCover s={s} />
  if (s.kind === "course")
    return (
      <>
        {photo}
        <span className="ev-p-lesson">
          <span className="ev-p-play" />
          <span className="ev-p-lesson-t">Day 3 · Core</span>
        </span>
        <span className="ev-p-progress" />
      </>
    )
  if (s.kind === "community") return <CommunityCard s={s} />
  return photo
}

/*
  PRESSED, IT GIVES (the owner: "like I'm actually pinching it and pushing
  it back"). Under a mouse the white card leans away from the pointer by a
  few degrees and sinks a little, on a spring that runs only while it is
  moving, and springs back when the pointer leaves. Transform only, written
  straight to the element once a frame (no React state per frame). The
  pointer is placed against the stage the card stands on, which never
  leans, read at the start of a frame before anything is written. A
  finger, a pen without hover and reduced motion get none of it.
*/
const TILT_DEG = 5
function usePressTilt(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    const stage = el?.parentElement
    if (!el || !stage || typeof window.matchMedia !== "function") return
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)")
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
    let inside = false
    let px = 0
    let py = 0
    let raf = 0
    let last = 0
    /* Targets, and the springs' values and speeds: lean about x, lean about y, and the press. */
    const target = [0, 0, 0]
    const value = [0, 0, 0]
    const speed = [0, 0, 0]
    const step = (now: number) => {
      if (inside) {
        const box = stage.getBoundingClientRect()
        const nx = Math.max(-0.5, Math.min(0.5, (px - box.left) / box.width - 0.5))
        const ny = Math.max(-0.5, Math.min(0.5, (py - box.top) / box.height - 0.5))
        /* The side under the pointer goes in: pressed at the top, the top leans back; at the right, the right does. */
        target[0] = ny * -2 * TILT_DEG * 0.7
        target[1] = nx * 2 * TILT_DEG
        target[2] = 1
      }
      const dt = Math.min(0.032, last ? (now - last) / 1000 : 1 / 60)
      last = now
      let moving = false
      for (let i = 0; i < 3; i++) {
        /* A soft spring, a touch under critical damping: it settles with the smallest give, never a wobble. */
        const a = 210 * (target[i] - value[i]) - 26 * speed[i]
        speed[i] += a * dt
        value[i] += speed[i] * dt
        if (Math.abs(target[i] - value[i]) > 0.002 || Math.abs(speed[i]) > 0.01) moving = true
      }
      if (!moving)
        for (let i = 0; i < 3; i++) {
          value[i] = target[i]
          speed[i] = 0
        }
      if (!moving && !inside) {
        el.style.transform = ""
        el.style.willChange = ""
      } else el.style.transform = `rotateX(${value[0].toFixed(3)}deg) rotateY(${value[1].toFixed(3)}deg) scale(${(1 - value[2] * 0.015).toFixed(4)})`
      raf = moving ? requestAnimationFrame(step) : 0
      if (!raf) last = 0
    }
    const run = () => {
      if (!raf) raf = requestAnimationFrame(step)
    }
    const enter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches || reduce.matches) return
      inside = true
      el.style.willChange = "transform"
      move(e)
    }
    const move = (e: PointerEvent) => {
      if (!inside || e.pointerType !== "mouse") return
      px = e.clientX
      py = e.clientY
      run()
    }
    const leave = () => {
      if (!inside) return
      inside = false
      target[0] = target[1] = target[2] = 0
      run()
    }
    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      if (raf) cancelAnimationFrame(raf)
      el.style.transform = ""
      el.style.willChange = ""
    }
  }, [ref])
}

/*
  Landing round 15 (the owner: another moving picture for digital products, and on a phone the picture laid out for a
  phone rather than left out). While Digital is shown, the pack's file goes out to the buyer: a small notice with the
  file, a bar that fills, then a check and "Download link sent" (after paying, a digital product is in the buyer's
  library at once and its link is emailed to them). On a computer it stands over the card's top right corner; under
  480px it sits under the card, the card's own width, in the room above the tabs. Transform and opacity only, and it
  plays once each time Digital comes on (the tabs only turn by themselves while the section is on screen).
*/
export const DELIVERY_FILE = "cine-tones-lut-pack.zip"
function Delivery({ on }: { on: boolean }) {
  return (
    <div className="ev-p-dl" data-on={on || undefined} aria-hidden="true">
      <span className="ev-p-dl-ic">
        <svg viewBox="0 0 24 24">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
          <path d="M14 3v5h5M12 11v6m0 0-2.5-2.5M12 17l2.5-2.5" />
        </svg>
      </span>
      <span className="ev-p-dl-t">
        <b>{DELIVERY_FILE}</b>
        <span className="ev-p-dl-s">
          <i className="ev-p-dl-a">Sending download link</i>
          <i className="ev-p-dl-b">Download link sent</i>
        </span>
        <span className="ev-p-dl-bar">
          <i />
        </span>
      </span>
      <span className="ev-p-dl-ok" />
    </div>
  )
}

/**
 * Also the first tile of /pricing's bento (landing round 13). Landing round 15: /pricing passes
 * delivery={false}, the owner wanting a calm product view there without the download link going out.
 */
/* Landing round 18, the owner: no "download link sent" notice on the Digital slide anywhere (home and /pricing), so it is off unless asked for. */
/*
  THE TURN OF THE TABS COSTS NO RENDER (landing round 19, perf on a phone: the main thread stayed about half busy while
  the visitor read the hero, and this card's turn was most of it). React draws the first product once; from then a turn
  is a handful of attribute writes (showSlide below): the grounds, the pictures, the words, the notice and the tabs,
  each the same attribute the first render wrote, so the CSS is the same CSS. React never draws this card again with
  another product (it keeps no state for it), so a render of the section passes over what the turn wrote.

  And it turns only while it is watched (useSlideWatch): at least half of the card on the screen, the tab visible,
  motion allowed. The clock (.ev-tab-fill's 4.6s, whose end moves the turn on) and the drifting ground both stand
  still otherwise, where they stood, so coming back to it carries on from the same frame: nothing jumps and nothing is
  blank. Under the hero only the card's top edge shows on a phone, and a running loop there kept the browser making a
  frame of the whole page every frame (Chrome does, for any running transform while the page has an
  IntersectionObserver, which this page has dozens of).
*/
function showSlide(root: HTMLElement, active: number, n: number) {
  const each = (selector: string, write: (el: Element, i: number) => void) => root.querySelectorAll(selector).forEach(write)
  const flag = (el: Element, on: boolean) => (on ? el.setAttribute("data-on", "") : el.removeAttribute("data-on"))
  each(":scope > .ev-p-bg", (el, i) => flag(el, i === active))
  each(".ev-p-img", (el, i) => {
    const pos = (i - active + n) % n
    el.setAttribute("data-pos", pos === 0 ? "on" : pos === n - 1 ? "prev" : "next")
  })
  each(".ev-p-text", (el, i) => {
    flag(el, i === active)
    if (i === active) el.removeAttribute("aria-hidden")
    else el.setAttribute("aria-hidden", "true")
  })
  each(".ev-p-dl", (el) => flag(el, EVERYTHING_SLIDES[active].kind === "luts"))
  each(".ev-tab", (el, i) => {
    flag(el, i === active)
    el.setAttribute("aria-pressed", String(i === active))
  })
}

/** Writes data-ev-run on the card while at least half of it is on the screen and the tab is visible (the CSS runs the clock and the ground only then). */
function useSlideWatch(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let half = typeof IntersectionObserver !== "function"
    const sync = () => {
      const run = half && !document.hidden
      if (run !== el.hasAttribute("data-ev-run")) el.toggleAttribute("data-ev-run", run)
    }
    const io = half
      ? null
      : new IntersectionObserver(
          ([e]) => {
            /* Half of the card, or half of the screen when the card is taller than that. */
            const shown = e.intersectionRect.height
            half = e.isIntersecting && (e.intersectionRatio >= 0.5 || shown >= (e.rootBounds?.height ?? innerHeight) * 0.5)
            sync()
          },
          { threshold: [0, 0.5, 1] },
        )
    io?.observe(el)
    document.addEventListener("visibilitychange", sync)
    sync()
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
      el.removeAttribute("data-ev-run")
    }
  }, [ref])
}

export function ProductSlides({ delivery = false }: { delivery?: boolean } = {}) {
  const root = useRef<HTMLDivElement>(null)
  const active = useRef(0)
  const n = EVERYTHING_SLIDES.length
  const show = useCallback(
    (i: number) => {
      if (!root.current || i === active.current) return
      active.current = i
      showSlide(root.current, i, n)
    },
    [n],
  )
  const card = useRef<HTMLDivElement>(null)
  usePressTilt(card)
  useSlideWatch(root)
  return (
    <div ref={root} className="ev-vis ev-p" data-no-delivery={delivery ? undefined : ""}>
      {EVERYTHING_SLIDES.map((s, i) => (
        <div key={s.tab} className={`ev-p-bg ev-p-bg${i}`} data-on={i === 0 || undefined} aria-hidden="true" />
      ))}
      <div className="ev-p-stage">
        <div ref={card} className="ev-p-card" data-press-tilt="">
          <div className="ev-p-media" aria-hidden="true">
            {EVERYTHING_SLIDES.map((s, i) => (
              <div key={s.tab} className={`ev-p-img ev-p-${s.kind}`} data-pos={i === 0 ? "on" : i === n - 1 ? "prev" : "next"}>
                <ProductPicture s={s} />
              </div>
            ))}
          </div>
          <div className="ev-p-info">
            {EVERYTHING_SLIDES.map((s, i) => (
              <div key={s.tab} className="ev-p-text" data-on={i === 0 || undefined} aria-hidden={i !== 0 || undefined}>
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
        {delivery ? <Delivery on={EVERYTHING_SLIDES[0].kind === "luts"} /> : null}
      </div>
      <div
        className="ev-tabs"
        role="group"
        aria-label="Product types"
        onAnimationEnd={(e) => {
          /* The shown tab's clock ran out: the next product. Only that one runs (.ev-tab[data-on] .ev-tab-fill). */
          const t = e.target as HTMLElement
          if (e.animationName === "ev-fill" && t.classList.contains("ev-tab-fill") && t.parentElement?.hasAttribute("data-on")) show((active.current + 1) % n)
        }}
      >
        {EVERYTHING_SLIDES.map((s, i) => (
          <button key={s.tab} type="button" aria-pressed={i === 0} className="ev-tab" data-on={i === 0 || undefined} onClick={() => show(i)}>
            <span className="ev-tab-fill ev-loop" aria-hidden="true" />
            {/* Landing round 19: the label's two inks cross fade (opacity, drawn by the compositor) where its colour was a transition painted every frame. */}
            <span className="ev-tab-label">
              <span className="ev-tab-ink">{s.tab}</span>
              <span className="ev-tab-ink ev-tab-ink-on" aria-hidden="true">
                {s.tab}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── 2. A store that looks like you ─────────────────────────────────── */

/*
  Landing round 6 (the owner, with a reference picture: "make the cards look like in the 4th image, positioning and
  spacing and all, and bottom padding"; "design some like Zach Dagger but a different name and some colors different,
  same patterns, and the same as Signal Drop but different images and different text"). Two kinds of page take turns,
  each drawn at a phone's 390px and scaled (--r is one of its pixels):

    - a merch store: a small header with the brand and Cart, the drop's name set big and airy over two lines, the
      second pushed right, and a two column grid of photographed pieces with their name and price;
    - a creator's link page on a dark, blurred photo: the name big and bold in a warm or bright colour, the social
      icons, two wide buttons, and the products' photos under them.

  The cards stand with their tops a fixed inset below the picture's top edge and run off its foot, the middle one
  whole and its neighbours cut by the sides. Fictional names, Unsplash photography (public/home/everything/stores).

  Landing round 8 (the owner): Static Bloom is gone for a store laid out the way a real Storelib store is, a knitwear
  brand with its menu, centred wordmark and cart, a wide photo of the drop and the pieces as product photos (Fieldwork
  Knit). Ollie Brandt sells a record and a tape in place of a cup and tees; Remy Vale a journal and a planner in place
  of a tee and a cap; Kaia Moon a lyric book and a tape, with her photo and a line under her name. Every link page
  shows its creator's photo. A seventh page was a drawn OnePage in a creative director's dark style. The stores never
  stand side by side.

  Landing round 11 (the owner: "Soft Ground (Kiln Goods): make it a digital product store, like the product being a
  digital product store, with a different heading/hero"): in its place a store of digital products.

  Landing round 12 (the owner: round 11's digital store is "really bad"; "something more realistic, cool and clean",
  a store that looks shipped, with real product imagery, not flat tiles): Jonah Wells, a guitar teacher, laid out
  the way Fieldwork is (a real Storelib store: menu, centred wordmark and cart on the cover photo, the drop's name at
  its foot), the cover a photograph of him playing in his room, the drop's name in white over its darker foot.
  What he sells are photographs, not rendered covers: a fingerstyle video course, a tab book (reduced), amp presets
  and backing tracks, each with what it is after the price.

  Landing round 14 (the owner): two real Storelib pages in place of drawn ones. Liam Bailey's product page
  (storelib.com/liam-bailey/gym-beginner-program, ProductCard) where Jonah Wells's store was, and Satori Studio's
  OnePage (the picture of its live page the showcase uses, ShotCard) where the drawn creative director's
  OnePage was. Still seven pages, a white one and a dark one taking turns but for one pair.
*/
type MerchStore = {
  kind: "merch"
  key: string
  brand: string
  /** The drop's name, as its two lines: the first sits left, the second right. */
  title: readonly [string, string]
  products: ReadonlyArray<{
    src: string
    name: string
    price: string
  }>
  /** Landing round 8: a store laid out like a real Storelib store, its menu and cart around a centred wordmark; landing round 10: they stand on the cover photo, with the drop's name. */
  hero?: string
}
type LinkPage = {
  kind: "link"
  key: string
  name: string
  /** The creator's photo over the name (landing round 8). */
  avatar: string
  /** A line under the name (landing round 8). */
  bio?: string
  /** Landing round 9: this page's two buttons are drawn fat and loud (ev-lp-hype). */
  hype?: boolean
  /** The name's colour. */
  accent: string
  /** The blurred photo behind the page, and the colour under it while it loads. */
  ground: string
  tone: string
  buttons: readonly [string, string]
  products: readonly [string, string]
}
/*
  Landing round 14 (the owner): a real Storelib product page, as a phone shows it: the seller's dark bar, the cover
  across the full width of the page (the upload's grey sides cut away), the title and its category, then the price,
  the buy button drawn live in the page's own blue, the wishlist button and what is included.
*/
type ProductPage = {
  kind: "product"
  key: string
  seller: string
  avatar: string
  /** The cover, cut inside the poster: no grey bars at its sides. */
  cover: string
  title: string
  category: string
  price: string
  cta: string
  /** The page's button colour (the live page's buy button setting). */
  button: string
  included: readonly string[]
}
/* Landing round 14: a real OnePage, the picture of it the showcase under the hero already uses (Satori Studio). */
type ShotPage = {
  kind: "shot"
  key: string
  src: string
  srcSet: string
  /** The picture's own size (landing round 15: the owners' screenshots are not all 540 x 1056). */
  w: number
  h: number
  /** The page's own ground, shown until the picture is in. */
  tone: string
}
export type StripPage = MerchStore | LinkPage | ProductPage | ShotPage

/*
  Landing round 15 (the owner): three real stores as their phones show them, from the owners' own screenshots.
  Loudlib's store takes Fieldwork's place, first in the strip; Sora (a soda brand) and GodBless (a clothing brand)
  join it. Nine pages, a light one and a dark one taking turns but for the pair where the loop closes.
*/
export const EVERYTHING_STORES: readonly StripPage[] = [
  {
    kind: "shot",
    key: "loudlib",
    src: `${ST}/shot-loudlib.webp`,
    srcSet: `${ST}/shot-loudlib-360.webp 360w, ${ST}/shot-loudlib.webp 434w`,
    w: 434,
    h: 852,
    tone: "#ffffff",
  },
  {
    kind: "link",
    key: "remy",
    name: "Remy Vale",
    avatar: `${ST}/remy-av.webp`,
    accent: "#ff9b45",
    ground: `${ST}/remy-bg.webp`,
    tone: "#2b1b12",
    buttons: ["Shop now", "Latest episode"],
    products: [`${ST}/remy-journal.webp`, `${ST}/remy-planner.webp`],
  },
  {
    kind: "shot",
    key: "sora",
    src: `${ST}/shot-sora.webp`,
    srcSet: `${ST}/shot-sora-360.webp 360w, ${ST}/shot-sora.webp 484w`,
    w: 484,
    h: 917,
    tone: "#d8643f",
  },
  {
    kind: "link",
    key: "kaia",
    name: "Kaia Moon",
    avatar: `${ST}/kaia-av.webp`,
    bio: "Singer and songwriter. New album Low Tide out now.",
    hype: true,
    accent: "#9cf0cb",
    ground: `${ST}/kaia-bg.webp`,
    tone: "#0f1a2c",
    buttons: ["Shop merch", "Tour dates"],
    products: [`${ST}/kaia-book.webp`, `${ST}/kaia-tape.webp`],
  },
  {
    kind: "merch",
    key: "slow-form",
    brand: "Outer Loop",
    title: ["Slow", "Form"],
    products: [
      { src: `${ST}/loop-crew.webp`, name: "Sunday Crew", price: "$58" },
      { src: `${ST}/loop-hood.webp`, name: "Harbor Hoodie", price: "$64" },
      { src: `${ST}/loop-cap.webp`, name: "Washed Cap", price: "$24" },
      { src: `${ST}/loop-tee.webp`, name: "Club Tee", price: "$30" },
    ],
  },
  {
    kind: "link",
    key: "ollie",
    name: "Ollie Brandt",
    avatar: `${ST}/ollie-av.webp`,
    accent: "#ffd25e",
    ground: `${ST}/ollie-bg.webp`,
    tone: "#1c1a18",
    buttons: ["Shop now", "Watch the live set"],
    products: [`${ST}/ollie-vinyl.webp`, `${ST}/ollie-tape.webp`],
  },
  {
    kind: "shot",
    key: "godbless",
    src: `${ST}/shot-godbless.webp`,
    srcSet: `${ST}/shot-godbless-360.webp 360w, ${ST}/shot-godbless.webp 435w`,
    w: 435,
    h: 844,
    tone: "#111111",
  },
  {
    kind: "shot",
    key: "satori",
    src: "/home/showcase/a-satori.webp",
    srcSet: "/home/showcase/a-satori-360.webp 360w, /home/showcase/a-satori.webp 540w",
    w: 540,
    h: 1056,
    tone: "#0b0b0c",
  },
  {
    kind: "product",
    key: "liam",
    seller: "liam bailey",
    avatar: `${ST}/liam-av.webp`,
    cover: `${ST}/liam-cover.webp`,
    title: "Gym Beginner Program",
    category: "Workout Plans",
    price: "$11.87",
    cta: "I want this!",
    button: "#2563eb",
    included: ["Instant download access", "All included files", "Lifetime access"],
  },
]

function MerchCard({ s }: { s: MerchStore }) {
  if (s.hero)
    return (
      <div className="ev-st ev-mc" data-store="">
        <span className="ev-ms-cover">
          <Img eager className="ev-ms-hero" src={s.hero} w={780} h={464} />
          <span className="ev-ms-top">
            <span className="ev-ms-nav">Shop all</span>
            <span className="ev-ms-mark">{s.brand}</span>
            <span className="ev-ms-nav">Cart (0)</span>
          </span>
          <span className="ev-ms-drop">
            <b>{s.title[0]}</b>
            <b>{s.title[1]}</b>
            <i>{`${s.products.length} pieces`}</i>
          </span>
        </span>
        <span className="ev-mc-grid">
          {s.products.map((p) => (
            <span key={p.name} className="ev-mc-item">
              <Img eager piece className="ev-mc-img" src={p.src} w={360} h={450} />
              <span className="ev-mc-name">{p.name}</span>
              <span className="ev-mc-price">{p.price}</span>
            </span>
          ))}
        </span>
      </div>
    )
  return (
    <div className="ev-st ev-mc">
      <span className="ev-mc-top">
        <span>{s.brand}</span>
        <span className="ev-mc-cart">
          Cart
          <span className="ev-mc-menu" />
        </span>
      </span>
      <span className="ev-mc-title">
        <span>{s.title[0]}</span>
        <span>{s.title[1]}</span>
      </span>
      <span className="ev-mc-grid">
        {s.products.map((p) => (
          <span key={p.name} className="ev-mc-item">
            <Img eager piece className="ev-mc-img" src={p.src} w={360} h={450} />
            <span className="ev-mc-name">{p.name}</span>
            <span className="ev-mc-price">{p.price}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

/* The four icons a link page like this shows: YouTube, Instagram, Spotify, Twitch, drawn plain in white. */
function LinkSocial() {
  return (
    <span className="ev-lp-social">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
      </svg>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="ev-lp-line">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
      </svg>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.7.7 0 0 1-1 .2c-2.6-1.6-5.9-2-9.8-1.1a.7.7 0 1 1-.3-1.4c4.3-1 7.9-.6 10.9 1.3.3.2.4.7.2 1Zm1.3-3a.9.9 0 0 1-1.2.3c-3-1.8-7.5-2.4-11-1.3a.9.9 0 1 1-.5-1.7c4-1.2 9-.6 12.4 1.5.4.3.5.8.3 1.2Zm.1-3.1C14.4 8.2 8.5 8 5.1 9a1 1 0 1 1-.6-2c3.9-1.2 10.4-1 14.5 1.5a1 1 0 0 1-1 1.8Z" />
      </svg>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 2 3 6v13.5h4.5V22h2.6l2.4-2.5h3.6L21 14.6V2H4.5Zm14.6 11.7-2.8 2.8h-4.5l-2.4 2.4v-2.4H5.6V3.9h13.5v9.8ZM15.4 7h1.9v5.4h-1.9V7Zm-4.9 0h1.9v5.4h-1.9V7Z" />
      </svg>
    </span>
  )
}

function LinkCard({ s }: { s: LinkPage }) {
  const [first, ...rest] = s.name.split(" ")
  return (
    <div className="ev-st ev-lp" data-hype={s.hype || undefined} style={{ background: s.tone, "--accent": s.accent } as CSSProperties}>
      <Img eager className="ev-lp-ground" src={s.ground} w={240} h={420} />
      <Img eager className="ev-lp-av" src={s.avatar} w={160} h={160} />
      <span className="ev-lp-name">
        <span>{first}</span>
        <span>{rest.join(" ")}</span>
      </span>
      {s.bio ? <span className="ev-lp-bio">{s.bio}</span> : null}
      <LinkSocial />
      <span className="ev-lp-btn">{s.buttons[0]}</span>
      <span className="ev-lp-btn">{s.buttons[1]}</span>
      <span className="ev-lp-grid">
        {s.products.map((src) => (
          <Img eager piece key={src} className="ev-lp-img" src={src} w={360} h={450} />
        ))}
      </span>
    </div>
  )
}

/*
  Landing round 14 (the owner, with a phone's picture of storelib.com/liam-bailey/gym-beginner-program): Liam
  Bailey's real product page in Jonah Wells's place. Its words, price, cover and button colour are the live page's.
  The cover runs the page's full width: the upload is a poster on grey, and only the poster is kept (cut inside its
  edges at 554 x 450, its top: the face, the title and Ages 15+), so no grey bar shows at either side. The buy button
  is drawn as a visitor finds it once the page is ready, in its full blue with white words: the owner's picture
  caught it mid load, faded.
*/
const COVER_SIZES = "(max-width:767px) 200px, 360px"
function ProductCard({ s }: { s: ProductPage }) {
  return (
    <div className="ev-st ev-pp" data-product-page="">
      <span className="ev-pp-bar">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        <Img eager className="ev-pp-av" src={s.avatar} w={96} h={96} />
        <span className="ev-pp-seller">{s.seller}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="ev-pp-more">
          <path d="M5 12h.01M12 12h.01M19 12h.01" />
        </svg>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ev-pp-cover" src={s.cover} srcSet={`${s.cover.replace(/\.webp$/, "-300.webp")} 300w, ${s.cover} 554w`} sizes={COVER_SIZES} alt="" width={554} height={450} loading="eager" decoding="async" draggable={false} />
      <span className="ev-pp-body">
        <span className="ev-pp-head">
          <b className="ev-pp-title">{s.title}</b>
          <span className="ev-pp-tag">{s.category}</span>
        </span>
        <span className="ev-pp-box">
          <span className="ev-pp-price">{s.price}</span>
          <span className="ev-pp-buy" data-live="" style={{ background: s.button }}>
            {s.cta}
          </span>
          <span className="ev-pp-wish">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            Add to wishlist
          </span>
          <span className="ev-pp-inc">
            <b>What&apos;s included</b>
            {s.included.map((line) => (
              <span key={line}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {line}
              </span>
            ))}
          </span>
        </span>
      </span>
    </div>
  )
}

/* A real page as a picture (Satori Studio's OnePage, landing round 14; Loudlib, Sora and GodBless, round 15): its top at the card's top, its foot running off the strip like every page's. */
const SHOT_SIZES = "(max-width:767px) 200px, 360px"
function ShotCard({ s }: { s: ShotPage }) {
  return (
    <div className="ev-st ev-shot" style={{ background: s.tone }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ev-shot-img" src={s.src} srcSet={s.srcSet} sizes={SHOT_SIZES} alt="" width={s.w} height={s.h} loading="eager" decoding="async" draggable={false} />
    </div>
  )
}

/*
  DRIFTING, AND IT CAN BE TAKEN HOLD OF (landing round 4, the owner: dragged
  "very smooth and clean by the mouse", like the creators rail). Pressed, the
  strip stops under the hand and follows it exactly; let go, it carries the
  hand's speed and eases back to its drift over about a second.
  touch-action leaves vertical swipes to the page; the axis is decided after
  8px. Nothing inside can be hovered or clicked: the cards take no pointer,
  only the strip does. Landing round 6: it starts with the first page in the
  middle, whole, and a neighbour cut on each side.

  LANDING ROUND 8, A LOOP THAT CANNOT END (the owner, after round 7: "make
  sure the carousel never ends and it's autoplay looping, because at some
  point it ends really weird", on real phones). Round 7 kept the whole track,
  two sets of pages side by side, as one layer a few thousand pixels wide and
  moved it one set's width per lap. That layer is the weak point: iOS paints
  a wide composited layer in tiles and only near what it expects to show, and
  a compositor animation carrying it far past that can show tiles that were
  never painted (an empty end) until the animation is started again; and the
  lap was a width read once, so anything that moved the cards after that
  read (a late layout, a resize iOS does not report, a pause and resume)
  left the lap ending on a different picture than it started on.

  Now nothing moves far and nothing has an end:
  - Every page is its own small layer. Where page i stands is one sum, the
    same everywhere: (i x pitch - x) wrapped into one turn of all the pages,
    so its left edge is always between one pitch left of the picture and
    (pages - 1) pitches right of it. A page leaves on the left and comes back
    on the right while it is out of sight, and the picture is covered as long
    as all the pages but one are wider than it (7 pages since landing round 14: always, see the
    test).
  - x is the only state. While the strip drifts, x grows at DRIFT_PX_S from
    a time on the document's own clock; each page runs one compositor
    animation over one turn, from the right end to the left, infinite, all
    of them given the same start time so they cannot drift apart. Stopping
    (off screen, a hidden tab, a press, a resize) reads x from the clock and
    sets each page where that x puts it, so starting again continues from
    exactly there, never from an animation's own idea of where it was.
  - The pitch is read from the laid out slots (their widths are CSS, never a
    picture's: an image that arrives late moves nothing), on every resize of
    the strip or of a slot, with the transforms taken off for the read.
*/
const DRIFT_PX_S = 26
/** How far ahead of the screen the strip starts drifting (landing round 19: was LIVE_AHEAD, a whole screen). */
const STRIP_AHEAD = "25% 0px"
function useDriftStrip(viewport: RefObject<HTMLDivElement | null>, track: RefObject<HTMLDivElement | null>, live: boolean) {
  const liveRef = useRef(live)
  const api = useRef<{ setLive: (on: boolean) => void } | null>(null)
  useEffect(() => {
    liveRef.current = live
    api.current?.setLive(live)
  }, [live])
  useEffect(() => {
    const vp = viewport.current
    const el = track.current
    if (!vp || !el) return
    const slots = Array.from(el.children) as HTMLElement[]
    const n = slots.length
    if (!n) return
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    const canAnimate = typeof slots[0].animate === "function"
    /* Each slot's laid out left (from the first slot's), the distance from one page to the next, and one turn of all of them. */
    const base = new Float64Array(n)
    let pitch = 0
    let turn = 0
    let x = 0
    let placed = false
    let raf = 0
    /* The drift: x at `t0` on the document's clock, and the pages' animations. */
    let anims: Animation[] = []
    let t0 = 0
    let x0 = 0
    let drag: { id: number; x0: number; y0: number; at: number; started: boolean; touch: boolean; samples: Array<{ t: number; x: number }> } | null = null
    const clock = () => {
      const t = document.timeline?.currentTime
      return typeof t === "number" ? t : performance.now()
    }
    const mod = (v: number, m: number) => ((v % m) + m) % m
    /* Page i's left edge for an offset x: wrapped into [-pitch, turn - pitch). */
    const leftOf = (i: number, at: number) => mod(i * pitch - at + pitch, turn) - pitch
    const paint = () => {
      if (turn <= 0) return
      for (let i = 0; i < n; i++) slots[i].style.transform = `translate3d(${(leftOf(i, x) - base[i]).toFixed(2)}px,0,0)`
    }
    const drifting = () => anims.length > 0
    /* Landing round 12 (perf): and the strip itself wholly within a screen (the section is live while any of it is, four screens tall on a phone). */
    let near = typeof IntersectionObserver !== "function"
    const shown = () => liveRef.current && near && !document.hidden
    const stopDrift = () => {
      if (!drifting()) return
      x = x0 + ((clock() - t0) / 1000) * DRIFT_PX_S
      paint()
      for (const a of anims) a.cancel()
      anims = []
    }
    const startDrift = () => {
      if (drifting() || drag || raf || turn <= 0 || reduce.matches || !canAnimate || !shown()) return
      x = mod(x, turn)
      paint()
      const period = (turn / DRIFT_PX_S) * 1000
      const now = clock()
      t0 = now
      x0 = x
      anims = slots.map((slot, i) => {
        /* One turn: from the right end (turn - pitch) to one pitch off the left, then again, for ever. */
        const a = slot.animate(
          [{ transform: `translate3d(${(turn - pitch - base[i]).toFixed(2)}px,0,0)` }, { transform: `translate3d(${(-pitch - base[i]).toFixed(2)}px,0,0)` }],
          { duration: period, iterations: Infinity, easing: "linear" },
        )
        /* How far into its turn page i is at x, given as the start time every page shares the clock of. */
        const into = ((turn - pitch - leftOf(i, x)) / turn) * period
        a.startTime = now - into
        return a
      })
    }
    const glide = (v0: number) => {
      cancelAnimationFrame(raf)
      raf = 0
      if (reduce.matches) return
      const g0 = performance.now()
      let last = g0
      const target = DRIFT_PX_S
      const step = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        const v = target + (v0 - target) * Math.exp(-(now - g0) / 380)
        x += v * dt
        paint()
        if (Math.abs(v - target) > 1.5) raf = requestAnimationFrame(step)
        else {
          raf = 0
          startDrift()
        }
      }
      raf = requestAnimationFrame(step)
    }
    const measure = () => {
      const was = drifting()
      stopDrift()
      cancelAnimationFrame(raf)
      raf = 0
      /* The slots where layout puts them: transforms off for this one read (no frame is drawn in between). */
      for (const s of slots) s.style.transform = "none"
      const lefts = slots.map((s) => s.getBoundingClientRect().left)
      const before = turn
      const at = before > 0 ? mod(x, before) : x
      for (let i = 0; i < n; i++) base[i] = lefts[i] - lefts[0]
      pitch = n > 1 ? base[n - 1] / (n - 1) : slots[0].getBoundingClientRect().width
      turn = pitch * n
      if (turn <= 0) return
      /* A resize keeps the same page where it was: the offset scales with the turn. */
      if (before > 0) x = (at / before) * turn
      /* The first page in the middle, whole: once, when the strip is first laid out. */
      if (!placed) {
        placed = true
        x = pitch / 2 - vp.clientWidth / 2
      }
      paint()
      if (was || !drag) startDrift()
    }
    /*
      Landing round 9 (the owner: the swipe "is laggy", and it "must not mistake scrolling down for scrolling it
      horizontally"). A finger's first pixels decide whose gesture it is (swipeAxis, everything-globe.tsx): down or
      up is the page's and the strip lets go at once; clearly sideways is the strip's. From then the strip stands
      under the finger as if it had been held from the first pixel (the pixels spent deciding are caught up at
      once), and it is written once a frame however many moves arrive, with no layout read, and with no attribute
      changed on the strip for a finger (that restyled every page in it). A mouse takes hold after 3px.
    */
    let frame = 0
    const flush = () => {
      frame = 0
      paint()
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, at: 0, started: false, touch: e.pointerType === "touch", samples: [] }
    }
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x0
      if (!drag.started) {
        const dy = e.clientY - drag.y0
        const axis = drag.touch ? swipeAxis(dx, dy) : Math.hypot(dx, dy) >= 3 ? "x" : null
        if (!axis) return
        if (axis === "y") {
          drag = null
          return
        }
        cancelAnimationFrame(raf)
        raf = 0
        stopDrift()
        drag.started = true
        /* Where the strip stood when it was taken, less the first pixels: it catches the finger up. */
        drag.at = x + dx - Math.max(-SWIPE_SLOP, Math.min(SWIPE_SLOP, dx))
        try {
          vp.setPointerCapture(e.pointerId)
        } catch {}
        if (!drag.touch) vp.dataset.dragging = ""
      }
      x = drag.at - dx
      drag.samples.push({ t: e.timeStamp, x })
      if (drag.samples.length > 24) drag.samples.shift()
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const d = drag
      drag = null
      if (!d.started) return
      if (!d.touch) delete vp.dataset.dragging
      if (frame) {
        cancelAnimationFrame(frame)
        flush()
      }
      /* The hand's speed over its last 80ms; a hand that stopped before letting go has none. */
      const recent = d.samples.filter((p) => e.timeStamp - p.t < 80)
      let v = 0
      if (recent.length > 1 && e.timeStamp - recent[recent.length - 1].t < 60) {
        const a = recent[0]
        const b = recent[recent.length - 1]
        v = ((b.x - a.x) / Math.max(1, b.t - a.t)) * 1000
      }
      glide(Math.max(-3000, Math.min(3000, v)))
    }
    /* Off screen or in a hidden tab the pages stand where the clock had them; back on, they carry on from there. */
    const setLive = (on: boolean) => {
      if (on && near && !document.hidden) startDrift()
      else stopDrift()
    }
    api.current = { setLive }
    const vis = () => setLive(liveRef.current)
    /*
      Landing round 19 (perf on a phone): the strip drifts from a quarter of a screen before it shows, no longer while
      any of it is within a whole screen. Under the hero on a phone it is half a screen below the fold, and its seven
      running animations kept the browser making a full frame of the page every frame for a strip nobody could see.
      A quarter of a screen is still ahead of the finger: it is already moving when it comes into view.
    */
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([e]) => {
              near = e.isIntersecting
              vis()
            },
            { rootMargin: STRIP_AHEAD, threshold: 0 },
          )
        : null
    io?.observe(vp)
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null
    ro?.observe(vp)
    ro?.observe(slots[0])
    if (!ro) measure()
    vp.addEventListener("pointerdown", down)
    vp.addEventListener("pointermove", move)
    vp.addEventListener("pointerup", up)
    vp.addEventListener("pointercancel", up)
    document.addEventListener("visibilitychange", vis)
    reduce.addEventListener("change", measure)
    return () => {
      api.current = null
      cancelAnimationFrame(raf)
      cancelAnimationFrame(frame)
      for (const a of anims) a.cancel()
      anims = []
      ro?.disconnect()
      io?.disconnect()
      vp.removeEventListener("pointerdown", down)
      vp.removeEventListener("pointermove", move)
      vp.removeEventListener("pointerup", up)
      vp.removeEventListener("pointercancel", up)
      document.removeEventListener("visibilitychange", vis)
      reduce.removeEventListener("change", measure)
      for (const s of slots) s.style.transform = ""
    }
  }, [viewport, track])
}

/** Also a tile of /pricing's bento (landing round 13). */
export function Storefronts({ live }: { live: boolean }) {
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  useDriftStrip(viewport, track, live)
  /*
    Landing round 14 (perf: the cards "must come up smoothly"): the pages once each, not twice. Round 7's track moved
    two sets by one set's width and needed the second; since round 8 every page wraps round on its own, and seven
    pages cover the picture with room to spare (six pitches are over three times its width at any size). The second
    set was seven more layers, seven more animations restyled every frame the page drew while scrolling (the most of
    any element on the page, measured at 1440), and thirty more pictures decoded as the card came on screen.
  */
  const strip = EVERYTHING_STORES
  return (
    <div ref={viewport} className="ev-vis ev-s" aria-hidden="true" data-mock-still="" data-ev-strip="">
      <div ref={track} className="ev-s-track">
        {strip.map((item) => (
          <div key={item.key} className="ev-s-slot">
            {item.kind === "merch" ? <MerchCard s={item} /> : item.kind === "link" ? <LinkCard s={item} /> : item.kind === "product" ? <ProductCard s={item} /> : <ShotCard s={item} />}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 4. Support ──────────────────────────────────────────────────────── */

/*
  Landing round 4 (the owner: keep the UI "how it was before", without the
  From buyers / Storelib switch, and no request about a payout or the bank:
  "we don't have problems like this"). The card as wave 13 drew it: one
  thread at a time on a soft grey, its title and what it is about, the
  question with the asker's photo, the other side typing, then the answer
  with Storelib's mark or the creator's photo. Three true requests take
  turns, ten seconds each: a creator bringing subscribers over, a buyer who
  cannot open a download, a creator's own domain.
  Landing round 5 (the owner: "get rid of the creators and Storelib" here):
  each thread is headed by its subject alone. The "Storelib support" and
  "From a buyer" labels over it, and "to Storelib" in the first question and
  "at Storelib" in the caption, read as filler and are gone. One CSS clock drives it,
  paused off screen; under reduced motion the first thread simply stands.
*/
type Request = { sub: string; ask: string; askAv: string; reply: string; replyAv: string | null }
const ME = `${IMG}/av-creator.webp`
export const EVERYTHING_SUPPORT: readonly Request[] = [
  {
    sub: "Moving my subscribers over",
    ask: "I have 3,200 subscribers on another newsletter tool. Can I bring them over?",
    askAv: ME,
    reply: "Yes. Export them as a CSV with an Email column and import it under Contacts. Names and tags come with them.",
    replyAv: null,
  },
  {
    sub: "Order #4821 · Fell Sweater pattern",
    ask: "The download link in my email won't open on my iPad. Could you send it again?",
    askAv: `${IMG}/av-buyer.webp`,
    reply: "Just sent a fresh one. Your files are also in your Storelib library, so you can download them again anytime.",
    replyAv: ME,
  },
  {
    sub: "My own domain",
    ask: "I connected shop.mayafen.com an hour ago and the browser still says Not secure.",
    askAv: ME,
    reply: "Your DNS is right. The certificate was still being issued, and it's live now. Reload and you'll see the lock.",
    replyAv: null,
  },
]

function Thread({ r, on }: { r: Request; on: boolean }) {
  return (
    <div className="ev-c-thread ev-loop" data-on={on ? "" : undefined}>
      <div className="ev-c-head">{r.sub}</div>
      <div className="ev-c-msg ev-c-q ev-loop">
        <p className="ev-c-bubble ev-c-light">{r.ask}</p>
        <Img className="ev-c-av" src={r.askAv} w={96} h={96} />
      </div>
      <div className="ev-c-slot">
        <div className="ev-c-typing ev-loop">
          <span className="ev-c-dot ev-loop" />
          <span className="ev-c-dot ev-loop" />
          <span className="ev-c-dot ev-loop" />
        </div>
        <div className="ev-c-msg ev-c-r ev-loop">
          <p className="ev-c-bubble ev-c-dark">{r.reply}</p>
          {r.replyAv ? <Img className="ev-c-av" src={r.replyAv} w={96} h={96} /> : <StorelibLogo size={96} alt="" fluid className="ev-c-av ev-c-logo" />}
        </div>
      </div>
    </div>
  )
}

/*
  Landing round 14 (perf: the cards "must come up smoothly"): one thread plays at a time. Round 4's three threads each
  ran four endless animations on one 30 second clock, and the typing dots three more, so 21 animations ran for as
  long as the card was on screen, the dots restyled on every frame the page drew while scrolling (second only to the
  strip's pages, measured at 1440), though only one thread was ever seen. Now a timer moves data-on from thread to
  thread every TURN seconds, only while the card is near the screen and the tab is shown; the thread coming in plays
  its question, the typing and the answer once (finite animations, the same timings as before), the one going out
  fades up and away, and in between nothing runs at all. Under reduced motion the first thread simply stands.
*/
export const SUPPORT_TURN_MS = 10_000
/** Also a tile of /pricing's bento (landing round 13). */
export function Support() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const threads = Array.from(el.children) as HTMLElement[]
    let k = Math.max(0, threads.findIndex((t) => t.hasAttribute("data-on")))
    let timer = 0
    let near = typeof IntersectionObserver !== "function"
    const step = () => {
      const was = threads[k]
      k = (k + 1) % threads.length
      for (const t of threads) if (t !== was) t.removeAttribute("data-out")
      was.removeAttribute("data-on")
      was.setAttribute("data-out", "")
      el.setAttribute("data-turning", "")
      threads[k].removeAttribute("data-out")
      threads[k].setAttribute("data-on", "")
    }
    const sync = () => {
      const go = near && !document.hidden
      if (go && !timer) timer = window.setInterval(step, SUPPORT_TURN_MS)
      else if (!go && timer) {
        window.clearInterval(timer)
        timer = 0
      }
    }
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([e]) => {
              near = e.isIntersecting
              sync()
            },
            { rootMargin: LIVE_AHEAD },
          )
        : null
    io?.observe(el)
    document.addEventListener("visibilitychange", sync)
    sync()
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
      window.clearInterval(timer)
    }
  }, [])
  return (
    <div ref={ref} className="ev-vis ev-c" aria-hidden="true">
      {EVERYTHING_SUPPORT.map((r, i) => (
        <Thread key={r.sub} r={r} on={i === 0} />
      ))}
    </div>
  )
}

/* ── The section ─────────────────────────────────────────────────────── */

export const EVERYTHING_CARDS = [
  { key: "sell", wide: true, lead: "Sell anything you make.", rest: "Merch, downloads, courses and communities live in one catalog, with one checkout for all of them." },
  { key: "store", wide: false, lead: "Build a store that looks like you.", rest: "Start from a template and make every part yours, or skip the website and share a OnePage link." },
  { key: "world", wide: false, lead: "Sell anywhere in the world.", rest: "Buyers see your prices in their currency and your pages in their language, wherever they find you." },
  { key: "support", wide: true, lead: "Real support for you and your buyers.", rest: "A person reads and answers every request, and buyers reach you right from their order page." },
] as const

/*
  COMING IN AS THE PAGE SCROLLS (landing round 6, the owner: the cards should "come in smooth and clean" as he scrolls
  down, "normal, natural, buttery, not so heavy, not so subtle, not attention grabby"). Each card, the first time its
  top is a tenth of the screen above the bottom edge, fades in and rises 24px over 700ms on the section's ease; the
  second card of a row on a wide screen follows 110ms after the first. One IntersectionObserver, no scroll listener, and
  only opacity and transform move: the card is laid out where it ends from the start, so nothing below it shifts.
  Without script, under reduced motion and without IntersectionObserver every card simply stands.
*/
function useCardReveal(grid: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = grid.current
    if (!el) return
    const cards = Array.from(el.children) as HTMLElement[]
    const show = (card: HTMLElement) => {
      card.dataset.in = ""
    }
    if (typeof IntersectionObserver !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cards.forEach(show)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          show(e.target as HTMLElement)
          io.unobserve(e.target)
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    )
    cards.forEach((card) => io.observe(card))
    return () => io.disconnect()
  }, [grid])
}

export function EverythingInOnePlace() {
  const ref = useRef<HTMLElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const { live, reduced } = usePlatformSection(ref)
  /* Landing round 12 (perf): each card's loops pause on their own more than a screen away (the section is four screens tall on a phone). */
  usePartsLive(ref, ".ev-card")
  useCardReveal(grid)
  const visuals = {
    sell: <ProductSlides />,
    store: <Storefronts live={live} />,
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
      <div className="ev-in home-wrap">
        <h2 id="everything-in-one-place-title" className="ev-h">
          {EVERYTHING_HEADING.lead} <span className="ev-h-mute">{EVERYTHING_HEADING.rest}</span>
        </h2>
        <div ref={grid} className="ev-grid">
          {EVERYTHING_CARDS.map((c) => (
            <article key={c.key} className={`ev-card ${c.wide ? "ev-wide" : "ev-narrow"}`}>
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
/** n of the storefront's own pixels (one --r), for the store cards drawn at a phone's 390px. */
const r = (n: number) => `calc(${n} * var(--r))`
/** n pixels of the 260px community page drawn in the product tile. */
const q = (n: number) => `calc(${n} * var(--q))`
/* One support request's turn, in seconds. */
const TURN = SUPPORT_TURN_MS / 1000
const CSS = `
/*
  Landing round 7 (the owner: the section "a little bit more" wide at 90% and 100% zoom, like his reference): the
  content sits in the page's shared box (.home-wrap in app/globals.css: the showcase's side edge and cap), so the
  cards' edges line up with the showcase cards under the hero, and the heading starts --home-head-inset in from them.
  The pictures grow with the cards: their height follows the page's width up to 620px.
*/
.ev{position:relative;isolation:isolate;background:#fff;color:#18181b;padding:var(--home-pad,clamp(72px,9vw,128px)) 0}
.ev-in{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin-inline:auto;padding-inline:var(--home-edge,clamp(20px,5.15vw,84px))}
.ev-h{margin:0 0 clamp(32px,4.4vw,60px);padding-inline-start:var(--home-head-inset,0px);font-size:clamp(34px,4.6vw,64px);font-weight:500;line-height:1.05;letter-spacing:-.045em;color:#18181b;text-wrap:balance}
.ev-h-mute{color:#8e8c96}
.ev-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:44px}
@media(min-width:768px){
  .ev-grid{grid-template-columns:repeat(24,minmax(0,1fr));column-gap:clamp(16px,2vw,28px);row-gap:clamp(48px,5vw,72px)}
  .ev-wide{grid-column:span 13}
  .ev-narrow{grid-column:span 11}
}
/* Each card's one time entry (useCardReveal): from 24px down and clear, to where it is laid out. */
.ev-card{min-width:0;opacity:0;transform:translate(0,24px);transition:opacity .7s ${EASE},transform .7s ${EASE};transition-delay:var(--d,0ms)}
.ev-card[data-in]{opacity:1;transform:none}
@media(min-width:768px){.ev-card:nth-child(even){--d:110ms}}
.ev-vis{position:relative;overflow:hidden;height:clamp(300px,86vw,380px);border-radius:17px;isolation:isolate;contain:paint}
/* Landing round 10 (the owner, on a 1440x800 laptop: sections too tall): the pictures also stay under 58% of the screen's height (svh, so iOS's bar never moves them), and a wide card with its caption and the heading fit in one screen. */
@media(min-width:768px){.ev-vis{height:clamp(300px,min(33vw,58svh),620px);border-radius:19px}}
.ev-cap{margin:24px 0 0;max-width:46ch;font-size:15.5px;line-height:1.5;color:#7c7a84;text-wrap:pretty}
.ev-cap-lead{font-weight:500;color:#18181b}
@media(min-width:768px){.ev-cap{font-size:16px}}

.ev[data-platform-live="false"] .ev-loop,.ev:not([data-platform-live]) .ev-loop{animation-play-state:paused}
.ev[data-platform-live="false"] .ev-tab[data-on] .ev-tab-fill,.ev:not([data-platform-live]) .ev-tab[data-on] .ev-tab-fill{animation-play-state:paused}
/* Landing round 12 (perf): a card more than a screen away pauses on its own (usePartsLive). */
.ev-card[data-part-live="false"] .ev-loop,.ev-card[data-part-live="false"] .ev-tab[data-on] .ev-tab-fill{animation-play-state:paused}

/*
  1. Product slides. Landing round 4 (the owner: bring back the colours that
  changed behind each product, "more funky", like his image 30): a soft
  gradient ground per product, warm coral for merch, lime and mint for the
  download, sun and tangerine for the course, sky and blush for the
  community. They cross fade over 1.4s, and each drifts very slowly on its
  own layer (a transform, paused off screen like every loop), so the colour
  is never quite still. The product stands on a white card, as before.
  Landing round 12 (perf): no will-change on the four grounds. Each was a layer
  of its own for good (230k to 750k px each, four of them, three at opacity 0);
  the one shown drifts, and a running drift or fade is a layer anyway.
*/
.ev-p{background:#f2b49b}
.ev-p-bg{position:absolute;inset:-18%;opacity:0;transition:opacity 1.4s cubic-bezier(.4,0,.2,1);animation:ev-bg-drift 22s ease-in-out infinite alternate}
.ev-p-bg[data-on]{opacity:1}
.ev-p-bg0{background:radial-gradient(42% 46% at 22% 26%,#ffb28a 0%,rgba(255,178,138,0) 100%),radial-gradient(46% 50% at 82% 80%,#ffd7a8 0%,rgba(255,215,168,0) 100%),linear-gradient(135deg,#e2434f 0%,#ef6a62 42%,#f6a27f 100%)}
.ev-p-bg1{background:radial-gradient(42% 46% at 20% 22%,#e6fa8c 0%,rgba(230,250,140,0) 100%),radial-gradient(46% 50% at 84% 82%,#7ce8d2 0%,rgba(124,232,210,0) 100%),linear-gradient(140deg,#1fa58f 0%,#5fcf98 48%,#c7ee7c 100%)}
.ev-p-bg2{background:radial-gradient(42% 46% at 80% 20%,#ffe88a 0%,rgba(255,232,138,0) 100%),radial-gradient(46% 50% at 18% 84%,#ff9e6b 0%,rgba(255,158,107,0) 100%),linear-gradient(140deg,#ffbf3c 0%,#ff8a4c 55%,#f4645f 100%)}
.ev-p-bg3{background:radial-gradient(42% 46% at 18% 20%,#a8dcff 0%,rgba(168,220,255,0) 100%),radial-gradient(46% 50% at 84% 84%,#ffc2d6 0%,rgba(255,194,214,0) 100%),linear-gradient(135deg,#2f86f6 0%,#58b9f7 48%,#f7a9c4 100%)}
.ev-p-bg1{animation-delay:-6s}
.ev-p-bg2{animation-delay:-12s}
.ev-p-bg3{animation-delay:-17s}
@keyframes ev-bg-drift{from{transform:translate3d(-3%,-2%,0) rotate(-4deg) scale(1)}to{transform:translate3d(3%,2%,0) rotate(4deg) scale(1.06)}}
.ev-p-bg{animation-play-state:paused}
.ev[data-platform-live="true"] .ev-p-bg[data-on]{animation-play-state:running}
.ev-card[data-part-live="false"] .ev-p-bg[data-on]{animation-play-state:paused}
/*
  The stage centres the card and holds the perspective the card leans in; the card itself only ever rotates and scales
  (usePressTilt). Landing round 7: the card grows with the wider picture (470px in a 660px picture, about 620px in a
  940px one), and its words are sized in the card's own width (cqi), so a bigger card is the same card, larger.
*/
.ev-p-stage{position:absolute;left:50%;top:44%;width:min(88%,calc(470px + (100% - 660px) * .55));transform:translate(-50%,-50%);perspective:1100px;container-type:inline-size}
.ev-p-card{display:flex;align-items:center;gap:clamp(12px,4cqi,26px);padding:clamp(10px,2.1cqi,14px);border-radius:17px;background:#fff;box-shadow:0 24px 48px -30px rgba(40,32,20,.45),0 1px 3px rgba(40,32,20,.08);transform-origin:50% 50%;backface-visibility:hidden}
.ev-p-media{position:relative;flex:0 0 42%;aspect-ratio:1;border-radius:11px;overflow:hidden;background:#ededed;container-type:inline-size}
.ev-p-img{position:absolute;inset:0;opacity:0;transform:translate(32%,0) scale(.9);transition:opacity .4s ease,transform .9s ${EASE}}
.ev-p-img > img{display:block;width:100%;height:100%;object-fit:cover}
.ev-p-img[data-pos="prev"]{transform:translate(-32%,0) scale(.9)}
.ev-p-img[data-pos="on"]{opacity:1;transform:none;transition:opacity .6s ease .1s,transform 1s ${EASE} .06s}
/* The LUT pack's cover (landing round 6): black, a graded still fading into it, the name big and heavy. Sizes in the tile's own width (cqw). */
.ev-p-luts{background:#0a0a0b}
.ev-lut{position:absolute;inset:0;display:block;overflow:hidden;background:#0a0a0b;color:#fff}
.ev-lut-still{position:absolute;left:0;top:0;display:block;width:100%;height:64%;object-fit:cover;object-position:50% 60%}
.ev-lut::before{content:"";z-index:1;position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(rgba(10,10,11,.5),rgba(10,10,11,0))}
.ev-lut::after{content:"";position:absolute;left:0;right:0;top:26%;height:39%;background:linear-gradient(rgba(10,10,11,0),rgba(10,10,11,.55) 50%,#0a0a0b)}
.ev-lut-tag{z-index:1;position:absolute;left:7cqw;top:7cqw;font-size:max(4.6cqw,7px);font-weight:600;line-height:1;letter-spacing:.18em;text-transform:uppercase}
.ev-lut-name{z-index:1;position:absolute;left:6.4cqw;bottom:6.4cqw;display:flex;flex-direction:column;font-size:21cqw;font-weight:800;line-height:.84;letter-spacing:-.05em;text-transform:uppercase}
.ev-p-lesson{position:absolute;left:8px;bottom:12px;display:flex;align-items:center;gap:6px;padding:4px 8px 4px 4px;border-radius:999px;background:rgba(20,20,20,.55);color:#fff;font-size:10.5px;line-height:1;white-space:nowrap}
.ev-p-play{position:relative;width:16px;height:16px;border-radius:99px;background:#fff}
.ev-p-play::after{content:"";position:absolute;left:6px;top:4.5px;border-left:6px solid #18181b;border-top:3.5px solid transparent;border-bottom:3.5px solid transparent}
.ev-p-progress{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.35)}
.ev-p-progress::after{content:"";position:absolute;inset:0 62% 0 0;background:#fff}

/*
  The community card in the tile, drawn at 260px and scaled to the tile. Landing round 7: the AI Builders Masterclass,
  light and plain: the session photo with a white "Live Thursday" tag, the name, the next session in a pale row, the faces.
*/
.ev-p-community{--q:calc(100cqw / 260);background:#fff}
.ev-cm{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;color:#111827;font-size:${q(12)};line-height:1.3;text-align:left}
.ev-cm-top{position:relative;display:block;flex:none;height:${q(96)}}
.ev-cm-cover{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 40%}
.ev-cm-badge{position:absolute;left:${q(10)};top:${q(10)};display:flex;align-items:center;gap:${q(5)};padding:${q(4)} ${q(8)} ${q(4)} ${q(7)};border-radius:${q(99)};background:#fff;font-size:${q(10)};font-weight:600;line-height:1;color:#111827}
.ev-cm-live{width:${q(6)};height:${q(6)};border-radius:99px;background:#ef4444}
.ev-cm-body{display:flex;flex-direction:column;padding:${q(12)} ${q(14)} 0}
.ev-cm-name{font-size:${q(16.5)};font-weight:700;line-height:1.15;letter-spacing:-.02em;white-space:nowrap}
.ev-cm-url{margin-top:${q(3)};font-size:${q(10.5)};color:#6b7280}
.ev-cm-next{display:flex;align-items:center;gap:${q(10)};margin-top:${q(12)};padding:${q(8)};border-radius:${q(10)};background:#f4f5f7}
.ev-cm-date{display:flex;flex:none;flex-direction:column;align-items:center;justify-content:center;width:${q(34)};height:${q(36)};border-radius:${q(7)};background:#fff;box-shadow:0 0 0 1px #e8eaee}
.ev-cm-date i{font-size:${q(8.5)};font-style:normal;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#ef4444}
.ev-cm-date b{font-size:${q(15)};font-weight:700;line-height:1.05}
.ev-cm-what{display:flex;min-width:0;flex-direction:column;gap:${q(2)}}
.ev-cm-what b{font-size:${q(12)};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev-cm-what i{font-size:${q(10)};font-style:normal;color:#6b7280;white-space:nowrap}
.ev-cm-faces{display:flex;align-items:center;margin-top:${q(12)}}
.ev-cm-face{display:block;width:${q(22)};height:${q(22)};margin-right:${q(-6)};border:${q(2)} solid #fff;border-radius:50%;object-fit:cover}
.ev-cm-count{margin-left:${q(14)};font-size:${q(11)};font-weight:500;color:#374151}

.ev-p-info{position:relative;display:grid;flex:1 1 auto;min-width:0;align-self:stretch;align-items:center}
.ev-p-text{grid-area:1/1;min-width:0}
.ev-p-rise{opacity:0;transform:translate(0,10px);transition:opacity .25s ease,transform .3s ease}
.ev-p-text[data-on] .ev-p-rise{opacity:1;transform:none;transition:opacity .55s ease,transform .8s ${EASE};transition-delay:calc(.2s + var(--d,0) * 55ms)}
.ev-p-name{margin:0 0 clamp(12px,2.6cqi,16px);font-size:clamp(14px,3.8cqi,23px);font-weight:600;line-height:1.2;letter-spacing:-.02em;color:#18181b}
.ev-p-stats{display:grid;grid-template-columns:1fr 1fr;gap:clamp(10px,2.2cqi,14px) 12px;margin:0}
.ev-p-k{margin:0 0 2px;font-size:clamp(11px,2.35cqi,14px);color:#8b8994}
.ev-p-v{margin:0;display:flex;align-items:center;gap:6px;font-size:clamp(12.5px,3.05cqi,18px);font-weight:500;color:#18181b;white-space:nowrap;font-variant-numeric:tabular-nums}
.ev-p-money{color:#18181b}
.ev-p-dot{width:7px;height:7px;flex:none;border-radius:99px;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18)}
.ev-tabs{position:absolute;left:50%;bottom:16px;display:flex;gap:2px;padding:4px;border-radius:999px;background:rgba(255,255,255,.5);transform:translate(-50%,0)}
.ev-tab{position:relative;overflow:hidden;height:30px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:#55525c;font-family:inherit;font-size:13px;font-weight:500;line-height:30px;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ev-tab::before{content:"";position:absolute;inset:0;border-radius:inherit;background:#fff;opacity:0;transform:scale(.85);transition:opacity .35s ease,transform .5s ${EASE}}
.ev-tab[data-on]::before{opacity:1;transform:none}
.ev-tab:focus-visible{outline:2px solid #18181b;outline-offset:2px}
/* Landing round 19: the grey label and the dark one in the same place, cross fading (was a colour transition, painted every frame). */
.ev-tab-label{position:relative;display:grid}
.ev-tab-ink{grid-area:1/1;transition:opacity .35s ease}
.ev-tab-ink-on{color:#18181b;opacity:0}
.ev-tab[data-on] .ev-tab-ink{opacity:0}
.ev-tab[data-on] .ev-tab-ink-on{opacity:1}
@media(hover:hover){.ev-tab:not([data-on]):hover .ev-tab-ink{opacity:0}.ev-tab:not([data-on]):hover .ev-tab-ink-on{opacity:1}}
.ev-tab-fill{position:absolute;inset:0;border-radius:inherit;background:rgba(24,24,27,.07);transform:scaleX(0);transform-origin:0 50%;opacity:0}
.ev-tab[data-on] .ev-tab-fill{opacity:1;animation:ev-fill 4.6s linear both}
/* Landing round 19: the clock and the ground stand still unless half the card is on the screen (useSlideWatch). */
.ev-p:not([data-ev-run]) .ev-tab[data-on] .ev-tab-fill,.ev .ev-p:not([data-ev-run]) .ev-p-bg[data-on]{animation-play-state:paused}
@media(hover:hover){.ev-p:hover .ev-tab-fill{animation-play-state:paused}}
@keyframes ev-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
/*
  Landing round 15: the file going out while Digital is shown (Delivery). It comes in once Digital is on, the bar
  fills, the line under the name turns over and the check lands, once per turn of the tab.
*/
.ev-p-dl{position:absolute;right:-4%;top:0;z-index:2;display:flex;align-items:center;gap:10px;width:min(78%,300px);padding:10px 12px 10px 10px;border-radius:14px;background:#fff;box-shadow:0 18px 36px -22px rgba(40,32,20,.5),0 0 0 1px rgba(24,24,27,.05);box-sizing:border-box;opacity:0;transform:translate3d(0,-40%,0) scale(.96);transition:opacity .35s ease,transform .5s ${EASE};pointer-events:none}
.ev-p-dl[data-on]{opacity:1;transform:translate3d(0,-62%,0);transition:opacity .5s ease .35s,transform .8s ${EASE} .35s}
.ev-p-dl-ic{display:grid;flex:none;place-items:center;width:34px;height:34px;border-radius:10px;background:#0a0a0b;color:#fff}
.ev-p-dl-ic svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ev-p-dl-t{display:flex;flex:1 1 auto;min-width:0;flex-direction:column;gap:3px}
.ev-p-dl-t b{overflow:hidden;font-size:13px;font-weight:600;line-height:1.25;letter-spacing:-.01em;color:#18181b;white-space:nowrap;text-overflow:ellipsis}
.ev-p-dl-s{display:grid;font-size:12px;line-height:1.3;color:#77757f}
.ev-p-dl-s i{grid-area:1/1;font-style:normal;white-space:nowrap}
.ev-p-dl-b{opacity:0}
.ev-p-dl-bar{position:relative;display:block;height:3px;margin-top:3px;overflow:hidden;border-radius:2px;background:#eeedf1}
.ev-p-dl-bar i{position:absolute;inset:0;border-radius:inherit;background:#18181b;transform:scaleX(0);transform-origin:0 50%}
.ev-p-dl-ok{position:relative;flex:none;width:22px;height:22px;border-radius:50%;background:#22c55e;transform:scale(0)}
.ev-p-dl-ok::after{content:"";position:absolute;left:8px;top:4.5px;width:5px;height:10px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
.ev-p-dl[data-on] .ev-p-dl-bar i{animation:ev-dl-fill 1.5s cubic-bezier(.45,0,.2,1) .9s both}
.ev-p-dl[data-on] .ev-p-dl-a{animation:ev-dl-out .35s ease 2.45s both}
.ev-p-dl[data-on] .ev-p-dl-b{animation:ev-dl-in .5s ${EASE} 2.55s both}
.ev-p-dl[data-on] .ev-p-dl-ok{animation:ev-dl-ok .55s cubic-bezier(.34,1.56,.64,1) 2.5s both}
@keyframes ev-dl-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes ev-dl-out{from{opacity:1;transform:none}to{opacity:0;transform:translate3d(0,-5px,0)}}
@keyframes ev-dl-in{from{opacity:0;transform:translate3d(0,5px,0)}to{opacity:1;transform:none}}
@keyframes ev-dl-ok{from{transform:scale(0)}to{transform:scale(1)}}
@media(min-width:1600px){.ev-p-dl{width:min(70%,330px);gap:12px;padding:12px 14px 12px 12px}.ev-p-dl-ic{width:38px;height:38px}.ev-p-dl-t b{font-size:14px}.ev-p-dl-s{font-size:13px}}
/* Landing round 7: on the wider pictures the tabs grow a little with the card. */
@media(min-width:1600px){.ev-tabs{bottom:20px}.ev-tab{height:34px;padding:0 15px;font-size:14px;line-height:34px}}
@media(max-width:479px){
  .ev-tab{padding:0 10px;font-size:12.5px}
  /* Round 15: the stage stands a little higher, so the file's notice has its own row under the card, above the tabs. */
  .ev-p-stage{top:38%;width:92%}
  .ev-p-dl{left:0;right:0;top:calc(100% + 10px);width:auto;padding:8px 10px 8px 8px;border-radius:12px;transform:translate3d(0,8px,0)}
  .ev-p-dl[data-on]{transform:none}
  .ev-p-dl-ic{width:30px;height:30px;border-radius:9px}
  .ev-p-dl-ic svg{width:16px;height:16px}
  .ev-p-dl-t b{font-size:12.5px}
  .ev-p-dl-s{font-size:11.5px}
  .ev-p-card{gap:12px}
  .ev-p-media{flex-basis:40%}
  .ev-p-stats{gap:8px 8px}
  .ev-p-k{font-size:10.5px}
  .ev-p-v{font-size:12px}
  /* The lesson's name fits the smaller tile whole. */
  .ev-p-lesson{left:6px;bottom:10px;gap:4px;padding:3px 7px 3px 3px;font-size:8.5px}
  .ev-p-play{transform:scale(.8);margin:-1px}
}

/*
  2. Storefronts. Landing round 6 (the owner's reference picture): a light grey picture, the pages as tall rounded
  cards side by side, a fixed inset from its top and running off its foot, the middle one whole and its neighbours cut
  by the sides. A card's width follows the picture's (56% of it on a phone, never over 270px), so on a phone and on a
  laptop about one whole card and two cut ones stand in it. Landing round 7: the picture grows with the wider section,
  and the cap with it (58% of the picture's height once that is over 270px), so a taller picture shows a larger card
  rather than more of a small one. --r is one of the page's own pixels (drawn at 390). The
  strip takes the pointer (drag, swipe); the cards inside take none.
*/
.ev-s{--top:clamp(24px,8cqw,42px);--card-w:clamp(170px,56cqw,max(270px,58cqh));--gap:clamp(12px,2cqw,16px);background:#ebebeb;container-type:size;cursor:grab;touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.ev-s[data-dragging]{cursor:grabbing}
/* Landing round 8: the track stands still; each page is its own small layer that wraps round on its own (useDriftStrip). */
.ev-s-track{position:absolute;top:var(--top);left:0;display:flex;height:100cqh;width:max-content}
.ev-s-slot{flex:none;width:var(--card-w);height:100%;padding:0 calc(var(--gap) / 2);box-sizing:content-box;pointer-events:none;will-change:transform;backface-visibility:hidden}
.ev-st{--r:calc(var(--card-w) / 390);position:relative;display:flex;flex-direction:column;height:100%;overflow:hidden;border-radius:${r(30)};font-size:${r(15)};line-height:1.3;box-shadow:0 0 0 1px rgba(20,20,20,.05),0 14px 30px -24px rgba(20,20,20,.35);box-sizing:border-box}
.ev-st img{display:block;flex:none}

/* A merch store: brand and Cart, the drop's name big and airy, a two column grid of photographed pieces. */
.ev-mc{background:#fff;color:#141414}
.ev-mc-top{display:flex;align-items:center;justify-content:space-between;padding:${r(28)} ${r(26)} 0;font-size:${r(12.5)};letter-spacing:.14em;text-transform:uppercase;color:#3a3a3a}
.ev-mc-cart{display:flex;align-items:center;gap:${r(14)}}
.ev-mc-menu{position:relative;width:${r(18)};height:${r(8)};border-top:${r(1.6)} solid currentColor;border-bottom:${r(1.6)} solid currentColor}
.ev-mc-title{display:flex;flex-direction:column;margin:${r(42)} ${r(26)} 0;font-size:${r(58)};font-weight:400;line-height:.98;letter-spacing:.03em;text-transform:uppercase}
.ev-mc-title span + span{align-self:flex-end}
.ev-mc-grid{display:grid;grid-template-columns:1fr 1fr;gap:${r(26)} ${r(16)};margin:${r(38)} ${r(26)} 0}
.ev-mc-item{display:flex;flex-direction:column;min-width:0}
.ev-mc-img{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;background:#f1f1f1}
.ev-mc-name{margin-top:${r(10)};font-size:${r(15)};color:#141414;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev-mc-price{margin-top:${r(2)};font-size:${r(13.5)};color:#6b6b6b}

/*
  Landing round 8: a store laid out like a real Storelib store. The menu and the cart in small capitals either side of
  the centred wordmark, a wide photo of the drop, the drop's name with how many pieces, and the pieces on white.
  Landing round 10 (the owner: "I don't like the cover for Fieldwork", and its page did not match the others' height):
  a clean studio photo of folded knits on pale grey, the menu, wordmark and cart standing on the photo's light top and
  the drop's name on its empty left, as a store's header over its cover does. The cover is as tall as the other stores'
  header and title together, and the pieces below sit in the same grid, so every store's first row of pieces ends at
  the same height and the second row starts under it.
*/
.ev-ms-cover{position:relative;display:block;flex:none;height:${r(214)};overflow:hidden;background:#e4e4e2}
.ev-ms-hero{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 40%}
.ev-ms-top{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:${r(20)} ${r(22)} 0;font-size:${r(11)};letter-spacing:.16em;text-transform:uppercase;color:#2a2a2a}
.ev-ms-nav:last-child{justify-self:end}
.ev-ms-mark{font-size:${r(25)};font-weight:800;letter-spacing:-.04em;text-transform:none;color:#111}
.ev-ms-drop{position:absolute;left:${r(22)};bottom:${r(26)};display:flex;flex-direction:column;color:#141414}
.ev-ms-drop b{font-size:${r(34)};font-weight:700;line-height:.98;letter-spacing:-.035em}
.ev-ms-drop i{margin-top:${r(10)};font-size:${r(12)};font-style:normal;letter-spacing:.14em;text-transform:uppercase;color:#4a4a4a}
.ev-ms-cover + .ev-mc-grid{margin-top:${r(24)}}
.ev-mc[data-store] .ev-mc-img{border-radius:${r(10)}}

/* A creator's link page: a dark, blurred photo, the name big in the page's colour, the icons, two buttons, the products. */
.ev-lp{align-items:stretch;padding:${r(48)} ${r(24)} 0;color:#fff;text-align:center}
.ev-lp-ground{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.08)}
.ev-lp::before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.08),rgba(0,0,0,.32) 55%,rgba(0,0,0,.5))}
.ev-lp-name,.ev-lp-social,.ev-lp-btn,.ev-lp-grid,.ev-lp-av,.ev-lp-bio{position:relative}
/* Landing round 8: the creator's photo over the name, and a line under it where the page has one. */
.ev-lp{padding-top:${r(34)}}
.ev-lp-av{align-self:center;width:${r(84)};height:${r(84)};margin-bottom:${r(18)};border-radius:50%;object-fit:cover;box-shadow:0 0 0 ${r(3)} rgba(255,255,255,.9)}
.ev-lp-bio{margin:${r(14)} auto 0;max-width:${r(290)};font-size:${r(15.5)};line-height:1.4;color:rgba(255,255,255,.82)}
.ev-lp-name{display:flex;flex-direction:column;font-size:${r(60)};font-weight:800;line-height:.92;letter-spacing:-.025em;color:var(--accent)}
.ev-lp-social{display:flex;justify-content:center;gap:${r(22)};margin-top:${r(26)}}
.ev-lp-social svg{width:${r(24)};height:${r(24)};fill:#fff}
.ev-lp-social .ev-lp-line{fill:none;stroke:#fff;stroke-width:2}
.ev-lp-btn{display:flex;align-items:center;justify-content:center;height:${r(58)};margin-top:${r(14)};border:1px solid rgba(255,255,255,.12);border-radius:${r(14)};background:rgba(255,255,255,.14);font-size:${r(17)};font-weight:500}
.ev-lp-social + .ev-lp-btn{margin-top:${r(30)}}
/*
  Landing round 9 (the owner: Kaia Moon's Shop merch and Tour dates "more fatty, more hype, a little bit"): on her page
  the two buttons are taller, fully round and set heavy; the first is filled in her mint with dark words, the second
  keeps the tint under a mint outline. The other pages' buttons are as they were. They never shrink: her page has a
  line under the name, so it is longer than its card, and the column had been squeezing her buttons thin.
*/
.ev-lp[data-hype] .ev-lp-btn{flex:none;height:${r(66)};border:${r(2)} solid var(--accent);border-radius:${r(33)};background:rgba(255,255,255,.1);font-size:${r(19)};font-weight:800;letter-spacing:-.01em}
.ev-lp[data-hype] .ev-lp-social + .ev-lp-btn{background:var(--accent);color:#0b1b26}
.ev-lp-grid{display:grid;grid-template-columns:1fr 1fr;gap:${r(14)};margin-top:${r(26)}}
.ev-lp-img{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:${r(14)};background:rgba(255,255,255,.08)}

/*
  Landing round 14: Liam Bailey's product page as a phone shows it (storelib.com/liam-bailey/gym-beginner-program).
  The seller's dark bar, the cover the page's full width, the title beside its category, and the box with the price,
  the buy button live in the page's blue (#2563eb, white words, its own light edge: never faded), the wishlist button
  and what is included. Its sizes are the live page's at 390.
*/
.ev-pp{background:#fff;color:#111827}
.ev-pp-bar{display:flex;flex:none;align-items:center;gap:${r(12)};height:${r(56)};padding:0 ${r(16)};background:#1a1a1a;color:#fff}
.ev-pp-bar svg{flex:none;width:${r(22)};height:${r(22)};fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ev-pp-bar .ev-pp-more{stroke-width:3}
.ev-pp-av{width:${r(32)};height:${r(32)};border-radius:50%;object-fit:cover}
.ev-pp-seller{flex:1;font-size:${r(16)};font-weight:600}
.ev-pp-cover{display:block;flex:none;width:100%;height:auto;aspect-ratio:554/450;object-fit:cover;background:#111}
.ev-pp-body{display:flex;flex-direction:column;padding:${r(18)} ${r(16)} 0}
.ev-pp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:${r(12)}}
.ev-pp-title{font-size:${r(25)};font-weight:600;line-height:1.2;letter-spacing:-.01em}
.ev-pp-tag{flex:none;margin-top:${r(3)};padding:${r(5)} ${r(10)};border-radius:${r(6)};background:#f3f4f6;font-size:${r(13)};line-height:1.3}
.ev-pp-box{display:flex;flex-direction:column;margin-top:${r(18)};padding:${r(18)} ${r(16)};border:1px solid #e5e7eb;border-radius:${r(14)}}
.ev-pp-price{font-size:${r(26)};font-weight:700;line-height:1.2;letter-spacing:-.01em}
.ev-pp-buy{display:flex;align-items:center;justify-content:center;height:${r(50)};margin-top:${r(14)};border-radius:${r(8)};color:#fff;font-size:${r(16)};font-weight:600;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 ${r(2)} ${r(6)} rgba(37,99,235,.32)}
.ev-pp-wish{display:flex;align-items:center;justify-content:center;gap:${r(8)};height:${r(48)};margin-top:${r(10)};border:1px solid #d1d5db;border-radius:${r(8)};font-size:${r(14.5)};font-weight:500}
.ev-pp-wish svg{width:${r(16)};height:${r(16)};fill:none;stroke:#9ca3af;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ev-pp-inc{display:flex;flex-direction:column;gap:${r(10)};margin-top:${r(18)};padding-top:${r(16)};border-top:1px solid #e5e7eb;font-size:${r(14.5)};color:#4b5563}
.ev-pp-inc b{font-size:${r(16)};font-weight:600;color:#111827}
.ev-pp-inc span{display:flex;align-items:center;gap:${r(10)}}
.ev-pp-inc svg{flex:none;width:${r(16)};height:${r(16)};fill:none;stroke:#4b5563;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

/* Landing round 14: Satori Studio's real OnePage, its picture from the top of the card down, running off the foot. */
.ev-shot{display:block}
.ev-shot-img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 0}

${GLOBE_CSS()}

/*
  4. Support (wave 13's card, landing round 4): three threads stacked in the
  middle of the card, each on the same ${TURN * 3}s clock and a third of it
  later than the one before. In its third a thread rises in, the question
  arrives, the other side types, the answer arrives; then it fades up and
  out as the next one rises. Landing round 14: one thread at a time, each part played
  once as its thread comes in (Support moves data-on), nothing running in between.
  Landing round 7 (the owner: the background "more colorful, cool and clean, simple, bold", like his reference): one
  still gradient with a faint lighter glow in the top right so it is not flat. No noise, nothing moving behind the
  thread. The thread is a plain white card on it, rounder and roomier, and its words grow with the card (container
  queries below).
  Landing round 8 (the owner: he likes the colour and the gradient, not the orange, pink and red): deep teal at the top
  left through sea green to a clear aqua at the foot, the glow a pale aqua. Still one gradient, no purple, nothing warm;
  the white thread and its black answer read on every part of it.
  Landing round 9 (the owner: "keep the colour of the Real support card as the pink/orange/red gradient"): round 7's
  ground again, raspberry at the top left through rose to a warm peach at the foot, the glow a pale pink. The teal is gone.
*/
.ev-c{background:radial-gradient(70% 60% at 88% 8%,rgba(255,170,180,.32) 0%,rgba(255,170,180,0) 100%),linear-gradient(168deg,#9d1640 0%,#c03560 36%,#dc6476 64%,#f1a283 100%);container-type:inline-size}
.ev-c-thread{position:absolute;left:50%;top:50%;width:min(80%,440px);padding:18px 18px 20px;box-sizing:border-box;border-radius:18px;background:#fff;box-shadow:0 30px 60px -34px rgba(80,8,30,.55);opacity:0;transform:translate3d(-50%,-46%,0) scale(.97)}
/* Landing round 14: one thread plays at a time (Support's timer moves data-on), each part once: in, question, typing, answer; the one leaving fades up with its words still on it. */
/* Until the first turn the first thread simply stands, whole: a card that comes on screen is never empty while an entrance waits. From the first turn (data-turning) each thread coming in plays its parts. */
.ev-c-thread[data-on]{opacity:1;transform:translate3d(-50%,-50%,0)}
.ev-c-thread[data-on] .ev-c-q,.ev-c-thread[data-on] .ev-c-r{opacity:1;transform:none}
.ev-c[data-turning] .ev-c-thread[data-on]{animation:ev-c-in .75s ${EASE} .55s both}
.ev-c-thread[data-out]{animation:ev-c-out .85s ${EASE} both}
.ev-c-head{margin:0 0 14px;font-size:14px;font-weight:500;color:#6b6a72}
.ev-c-msg{display:flex;align-items:flex-end;gap:8px;margin-top:10px}
.ev-c-bubble{flex:1 1 auto;margin:0;padding:11px 13px;border-radius:12px;font-size:13.5px;line-height:1.42}
.ev-c-light{background:#f0eff2;color:#18181b}
.ev-c-dark{background:#111113;color:#fff}
.ev-c-av{display:block;flex:none;width:24px;height:24px;border-radius:7px;object-fit:cover}
.ev-c-slot{position:relative}
.ev-c-q,.ev-c-r{opacity:0;transform:translate3d(0,10px,0)}
.ev-c[data-turning] .ev-c-thread[data-on] .ev-c-q{animation:ev-c-rise .9s ${EASE} .85s both}
.ev-c[data-turning] .ev-c-thread[data-on] .ev-c-r{animation:ev-c-rise .75s ${EASE} 4.75s both}
.ev-c-thread[data-out] .ev-c-q,.ev-c-thread[data-out] .ev-c-r{opacity:1;transform:none}
.ev-c-typing{position:absolute;left:0;top:10px;display:flex;gap:4px;padding:11px 13px;border-radius:12px;background:#111113;opacity:0}
.ev-c[data-turning] .ev-c-thread[data-on] .ev-c-typing{animation:ev-c-type 2.55s ease 2.35s both}
.ev-c-dot{width:6px;height:6px;border-radius:99px;background:#fff;opacity:.5}
.ev-c[data-turning] .ev-c-thread[data-on] .ev-c-dot{animation:ev-dot 1.1s ease-in-out 2.35s 2}
.ev-c[data-turning] .ev-c-thread[data-on] .ev-c-dot:nth-child(2){animation-delay:2.5s}
.ev-c[data-turning] .ev-c-thread[data-on] .ev-c-dot:nth-child(3){animation-delay:2.65s}
@keyframes ev-c-in{from{opacity:0;transform:translate3d(-50%,-46%,0) scale(.97)}to{opacity:1;transform:translate3d(-50%,-50%,0)}}
@keyframes ev-c-out{from{opacity:1;transform:translate3d(-50%,-50%,0)}to{opacity:0;transform:translate3d(-50%,-54%,0) scale(.98)}}
@keyframes ev-c-rise{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}
@keyframes ev-c-type{0%{opacity:0}17.6%,88.2%{opacity:1}100%{opacity:0}}
@keyframes ev-dot{0%,100%{opacity:.35;transform:translate3d(0,0,0)}50%{opacity:1;transform:translate3d(0,-3px,0)}}
@container (max-width:480px){
  .ev-c-thread{width:90%;padding:14px 14px 16px}
  .ev-c-bubble{font-size:12.5px;padding:9px 11px}
  .ev-c-head{font-size:13px;margin-bottom:10px}
}
@container (min-width:640px){
  .ev-c-thread{width:min(68%,580px);padding:24px 24px 26px;border-radius:22px}
  .ev-c-head{font-size:15px;margin-bottom:16px}
  .ev-c-msg{gap:10px;margin-top:12px}
  .ev-c-bubble{padding:13px 16px;border-radius:14px;font-size:15px}
  .ev-c-typing{top:12px;padding:15px 16px;border-radius:14px}
  .ev-c-av{width:28px;height:28px;border-radius:8px}
}
@container (min-width:860px){
  .ev-c-thread{width:min(64%,640px);padding:30px 30px 32px;border-radius:24px}
  .ev-c-head{font-size:16.5px;margin-bottom:18px}
  .ev-c-bubble{padding:15px 18px;border-radius:16px;font-size:16.5px}
  .ev-c-typing{padding:17px 18px;border-radius:16px}
  .ev-c-av{width:32px;height:32px;border-radius:9px}
}

@media(prefers-reduced-motion:reduce){
  .ev-card,.ev-p-bg,.ev-p-img,.ev-p-rise,.ev-tab,.ev-tab::before,.ev-tab-ink,.ev-globe-pill,.ev-p-dl{transition:none !important}
  .ev-p-dl-bar i,.ev-p-dl-a,.ev-p-dl-b,.ev-p-dl-ok{animation:none !important}
  .ev-p-dl-bar i,.ev-p-dl-ok{transform:none}
  .ev-p-dl-a{opacity:0}
  .ev-p-dl-b{opacity:1}
  .ev-card{opacity:1;transform:none}
  .ev-loop,.ev-tab[data-on] .ev-tab-fill,.ev-p-bg{animation:none !important}
  .ev-tab-fill{display:none}
  .ev-c-typing{display:none}
  .ev-c-thread:first-child{opacity:1;transform:translate3d(-50%,-50%,0)}
  .ev-c-thread:first-child .ev-c-q,.ev-c-thread:first-child .ev-c-r{opacity:1;transform:none}
}
@media(scripting:none){.ev-card{opacity:1;transform:none}}
`

/** The globe card's styles. */
function GLOBE_CSS() {
  return `/* 3. Globe */
.ev-g{background:#060608}
.ev-globe{position:absolute;inset:0;cursor:grab;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.ev-globe[data-dragging]{cursor:grabbing}
.ev-globe-canvas{display:block;width:100%;height:100%}
.ev-globe-pills{position:absolute;inset:0;pointer-events:none}
/*
  The order notification (landing round 5): it rises 10px and fades in, stays, and fades out where it stands; every
  pill keeps its own layer for good, so nothing is promoted or dropped (a flash of re-rasterised text) as it comes and
  goes. Landing round 7: where it stands is the globe's (GLOBE_NOTICE_CSS in everything-globe.tsx pins it over its
  city), so the round 5 lower left corner, which that already overrode, is gone from here.
*/
.ev-globe-pill{display:flex;width:max-content;align-items:center;gap:7px;padding:7px 12px 7px 9px;border-radius:999px;background:#fff;color:#18181b;font-size:13px;line-height:1.2;white-space:nowrap;box-shadow:0 10px 30px -12px rgba(0,0,0,.6);opacity:0;transform:translate3d(0,10px,0);will-change:opacity,transform;backface-visibility:hidden;transition:opacity .28s ease,transform .28s ease}
.ev-globe-pill[data-on]{opacity:1;transform:translate3d(0,0,0);transition:opacity .4s ease,transform .55s ${EASE}}
.ev-globe-flag{display:block;width:16px;height:12px;border-radius:2px;object-fit:cover}
.ev-globe-city{color:#55535c}
.ev-globe-price{font-weight:600;font-variant-numeric:tabular-nums}`
}

/** The section's stylesheet, put in <head> ahead of it while the browser is idle (lazy-sections.tsx). */
export const EVERYTHING_STYLES: readonly SectionStyle[] = [{ href: "w13-everything", precedence: "w13-home", css: CSS }]
