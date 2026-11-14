"use client"

/*
  HOME SECTION 3: "MAKE THE WORK. SKIP THE BUSYWORK." (wave 13)

  Four cards in a two by two grid, laid out the way the owner's reference
  does it: a wide card and a narrower one, then a narrower one and a wide
  one. Each is one big picture with a caption under it, a bold lead sentence
  and a grey continuation. Every picture is Storelib's own, with believable
  products and numbers:

    1. Sell anything you make: a product card that slides through merch, a
       LUT pack, a course and a community page, the calm colour behind it
       changing with each; the tabs pick one, and it plays by itself while
       on screen. Under a mouse the white card leans away from the pointer,
       as if pressed, and springs back when the pointer leaves.
    2. A store that looks like you: creator stores drawn the way a phone
       shows a real Storelib creator page (the newsletter bar, the cover, the
       round photo, name, handle, bio and social icons, Home / Products /
       Communities, Featured and the product cards), each in one of the
       store's real colour schemes (lib/store-builder/defaults themePresets),
       and between them real OnePages as a phone shows them (captures of live
       pages, no address bar), drifting past without a stop. Pictures only:
       nothing in the strip can be hovered, clicked or selected.
    3. Sell anywhere in the world: a globe the visitor can spin, with orders
       arcing to buyers in currencies checkout charges in.
    4. Real support: the Support page of /app (app/(storelib)/app/support),
       its two inboxes, From buyers and Storelib, and a request thread as it
       really reads there: the subject, the topic, the status pill, "You" on
       the right and the other side on the left. Three requests take turns.

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

export const EVERYTHING_HEADING = { lead: "Make the work.", rest: "Skip the busywork." } as const

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

function Img({ src, w, h, className }: { src: string; w: number; h: number; className?: string }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img className={className} src={src} alt="" width={w} height={h} loading="lazy" decoding="async" draggable={false} />
}

/** A Storelib community page, small: the top bar, the places, the composer and the newest post. */
function CommunityPage({ s }: { s: Slide }) {
  return (
    <span className="ev-cm">
      <span className="ev-cm-top">
        <Img className="ev-cm-mark" src={s.img} w={s.w} h={s.h} />
        <span className="ev-cm-name">{s.name}</span>
        <Img className="ev-cm-me" src={`${ST}/sol-av.webp`} w={200} h={200} />
      </span>
      <span className="ev-cm-tabs">
        <span data-on="">Community</span>
        <span>Calendar</span>
        <span>Members</span>
        <span>About</span>
      </span>
      <span className="ev-cm-feed">
        <span className="ev-cm-compose">
          <Img className="ev-cm-av" src={`${ST}/sol-av.webp`} w={200} h={200} />
          Share something...
        </span>
        <span className="ev-cm-post">
          <span className="ev-cm-by">
            <Img className="ev-cm-av" src={`${ST}/theo-av.webp`} w={200} h={200} />
            <span className="ev-cm-who">
              <b>Jonas Weber</b>
              <i>2h · Long runs</i>
            </span>
          </span>
          <span className="ev-cm-t">Sunday long run, 14 km from the pier</span>
          <span className="ev-cm-x">Easy pace, coffee after. We meet at 8:00 by the boathouse.</span>
          <span className="ev-cm-foot">
            <span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
              </svg>
              24
            </span>
            <span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l.9-4.3A8 8 0 1 1 20 12Z" />
              </svg>
              9
            </span>
          </span>
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
          <span className="ev-p-lesson-t">Lesson 3 · Centering</span>
        </span>
        <span className="ev-p-progress" />
      </>
    )
  if (s.kind === "community") return <CommunityPage s={s} />
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
type StoreProduct = { src: string; name: string; badge: string; price: string; rating?: string }
type Storefront = {
  key: string
  name: string
  handle: string
  bio: string
  cover: string
  avatar: string
  /** The store's colour scheme, by its name in themePresets. */
  scheme: "clay" | "astrid" | "default" | "harbor" | "sage" | "cream"
  products: [StoreProduct, StoreProduct]
}

export const EVERYTHING_STORES: readonly Storefront[] = [
  {
    key: "kiln",
    name: "Kiln & Clay",
    handle: "@kilnandclay",
    bio: "Stoneware and wheel classes in Leeds",
    cover: `${ST}/kiln-cover.webp`,
    avatar: `${ST}/kiln-av.webp`,
    scheme: "clay",
    products: [
      { src: `${ST}/kiln-bowls.webp`, name: "Speckled Bowls", badge: "Physical", price: "$64.00", rating: "4.9" },
      { src: `${ST}/kiln-course.webp`, name: "Wheel Throwing Basics", badge: "Course", price: "$129.00", rating: "5.0" },
    ],
  },
  {
    key: "lumen",
    name: "Lumen Harbor",
    handle: "@lumenharbor",
    bio: "Indie band from Bristol",
    cover: `${ST}/lumen-cover.webp`,
    avatar: `${ST}/lumen-av.webp`,
    scheme: "astrid",
    products: [
      { src: `${ST}/lumen-lp.webp`, name: "Night Swim LP", badge: "Physical", price: "$28.00", rating: "5.0" },
      { src: `${ST}/lumen-tee.webp`, name: "Tour Tee 2026", badge: "Physical", price: "$32.00", rating: "4.8" },
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
      { src: `${ST}/mila-course.webp`, name: "Botanical Sketching", badge: "Course", price: "$49.00", rating: "4.9" },
      { src: `${ST}/mila-brushes.webp`, name: "Gouache Brush Pack", badge: "Digital", price: "$18.00", rating: "5.0" },
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
      { src: `${ST}/north-cap.webp`, name: "Ridge Cap", badge: "Physical", price: "$28.00", rating: "4.9" },
      { src: `${ST}/north-hoodie.webp`, name: "Trail Hoodie", badge: "Physical", price: "$64.00", rating: "4.8" },
    ],
  },
  {
    key: "sol",
    name: "Sol & Sage",
    handle: "@solandsage",
    bio: "Home cooking and good bread",
    cover: `${ST}/sol-cover.webp`,
    avatar: `${ST}/sol-av.webp`,
    scheme: "sage",
    products: [
      { src: `${ST}/sol-guide.webp`, name: "Sourdough at Home", badge: "Digital", price: "$19.00", rating: "4.9" },
      { src: `${ST}/sol-club.webp`, name: "Bread Club", badge: "Community", price: "$8/month" },
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
      { src: `${ST}/theo-forest.webp`, name: "Pine Fog Print", badge: "Physical", price: "$45.00", rating: "5.0" },
      { src: `${ST}/theo-lake.webp`, name: "Lake Morning", badge: "Physical", price: "$45.00", rating: "4.9" },
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
      <span className="ev-st-h">Featured</span>
      <span className="ev-st-grid">
        {store.products.map((p) => (
          <span key={p.name} className="ev-st-prod">
            <Img className="ev-st-img" src={p.src} w={480} h={270} />
            <span className="ev-st-body">
              {p.rating ? (
                <span className="ev-st-rate">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.1l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 2.8Z" />
                  </svg>
                  {p.rating}
                </span>
              ) : null}
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
/** bg: the page's own ground, which fills the frame under a capture shorter than it. */
type OnePageShot = { key: string; onepage: string; w: number; h: number; bg: string }
const OP = "/home/onepage"
export const EVERYTHING_ONEPAGES: readonly OnePageShot[] = [
  { key: "op-kofi", onepage: `${OP}/op-kofi.webp`, w: 560, h: 1091, bg: "#07071c" },
  { key: "op-mariana", onepage: `${OP}/op-mariana.webp`, w: 560, h: 1091, bg: "#f1e9de" },
  { key: "op-lucia", onepage: `${OP}/op-lucia-phone.webp`, w: 720, h: 1280, bg: "#efeae0" },
  { key: "op-arjun", onepage: `${OP}/op-arjun.webp`, w: 560, h: 1091, bg: "#008080" },
]

/** The strip in the order it drifts: a store, a OnePage, a store, and on. */
export const EVERYTHING_STRIP: ReadonlyArray<Storefront | OnePageShot> = EVERYTHING_STORES.flatMap((store, i) =>
  i < EVERYTHING_ONEPAGES.length ? [store, EVERYTHING_ONEPAGES[i]] : [store],
)

function Storefronts() {
  /* The strip twice over: it drifts by one set's width and starts again where it looks the same. */
  const strip = [...EVERYTHING_STRIP, ...EVERYTHING_STRIP]
  return (
    <div className="ev-vis ev-s" aria-hidden="true" data-mock-still="">
      <div className="ev-s-track ev-loop">
        {strip.map((item, i) => (
          <div key={i} className="ev-s-slot">
            {"onepage" in item ? (
              <div className="ev-st ev-op" style={{ background: item.bg }}>
                <Img className="ev-op-img" src={item.onepage} w={item.w} h={item.h} />
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
  Landing round 2 (the owner: smoother, cleaner, accurate, one more
  example, on autoplay). The Support page of /app as it reads: the two
  inboxes (From buyers, Storelib), and a thread with its subject, its topic
  and when it opened, the status pill, the creator's own message on the
  right in the dark bubble ("You") and the other side's on the left. The
  pill turns as the answer arrives, with the statuses the page uses
  (lib/support/tickets and lib/support/cases STATUS_FOR_STORE). One
  request after another, each held about eight seconds; the clock is a CSS
  animation, so it stops with the section off screen, and under reduced
  motion it never runs and the inbox tabs switch by hand.

  Landing round 3 (the owner: no request about a payout that has not reached
  the bank, "we never have issues with the bank"): none of the three is
  about money. A creator bringing subscribers over from another tool, a
  buyer who cannot open a download, a creator's own domain.
*/
type Request = {
  inbox: "buyers" | "storelib"
  title: string
  sub: string
  /** The pill before the answer and after it. */
  pill: [{ label: string; tone: "blue" | "amber" | "gray" }, { label: string; tone: "blue" | "amber" | "gray" }]
  ask: { who: string; at: string; body: string; mine: boolean }
  answer: { who: string; at: string; body: string; mine: boolean }
}

export const EVERYTHING_SUPPORT: readonly Request[] = [
  {
    inbox: "storelib",
    title: "Moving my subscribers over",
    sub: "My account · Opened Nov 6",
    pill: [
      { label: "With Storelib", tone: "blue" },
      { label: "Your reply", tone: "amber" },
    ],
    ask: { who: "You", at: "9:41 AM", body: "I have 3,200 subscribers on another newsletter tool. Can I bring them to Storelib?", mine: true },
    answer: { who: "Storelib support", at: "9:58 AM", body: "Yes. Export them as a CSV with an Email column and import it under Contacts. Names and tags come with them, ready for your next email.", mine: false },
  },
  {
    inbox: "buyers",
    title: "I can't open what I bought",
    sub: "Order #4821 · Leah Moreno · Opened Nov 9",
    pill: [
      { label: "Your reply", tone: "amber" },
      { label: "Waiting on the buyer", tone: "gray" },
    ],
    ask: { who: "Leah Moreno", at: "8:12 PM", body: "The download link in my email won't open on my iPad. Could you send it again?", mine: false },
    answer: { who: "You", at: "8:20 PM", body: "Just sent a fresh link. Your files are also in your Storelib library, so you can download them again anytime.", mine: true },
  },
  {
    inbox: "storelib",
    title: "My domain says Not secure",
    sub: "My website · Opened Nov 11",
    pill: [
      { label: "With Storelib", tone: "blue" },
      { label: "Your reply", tone: "amber" },
    ],
    ask: { who: "You", at: "2:05 PM", body: "I connected shop.kilnandclay.com an hour ago and the browser still says Not secure.", mine: true },
    answer: { who: "Storelib support", at: "2:19 PM", body: "Your DNS is right. The certificate was still being issued and it's live now, so reload and you'll see the lock.", mine: false },
  },
]

/** One message: who and when over the bubble. The answer also holds the typing dots, in the bubble's place until it arrives. */
function Bubble({ m, answer }: { m: Request["ask"]; answer?: boolean }) {
  return (
    <li className={`ev-c-m ${m.mine ? "ev-c-mine" : "ev-c-theirs"} ${answer ? "ev-c-answer" : "ev-c-ask"}`}>
      <span className="ev-c-who ev-c-arrive ev-loop">
        {m.who} <span className="ev-c-at">· {m.at}</span>
      </span>
      <span className="ev-c-bw">
        {answer ? (
          <span className="ev-c-typing ev-loop">
            <span className="ev-c-dot ev-loop" />
            <span className="ev-c-dot ev-loop" />
            <span className="ev-c-dot ev-loop" />
          </span>
        ) : null}
        <span className="ev-c-b ev-c-arrive ev-loop">{m.body}</span>
      </span>
    </li>
  )
}

function Support() {
  const [active, setActive] = useState(0)
  const n = EVERYTHING_SUPPORT.length
  const next = useCallback(() => setActive((a) => (a + 1) % n), [n])
  const inbox = EVERYTHING_SUPPORT[active].inbox
  const open = (to: "buyers" | "storelib") => {
    if (to === inbox) return
    const i = EVERYTHING_SUPPORT.findIndex((r, j) => r.inbox === to && j !== active)
    if (i >= 0) setActive(i)
  }
  return (
    <div className="ev-vis ev-c">
      <div className="ev-c-box">
        <div className="ev-c-tabs" role="group" aria-label="Support inboxes">
          <button type="button" className="ev-c-tab" aria-pressed={inbox === "buyers"} data-on={inbox === "buyers" || undefined} onClick={() => open("buyers")}>
            <span>From buyers</span>
          </button>
          <button type="button" className="ev-c-tab" aria-pressed={inbox === "storelib"} data-on={inbox === "storelib" || undefined} onClick={() => open("storelib")}>
            <span>Storelib</span>
          </button>
        </div>
        <div className="ev-c-stack" aria-hidden="true">
          {EVERYTHING_SUPPORT.map((r, i) => (
            <section key={r.title} className="ev-c-thread" data-on={i === active || undefined} data-inbox={r.inbox}>
              <div className="ev-c-head">
                <span className="ev-c-ht">
                  <span className="ev-c-title">{r.title}</span>
                  <span className="ev-c-sub">{r.sub}</span>
                </span>
                <span className="ev-c-pills">
                  <span className={`ev-c-pill ev-c-${r.pill[0].tone} ev-c-before ev-loop`}>{r.pill[0].label}</span>
                  <span className={`ev-c-pill ev-c-${r.pill[1].tone} ev-c-after ev-loop`}>{r.pill[1].label}</span>
                </span>
              </div>
              <ol className="ev-c-msgs">
                <Bubble m={r.ask} />
                <Bubble m={r.answer} answer />
              </ol>
            </section>
          ))}
        </div>
        <span key={active} className="ev-c-clock ev-loop" aria-hidden="true" onAnimationEnd={next} />
      </div>
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
/** n of the storefront's own pixels (one --r), for the store cards drawn at a phone's 390px. */
const r = (n: number) => `calc(${n} * var(--r))`
/** n pixels of the 260px community page drawn in the product tile. */
const q = (n: number) => `calc(${n} * var(--q))`
/* One support request's turn, in seconds, and when in it each part arrives. */
const TURN = 8
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

/* 1. Product slides: a calm, plain colour behind each product (landing round: no purple gradients), the product on a light grey tile */
.ev-p{background:#d9d5ce}
.ev-p-bg{position:absolute;inset:0;opacity:0;transition:opacity 1s cubic-bezier(.4,0,.2,1)}
.ev-p-bg[data-on]{opacity:1}
.ev-p-bg0{background:linear-gradient(180deg,#e2ded8,#d4cfc7)}
.ev-p-bg1{background:linear-gradient(180deg,#e3e1d6,#d3d2c3)}
.ev-p-bg2{background:linear-gradient(180deg,#e6ddd3,#d6cabd)}
.ev-p-bg3{background:linear-gradient(180deg,#dfe3e4,#ccd3d6)}
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

/* The community page in the tile (components/community/member: the white top bar, the places, the grey feed with its cards), drawn at 260px and scaled to the tile. */
.ev-p-community{--q:calc(100cqw / 260);background:#f8f9fa}
.ev-cm{position:absolute;inset:0;display:flex;flex-direction:column;color:#1a1a2e;font-size:${q(12)};line-height:1.3;text-align:left}
.ev-cm-top{display:flex;align-items:center;gap:${q(8)};height:${q(46)};padding:0 ${q(12)};background:#fff}
.ev-cm-mark{display:block;width:${q(26)};height:${q(26)};border-radius:${q(7)};object-fit:cover}
.ev-cm-name{flex:1;min-width:0;font-size:${q(13.5)};font-weight:600;letter-spacing:-.005em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev-cm-me{display:block;width:${q(24)};height:${q(24)};border-radius:50%;object-fit:cover}
.ev-cm-tabs{display:flex;gap:${q(14)};padding:0 ${q(12)};background:#fff;border-bottom:1px solid #e6e8ec;font-size:${q(11.5)};color:#6b7280}
.ev-cm-tabs span{padding:${q(7)} 0 ${q(8)}}
.ev-cm-tabs span[data-on]{color:#1a1a2e;font-weight:600;box-shadow:inset 0 ${q(-2)} 0 #1a1a2e}
.ev-cm-feed{display:flex;flex-direction:column;gap:${q(8)};padding:${q(10)}}
.ev-cm-compose{display:flex;align-items:center;gap:${q(8)};height:${q(40)};padding:0 ${q(10)};border:1px solid rgba(229,231,235,.8);border-radius:${q(13)};background:#fff;font-size:${q(11.5)};color:#9ca3af}
.ev-cm-av{display:block;flex:none;width:${q(24)};height:${q(24)};border-radius:50%;object-fit:cover}
.ev-cm-post{display:flex;flex-direction:column;padding:${q(12)} ${q(12)} ${q(10)};border:1px solid rgba(229,231,235,.8);border-radius:${q(13)};background:#fff}
.ev-cm-by{display:flex;align-items:center;gap:${q(8)}}
.ev-cm-by .ev-cm-av{width:${q(28)};height:${q(28)}}
.ev-cm-who{display:flex;flex-direction:column;min-width:0}
.ev-cm-who b{font-size:${q(11.5)};font-weight:600}
.ev-cm-who i{font-size:${q(10)};font-style:normal;color:#6b7280}
.ev-cm-t{margin-top:${q(9)};font-size:${q(13)};font-weight:600;line-height:1.3;letter-spacing:-.005em}
.ev-cm-x{margin-top:${q(3)};font-size:${q(11)};line-height:1.5;color:#4b5563}
.ev-cm-foot{display:flex;gap:${q(14)};margin-top:${q(9)};font-size:${q(10.5)};color:#6b7280}
.ev-cm-foot span{display:flex;align-items:center;gap:${q(4)}}
.ev-cm-foot svg{width:${q(13)};height:${q(13)};fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round}

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
  2. Storefronts (landing round): the stores twice over in one row, moved by
  one set's width in a single linear animation, so the drift never stops or
  steps and the compositor plays it alone. Paused off screen like every loop.
  Each store is a creator page at a phone's 390px: --r is one of its pixels.
*/
.ev-s{background:#edece8;container-type:inline-size;pointer-events:none;user-select:none;-webkit-user-select:none}
.ev-s-track{--slot:37cqw;position:absolute;top:24px;bottom:0;left:0;display:flex;width:max-content;animation:ev-stores 100s linear infinite}
@container (max-width:400px){.ev-s-track{--slot:46cqw;top:18px}}
.ev-s-slot{flex:none;width:var(--slot);height:100%;padding:0 6px;box-sizing:border-box}
@keyframes ev-stores{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
.ev-st{--r:calc((var(--slot) - 12px) / 390);--bg:#ffffff;--ink:#000;--mute:#6b7280;--line:#e5e7eb;--field:#d1d5db;--card:#fff;--card-ink:#2d3034;--card-line:#e5e7eb;--badge:#f3f4f6;--badge-ink:#374151;--btn:#2563eb;--rad:8;position:relative;display:flex;flex-direction:column;align-items:center;min-height:calc(100% + 40px);overflow:hidden;border-radius:${r(20)} ${r(20)} 0 0;background:var(--bg);color:var(--ink);font-size:${r(15)};line-height:1.35;text-align:center;box-shadow:0 18px 36px -26px rgba(30,24,16,.4),0 0 0 1px rgba(30,24,16,.07)}
.ev-st-clay{--bg:#f5eee8;--ink:#2a1c15;--mute:#7b675b;--line:#e6d8cc;--field:#dccbbd;--card-ink:#2a1c15;--card-line:#e6d8cc;--badge:#f3ece6;--badge-ink:#5c4537;--btn:#a4492a}
.ev-st-astrid{--bg:#111113;--ink:#fafafa;--mute:#a1a1aa;--line:#2e3136;--field:#3a3d43;--card:#1c1e22;--card-ink:#fafafa;--card-line:#2e3136;--badge:#3a3c40;--badge-ink:#e4e4e7;--btn:#2563eb;--rad:10}
.ev-st-harbor{--bg:#ecf1f5;--ink:#0f1e2c;--mute:#566778;--line:#d4dde6;--field:#c6d2dd;--card-ink:#0f1e2c;--card-line:#d4dde6;--badge:#edf1f5;--badge-ink:#1f4b6e;--btn:#1f4b6e}
.ev-st-sage{--bg:#eef1ea;--ink:#1b2620;--mute:#5b6a60;--line:#d9e0d2;--field:#cbd4c3;--card-ink:#1b2620;--card-line:#d9e0d2;--badge:#eef1ea;--badge-ink:#2f5d46;--btn:#2f5d46}
.ev-st-cream{--bg:#faf4e8;--ink:#1d1a14;--mute:#7c6a4c;--line:#e8dfc9;--field:#ddd1b6;--card-ink:#1d1a14;--card-line:#e8dfc9;--badge:#f6efe0;--badge-ink:#896d34;--btn:#896d34}
.ev-st img{display:block;flex:none}
/* A OnePage between the stores: the capture of a live page, whole, in the same frame. Nothing over it. */
.ev-op-img{width:100%;height:auto}
.ev-st-bar{display:flex;align-items:center;gap:${r(8)};align-self:stretch;height:${r(60)};padding:0 ${r(12)};box-sizing:border-box}
.ev-st-bar-av{width:${r(32)};height:${r(32)};border-radius:50%;object-fit:cover}
.ev-st-email{flex:1;min-width:0;display:flex;align-items:center;height:${r(40)};padding:0 ${r(12)};box-sizing:border-box;border:1px solid var(--field);border-radius:${r(8)};font-size:${r(16)};color:var(--mute);text-align:left}
.ev-st-sub{display:flex;align-items:center;height:${r(40)};padding:0 ${r(14)};border-radius:${r(8)};background:var(--btn);color:#fff;font-size:${r(15)};font-weight:500}
.ev-st-cover{width:100%;height:${r(160)};object-fit:cover}
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
.ev-st-h{align-self:flex-start;margin:${r(26)} ${r(12)} 0;font-size:${r(20)};font-weight:600;letter-spacing:-.01em}
.ev-st-grid{display:grid;grid-template-columns:1fr 1fr;gap:${r(12)};align-self:stretch;margin:${r(14)} ${r(12)} 0;text-align:left}
.ev-st-prod{display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid var(--card-line);border-radius:calc(var(--rad) * var(--r));background:var(--card);color:var(--card-ink)}
.ev-st-img{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;background:var(--badge)}
.ev-st-body{display:flex;flex-direction:column;flex:1;padding:${r(14)}}
.ev-st-rate{display:flex;align-items:center;gap:${r(4)};margin-bottom:${r(8)};font-size:${r(13)};color:var(--mute)}
.ev-st-rate svg{width:${r(14)};height:${r(14)};fill:var(--card-ink)}
.ev-st-row{display:flex;align-items:flex-start;justify-content:space-between;gap:${r(6)}}
.ev-st-pn{flex:1;min-width:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:${r(16)};font-weight:500;line-height:1.25}
.ev-st-badge{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:${r(2)} ${r(7)};border-radius:${r(6)};background:var(--badge);color:var(--badge-ink);font-size:${r(11.5)};font-weight:500;line-height:1.4}
.ev-st-pp{margin-top:auto;padding-top:${r(14)};font-size:${r(15)};font-weight:600}

${GLOBE_CSS()}

/*
  4. Support (landing round 2): the Support page's inbox switch and one
  thread at a time, the threads stacked in one cell so the box never
  changes height. Each turn: the question is there, the other side types,
  the answer arrives and the pill turns. A thread coming in rises a little
  and fades in; the one leaving fades.
*/
.ev-c{background:#eef0f2;container-type:inline-size}
.ev-c-box{position:absolute;left:50%;top:50%;display:flex;flex-direction:column;align-items:flex-start;gap:12px;width:min(86%,452px);transform:translate(-50%,-50%)}
.ev-c-tabs{display:inline-flex;padding:4px;border-radius:11px;background:#e2e5e9}
.ev-c-tab{position:relative;height:30px;padding:0 13px;border:0;border-radius:8px;background:transparent;color:#6b7280;font-family:inherit;font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .3s ease}
.ev-c-tab::before{content:"";position:absolute;inset:0;border-radius:inherit;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.08);opacity:0;transition:opacity .3s ease}
.ev-c-tab span{position:relative}
.ev-c-tab[data-on]{color:#1a1a2e}
.ev-c-tab[data-on]::before{opacity:1}
@media(hover:hover){.ev-c-tab:not([data-on]):hover{color:#1a1a2e}}
.ev-c-tab:focus-visible{outline:2px solid #1a1a2e;outline-offset:2px}
.ev-c-stack{display:grid;align-self:stretch}
.ev-c-thread{grid-area:1/1;min-width:0;overflow:hidden;border:1px solid rgba(229,231,235,.6);border-radius:15px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.04),0 22px 44px -32px rgba(20,24,40,.35);opacity:0;transform:translate(0,6px);transition:opacity .3s ease,transform .3s ease}
/* The leaving thread is gone (0.3s) before the next one rises in, so the two never show through each other. */
.ev-c-thread[data-on]{opacity:1;transform:none;transition:opacity .6s ease .3s,transform .9s ${EASE} .3s}
.ev-c-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px 13px;border-bottom:1px solid #f1f2f4}
.ev-c-ht{display:flex;flex-direction:column;min-width:0}
.ev-c-title{font-size:15px;font-weight:600;line-height:1.3;color:#1a1a2e}
.ev-c-sub{margin-top:2px;font-size:12.5px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev-c-pills{display:grid;flex:none;justify-items:end}
.ev-c-pill{grid-area:1/1;display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500;line-height:16px;white-space:nowrap}
.ev-c-blue{background:#e0e7ff;color:#3730a3}
.ev-c-amber{background:#fef3c7;color:#92400e}
.ev-c-gray{background:#f1f2f4;color:#4b5563}
.ev-c-before{opacity:0}
.ev-c-msgs{position:relative;margin:0;padding:14px 16px 16px;list-style:none}
.ev-c-m{display:flex;flex-direction:column;align-items:flex-start;max-width:86%}
.ev-c-m + .ev-c-m{margin-top:12px}
.ev-c-mine{align-items:flex-end;margin-left:auto}
.ev-c-who{margin:0 4px 4px;font-size:12px;font-weight:500;color:#6b7280}
.ev-c-at{font-weight:400;color:#9ca3af}
.ev-c-bw{display:grid;max-width:100%}
.ev-c-mine .ev-c-bw{justify-items:end}
.ev-c-b{grid-area:1/1;display:block;padding:9px 13px;border-radius:16px;font-size:13.5px;line-height:20px;text-align:left}
.ev-c-theirs .ev-c-b{border-top-left-radius:6px;background:#f3f4f6;color:#1a1a2e}
.ev-c-mine .ev-c-b{border-top-right-radius:6px;background:#1a1a2e;color:#fff}
.ev-c-typing{grid-area:1/1;align-self:start;justify-self:start;display:flex;gap:4px;padding:12px 13px;border-radius:16px;border-top-left-radius:6px;background:#f3f4f6;opacity:0}
.ev-c-mine .ev-c-typing{justify-self:end;border-top-left-radius:16px;border-top-right-radius:6px;background:#1a1a2e}
.ev-c-dot{width:6px;height:6px;border-radius:99px;background:#9ca3af;animation:ev-dot 1.1s ease-in-out infinite}
.ev-c-mine .ev-c-dot{background:rgba(255,255,255,.7)}
.ev-c-dot:nth-child(2){animation-delay:.15s}
.ev-c-dot:nth-child(3){animation-delay:.3s}
.ev-c-clock{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;animation:ev-clock ${TURN}s linear both}
/* Inside the thread on show: the question rises in, the other side types, the answer arrives, the pill turns. Off show, everything simply stands (base styles), so a leaving thread fades whole. */
.ev-c-thread[data-on] .ev-c-ask .ev-c-arrive{animation:ev-c-in .7s ${EASE} .45s both}
.ev-c-thread[data-on] .ev-c-typing{animation:ev-c-typing 2.3s ease 1.25s both}
.ev-c-thread[data-on] .ev-c-answer .ev-c-arrive{animation:ev-c-in .7s ${EASE} 3.35s both}
.ev-c-thread[data-on] .ev-c-before{animation:ev-c-pill-out .4s ease 3.45s both}
.ev-c-thread[data-on] .ev-c-after{animation:ev-c-pill-in .45s ease 3.45s both}
@keyframes ev-clock{from{opacity:0}to{opacity:0}}
@keyframes ev-c-in{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:none}}
@keyframes ev-c-typing{0%{opacity:0;transform:translate3d(0,6px,0)}14%,88%{opacity:1;transform:none}100%{opacity:0;transform:none}}
@keyframes ev-c-pill-out{from{opacity:1}to{opacity:0}}
@keyframes ev-c-pill-in{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes ev-dot{0%,100%{opacity:.45;transform:translate3d(0,0,0)}50%{opacity:1;transform:translate3d(0,-2px,0)}}
/* Compact wherever the card is narrow (a phone, and the two column grid on a tablet or small laptop), so the thread always fits the card. */
@container (max-width:560px){
  .ev-c-box{width:92%;gap:8px}
  .ev-c-tabs{padding:3px;border-radius:10px}
  .ev-c-tab{height:26px;padding:0 10px;border-radius:7px;font-size:12px}
  .ev-c-head{gap:8px;padding:10px 12px 9px}
  .ev-c-title{font-size:13.5px}
  .ev-c-sub{font-size:11px}
  .ev-c-pill{padding:2px 7px;font-size:10.5px;line-height:15px}
  .ev-c-msgs{padding:10px 12px 12px}
  .ev-c-m{max-width:90%}
  .ev-c-m + .ev-c-m{margin-top:8px}
  .ev-c-who{margin-bottom:3px;font-size:10.5px}
  .ev-c-b{padding:7px 10px;border-radius:14px;font-size:12px;line-height:17px}
  .ev-c-typing{padding:9px 10px}
}
@container (max-width:340px){
  .ev-c-box{gap:6px}
  .ev-c-head{padding:9px 10px 8px}
  .ev-c-msgs{padding:8px 10px 10px}
  .ev-c-b{font-size:11.5px;line-height:16px}
}

@media(prefers-reduced-motion:reduce){
  .ev-card,.ev-p-bg,.ev-p-img,.ev-p-rise,.ev-tab,.ev-tab::before,.ev-globe-pill-in,.ev-c-thread,.ev-c-tab,.ev-c-tab::before{transition:none !important}
  .ev-card{opacity:1;transform:none}
  .ev-loop,.ev-tab[data-on] .ev-tab-fill{animation:none !important}
  .ev-tab-fill{display:none}
  .ev-c-typing{display:none}
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
