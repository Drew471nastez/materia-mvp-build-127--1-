"use client"

/**
 * ===========================================================================
 *  CHECKOUT THAT TURNS A TAP INTO A SALE (home, section 9, landing round 4)
 * ===========================================================================
 * Black, with a fine dot grid. The owner's order, as he asked for it:
 *
 *   1. the phone     an iPhone with Storelib's instant checkout on it rises
 *                    from the bottom of the screen as the section comes up,
 *                    and stays there (the stage is pinned)
 *   2. the orbit     six things creators sell (an e-book, a cap, a course, a
 *                    tee, a membership, a record) ride a ring around the
 *                    phone, turning in 3D, behind it
 *   3. the headline  once the phone has settled, its words come in one after
 *                    another
 *   4. the tabs      scrolling on, the four tabs (Built to convert, One-tap
 *                    payments, Local currencies, Checkout reminders) rise
 *                    over the phone like a sheet; the phone sinks back and
 *                    fades into them
 *
 * The scroll never presses Pay or steps through a payment: the phone shows
 * the checkout, still. Each tab has its own small demo, which loops while it
 * is the open one and on screen: the website's checkout on a computer from
 * the empty form to Payment complete and the seller's sale notice, a phone
 * with Apple Pay, Google Pay and Stripe, one cap's price read in five
 * currencies, the reminder email an hour after a checkout left at Pay.
 *
 * MOTION, CHEAPLY.
 *   scroll   CSS scroll-driven animations on two view timelines (the track,
 *            and the tab cards, shared through timeline-scope), transform
 *            and opacity only, run by the compositor and reversible by
 *            construction. Where a browser has no view timelines, two
 *            IntersectionObservers set data-cmc-in and data-cmc-over once
 *            per crossing, and the same states play as CSS transitions. No
 *            scroll listener, no layout read, no React state per frame.
 *   orbit    every product rides one ellipse: one baked lap of keyframes
 *            (40 points, depth as scale and opacity, a slow 3D turn), each
 *            product at its own place on it by a negative delay, and a cross
 *            fade with a pre-blurred webp at the back (never a live filter).
 *            Paused off screen and in a background tab (data-commerce-live).
 *   reduced  no pinning, no rise, no orbit: the finished picture.
 *
 * TRUE FIGURES. The desktop window is the website checkout as
 * app/(storelib)/checkout/site/site-checkout.tsx lays it out (the order on
 * the grey half, paying on the white half, Apple Pay and Google Pay as
 * express buttons, Powered by Stripe, Payment complete); the seller's notice
 * is the in-app sale notification (lib/notify/templates/catalog.ts, "New
 * sale", "<buyer> bought <thing> for <total>."). The phone's window is
 * components/checkout/instant-checkout.tsx. The currencies are ones fees are
 * written for (lib/payments/fees/currency-rules). The reminder is
 * lib/physical/email-templates checkoutReminderEmail's words, sent an hour
 * after a checkout that did not finish, only to buyers who ticked the box
 * (lib/automations/abandoned.ts). Prices are examples.
 */
import { StorelibLogo } from "@/components/brand/storelib-logo"
import type { SectionStyle } from "./lazy-section"
import { Fragment, memo, useEffect, useRef, useState } from "react"
import { COMMERCE_CURRENCY_COUNT, COMMERCE_KIT_STYLE, CommerceKitStyle, useCommerceLive, useCommerceReducedMotion } from "./commerce-kit"
import { EBOOK, EBOOK_COVER_CSS, EbookCover, EbookCoverStyle } from "./ebook-cover"
import { u } from "./showcase-mocks/frame"

const IMG = "/home/commerce"
const HOW = "/home/how"
const PRODUCT = EBOOK.title
const SELLER = EBOOK.author
/** The physical product the demos sell beside the e-book: an embroidered cap, made when it is ordered. */
const CAP = { title: "Darkroom cap", option: "Yellow", price: "$28.00", img: `${HOW}/cap-yellow.webp` } as const

export const CHECKOUT_HEADING = "Checkout that turns a tap into a sale"

/**
 * The orbiting products: the size of the object inside its files (for lining
 * the sharp and the blurred file up), how wide it is drawn on a computer and
 * on a phone (phones show four), its place on the ring (phase 0 to 1, and a
 * second set for phones), how far out it rides (k), a small lift off the
 * ring, and how far it leans as it turns. Digital and physical take turns.
 */
const FLOATS = [
  { id: "ebook", obj: [165, 220], w: "clamp(96px,9.5vw,156px)", wm: "27vw", ph: 0, phm: 0, k: 1, oy: "-2svh", r: -8, m: true },
  { id: "cap", obj: [220, 142], w: "clamp(130px,13vw,215px)", wm: "36vw", ph: 1 / 6, phm: 0.25, k: 0.95, oy: "1svh", r: 8, m: true },
  { id: "course", obj: [220, 195], w: "clamp(120px,12vw,200px)", wm: "0px", ph: 2 / 6, phm: 0, k: 1.03, oy: "-1svh", r: -5, m: false },
  { id: "tee", obj: [151, 220], w: "clamp(100px,10.5vw,170px)", wm: "29vw", ph: 3 / 6, phm: 0.5, k: 0.98, oy: "2svh", r: 7, m: true },
  { id: "club", obj: [220, 143], w: "clamp(120px,12.5vw,205px)", wm: "0px", ph: 4 / 6, phm: 0, k: 0.96, oy: "1svh", r: 9, m: false },
  { id: "vinyl", obj: [220, 159], w: "clamp(130px,14vw,230px)", wm: "37vw", ph: 5 / 6, phm: 0.75, k: 1.02, oy: "0svh", r: -6, m: true },
] as const
const BLUR_PAD = 24

const TABS = [
  {
    id: "convert",
    label: "Built to convert",
    stat: "1 page",
    title: "One page, then paid",
    body: "No account to make. Contact, delivery and payment on one page, every cost in view before Pay. The buyer gets the receipt, you get the sale.",
  },
  {
    id: "tap",
    label: "One-tap payments",
    stat: "1 tap",
    title: "Apple Pay and Google Pay, built in",
    body: "The wallet on their device comes first, cards sit beside it, and every payment runs on Stripe.",
  },
  {
    id: "currency",
    label: "Local currencies",
    stat: `${COMMERCE_CURRENCY_COUNT} currencies`,
    title: "Prices people read without a calculator",
    body: "Your website can show prices in a visitor's own currency and charge in it.",
  },
  {
    id: "recover",
    label: "Checkout reminders",
    stat: "1 hour",
    title: "Bring back the ones who almost bought",
    body: "Left at Pay? If they ticked the box for emails, a reminder goes out an hour later, and stops the moment they buy.",
  },
] as const
type TabId = (typeof TABS)[number]["id"]
/** One demo, start to finish, in seconds. Every tab's loop is this long, and so is a tab's turn when they play by themselves. */
const LOOP_S = 10
const AUTO_MS = LOOP_S * 1000
/** A moment of the loop (seconds) as a keyframe offset. */
const at = (sec: number) => `${Math.round((sec / LOOP_S) * 10000) / 100}%`

/**
 * Where the browser has no view timelines: two observers, each setting one
 * attribute when its edge is crossed (never per frame). data-cmc-in once the
 * track's top is two thirds up the screen (the phone rises, the headline
 * comes in); data-cmc-over once the cards' top is past 70% of the screen
 * (the phone fades behind them). Both go back the other way.
 */
function useFallbackStates(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver !== "function") return
    if (typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: view()")) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const track = root.querySelector<HTMLElement>(".cmc-track")
    const cards = root.querySelector<HTMLElement>(".cmc-cards")
    if (!track || !cards) return
    root.setAttribute("data-cmc-js", "")
    const flag = (name: string) => (entries: IntersectionObserverEntry[]) => {
      const e = entries[entries.length - 1]
      /* Past the line (or still on screen above it): on. Below it: off. */
      root.toggleAttribute(name, e.isIntersecting || e.boundingClientRect.top < 0)
    }
    const a = new IntersectionObserver(flag("data-cmc-in"), { rootMargin: "0px 0px -34% 0px" })
    const b = new IntersectionObserver(flag("data-cmc-over"), { rootMargin: "0px 0px -30% 0px" })
    a.observe(track)
    b.observe(cards)
    return () => {
      a.disconnect()
      b.disconnect()
      root.removeAttribute("data-cmc-js")
      root.removeAttribute("data-cmc-in")
      root.removeAttribute("data-cmc-over")
    }
  }, [rootRef])
}

export function CheckoutScene() {
  const rootRef = useRef<HTMLElement>(null)
  const [trackRef] = useCommerceLive<HTMLDivElement>("120px 0px", false)
  const reduced = useCommerceReducedMotion()
  useFallbackStates(rootRef)
  const words = CHECKOUT_HEADING.split(" ")

  return (
    <section ref={rootRef} className="cmc" data-story-section="checkout" aria-labelledby="cmc-title">
      <CommerceKitStyle />
      <EbookCoverStyle />
      <style href="w12-commerce-checkout" precedence="default">
        {CHECKOUT_CSS}
      </style>
      <span className="cmc-dots" aria-hidden="true" />
      <div ref={trackRef} className="cmc-track">
        <div className="cmc-stage">
          <div className="cmc-copy">
            <h2 id="cmc-title" className="cmc-title">
              {words.map((w, i) => (
                <Fragment key={i}>
                  <span className="cmc-w" data-w={i}>
                    {w}
                  </span>
                  {i < words.length - 1 ? " " : null}
                </Fragment>
              ))}
            </h2>
          </div>

          <div className="cmc-phone-wrap">
            <div className="cmc-floats" aria-hidden="true">
              <div className="cmc-orbit">
                {FLOATS.map((f) => (
                  <div
                    key={f.id}
                    className="cmc-o"
                    data-m={f.m || undefined}
                    style={{ "--w": f.w, "--wm": f.wm, "--ph": f.ph, "--phm": f.phm, "--k": f.k, "--oy": f.oy, "--r": `${f.r}deg` } as React.CSSProperties}
                  >
                    <div className="cmc-lap">
                      <div className="cmc-obj" style={{ aspectRatio: `${f.obj[0]} / ${f.obj[1]}` }}>
                        <img
                          className="cmc-soft"
                          src={`${IMG}/float-${f.id}-blur.webp`}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={f.obj[0] + BLUR_PAD * 2}
                          height={f.obj[1] + BLUR_PAD * 2}
                          style={{
                            left: `${(-BLUR_PAD / f.obj[0]) * 100}%`,
                            top: `${(-BLUR_PAD / f.obj[1]) * 100}%`,
                            width: `${((f.obj[0] + BLUR_PAD * 2) / f.obj[0]) * 100}%`,
                            height: `${((f.obj[1] + BLUR_PAD * 2) / f.obj[1]) * 100}%`,
                          }}
                        />
                        <img className="cmc-sharp" src={`${IMG}/float-${f.id}.webp`} alt="" loading="lazy" decoding="async" width={f.obj[0] * 2} height={f.obj[1] * 2} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cmc-rise">
              <div className="cmc-sink">
                <Phone label={`A Storelib checkout on a phone (an iPhone): ${PRODUCT}, an e-book by ${SELLER}, $19.00, with Apple Pay.`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <CheckoutTabs reduced={reduced} />
    </section>
  )
}

/* ── The phone: a modern iPhone, drawn in em so it scales ─────────────── */

function StatusBar() {
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
      <span className="cmc-home" />
    </>
  )
}

/** The iPhone: titanium band, black border, Dynamic Island, the status bar, Storelib's checkout. */
function Phone({ label, wallets = false }: { label?: string; wallets?: boolean }) {
  return (
    <div className="cmc-phone" role={label ? "img" : undefined} aria-label={label}>
      <span className="cmc-key cmc-key-act" />
      <span className="cmc-key cmc-key-up" />
      <span className="cmc-key cmc-key-dn" />
      <span className="cmc-key cmc-key-pw" />
      <div className="cmc-bezel">
        <div className="cmc-screen" aria-hidden="true">
          <div className="cmc-ui">
            <CheckoutUI wallets={wallets} />
            <StatusBar />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Storelib's instant checkout, as components/checkout/instant-checkout.tsx
 * and checkout-window.tsx draw it, in em (1em = 16px of the real window). With
 * `wallets`, the wallet button and Pay take turns: Apple Pay, Google Pay,
 * then the card (the One-tap payments demo).
 */
function CheckoutUI({ wallets }: { wallets: boolean }) {
  return (
    <div className="ck">
      <div className="ck-head">
        <div className="ck-top">
          <span className="ck-x">
            <svg viewBox="0 0 20 20" width="1.25em" height="1.25em" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M5 5l10 10M15 5 5 15" />
            </svg>
          </span>
        </div>
        <EbookCover className="ck-mark" />
        <div className="ck-title">{PRODUCT}</div>
        <div className="ck-sub">{SELLER}</div>
      </div>
      <div className="ck-body">
        <div className="ck-form">
          <div className="ck-sec">
            <div className="ck-h3">Your details</div>
            <div className="ck-field">
              <span className="ck-val">sam.rivera@mail.com</span>
            </div>
            <div className="ck-field">
              <span className="ck-val">Sam Rivera</span>
            </div>
            <div className="ck-opt">
              <span className="ck-box">
                <svg viewBox="0 0 12 12" width="0.62em" height="0.62em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2.5 6.3 2.3 2.3 4.7-5" />
                </svg>
              </span>
              Email me news and offers
            </div>
          </div>
          <div className="ck-sum">
            <span className="ck-sum-t">{PRODUCT}</span>
            <b>$19.00</b>
          </div>
          <div className="ck-sec">
            <div className="ck-h3">Payment method</div>
            <div className="ck-methods">
              {wallets ? <span className="ck-ring" /> : null}
              <span className="ck-m" data-on={wallets ? undefined : ""}>
                <span className="ck-stack">
                  <span className="ck-w ck-mw-a">
                    <AppleMark />
                    Pay
                  </span>
                  {wallets ? (
                    <span className="ck-w ck-mw-g">
                      <GoogleMark />
                      Pay
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="ck-m">
                <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2.25" />
                  <path d="M2.75 9.5h18.5M6.5 15h3" strokeLinecap="round" />
                </svg>
                Card
              </span>
            </div>
            <div className="ck-pay">
              <span className="ck-stack">
                <span className="ck-w ck-w-a">Pay $19.00 with Apple Pay</span>
                {wallets ? (
                  <>
                    <span className="ck-w ck-w-g">Pay $19.00 with Google Pay</span>
                    <span className="ck-w ck-w-c">Pay $19.00</span>
                  </>
                ) : null}
              </span>
            </div>
          </div>
          <div className="ck-terms">
            By paying you agree to the <u>Terms</u>. Your receipt and access come by email.
          </div>
        </div>
      </div>
    </div>
  )
}

function AppleMark() {
  return (
    <svg viewBox="0 0 17 20" width="0.95em" height="1.12em" fill="currentColor">
      <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.8 1.3 10.3.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.2zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
    </svg>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="1.1em" height="1.1em">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  )
}

/** Stripe's wordmark, drawn as text in its own colour (the mark a seller sees when they connect payouts). */
function StripeMark() {
  return <span className="cmv-stripe">stripe</span>
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

/* ── The dark tab cards ──────────────────────────────────────────────── */

function CheckoutTabs({ reduced }: { reduced: boolean }) {
  const [cardsRef, live] = useCommerceLive<HTMLDivElement>("0px 0px")
  const [active, setActive] = useState<TabId>("convert")
  const [held, setHeld] = useState(false)
  const [touched, setTouched] = useState(false)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const auto = live && !reduced && !held && !touched

  useEffect(() => {
    if (!auto) return
    const t = window.setTimeout(() => {
      const i = TABS.findIndex((x) => x.id === active)
      setActive(TABS[(i + 1) % TABS.length].id)
    }, AUTO_MS)
    return () => window.clearTimeout(t)
  }, [auto, active])

  const pick = (id: TabId) => {
    setTouched(true)
    setActive(id)
  }
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!d && e.key !== "Home" && e.key !== "End") return
    e.preventDefault()
    const n = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + d + TABS.length) % TABS.length
    pick(TABS[n].id)
    refs.current[n]?.focus()
  }

  /* On a phone the pills can be wider than the screen: the chosen one is brought to the middle of its own row (never the page). */
  useEffect(() => {
    const list = listRef.current
    const tab = refs.current[TABS.findIndex((x) => x.id === active)]
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return
    list.scrollTo({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" })
  }, [active, reduced])

  return (
    <div ref={cardsRef} className="cmc-cards" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocusCapture={() => setHeld(true)} onBlurCapture={() => setHeld(false)}>
      <div className="cmc-cards-in">
        <div className="cmc-tabs">
          <div ref={listRef} role="tablist" aria-label="What checkout does" className="cmc-tablist">
            {TABS.map((t, i) => {
              const on = t.id === active
              return (
                <button
                  key={t.id}
                  ref={(n) => {
                    refs.current[i] = n
                  }}
                  id={`cmc-tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls={`cmc-panel-${t.id}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => pick(t.id)}
                  onKeyDown={(e) => onKey(e, i)}
                  className="cmc-tab"
                  data-on={on || undefined}
                >
                  {on ? <span key={`${t.id}-${auto}`} className="cmc-tab-fill" data-run={auto || undefined} style={{ animationDuration: `${AUTO_MS}ms` }} aria-hidden="true" /> : null}
                  <span className="cmc-tab-l">{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="cmc-panels">
          {TABS.map((t) => (
            <Panel key={t.id} id={t.id} on={t.id === active} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * One tab's panel. Memoised: the tabs' own state (the hover that holds the
 * autoplay, the cards coming on and off screen) re-renders the tab list only,
 * never the four demos, so scrolling past under a still mouse costs nothing.
 */
const Panel = memo(function Panel({ id, on }: { id: TabId; on: boolean }) {
  const t = TABS.find((x) => x.id === id)!
  return (
    <div id={`cmc-panel-${t.id}`} role="tabpanel" aria-labelledby={`cmc-tab-${t.id}`} className="cmc-panel" data-on={on || undefined} inert={!on}>
      <div className="cmc-panel-copy">
        <span className="cmc-panel-stat">{t.stat}</span>
        <h3>{t.title}</h3>
        <p>{t.body}</p>
      </div>
      <div className="cmc-vis" aria-hidden="true">
        <div className="cmc-vis-in">{t.id === "convert" ? <VisConvert /> : t.id === "tap" ? <VisTap /> : t.id === "currency" ? <VisCurrency /> : <VisRecover />}</div>
      </div>
    </div>
  )
})

/* ── Built to convert: the website's checkout on a computer ──────────── */

type Line = { id: string; img: string; title: string; option?: string; price: string; physical: boolean }
const CART: Line[] = [
  { id: "cap", img: CAP.img, title: CAP.title, option: CAP.option, price: CAP.price, physical: true },
  { id: "ebook", img: `${IMG}/ebook-night.webp`, title: PRODUCT, price: "$19.00", physical: false },
]
/* $28.00 + $19.00 = $47.00; + $6.00 shipping + $3.76 tax (8% of the goods, an example) = $56.76. */
const SUB = "$47.00"
const TOTAL = "$56.76"
const SHOP_HOST = "nadiabrooks.storelib.com"

/** A field as the checkout draws one: the label above, the box, the placeholder until it is filled. */
function Field({ label, value, ph, k, select = false }: { label?: string; value: string; ph?: string; k: string; select?: boolean }) {
  return (
    <div className="cdx-f">
      {label ? <span className="cdx-lbl">{label}</span> : null}
      <span className="cdx-in" data-select={select || undefined}>
        {ph ? <span className={`cdx-ph cdx-ph-${k}`}>{ph}</span> : null}
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
 * The website checkout (site-checkout.tsx) at a desktop width, drawn at a
 * design width of 880 in `u`: the shop's bar, the order on the grey half
 * with each line, Subtotal, Shipping, Tax and Total due, paying on the white
 * half (Apple Pay and Google Pay, Contact, Delivery, Shipping method, Card,
 * Terms, Pay, Powered by Stripe), then Payment complete and the seller's
 * notice. One loop: the form fills, the page scrolls down to Pay, paid, and
 * back to the top under the paid screen.
 */
function VisConvert() {
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
              <img className="cdx-av" src={`${IMG}/creator-nadia.webp`} alt="" loading="eager" decoding="async" width={56} height={56} />
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
                        <span className="cdx-thumb" data-cut={l.id === "cap" || undefined}>
                          <img src={l.img} alt="" loading="eager" decoding="async" width={96} height={96} />
                        </span>
                        <span className="cdx-li">
                          <b>{l.title}</b>
                          {l.option ? <small>{l.option}</small> : <small>E-book, PDF</small>}
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
                        <span className="cdx-s1">$6.00</span>
                      </span>
                    </div>
                    <div className="cdx-row">
                      <span>Tax</span>
                      <span className="cdx-swap">
                        <span className="cdx-s0">Calculated next</span>
                        <span className="cdx-s1">$3.76</span>
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
                    Pay
                  </span>
                  <span className="cdx-xp">
                    <GoogleMark />
                    Pay
                  </span>
                </div>
                <div className="cdx-or">
                  <i />
                  OR
                  <i />
                </div>
                <div className="cdx-h">Contact information</div>
                <Field value="sam.rivera@mail.com" ph="you@example.com" k="email" />
                <div className="cdx-check">
                  <span className="cdx-box" />
                  Email me with news and offers
                </div>
                <div className="cdx-2">
                  <Field label="First name" value="Sam" ph="Jane" k="first" />
                  <Field label="Last name" value="Rivera" ph="Smith" k="last" />
                </div>
                <div className="cdx-h cdx-gap">Delivery</div>
                <Field label="Country/region" value="United States" k="country" select />
                <Field label="Address" value="214 Mercer Street" ph="Street and number" k="addr" />
                <div className="cdx-3">
                  <Field label="City" value="New York" ph="City" k="city" />
                  <Field label="State" value="New York" k="state" select />
                  <Field label="ZIP code" value="10012" ph="ZIP" k="zip" />
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
                    <b>$6.00</b>
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
                  <Field label="Card number" value="4242 4242 4242 4242" ph="1234 1234 1234 1234" k="card" />
                  <div className="cdx-2">
                    <Field label="Expiration date" value="08 / 29" ph="MM / YY" k="exp" />
                    <Field label="Security code" value="314" ph="CVC" k="cvc" />
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
            <span className="cdx-ring">
              <svg viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="29" fill="none" stroke="#1a1a2e" strokeWidth="3" />
                <path d="M20 33.5l8 8 16-17" fill="none" stroke="#1a1a2e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
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
            Sam Rivera bought {CAP.title} and 1 more for {TOTAL}.
          </span>
        </span>
      </div>
    </div>
  )
}

/* ── One-tap payments: the phone, and the three it pays with ─────────── */

function VisTap() {
  return (
    <div className="cmv-tap">
      <div className="cmv-phone">
        <Phone wallets />
      </div>
      <div className="cmv-links">
        <span className="cmv-link cmv-link-a">
          <span className="cmv-link-m cmv-link-ap">
            <AppleMark />
            Pay
          </span>
          <span className="cmv-link-t">
            <b>Apple Pay</b>
            <small>Face ID, one tap</small>
          </span>
          <i className="cmv-ok" />
        </span>
        <span className="cmv-link cmv-link-g">
          <span className="cmv-link-m cmv-link-gp">
            <GoogleMark />
            Pay
          </span>
          <span className="cmv-link-t">
            <b>Google Pay</b>
            <small>Android and Chrome</small>
          </span>
          <i className="cmv-ok" />
        </span>
        <span className="cmv-link cmv-link-s">
          <span className="cmv-link-m cmv-link-st">
            <StripeMark />
          </span>
          <span className="cmv-link-t">
            <b>Stripe</b>
            <small>Cards and payouts</small>
          </span>
          <i className="cmv-ok" />
        </span>
      </div>
    </div>
  )
}

/* ── Local currencies: one cap, five readings ────────────────────────── */

/* Example prices for one $28 cap as each currency would show it. */
const PRICES = [
  { code: "USD", flag: "US", where: "United States", price: "$28.00" },
  { code: "EUR", flag: "EU", where: "Euro area", price: "€26.00" },
  { code: "GBP", flag: "GB", where: "United Kingdom", price: "£22.00" },
  { code: "JPY", flag: "JP", where: "Japan", price: "¥4,300" },
  { code: "CAD", flag: "CA", where: "Canada", price: "C$38.00" },
] as const

function Flag({ code }: { code: string }) {
  return <img className="cmv-flag" src={`/flags/${code}.svg`} alt="" loading="eager" decoding="async" width={21} height={14} />
}

function VisCurrency() {
  return (
    <div className="cmv-cur">
      <div className="cmv-cc">
        <span className="cmv-cc-pic">
          <img src={CAP.img} alt="" loading="eager" decoding="async" width={600} height={600} />
        </span>
        <div className="cmv-cc-b">
          <b className="cmv-cc-name">{CAP.title}</b>
          <small className="cmv-cc-sub">Embroidered cap · {SELLER}</small>
          <span className="cmv-stack cmv-price">
            {PRICES.map((p, i) => (
              <span key={p.code} className="cmv-cyc" data-first={i === 0 || undefined} style={{ "--i": i } as React.CSSProperties}>
                {p.price}
              </span>
            ))}
          </span>
          <span className="cmv-stack cmv-where">
            {PRICES.map((p, i) => (
              <span key={p.code} className="cmv-cyc" data-first={i === 0 || undefined} style={{ "--i": i } as React.CSSProperties}>
                {p.where}
              </span>
            ))}
          </span>
        </div>
        <div className="cmv-chips">
          <span className="cmv-hl" />
          {PRICES.map((p) => (
            <span key={p.code} className="cmv-chip">
              <Flag code={p.flag} />
              {p.code}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Checkout reminders: left at Pay, the email an hour later, paid ──── */

function VisRecover() {
  return (
    <div className="cmv-rec">
      <div className="cmv-tl">
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
          <b>Paid {CAP.price}</b>
          <small>3:31 PM</small>
        </span>
      </div>
      <div className="cmv-mail">
        <div className="cmv-mail-from">
          <img src={`${IMG}/creator-nadia.webp`} alt="" loading="eager" decoding="async" width={64} height={64} />
          <span>
            <b>{SELLER}</b>
            <small>to Sam · 3:14 PM</small>
          </span>
        </div>
        <div className="cmv-mail-subj">You left {CAP.title} at checkout</div>
        <div className="cmv-mail-h">Still thinking it over?</div>
        <p>Hi Sam, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off.</p>
        <span className="cmv-mail-btn">Finish checkout</span>
        <div className="cmv-mail-line">
          <span className="cmv-thumb">
            <img src={CAP.img} alt="" loading="eager" decoding="async" width={96} height={96} />
          </span>
          <span>{CAP.title}</span>
          <b>{CAP.price}</b>
        </div>
      </div>
    </div>
  )
}

/* ── Styles ──────────────────────────────────────────────────────────── */

/**
 * ONE LAP OF THE RING, BAKED. Each product rides the same keyframes, a
 * negative delay putting it at its own place on the lap: 40 points of an
 * ellipse (x = -cos, y = sin, so the front of the ring is its lower half),
 * the depth that goes with each point (smaller and dimmer at the back), and a
 * slow 3D turn, five to a lap, so the loop closes on itself with no seam. One
 * animated layer per product moves it, and two cross fade its sharp and its
 * pre-blurred file with the depth: compositor work only.
 */
const LAP_POINTS = 40
function orbitKeyframes(): string {
  const f = (v: number) => String(+v.toFixed(3))
  let lap = ""
  let sharp = ""
  let soft = ""
  for (let i = 0; i <= LAP_POINTS; i++) {
    const t = (i / LAP_POINTS) * Math.PI * 2
    const x = -Math.cos(t)
    const y = Math.sin(t)
    const d = (1 + y) / 2
    const turn = t * 5
    const pt = `${f((i / LAP_POINTS) * 100)}%`
    lap += `${pt}{transform:perspective(900px) translate3d(calc(var(--rk) * ${f(x)}),calc(var(--ry) * ${f(y)} + var(--oy)),0) scale(${f(0.6 + 0.46 * d)}) rotateX(${f(11 * Math.sin(turn + 1.3))}deg) rotateY(${f(24 * Math.sin(turn))}deg) rotateZ(calc(var(--r) * ${f(Math.cos(turn))}));opacity:${f(0.42 + 0.58 * d)}}`
    sharp += `${pt}{opacity:${f(Math.min(1, d * 2))}}`
    soft += `${pt}{opacity:${f(Math.min(1, Math.max(0, (0.62 - d) / 0.37)))}}`
  }
  return `@keyframes cmc-lap{${lap}}\n@keyframes cmc-focus-sharp{${sharp}}\n@keyframes cmc-focus-soft{${soft}}\n`
}

const WORDS = CHECKOUT_HEADING.split(" ").length
/* The headline's words: each comes in over its own short stretch of scroll, a little after the one before. */
const wordRanges = () =>
  Array.from({ length: WORDS }, (_, i) => `.cmc-w[data-w="${i}"]{animation-range:contain ${2 + i * 2.2}% contain ${12 + i * 2.2}%}`).join("\n")
const wordDelays = () => Array.from({ length: WORDS }, (_, i) => `.cmc-w[data-w="${i}"]{transition-delay:${0.25 + i * 0.05}s}`).join("\n")

/*
 * The scene. The track is a screen of stage plus 100vh of scroll, the stage
 * pinned in it (position: sticky). The tab cards come after it pulled 60vh
 * up, over the stage, so they rise over the pinned phone for the last
 * stretch of the pin. A view timeline on each (the cards' shared to the
 * stage through timeline-scope) drives the rise, the words and the fade.
 */
const SCENE_CSS = `
.cmc{position:relative;background:#000;color:#fff;border-radius:clamp(28px,4vw,56px);overflow:clip;padding-block:0!important;isolation:isolate;timeline-scope:--cmc-cards}
.cmc-dots{position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(rgba(255,255,255,.13) 1px,transparent 1.4px);background-size:22px 22px;background-position:11px 11px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 35%,#000 20%,transparent 75%);mask-image:radial-gradient(ellipse 70% 60% at 50% 35%,#000 20%,transparent 75%)}
.cmc[data-story-section] > .cmc-track.cmc-track{position:relative;z-index:1;max-width:none;margin:0;padding:0;height:calc(100svh + 100vh);view-timeline-name:--cmc}
.cmc-stage{position:sticky;top:0;height:100svh;overflow:hidden;
  --hd:60px;--pw:min(66vw,300px,calc((100svh - 270px) / 2.07));
  --rx:47vw;--ry:30svh;--lap:64s}
.cmc-copy{position:absolute;z-index:4;left:20px;right:20px;top:calc(var(--hd) + clamp(14px,3svh,32px));text-align:center}
.cmc-title{margin:0 auto;font-size:clamp(30px,8.6vw,46px);font-weight:300;line-height:1.04;letter-spacing:-.045em;text-wrap:balance;color:#fff}
.cmc-w{display:inline-block}
.cmc-phone-wrap{position:absolute;z-index:3;left:50%;bottom:20px;width:var(--pw);margin-left:calc(var(--pw) / -2)}
.cmc-rise{position:relative;z-index:2}

/* The orbit, centred on the phone, behind it. */
.cmc-floats{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}
.cmc-orbit{position:absolute;left:0;top:0;width:0;height:0}
.cmc-o{position:absolute;left:0;top:0;width:var(--w);transform:translate(-50%,-50%);--rk:calc(var(--rx) * var(--k))}
.cmc-lap,.cmc-sharp,.cmc-soft{animation:cmc-lap var(--lap) linear infinite both;animation-delay:calc(var(--ph) * var(--lap) * -1);animation-play-state:paused}
.cmc-obj{position:relative}
.cmc-obj img{position:absolute;display:block;max-width:none}
.cmc-sharp{inset:0;width:100%;height:100%;animation-name:cmc-focus-sharp}
.cmc-soft{animation-name:cmc-focus-soft}
.cmc-track[data-commerce-live] :is(.cmc-lap,.cmc-sharp,.cmc-soft){animation-play-state:running}
${orbitKeyframes()}

@media (min-width:900px){
  .cmc-stage{--hd:68px;--pw:min(340px,calc((100svh - 170px) / 2.07));--rx:min(19vw,280px);--ry:31svh}
  .cmc-copy{left:max(var(--landing-gutter,48px),calc(50% - 600px));right:auto;width:min(44vw,560px);top:calc(50% + var(--hd) / 2);transform:translateY(-50%);text-align:left}
  .cmc-title{margin:0;font-size:clamp(42px,4.5vw,72px)}
  .cmc-phone-wrap{left:auto;right:max(calc(var(--landing-gutter,48px) + 60px),calc(50% - 470px));bottom:auto;top:calc(50% + var(--hd) / 2);margin:0;transform:translateY(-50%)}
}
@media (max-width:899px){
  .cmc-o{width:var(--wm)}
  .cmc-o:not([data-m]){display:none}
  .cmc-lap,.cmc-sharp,.cmc-soft{animation-delay:calc(var(--phm) * var(--lap) * -1)}
}

/* The tab cards: a black ground that fades in from transparent at its top edge, so the phone sinks into it. */
.cmc[data-story-section] > .cmc-cards.cmc-cards{position:relative;z-index:5;max-width:none;margin:-60vh 0 0;padding:0;view-timeline-name:--cmc-cards;background:linear-gradient(180deg,rgba(0,0,0,0),#000 clamp(90px,14vh,160px))}
.cmc-cards-in{max-width:1320px;margin:0 auto;padding:clamp(56px,8vh,96px) var(--landing-gutter,clamp(20px,5vw,72px)) clamp(64px,8vw,120px)}

/* Scroll driven, where the browser runs it on the compositor. */
@media (prefers-reduced-motion:no-preference){
  @supports (animation-timeline:view()){
    .cmc-rise{animation:cmc-rise linear both;animation-timeline:--cmc;animation-range:entry 35% entry 100%}
    .cmc-sink{animation:cmc-sink linear both;animation-timeline:--cmc-cards;animation-range:entry 14% entry 72%}
    .cmc-floats{animation:cmc-orbit-in linear both;animation-timeline:--cmc;animation-range:entry 45% entry 100%}
    .cmc-orbit{animation:cmc-orbit-out linear both;animation-timeline:--cmc-cards;animation-range:entry 14% entry 80%}
    .cmc-w{animation:cmc-word linear both;animation-timeline:--cmc}
    ${wordRanges()}
    .cmc-title{animation:cmc-copy-out linear both;animation-timeline:--cmc-cards;animation-range:entry 10% entry 45%}
    .cmc-cards-in{animation:cmc-lift linear both;animation-timeline:--cmc-cards;animation-range:entry 0% entry 60%}
  }
}
@keyframes cmc-rise{from{transform:translate3d(0,62%,0) scale(.94)}to{transform:translate3d(0,0,0) scale(1)}}
@keyframes cmc-sink{from{transform:translate3d(0,0,0) scale(1);opacity:1}to{transform:translate3d(0,8%,0) scale(.92);opacity:0}}
@keyframes cmc-orbit-in{from{opacity:0;transform:translate3d(0,22svh,0) scale(.9)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes cmc-orbit-out{from{opacity:1}to{opacity:.3}}
@keyframes cmc-word{from{opacity:0;transform:translate3d(0,.32em,0)}to{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmc-copy-out{from{opacity:1;transform:translate3d(0,0,0)}to{opacity:0;transform:translate3d(0,-3vh,0)}}
@keyframes cmc-lift{from{transform:translate3d(0,6vh,0) scale(.97)}to{transform:translate3d(0,0,0) scale(1)}}

/* The same states without view timelines: set by two observers, played as transitions. */
.cmc[data-cmc-js] .cmc-rise{transform:translate3d(0,62%,0) scale(.94);transition:transform .9s cubic-bezier(.22,1,.36,1)}
.cmc[data-cmc-js] .cmc-floats{opacity:0;transform:translate3d(0,22svh,0) scale(.9);transition:transform 1.1s cubic-bezier(.22,1,.36,1),opacity .8s ease}
.cmc[data-cmc-js] .cmc-w{opacity:0;transform:translate3d(0,.32em,0);transition:transform .7s cubic-bezier(.22,1,.36,1),opacity .6s ease}
${wordDelays()}
.cmc[data-cmc-js] .cmc-title,.cmc[data-cmc-js] .cmc-orbit{transition:opacity .6s ease}
.cmc[data-cmc-js] .cmc-sink{transition:transform .8s cubic-bezier(.22,1,.36,1),opacity .6s ease}
.cmc[data-cmc-js][data-cmc-in] .cmc-rise{transform:translate3d(0,0,0) scale(1)}
.cmc[data-cmc-js][data-cmc-in] .cmc-floats{opacity:1;transform:translate3d(0,0,0) scale(1)}
.cmc[data-cmc-js][data-cmc-in] .cmc-w{opacity:1;transform:translate3d(0,0,0)}
.cmc[data-cmc-js][data-cmc-over] .cmc-sink{opacity:0;transform:translate3d(0,8%,0) scale(.92)}
.cmc[data-cmc-js][data-cmc-over] .cmc-orbit{opacity:.3}
.cmc[data-cmc-js][data-cmc-over] .cmc-title{opacity:0}
`

/* The iPhone and the checkout window inside it. */
const PHONE_CSS = `
.cmc-phone{position:relative;pointer-events:none;user-select:none;-webkit-user-select:none;width:var(--pw);aspect-ratio:100/207;border-radius:calc(var(--pw) * .178);padding:calc(var(--pw) * .0135);background:linear-gradient(140deg,#77777c 0%,#36363a 14%,#1d1d20 42%,#232326 62%,#3c3c40 86%,#808086 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 0 calc(var(--pw) * .01) rgba(255,255,255,.12),0 calc(var(--pw) * .08) calc(var(--pw) * .16) rgba(0,0,0,.6)}
.cmc-key{position:absolute;width:calc(var(--pw) * .012);border-radius:2px;background:linear-gradient(90deg,#2a2a2d,#6a6a70 60%,#3a3a3e)}
.cmc-key-act{left:calc(var(--pw) * -.0095);top:17.5%;height:5%}
.cmc-key-up{left:calc(var(--pw) * -.0095);top:25.5%;height:9%}
.cmc-key-dn{left:calc(var(--pw) * -.0095);top:36%;height:9%}
.cmc-key-pw{right:calc(var(--pw) * -.0095);top:28%;height:14%;transform:scaleX(-1)}
.cmc-bezel{height:100%;padding:calc(var(--pw) * .029);border-radius:calc(var(--pw) * .165);background:#030303;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.cmc-screen{position:relative;height:100%;border-radius:calc(var(--pw) * .137);overflow:hidden;background:#fff;container-type:inline-size;color:#1a1a2e;transform:translateZ(0)}
.cmc-ui{position:absolute;inset:0;font-size:calc(100cqw * 16 / 393);font-family:inherit;line-height:1.35;-webkit-font-smoothing:antialiased}
.cmc-status{position:absolute;left:0;right:0;top:0;height:3.375em;display:flex;align-items:center;justify-content:space-between;padding:0 1.9em 0 2.35em;font-size:1em;font-weight:600;color:#000}
.cmc-time{font-size:1.0625em;letter-spacing:-.01em;padding-top:.15em}
.cmc-island{position:absolute;left:50%;top:.6875em;width:7.875em;height:2.3125em;margin-left:-3.9375em;border-radius:1.2em;background:#000}
.cmc-icons{display:flex;align-items:center;gap:.32em;padding-top:.15em}
.cmc-batt{position:relative;width:1.6em;height:.78em;border-radius:.26em;border:1.5px solid rgba(0,0,0,.4);padding:1.5px}
.cmc-batt::after{content:"";position:absolute;right:-.2em;top:50%;width:.12em;height:.28em;margin-top:-.14em;border-radius:0 1px 1px 0;background:rgba(0,0,0,.4)}
.cmc-batt span{display:block;width:82%;height:100%;border-radius:.12em;background:#000}
.cmc-home{position:absolute;left:50%;bottom:.5em;width:8.375em;height:.3125em;margin-left:-4.19em;border-radius:1em;background:#0b0b0d}

.ck{position:relative;height:100%;background:#fff;color:#1a1a2e;line-height:1.4;text-align:left}
.ck-head{display:flex;flex-direction:column;align-items:center;text-align:center;padding:3.6875em 1.25em 1.25em;background:#f8f9fa;border-bottom:1px solid #eef0f2}
.ck-top{align-self:stretch;display:flex;justify-content:flex-end;align-items:center;height:2.75em;margin-right:-.5em;color:#4b5563}
.ck-x{display:grid;place-items:center;width:2.75em;height:2.75em}
.ck-mark{width:4.25em;margin-top:-.75em;border-radius:.5em;box-shadow:0 0 0 1px rgba(17,17,19,.06),0 .4em 1em -.4em rgba(17,17,19,.35)}
.ck-title{margin-top:.6em;font-size:1.3125em;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.ck-sub{margin-top:.15em;font-size:.84375em;color:#6b7280}
.ck-body{position:relative;padding:1.25em 1.25em 0}
.ck-form{display:flex;flex-direction:column;gap:1.25em}
.ck-sec{display:flex;flex-direction:column;gap:.625em}
.ck-h3{font-size:.90625em;font-weight:600}
.ck-field{display:grid;align-items:center;height:3em;padding:0 .875em;border:1px solid #e1e3e7;border-radius:.75em;white-space:nowrap}
.ck-opt{display:flex;align-items:center;gap:.625em;padding:.2em 0;font-size:.84375em;color:#4b5563}
.ck-box{display:grid;place-items:center;width:1.15em;height:1.15em;border-radius:.25em;background:#1a1a2e;color:#fff}
.ck-sum{display:flex;align-items:center;gap:.5em;min-height:3.43em;padding:0 1.14em;border:1px solid #e5e7eb;border-radius:.857em;font-size:.875em}
.ck-sum-t{flex:1;min-width:0;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ck-sum b{font-weight:600}
.ck-methods{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:.625em}
.ck-m{display:flex;align-items:center;justify-content:center;gap:.4em;height:3.2em;border:1px solid #e1e3e7;border-radius:.8em;font-size:.9375em;font-weight:500}
.ck-m[data-on]{border-color:#1a1a2e;box-shadow:0 0 0 1px #1a1a2e}
.ck-ring{position:absolute;left:0;top:0;z-index:1;width:calc(50% - .3125em);height:3em;border-radius:.75em;box-shadow:0 0 0 2px #1a1a2e;pointer-events:none}
.ck-stack{display:inline-grid;place-items:center}
.ck-stack>*{grid-area:1/1}
.ck-w{display:inline-flex;align-items:center;gap:.25em;white-space:nowrap}
.ck-w-g,.ck-w-c,.ck-mw-g{opacity:0}
.ck-pay{position:relative;display:flex;align-items:center;justify-content:center;height:3.25em;margin-top:.375em;border-radius:.75em;background:#1a1a2e;color:#fff;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 2px rgba(16,24,40,.2)}
.ck-terms{margin-top:-.4em;text-align:center;font-size:.71875em;line-height:1.6;color:#8b919a}
.ck-terms u{text-decoration-color:#d1d5db;text-underline-offset:2px}
`

/*
 * Built to convert, the website checkout at a desktop width (880 design
 * units in u, showcase-mocks/frame.tsx): its resting picture is the form
 * filled and paid, which is what reduced motion and a panel not yet shown
 * draw.
 */
const DESK_CSS = u(`
.cdx{position:absolute;left:3%;right:3%;top:4.5%;container-type:inline-size;--pt:210;--s1:330;--s2:700}
.cdx-win{--u:calc(100cqw / 880);position:relative;height:1100u;border-radius:12u 12u 0 0;overflow:hidden;background:#fff;color:#1a1a2e;font-size:14u;line-height:1.4;letter-spacing:0;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 24u 60u rgba(0,0,0,.5)}
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
.cdx-ph{color:#a2a7b0;opacity:0}
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
.cdx-paid{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:calc(var(--pt) * 1u);text-align:center;background:rgba(255,255,255,.96);opacity:0}
.cdx-ring{display:block;width:64u;height:64u}
.cdx-ring svg{display:block;width:100%;height:100%}
.cdx-paid b{margin-top:20u;font-size:20u;font-weight:600;letter-spacing:-.01em}
.cdx-paid small{margin-top:4u;font-size:14u;color:#6b7280}
.cdx-paid small+small{font-size:13u}
.cdx .cmv-cursor{position:absolute;left:62%;top:58%;z-index:2;line-height:0;font-size:22u;opacity:0}
@container (max-width:560px){
  .cdx{left:auto;right:4%;width:150%;--pt:70;--s1:360;--s2:960}
  .cdx-paid{padding-left:31%}
}
`)

/* The tab cards and their mocks. Each mock is drawn in em of a 48 x 42 box (30 x 34 on a narrow screen), so it scales as one picture. */
const TABS_CSS = `
/* The tabs: "Make the work"'s pill tabs in their dark form (a dark track with a 1px light edge, the chosen pill white). */
.cmc-tabs{display:flex;justify-content:center}
.cmc-tablist{position:relative;display:flex;gap:2px;max-width:100%;padding:4px;border-radius:999px;background:#141416;border:1px solid rgba(255,255,255,.08);box-sizing:border-box;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none}
.cmc-tablist::-webkit-scrollbar{display:none}
.cmc-tab{position:relative;flex:none;overflow:hidden;height:40px;padding:0 17px;border:0;border-radius:999px;background:transparent;color:#a1a1aa;font-family:inherit;font-size:14px;font-weight:500;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .35s ease}
.cmc-tab::before{content:"";position:absolute;inset:0;border-radius:inherit;background:#fff;opacity:0;transform:scale(.85);transition:opacity .35s ease,transform .5s cubic-bezier(.22,1,.36,1)}
.cmc-tab[data-on]{color:#18181b}
.cmc-tab[data-on]::before{opacity:1;transform:none}
@media (hover:hover){.cmc-tab:not([data-on]):hover{color:#fff}}
.cmc-tab:focus-visible{outline:2px solid #fff;outline-offset:2px}
.cmc-tab-l{position:relative}
.cmc-tab-fill{position:absolute;inset:0;border-radius:inherit;background:rgba(24,24,27,.1);transform-origin:0 50%;transform:scaleX(0)}
.cmc-tab-fill[data-run]{animation:cmc-fill linear both}
@keyframes cmc-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.cmc-panels{display:grid;margin-top:16px}
.cmc-panel{grid-area:1/1;display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(24px,3.5vw,56px);align-items:center;padding:clamp(28px,3.6vw,52px);border-radius:31px;background:#111113;border:1px solid rgba(255,255,255,.08);opacity:0;visibility:hidden;transition:opacity .35s ease,visibility 0s linear .35s}
.cmc-panel[data-on]{opacity:1;visibility:visible;transition:opacity .45s ease .05s,visibility 0s}
.cmc-panel-stat{display:block;margin-bottom:14px;font-size:14px;font-weight:500;color:#8b8b94}
.cmc-panel h3{margin:0;font-size:clamp(26px,3vw,42px);font-weight:400;line-height:1.1;letter-spacing:-.035em;color:#fff;text-wrap:balance}
.cmc-panel p{margin:16px 0 0;max-width:40ch;font-size:clamp(15.5px,1.25vw,18px);line-height:1.6;color:#a1a1aa}
/* A demo is a picture: it takes no pointer and nothing in it can be selected. */
.cmc-vis{position:relative;aspect-ratio:48/42;overflow:hidden;border-radius:20px;container-type:inline-size;pointer-events:none;user-select:none;-webkit-user-select:none}
.cmc-vis-in{position:absolute;inset:0;font-size:calc(100cqw / 48);color:#fff;line-height:1.35}
/* Wave 13 perf: a panel's mock is drawn only while its panel shows (and through its fade out). Its pictures are loaded eagerly, so a tab opened shows them at once. */
.cmc-panel:not([data-on]) .cmc-vis-in{content-visibility:hidden;transition:content-visibility 0s linear .35s allow-discrete}

/* The dark cards the demos are drawn on. */
.cmv-cc,.cmv-mail,.cmv-link{border-radius:1.4em;background:#1a1a1e;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);color:#f4f4f5}
.cmv-flag{display:block;flex:none;width:1.5em;height:1em;border-radius:.2em;object-fit:cover}

/* The seller's notice over the paid window. */
.cmv-sale{position:absolute;right:1.4em;top:1.1em;z-index:4;width:24em;display:flex;gap:.75em;align-items:flex-start;padding:.85em 1em;border-radius:1.25em;background:#26262b;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),0 1em 2.5em rgba(0,0,0,.5);color:#f4f4f5;box-sizing:border-box;opacity:0}
.cmv-sale img{flex:none;width:2.4em;height:2.4em;border-radius:.6em}
.cmv-note-t{flex:1;min-width:0;display:flex;flex-direction:column;font-size:.92em;line-height:1.35}
.cmv-note-top{display:flex;justify-content:space-between;gap:.6em}
.cmv-note-top b{font-weight:600}
.cmv-note-top small{color:#8b8b94}
.cmv-note-p{color:#a1a1aa}

/* One-tap payments: the phone and the three it pays with. */
.cmv-tap{position:absolute;inset:0}
.cmv-phone{position:absolute;left:5.5em;top:2.4em;--pw:17em}
.cmv-phone .cmc-phone{box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 1.5em 3em rgba(0,0,0,.55)}
.cmv-links{position:absolute;left:25.5em;right:2.4em;top:9.5em;display:grid;gap:1em}
.cmv-link{position:relative;display:flex;align-items:center;gap:.9em;height:4.6em;padding:0 1em;font-size:1em}
.cmv-link::before{content:"";position:absolute;right:100%;top:50%;width:3.4em;height:1px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.28));transform-origin:100% 50%}
.cmv-link-m{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:.08em;width:3.6em;height:2.4em;border-radius:.6em;background:#000;color:#fff;font-size:.95em;font-weight:600;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.cmv-link-gp{background:#fff;color:#3c4043}
.cmv-link-st{background:#635bff}
.cmv-stripe{font-size:1.02em;font-weight:700;letter-spacing:-.03em;color:#fff}
.cmv-link-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.cmv-link-t b{font-size:1.02em;font-weight:600}
.cmv-link-t small{font-size:.84em;color:#8b8b94}
.cmv-ok{position:relative;flex:none;width:1.5em;height:1.5em;border-radius:50%;background:rgba(74,222,128,.16)}
.cmv-ok::after{content:"";position:absolute;left:.52em;top:.36em;width:.36em;height:.62em;border:solid #4ade80;border-width:0 .16em .16em 0;transform:rotate(45deg)}

/* Currencies: one cap, five readings. */
.cmv-cur{position:absolute;inset:0;display:grid;place-items:center}
.cmv-cc{width:34em;display:grid;grid-template-columns:12.5em 1fr;gap:0 1.6em;padding:1.6em;box-sizing:border-box}
.cmv-cc-pic{display:block;aspect-ratio:1;border-radius:1em;overflow:hidden;background:#f3f3f1}
.cmv-cc-pic img{display:block;width:100%;height:100%;object-fit:cover}
.cmv-cc-b{display:flex;flex-direction:column;justify-content:center;min-width:0}
.cmv-cc-name{font-size:1.35em;font-weight:600;letter-spacing:-.015em}
.cmv-cc-sub{margin-top:.2em;font-size:.95em;color:#a1a1aa}
.cmv-stack{position:relative;display:grid}
.cmv-cyc{grid-area:1/1;opacity:0}
.cmv-cyc[data-first]{opacity:1}
.cmv-price{margin-top:.5em;font-size:3.6em;font-weight:300;letter-spacing:-.045em;line-height:1.1;font-variant-numeric:tabular-nums}
.cmv-where{font-size:.95em;color:#a1a1aa}
.cmv-chips{grid-column:1/-1;position:relative;display:grid;grid-template-columns:repeat(5,1fr);margin-top:1.4em;padding:.3em;border-radius:1.2em;background:#111113;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.cmv-chip{position:relative;display:flex;align-items:center;justify-content:center;gap:.45em;height:2.8em;font-size:.95em;font-weight:600;letter-spacing:.02em;color:#e4e4e7}
.cmv-hl{position:absolute;left:.3em;top:.3em;bottom:.3em;width:calc((100% - .6em) / 5);border-radius:.9em;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}

/* The reminder: three moments and the email. */
.cmv-rec{position:absolute;inset:0;font-size:1.15em}
.cmv-tl{position:absolute;left:3.6em;right:2.4em;top:2.6em;display:grid;grid-template-columns:repeat(3,1fr)}
.cmv-st{position:relative;display:grid;gap:.1em;padding-top:1.5em;font-size:.85em}
.cmv-st i{position:absolute;left:0;top:0;width:.7em;height:.7em;border-radius:50%;background:#e4e4e7}
.cmv-st3 i{background:#4ade80}
.cmv-st::after{content:"";position:absolute;left:1.3em;right:.6em;top:.32em;height:1px;background:rgba(255,255,255,.16)}
.cmv-st3::after{display:none}
.cmv-st b{font-weight:500;color:#f4f4f5;white-space:nowrap}
.cmv-st small{font-size:.9em;color:#8b8b94}
.cmv-mail{position:absolute;left:3.6em;right:3.6em;top:8.6em;padding:1.5em 1.7em}
.cmv-mail-from{display:flex;align-items:center;gap:.7em}
.cmv-mail-from img{width:2.3em;height:2.3em;border-radius:50%;object-fit:cover}
.cmv-mail-from b{display:block;font-size:.95em;font-weight:600}
.cmv-mail-from small{display:block;font-size:.8em;color:#8b8b94}
.cmv-mail-subj{margin-top:.9em;padding-bottom:.9em;border-bottom:1px solid rgba(255,255,255,.08);font-size:.9em;font-weight:500;color:#d4d4d8}
.cmv-mail-h{margin-top:.75em;font-size:1.6em;font-weight:500;letter-spacing:-.025em}
.cmv-mail p{margin:.45em 0 0;font-size:.9em;line-height:1.55;color:#a1a1aa}
.cmv-mail-btn{display:flex;align-items:center;justify-content:center;width:10.5em;height:2.6em;margin-top:1.1em;border-radius:1.3em;background:#fff;color:#18181b;font-size:.9em;font-weight:600}
.cmv-mail-line{display:flex;align-items:center;gap:.7em;margin-top:1.2em;padding-top:1em;border-top:1px solid rgba(255,255,255,.08);font-size:.9em;color:#d4d4d8}
.cmv-thumb{flex:none;width:2.4em;height:2.4em;border-radius:.4em;overflow:hidden;background:#f3f3f1}
.cmv-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.cmv-mail-line>span:not(.cmv-thumb){flex:1}
.cmv-mail-line b{font-weight:600;color:#fff}

@media (max-width:899px){
  .cmc-tabs{margin-inline:calc(var(--landing-gutter,20px) * -1 + 12px)}
  .cmc-tab{height:38px;padding:0 15px;font-size:13.5px}
  .cmc-panel{grid-template-columns:1fr;align-content:start;gap:20px;border-radius:23px;padding:24px 24px 20px}
  .cmc-panel-stat{margin-bottom:10px}
  /* On a narrow screen each demo is drawn for a taller box and a larger em, so its words stay readable. */
  .cmc-vis{aspect-ratio:30/34;margin:0 -10px;border-radius:15px}
  .cmc-vis-in{font-size:calc(100cqw / 30)}
  .cmv-phone{left:1.4em;top:1.6em;--pw:14.2em}
  .cmv-links{left:12.4em;right:.8em;top:6.5em;gap:.8em}
  .cmv-link{height:4.4em;padding:0 .7em;gap:.6em;font-size:.86em}
  .cmv-link-t small{display:none}
  .cmv-sale{right:.8em;left:.8em;top:.8em;width:auto;font-size:.9em}
  .cmv-cc{width:28em;grid-template-columns:1fr;padding:1.3em}
  .cmv-cc-pic{width:11em;margin-bottom:1em}
  .cmv-price{font-size:3.2em}
  .cmv-rec{font-size:1em}
  .cmv-chip{flex-direction:column;gap:.35em;height:4em}
  .cmv-tl{left:1.6em;right:.4em;top:1.2em}
  .cmv-mail{left:1em;right:1em;top:7.4em}
}
`

/*
 * THE DEMOS LOOP. Each tab's demo is one ${LOOP_S}s cycle of transform and
 * opacity keyframes that ends where it began and starts over, for as long as
 * its panel is the open one and the cards are on screen in a visible tab
 * (data-commerce-live). Off screen the rules below do not match, so nothing
 * runs, and each mock rests on its finished frame.
 */
/** Built to convert: a value typed at `t` (its placeholder going as it comes), held until the reset under the paid screen. */
const RESET = 9.05
const ON = "[data-commerce-live] .cmc-panel[data-on]"
const typed = (k: string, t: number) =>
  `@keyframes cdx-v-${k}{0%,${at(t)}{opacity:0;transform:translate3d(-6u,0,0)}${at(t + 0.3)},${at(RESET)}{opacity:1;transform:translate3d(0,0,0)}${at(RESET + 0.05)},100%{opacity:0;transform:translate3d(-6u,0,0)}}
@keyframes cdx-ph-${k}{0%,${at(t)}{opacity:1}${at(t + 0.15)},${at(RESET)}{opacity:0}${at(RESET + 0.05)},100%{opacity:1}}
${ON} .cdx-v-${k}{animation-name:cdx-v-${k}}
${ON} .cdx-ph-${k}{animation-name:cdx-ph-${k}}`
const FIELDS: [string, number][] = [
  ["email", 0.5],
  ["first", 0.85],
  ["last", 1.05],
  ["addr", 1.45],
  ["city", 1.65],
  ["zip", 1.85],
  ["card", 4.3],
  ["exp", 4.5],
  ["cvc", 4.65],
]
/* Built to convert: the form fills, the page scrolls to the shipping, it is chosen and the totals settle, on down to the card, Pay, paid, the seller's notice, and back to the top under the paid screen. */
const LOOP_CSS = u(`
@media (prefers-reduced-motion:no-preference){
  ${ON} :is(.cdx-v,.cdx-ph,.cdx-scroll,.cdx-sum-in,.cdx-radio i,.cdx-s0,.cdx-s1,.cdx-t0,.cdx-t1,.cdx-box-terms,.cmv-cursor,.cdx-pay,.cdx-paid,.cdx-ring,.cdx-paid b,.cdx-paid small,.cmv-sale,.ck-ring,.ck-w-a,.ck-w-g,.ck-w-c,.ck-mw-a,.ck-mw-g,.cmv-link,.cmv-ok,.cmv-cyc,.cmv-hl,.cmv-st,.cmv-mail){animation-duration:${LOOP_S}s;animation-iteration-count:infinite;animation-fill-mode:both;animation-timing-function:cubic-bezier(.22,1,.36,1)}
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

  ${ON} .ck-ring{animation-name:cmv-ring}
  ${ON} .ck-w-a{animation-name:cmv-wa}
  ${ON} .ck-w-g{animation-name:cmv-wg}
  ${ON} .ck-w-c{animation-name:cmv-wc}
  ${ON} .ck-mw-a{animation-name:cmv-mwa}
  ${ON} .ck-mw-g{animation-name:cmv-mwg}
  ${ON} .cmv-link-a{animation-name:cmv-la}
  ${ON} .cmv-link-g{animation-name:cmv-lg}
  ${ON} .cmv-link-s{animation-name:cmv-ls}
  ${ON} .cmv-link-a .cmv-ok{animation-name:cmv-ok0}
  ${ON} .cmv-link-g .cmv-ok{animation-name:cmv-ok1}
  ${ON} .cmv-link-s .cmv-ok{animation-name:cmv-ok2}

  ${ON} .cmv-cyc{animation-name:cmv-cyc;animation-delay:calc(var(--i) * ${LOOP_S / 5}s)}
  ${ON} .cmv-hl{animation-name:cmv-hl}

  ${ON} .cmv-st1{animation-name:cmv-st1}
  ${ON} .cmv-st2{animation-name:cmv-st2}
  ${ON} .cmv-st3{animation-name:cmv-st3}
  ${ON} .cmv-mail{animation-name:cmv-mail}
}
@keyframes cdx-scroll{0%,${at(2.1)}{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.45,0,.2,1)}${at(2.8)},${at(3.4)}{transform:translate3d(0,calc(var(--s1) * -1u),0);animation-timing-function:cubic-bezier(.45,0,.2,1)}${at(4.1)},${at(RESET)}{transform:translate3d(0,calc(var(--s2) * -1u),0)}${at(RESET + 0.05)},100%{transform:translate3d(0,0,0)}}
@keyframes cdx-stick{0%,${at(2.1)}{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.45,0,.2,1)}${at(2.8)},${at(3.4)}{transform:translate3d(0,calc((var(--s1) - 62) * 1u),0);animation-timing-function:cubic-bezier(.45,0,.2,1)}${at(4.1)},${at(RESET)}{transform:translate3d(0,calc((var(--s2) - 62) * 1u),0)}${at(RESET + 0.05)},100%{transform:translate3d(0,0,0)}}
@keyframes cdx-sel{0%,${at(2.9)}{opacity:0;transform:scale(.4)}${at(3.15)},${at(RESET)}{opacity:1;transform:scale(1)}${at(RESET + 0.05)},100%{opacity:0;transform:scale(.4)}}
@keyframes cdx-s0{0%,${at(3)}{opacity:1}${at(3.2)},${at(RESET)}{opacity:0}${at(RESET + 0.05)},100%{opacity:1}}
@keyframes cdx-s1{0%,${at(3.05)}{opacity:0;transform:translate3d(0,8u,0)}${at(3.4)},${at(RESET)}{opacity:1;transform:translate3d(0,0,0)}${at(RESET + 0.05)},100%{opacity:0;transform:translate3d(0,8u,0)}}
@keyframes cdx-terms{0%,${at(4.9)}{opacity:0;transform:scale(.6)}${at(5.15)},${at(RESET)}{opacity:1;transform:scale(1)}${at(RESET + 0.05)},100%{opacity:0;transform:scale(.6)}}
@keyframes cdx-cur{0%,${at(5)}{opacity:0;transform:translate3d(90u,70u,0)}${at(5.2)}{opacity:1}${at(5.7)}{opacity:1;transform:translate3d(0,0,0) scale(1)}${at(5.8)}{opacity:1;transform:translate3d(0,0,0) scale(.85)}${at(5.95)}{opacity:1;transform:translate3d(0,0,0) scale(1)}${at(6.3)},100%{opacity:0;transform:translate3d(0,0,0) scale(1)}}
@keyframes cdx-press{0%,${at(5.75)}{transform:scale(1)}${at(5.85)}{transform:scale(.97)}${at(6)},100%{transform:scale(1)}}
@keyframes cdx-paid{0%,${at(6.05)}{opacity:0}${at(6.35)},${at(9.3)}{opacity:1}${at(9.8)},100%{opacity:0}}
@keyframes cdx-ring{0%,${at(6.2)}{opacity:0;transform:scale(.5)}${at(6.6)},100%{opacity:1;transform:scale(1)}}
@keyframes cdx-paidt{0%,${at(6.35)}{opacity:0;transform:translate3d(0,8u,0)}${at(6.75)},100%{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-sale{0%,${at(6.9)}{opacity:0;transform:translate3d(0,-1em,0)}${at(7.4)},${at(9.2)}{opacity:1;transform:translate3d(0,0,0)}${at(9.6)},100%{opacity:0;transform:translate3d(0,-.4em,0)}}
/* One-tap payments: Apple Pay, then Google Pay, then the card on Stripe, each lit on the phone and beside it, each ticked as connected. */
@keyframes cmv-ring{0%,${at(3.2)}{transform:translate3d(0,0,0)}${at(3.6)},${at(6.4)}{transform:translate3d(0,0,0)}${at(6.8)},${at(9.6)}{transform:translate3d(calc(100% + .625em),0,0)}100%{transform:translate3d(0,0,0)}}
@keyframes cmv-wa{0%,${at(3.2)}{opacity:1;transform:translate3d(0,0,0)}${at(3.5)},${at(9.6)}{opacity:0;transform:translate3d(0,-.4em,0)}100%{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-wg{0%,${at(3.25)}{opacity:0;transform:translate3d(0,.4em,0)}${at(3.55)},${at(6.4)}{opacity:1;transform:translate3d(0,0,0)}${at(6.7)},100%{opacity:0;transform:translate3d(0,-.4em,0)}}
@keyframes cmv-mwa{0%,${at(3.2)}{opacity:1;transform:translate3d(0,0,0)}${at(3.5)},${at(6.4)}{opacity:0;transform:translate3d(0,-.4em,0)}${at(6.7)},100%{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-mwg{0%,${at(3.25)}{opacity:0;transform:translate3d(0,.4em,0)}${at(3.55)},${at(6.4)}{opacity:1;transform:translate3d(0,0,0)}${at(6.7)},100%{opacity:0;transform:translate3d(0,-.4em,0)}}
@keyframes cmv-wc{0%,${at(6.45)}{opacity:0;transform:translate3d(0,.4em,0)}${at(6.75)},${at(9.6)}{opacity:1;transform:translate3d(0,0,0)}${at(9.9)},100%{opacity:0}}
@keyframes cmv-la{0%,${at(3.2)}{opacity:1;transform:translate3d(0,0,0)}${at(3.5)},${at(9.6)}{opacity:.45;transform:translate3d(.5em,0,0)}100%{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-lg{0%,${at(3.2)}{opacity:.45;transform:translate3d(.5em,0,0)}${at(3.5)},${at(6.4)}{opacity:1;transform:translate3d(0,0,0)}${at(6.7)},100%{opacity:.45;transform:translate3d(.5em,0,0)}}
@keyframes cmv-ls{0%,${at(6.4)}{opacity:.45;transform:translate3d(.5em,0,0)}${at(6.7)},${at(9.6)}{opacity:1;transform:translate3d(0,0,0)}${at(9.9)},100%{opacity:.45;transform:translate3d(.5em,0,0)}}
@keyframes cmv-ok0{0%,${at(0.3)}{opacity:0;transform:scale(.4)}${at(0.7)},100%{opacity:1;transform:scale(1)}}
@keyframes cmv-ok1{0%,${at(3.5)}{opacity:0;transform:scale(.4)}${at(3.9)},100%{opacity:1;transform:scale(1)}}
@keyframes cmv-ok2{0%,${at(6.7)}{opacity:0;transform:scale(.4)}${at(7.1)},100%{opacity:1;transform:scale(1)}}
/* Local currencies: each reading in turn, the marker stepping along under it. */
@keyframes cmv-cyc{0%{opacity:0;transform:translate3d(0,.25em,0)}4%,17%{opacity:1;transform:translate3d(0,0,0)}21%,100%{opacity:0;transform:translate3d(0,-.25em,0)}}
@keyframes cmv-hl{0%,17%{transform:translate3d(0,0,0)}21%,37%{transform:translate3d(100%,0,0)}41%,57%{transform:translate3d(200%,0,0)}61%,77%{transform:translate3d(300%,0,0)}81%,96%{transform:translate3d(400%,0,0)}100%{transform:translate3d(0,0,0)}}
/* Checkout reminders: left, reminded (the email arrives), paid. Few layers, quick to arrive. */
@keyframes cmv-st1{0%,${at(0.1)}{opacity:.3}${at(0.4)},${at(9.2)}{opacity:1}${at(9.6)},100%{opacity:.3}}
@keyframes cmv-st2{0%,${at(0.9)}{opacity:.3}${at(1.2)},${at(9.2)}{opacity:1}${at(9.6)},100%{opacity:.3}}
@keyframes cmv-st3{0%,${at(4.2)}{opacity:.3}${at(4.5)},${at(9.2)}{opacity:1}${at(9.6)},100%{opacity:.3}}
@keyframes cmv-mail{0%,${at(0.9)}{opacity:0;transform:translate3d(0,.8em,0)}${at(1.4)},${at(9.2)}{opacity:1;transform:translate3d(0,0,0)}${at(9.6)},100%{opacity:0;transform:translate3d(0,0,0)}}
`)

/* The mocks' resting states, where no loop runs: paid, Apple Pay, the email in. */
const REST_CSS = `
.cdx .cdx-paid{opacity:1}
.cmv-sale{opacity:1}
`

/* Still: the finished scene, nothing pinned or moving. */
const STILL_CSS = `
@media (prefers-reduced-motion:reduce){
  .cmc[data-story-section] > .cmc-track.cmc-track{height:auto}
  .cmc[data-story-section] > .cmc-cards.cmc-cards{margin-top:0}
  .cmc-stage{position:relative;height:max(100svh,calc(var(--pw) * 2.07 + 220px))}
  .cmc-stage *{transition:none!important;animation:none!important}
  .cmc-floats{display:none}
  .cmc-panel,.cmc-tab,.cmc-tab::before{transition:none!important}
}
`

const CHECKOUT_CSS = SCENE_CSS + PHONE_CSS + DESK_CSS + TABS_CSS + LOOP_CSS + REST_CSS + STILL_CSS

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CHECKOUT_STYLES: readonly SectionStyle[] = [
  COMMERCE_KIT_STYLE,
  { href: "w13-ebook-cover", precedence: "default", css: EBOOK_COVER_CSS },
  { href: "w12-commerce-checkout", precedence: "default", css: CHECKOUT_CSS },
]
