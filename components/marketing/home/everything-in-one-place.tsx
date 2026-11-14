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
    2. A store that looks like you: creator stores drawn the way a phone
       shows a real Storelib creator page (the newsletter bar, the cover, the
       round photo, name, handle, bio and social icons, Home / Products /
       Communities, Featured and the product cards), each in one of the
       store's real colour schemes (lib/store-builder/defaults themePresets),
       and between them OnePages and a community as a phone shows them,
       drifting past, and the strip can be dragged and flicked. Pictures
       only: nothing inside it can be hovered, clicked or selected.
    3. Sell anywhere in the world: a globe the visitor can spin, with orders
       arcing to buyers in currencies checkout charges in.
    4. Real support: three requests take turns, a question and its answer,
       from Storelib's support or from the creator to a buyer.

  Motion is transform and opacity only. usePlatformSection writes
  data-platform-in (the first time the section is seen) and
  data-platform-live (on screen and the tab visible); every loop here is an
  .ev-loop, paused while not live, and the globe stops drawing. Under
  reduced motion nothing loops, the card does not lean, and the tabs still
  work by hand.
*/

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react"
import type { SectionStyle } from "./lazy-section"
import { usePlatformSection } from "./platform-motion"
import { EverythingGlobe } from "./everything-globe"
import { StorelibLogo } from "@/components/brand/storelib-logo"

/* Landing round 4 (the owner: the old line was "too broad and vague"): what the four cards below say, in the same two tones. */
export const EVERYTHING_HEADING = { lead: "Sell anything, anywhere.", rest: "Support included." } as const

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
  pack for video, shown the way such a pack is sold. One frame split down
  the middle, the flat log footage on the left and the graded picture on
  the right, the looks in the pack as small frames under it, and the file
  that is selected. The photo is there only to show what the product does.
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
    name: "Cine Tones, 12 LUTs",
    kind: "luts",
    img: `${IMG}/lut-frame.webp`,
    w: 480,
    h: 270,
    stats: [
      ["Price", "$29.00"],
      ["Downloads", "386"],
      ["Revenue", "$11,194.00"],
    ],
    status: "Live",
  },
  {
    tab: "Course",
    name: "Knit Your First Sweater",
    kind: "course",
    img: `${IMG}/course.webp`,
    w: 480,
    h: 480,
    stats: [
      ["Price", "$79.00"],
      ["Students", "146"],
      ["Revenue", "$11,534.00"],
    ],
    status: "Enrolling",
  },
  {
    tab: "Community",
    name: "The Paperback Club",
    kind: "community",
    img: `${IMG}/community.webp`,
    w: 640,
    h: 360,
    stats: [
      ["Price", "$8 / month"],
      ["Members", "1,240"],
      ["Monthly", "$9,920.00"],
    ],
    status: "Open",
  },
]

function Img({ src, w, h, className }: { src: string; w: number; h: number; className?: string }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img className={className} src={src} alt="" width={w} height={h} loading="lazy" decoding="async" draggable={false} />
}

/*
  Landing round 4 (the owner: "a real looking community card"): the
  community card a Storelib community shows at the top of its left column
  (components/community/member), small: the cover, the name and address,
  one line about it, Members, Online and Admins, and the faces of a few
  members. Drawn at 260px and scaled to the tile.
*/
const COMMUNITY_FACES = ["av-n", "av-e", "av-h", "av-f", "av-o"] as const
function CommunityCard({ s }: { s: Slide }) {
  return (
    <span className="ev-cm">
      <Img className="ev-cm-cover" src={s.img} w={s.w} h={s.h} />
      <span className="ev-cm-body">
        <span className="ev-cm-name">{s.name}</span>
        <span className="ev-cm-url">storelib.com/community/paperback</span>
        <span className="ev-cm-x">One book a month, a call on the last Sunday.</span>
        <span className="ev-cm-stats">
          <span>
            <b>1.2k</b>
            <i>Members</i>
          </span>
          <span>
            <b>46</b>
            <i>
              <span className="ev-cm-live" />
              Online
            </i>
          </span>
          <span>
            <b>2</b>
            <i>Admins</i>
          </span>
        </span>
        <span className="ev-cm-faces">
          {COMMUNITY_FACES.map((f) => (
            <Img key={f} className="ev-cm-face" src={`/home/showcase/${f}.webp`} w={96} h={96} />
          ))}
          <span className="ev-cm-more">+1.2k</span>
        </span>
      </span>
    </span>
  )
}

/** The looks in the pack, as the small frames under the split one; each is the same frame under another grade. */
const LUT_LOOKS = ["dusk", "kodak", "teal", "fade", "mono"] as const

/** The LUT pack: one frame, flat on the left and graded on the right, the pack's looks and the chosen file. */
function LutPack({ s }: { s: Slide }) {
  return (
    <span className="ev-lut">
      <span className="ev-lut-frame">
        <Img className="ev-lut-graded" src={s.img} w={s.w} h={s.h} />
        <span className="ev-lut-flat">
          <Img src={s.img} w={s.w} h={s.h} />
        </span>
        <span className="ev-lut-split" />
        <span className="ev-lut-tag ev-lut-tag-a">Log</span>
        <span className="ev-lut-tag ev-lut-tag-b">CT 04</span>
      </span>
      <span className="ev-lut-looks">
        {LUT_LOOKS.map((look, i) => (
          <span key={look} className={`ev-lut-look ev-lut-${look}`} data-on={i === 0 || undefined}>
            <Img src={s.img} w={s.w} h={s.h} />
          </span>
        ))}
      </span>
      <span className="ev-lut-file">
        <b>CT_04_Dusk.cube</b>
        <i>4 of 12</i>
      </span>
    </span>
  )
}

/** The product's picture: the photo, or for the LUT pack its looks, standing on the tile. */
function ProductPicture({ s }: { s: Slide }) {
  const photo = <Img src={s.img} w={s.w} h={s.h} />
  if (s.kind === "luts") return <LutPack s={s} />
  if (s.kind === "course")
    return (
      <>
        {photo}
        <span className="ev-p-lesson">
          <span className="ev-p-play" />
          <span className="ev-p-lesson-t">Lesson 3 · Casting on</span>
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

function ProductSlides() {
  const [active, setActive] = useState(0)
  const n = EVERYTHING_SLIDES.length
  const next = useCallback(() => setActive((a) => (a + 1) % n), [n])
  const card = useRef<HTMLDivElement>(null)
  usePressTilt(card)
  return (
    <div className="ev-vis ev-p">
      {EVERYTHING_SLIDES.map((s, i) => (
        <div key={s.tab} className={`ev-p-bg ev-p-bg${i}`} data-on={i === active || undefined} aria-hidden="true" />
      ))}
      <div className="ev-p-stage">
        <div ref={card} className="ev-p-card" data-press-tilt="">
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
  Landing round 2 (the owner: "realistic and accurate, like real Storelib
  stores"). Each store is a creator page exactly as a phone draws it,
  measured from storelib.com/andrewrullz at 390px and the components
  behind it: the subscribe bar (photo, "Your email", Subscribe in the
  scheme's button colour), the cover band, the round photo at the small
  size (124px, avatarSizeMap) straddling the cover's edge, name, @handle,
  bio and social icons, the underline tabs Home / Products / Communities in
  three equal columns, "Featured", and the explore product card
  (components/explore/product-card.tsx): a 16:9 cover, the rating, the
  title with its category badge, the price, in two columns (the Featured
  section's mobileListing: 2). The colours are the store's real schemes
  (themePresets): Clay, Astrid, Default, Harbor, Sage and Cream. Every size
  is in the page's own pixels (--r is one of them), so the card is that
  page, scaled. Fictional creators, Unsplash photography.
*/
type StoreProduct = { src: string; name: string; badge: string; price: string }
type Storefront = {
  key: string
  name: string
  handle: string
  bio: string
  cover: string
  avatar: string
  /** The store's colour scheme, by its name in themePresets. */
  scheme: "astrid" | "default" | "harbor" | "cream"
  products: [StoreProduct, StoreProduct]
}

export const EVERYTHING_STORES: readonly Storefront[] = [

  {
    key: "lumen",
    name: "Lumen Harbor",
    handle: "@lumenharbor",
    bio: "Indie band from Bristol",
    cover: `${ST}/lumen-cover.webp`,
    avatar: `${ST}/lumen-av.webp`,
    scheme: "astrid",
    products: [
      { src: `${ST}/lumen-lp.webp`, name: "Night Swim LP", badge: "Physical", price: "$28.00" },
      { src: `${ST}/lumen-tee.webp`, name: "Tour Tee 2026", badge: "Physical", price: "$32.00" },
    ],
  },
  {
    key: "mila",
    name: "Mila Draws",
    handle: "@miladraws",
    bio: "Illustrator in Lisbon",
    cover: `${ST}/mila-cover.webp`,
    avatar: `${ST}/mila-av.webp`,
    scheme: "default",
    products: [
      { src: `${ST}/mila-course.webp`, name: "Botanical Sketching", badge: "Course", price: "$49.00" },
      { src: `${ST}/mila-brushes.webp`, name: "Gouache Brush Pack", badge: "Digital", price: "$18.00" },
    ],
  },
  {
    key: "north",
    name: "Northbound",
    handle: "@northbound",
    bio: "Outdoor layers, made in small runs",
    cover: `${ST}/north-cover.webp`,
    avatar: `${ST}/north-av.webp`,
    scheme: "harbor",
    products: [
      { src: `${ST}/north-cap.webp`, name: "Ridge Cap", badge: "Physical", price: "$28.00" },
      { src: `${ST}/north-hoodie.webp`, name: "Trail Hoodie", badge: "Physical", price: "$64.00" },
    ],
  },

  {
    key: "theo",
    name: "Theo Marsh",
    handle: "@theomarsh",
    bio: "Landscape prints from the road",
    cover: `${ST}/theo-cover.webp`,
    avatar: `${ST}/theo-av.webp`,
    scheme: "cream",
    products: [
      { src: `${ST}/theo-forest.webp`, name: "Pine Fog Print", badge: "Physical", price: "$45.00" },
      { src: `${ST}/theo-lake.webp`, name: "Field Notes Club", badge: "Community", price: "$6/month" },
    ],
  },
]

/* The three social icons a creator page shows by default (TikTok, Instagram, YouTube), drawn plain in the scheme's muted ink. */
function Social() {
  return (
    <span className="ev-st-social">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.5 3h2.6c.3 2 1.6 3.4 3.6 3.6v2.7c-1.4 0-2.7-.4-3.7-1.1v6.3a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v2.8a2.9 2.9 0 1 0 2.2 2.8V3Z" />
      </svg>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="ev-st-line">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.3" cy="6.7" r=".9" className="ev-st-fill" />
      </svg>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
      </svg>
    </span>
  )
}

/*
  Landing round 4: the card is a phone's first screen of the page, whole
  (390 by 650 of its pixels), so nothing runs off its foot: the Featured
  section with its title hidden and products without reviews yet, both
  as a creator can set them.
*/
function StoreCard({ store }: { store: Storefront }) {
  return (
    <div className={`ev-st ev-st-${store.scheme}`}>
      <span className="ev-st-bar">
        <Img className="ev-st-bar-av" src={store.avatar} w={200} h={200} />
        <span className="ev-st-email">Your email</span>
        <span className="ev-st-sub">Subscribe</span>
      </span>
      <Img className="ev-st-cover" src={store.cover} w={640} h={264} />
      <Img className="ev-st-av" src={store.avatar} w={200} h={200} />
      <span className="ev-st-name">{store.name}</span>
      <span className="ev-st-handle">{store.handle}</span>
      <span className="ev-st-bio">{store.bio}</span>
      <Social />
      <span className="ev-st-tabs">
        <span data-on="">Home</span>
        <span>Products</span>
        <span>Communities</span>
      </span>
      <span className="ev-st-grid">
        {store.products.map((p) => (
          <span key={p.name} className="ev-st-prod">
            <Img className="ev-st-img" src={p.src} w={480} h={270} />
            <span className="ev-st-body">
              <span className="ev-st-row">
                <span className="ev-st-pn">{p.name}</span>
                <span className="ev-st-badge">{p.badge}</span>
              </span>
              <span className="ev-st-pp">{p.price}</span>
            </span>
          </span>
        ))}
      </span>
    </div>
  )
}

/*
  Landing round 3 (the owner: "make the OnePage just a OnePage there, real,
  no header with the URL"; "I should not be able to hover over the OnePage
  blocks"). Between the stores, OnePages: captures of live Storelib OnePages
  at a phone's width (public/home/onepage), shown whole in the same rounded
  frame as the stores, with no address and no bar over them. The whole strip
  is a picture: it takes no pointer, no focus and no selection.
*/
/*
  Landing round 4 (the owner: "not only OnePages but stores, communities on
  mobile, digital product stores", wider cards, about 2.3 a row, none cut
  at the bottom, OnePages with their share and subscribe buttons). Each
  picture is a phone's first screen, 390 by 650 of its pixels, the same
  shape as a store card: three OnePages (PublicOnePage itself with fixture
  data, Share top left and Subscribe top right, captured in a dev-only route
  that is not committed) and a community on a phone (round 2's capture of
  the real member frame).
*/
type Shot = { key: string; src: string; kind: "onepage" | "community"; bg: string }
const SH = `${IMG}/strip`
export const EVERYTHING_SHOTS: readonly Shot[] = [
  { key: "op-wren", src: `${SH}/op-wren.webp`, kind: "onepage", bg: "#c5d3bd" },
  { key: "cm-charla", src: `${SH}/cm-charla.webp`, kind: "community", bg: "#ffffff" },
  { key: "op-nina", src: `${SH}/op-nina.webp`, kind: "onepage", bg: "#0b1020" },
  { key: "op-jun", src: `${SH}/op-jun.webp`, kind: "onepage", bg: "#f3eee4" },
]

/** The strip in the order it drifts: a store, then a page or a community, and on. */
export const EVERYTHING_STRIP: ReadonlyArray<Storefront | Shot> = EVERYTHING_STORES.flatMap((store, i) =>
  i < EVERYTHING_SHOTS.length ? [store, EVERYTHING_SHOTS[i]] : [store],
)

/*
  DRIFTING, AND IT CAN BE TAKEN HOLD OF (landing round 4, the owner: dragged
  "very smooth and clean by the mouse", like the creators rail). Left alone,
  the strip drifts left as a Web Animation, which the compositor runs with
  no script per frame, paused off screen and in a hidden tab. Pressed, it
  stops under the hand and follows it exactly (a transform, no layout read);
  let go, it carries the hand's speed and eases back to its drift over about
  a second, then the Web Animation takes it on from exactly where it is.
  touch-action leaves vertical swipes to the page. Nothing inside can be
  hovered or clicked: the cards take no pointer, only the strip does.
*/
const DRIFT_PX_S = 26
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
    if (!vp || !el || typeof el.animate !== "function") return
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    let loop = 0
    let x = 0
    let raf = 0
    let drift: Animation | null = null
    let from = 0
    let drag: { id: number; x0: number; y0: number; at: number; started: boolean; samples: Array<{ t: number; x: number }> } | null = null
    const wrap = (v: number) => (loop > 0 ? ((v % loop) + loop) % loop : v)
    const paint = () => {
      el.style.transform = `translate3d(${(-wrap(x)).toFixed(2)}px,0,0)`
    }
    const shown = () => liveRef.current && !document.hidden
    const stopDrift = () => {
      if (!drift) return
      x = from + ((Number(drift.currentTime) || 0) / 1000) * DRIFT_PX_S
      drift.cancel()
      drift = null
      paint()
    }
    const startDrift = () => {
      if (drift || drag || loop <= 0 || reduce.matches) return
      x = wrap(x)
      from = x
      drift = el.animate([{ transform: `translate3d(${-x}px,0,0)` }, { transform: `translate3d(${-(x + loop)}px,0,0)` }], { duration: (loop / DRIFT_PX_S) * 1000, iterations: Infinity, easing: "linear" })
      if (!shown()) drift.pause()
    }
    const glide = (v0: number) => {
      cancelAnimationFrame(raf)
      if (reduce.matches) return
      const t0 = performance.now()
      let last = t0
      const target = DRIFT_PX_S
      const step = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        const v = target + (v0 - target) * Math.exp(-(now - t0) / 380)
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
      const first = el.children[0] as HTMLElement | undefined
      const copy = el.children[el.children.length / 2] as HTMLElement | undefined
      if (!first || !copy) return
      stopDrift()
      loop = copy.offsetLeft - first.offsetLeft
      paint()
      startDrift()
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, at: 0, started: false, samples: [] }
    }
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x0
      if (!drag.started) {
        if (Math.abs(dx) < 6) return
        if (Math.abs(e.clientY - drag.y0) > Math.abs(dx)) {
          drag = null
          return
        }
        cancelAnimationFrame(raf)
        raf = 0
        stopDrift()
        drag.started = true
        drag.at = x + dx
        vp.setPointerCapture(e.pointerId)
        vp.dataset.dragging = ""
      }
      x = drag.at - dx
      drag.samples.push({ t: e.timeStamp, x })
      if (drag.samples.length > 24) drag.samples.shift()
      paint()
    }
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const d = drag
      drag = null
      if (!d.started) return
      delete vp.dataset.dragging
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
    const setLive = (on: boolean) => {
      if (!drift) return on ? startDrift() : undefined
      if (on && !document.hidden) drift.play()
      else drift.pause()
    }
    api.current = { setLive }
    const vis = () => setLive(liveRef.current)
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null
    ro?.observe(vp)
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
      drift?.cancel()
      ro?.disconnect()
      vp.removeEventListener("pointerdown", down)
      vp.removeEventListener("pointermove", move)
      vp.removeEventListener("pointerup", up)
      vp.removeEventListener("pointercancel", up)
      document.removeEventListener("visibilitychange", vis)
      reduce.removeEventListener("change", measure)
      el.style.transform = ""
    }
  }, [viewport, track])
}

function Storefronts({ live }: { live: boolean }) {
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  useDriftStrip(viewport, track, live)
  /* The strip twice over: it drifts by one set's width and starts again where it looks the same. */
  const strip = [...EVERYTHING_STRIP, ...EVERYTHING_STRIP]
  return (
    <div ref={viewport} className="ev-vis ev-s" aria-hidden="true" data-mock-still="" data-ev-strip="">
      <div ref={track} className="ev-s-track">
        {strip.map((item, i) => (
          <div key={i} className="ev-s-slot">
            {"src" in item ? (
              <div className="ev-st ev-op" data-shot={item.kind} style={{ background: item.bg }}>
                <Img className="ev-op-img" src={item.src} w={585} h={975} />
              </div>
            ) : (
              <StoreCard store={item} />
            )}
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
  cannot open a download, a creator's own domain. One CSS clock drives it,
  paused off screen; under reduced motion the first thread simply stands.
*/
type Request = { title: string; sub: string; ask: string; askAv: string; reply: string; replyAv: string | null }
const ME = `${IMG}/av-creator.webp`
export const EVERYTHING_SUPPORT: readonly Request[] = [
  {
    title: "Storelib support",
    sub: "Moving my subscribers over",
    ask: "I have 3,200 subscribers on another newsletter tool. Can I bring them to Storelib?",
    askAv: ME,
    reply: "Yes. Export them as a CSV with an Email column and import it under Contacts. Names and tags come with them.",
    replyAv: null,
  },
  {
    title: "From a buyer",
    sub: "Order #4821 · Fell Sweater pattern",
    ask: "The download link in my email won't open on my iPad. Could you send it again?",
    askAv: `${IMG}/av-buyer.webp`,
    reply: "Just sent a fresh one. Your files are also in your Storelib library, so you can download them again anytime.",
    replyAv: ME,
  },
  {
    title: "Storelib support",
    sub: "My own domain",
    ask: "I connected shop.junokada.com an hour ago and the browser still says Not secure.",
    askAv: ME,
    reply: "Your DNS is right. The certificate was still being issued, and it's live now. Reload and you'll see the lock.",
    replyAv: null,
  },
]

function Thread({ r, i }: { r: Request; i: number }) {
  return (
    <div className="ev-c-thread ev-loop" style={{ "--k": i } as CSSProperties}>
      <div className="ev-c-head">
        <span>{r.title}</span>
        <span className="ev-c-sub">{r.sub}</span>
      </div>
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

function Support() {
  return (
    <div className="ev-vis ev-c" aria-hidden="true">
      {EVERYTHING_SUPPORT.map((r, i) => (
        <Thread key={r.sub} r={r} i={i} />
      ))}
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
/** n of the storefront's own pixels (one --r), for the store cards drawn at a phone's 390px. */
const r = (n: number) => `calc(${n} * var(--r))`
/** n pixels of the 260px community page drawn in the product tile. */
const q = (n: number) => `calc(${n} * var(--q))`
/* One support request's turn, in seconds. */
const TURN = 10
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
.ev-vis{position:relative;overflow:hidden;height:clamp(300px,86vw,380px);border-radius:17px;isolation:isolate;contain:paint}
@media(min-width:768px){.ev-vis{height:clamp(320px,32vw,440px);border-radius:19px}}
.ev-cap{margin:18px 0 0;max-width:46ch;font-size:15.5px;line-height:1.5;color:#7c7a84;text-wrap:pretty}
.ev-cap-lead{font-weight:500;color:#18181b}
@media(min-width:768px){.ev-cap{font-size:16px}}

.ev[data-platform-live="false"] .ev-loop,.ev:not([data-platform-live]) .ev-loop{animation-play-state:paused}
.ev[data-platform-live="false"] .ev-tab[data-on] .ev-tab-fill,.ev:not([data-platform-live]) .ev-tab[data-on] .ev-tab-fill{animation-play-state:paused}

/*
  1. Product slides. Landing round 4 (the owner: bring back the colours that
  changed behind each product, "more funky", like his image 30): a soft
  gradient ground per product, warm coral for merch, lime and mint for the
  download, sun and tangerine for the course, sky and blush for the
  community. They cross fade over 1.4s, and each drifts very slowly on its
  own layer (a transform, paused off screen like every loop), so the colour
  is never quite still. The product stands on a white card, as before.
*/
.ev-p{background:#f2b49b}
.ev-p-bg{position:absolute;inset:-18%;opacity:0;transition:opacity 1.4s cubic-bezier(.4,0,.2,1);animation:ev-bg-drift 22s ease-in-out infinite alternate;will-change:opacity,transform}
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
/* The stage centres the card and holds the perspective the card leans in; the card itself only ever rotates and scales (usePressTilt). */
.ev-p-stage{position:absolute;left:50%;top:44%;width:min(88%,470px);transform:translate(-50%,-50%);perspective:1100px}
.ev-p-card{display:flex;align-items:center;gap:clamp(12px,1.8vw,20px);padding:10px;border-radius:17px;background:#fff;box-shadow:0 24px 48px -30px rgba(40,32,20,.45),0 1px 3px rgba(40,32,20,.08);transform-origin:50% 50%;backface-visibility:hidden}
.ev-p-media{position:relative;flex:0 0 42%;aspect-ratio:1;border-radius:11px;overflow:hidden;background:#ededed;container-type:inline-size}
.ev-p-img{position:absolute;inset:0;opacity:0;transform:translate(32%,0) scale(.9);transition:opacity .4s ease,transform .9s ${EASE}}
.ev-p-img > img{display:block;width:100%;height:100%;object-fit:cover}
.ev-p-img[data-pos="prev"]{transform:translate(-32%,0) scale(.9)}
.ev-p-img[data-pos="on"]{opacity:1;transform:none;transition:opacity .6s ease .1s,transform 1s ${EASE} .06s}
/* The LUT pack: a dark panel like a grading tool's browser. The frame is graded; its left half lies under the flat, log look. Sizes in the tile's own width (cqw). */
.ev-p-luts{display:grid;place-items:center;background:#ededed}
.ev-lut{display:flex;flex-direction:column;gap:3.6cqw;width:90cqw;padding:4.6cqw;box-sizing:border-box;border-radius:5cqw;background:#17171a;color:#fff;box-shadow:0 14px 22px -14px rgba(20,20,24,.6)}
.ev-lut img{display:block;width:100%;height:100%;object-fit:cover}
.ev-lut-frame{position:relative;display:block;aspect-ratio:16/9;overflow:hidden;border-radius:2.4cqw}
.ev-lut-flat{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}
.ev-lut-flat img{filter:saturate(.3) contrast(.72) brightness(1.16)}
.ev-lut-split{position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgba(255,255,255,.9)}
.ev-lut-tag{position:absolute;bottom:2.4cqw;padding:.9cqw 2cqw;border-radius:99px;background:rgba(0,0,0,.5);font-size:max(3.4cqw,6.5px);font-weight:600;line-height:1.2;letter-spacing:.04em;text-transform:uppercase}
.ev-lut-tag-a{left:2.4cqw}
.ev-lut-tag-b{right:2.4cqw}
.ev-lut-looks{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2cqw}
.ev-lut-look{display:block;aspect-ratio:1;overflow:hidden;border-radius:1.8cqw}
.ev-lut-look[data-on]{box-shadow:0 0 0 1.5px #17171a,0 0 0 3px #fff}
.ev-lut-kodak img{filter:sepia(.45) saturate(1.25) contrast(1.05)}
.ev-lut-teal img{filter:hue-rotate(-18deg) saturate(1.2) contrast(1.1) brightness(.95)}
.ev-lut-fade img{filter:saturate(.7) contrast(.82) brightness(1.12)}
.ev-lut-mono img{filter:grayscale(1) contrast(1.15)}
.ev-lut-file{display:flex;align-items:baseline;justify-content:space-between;gap:2cqw;font-size:max(4.6cqw,7.5px);line-height:1.2;white-space:nowrap}
.ev-lut-file b{min-width:0;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:500;color:#e4e4e7}
.ev-lut-file i{flex:none;font-style:normal;color:#8b8b93}
.ev-p-lesson{position:absolute;left:8px;bottom:12px;display:flex;align-items:center;gap:6px;padding:4px 8px 4px 4px;border-radius:999px;background:rgba(20,20,20,.55);color:#fff;font-size:10.5px;line-height:1;white-space:nowrap}
.ev-p-play{position:relative;width:16px;height:16px;border-radius:99px;background:#fff}
.ev-p-play::after{content:"";position:absolute;left:6px;top:4.5px;border-left:6px solid #18181b;border-top:3.5px solid transparent;border-bottom:3.5px solid transparent}
.ev-p-progress{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.35)}
.ev-p-progress::after{content:"";position:absolute;inset:0 62% 0 0;background:#fff}

/* The community card in the tile (components/community/member's left column card), drawn at 260px and scaled to the tile. */
.ev-p-community{--q:calc(100cqw / 260);background:#fff}
.ev-cm{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;color:#1a1a2e;font-size:${q(12)};line-height:1.3;text-align:left}
.ev-cm-cover{display:block;width:100%;height:${q(84)};object-fit:cover}
.ev-cm-body{display:flex;flex-direction:column;padding:${q(12)} ${q(14)} 0}
.ev-cm-name{font-size:${q(16)};font-weight:600;letter-spacing:-.01em}
.ev-cm-url{margin-top:${q(2)};font-size:${q(10.5)};color:#6b7280}
.ev-cm-x{margin-top:${q(8)};font-size:${q(11.5)};line-height:1.45;color:#374151}
.ev-cm-stats{display:grid;grid-template-columns:repeat(3,1fr);margin-top:${q(10)};padding:${q(8)} 0;border-top:1px solid #eef0f2;border-bottom:1px solid #eef0f2;text-align:center}
.ev-cm-stats > span{display:flex;flex-direction:column;align-items:center}
.ev-cm-stats > span + span{border-left:1px solid #eef0f2}
.ev-cm-stats b{font-size:${q(14)};font-weight:600}
.ev-cm-stats i{display:flex;align-items:center;gap:${q(4)};font-size:${q(10)};font-style:normal;color:#6b7280}
.ev-cm-live{width:${q(6)};height:${q(6)};border-radius:99px;background:#22c55e}
.ev-cm-faces{display:flex;align-items:center;margin-top:${q(10)}}
.ev-cm-face{display:block;width:${q(24)};height:${q(24)};margin-right:${q(-6)};border:${q(2)} solid #fff;border-radius:50%;object-fit:cover}
.ev-cm-more{margin-left:${q(10)};padding:${q(3)} ${q(7)};border-radius:99px;background:#f3f4f6;font-size:${q(10)};font-weight:500;color:#374151}

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
  .ev-p-stage{top:43%;width:92%}
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
  2. Storefronts. Landing round 4: the cards are as tall as the card leaves
  them (20px above and below) and a phone's screen in shape, 390 by 650, so
  each is whole, rounded on all four corners, and about 2.3 stand in a row on
  a laptop. --r is one of the page's own pixels. The strip takes the
  pointer (drag, swipe); the cards inside take none.
*/
.ev-s{--pad:20px;--card-h:calc(100cqh - var(--pad) * 2);--card-w:calc(var(--card-h) * .6);background:#edece8;container-type:size;cursor:grab;touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.ev-s[data-dragging]{cursor:grabbing}
.ev-s-track{position:absolute;top:var(--pad);bottom:var(--pad);left:0;display:flex;width:max-content;will-change:transform;backface-visibility:hidden}
.ev-s-slot{flex:none;width:var(--card-w);height:var(--card-h);padding:0 6px;box-sizing:content-box;pointer-events:none}
@container (max-width:400px){.ev-s-slot{padding:0 5px}}
.ev-st{--r:calc(var(--card-w) / 390);--bg:#ffffff;--ink:#000;--mute:#6b7280;--line:#e5e7eb;--field:#d1d5db;--card:#fff;--card-ink:#2d3034;--card-line:#e5e7eb;--badge:#f3f4f6;--badge-ink:#374151;--btn:#2563eb;--rad:8;position:relative;display:flex;flex-direction:column;align-items:center;height:100%;overflow:hidden;border-radius:${r(26)};background:var(--bg);color:var(--ink);font-size:${r(15)};line-height:1.35;text-align:center;box-shadow:0 18px 36px -26px rgba(30,24,16,.4),0 0 0 1px rgba(30,24,16,.07);box-sizing:border-box}
.ev-st-astrid{--bg:#111113;--ink:#fafafa;--mute:#a1a1aa;--line:#2e3136;--field:#3a3d43;--card:#1c1e22;--card-ink:#fafafa;--card-line:#2e3136;--badge:#3a3c40;--badge-ink:#e4e4e7;--btn:#2563eb;--rad:10}
.ev-st-harbor{--bg:#ecf1f5;--ink:#0f1e2c;--mute:#566778;--line:#d4dde6;--field:#c6d2dd;--card-ink:#0f1e2c;--card-line:#d4dde6;--badge:#edf1f5;--badge-ink:#1f4b6e;--btn:#1f4b6e}
.ev-st-cream{--bg:#faf4e8;--ink:#1d1a14;--mute:#7c6a4c;--line:#e8dfc9;--field:#ddd1b6;--card-ink:#1d1a14;--card-line:#e8dfc9;--badge:#f6efe0;--badge-ink:#896d34;--btn:#896d34}
.ev-st img{display:block;flex:none}
/* A OnePage between the stores: the capture of a live page, whole, in the same frame. Nothing over it. */
.ev-op-img{width:100%;height:100%;object-fit:cover;object-position:top}
.ev-st-bar{display:flex;align-items:center;gap:${r(8)};align-self:stretch;height:${r(60)};padding:0 ${r(12)};box-sizing:border-box}
.ev-st-bar-av{width:${r(32)};height:${r(32)};border-radius:50%;object-fit:cover}
.ev-st-email{flex:1;min-width:0;display:flex;align-items:center;height:${r(40)};padding:0 ${r(12)};box-sizing:border-box;border:1px solid var(--field);border-radius:${r(8)};font-size:${r(16)};color:var(--mute);text-align:left}
.ev-st-sub{display:flex;align-items:center;height:${r(40)};padding:0 ${r(14)};border-radius:${r(8)};background:var(--btn);color:#fff;font-size:${r(15)};font-weight:500}
.ev-st-cover{width:100%;height:${r(124)};object-fit:cover}
.ev-st-av{width:${r(124)};height:${r(124)};margin-top:${r(-62)};box-sizing:border-box;border:${r(4)} solid var(--bg);border-radius:50%;object-fit:cover}
.ev-st-name{margin-top:${r(12)};font-size:${r(20)};font-weight:600;line-height:1.3;letter-spacing:-.01em}
.ev-st-handle{margin-top:${r(2)};color:var(--mute)}
.ev-st-bio{max-width:88%;margin-top:${r(14)};color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev-st-social{display:flex;gap:${r(12)};margin-top:${r(14)};color:var(--mute)}
.ev-st-social svg{width:${r(18)};height:${r(18)};fill:currentColor}
.ev-st-social .ev-st-line{fill:none;stroke:currentColor;stroke-width:2}
.ev-st-social .ev-st-fill{fill:currentColor;stroke:none}
.ev-st-tabs{display:grid;grid-template-columns:repeat(3,1fr);align-self:stretch;margin:${r(24)} ${r(12)} 0;border-bottom:1px solid var(--line);color:var(--mute)}
.ev-st-tabs span{padding-bottom:${r(14)}}
.ev-st-tabs span[data-on]{color:var(--ink);font-weight:500;box-shadow:inset 0 ${r(-2)} 0 currentColor}
.ev-st-grid{display:grid;grid-template-columns:1fr 1fr;gap:${r(12)};align-self:stretch;margin:${r(16)} ${r(12)} 0;text-align:left}
.ev-st-prod{display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid var(--card-line);border-radius:calc(var(--rad) * var(--r));background:var(--card);color:var(--card-ink)}
.ev-st-img{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;background:var(--badge)}
.ev-st-body{display:flex;flex-direction:column;flex:1;padding:${r(14)}}
.ev-st-row{display:flex;align-items:flex-start;justify-content:space-between;gap:${r(6)}}
.ev-st-pn{flex:1;min-width:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:${r(16)};font-weight:500;line-height:1.25}
.ev-st-badge{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:${r(2)} ${r(7)};border-radius:${r(6)};background:var(--badge);color:var(--badge-ink);font-size:${r(11.5)};font-weight:500;line-height:1.4}
.ev-st-pp{margin-top:auto;padding-top:${r(14)};font-size:${r(15)};font-weight:600}

${GLOBE_CSS()}

/*
  4. Support (wave 13's card, landing round 4): three threads stacked in the
  middle of the card, each on the same ${TURN * 3}s clock and a third of it
  later than the one before. In its third a thread rises in, the question
  arrives, the other side types, the answer arrives; then it fades up and
  out as the next one rises.
*/
.ev-c{background:#eef0f2;container-type:inline-size}
.ev-c-thread{position:absolute;left:50%;top:50%;width:min(80%,430px);padding:18px 18px 20px;box-sizing:border-box;border-radius:16px;background:#fff;box-shadow:0 24px 48px -30px rgba(20,24,40,.4),0 1px 3px rgba(20,24,40,.07);opacity:0;transform:translate3d(-50%,-46%,0) scale(.97);animation:ev-thread ${TURN * 3}s ${EASE} infinite;animation-delay:calc(var(--k,0) * ${TURN}s)}
.ev-c-thread .ev-c-q,.ev-c-thread .ev-c-r,.ev-c-thread .ev-c-typing{animation-delay:calc(var(--k,0) * ${TURN}s)}
.ev-c-head{display:flex;flex-direction:column;gap:2px;margin:0 0 14px;font-size:14px;font-weight:600;color:#18181b}
.ev-c-sub{font-size:12.5px;font-weight:400;color:#7c7a84}
.ev-c-msg{display:flex;align-items:flex-end;gap:8px;margin-top:10px}
.ev-c-bubble{flex:1 1 auto;margin:0;padding:11px 13px;border-radius:12px;font-size:13.5px;line-height:1.42}
.ev-c-light{background:#f0eff2;color:#18181b}
.ev-c-dark{background:#111113;color:#fff}
.ev-c-av{display:block;flex:none;width:24px;height:24px;border-radius:7px;object-fit:cover}
.ev-c-slot{position:relative}
.ev-c-q{opacity:0;transform:translate3d(0,10px,0);animation:ev-q ${TURN * 3}s ${EASE} infinite}
.ev-c-r{opacity:0;transform:translate3d(0,10px,0);animation:ev-r ${TURN * 3}s ${EASE} infinite}
.ev-c-typing{position:absolute;left:0;top:10px;display:flex;gap:4px;padding:11px 13px;border-radius:12px;background:#111113;opacity:0;animation:ev-typing ${TURN * 3}s ease infinite}
.ev-c-dot{width:6px;height:6px;border-radius:99px;background:#fff;opacity:.5;animation:ev-dot 1.1s ease-in-out infinite}
.ev-c-dot:nth-child(2){animation-delay:.15s}
.ev-c-dot:nth-child(3){animation-delay:.3s}
@keyframes ev-thread{0%{opacity:0;transform:translate3d(-50%,-46%,0) scale(.97)}2.5%,30.5%{opacity:1;transform:translate3d(-50%,-50%,0)}33.3%,100%{opacity:0;transform:translate3d(-50%,-54%,0) scale(.98)}}
@keyframes ev-q{0%,1%{opacity:0;transform:translate3d(0,10px,0)}4%,100%{opacity:1;transform:none}}
@keyframes ev-typing{0%,6%{opacity:0}7.5%,13.5%{opacity:1}14.5%,100%{opacity:0}}
@keyframes ev-r{0%,14%{opacity:0;transform:translate3d(0,10px,0)}16.5%,100%{opacity:1;transform:none}}
@keyframes ev-dot{0%,100%{opacity:.35;transform:translate3d(0,0,0)}50%{opacity:1;transform:translate3d(0,-3px,0)}}
@container (max-width:480px){
  .ev-c-thread{width:90%;padding:14px 14px 16px}
  .ev-c-bubble{font-size:12.5px;padding:9px 11px}
  .ev-c-head{font-size:13px;margin-bottom:10px}
  .ev-c-sub{font-size:11.5px}
}

@media(prefers-reduced-motion:reduce){
  .ev-card,.ev-p-bg,.ev-p-img,.ev-p-rise,.ev-tab,.ev-tab::before,.ev-globe-pill-in{transition:none !important}
  .ev-card{opacity:1;transform:none}
  .ev-loop,.ev-tab[data-on] .ev-tab-fill,.ev-p-bg{animation:none !important}
  .ev-tab-fill{display:none}
  .ev-c-typing{display:none}
  .ev-c-thread:first-child{opacity:1;transform:translate3d(-50%,-50%,0)}
  .ev-c-thread:first-child .ev-c-q,.ev-c-thread:first-child .ev-c-r{opacity:1;transform:none}
}
@media(scripting:none){.ev-card{opacity:1;transform:none}}
`

/** The globe card's styles (unchanged by this round). */
function GLOBE_CSS() {
  return `/* 3. Globe */
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
.ev-globe-price{font-weight:600;font-variant-numeric:tabular-nums}`
}

/** The section's stylesheet, put in <head> ahead of it while the browser is idle (lazy-sections.tsx). */
export const EVERYTHING_STYLES: readonly SectionStyle[] = [{ href: "w13-everything", precedence: "w13-home", css: CSS }]
