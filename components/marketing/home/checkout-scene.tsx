"use client"

/**
 * ===========================================================================
 *  CHECKOUT THAT TURNS A TAP INTO A SALE (home, section 9, landing round 10)
 * ===========================================================================
 * Black, with a dot grid so faint it reads as texture. Round 9, in the
 * owner's order:
 *
 *   1. the phone     comes first and alone: a big iPhone showing Storelib's
 *                    real full page checkout (/checkout), centred, with no
 *                    headline over it yet
 *   2. the products  what a creator sells, going round the phone on a ring:
 *                    a tee, a cap and a beanie (photographs with their grounds
 *                    cut away) and digital products drawn as objects (the
 *                    Cine Tones LUT Pack's box, an e-book, a course card, a
 *                    Notion template). Round 11: the ring is its own 3D
 *                    space in a layer under the phone, set back so a product
 *                    swings out beside the phone and passes behind it, never
 *                    across its screen (see Orbit). The ring turns by itself, slowly
 *                    (paused off screen), and the page's scroll turns it a
 *                    little further
 *   3. the headline  the stage holds for about a screen (position: sticky,
 *                    the owner asked for it here). Over that hold the phone
 *                    comes down and a little smaller, and the headline's
 *                    words rise in above it: a scroll timeline of transform
 *                    and opacity, run by the compositor. Where scroll
 *                    timelines are missing nothing is held and the finished
 *                    scene is simply there
 *   4. the cards     scrolling on, four dark cards slide up over the phone,
 *                    one after another; on a phone they are a row to swipe
 *                    (native scroll snap). Each card's demo runs only while
 *                    that card is on screen. Then four plain facts under them
 *   5. behind them   round 10 (the owner: the products "should still be there
 *                    in the background, blurred and faded, rotating in 3D"):
 *                    the stage stays held behind the cards while they are on
 *                    screen. As they come up the ring steps back, fades to 45%
 *                    and goes soft (each product cross fades to a blurred
 *                    copy baked as a small picture, so nothing is blurred per
 *                    frame) and keeps turning in the gaps between and around
 *                    the cards. Round 12: the phone fades out whole as they
 *                    come, nothing of it is left behind them
 *
 * THE PHONE IS THE REAL PAGE. PageCheckout below is
 * app/(storelib)/checkout/checkout-client.tsx as a phone lays it out, at the
 * iPhone's own width (393px) and scaled to the drawn phone in one transform.
 *
 * WHAT IS SOLD (rounds 8 and 9, the owner): the Cine Tones LUT Pack
 * (ebook-cover.tsx, the cover "Sell what you make" shows) for the digital
 * product and one black t-shirt for the physical one, both Mara Quinn's.
 * Prices are examples.
 *
 * TRUE FIGURES. The desktop window is the website checkout as
 * app/(storelib)/checkout/site/site-checkout.tsx lays it out. The seller's
 * notice is the in-app sale notification (lib/notify/templates/catalog.ts).
 * The currencies are the ones fees are written for
 * (lib/payments/fees/currency-rules). The reminder is
 * lib/physical/email-templates checkoutReminderEmail's words
 * (lib/automations/abandoned.ts).
 */
import { StorelibLogo } from "@/components/brand/storelib-logo"
import type { SectionStyle } from "./lazy-section"
import { Fragment, useEffect, useRef } from "react"
import { COMMERCE_CURRENCY_COUNT, COMMERCE_KIT_STYLE, CommerceKitStyle, useCommerceLive } from "./commerce-kit"
import { EBOOK, EBOOK_COVER_CSS, EbookCover, LUT_STILL } from "./ebook-cover"
import { u } from "./showcase-mocks/frame"

const IMG = "/home/commerce"

/** The digital product: the Cine Tones LUT Pack, on the cover "Sell what you make" shows. */
export const LUTS = { title: EBOOK.title, author: EBOOK.author, price: "$29.00", kind: "LUT pack, download" } as const
/** Round 5's name for what the phone sells, kept so older imports still resolve. */
export const GUIDE = LUTS
/**
 * The physical product: one t-shirt. Unsplash photo-1618354691373-d851c5c3a990
 * (a black tee on a hanger, on white), cropped square for the order lines
 * (public/home/commerce/tee-thumb.webp).
 */
export const TEE = { title: "Midnight Studio Tee", option: "Black, M", price: "$32.00", img: `${IMG}/tee-thumb.webp` } as const
/** Round 5's name for the physical product, kept so older imports still resolve. */
export const PRINT = TEE
const SELLER = LUTS.author
/** Mara's photo: Unsplash photo-1438761681033-6461ffad8d80. */
const AVATAR = `${IMG}/creator-mara.webp`

export const CHECKOUT_HEADING = "Checkout that turns a tap into a sale"

/*
 * ── The products going round the phone ───────────────────────────────────
 * Round 9 (the owner: "physical products and digital products, not only
 * physical ones and random things like a camera or a plant"): what one
 * creator sells. Three photographs with their grounds cut away (a flood fill
 * from the edges): the black tee above, the cap "How it works" prints and
 * a beanie (round 12: totes are off the page; this is the 705 beanie the page
 * already has, public/home/sell-map/705-beanie.webp), cut out here as
 * obj-cap.webp and obj-beanie.webp. Four digital products drawn here as
 * objects: the LUT pack's box with the section's own cover, an e-book, a
 * course card and a Notion template. No frames, no shadows, no filters.
 *
 * `p` is where an object starts on the ring (0 to 1 of a turn), `y` its
 * height on it and `s` its width, both in units of the phone's width (--pw).
 * `m` is the same for a phone, where fewer and smaller objects are drawn;
 * without one the object is not drawn there.
 */
type Spot = { p: number; y: number; s: number }
type Thing = { id: string; kind: "physical" | "digital"; img?: { src: string; w: number; h: number }; ar: number; rz: number; d: Spot; m: Spot | null }
/* `ar` is an object's height over its width, `rz` its lean in degrees. */
export const FLOATS: readonly Thing[] = [
  { id: "tee", kind: "physical", img: { src: `${IMG}/obj-tee.webp`, w: 363, h: 520 }, ar: 520 / 363, rz: 4, d: { p: 0.06, y: -0.1, s: 0.5 }, m: { p: 0.1, y: -0.06, s: 0.3 } },
  { id: "luts", kind: "digital", ar: 0.92, rz: -6, d: { p: 0.2, y: 0.12, s: 0.42 }, m: { p: 0.3, y: 0.1, s: 0.25 } },
  { id: "cap", kind: "physical", img: { src: `${IMG}/obj-cap.webp`, w: 360, h: 231 }, ar: 231 / 360, rz: -8, d: { p: 0.35, y: -0.14, s: 0.5 }, m: { p: 0.5, y: -0.1, s: 0.3 } },
  { id: "course", kind: "digital", ar: 0.87, rz: 5, d: { p: 0.49, y: 0.1, s: 0.54 }, m: { p: 0.7, y: 0.08, s: 0.33 } },
  { id: "beanie", kind: "physical", img: { src: `${IMG}/obj-beanie.webp`, w: 288, h: 338 }, ar: 338 / 288, rz: 6, d: { p: 0.63, y: -0.08, s: 0.4 }, m: null },
  { id: "ebook", kind: "digital", ar: 4 / 3, rz: 7, d: { p: 0.77, y: 0.14, s: 0.34 }, m: { p: 0.9, y: 0.12, s: 0.21 } },
  { id: "notion", kind: "digital", ar: 0.84, rz: -4, d: { p: 0.91, y: -0.04, s: 0.42 }, m: null },
]
/*
 * The blurred copies (round 10): public/home/commerce/soft-<id>.webp, each
 * object's box with SOFT_PAD percent of its width spare on
 * every side, blurred, at a small size; scripts/bake-checkout-soft.mjs makes
 * them from the scene itself. A blurred picture drawn larger loses nothing.
 */
const SOFT_PAD = 20
const SOFT_W = 100 + 2 * SOFT_PAD
export const SOFT: Readonly<Record<string, { w: number; h: number }>> = {
  tee: { w: 112, h: 146 },
  luts: { w: 112, h: 106 },
  cap: { w: 112, h: 83 },
  course: { w: 112, h: 100 },
  beanie: { w: 112, h: 126 },
  ebook: { w: 112, h: 139 },
  notion: { w: 112, h: 94 },
}
/** One turn of the ring, in seconds. */
const TURN_S = 44
/** How far the page's scroll turns the ring over the scene, either way from rest, in degrees. */
const SCROLL_TURN = 26
/** The ring leans toward the viewer by this much (degrees), so a product in front passes low and one behind passes high. */
const TILT = 15

const CARDS = [
  {
    id: "convert",
    label: "Built to convert",
    title: "One page, then paid",
    body: "No account. Contact, delivery and payment on one page.",
  },
  {
    id: "tap",
    label: "One-tap payments",
    title: "Apple Pay and Google Pay, built in",
    body: "Their wallet comes first, cards sit beside it. All on Stripe.",
  },
  {
    id: "currency",
    label: "Local currencies",
    title: `Local in ${COMMERCE_CURRENCY_COUNT} currencies`,
    body: "Prices shown and charged in the visitor's own currency.",
  },
  {
    id: "recover",
    label: "Checkout reminders",
    title: "Bring back the ones who almost bought",
    body: "Left at Pay? A reminder goes out an hour later, if they asked for emails.",
  },
] as const
type CardId = (typeof CARDS)[number]["id"]

/** Four plain facts under the cards, each one true of checkout as it is. */
const FACTS = [
  ["1 page", "from the cart to paid"],
  ["1 tap", "with Apple Pay or Google Pay"],
  [`${COMMERCE_CURRENCY_COUNT} currencies`, "shown and charged"],
  ["1 hour", "until the reminder goes out"],
] as const

/** Where the finger presses in the One-tap demo's page (px of the 393 x 852 screen): Buy now, then Pay with Apple Pay. */
const IC_BUY_Y = 424
const IC_PAY_Y = 706
/** Where the checkout's window starts on the screen: below the creator's picture, so the page shows above it, dimmed. */
const IC_SHEET_TOP = 150
/** One demo, start to finish, in seconds. Every card's loop is this long. */
const LOOP_S = 10
/** A moment of the loop (seconds) as a keyframe offset. */
const at = (sec: number) => `${Math.round((sec / LOOP_S) * 10000) / 100}%`

/**
 * The cards' entrance, without scroll work. One observer watches the cards'
 * box. While it is wholly below the screen it is armed
 * (data-cmc-over-armed: the cards faint and low); once it crosses 88% of the
 * screen data-cmc-over is set and the cards play in as CSS transitions of
 * transform and opacity, on the compositor. A box already on screen when this
 * runs is never armed, so the cards are simply there. Scrolled back up past
 * it, it re-arms. Nothing is read or written per frame.
 *
 * Wave 17, touch screens (the owner's iPhone recording, round 9: "a dark
 * shade sweeps up over the phone"): the cards came up over the phone with
 * the page while still armed (opacity 0) and only began their 0.7s fade once
 * the observer reported, so a flick brought up their black ground empty, and
 * again on every pass down after a pass up (in Chromium at 4x CPU, 7 to 9
 * frames a pass with the box on screen and the cards under half opacity).
 * Round 10 took the ground away; the late fade stayed, now as empty space
 * where the cards should be. A finger already moves the cards up over the
 * phone, so on a touch screen nothing is armed and they are simply there. A
 * mouse keeps the entrance, as the sheet's rise does (scroll-reveal-panel.tsx).
 */
function useEntrances(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver !== "function") return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const cards = root.querySelector(".cmc-cards")
    if (!cards) return
    const arm = matchMedia("(hover: hover) and (pointer: fine)").matches
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (!arm || root.hasAttribute("data-cmc-over-armed")) root.setAttribute("data-cmc-over", "")
        } else if (e.boundingClientRect.top > 0 || e.boundingClientRect.height === 0) {
          /* Below the screen, or not laid out yet: the lazy box skips its content (content-visibility) until it is near, and the observer then reports an empty box at 0. */
          root.removeAttribute("data-cmc-over")
          if (arm) root.setAttribute("data-cmc-over-armed", "")
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    )
    io.observe(cards)
    return () => {
      io.disconnect()
      root.removeAttribute("data-cmc-over")
      root.removeAttribute("data-cmc-over-armed")
    }
  }, [rootRef])
}

/**
 * Round 12, the cost of the section (the owner: "the section must not cost
 * frames"; the page audit). Two attributes on the section, set by observers,
 * nothing per frame:
 *   data-cmc-near     the section is within half a screen of the screen; the
 *                     scroll timeline animations apply only then
 *   data-cmc-covered  the cards have come up half a screen past its top, so the
 *                     stage behind them shows only in the gaps, soft and at
 *                     45%: the ring's clock loops pause there (the scroll
 *                     still turns it), and run again as the cards go down
 * Without IntersectionObserver the section is simply near and never covered.
 */
function useNear(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (typeof IntersectionObserver !== "function") {
      root.setAttribute("data-cmc-near", "")
      return
    }
    const mark = root.querySelector(".cmc-cover-mark")
    /* One observer, two boxes, the same half screen of margin: the section (near or not) and the cards' top (covered once it is half a screen above the screen). */
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === root) root.toggleAttribute("data-cmc-near", e.isIntersecting)
          else root.toggleAttribute("data-cmc-covered", !e.isIntersecting && e.boundingClientRect.top < 0)
        }
      },
      { rootMargin: "50% 0px" },
    )
    io.observe(root)
    if (mark) io.observe(mark)
    return () => {
      io.disconnect()
      root.removeAttribute("data-cmc-near")
      root.removeAttribute("data-cmc-covered")
    }
  }, [rootRef])
}

/** A digital product as an object: the LUT pack's box, an e-book, a course card, a Notion template. */
function DigitalThing({ id }: { id: string }) {
  if (id === "luts")
    return (
      <span className="cmt cmt-box">
        <EbookCover />
      </span>
    )
  if (id === "ebook")
    return (
      <span className="cmt cmt-book">
        <span className="cmt-book-k">E-book</span>
        <span className="cmt-book-t">
          Color
          <br />
          Notes
        </span>
        <span className="cmt-book-s">A field guide to grading video</span>
        <span className="cmt-book-a">{SELLER}</span>
      </span>
    )
  if (id === "course")
    return (
      <span className="cmt cmt-course">
        <span className="cmt-course-pic">
          <img src={LUT_STILL} alt="" width={720} height={405} loading="lazy" decoding="async" />
          <span className="cmt-play">
            <svg viewBox="0 0 12 12" fill="currentColor">
              <path d="M3.4 1.6v8.8L10.4 6z" />
            </svg>
          </span>
        </span>
        <span className="cmt-course-t">Editing for Story</span>
        <span className="cmt-course-s">Course · 24 lessons</span>
        <span className="cmt-bar">
          <i />
        </span>
      </span>
    )
  return (
    <span className="cmt cmt-notion">
      <span className="cmt-notion-k">Notion template</span>
      <span className="cmt-notion-t">Shoot Planner</span>
      {["Scout the location", "Shot list", "Gear check", "Call sheet"].map((row, i) => (
        <span key={row} className="cmt-row" data-done={i < 2 || undefined}>
          <i />
          {row}
        </span>
      ))}
    </span>
  )
}

/**
 * The ring of products, behind the phone (round 11, the owner: "they should
 * not overlap the phone mockup", "more blurred as they go behind", "the orbit
 * wider"). The ring is a 3D space of its own, set back so its nearest point
 * is level with the phone, and drawn under it: a product swings out beside the
 * phone, sharp, and passes behind it, never across its screen. Each object is
 * one box that carries its place on the ring and a face that keeps it turned
 * to the viewer. In the face, the sharp object and its blurred copy cross
 * fade with depth (cmc-near / cmc-far, opacity only): sharp beside the phone,
 * soft as it goes round the back. A second copy (cmc-soft) comes up on the
 * scroll as the cards arrive, so behind them everything is soft.
 */
function Orbit() {
  return (
    <div className="cmc-ring" aria-hidden="true">
      <div className="cmc-orbit">
        {FLOATS.map((f) => (
          <span key={f.id} className="cmc-o" data-f={f.id} data-kind={f.kind} data-m={f.m ? "" : undefined}>
            <span className="cmc-face">
              <span className="cmc-sharp">
                <span className="cmc-near">{f.img ? <img className="cmc-pic" src={f.img.src} alt="" width={f.img.w} height={f.img.h} loading="lazy" decoding="async" /> : <DigitalThing id={f.id} />}</span>
              </span>
              <img className="cmc-far" src={`${IMG}/soft-${f.id}.webp`} alt="" width={SOFT[f.id].w} height={SOFT[f.id].h} loading="lazy" decoding="async" />
              <img className="cmc-soft" src={`${IMG}/soft-${f.id}.webp`} alt="" width={SOFT[f.id].w} height={SOFT[f.id].h} loading="lazy" decoding="async" />
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** The headline on two rows, each word its own box so the words can rise in one after another. */
const HEADING_ROWS = [CHECKOUT_HEADING.split(" ").slice(0, 3), CHECKOUT_HEADING.split(" ").slice(3)] as const

export function CheckoutScene() {
  const rootRef = useRef<HTMLElement>(null)
  /* The ring turns only while the stage is on screen in a visible tab (no React state: the attribute runs or pauses the CSS). */
  /* Wave 17: the ring wakes ahead of the screen, so on a phone its layers are painted before it scrolls in (it popped in on an iPhone). Round 12: half a screen ahead, not a whole one (the page audit). */
  const [stageRef] = useCommerceLive<HTMLDivElement>("50% 0px", false)
  useEntrances(rootRef)
  useNear(rootRef)

  return (
    <section ref={rootRef} className="cmc" data-story-section="checkout" aria-labelledby="cmc-title">
      <CommerceKitStyle />
      <style href="w13-ebook-cover" precedence="default">
        {EBOOK_COVER_CSS}
      </style>
      <style href="w12-commerce-checkout" precedence="default">
        {CHECKOUT_CSS}
      </style>
      <span className="cmc-dots" aria-hidden="true" />
      <div className="cmc-track">
        <div ref={stageRef} className="cmc-stage">
          <div className="cmc-copy">
            <h2 id="cmc-title" className="cmc-title">
              {HEADING_ROWS.map((row, r) => (
                <span key={r} className="cmc-row">
                  {row.map((w, i) => {
                    const n = r === 0 ? i : HEADING_ROWS[0].length + i
                    return (
                      <Fragment key={n}>
                        <span className="cmc-w" data-w={n}>
                          {w}
                        </span>
                        {i < row.length - 1 ? " " : null}
                      </Fragment>
                    )
                  })}
                  {r === 0 ? " " : null}
                </span>
              ))}
            </h2>
          </div>

          <Orbit />
          <div className="cmc-phone-wrap">
            <div className="cmc-world">
              <div className="cmc-rise">
                {/* The phone's shape in black, in the phone's own box under it: as the phone fades behind the cards no product shows through it, and it goes only once the phone is gone. */}
                <span className="cmc-shade" aria-hidden="true" />
                <Phone label={`Storelib's checkout page on a phone (an iPhone): ${LUTS.title} by ${SELLER}, ${LUTS.price}, with Apple Pay and Google Pay.`} />
              </div>
            </div>
          </div>
        </div>

        <div className="cmc-cards">
          {/* The cards' first card top: once it is past the screen's top the stage is covered (useNear). */}
          <span className="cmc-cover-mark" aria-hidden="true" />
          <div className="cmc-cards-in">
            <div className="cmc-bento">
              {CARDS.map((c, i) => (
                <Card key={c.id} id={c.id} i={i} />
              ))}
            </div>
            <ul className="cmc-facts">
              {FACTS.map(([b, s]) => (
                <li key={b} className="cmc-fact">
                  <b>{b}</b>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * One card: a label, a title, a line, and its demo. The demo's loop runs only
 * while this card is on screen in a visible tab (data-commerce-live, set by
 * its own observer, no React state), and starts over each time it comes back.
 */
function Card({ id, i }: { id: CardId; i: number }) {
  const [ref] = useCommerceLive<HTMLElement>("0px 0px", false)
  const c = CARDS.find((x) => x.id === id)!
  return (
    <article ref={ref} className="cmc-card" data-k={id} style={{ "--ci": i } as React.CSSProperties} aria-labelledby={`cmc-card-${id}`}>
      <div className="cmc-card-copy">
        <span className="cmc-card-l">{c.label}</span>
        <h3 id={`cmc-card-${id}`}>{c.title}</h3>
        <p>{c.body}</p>
      </div>
      <div className="cmc-vis" aria-hidden="true">
        <div className="cmc-vis-in">{id === "convert" ? <VisConvert /> : id === "tap" ? <VisTap /> : id === "currency" ? <VisCurrency /> : <VisRecover />}</div>
      </div>
    </article>
  )
}

/* ── The phone: a modern iPhone, its screen the real checkout ────────── */

/** The status bar and the Dynamic Island; the home indicator only on the light page (round 12: on the dark One-tap phone it read as a white bar at the screen's foot). */
function StatusBar({ home = true }: { home?: boolean }) {
  return (
    <>
      <div className="cmc-status">
        <span className="cmc-time">9:41</span>
        <span className="cmc-icons">
          <svg viewBox="0 0 18 12" width="1.06em" height="0.7em" fill="currentColor">
            <rect x="0" y="7.5" width="3.2" height="4.5" rx="1" />
            <rect x="4.9" y="5" width="3.2" height="7" rx="1" />
            <rect x="9.8" y="2.5" width="3.2" height="9.5" rx="1" />
            <rect x="14.7" y="0" width="3.2" height="12" rx="1" />
          </svg>
          <svg viewBox="0 0 16 12" width="0.96em" height="0.72em" fill="currentColor">
            <path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.3-1.3A10.3 10.3 0 0 0 8 .5 10.3 10.3 0 0 0 .7 3.5L2 4.8a8.5 8.5 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.3-1.3A6.6 6.6 0 0 0 8 4.1c-1.8 0-3.4.7-4.7 1.9l1.3 1.3C5.5 6.5 6.7 6 8 6Zm0 3.6c-.6 0-1.1.2-1.5.6L8 11.8l1.5-1.6c-.4-.4-.9-.6-1.5-.6Z" />
          </svg>
          <span className="cmc-batt">
            <span />
          </span>
        </span>
      </div>
      <span className="cmc-island" />
      {home ? <span className="cmc-home" /> : null}
    </>
  )
}

/** Safari's address bar on iOS, floating at the foot of the page. */
function SafariBar() {
  return (
    <div className="rc-safari">
      <span className="rc-sf-btn">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </span>
      <span className="rc-sf-url">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
        <span>storelib.com</span>
      </span>
      <span className="rc-sf-btn">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <circle cx="5.5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="18.5" cy="12" r="1.9" />
        </svg>
      </span>
    </div>
  )
}

/** The iPhone: titanium band, black border, Dynamic Island, and the checkout page under Safari's bars. With `pay`, the One-tap demo: a creator's dark page and its checkout sheet (InstantDemo). */
function Phone({ label, pay = false }: { label?: string; pay?: boolean }) {
  return (
    <div className="cmc-phone" role={label ? "img" : undefined} aria-label={label}>
      <span className="cmc-key cmc-key-act" />
      <span className="cmc-key cmc-key-up" />
      <span className="cmc-key cmc-key-dn" />
      <span className="cmc-key cmc-key-pw" />
      <div className="cmc-bezel">
        <div className="cmc-screen" data-dark={pay || undefined} aria-hidden="true" inert>
          <div className="cmc-ui" data-dark={pay || undefined}>
            {pay ? (
              <InstantDemo />
            ) : (
              <>
                <PageCheckout />
                <SafariBar />
              </>
            )}
            <StatusBar home={!pay} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ArrowLeft() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/** Checkout's white bar: Back, the creator, Continue shopping. */
function PageBar() {
  return (
    <div className="pc-bar">
      <span className="pc-back">
        <span className="pc-back-f">
          <ArrowLeft />
        </span>
      </span>
      <span className="pc-who">
        <img className="pc-av" src={AVATAR} alt="" width={28} height={28} />
        <span>{SELLER}</span>
      </span>
      <span className="pc-cont">Continue shopping</span>
    </div>
  )
}

function PaymentNote() {
  return (
    <p className="rc-pow">
      <span className="rc-pow-s">
        Powered by
        <svg viewBox="0 120 640 272" width="33" height="14" fill="currentColor">
          <path d={STRIPE_WORDMARK} />
        </svg>
      </span>
      <i>·</i>
      Terms
      <i>·</i>
      Privacy
    </p>
  )
}

/**
 * The checkout page a buyer gets on a phone (checkout-client.tsx), in the
 * page's own pixels: the pc- rules copy its Tailwind classes, and those of
 * parts/order-summary.tsx, parts/stripe-pay.tsx (the express button, the
 * Payment Element in checkout's appearance) and components/checkout/parts/ui.tsx,
 * one for one. The order shows open, as a phone first draws it.
 */
function PageCheckout() {
  return (
    <div className="pc">
      <div className="pc-page">
        <PageBar />

        <div className="pc-sum">
          <p className="pc-payto">Pay {SELLER}</p>
          <p className="pc-total">{LUTS.price}</p>
          <span className="pc-det">
            Hide details
            <Chevron className="pc-up" />
          </span>
          <div className="pc-details">
            <div className="pc-line">
              <span className="pc-thumb">
                <EbookCover small />
              </span>
              <span className="pc-li">
                <b>{LUTS.title}</b>
                <small>Qty 1</small>
              </span>
              <b className="pc-lp">{LUTS.price}</b>
            </div>
            <div className="pc-tots">
              <div className="pc-row pc-strong">
                <span>Subtotal</span>
                <span>{LUTS.price}</span>
              </div>
              <span className="pc-promo">Add promotion code</span>
              <div className="pc-row pc-due">
                <span>Total due</span>
                <span>{LUTS.price}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pc-form">
          {/* Round 9 (the owner: "Google Pay as well, not only Apple Pay"): the express row as the website checkout draws it, both wallets side by side. */}
          <div className="pc-xp">
            <span className="pc-ap pc-ap-a">
              <AppleMark />
              <span className="mk-pay">Pay</span>
            </span>
            <span className="pc-ap pc-ap-g">
              <GoogleMark />
              <span className="mk-gpay">Pay</span>
            </span>
          </div>
          <div className="pc-or">
            <i />
            OR
            <i />
          </div>
          <div className="pc-h">Contact information</div>
          <span className="pc-in">sam.rivera@mail.com</span>
          <span className="pc-check">
            <span className="pc-box" />
            Email me with news and offers
          </span>
          <div className="pc-h pc-gap">Payment method</div>
          <div className="pc-acc">
            <div className="pc-acc-h">
              <span className="pc-radio">
                <i />
              </span>
              <CardGlyph />
              Card
            </div>
            <span className="pc-lbl">Card number</span>
            <span className="pc-in pc-ph">
              1234 1234 1234 1234
              <CardBrands />
            </span>
            <div className="pc-2">
              <span>
                <span className="pc-lbl">Expiration date</span>
                <span className="pc-in pc-ph">MM / YY</span>
              </span>
              <span>
                <span className="pc-lbl">Security code</span>
                <span className="pc-in pc-ph">CVC</span>
              </span>
            </div>
            <span className="pc-lbl">Country</span>
            <span className="pc-in pc-sel">
              United States
              <Chevron />
            </span>
          </div>
          <span className="pc-check pc-terms">
            <span className="pc-box" />
            <span>
              I agree to the <u>Terms and Conditions</u> and the <u>Refund policy</u>
            </span>
          </span>
          <span className="pc-pay">Pay {LUTS.price}</span>
          <PaymentNote />
        </div>
      </div>
    </div>
  )
}

/**
 * THE ONE-TAP DEMO (round 11, the owner: "make the mockup show the modal
 * checkout, not the default subpage checkout, and make it dark UI"). A
 * creator's page, dark, with the LUT pack's block on it, and the checkout
 * that opens over the page when Buy now is pressed:
 * components/checkout/instant-checkout.tsx in its window
 * (components/checkout/checkout-window.tsx), drawn dark as app/theme-dark.css
 * draws it. The product in the grey head, Your details, the order, Payment
 * method with the wallet chosen, Pay with Apple Pay, then Apple Pay's sheet,
 * and the window's own "Payment complete". In the loop the sheet starts and
 * ends open, so the picture never jumps when its loop starts over.
 */
function InstantDemo() {
  return (
    <div className="ic">
      <div className="ic-page">
        <img className="ic-av" src={AVATAR} alt="" width={88} height={88} loading="lazy" decoding="async" />
        <b className="ic-name">{SELLER}</b>
        <span className="ic-bio">Colorist. LUTs and lessons for people who shoot.</span>
        <div className="ic-block">
          <span className="ic-cover">
            <EbookCover small />
          </span>
          <span className="ic-bt">
            <b>{LUTS.title}</b>
            <small>{LUTS.kind}</small>
            <b className="ic-price">{LUTS.price}</b>
          </span>
          <span className="ic-buy">Buy now</span>
        </div>
        <span className="ic-link">Editing for Story, the course</span>
        <span className="ic-link">Shoot Planner for Notion</span>
      </div>
      <span className="pc-touch ic-t1" />
      <span className="ic-dim" />
      <div className="ic-sheet">
        <div className="ic-head">
          <span className="ic-x">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
          <span className="ic-mark">
            <EbookCover small />
          </span>
          <b className="ic-title">{LUTS.title}</b>
          <small>{SELLER}</small>
        </div>
        <div className="ic-body">
          <div className="ic-form">
            <div className="ic-h">Your details</div>
            <span className="ic-in">sam.rivera@mail.com</span>
            <span className="ic-in">Sam Rivera</span>
            <div className="ic-sum">
              <span>{LUTS.title}</span>
              <b>{LUTS.price}</b>
            </div>
            <div className="ic-h">Payment method</div>
            <div className="ic-methods">
              <span className="ic-m" data-on="">
                <AppleMark />
                Pay
              </span>
              <span className="ic-m">
                <CardGlyph />
                Card
              </span>
            </div>
            <span className="ic-pay">Pay {LUTS.price} with Apple Pay</span>
            <PaymentNote />
          </div>
          <div className="ic-done">
            <span className="ic-ok">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <b>Payment complete</b>
            <small>We sent your receipt and your access to sam.rivera@mail.com.</small>
            <span className="ic-open">Open it now</span>
          </div>
        </div>
      </div>
      <span className="pc-touch ic-t2" />
      <ApplePay />
    </div>
  )
}

/** Apple Pay's own sheet over the checkout (iOS 26, floating, its words Apple's, dark as the phone is): Confirm with Side Button, then Done. */
function ApplePay() {
  return (
    <>
      <span className="ap-dim" />
      <div className="ap-sheet">
        <div className="ap-head">
          <span className="ap-logo">
            <AppleMark />
            Pay
          </span>
          <span className="ap-x">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M17 7 7 17M7 7l10 10" />
            </svg>
          </span>
        </div>
        <div className="ap-row">
          <span className="ap-card" />
          <span className="ap-t">
            <b>Visa •••• 4242</b>
            <small>Sam Rivera</small>
          </span>
          <Chevron className="ap-chev" />
        </div>
        <div className="ap-row">
          <span className="ap-t">
            <small>Contact</small>
            <b>sam.rivera@mail.com</b>
          </span>
          <Chevron className="ap-chev" />
        </div>
        <div className="ap-sum">
          <span>Pay {SELLER}</span>
          <b>{LUTS.price}</b>
        </div>
        <div className="ap-foot">
          <span className="ap-side">
            <span className="ap-btn" />
            Confirm with Side Button
          </span>
          <span className="ap-done">
            <svg viewBox="0 0 48 48" width="44" height="44">
              <circle cx="24" cy="24" r="21" fill="none" stroke="#0a84ff" strokeWidth="3" />
              <path d="M15 24.5l6 6 12-13" fill="none" stroke="#0a84ff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Done
          </span>
        </div>
      </div>
    </>
  )
}

function PaidRing({ className }: { className: string }) {
  return (
    <span className={className}>
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r="29" fill="none" stroke="#1a1a2e" strokeWidth="3" />
        <path d="M20 33.5l8 8 16-17" fill="none" stroke="#1a1a2e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** Stripe's wordmark, as components/checkout/parts/ui.tsx draws it in Powered by Stripe. */
const STRIPE_WORDMARK =
  "M165 144.7l-43.3 9.2-.2 142.4c0 26.3 19.8 43.3 46.1 43.3 14.6 0 25.3-2.7 31.2-5.9v-33.8c-5.7 2.3-33.7 10.5-33.7-15.7V221h33.7v-37.8h-33.7zm89.1 51.6l-2.7-13.1H213v153.2h44.3V233.3c10.5-13.8 28.2-11.1 33.9-9.3v-40.8c-6-2.1-26.7-6-37.1 13.1zm92.3-72.3l-44.6 9.5v36.2l44.6-9.5zM44.9 228.3c0-6.9 5.8-9.6 15.1-9.7 13.5 0 30.7 4.1 44.2 11.4v-41.8c-14.7-5.8-29.4-8.1-44.1-8.1-36 0-60 18.8-60 50.2 0 49.2 67.5 41.2 67.5 62.4 0 8.2-7.1 10.9-17 10.9-14.7 0-33.7-6.1-48.6-14.2v40c16.5 7.1 33.2 10.1 48.5 10.1 36.9 0 62.3-15.8 62.3-47.8 0-52.9-67.9-43.4-67.9-63.4zM640 261.6c0-45.5-22-81.4-64.2-81.4s-67.9 35.9-67.9 81.1c0 53.5 30.3 78.2 73.5 78.2 21.2 0 37.1-4.8 49.2-11.5v-33.4c-12.1 6.1-26 9.8-43.6 9.8-17.3 0-32.5-6.1-34.5-26.9h86.9c.2-2.3.6-11.6.6-15.9zm-87.9-16.8c0-20 12.3-28.4 23.4-28.4 10.9 0 22.5 8.4 22.5 28.4zm-112.9-64.6c-17.4 0-28.6 8.2-34.8 13.9l-2.3-11H363v204.8l44.4-9.4.1-50.2c6.4 4.7 15.9 11.2 31.4 11.2 31.8 0 60.8-23.2 60.8-79.6.1-51.6-29.3-79.7-60.5-79.7zm-10.6 122.5c-10.4 0-16.6-3.8-20.9-8.4l-.3-66c4.6-5.1 11-8.8 21.2-8.8 16.2 0 27.4 18.2 27.4 41.4.1 23.9-10.9 41.8-27.4 41.8zm-126.7 33.7h44.6V183.2h-44.6z"

function CardGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2.25" />
      <path d="M2.75 9.5h18.5M6.5 15h3" strokeLinecap="round" />
    </svg>
  )
}

/** Visa, Mastercard and Amex, as the card field shows them. */
function CardBrands({ className = "pc-brands" }: { className?: string }) {
  return (
    <span className={className}>
      <i className="cb-visa">
        <svg viewBox="0 0 48 16" width="26" height="9">
          <text x="24" y="13.4" textAnchor="middle" fontSize="15.5" fontWeight="800" fontStyle="italic" fill="#1a1f71" letterSpacing="-.4">
            VISA
          </text>
        </svg>
      </i>
      <i className="cb-mc">
        <svg viewBox="0 0 30 20" width="22" height="14">
          <circle cx="11" cy="10" r="8" fill="#eb001b" />
          <circle cx="19" cy="10" r="8" fill="#f79e1b" />
          <path d="M15 3.4a8 8 0 0 1 0 13.2 8 8 0 0 1 0-13.2Z" fill="#ff5f00" />
        </svg>
      </i>
      <i className="cb-amex">
        <b>AMEX</b>
      </i>
    </span>
  )
}

/** Apple's logo (the mark in the Apple Pay button), on a 24 unit grid. */
function AppleMark() {
  return (
    <svg className="mk-apple" viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

/** Google's G, its four colours as Google draws it. */
function GoogleMark() {
  return (
    <svg className="mk-g" viewBox="0 0 48 48" width="18" height="18">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function Cursor({ className }: { className: string }) {
  return (
    <span className={`cmv-cursor ${className}`}>
      <svg viewBox="0 0 20 24" width="1.25em" height="1.5em">
        <path d="M2 1.5v18.2l4.7-4.4 3 6.9 3.2-1.4-3-6.8h6.5L2 1.5Z" fill="#111" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/* ── Built to convert ─────────────────────────────────────────────────── */

type Line = { id: string; title: string; option: string; price: string; physical: boolean }
const CART: Line[] = [
  { id: "tee", title: TEE.title, option: TEE.option, price: TEE.price, physical: true },
  { id: "luts", title: LUTS.title, option: LUTS.kind, price: LUTS.price, physical: false },
]
/* $32.00 + $29.00 = $61.00; + $6.00 shipping + $4.88 tax (8% of the goods, an example) = $71.88. */
const SUB = "$61.00"
const SHIP = "$6.00"
const TAX = "$4.88"
const TOTAL = "$71.88"
const SHOP_HOST = "maraquinn.storelib.com"

function LineThumb({ l }: { l: Line }) {
  return l.physical ? <img src={TEE.img} alt="" loading="eager" decoding="async" width={96} height={96} /> : <EbookCover small />
}

/** A field as the checkout draws one: the label above, the box, empty until it is filled. */
function Field({ label, value, k, select = false }: { label?: string; value: string; k: string; select?: boolean }) {
  return (
    <div className="cdx-f">
      {label ? <span className="cdx-lbl">{label}</span> : null}
      <span className="cdx-in" data-select={select || undefined}>
        <span className={`cdx-v cdx-v-${k}`}>{value}</span>
        {select ? (
          <svg className="cdx-chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        ) : null}
      </span>
    </div>
  )
}

/**
 * Built to convert. Round 9 (the owner: on a phone "it should be like on
 * desktop, 4:3", "adapted, not shrunk"): one picture everywhere, the website
 * checkout in a desktop window. On a phone the window is drawn narrower and
 * larger than its 4:3 box and runs off its right and bottom edges, so the
 * order and the start of the form read at a size a thumb's width away.
 */
function VisConvert() {
  return <VisConvertDesk />
}

/**
 * The website checkout (site-checkout.tsx) at a desktop width, drawn at a
 * design width of 880 in `u`: the shop's bar, the order on the grey half
 * with each line, Subtotal, Shipping, Tax and Total due, paying on the white
 * half (Apple Pay and Google Pay, Contact, Delivery, Shipping method, Card,
 * Terms, Pay, Powered by Stripe), then Payment complete and the seller's
 * notice. One loop: the form fills, the page scrolls down to Pay, paid, and
 * back to the top under the paid screen.
 */
function VisConvertDesk() {
  return (
    <div className="cdx">
      <div className="cdx-win">
        <div className="cdx-bar">
          <span className="cdx-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="cdx-url">
            <svg viewBox="0 0 12 14" fill="currentColor">
              <path d="M3 6V4.2a3 3 0 0 1 6 0V6h.6c.8 0 1.4.6 1.4 1.4v4.8c0 .8-.6 1.4-1.4 1.4H2.4c-.8 0-1.4-.6-1.4-1.4V7.4C1 6.6 1.6 6 2.4 6H3Zm1.5 0h3V4.2a1.5 1.5 0 0 0-3 0V6Z" />
            </svg>
            {SHOP_HOST}/checkout
          </span>
        </div>
        <div className="cdx-view">
          <span className="cdx-white" />
          <div className="cdx-scroll">
            <div className="cdx-head">
              <span className="cdx-back">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </span>
              <img className="cdx-av" src={AVATAR} alt="" width={56} height={56} />
              <span className="cdx-shop">{SELLER}</span>
              <span className="cdx-cont">Continue shopping</span>
            </div>
            <div className="cdx-grid">
              <div className="cdx-sum">
                <div className="cdx-sum-in">
                  <div className="cdx-payto">Pay {SELLER}</div>
                  <div className="cdx-big">
                    <span className="cdx-t0">{SUB}</span>
                    <span className="cdx-t1">{TOTAL}</span>
                  </div>
                  <ul className="cdx-lines">
                    {CART.map((l) => (
                      <li key={l.id}>
                        <span className="cdx-thumb">
                          <LineThumb l={l} />
                        </span>
                        <span className="cdx-li">
                          <b>{l.title}</b>
                          <small>{l.option}</small>
                          <span className="cdx-ctl">
                            {l.physical ? (
                              <span className="cdx-step">
                                <i>−</i>
                                <em>1</em>
                                <i>+</i>
                              </span>
                            ) : null}
                            <u>Remove</u>
                          </span>
                        </span>
                        <span className="cdx-lp">{l.price}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="cdx-tot">
                    <div className="cdx-row cdx-strong">
                      <span>Subtotal</span>
                      <span>{SUB}</span>
                    </div>
                    <span className="cdx-promo">Add promotion code</span>
                    <div className="cdx-row">
                      <span>Shipping</span>
                      <span className="cdx-swap">
                        <span className="cdx-s0">Enter your address</span>
                        <span className="cdx-s1">{SHIP}</span>
                      </span>
                    </div>
                    <div className="cdx-row">
                      <span>Tax</span>
                      <span className="cdx-swap">
                        <span className="cdx-s0">Calculated next</span>
                        <span className="cdx-s1">{TAX}</span>
                      </span>
                    </div>
                    <div className="cdx-row cdx-due">
                      <span>Total due</span>
                      <span className="cdx-swap">
                        <span className="cdx-t0">{SUB}</span>
                        <span className="cdx-t1">{TOTAL}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="cdx-form">
                <div className="cdx-express">
                  <span className="cdx-xp">
                    <AppleMark />
                    <span className="mk-pay">Pay</span>
                  </span>
                  <span className="cdx-xp">
                    <GoogleMark />
                    <span className="mk-gpay">Pay</span>
                  </span>
                </div>
                <div className="cdx-or">
                  <i />
                  OR
                  <i />
                </div>
                <div className="cdx-h">Contact information</div>
                <Field value="sam.rivera@mail.com" k="email" />
                <div className="cdx-check">
                  <span className="cdx-box" />
                  Email me with news and offers
                </div>
                <div className="cdx-2">
                  <Field label="First name" value="Sam" k="first" />
                  <Field label="Last name" value="Rivera" k="last" />
                </div>
                <div className="cdx-h cdx-gap">Delivery</div>
                <Field label="Country/region" value="United States" k="country" select />
                <Field label="Address" value="214 Mercer Street" k="addr" />
                <div className="cdx-3">
                  <Field label="City" value="New York" k="city" />
                  <Field label="State" value="New York" k="state" select />
                  <Field label="ZIP code" value="10012" k="zip" />
                </div>
                <div className="cdx-h cdx-gap">Shipping method</div>
                <div className="cdx-ship">
                  <div className="cdx-opt" data-sel="">
                    <span className="cdx-radio">
                      <i />
                    </span>
                    <span className="cdx-opt-t">
                      <b>Standard shipping</b>
                      <small>3 to 5 business days</small>
                    </span>
                    <b>{SHIP}</b>
                  </div>
                  <div className="cdx-opt">
                    <span className="cdx-radio" />
                    <span className="cdx-opt-t">
                      <b>Express</b>
                      <small>1 to 2 business days</small>
                    </span>
                    <b>$14.00</b>
                  </div>
                </div>
                <div className="cdx-h cdx-gap">Payment method</div>
                <div className="cdx-acc">
                  <div className="cdx-acc-h">
                    <span className="cdx-radio">
                      <i />
                    </span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2.25" />
                      <path d="M2.75 9.5h18.5M6.5 15h3" strokeLinecap="round" />
                    </svg>
                    Card
                  </div>
                  <Field label="Card number" value="4242 4242 4242 4242" k="card" />
                  <div className="cdx-2">
                    <Field label="Expiration date" value="08 / 29" k="exp" />
                    <Field label="Security code" value="314" k="cvc" />
                  </div>
                </div>
                <div className="cdx-check cdx-terms">
                  <span className="cdx-box cdx-box-terms">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  <span>
                    I agree to the <u>Terms and Conditions</u> and the <u>Refund policy</u>
                  </span>
                </div>
                <span className="cdx-pay">
                  Pay {TOTAL}
                  <Cursor className="cdx-cur" />
                </span>
                <div className="cdx-pow">Powered by Stripe · Terms · Privacy</div>
              </div>
            </div>
          </div>
          <div className="cdx-paid">
            <PaidRing className="cdx-ring" />
            <b>Payment complete</b>
            <small>
              {TOTAL} paid. Taking you back to {SHOP_HOST}
            </small>
            <small>Your receipt is in your email.</small>
          </div>
        </div>
      </div>
      <div className="cmv-sale">
        <StorelibLogo size={40} alt="" fluid />
        <span className="cmv-note-t">
          <span className="cmv-note-top">
            <b>New sale: {TOTAL}</b>
            <small>now</small>
          </span>
          <span className="cmv-note-p">
            Sam Rivera bought {TEE.title} and 1 more for {TOTAL}.
          </span>
        </span>
      </div>
    </div>
  )
}


/* ── One-tap payments: the phone, and the three ways it pays ──────────── */

/**
 * Round 8 (the owner: the Apple Pay, Google Pay and Stripe marks "sit really
 * bad"): each method is the button its maker draws, at one size. Apple Pay:
 * black, Apple's logo and "Pay". Google Pay: black, the four colour G and
 * "Pay". A card: the card glyph with Visa, Mastercard and Amex. Stripe's own
 * wordmark under them. The phone pays with Apple Pay; as it does, the Apple
 * Pay button is pressed and gets its check, then the ring moves on to Google
 * Pay and the card, each pressed and checked in turn.
 */
function VisTap() {
  return (
    <div className="cmv-tap">
      <div className="cmv-phone">
        <Phone pay />
      </div>
      <div className="tp">
        <span className="tp-ring" />
        <span className="tp-btn tp-apple">
          <span className="tp-shine" />
          <AppleMark />
          <span className="mk-pay">Pay</span>
          <i className="tp-ok" />
        </span>
        <span className="tp-btn tp-gpay">
          <GoogleMark />
          <span className="mk-gpay">Pay</span>
          <i className="tp-ok" />
        </span>
        <span className="tp-btn tp-card">
          <CardGlyph />
          <span className="tp-card-t">Card</span>
          <CardBrands className="tp-brands" />
          <i className="tp-ok" />
        </span>
        <span className="tp-pow">
          Payments by
          <svg viewBox="0 120 640 272" width="40" height="17" fill="currentColor" aria-label="Stripe">
            <path d={STRIPE_WORDMARK} />
          </svg>
        </span>
      </div>
    </div>
  )
}

/* ── Local currencies: the tee and the LUT pack, seven readings ─────────── */

/*
 * Example prices for the $32 tee and the $29 LUT pack in each currency
 * checkout charges in (one per fee rule, lib/payments/fees/currency-rules),
 * rounded the way a seller would set them.
 */
export const PRICES = [
  { code: "USD", flag: "US", where: "United States", tee: "$32.00", luts: "$29.00" },
  { code: "EUR", flag: "EU", where: "Euro area", tee: "€30.00", luts: "€27.00" },
  { code: "GBP", flag: "GB", where: "United Kingdom", tee: "£26.00", luts: "£23.00" },
  { code: "CAD", flag: "CA", where: "Canada", tee: "C$44.00", luts: "C$40.00" },
  { code: "AUD", flag: "AU", where: "Australia", tee: "A$49.00", luts: "A$45.00" },
  { code: "JPY", flag: "JP", where: "Japan", tee: "¥4,900", luts: "¥4,400" },
  { code: "RON", flag: "RO", where: "Romania", tee: "149 lei", luts: "135 lei" },
] as const

function Flag({ code }: { code: string }) {
  return <img className="cmv-flag" src={`/flags/${code}.svg`} alt="" loading="eager" decoding="async" width={21} height={14} />
}

/** One price, read in each currency in turn. */
function Cycle({ k }: { k: "tee" | "luts" | "where" }) {
  return (
    <span className={`cv-stack cv-${k}`}>
      {PRICES.map((p, i) => (
        <span key={p.code} className="cv-cyc" data-first={i === 0 || undefined} style={{ "--i": i } as React.CSSProperties}>
          {p[k]}
        </span>
      ))}
    </span>
  )
}

function VisCurrency() {
  return (
    <div className="cv">
      <div className="cv-head">
        <img src={AVATAR} alt="" loading="eager" decoding="async" width={64} height={64} />
        <b>{SELLER}</b>
        <span className="cv-for">
          Prices for <Cycle k="where" />
        </span>
      </div>
      <div className="cv-tiles">
        <div className="cv-tile">
          <span className="cv-pic cv-pic-tee">
            <img src={TEE.img} alt="" loading="eager" decoding="async" width={240} height={240} />
          </span>
          <b className="cv-name">{TEE.title}</b>
          <Cycle k="tee" />
        </div>
        <div className="cv-tile">
          <span className="cv-pic">
            <EbookCover />
          </span>
          <b className="cv-name">{LUTS.title}</b>
          <Cycle k="luts" />
        </div>
      </div>
      <div className="cv-chips">
        <span className="cv-hl" />
        {PRICES.map((p) => (
          <span key={p.code} className="cv-chip">
            <Flag code={p.flag} />
            {p.code}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Checkout reminders: left at Pay, the email an hour later, paid ──── */

/**
 * Three moments on one line that fills as the hour passes, and the email that
 * brings the buyer back. The reminder is for the black t-shirt. Round 12 (the
 * owner: "get rid of the recovered chart/stats entirely"): the Recovered tile
 * and its numbers are gone; the email has the picture to itself.
 */
function VisRecover() {
  return (
    <div className="cmv-rec">
      <div className="cmv-tl">
        <span className="cmv-rail">
          <span className="cmv-fill" />
        </span>
        <span className="cmv-st cmv-st1">
          <i />
          <b>Left at Pay</b>
          <small>2:14 PM</small>
        </span>
        <span className="cmv-st cmv-st2">
          <i />
          <b>Reminder sent</b>
          <small>3:14 PM</small>
        </span>
        <span className="cmv-st cmv-st3">
          <i />
          <b>Paid {TEE.price}</b>
          <small>3:31 PM</small>
        </span>
      </div>
      <div className="cmv-mail">
        <div className="cmv-mail-from">
          <img src={AVATAR} alt="" loading="eager" decoding="async" width={64} height={64} />
          <span>
            <b>{SELLER}</b>
            <small>to Sam · 3:14 PM</small>
          </span>
        </div>
        <div className="cmv-mail-subj">You left {TEE.title} at checkout</div>
        <div className="cmv-mail-h">Still thinking it over?</div>
        <p>Hi Sam, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off.</p>
        <span className="cmv-mail-btn">Finish checkout</span>
        <div className="cmv-mail-line">
          <span className="cmv-thumb">
            <img src={TEE.img} alt="" loading="eager" decoding="async" width={96} height={96} />
          </span>
          <span>{TEE.title}</span>
          <b>{TEE.price}</b>
        </div>
      </div>
    </div>
  )
}

/* ── Styles ──────────────────────────────────────────────────────────── */

const WORDS = CHECKOUT_HEADING.split(" ").length
const f3 = (v: number) => String(+v.toFixed(3))

/*
 * The scene's scroll. The track is a screen of stage plus DWELL of scroll,
 * the stage held in it (position: sticky, the browser's own scrolling,
 * nothing per frame). Over the first SETTLE percent of that hold the phone
 * comes down and the headline's words rise in, one after another. The cards
 * follow, pulled up by OVERLAP, so they come up the screen over the phone
 * before the hold ends.
 */
const DWELL = "100svh"
const OVERLAP = "56svh"
const SETTLE = 44
/* Round 10: where the phone and the ring step back under the cards (svh of scroll into the hold), how faint and how small they end. The cards' top edge comes on screen at 44svh. Round 11: fainter, the cards are solid now and the products show only in the gaps. */
const RECEDE = [48, 100] as const
/*
 * Wave 18 (the owner: the products "a little lower in brightness, just a
 * little"): the ring is drawn at RING_DIM, one opacity on the ring's own layer
 * (it already fades behind the cards, so no new layer and no filter). Over the
 * section's black, an opacity is a brightness: 12% darker. Behind the cards it
 * ends at RECEDE_TO, the old 45% made the same touch darker.
 */
const RING_DIM = 0.88
const RECEDE_TO = 0.4
const RECEDE_SCALE = 0.92
/*
 * Round 12 (the owner: the phone was "too visible" behind the cards): the
 * phone fades out whole while the cards come up, and its blurred copy is gone.
 * Its black shade goes after it, once there is no phone left to show through.
 * At 80svh into the hold the cards' top edge is a quarter to a third of the way up
 * the screen at every width (they come on screen at 44svh), so the phone is
 * gone before they reach its middle, with nothing of it left behind them.
 */
const PHONE_OUT = [RECEDE[0], 80] as const
const SHADE_OUT = [80, 86] as const
/* The headline fades before the cards' top edge reaches it. */
const COPY_OUT = [86, 116] as const
/* Each word's stretch of the hold: a fifth of it, each starting a little after the one before, the last done as the phone lands. */
const wordRanges = () => Array.from({ length: WORDS }, (_, i) => `${NEAR} .cmc-w[data-w="${i}"]{animation-range:contain ${f3(5 + i * 2.6)}svh contain ${f3(SETTLE - 18.2 + i * 2.6)}svh}`).join("\n    ")
/*
 * Wave 17: the ring's turn runs the whole time the track is on screen, as it
 * did with "entry 0% exit 100%", but its start is written as a length of
 * scroll before "contain 0%" (the track's top at the screen's top). "entry
 * 0%" is the track's top at the screen's foot, so it moves with the
 * scrollport's height, and on an iPhone that grows and shrinks with Safari's
 * toolbar while svh does not: turning back mid-hold brought the toolbar out
 * and turned the ring a step (measured in Chromium at 390 wide with svh held
 * at a 664px screen, 664 -> 750 tall). "exit 100%" (the track's foot at the
 * screen's top) does not depend on the screen. Same numbers with the toolbar
 * out.
 */
const SPIN_RANGE = "contain -100svh exit 100%"
/*
 * Round 12 (the page audit: the scroll timeline animations were sampled while
 * the section was screens away): they apply only while the section is within
 * half a screen of the screen (data-cmc-near, useNear). Only the animations:
 * the held stage, its sticky place and the cards' pull stay in the layout
 * always, so the page's length never changes when the attribute does.
 */
const NEAR = ".cmc[data-cmc-near]"

/** An object's place on the ring as custom properties: its start (a turn), its height, its width, its picture's height over its width, its lean. */
const spotVars = (s: Spot, f: Thing) => `--p:${f3(s.p)};--y:${f3(s.y)};--s:${f3(s.s)};--ar:${f3(f.ar)};--rz:${f3(f.rz)}deg`
/** Where an object is on the ring after `turn` of a turn: round the ring's axis, out to the ring, and turned back to face the viewer. At no turn and no start it is at the ring's nearest point. */
const ringAt = (turn: number) =>
  `rotateY(calc(var(--a) + ${f3(turn * 360)}deg)) translate3d(0,calc(var(--iw) * var(--y)),var(--r)) rotateY(calc(var(--a) * -1 - ${f3(turn * 360)}deg))`
/** The ring's own place: set back by its radius, so its nearest point is level with the phone, and leaning toward the viewer. */
const ringBox = (deg: number) => `translate3d(0,0,calc(var(--r) * -1)) rotateX(var(--tilt)) rotateY(${deg}deg)`

/*
 * Depth, over one turn (0% is the ring's nearest point, behind the phone; a
 * quarter turn either way is beside it; half way is the far side). SHARP_UNTIL
 * is where the sharp object starts to give way to its blurred copy, SOFT_FROM
 * where only the copy is left. Wave 18 (the reference: the products float
 * out of focus round the phone): the sharp stretch is narrower, so an object
 * is sharp only as it comes out from behind the phone and soft for most of
 * the turn, beside the phone included.
 */
const SHARP_UNTIL = 12
const SOFT_FROM = 30
const DEPTH_FAR = 0.5

const ORBIT_CSS = `
${FLOATS.map((f) => `.cmc-o[data-f="${f.id}"]{${spotVars(f.d, f)}}`).join("\n")}
@media (max-width:899px){
${FLOATS.map((f) => (f.m ? `  .cmc-o[data-f="${f.id}"]{${spotVars(f.m, f)}}` : "")).filter(Boolean).join("\n")}
  .cmc-o:not([data-m]){display:none}
}
@keyframes cmc-orbit{from{transform:${ringAt(0)}}to{transform:${ringAt(1)}}}
/* Beside the phone at full strength, dimmer round the back. */
@keyframes cmc-depth{0%,${SHARP_UNTIL}%,${100 - SHARP_UNTIL}%,100%{opacity:1}50%{opacity:${DEPTH_FAR}}}
/* The sharp object beside the phone, its blurred copy round the back: one cross fade, opacity only. */
@keyframes cmc-near{0%,${SHARP_UNTIL}%,${100 - SHARP_UNTIL}%,100%{opacity:1}${SOFT_FROM}%,${100 - SOFT_FROM}%{opacity:0}}
@keyframes cmc-far{0%,${SHARP_UNTIL}%,${100 - SHARP_UNTIL}%,100%{opacity:0}${SOFT_FROM}%,${100 - SOFT_FROM}%{opacity:1}}
@keyframes cmc-spin{from{transform:${ringBox(-SCROLL_TURN)}}to{transform:${ringBox(SCROLL_TURN)}}}
@keyframes cmc-unspin{from{transform:rotateY(${SCROLL_TURN}deg) rotateX(calc(var(--tilt) * -1))}to{transform:rotateY(${-SCROLL_TURN}deg) rotateX(calc(var(--tilt) * -1))}}
/* Round 11: the phone starts big and low, rising from the stage's foot, and settles smaller under the headline. */
@keyframes cmc-settle{from{transform:translate3d(0,var(--y0),0) scale(1)}to{transform:translate3d(0,var(--y1),0) scale(var(--ps))}}
@keyframes cmc-word{from{opacity:0;transform:translate3d(0,.55em,0)}to{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmc-recede{from{opacity:${RING_DIM};transform:scale(1)}to{opacity:${RECEDE_TO};transform:scale(${RECEDE_SCALE})}}
@keyframes cmc-back{from{transform:scale(1)}to{transform:scale(${RECEDE_SCALE})}}
@keyframes cmc-out{from{opacity:1}to{opacity:0}}
@keyframes cmc-in{from{opacity:0}to{opacity:1}}
`

/* The digital products, drawn as objects. Each is sized in its own container units, so it is the same picture at any size. */
const THINGS_CSS = `
.cmt{position:relative;display:block;container-type:inline-size;box-sizing:border-box;text-align:left;line-height:1.2;transform:rotate(var(--rz))}
.cmc-pic{transform:rotate(var(--rz))}
/* The LUT pack: the section's cover on the face of a box, its side going back. */
.cmt-box{width:92%;aspect-ratio:1}
.cmt-box .ebc{width:100%;height:100%;border-radius:2.5%}
.cmt-box::before{content:"";position:absolute;inset:0;z-index:2;border-radius:2.5%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.cmt-box::after{content:"";position:absolute;left:100%;top:0;bottom:0;width:8.5%;background:linear-gradient(90deg,#26262b,#111113);transform-origin:0 50%;transform:skewY(-32deg);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
/* An e-book: a paper cover, set in type. */
.cmt-book{aspect-ratio:3/4;display:flex;flex-direction:column;padding:9% 8% 8% 11%;border-radius:1.5% 4% 4% 1.5%;background:linear-gradient(90deg,#d8d1c0,#ece6d8 5%,#ece6d8);color:#161514}
.cmt-book-k{font-size:5cqw;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#6d675a}
.cmt-book-t{margin-top:9cqw;font-size:20cqw;font-weight:800;line-height:.9;letter-spacing:-.045em}
.cmt-book-s{margin-top:6cqw;font-size:5.6cqw;line-height:1.3;color:#4a463d}
.cmt-book-a{margin-top:auto;padding-top:4cqw;border-top:1px solid rgba(22,21,20,.28);font-size:5cqw;font-weight:600}
/* A course: its first frame with Play on it, the title, how far along. */
.cmt-course{padding:4% 4% 5%;border-radius:calc(var(--iw) * .03);background:#fff;color:#16161a}
.cmt-course-pic{position:relative;display:block;aspect-ratio:16/9;overflow:hidden;border-radius:calc(var(--iw) * .02);background:#0a0a0b}
.cmt-course-pic img{display:block;width:100%;height:100%;object-fit:cover}
.cmt-play{position:absolute;left:50%;top:50%;display:grid;place-items:center;width:17cqw;height:17cqw;margin:-8.5cqw 0 0 -8.5cqw;border-radius:50%;background:#fff;color:#16161a}
.cmt-play svg{display:block;width:44%;height:44%;margin-left:6%}
.cmt-course-t{display:block;margin-top:4.5cqw;font-size:7.4cqw;font-weight:600;letter-spacing:-.02em;white-space:nowrap}
.cmt-course-s{display:block;margin-top:1cqw;font-size:5.2cqw;color:#6b7280;white-space:nowrap}
.cmt-bar{display:block;height:1.6cqw;margin-top:4cqw;border-radius:1cqw;background:#e5e7eb;overflow:hidden}
.cmt-bar i{display:block;width:38%;height:100%;background:#8b5cf6}
/* A Notion template: a page with its checklist. */
.cmt-notion{padding:8% 8% 7%;border-radius:calc(var(--iw) * .026);background:#fbfbfa;color:#1f1f1e}
.cmt-notion-k{display:block;font-size:4.8cqw;font-weight:500;color:#8a8a84}
.cmt-notion-t{display:block;margin:1.5cqw 0 5cqw;font-size:10.5cqw;font-weight:700;letter-spacing:-.03em;white-space:nowrap}
.cmt-row{display:flex;align-items:center;gap:3.2cqw;padding:2.4cqw 0;border-top:1px solid #ecebe7;font-size:5.6cqw;white-space:nowrap}
.cmt-row i{flex:none;width:5.4cqw;height:5.4cqw;border-radius:1.2cqw;border:1px solid #c9c8c2;box-sizing:border-box}
.cmt-row[data-done]{color:#9b9a94;text-decoration:line-through}
.cmt-row[data-done] i{border-color:#8b5cf6;background:#8b5cf6}
@media (max-width:899px){
  /* On a phone the box has no side: one flat layer each. */
  .cmt-box{width:100%}
  .cmt-box::after{display:none}
}
`

const SCENE_CSS = `
.cmc{position:relative;background:#000;color:#fff;border-radius:clamp(28px,4vw,56px);overflow:clip;padding-block:0!important;isolation:isolate;--edge:var(--home-edge,clamp(20px,5.15vw,84px))}
/*
 * Wave 17, the white strips (the owner's iPhone recording: a white band at
 * the foot of the held stage, and the scene arriving as a black block with
 * white under it and the ring's products drawn on the white). Safari paints
 * the page's tiles on the page's thread; a tile not painted yet when the
 * finger brings it on screen shows the page's own background, white, and the
 * black of this section is only in those tiles (the stage, the ring and the
 * phone are layers of their own, already painted, which is why they showed
 * on the white). So the black is also a layer of its own: one box the size
 * of the section, a plain colour and a 3D transform, which WebKit draws as a
 * colour with no tiles to paint, under everything in the section. Touch
 * screens only, where a fling outruns the painting; a mouse keeps one layer.
 */
@media (hover:none),(pointer:coarse){
  .cmc::before{content:"";position:absolute;inset:0;z-index:0;background:#000;transform:translateZ(0);pointer-events:none}
}
/* The dots (round 7: "very extremely subtle"): 1px at 7% white on a 24px grid, faded out toward the edges. */
.cmc-dots{position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1.3px);background-size:24px 24px;background-position:12px 12px;-webkit-mask-image:radial-gradient(ellipse 75% 65% at 50% 40%,#000 25%,transparent 80%);mask-image:radial-gradient(ellipse 75% 65% at 50% 40%,#000 25%,transparent 80%)}
/*
 * The track holds the stage and the cards after it (round 10), so the stage
 * can stay held behind the cards for as long as they are on screen. Without a
 * scroll timeline nothing is held: the stage is one screen showing the
 * finished scene, and the cards follow it.
 */
.cmc[data-story-section] > .cmc-track.cmc-track{position:relative;z-index:1;max-width:none;margin:0;padding:0}
/*
 * The stage's numbers, shared by everything in it (round 11). --fs is the
 * headline's size, on two rows. --pe is the phone's width once it has
 * settled under the headline, the room left in one screen; --pw is the big
 * phone it starts as (--big times that), --ps the scale that takes one to the
 * other. --y0 is where the big phone's top starts (low, rising from the
 * stage's foot), --y1 where the settled phone's top ends (under the
 * headline, its foot on the stage's). --r is the ring's radius, --pp its
 * perspective, --cy the height of its centre, --tilt its lean, --iw the
 * products' unit of size.
 *
 * Wave 18 (the owner: the heading was "glued" to the site header): --hd is
 * the header's own height (63px at 390, 69px at 1440, measured) and --tt the
 * air under it, 24 to 40px on a phone and 28 to 72px on a computer (about
 * 30px and 54px on a 664 and a 900 tall screen; it was 12px and 25px). On a
 * phone the ring is narrower (50vw) and its products larger and higher, so
 * they float round the phone on the screen instead of off its edges, as in
 * the reference.
 */
.cmc-stage{position:relative;height:100svh;overflow:hidden;
  --hd:64px;--tt:clamp(24px,4.6svh,40px);--pb:clamp(10px,1.8svh,20px);--gap:clamp(12px,2svh,20px);
  --fs:clamp(27px,8.2vw,40px);
  --pe:min(68vw,300px,calc((100svh - var(--hd) - var(--tt) - var(--fs) * 2.1 - var(--gap) - var(--pb)) / 2.07));
  --big:1.24;--ps:${f3(1 / 1.24)};--pw:calc(var(--pe) * var(--big));
  --y0:38svh;--y1:calc(var(--hd) + var(--tt) + var(--fs) * 2.1 + var(--gap));
  --r:min(50vw,300px);--pp:calc(var(--r) * 3);--cy:52svh;--tilt:-14deg;--iw:calc(var(--pe) * 1.45)}
.cmc-copy{position:absolute;z-index:4;left:var(--edge);right:var(--edge);top:calc(var(--hd) + var(--tt));text-align:center}
.cmc-title{margin:0 auto;font-size:var(--fs);font-weight:300;line-height:1.04;letter-spacing:-.045em;color:#fff}
.cmc-row{display:block;white-space:nowrap}
.cmc-w{display:inline-block}
/* The phone's box, the big phone's size, centred; the world inside it carries the phone from big and low to settled. */
.cmc-phone-wrap{position:absolute;z-index:3;left:50%;top:0;width:var(--pw);height:calc(var(--pw) * 2.07);margin-left:calc(var(--pw) / -2)}
.cmc-world{position:relative;width:100%;height:100%;transform-origin:50% 0;transform:translate3d(0,var(--y1),0) scale(var(--ps))}
.cmc-rise{position:relative}
/*
 * The phone's shape in solid black, under the phone and over the ring. Round
 * 11 fix (the owner: a product must never cross the phone's screen): it sits
 * in the phone's own box, so the very transforms that carry the phone carry
 * it. A twin beside the phone running the same animations could fall a frame
 * behind while scrolling and let a product show through the fading phone.
 * The wrap only steps back (cmc-back), the ring alone fades (cmc-recede).
 * Round 12: the shade fades only after the phone has gone (SHADE_OUT after
 * PHONE_OUT), so there is never a fading phone over a product.
 */
.cmc-shade{position:absolute;inset:0;display:block;border-radius:calc(var(--pw) * .178);background:#000;pointer-events:none}

/*
 * The ring, under the phone (z 2 to the phone's 3). Its box (cmc-ring) gives
 * the perspective; cmc-orbit is set back, leans and takes the scroll's turn;
 * each object's box (cmc-o) carries its place on the ring; its face
 * (cmc-face) undoes the lean and the turn so the object always faces the
 * viewer, and dims with depth. Transform and opacity only, no shadow, no
 * filter.
 */
.cmc-ring{position:absolute;z-index:2;inset:0;pointer-events:none;perspective:var(--pp);perspective-origin:50% var(--cy);opacity:${RING_DIM}}
.cmc-orbit{position:absolute;left:50%;top:var(--cy);width:0;height:0;transform-style:preserve-3d;transform:${ringBox(0)}}
.cmc-o{position:absolute;left:0;top:0;display:block;width:calc(var(--iw) * var(--s));margin-left:calc(var(--iw) * var(--s) / -2);margin-top:calc(var(--iw) * var(--s) * var(--ar) / -2);transform-style:preserve-3d;--a:calc(var(--p) * 360deg);transform:${ringAt(0)}}
.cmc-face{position:relative;display:block;transform:rotateX(calc(var(--tilt) * -1))}
.cmc-sharp,.cmc-near{display:block}
.cmc-pic{display:block;width:100%;height:auto;-webkit-user-drag:none}
/*
 * Round 10 (the owner: behind the cards the products "blurred and faded",
 * "not consuming much performance"): each object, and the phone, has a
 * blurred copy baked into a small picture (soft-*.webp, its box with a fifth
 * of its width spare on every side). Nothing is blurred in the browser: the
 * sharp object and its copy cross fade, opacity only. Round 11: the copy
 * (cmc-far) also takes over as an object goes round the back, and a second
 * one (cmc-soft) comes up as the cards arrive.
 */
.cmc-soft,.cmc-far{position:absolute;left:0;top:0;display:block;width:${SOFT_W}%;max-width:none;height:auto;margin:-${SOFT_PAD}% 0 0 -${SOFT_PAD}%;opacity:0;pointer-events:none;-webkit-user-drag:none;transform:rotate(var(--rz))}
${ORBIT_CSS}
${THINGS_CSS}
@media (min-width:900px){
  .cmc-stage{--hd:69px;--tt:clamp(28px,6svh,72px);--pb:clamp(14px,2.2svh,28px);--gap:clamp(16px,2.6svh,32px);
    --fs:clamp(36px,min(4.3vw,7.2svh),68px);
    --pe:min(400px,calc((100svh - var(--hd) - var(--tt) - var(--fs) * 2.1 - var(--gap) - var(--pb)) / 2.07));
    --big:1.72;--ps:${f3(1 / 1.72)};--y0:40svh;
    --r:min(44vw,880px);--cy:60svh;--tilt:-12deg;--iw:calc(var(--pe) * 1.5)}
}

@media (prefers-reduced-motion:no-preference){
  /* The ring turns by itself, slowly, while the stage is on screen; will-change only then. Each object's depth runs on the same clock, from its own place on the ring. */
  .cmc-o{animation:cmc-orbit ${TURN_S}s linear infinite;animation-play-state:paused}
  .cmc-face{animation:cmc-depth ${TURN_S}s linear infinite;animation-delay:calc(var(--p) * -${TURN_S}s);animation-play-state:paused}
  .cmc-near{animation:cmc-near ${TURN_S}s linear infinite;animation-delay:calc(var(--p) * -${TURN_S}s);animation-play-state:paused}
  .cmc-far{animation:cmc-far ${TURN_S}s linear infinite;animation-delay:calc(var(--p) * -${TURN_S}s);animation-play-state:paused}
  .cmc:not([data-cmc-covered]) .cmc-stage[data-commerce-live] .cmc-o{animation-play-state:running;will-change:transform}
  .cmc:not([data-cmc-covered]) .cmc-stage[data-commerce-live] :is(.cmc-face,.cmc-near,.cmc-far){animation-play-state:running}

  /*
   * With scroll timelines (the compositor runs them, nothing per frame in
   * script): the stage holds for DWELL; the phone starts big and low and
   * settles smaller under the headline as its words rise in; the scroll turns
   * the ring a little further.
   */
  /*
   * Landing round 14 (the owner's iPhone recording: in this section the phone lurched between its two sizes, the
   * headline's words faded in again on every pass, the phone dimmed and came back from one frame to the next, and
   * the scene "flashes, glitches, sticks"). Safari on a phone places a scroll-driven animation a frame after the
   * finger has moved the page, and this scene is a dozen of them over a held stage. Under 900px nothing here follows
   * the scroll and nothing is held: the stage is one screen showing the finished scene (the headline, the phone
   * settled, the ring turning by itself on the compositor) and the cards follow it. From 900px it is as it was.
   */
  @media (min-width:900px){
  @supports (animation-timeline:view()){
    .cmc[data-story-section] > .cmc-track.cmc-track{view-timeline:--cmc-t block}
    .cmc-stage{position:sticky;top:0}
    .cmc-track > .cmc-cards{margin-top:calc(${DWELL} - ${OVERLAP})}
    ${NEAR} .cmc-world{animation:cmc-settle cubic-bezier(.4,0,.2,1) both;animation-timeline:--cmc-t;animation-range:contain 0svh contain ${SETTLE}svh}
    /*
     * Round 10: the stage stays held behind the cards. As they come up the
     * ring steps back (a little smaller, faded to ${RECEDE_TO}) and goes soft
     * (each sharp object fades into its blurred copy), the phone fades out
     * whole (round 12), the headline fades before the cards reach it, and the
     * ring keeps turning behind them.
     */
    ${NEAR} .cmc-phone-wrap{animation:cmc-back linear both;animation-timeline:--cmc-t;animation-range:contain ${RECEDE[0]}svh contain ${RECEDE[1]}svh}
    ${NEAR} .cmc-ring{animation:cmc-recede linear both;animation-timeline:--cmc-t;animation-range:contain ${RECEDE[0]}svh contain ${RECEDE[1]}svh}
    ${NEAR} .cmc-sharp{animation:cmc-out linear both;animation-timeline:--cmc-t;animation-range:contain ${RECEDE[0]}svh contain ${RECEDE[1] - 8}svh}
    ${NEAR} .cmc-soft{animation:cmc-in linear both;animation-timeline:--cmc-t;animation-range:contain ${RECEDE[0]}svh contain ${RECEDE[1] - 8}svh}
    ${NEAR} .cmc-rise > .cmc-phone{animation:cmc-out linear both;animation-timeline:--cmc-t;animation-range:contain ${PHONE_OUT[0]}svh contain ${PHONE_OUT[1]}svh}
    ${NEAR} .cmc-shade{animation:cmc-out linear both;animation-timeline:--cmc-t;animation-range:contain ${SHADE_OUT[0]}svh contain ${SHADE_OUT[1]}svh}
    ${NEAR} .cmc-copy{animation:cmc-out linear both;animation-timeline:--cmc-t;animation-range:contain ${COPY_OUT[0]}svh contain ${COPY_OUT[1]}svh}
    ${NEAR} .cmc-orbit{animation:cmc-spin linear both;animation-timeline:--cmc-t;animation-range:${SPIN_RANGE}}
    ${NEAR} .cmc-face{animation:cmc-unspin linear both,cmc-depth ${TURN_S}s linear infinite;animation-timeline:--cmc-t,auto;animation-range:${SPIN_RANGE};animation-delay:0s,calc(var(--p) * -${TURN_S}s);animation-play-state:running,paused}
    ${NEAR}:not([data-cmc-covered]) .cmc-stage[data-commerce-live] .cmc-face{animation-play-state:running,running}
    ${NEAR} .cmc-w{animation:cmc-word cubic-bezier(.2,.7,.3,1) both;animation-timeline:--cmc-t}
    ${wordRanges()}
  }
  }
}

/*
 * The cards: no ground of their own (round 10), so the held stage shows
 * between them and around them. Nothing held (no scroll timelines, reduced
 * motion): they only lap the stage's foot, so the whole phone is seen first.
 */
.cmc-cards{position:relative;z-index:5;margin-top:-8svh}
.cmc-cover-mark{position:absolute;left:0;right:0;top:clamp(72px,10vh,120px);height:1px;pointer-events:none}
.cmc-cards-in{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin:0 auto;padding:clamp(72px,10vh,120px) var(--edge) clamp(64px,8vw,120px)}

/*
 * The cards' entrance (useEntrances): armed while their box is below the
 * screen, played once it comes up. Transform and opacity, as transitions, so
 * the compositor runs them and a finger on the glass never waits for them.
 */
@media (prefers-reduced-motion:no-preference){
  /* The cards slide up over the phone one after another; the phone steps back under them. */
  .cmc-card{transition:opacity .7s ease,transform 1s cubic-bezier(.16,1,.3,1);transition-delay:calc(var(--ci) * .09s)}
  .cmc[data-cmc-over-armed]:not([data-cmc-over]) .cmc-card{opacity:0;transform:translate3d(0,96px,0);transition-duration:0s;transition-delay:0s}
}
`

const PHONE_CSS = `
/*
 * The screen is the page at 393px, scaled to the drawn phone by one number: the screen's width over 393px. Round 9, the bug
 * the owner saw ("on mobile devices the content of the phone mockup doesn't load"): WebKit works that division out
 * (tan(atan2())) before it knows what a container or viewport unit comes to, so on an iPhone the page was drawn at the
 * wrong size, or not at all inside a card (its width is in cqw). A registered length is computed to pixels first, so the
 * division is of pixels by pixels in every engine.
 */
@property --cmc-len{syntax:"<length>";inherits:true;initial-value:0px}
.cmc-phone{position:relative;pointer-events:none;user-select:none;-webkit-user-select:none;width:var(--pw);aspect-ratio:100/207;border-radius:calc(var(--pw) * .178);padding:calc(var(--pw) * .0135);background:linear-gradient(140deg,#77777c 0%,#36363a 14%,#1d1d20 42%,#232326 62%,#3c3c40 86%,#808086 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 0 calc(var(--pw) * .01) rgba(255,255,255,.12);
  --cmc-len:calc(var(--pw) * .915);--k:tan(atan2(var(--cmc-len),393px))}
.cmc-key{position:absolute;width:calc(var(--pw) * .012);border-radius:2px;background:linear-gradient(90deg,#2a2a2d,#6a6a70 60%,#3a3a3e)}
.cmc-key-act{left:calc(var(--pw) * -.0095);top:17.5%;height:5%}
.cmc-key-up{left:calc(var(--pw) * -.0095);top:25.5%;height:9%}
.cmc-key-dn{left:calc(var(--pw) * -.0095);top:36%;height:9%}
.cmc-key-pw{right:calc(var(--pw) * -.0095);top:28%;height:14%;transform:scaleX(-1)}
.cmc-bezel{height:100%;padding:calc(var(--pw) * .029);border-radius:calc(var(--pw) * .165);background:#030303;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.cmc-screen{position:relative;height:100%;border-radius:calc(var(--pw) * .137);overflow:hidden;background:#fff;color:#1a1a2e}
.cmc-ui{position:absolute;left:0;top:0;width:393px;height:852px;transform-origin:0 0;transform:scale(var(--k));font-size:16px;line-height:1.5;font-family:inherit;text-align:left;-webkit-font-smoothing:antialiased}
.cmc-status{position:absolute;z-index:9;left:0;right:0;top:0;height:3.375em;display:flex;align-items:center;justify-content:space-between;padding:0 1.9em 0 2.35em;font-size:1em;font-weight:600;color:#000}
.cmc-time{font-size:1.0625em;letter-spacing:-.01em;padding-top:.15em}
.cmc-island{position:absolute;z-index:9;left:50%;top:.6875em;width:7.875em;height:2.3125em;margin-left:-3.9375em;border-radius:1.2em;background:#000}
.cmc-icons{display:flex;align-items:center;gap:.32em;padding-top:.15em}
.cmc-batt{position:relative;width:1.6em;height:.78em;border-radius:.26em;border:1.5px solid rgba(0,0,0,.4);padding:1.5px}
.cmc-batt::after{content:"";position:absolute;right:-.2em;top:50%;width:.12em;height:.28em;margin-top:-.14em;border-radius:0 1px 1px 0;background:rgba(0,0,0,.4)}
.cmc-batt span{display:block;width:82%;height:100%;border-radius:.12em;background:#000}
.cmc-home{position:absolute;z-index:9;left:50%;bottom:.5em;width:8.375em;height:.3125em;margin-left:-4.19em;border-radius:1em;background:#0b0b0d}

/* Safari's floating address bar (iOS 26). */
.rc-safari{position:absolute;z-index:6;left:14px;right:14px;bottom:28px;display:flex;align-items:center;gap:10px;height:50px}
.rc-sf-btn,.rc-sf-url{display:flex;align-items:center;justify-content:center;height:50px;border-radius:25px;background:rgba(255,255,255,.97);box-shadow:0 0 0 .5px rgba(0,0,0,.1),0 6px 20px rgba(0,0,0,.12);color:#111}
.rc-sf-btn{flex:none;width:50px}
.rc-sf-url{flex:1;gap:8px;font-size:16px;font-weight:500;letter-spacing:-.01em}

/* checkout-client.tsx on a phone (no lg: classes): the page under the status bar, the white bar, the grey order, the form. */
.pc{position:absolute;inset:0;overflow:hidden;background:#fff;color:#1a1a2e}
.pc-page{padding-top:54px}
.pc-bar{position:relative;z-index:1;display:flex;align-items:center;gap:6px;height:56px;padding:0 16px;background:#fff;box-shadow:0 1px 0 rgba(17,17,19,.055),0 4px 12px -10px rgba(17,17,19,.09)}
.pc-back{flex:none;display:grid;place-items:center;width:44px;height:44px}
.pc-back-f{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;border:1px solid rgba(0,0,0,.06);box-shadow:0 1px 1px rgba(17,17,19,.04),0 1px 3px -1px rgba(17,17,19,.06);box-sizing:border-box}
.pc-who{display:flex;align-items:center;gap:8px;min-width:0;padding:4px 10px 4px 4px;font-size:14px;font-weight:500;white-space:nowrap}
.pc-av{flex:none;width:28px;height:28px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 1px rgba(17,17,19,.06),0 1px 2px rgba(17,17,19,.08)}
.pc-cont{flex:none;margin:0 4px 0 auto;display:inline-flex;align-items:center;height:36px;padding:0 14px;border-radius:9px;border:1px solid #e1e3e7;font-size:13.5px;font-weight:500;white-space:nowrap;box-shadow:0 1px 1px rgba(17,17,19,.04);box-sizing:border-box}
.pc-sum{padding:24px 20px;background:#f8f9fa;border-bottom:1px solid rgba(0,0,0,.06)}
.pc-payto{margin:0;font-size:15px;font-weight:500;color:#6b7280}
.pc-total{margin:4px 0 0;font-size:32px;font-weight:600;line-height:1.25;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.pc-det{display:inline-flex;align-items:center;gap:4px;height:32px;margin-top:12px;padding:0 10px;border-radius:6px;background:#e9ebee;font-size:13px;font-weight:500}
.pc-up{color:#6b7280;transform:rotate(180deg)}
.pc-details{padding-top:24px}
.pc-line{display:flex;align-items:flex-start;gap:14px}
.pc-thumb{flex:none;width:48px;height:48px;overflow:hidden;border-radius:8px;border:1px solid rgba(0,0,0,.06);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.06);box-sizing:border-box}
.pc-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.pc-li{flex:1;min-width:0;display:flex;flex-direction:column}
.pc-li b{font-size:14px;font-weight:500;line-height:1.375}
.pc-li small{margin-top:2px;font-size:12.5px;color:#6b7280}
.pc-lp{flex:none;font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}
.pc-tots{margin-top:24px;padding-top:20px;border-top:1px solid rgba(0,0,0,.07);font-size:14px}
.pc-row{display:flex;justify-content:space-between;gap:16px;font-variant-numeric:tabular-nums}
.pc-strong{font-weight:500}
.pc-promo{display:inline-flex;align-items:center;height:32px;margin-top:12px;padding:0 12px;border-radius:6px;background:#e9ebee;font-size:13px;font-weight:500}
.pc-due{margin-top:20px;padding-top:16px;border-top:1px solid rgba(0,0,0,.07);font-size:15px;font-weight:600}
.pc-form{padding:28px 20px 40px}
/* The express buttons: Stripe's Apple Pay and Google Pay buttons side by side, black, 44px, checkout's 8px corners. */
.pc-xp{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pc-ap{display:flex;align-items:center;justify-content:center;gap:2px;height:44px;border-radius:8px;background:#000;color:#fff;font-size:18px;font-weight:500;letter-spacing:-.01em}
.pc-or{display:flex;align-items:center;gap:12px;margin:24px 0;font-size:13px;color:#6b7280}
.pc-or i{flex:1;height:1px;background:#e5e7eb}
.pc-h{margin-bottom:12px;font-size:16px;font-weight:600}
.pc-gap{margin-top:32px}
.pc-in{display:flex;align-items:center;gap:8px;height:44px;padding:0 14px;border-radius:8px;border:1px solid #e1e3e7;background:#fff;font-size:16px;white-space:nowrap;box-shadow:0 1px 1px rgba(0,0,0,.03),0 3px 6px rgba(0,0,0,.02);box-sizing:border-box}
.pc-ph{color:#a2a7b0}
.pc-sel{justify-content:space-between}
.pc-sel svg{color:#6b7280}
.pc-check{display:flex;align-items:flex-start;gap:10px;margin-top:14px;padding:4px 0;font-size:14px;line-height:1.45;color:#4b5563}
.pc-box{flex:none;width:18px;height:18px;margin-top:1px;border-radius:5px;border:1px solid #c9ccd2;background:#fff;box-shadow:0 1px 1px rgba(0,0,0,.04);box-sizing:border-box}
/* Stripe's Payment Element as checkout dresses it (stripeAppearance): the accordion item, its radio, 13px labels over 8px fields. */
.pc-acc{padding:14px 16px 16px;border-radius:8px;border:1px solid #e1e3e7;box-shadow:0 1px 1px rgba(0,0,0,.03),0 3px 6px rgba(0,0,0,.02)}
.pc-acc-h{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:500}
.pc-acc-h svg{color:#6b7280}
.pc-radio{flex:none;display:grid;place-items:center;width:16px;height:16px;border-radius:50%;border:1px solid #1a1a2e;box-sizing:border-box}
.pc-radio i{width:8px;height:8px;border-radius:50%;background:#1a1a2e}
.pc-lbl{display:block;margin:14px 0 6px;font-size:13px;font-weight:500;color:#4b5563}
.pc-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pc-terms{margin-top:28px}
.pc-terms u{color:#1a1a2e;font-weight:500;text-decoration-color:#c9ccd2;text-underline-offset:2px}
.pc-pay{display:flex;align-items:center;justify-content:center;height:48px;margin-top:20px;border-radius:8px;background:#1a1a2e;color:#fff;font-size:16px;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 1px rgba(0,0,0,.12),0 3px 8px -2px rgba(26,26,46,.35)}
.rc-pow{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0 4px;margin:14px 0 0;padding:6px 0;font-size:12.5px;color:#8b919a}
.rc-pow-s{display:inline-flex;align-items:center;gap:4px;padding:0 4px}
.rc-pow-s svg{margin-top:1px}
.rc-pow i{font-style:normal;color:#c4c8ce;padding:0 4px}

/*
 * The One-tap demo (InstantDemo): a creator's dark page and the instant
 * checkout's window over it, in app/theme-dark.css's colours (the window
 * #18181b, its head #111113, hairlines 7% white, fields 11%, Pay #2d2d33).
 */
.cmc-ui[data-dark] .cmc-status{color:#fff}
.cmc-ui[data-dark] .cmc-batt{border-color:rgba(255,255,255,.45)}
.cmc-ui[data-dark] .cmc-batt::after{background:rgba(255,255,255,.45)}
.cmc-ui[data-dark] .cmc-batt span{background:#fff}
/* The dark screen's own ground is the page's, so a fraction of a pixel left under the scaled page never shows as a light line. */
.cmc-screen[data-dark]{background:#111113}
.ic{position:absolute;inset:0;overflow:hidden;background:#111113;color:#ececee}
.ic-page{display:flex;flex-direction:column;align-items:center;padding:92px 22px 0;text-align:center}
.ic-av{width:88px;height:88px;border-radius:50%;object-fit:cover}
.ic-name{margin-top:14px;font-size:22px;font-weight:600;letter-spacing:-.01em}
.ic-bio{margin-top:4px;font-size:15px;line-height:1.4;color:#9c9da4}
.ic-block{display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;width:100%;margin-top:24px;padding:14px;border-radius:20px;background:#1c1c20;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);box-sizing:border-box;text-align:left}
.ic-cover{display:block;width:96px;height:96px;border-radius:12px;overflow:hidden}
.ic-cover .ebc,.ic-mark .ebc{width:100%;height:100%}
.ic-bt{display:flex;flex-direction:column;justify-content:center;min-width:0}
.ic-bt b{font-size:16px;font-weight:600;line-height:1.3}
.ic-bt small{margin-top:2px;font-size:13.5px;color:#9c9da4}
.ic-bt .ic-price{margin-top:8px;font-size:18px;font-variant-numeric:tabular-nums}
.ic-buy{grid-column:1/-1;display:flex;align-items:center;justify-content:center;height:48px;border-radius:12px;background:#ececee;color:#111113;font-size:16px;font-weight:600}
.ic-link{display:flex;align-items:center;justify-content:center;width:100%;height:56px;margin-top:12px;border-radius:16px;background:#1c1c20;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);box-sizing:border-box;font-size:15px;font-weight:500}
.ic-dim{position:absolute;inset:0;z-index:3;background:#000;opacity:.6}
.ic-sheet{position:absolute;left:0;right:0;top:${IC_SHEET_TOP}px;bottom:0;z-index:4;overflow:hidden;border-radius:28px 28px 0 0;background:#18181b;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.ic-head{position:relative;display:flex;flex-direction:column;align-items:center;padding:22px 20px 20px;background:#111113;border-bottom:1px solid rgba(255,255,255,.07)}
.ic-x{position:absolute;right:10px;top:10px;display:grid;place-items:center;width:44px;height:44px;color:#9c9da4}
.ic-mark{display:block;width:76px;height:76px;margin-top:6px;border-radius:12px;overflow:hidden}
.ic-title{margin-top:10px;font-size:21px;font-weight:600;letter-spacing:-.01em}
.ic-head small{margin-top:2px;font-size:13.5px;color:#9c9da4}
.ic-body{position:relative;padding:20px}
.ic-form{display:flex;flex-direction:column}
.ic-h{margin-bottom:10px;font-size:14.5px;font-weight:600}
.ic-in{display:flex;align-items:center;height:48px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.11);font-size:16px;box-sizing:border-box}
.ic-in+.ic-in{margin-top:10px}
.ic-sum{display:flex;align-items:center;justify-content:space-between;gap:10px;height:48px;margin:20px 0;padding:0 16px;border-radius:12px;border:1px solid rgba(255,255,255,.07);font-size:14px;color:#9c9da4}
.ic-sum b{font-weight:600;color:#ececee;font-variant-numeric:tabular-nums}
.ic-methods{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ic-m{display:flex;align-items:center;justify-content:center;gap:6px;height:48px;border-radius:12px;border:1px solid rgba(255,255,255,.11);font-size:15px;font-weight:500;box-sizing:border-box}
.ic-m[data-on]{border-color:#e4e4e7;box-shadow:0 0 0 1px #e4e4e7}
.ic-m .mk-apple{width:17px;height:17px;margin-top:-3px}
.ic-m svg:not(.mk-apple){width:20px;height:20px;color:#9c9da4}
.ic-pay{display:flex;align-items:center;justify-content:center;height:52px;margin-top:16px;border-radius:12px;background:#2d2d33;color:#fff;font-size:16px;font-weight:600}
.ic .rc-pow{color:#8b8b94}
.ic .rc-pow i{color:#4b4b52}
.ic-done{position:absolute;left:20px;right:20px;top:20px;display:flex;flex-direction:column;align-items:center;padding:26px 20px 24px;border-radius:16px;border:1px solid rgba(255,255,255,.07);text-align:center;opacity:0}
.ic-ok{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgba(167,139,250,.16);color:#c4b5fd}
.ic-done b{margin-top:14px;font-size:18px;font-weight:600}
.ic-done small{margin-top:4px;font-size:14px;line-height:1.45;color:#9c9da4}
.ic-open{display:inline-flex;align-items:center;height:44px;margin-top:18px;padding:0 18px;border-radius:12px;background:#2d2d33;font-size:14px;font-weight:600}
/* The finger's press: on Buy now, then on Pay. */
.pc-touch{position:absolute;z-index:6;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.24);opacity:0}
.ic-t1{left:196px;top:${IC_BUY_Y}px}
.ic-t2{left:196px;top:${IC_PAY_Y}px}
.ap-dim{position:absolute;inset:0;z-index:7;background:#000;opacity:0}
/* Apple Pay's sheet on iOS 26: floating, inset, round. */
.ap-sheet{position:absolute;left:8px;right:8px;bottom:8px;z-index:8;padding:22px 22px 24px;border-radius:44px;background:#fff;box-shadow:0 -10px 40px rgba(0,0,0,.2);transform:translate3d(0,110%,0);font-size:16px;color:#000}
.ap-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.ap-logo{display:inline-flex;align-items:center;gap:2px;font-size:24px;font-weight:600;letter-spacing:-.02em}
.ap-logo svg{width:20px;height:24px;margin-top:-4px}
.ap-x{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#ececee;color:#6e6e73}
.ap-row{display:flex;align-items:center;gap:14px;padding:14px 4px;border-bottom:1px solid #e5e5ea}
.ap-card{flex:none;width:46px;height:30px;border-radius:5px;background:linear-gradient(135deg,#1d3b8b,#0d1b4a);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.ap-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.ap-t b{font-size:16px;font-weight:500}
.ap-t small{font-size:13px;color:#6e6e73}
.ap-chev{flex:none;color:#c7c7cc;transform:rotate(-90deg)}
.ap-sum{display:flex;align-items:baseline;justify-content:space-between;padding:16px 4px 4px;font-size:15px;color:#6e6e73}
.ap-sum b{font-size:28px;font-weight:600;letter-spacing:-.02em;color:#000}
.ap-foot{display:grid;place-items:center;height:92px;margin-top:8px}
.ap-foot>*{grid-area:1/1}
.ap-side{display:flex;flex-direction:column;align-items:center;gap:10px;font-size:15px;color:#3a3a3c}
.ap-btn{width:46px;height:46px;border-radius:12px;border:2.5px solid #0a84ff;box-sizing:border-box;position:relative}
.ap-btn::after{content:"";position:absolute;right:-9px;top:8px;width:4px;height:24px;border-radius:2px;background:#0a84ff}
.ap-done{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:15px;font-weight:500;color:#0a84ff;opacity:0}
/* In dark mode, as iOS draws it on a phone set dark. */
.ic .ap-sheet{background:#1c1c1e;color:#fff;box-shadow:0 -10px 40px rgba(0,0,0,.5)}
.ic .ap-x{background:#2c2c2e;color:#98989f}
.ic .ap-row{border-color:#38383a}
.ic .ap-t small,.ic .ap-sum{color:#98989f}
.ic .ap-sum b{color:#fff}
.ic .ap-side{color:#d1d1d6}
`

/*
 * Round 13: how far down the computer window's page (in u) its scroll ends,
 * so Pay and the Stripe line under it are in view. 1012u was measured before
 * Delivery and Shipping method joined the form; Pay's foot is now at 1284u.
 */
const CDX_PAY_FOOT = 1330

const DESK_CSS = u(`
.cdx{position:absolute;left:3%;right:3%;top:50%;aspect-ratio:var(--ar,880/700);transform:translateY(-50%);container-type:size}
.cdx-win{--u:calc(100cqw / 880);--vh:calc(100cqh - 38u);--s1:min(330u,max(0px,${CDX_PAY_FOOT}u - var(--vh)));--s2:max(0px,${CDX_PAY_FOOT}u - var(--vh));position:relative;height:100%;border-radius:12u;overflow:hidden;background:#fff;color:#1a1a2e;font-size:14u;line-height:1.4;letter-spacing:0;box-shadow:0 0 0 1px rgba(255,255,255,.14)}
.cdx-bar{position:relative;display:flex;align-items:center;justify-content:center;height:38u;background:#ececef;border-bottom:1px solid #dcdce0}
.cdx-lights{position:absolute;left:16u;top:50%;display:flex;gap:8u;transform:translateY(-50%)}
.cdx-lights i{display:block;width:12u;height:12u;border-radius:50%;background:#ff5f57}
.cdx-lights i+i{background:#febc2e}
.cdx-lights i+i+i{background:#28c840}
.cdx-url{display:flex;align-items:center;justify-content:center;gap:7u;width:400u;height:26u;border-radius:8u;background:#fff;font-size:12.5u;color:#4b5563}
.cdx-url svg{width:10u;height:12u;color:#6b7280}
.cdx-view{position:relative;height:calc(100% - 38u);overflow:hidden;background:#f8f9fa}
.cdx-white{position:absolute;top:0;bottom:0;right:0;width:50%;background:#fff;box-shadow:-8u 0 24u -14u rgba(17,24,39,.11)}
.cdx-scroll{position:relative}
.cdx-head{position:relative;z-index:1;display:flex;align-items:center;gap:8u;height:62u;padding:0 40u 0 36u;background:#fff;box-shadow:0 1px 0 rgba(17,17,19,.055),0 4u 12u -10u rgba(17,17,19,.09)}
.cdx-back{display:grid;place-items:center;width:34u;height:34u;margin-right:4u;border-radius:10u;border:1px solid rgba(0,0,0,.06);box-shadow:0 1px 1px rgba(17,17,19,.04),0 1px 3px -1px rgba(17,17,19,.06)}
.cdx-back svg{width:17u;height:17u}
.cdx-av{width:28u;height:28u;border-radius:50%;object-fit:cover;box-shadow:0 0 0 1px rgba(17,17,19,.06)}
.cdx-shop{font-size:14u;font-weight:500}
.cdx-cont{margin-left:auto;display:inline-flex;align-items:center;height:34u;padding:0 13u;border-radius:9u;border:1px solid #e1e3e7;font-size:13u;font-weight:500;box-shadow:0 1px 1px rgba(17,17,19,.04)}
.cdx-grid{display:grid;grid-template-columns:1fr 1fr}
.cdx-sum{padding:44u 44u 0}
.cdx-form{position:relative;padding:44u 44u 60u}
.cdx-payto{font-size:15u;font-weight:500;color:#6b7280}
.cdx-big{display:grid;margin-top:4u;font-size:34u;font-weight:600;line-height:1.2;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.cdx-big>*,.cdx-swap>*{grid-area:1/1}
.cdx-swap{display:inline-grid;justify-items:end}
.cdx-t0,.cdx-s0{opacity:0}
.cdx-lines{display:grid;gap:18u;margin:36u 0 0;padding:0;list-style:none}
.cdx-lines li{display:flex;align-items:flex-start;gap:14u}
.cdx-thumb{position:relative;flex:none;width:48u;height:48u;overflow:hidden;border-radius:8u;border:1px solid rgba(0,0,0,.06);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.cdx-thumb img{width:100%;height:100%;object-fit:cover}
.cdx-li{flex:1;min-width:0;display:flex;flex-direction:column}
.cdx-li b{font-size:14u;font-weight:500;line-height:1.35}
.cdx-li small{margin-top:2u;font-size:13u;color:#6b7280}
.cdx-ctl{display:flex;align-items:center;gap:12u;margin-top:8u;font-size:13u;color:#6b7280}
.cdx-ctl u{text-decoration-color:#d9dce1;text-underline-offset:2u}
.cdx-step{display:inline-flex;align-items:center;height:28u;border-radius:8u;border:1px solid #e1e3e7;box-shadow:0 1px 1px rgba(0,0,0,.03)}
.cdx-step i{width:26u;text-align:center;font-style:normal;color:#4b5563}
.cdx-step em{min-width:20u;text-align:center;font-style:normal;font-weight:500;color:#1a1a2e;font-size:13u}
.cdx-lp{font-weight:500;font-variant-numeric:tabular-nums}
.cdx-tot{margin-top:24u;padding-top:20u;border-top:1px solid rgba(0,0,0,.07)}
.cdx-row{display:flex;justify-content:space-between;gap:16u;margin-top:12u;color:#6b7280;font-variant-numeric:tabular-nums}
.cdx-strong{margin-top:0;font-weight:500;color:#1a1a2e}
.cdx-promo{display:inline-flex;align-items:center;height:30u;margin:12u 0 2u;padding:0 12u;border-radius:6u;background:#e9ebee;font-size:13u;font-weight:500;color:#1a1a2e}
.cdx-due{margin-top:18u;padding-top:16u;border-top:1px solid rgba(0,0,0,.07);font-size:15u;font-weight:600;color:#1a1a2e}
.cdx-express{display:grid;grid-template-columns:1fr 1fr;gap:10u}
.cdx-xp{position:relative;display:flex;align-items:center;justify-content:center;gap:3u;height:44u;border-radius:8u;background:#000;color:#fff;font-size:18u;font-weight:500;letter-spacing:-.01em}
.cdx-or{display:flex;align-items:center;gap:12u;margin:22u 0;font-size:13u;color:#6b7280}
.cdx-or i{flex:1;height:1px;background:#e5e7eb}
.cdx-h{margin-bottom:12u;font-size:16u;font-weight:600}
.cdx-gap{margin-top:30u}
.cdx-f{display:flex;flex-direction:column;min-width:0}
.cdx-f+.cdx-f,.cdx-f+div,div+.cdx-f{margin-top:12u}
.cdx-2>.cdx-f,.cdx-3>.cdx-f{margin-top:0}
.cdx-lbl{margin-bottom:6u;font-size:13u;font-weight:500;color:#4b5563}
.cdx-in{position:relative;display:grid;align-items:center;height:42u;padding:0 14u;border-radius:8u;border:1px solid #e1e3e7;background:#fff;font-size:15u;box-shadow:0 1px 1px rgba(0,0,0,.03),0 3u 6u rgba(0,0,0,.02);white-space:nowrap;overflow:hidden}
.cdx-in>span{grid-area:1/1;overflow:hidden;text-overflow:ellipsis}
.cdx-in[data-select]{padding-right:30u}
.cdx-chev{position:absolute;right:12u;top:50%;width:13u;height:13u;margin-top:-6.5u;color:#6b7280}
.cdx-check{display:flex;align-items:flex-start;gap:10u;margin:14u 0;font-size:14u;color:#4b5563}
.cdx-box{position:relative;flex:none;display:grid;place-items:center;width:18u;height:18u;margin-top:1u;border-radius:5u;border:1px solid #c9ccd2;background:#fff}
.cdx-box svg{position:relative;z-index:1;width:12u;height:12u;color:#fff}
.cdx-box-terms{border-color:#1a1a2e;background:#1a1a2e}
.cdx-2{display:grid;grid-template-columns:1fr 1fr;gap:12u}
.cdx-3{display:grid;grid-template-columns:1.1fr 1.1fr .8fr;gap:12u;margin-top:12u}
.cdx-ship{overflow:hidden;border-radius:8u;border:1px solid #e1e3e7;box-shadow:0 1px 1px rgba(0,0,0,.03),0 3u 6u rgba(0,0,0,.02)}
.cdx-opt{display:flex;align-items:center;gap:12u;padding:12u 14u;font-variant-numeric:tabular-nums}
.cdx-opt+.cdx-opt{border-top:1px solid #e1e3e7}
.cdx-opt[data-sel]{background:#f8f9fa}
.cdx-opt-t{flex:1;display:flex;flex-direction:column}
.cdx-opt b{font-weight:500}
.cdx-opt small{font-size:13u;color:#6b7280}
.cdx-radio{position:relative;flex:none;display:grid;place-items:center;width:16u;height:16u;border-radius:50%;border:1px solid #c9ccd2;background:#fff}
.cdx-radio i{width:8u;height:8u;border-radius:50%;background:#1a1a2e}
.cdx-opt[data-sel] .cdx-radio,.cdx-acc-h .cdx-radio{border-color:#1a1a2e}
.cdx-acc{padding:14u 16u 16u;border-radius:8u;border:1px solid #e1e3e7;box-shadow:0 1px 1px rgba(0,0,0,.03),0 3u 6u rgba(0,0,0,.02)}
.cdx-acc-h{display:flex;align-items:center;gap:10u;margin-bottom:14u;font-weight:500}
.cdx-acc-h svg{width:20u;height:20u;color:#6b7280}
.cdx-terms{margin:22u 0 0}
.cdx-terms u{color:#1a1a2e;font-weight:500;text-decoration-color:#c9ccd2;text-underline-offset:2u}
.cdx-pay{position:relative;display:flex;align-items:center;justify-content:center;height:48u;margin-top:20u;border-radius:8u;background:#1a1a2e;color:#fff;font-size:16u;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 1px rgba(0,0,0,.12),0 3u 8u -2u rgba(26,26,46,.35)}
.cdx-pow{margin-top:14u;text-align:center;font-size:12.5u;color:#8b919a}
.cdx-paid{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:20u;text-align:center;background:#fff;opacity:0}
.cdx-ring{display:block;width:64u;height:64u}
.cdx-ring svg{display:block;width:100%;height:100%}
.cdx-paid b{margin-top:20u;font-size:20u;font-weight:600;letter-spacing:-.01em}
.cdx-paid small{margin-top:4u;font-size:14u;color:#6b7280}
.cdx-paid small+small{font-size:13u}
.cdx .cmv-cursor{position:absolute;left:62%;top:58%;z-index:2;line-height:0;font-size:22u;opacity:0}
`)

/* Round 11 (the owner: "you should not see the phone mockup through them; the cards should not be transparent"): the cards and the facts are solid; the products behind show only in the gaps between them. */
const CARD_GROUND = "#111113"
/* The tallest a card's picture is drawn (a 1440 x 800 screen shows a whole card with room to spare). */
const VIS_CAP = "44svh"

/* The cards and their mocks. Each mock is drawn in em of a 48 x 42 box on every screen, so it scales as one picture. */
const CARDS_CSS = u(`
.cmc-bento{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.cmc-card{position:relative;display:flex;flex-direction:column;gap:clamp(22px,2.4vw,32px);min-width:0;padding:clamp(24px,2.6vw,40px) clamp(24px,2.6vw,40px) clamp(20px,2.2vw,32px);border-radius:28px;background:${CARD_GROUND};border:1px solid rgba(255,255,255,.08);box-sizing:border-box;overflow:hidden;container-type:inline-size;--vis-cap:${VIS_CAP}}
/* Round 9 (the owner: "some orbs, extremely subtle and barely visible, over the four cards; just a little"): two soft lights per card, a violet and a white, as still gradients (no blur, no motion), each card's in its own corner. */
.cmc-card::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(52% 44% at var(--ox,12%) var(--oy,0%),rgba(139,92,246,.085),rgba(139,92,246,0) 72%),radial-gradient(40% 34% at var(--px,96%) var(--py,58%),rgba(255,255,255,.035),rgba(255,255,255,0) 70%)}
.cmc-card[data-k=tap]{--ox:92%;--oy:4%;--px:6%;--py:70%}
.cmc-card[data-k=currency]{--ox:86%;--oy:96%;--px:10%;--py:8%}
.cmc-card[data-k=recover]{--ox:8%;--oy:100%;--px:90%;--py:6%}
.cmc-card-copy{position:relative;z-index:1}
.cmc-card-l{display:block;font-size:13.5px;font-weight:500;color:#8b8b94}
.cmc-card-copy h3{margin:10px 0 0;font-size:clamp(24px,2.3vw,34px);font-weight:400;line-height:1.12;letter-spacing:-.035em;color:#fff;text-wrap:balance}
.cmc-card-copy p{margin:12px 0 0;max-width:46ch;font-size:clamp(15px,1.1vw,17px);line-height:1.55;color:#a1a1aa}
/* A demo is a picture: it takes no pointer and nothing in it can be selected. */
/*
 * Round 10 (the owner, on a 1440 x 800 screen: not oversized): the picture is
 * 48 x 42 as before but never taller than --vis-cap; where it is capped its
 * drawing keeps its shape and sits in the middle of the box.
 */
.cmc-vis{position:relative;z-index:1;margin-top:auto;height:min(calc(100cqw * 42 / 48),var(--vis-cap));overflow:hidden;border-radius:20px;background:#0b0b0d;container-type:inline-size;pointer-events:none;user-select:none;-webkit-user-select:none}
.cmc-vis-in{position:absolute;left:50%;top:0;width:48em;height:42em;margin-left:-24em;font-size:min(calc(100cqw / 48),calc(var(--vis-cap) / 42));color:#fff;line-height:1.35;container-type:inline-size}
/*
 * Round 13 (the owner: on larger screens the checkout window should fill much
 * more of the card's width): Built to convert's drawing is the whole picture,
 * not the 48 x 42 box in its middle, and the window fills it to a thin margin.
 * Its height is whatever the picture leaves, and the page inside scrolls by
 * what that height hides (--vh in .cdx-win), so Pay still comes into view.
 */
@media (min-width:900px){
  .cmc-card[data-k=convert] .cmc-vis-in{left:0;width:100%;height:100%;margin-left:0}
  .cmc-card[data-k=convert] .cdx{inset:clamp(12px,2.4cqw,24px);aspect-ratio:auto;transform:none}
  /* The seller's notice drops in under the window's address bar (38u), not over its address. */
  .cmc-card[data-k=convert] .cmv-sale{top:calc(100cqw * 38 / 880 + .9em);right:1.1em}
}
/* The four facts on one solid strip, the cards' own ground and hairline, so nothing shows through them. */
.cmc-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin:16px 0 0;padding:clamp(28px,3vw,44px) clamp(24px,2.6vw,40px);list-style:none;border-radius:28px;background:${CARD_GROUND};border:1px solid rgba(255,255,255,.08)}
.cmc-fact{padding:2px 0 2px 18px;border-left:1px solid rgba(255,255,255,.16)}
.cmc-fact b{display:block;font-size:clamp(28px,3vw,46px);font-weight:300;line-height:1;letter-spacing:-.045em;color:#fff;white-space:nowrap}
.cmc-fact span{display:block;margin-top:10px;font-size:14px;line-height:1.4;color:#8b8b94}

/* The order lines' pictures: the tee's photo, or the LUT pack's cover filling the box. */
.pc-thumb .ebc,.cdx-thumb .ebc{width:100%;height:100%;aspect-ratio:auto}
.cdx-thumb img,.pc-thumb img{background:#fff}

/* The marks on the express buttons: Apple's logo and "Pay" set as Apple sets it, Google's G and "Pay" as Google does, one height. */
.mk-apple{flex:none;display:block}
.mk-g{flex:none;display:block}
.mk-pay,.mk-gpay{display:block;line-height:1}
.mk-pay{font-family:-apple-system,"SF Pro Text","SF Pro Display",system-ui,inherit;font-weight:500;letter-spacing:-.02em}
.mk-gpay{font-family:"Google Sans","Product Sans",Roboto,system-ui,inherit;font-weight:500;letter-spacing:0}
.pc-ap{gap:4px}
.pc-ap .mk-apple{width:19px;height:19px;margin-top:-4px}
.pc-ap .mk-g{width:19px;height:19px}
.pc-ap .mk-gpay{margin-left:2px}
.cdx-xp .mk-apple{width:calc(19 * var(--u));height:calc(19 * var(--u));margin-top:calc(-4 * var(--u))}
.cdx-xp .mk-g{width:calc(18 * var(--u));height:calc(18 * var(--u));margin-right:calc(2 * var(--u))}
/* The card brands in the field. */
.pc-brands,.tp-brands{display:flex;gap:4px;margin-left:auto}
.pc-brands i,.tp-brands i{display:grid;place-items:center;width:30px;height:20px;border-radius:3px;background:#fff;box-shadow:inset 0 0 0 1px #e1e3e7;font-style:normal}
.pc-brands svg,.tp-brands svg{display:block}
.cb-amex{background:#1f72cd!important;box-shadow:none!important;color:#fff}
.cb-amex b{font-size:7.5px;font-weight:800;letter-spacing:.02em;line-height:1}

/* The seller's notice over the paid window. */
.cmv-sale{position:absolute;right:1.4em;top:1.1em;z-index:4;width:24em;display:flex;gap:.75em;align-items:flex-start;padding:.85em 1em;border-radius:1.25em;background:#26262b;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),0 1em 2.5em rgba(0,0,0,.5);color:#f4f4f5;box-sizing:border-box;opacity:0}
.cmv-sale img{flex:none;width:2.4em;height:2.4em;border-radius:.6em}
.cmv-note-t{flex:1;min-width:0;display:flex;flex-direction:column;font-size:.92em;line-height:1.35}
.cmv-note-top{display:flex;justify-content:space-between;gap:.6em}
.cmv-note-top b{font-weight:600}
.cmv-note-top small{color:#8b8b94}
.cmv-note-p{color:#a1a1aa}

/* One-tap payments: the phone, and the three methods as their buttons. */
.cmv-tap{position:absolute;inset:0}
/* --pw in the demo box's own units (not em): the screen reads it again inside, where 1em is 16px. */
.cmv-phone{position:absolute;left:4.6em;top:2.4em;--pw:calc(100cqw * 17 / 48)}
.cmv-phone .cmc-phone{box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
.tp{position:absolute;left:25.6em;right:3em;top:50%;display:grid;gap:1em;transform:translateY(-50%);--tp-step:4.5em}
.tp-btn{position:relative;display:flex;align-items:center;justify-content:center;gap:.28em;height:3.5em;border-radius:.7em;background:#000;color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2);overflow:hidden}
.tp-apple .mk-apple{width:1.32em;height:1.32em;margin-top:-.26em}
.tp-apple .mk-pay{font-size:1.5em}
.tp-gpay .mk-g{width:1.3em;height:1.3em;margin-right:.08em}
.tp-gpay .mk-gpay{font-size:1.45em}
.tp-card{gap:.55em;padding:0 1em;background:#1c1c20;justify-content:flex-start}
.tp-card>svg{flex:none;width:1.4em;height:1.4em;color:#a1a1aa}
.tp-card-t{font-size:1.1em;font-weight:500}
.tp-brands{gap:.25em;margin-right:2.1em}
.tp-brands i{width:2.1em;height:1.4em;border-radius:.22em}
.tp-brands svg{width:1.7em;height:auto}
.tp-brands .cb-amex b{font-size:.5em}
.tp-pow{display:flex;align-items:center;justify-content:center;gap:.35em;margin-top:.2em;font-size:.95em;color:#8b8b94}
.tp-pow svg{width:2.9em;height:1.2em;color:#d4d4d8;margin-top:.1em}
.tp-ok{position:absolute;right:.9em;top:50%;width:1.45em;height:1.45em;margin-top:-.725em;border-radius:50%;background:#fff;transform:scale(0)}
.tp-ok::after{content:"";position:absolute;left:.5em;top:.3em;width:.36em;height:.62em;border:solid #0b0b0d;border-width:0 .17em .17em 0;transform:rotate(45deg)}
.tp-shine{position:absolute;top:0;bottom:0;left:0;width:45%;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.2) 50%,rgba(255,255,255,0));transform:translate3d(-110%,0,0)}
.tp-ring{position:absolute;left:-.35em;right:-.35em;top:-.35em;height:4.2em;border-radius:1em;box-shadow:0 0 0 1.5px rgba(255,255,255,.6),0 0 1.6em rgba(255,255,255,.08);pointer-events:none}

/* Currencies: the tee and the LUT pack, each currency in turn. */
.cmv-flag{display:block;flex:none;width:1.5em;height:1em;border-radius:.2em;object-fit:cover}
.cv{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:1.3em;padding:0 3.2em}
/*
 * Round 12 (the owner: the card's content "is cut off by its container"): nothing in the picture can grow past its
 * box. Every column may shrink (minmax(0,1fr), min-width:0), and a tile's picture is a square whose photo or cover
 * fills it from outside the flow, so no engine can size the square from what is in it (the cover carries its own
 * aspect-ratio and container, inside a flex column inside a grid: the kind of nesting engines size differently).
 */
.cv-head{display:flex;align-items:center;gap:.6em;min-width:0;font-size:1em}
.cv-head img{width:2em;height:2em;border-radius:50%;object-fit:cover}
.cv-head b{font-weight:600}
.cv-for{display:flex;align-items:center;gap:.35em;min-width:0;margin-left:auto;color:#8b8b94;white-space:nowrap}
.cv-for .cv-stack{color:#f4f4f5;font-weight:500;justify-items:end}
.cv-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.2em}
.cv-tile{display:flex;flex-direction:column;min-width:0;padding:.75em .75em 1em;border-radius:1.3em;background:#1a1a1e;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.cv-pic{position:relative;display:block;width:100%;height:0;padding-bottom:100%;border-radius:.75em;overflow:hidden;background:#fff}
.cv-pic img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}
.cv-pic .ebc{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto}
.cv-name{margin:.8em .2em 0;font-size:1em;font-weight:500;color:#d4d4d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cv-stack{position:relative;display:grid}
.cv-cyc{grid-area:1/1;opacity:0;white-space:nowrap}
.cv-cyc[data-first]{opacity:1}
.cv-tee,.cv-luts{margin:.15em .1em 0;font-size:2em;font-weight:600;letter-spacing:-.03em;line-height:1.15;font-variant-numeric:tabular-nums}
.cv-chips{position:relative;display:grid;grid-template-columns:repeat(${PRICES.length},1fr);padding:.3em;border-radius:1.2em;background:#141416;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.cv-chip{position:relative;display:flex;align-items:center;justify-content:center;gap:.4em;height:2.7em;font-size:.88em;font-weight:600;letter-spacing:.02em;color:#e4e4e7}
.cv-chip .cmv-flag{width:1.35em;height:.9em}
.cv-hl{position:absolute;left:.3em;top:.3em;bottom:.3em;width:calc((100% - .6em) / ${PRICES.length});border-radius:.9em;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}

/* The reminder: three moments on one rail that fills as the hour passes, and the email. */
.cmv-mail{border-radius:1.4em;background:#1a1a1e;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);color:#f4f4f5}
.cmv-rec{position:absolute;inset:0;font-size:1.15em}
.cmv-tl{position:absolute;left:8em;right:6em;top:4.4em;display:grid;grid-template-columns:repeat(3,1fr)}
.cmv-rail{position:absolute;left:.35em;right:calc(33.333% - .35em);top:.25em;height:2px;border-radius:1px;background:rgba(255,255,255,.12);overflow:hidden}
.cmv-fill{position:absolute;inset:0;background:linear-gradient(90deg,#e4e4e7,#a78bfa);transform-origin:0 50%}
.cmv-st{position:relative;display:grid;gap:.1em;padding-top:1.5em;font-size:.85em}
.cmv-st i{position:absolute;left:0;top:0;width:.7em;height:.7em;border-radius:50%;background:#e4e4e7;box-shadow:0 0 0 .25em #0b0b0d}
.cmv-st3 i{background:#a78bfa}
.cmv-st b{font-weight:500;color:#f4f4f5;white-space:nowrap}
.cmv-st small{font-size:.9em;color:#8b8b94}
/* Round 12: the email alone under the rail, in the middle of the picture. */
.cmv-mail{position:absolute;left:8em;right:8em;top:9.6em;padding:1.4em 1.6em;box-sizing:border-box}
.cmv-mail-from{display:flex;align-items:center;gap:.7em}
.cmv-mail-from img{width:2.3em;height:2.3em;border-radius:50%;object-fit:cover}
.cmv-mail-from b{display:block;font-size:.95em;font-weight:600}
.cmv-mail-from small{display:block;font-size:.8em;color:#8b8b94}
.cmv-mail-subj{margin-top:.9em;padding-bottom:.9em;border-bottom:1px solid rgba(255,255,255,.08);font-size:.9em;font-weight:500;color:#d4d4d8}
.cmv-mail-h{margin-top:.75em;font-size:1.6em;font-weight:500;letter-spacing:-.025em}
.cmv-mail p{margin:.45em 0 0;font-size:.9em;line-height:1.55;color:#a1a1aa}
.cmv-mail-btn{display:flex;align-items:center;justify-content:center;width:10.5em;height:2.6em;margin-top:1.1em;border-radius:1.3em;background:#fff;color:#18181b;font-size:.9em;font-weight:600}
.cmv-mail-line{display:flex;align-items:center;gap:.7em;margin-top:1.2em;padding-top:1em;border-top:1px solid rgba(255,255,255,.08);font-size:.9em;color:#d4d4d8}
.cmv-thumb{flex:none;width:2.4em;height:2.4em;border-radius:.4em;overflow:hidden;background:#fff}
.cmv-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.cmv-mail-line>span:not(.cmv-thumb){flex:1}
.cmv-mail-line b{font-weight:600;color:#fff}
@media (max-width:899px){
  /*
   * Round 11 (the owner: on a phone the pictures were "broken and cut", "they
   * should not be a carousel: just normal stacked cards on phones"): one card
   * under another, each picture whole (round 13: the computer's picture,
   * smaller, not a layout of its own).
   */
  .cmc-bento{grid-template-columns:minmax(0,1fr);gap:12px}
  .cmc-card{padding:22px 20px 20px;border-radius:24px;gap:20px}
  .cmc-card-copy h3{font-size:24px}
  .cmc-card-copy p{font-size:15px}
  /* Landing round 13 (the owner: "like it's on desktop, but on mobile"): every picture is the computer's, 48 x 42 em, only smaller, nothing laid out again. */
  .cmc-vis{height:auto;aspect-ratio:48/42;margin:0 -6px;border-radius:16px}
  .cmc-vis-in{font-size:calc(100cqw / 48)}
  /* Built to convert: the computer's window filling the picture, as from 900px; the picture runs to 8px from the card's edge and the window to 6px from the picture's (the owner: fill the card's width on a phone too). */
  .cmc-card[data-k=convert] .cmc-vis{margin:0 -12px;border-radius:16px}
  .cmc-card[data-k=convert] .cmc-vis-in{left:0;width:100%;height:100%;margin-left:0}
  .cmc-card[data-k=convert] .cdx{inset:6px;aspect-ratio:auto;transform:none}
  .cmc-card[data-k=convert] .cmv-sale{top:calc(100cqw * 38 / 880 + .9em);right:1.1em}
  .cmc-facts{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 16px;margin-top:12px;padding:24px 20px;border-radius:24px}
  .cmc-fact{padding-left:14px}
  .cmc-fact b{font-size:26px}
  .cmc-fact span{font-size:13.5px}
}
`)

/*
 * THE DEMOS LOOP. Each card's demo is one ${LOOP_S}s cycle of transform and
 * opacity keyframes that ends where it began and starts over, for as long as
 * its card is on screen in a visible tab (data-commerce-live on the card).
 * Off screen the rules below do not match, so nothing runs, each mock rests
 * on its finished frame, and it starts from the top when it comes back.
 */
/** Built to convert: a value typed at `t` (its placeholder going as it comes), held until the reset under the paid screen. */
const RESET = 9.05
const ON = ".cmc-card[data-commerce-live]"
const typed = (k: string, t: number) =>
  `@keyframes cdx-v-${k}{0%,${at(t)}{opacity:0}${at(t + 0.35)},${at(RESET)}{opacity:1}${at(RESET + 0.05)},100%{opacity:0}}
${ON} .cdx-v-${k}{animation-name:cdx-v-${k}}`
const FIELDS: [string, number][] = [
  ["email", 0.5],
  ["first", 0.85],
  ["last", 1.05],
  ["addr", 1.45],
  ["city", 1.65],
  ["zip", 1.85],
  ["card", 4.45],
  ["exp", 4.65],
  ["cvc", 4.8],
]
/* Local currencies: seven readings in one loop, each in its slot. */
const N_CUR = PRICES.length
const SLOT = 100 / N_CUR
const pct = (v: number) => `${f3(v)}%`
/** The currencies' own loop: CUR_STEP_S for each reading. */
const CUR_STEP_S = 2
const CUR_S = N_CUR * CUR_STEP_S
/** The cross fade between two readings, as a share of the loop. */
const FADE = (0.5 / CUR_S) * 100
const cycKeyframes = `@keyframes cv-cyc{0%{opacity:0;transform:translate3d(0,.32em,0)}${pct(FADE)},${pct(SLOT)}{opacity:1;transform:translate3d(0,0,0)}${pct(SLOT + FADE)},100%{opacity:0;transform:translate3d(0,-.32em,0)}}`
/* The marker rests under each currency and glides to the next while the readings cross fade; from the last back to the first it glides across the loop's seam, half before it and half after. */
const hlKeyframes = `@keyframes cv-hl{0%{transform:translate3d(${(N_CUR - 1) * 50}%,0,0)}${PRICES.map((_, i) => `${pct(i * SLOT + FADE)},${pct((i + 1) * SLOT - (i === N_CUR - 1 ? FADE : 0))}{transform:translate3d(${i * 100}%,0,0)}`).join("")}100%{transform:translate3d(${(N_CUR - 1) * 50}%,0,0)}}`

/** A finger's press at `t`: a soft ring that comes and spreads. */
const touch = (t: number) => `0%,${at(t - 0.05)}{opacity:0;transform:scale(.4)}${at(t + 0.08)}{opacity:1;transform:scale(1)}${at(t + 0.5)},100%{opacity:0;transform:scale(1.4)}`
/** A button pressed at `t`, down to `k`. */
const press = (t: number, k: number) => `0%,${at(t)}{transform:scale(1)}${at(t + 0.12)}{transform:scale(${k})}${at(t + 0.34)},100%{transform:scale(1)}`
/* Built to convert: the form fills, the page scrolls to the shipping, it is chosen and the totals settle, on down to the card, Pay, paid, the seller's notice, and back to the top under the paid screen. */
const LOOP_CSS = u(`
@media (prefers-reduced-motion:no-preference){
  ${ON} :where(.cdx-v,.cdx-scroll,.cdx-sum-in,.cdx-radio i,.cdx-s0,.cdx-s1,.cdx-t0,.cdx-t1,.cdx-box-terms,.cmv-cursor,.cdx-pay,.cdx-paid,.cdx-ring,.cdx-paid b,.cdx-paid small,.cmv-sale,.pc-touch,.ic-dim,.ic-sheet,.ic-form,.ic-done,.ic-pay,.ic-buy,.ap-dim,.ap-sheet,.ap-side,.ap-done,.tp-ring,.tp-btn,.tp-ok,.tp-shine,.cv-cyc,.cv-hl,.cmv-rec,.cmv-fill,.cmv-st,.cmv-mail,.cmv-mail-btn){animation-duration:${LOOP_S}s;animation-iteration-count:infinite;animation-fill-mode:both;animation-timing-function:cubic-bezier(.22,1,.36,1)}
  ${ON} .cdx-v-country,${ON} .cdx-v-state{animation-name:none}
  ${FIELDS.map(([k, t]) => typed(k, t)).join("\n  ")}
  ${ON} .cdx-scroll{animation-name:cdx-scroll}
  ${ON} .cdx-sum-in{animation-name:cdx-stick}
  ${ON} .cdx-opt[data-sel] .cdx-radio i{animation-name:cdx-sel}
  ${ON} .cdx-s0{animation-name:cdx-s0}
  ${ON} .cdx-s1{animation-name:cdx-s1}
  ${ON} .cdx-t0{animation-name:cdx-s0}
  ${ON} .cdx-t1{animation-name:cdx-s1}
  ${ON} .cdx-box-terms{animation-name:cdx-terms}
  ${ON} .cdx .cmv-cursor{animation-name:cdx-cur}
  ${ON} .cdx-pay{animation-name:cdx-press}
  ${ON} .cdx-paid{animation-name:cdx-paid}
  ${ON} .cdx-ring{animation-name:cdx-ring}
  ${ON} .cdx-paid b,${ON} .cdx-paid small{animation-name:cdx-paidt}
  ${ON} .cmv-sale{animation-name:cmv-sale}

  ${ON} .ic-t1{animation-name:ic-t1}
  ${ON} .ic-t2{animation-name:ic-t2}
  ${ON} .ic-buy{animation-name:ic-buy}
  ${ON} .ic-pay{animation-name:ic-pay}
  ${ON} .ic-dim{animation-name:ic-dim}
  ${ON} .ic-sheet{animation-name:ic-sheet;animation-timing-function:linear}
  ${ON} .ic-form{animation-name:ic-form}
  ${ON} .ic-done{animation-name:ic-done}
  ${ON} .ap-dim{animation-name:ap-dim}
  ${ON} .ap-sheet{animation-name:ap-sheet}
  ${ON} .ap-side{animation-name:ap-side}
  ${ON} .ap-done{animation-name:ap-done}
  ${ON} .tp-ring{animation-name:tp-ring;animation-timing-function:cubic-bezier(.65,0,.35,1)}
  ${ON} .tp-shine{animation-name:tp-shine;animation-timing-function:ease-in-out}
  ${ON} .tp-apple{animation-name:tp-press1}
  ${ON} .tp-gpay{animation-name:tp-press2}
  ${ON} .tp-card{animation-name:tp-press3}
  ${ON} .tp-apple .tp-ok{animation-name:tp-ok1}
  ${ON} .tp-gpay .tp-ok{animation-name:tp-ok2}
  ${ON} .tp-card .tp-ok{animation-name:tp-ok3}

  ${ON} .cv-cyc{animation-name:cv-cyc;animation-duration:${CUR_S}s;animation-delay:calc(var(--i) * ${CUR_STEP_S}s);animation-timing-function:ease-in-out}
  ${ON} .cv-hl{animation-name:cv-hl;animation-duration:${CUR_S}s;animation-timing-function:cubic-bezier(.65,0,.35,1)}

  ${ON} .cmv-rec{animation-name:cmv-rec;animation-timing-function:ease}
  ${ON} .cmv-fill{animation-name:cmv-fill;animation-timing-function:cubic-bezier(.45,0,.2,1)}
  ${ON} .cmv-st1{animation-name:cmv-st1}
  ${ON} .cmv-st2{animation-name:cmv-st2}
  ${ON} .cmv-st3{animation-name:cmv-st3}
  ${ON} .cmv-mail{animation-name:cmv-mail;animation-timing-function:cubic-bezier(.16,1,.3,1)}
  ${ON} .cmv-mail-btn{animation-name:cmv-btn}
}
@keyframes cdx-scroll{0%,${at(1.95)}{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.65,0,.35,1)}${at(2.95)},${at(3.45)}{transform:translate3d(0,calc(var(--s1) * -1),0);animation-timing-function:cubic-bezier(.65,0,.35,1)}${at(4.4)},${at(RESET)}{transform:translate3d(0,calc(var(--s2) * -1),0)}${at(RESET + 0.05)},100%{transform:translate3d(0,0,0)}}
@keyframes cdx-stick{0%,${at(1.95)}{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.65,0,.35,1)}${at(2.95)},${at(3.45)}{transform:translate3d(0,max(0px,calc(var(--s1) - 62u)),0);animation-timing-function:cubic-bezier(.65,0,.35,1)}${at(4.4)},${at(RESET)}{transform:translate3d(0,max(0px,calc(var(--s2) - 62u)),0)}${at(RESET + 0.05)},100%{transform:translate3d(0,0,0)}}
@keyframes cdx-sel{0%,${at(3)}{opacity:0;transform:scale(.4)}${at(3.25)},${at(RESET)}{opacity:1;transform:scale(1)}${at(RESET + 0.05)},100%{opacity:0;transform:scale(.4)}}
@keyframes cdx-s0{0%,${at(3.1)}{opacity:1}${at(3.3)},${at(RESET)}{opacity:0}${at(RESET + 0.05)},100%{opacity:1}}
@keyframes cdx-s1{0%,${at(3.15)}{opacity:0;transform:translate3d(0,8u,0)}${at(3.5)},${at(RESET)}{opacity:1;transform:translate3d(0,0,0)}${at(RESET + 0.05)},100%{opacity:0;transform:translate3d(0,8u,0)}}
@keyframes cdx-terms{0%,${at(5)}{opacity:0;transform:scale(.6)}${at(5.2)},${at(RESET)}{opacity:1;transform:scale(1)}${at(RESET + 0.05)},100%{opacity:0;transform:scale(.6)}}
@keyframes cdx-cur{0%,${at(5.05)}{opacity:0;transform:translate3d(90u,70u,0)}${at(5.25)}{opacity:1}${at(5.7)}{opacity:1;transform:translate3d(0,0,0) scale(1)}${at(5.8)}{opacity:1;transform:translate3d(0,0,0) scale(.85)}${at(5.95)}{opacity:1;transform:translate3d(0,0,0) scale(1)}${at(6.3)},100%{opacity:0;transform:translate3d(0,0,0) scale(1)}}
@keyframes cdx-press{0%,${at(5.75)}{transform:scale(1)}${at(5.85)}{transform:scale(.97)}${at(6)},100%{transform:scale(1)}}
@keyframes cdx-paid{0%,${at(6.05)}{opacity:0}${at(6.35)},${at(9.3)}{opacity:1}${at(9.8)},100%{opacity:0}}
@keyframes cdx-ring{0%,${at(6.2)}{opacity:0;transform:scale(.5)}${at(6.6)},100%{opacity:1;transform:scale(1)}}
@keyframes cdx-paidt{0%,${at(6.35)}{opacity:0;transform:translate3d(0,8u,0)}${at(6.75)},100%{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-sale{0%,${at(6.9)}{opacity:0;transform:translate3d(0,-1em,0)}${at(7.4)},${at(9.2)}{opacity:1;transform:translate3d(0,0,0)}${at(9.6)},100%{opacity:0;transform:translate3d(0,-.4em,0)}}
/*
 * One-tap payments. The loop starts and ends with the checkout open, so it
 * never jumps as it starts over: a tap on Pay with Apple Pay, Apple Pay's
 * sheet up, Done, the sheet away, the window's Payment complete; the window
 * goes down to the page, a tap on Buy now, and it comes up again.
 */
@keyframes ic-t2{${touch(0.7)}}
@keyframes ic-t1{${touch(7.9)}}
@keyframes ic-pay{${press(0.75, 0.97)}}
@keyframes ic-buy{${press(7.95, 0.97)}}
@keyframes ap-dim{0%,${at(1)}{opacity:0}${at(1.5)},${at(3.2)}{opacity:.32}${at(3.65)},100%{opacity:0}}
@keyframes ap-sheet{0%,${at(1)}{transform:translate3d(0,110%,0)}${at(1.6)},${at(3.2)}{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.5,0,.75,0)}${at(3.65)},100%{transform:translate3d(0,110%,0)}}
@keyframes ap-side{0%,${at(2.2)}{opacity:1}${at(2.4)},${at(3.7)}{opacity:0}${at(3.9)},100%{opacity:1}}
@keyframes ap-done{0%,${at(2.3)}{opacity:0;transform:scale(.7)}${at(2.7)},${at(3.7)}{opacity:1;transform:scale(1)}${at(3.9)},100%{opacity:0;transform:scale(.7)}}
@keyframes ic-form{0%,${at(3.3)}{opacity:1}${at(3.6)},${at(6.95)}{opacity:0}${at(7)},100%{opacity:1}}
@keyframes ic-done{0%,${at(3.5)}{opacity:0;transform:translate3d(0,10px,0)}${at(3.95)},${at(6.95)}{opacity:1;transform:translate3d(0,0,0)}${at(7)},100%{opacity:0;transform:translate3d(0,10px,0)}}
@keyframes ic-sheet{0%,${at(6.35)}{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.55,0,.8,.2)}${at(6.9)},${at(8.15)}{transform:translate3d(0,105%,0);animation-timing-function:cubic-bezier(.16,1,.3,1)}${at(8.9)},100%{transform:translate3d(0,0,0)}}
@keyframes ic-dim{0%,${at(6.35)}{opacity:.6}${at(6.9)},${at(8.15)}{opacity:0}${at(8.7)},100%{opacity:.6}}
/* The three buttons: a light passes over Apple Pay, it is pressed with the phone's tap and checked once paid; the ring moves on to Google Pay and the card, each pressed and checked; all back for the next loop. */
@keyframes tp-shine{0%,${at(0.1)}{transform:translate3d(-110%,0,0)}${at(0.65)},100%{transform:translate3d(240%,0,0)}}
@keyframes tp-ring{0%,${at(4.4)}{transform:translate3d(0,0,0)}${at(4.9)},${at(5.7)}{transform:translate3d(0,var(--tp-step),0)}${at(6.2)},${at(8.3)}{transform:translate3d(0,calc(var(--tp-step) * 2),0)}${at(8.85)},100%{transform:translate3d(0,0,0)}}
@keyframes tp-press1{${press(0.75, 0.96)}}
@keyframes tp-press2{${press(5, 0.96)}}
@keyframes tp-press3{${press(6.45, 0.96)}}
@keyframes tp-ok1{0%,${at(3.6)}{transform:scale(0)}${at(3.95)},${at(8.3)}{transform:scale(1)}${at(8.6)},100%{transform:scale(0)}}
@keyframes tp-ok2{0%,${at(5.25)}{transform:scale(0)}${at(5.6)},${at(8.3)}{transform:scale(1)}${at(8.6)},100%{transform:scale(0)}}
@keyframes tp-ok3{0%,${at(6.7)}{transform:scale(0)}${at(7.05)},${at(8.3)}{transform:scale(1)}${at(8.6)},100%{transform:scale(0)}}
/* Local currencies: each reading in turn, the marker stepping along under it. */
${cycKeyframes}
${hlKeyframes}
/* Checkout reminders: left at Pay, the rail fills to the hour, the email comes up, Finish checkout, paid; then the whole demo fades and starts over (one fade, not each part on its own). */
@keyframes cmv-rec{0%{opacity:0}${at(0.3)},${at(9.35)}{opacity:1}${at(9.8)},100%{opacity:0}}
@keyframes cmv-fill{0%,${at(0.35)}{transform:scaleX(0)}${at(1.15)},${at(4.1)}{transform:scaleX(.5)}${at(4.7)},100%{transform:scaleX(1)}}
@keyframes cmv-st1{0%,${at(0.2)}{opacity:.35}${at(0.5)},100%{opacity:1}}
@keyframes cmv-st2{0%,${at(0.95)}{opacity:.35}${at(1.25)},100%{opacity:1}}
@keyframes cmv-st3{0%,${at(4.55)}{opacity:.35}${at(4.85)},100%{opacity:1}}
@keyframes cmv-mail{0%,${at(0.8)}{opacity:0;transform:translate3d(0,1.4em,0)}${at(1.6)},100%{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-btn{0%,${at(3.8)}{transform:scale(1)}${at(3.95)}{transform:scale(.94)}${at(4.2)},100%{transform:scale(1)}}
`)

/* The mocks' resting states, where no loop runs: paid, the notice in, the checks on. */
const REST_CSS = `
.cdx .cdx-paid{opacity:1}
.cmv-sale{opacity:1}
.tp-ok{transform:scale(1)}
`

/* Still: the finished scene, nothing pinned or moving. */
const STILL_CSS = `
@media (prefers-reduced-motion:reduce){
  .cmc-cards{margin-top:0}
  .cmc[data-story-section] > .cmc-track.cmc-track{height:auto}
  .cmc-stage *{transition:none!important;animation:none!important}
  .cmc-card{transition:none!important}
}
`

const CHECKOUT_CSS = SCENE_CSS + PHONE_CSS + DESK_CSS + CARDS_CSS + LOOP_CSS + REST_CSS + STILL_CSS

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CHECKOUT_STYLES: readonly SectionStyle[] = [
  COMMERCE_KIT_STYLE,
  { href: "w13-ebook-cover", precedence: "default", css: EBOOK_COVER_CSS },
  { href: "w12-commerce-checkout", precedence: "default", css: CHECKOUT_CSS },
]
