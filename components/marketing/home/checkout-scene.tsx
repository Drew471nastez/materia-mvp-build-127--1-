"use client"

/**
 * ===========================================================================
 *  CHECKOUT THAT TURNS A TAP INTO A SALE (home, section 9, landing round 7)
 * ===========================================================================
 * Black, with a dot grid so faint it reads as texture. The owner's order,
 * round 7:
 *
 *   1. the headline  centred at the top, its words in one after another
 *   2. the phone     centred under it, an iPhone showing Storelib's real
 *                    full page checkout (/checkout, the page a buyer lands
 *                    on from a product), not the in page sheet. It rises from
 *                    below as it reaches the screen: one observer sees the
 *                    phone's own box come up and starts a CSS transition of
 *                    transform, so the rise happens where it can be seen
 *   3. the products  pictures of things creators sell ride a slow ring around
 *                    the phone, behind it, as they did before round 5
 *                    (cfd3b8cab): one baked lap of transform and opacity
 *                    keyframes, paused off screen
 *   4. the tabs      scrolling on, the stage holds (sticky) and the four tab
 *                    cards come up over the phone with the page, fading in as
 *                    they come; the phone and the ring dim under them
 *
 * THE PHONE IS THE REAL PAGE. PageCheckout below is
 * app/(storelib)/checkout/checkout-client.tsx as a phone lays it out: the
 * white bar (Back, the creator, Continue shopping), the grey order (Pay
 * <creator>, the total, Hide details, the line, Subtotal, Add promotion code,
 * Total due), then the form (the express Apple Pay button from
 * parts/stripe-pay.tsx, OR, Contact information, the news box, Payment
 * method as Stripe's accordion with checkout's appearance, the terms box,
 * Pay, Powered by Stripe), with the same sizes, colours and words, laid out
 * at the iPhone's own width (393px) and scaled to the drawn phone in one
 * transform. Safari's status bar and its floating address bar sit over it.
 *
 * TRUE FIGURES. The desktop window is the website checkout as
 * app/(storelib)/checkout/site/site-checkout.tsx lays it out. The seller's
 * notice is the in-app sale notification (lib/notify/templates/catalog.ts).
 * The currencies are ones fees are written for
 * (lib/payments/fees/currency-rules). The reminder is
 * lib/physical/email-templates checkoutReminderEmail's words
 * (lib/automations/abandoned.ts). Prices are examples.
 */
import { StorelibLogo } from "@/components/brand/storelib-logo"
import type { SectionStyle } from "./lazy-section"
import { Fragment, memo, useEffect, useRef, useState } from "react"
import { COMMERCE_CURRENCY_COUNT, COMMERCE_KIT_STYLE, CommerceKitStyle, useCommerceLive, useCommerceReducedMotion } from "./commerce-kit"
import { u } from "./showcase-mocks/frame"

const IMG = "/home/commerce"
/**
 * Landing round 7 (the owner: not The Loop). What the phone sells: Maren
 * Holt's Harbor Cardigan, a knitting pattern sold as a PDF. Its picture is a
 * real photograph, Unsplash photo-1584992236310-6edddc08acff (yarn and
 * needles), cropped to the cover (public/home/commerce/maren-pattern.webp).
 */
export const PATTERN = { title: "Harbor Cardigan pattern", author: "Maren Holt", price: "$12.00", cover: `${IMG}/maren-pattern.webp`, kind: "Knitting pattern, PDF" } as const
/** Round 5's name for what the phone sells, kept so older imports still resolve. */
export const GUIDE = PATTERN
/** The physical product the demos sell beside the pattern: the yarn for it, as a kit (the same photograph, its other half). */
export const YARN = { title: "Harbor yarn kit", option: "Merino, 6 skeins", price: "$64.00", img: `${IMG}/maren-yarn-kit.webp` } as const
/** Round 5's name for the physical product, kept so older imports still resolve. */
export const PRINT = YARN
const PRODUCT = PATTERN.title
const SELLER = PATTERN.author
/** Maren's photo: Unsplash photo-1438761681033-6461ffad8d80. */
const AVATAR = `${IMG}/creator-maren.webp`

export const CHECKOUT_HEADING = "Checkout that turns a tap into a sale"

/**
 * The products around the phone (round 4's ring, brought back with a new set,
 * each a real Unsplash photograph): the pattern itself
 * (photo-1584992236310-6edddc08acff), a hand poured candle
 * (photo-1603006905003-be475563bc59), rings (photo-1608042314453-ae338d80c427),
 * a face oil (photo-1608571423902-eed4a5ad8108), framed prints
 * (photo-1513519245088-0e12902e5a38) and a leather bag
 * (photo-1600857062241-98e5dba7f214). Each has its place on the ring (phase 0
 * to 1, and a second set for phones, which show four) and a small lean.
 */
export const FLOATS = [
  { id: "pattern", src: PATTERN.cover, ar: "3 / 4", ph: 0, phm: 0, r: -6, m: true },
  { id: "candle", src: `${IMG}/float-candle.webp`, ar: "4 / 5", ph: 1 / 6, phm: 0.25, r: 5, m: true },
  { id: "rings", src: `${IMG}/float-rings.webp`, ar: "4 / 5", ph: 2 / 6, phm: 0, r: -4, m: false },
  { id: "oil", src: `${IMG}/float-oil.webp`, ar: "4 / 5", ph: 3 / 6, phm: 0.5, r: 6, m: true },
  { id: "prints", src: `${IMG}/float-prints.webp`, ar: "4 / 5", ph: 4 / 6, phm: 0, r: -5, m: false },
  { id: "bag", src: `${IMG}/float-bag.webp`, ar: "4 / 5", ph: 5 / 6, phm: 0.75, r: 4, m: true },
] as const

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
 * The scene's three entrances, without scroll work. One observer watches the
 * headline, the phone's box and the tab cards. While one of them is wholly
 * below the screen its part is armed (data-cmc-<part>-armed: the words out,
 * the phone a little low, the cards faint and low); once it crosses 88% of
 * the screen its attribute is set and the part plays in as CSS transitions of
 * transform and opacity, on the compositor. A part already on screen when
 * this runs is never armed, so it is simply there. Scrolled back up past it,
 * it re-arms. Nothing is read or written per frame.
 */
const PARTS = [
  [".cmc-copy", "data-cmc-words"],
  [".cmc-phone-wrap", "data-cmc-in"],
  [".cmc-cards", "data-cmc-over"],
] as const
function useEntrances(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver !== "function") return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const parts = new Map<Element, string>()
    for (const [sel, attr] of PARTS) {
      const el = root.querySelector(sel)
      if (el) parts.set(el, attr)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const attr = parts.get(e.target)
          if (!attr) continue
          if (e.isIntersecting) {
            if (root.hasAttribute(`${attr}-armed`)) root.setAttribute(attr, "")
          } else if (e.boundingClientRect.top > 0 || e.boundingClientRect.height === 0) {
            /* Below the screen, or not laid out yet: the lazy box skips its content (content-visibility) until it is near, and the observer then reports an empty box at 0. Round 5 read that as "on screen" and never armed, so the rise never played. */
            root.removeAttribute(attr)
            root.setAttribute(`${attr}-armed`, "")
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    )
    for (const el of parts.keys()) io.observe(el)
    return () => {
      io.disconnect()
      for (const [, attr] of PARTS) {
        root.removeAttribute(attr)
        root.removeAttribute(`${attr}-armed`)
      }
    }
  }, [rootRef])
}

export function CheckoutScene() {
  const rootRef = useRef<HTMLElement>(null)
  const reduced = useCommerceReducedMotion()
  /* The ring turns only while the stage is on screen in a visible tab (no React state: the attribute runs or pauses the CSS). */
  const [stageRef] = useCommerceLive<HTMLDivElement>("0px 0px", false)
  useEntrances(rootRef)
  const words = CHECKOUT_HEADING.split(" ")

  return (
    <section ref={rootRef} className="cmc" data-story-section="checkout" aria-labelledby="cmc-title">
      <CommerceKitStyle />
      <style href="w12-commerce-checkout" precedence="default">
        {CHECKOUT_CSS}
      </style>
      <span className="cmc-dots" aria-hidden="true" />
      <div className="cmc-track">
        <div ref={stageRef} className="cmc-stage">
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
                  <span key={f.id} className="cmc-o" data-f={f.id} data-m={f.m || undefined} style={{ "--ph": f.ph, "--phm": f.phm, "--r": `${f.r}deg` } as React.CSSProperties}>
                    <span className="cmc-lap">
                      <img className="cmc-pic" src={f.src} alt="" width={360} height={450} loading="lazy" decoding="async" style={{ aspectRatio: f.ar }} />
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="cmc-rise">
              <Phone label={`Storelib's checkout page on a phone (an iPhone): ${PRODUCT} by ${SELLER}, ${PATTERN.price}, with Apple Pay.`} />
            </div>
          </div>
        </div>
      </div>

      <CheckoutTabs reduced={reduced} />
    </section>
  )
}

/* ── The phone: a modern iPhone, its screen the real checkout ────────── */

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

/** The iPhone: titanium band, black border, Dynamic Island, and the checkout page under Safari's bars. With `pay`, the One-tap demo: the page scrolled to its form and Apple Pay's sheet. */
function Phone({ label, pay = false }: { label?: string; pay?: boolean }) {
  return (
    <div className="cmc-phone" role={label ? "img" : undefined} aria-label={label}>
      <span className="cmc-key cmc-key-act" />
      <span className="cmc-key cmc-key-up" />
      <span className="cmc-key cmc-key-dn" />
      <span className="cmc-key cmc-key-pw" />
      <div className="cmc-bezel">
        <div className="cmc-screen" aria-hidden="true" inert>
          <div className="cmc-ui">
            <PageCheckout pay={pay} />
            <SafariBar />
            <StatusBar />
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

/**
 * The checkout page a buyer gets on a phone (checkout-client.tsx), in the
 * page's own pixels: the pc- rules copy its Tailwind classes, and those of
 * parts/order-summary.tsx, parts/stripe-pay.tsx (the express button, the
 * Payment Element in checkout's appearance) and components/checkout/parts/ui.tsx,
 * one for one. The order shows open, as a phone first draws it.
 */
function PageCheckout({ pay }: { pay: boolean }) {
  return (
    <div className="pc" data-pay={pay || undefined}>
      <div className="pc-page">
        <div className="pc-bar">
          <span className="pc-back">
            <span className="pc-back-f">
              <ArrowLeft />
            </span>
          </span>
          <span className="pc-who">
            <img className="pc-av" src={AVATAR} alt="" width={28} height={28} loading="lazy" decoding="async" />
            <span>{SELLER}</span>
          </span>
          <span className="pc-cont">Continue shopping</span>
        </div>

        <div className="pc-sum">
          <p className="pc-payto">Pay {SELLER}</p>
          <p className="pc-total">{PATTERN.price}</p>
          <span className="pc-det">
            Hide details
            <Chevron className="pc-up" />
          </span>
          <div className="pc-details">
            <div className="pc-line">
              <span className="pc-thumb">
                <img src={PATTERN.cover} alt="" width={96} height={128} loading="lazy" decoding="async" />
              </span>
              <span className="pc-li">
                <b>{PRODUCT}</b>
                <small>Qty 1</small>
              </span>
              <b className="pc-lp">{PATTERN.price}</b>
            </div>
            <div className="pc-tots">
              <div className="pc-row pc-strong">
                <span>Subtotal</span>
                <span>{PATTERN.price}</span>
              </div>
              <span className="pc-promo">Add promotion code</span>
              <div className="pc-row pc-due">
                <span>Total due</span>
                <span>{PATTERN.price}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pc-form">
          <span className="pc-ap">
            <AppleMark />
            Pay
          </span>
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
              <span className="pc-brands">
                <i className="pc-visa">VISA</i>
                <i className="pc-mc">
                  <b />
                  <b />
                </i>
              </span>
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
          <span className="pc-pay">Pay {PATTERN.price}</span>
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
        </div>
      </div>
      {pay ? <ApplePay /> : null}
    </div>
  )
}

/**
 * The One-tap demo's moving parts, over the page: a press on Apple Pay, the
 * wallet's sheet (iOS 26, floating, its words Apple's), Done, the sheet away,
 * and checkout's own paid screen (parts/success.tsx: Payment complete,
 * "<total> paid. Opening your receipt"). Eight layers, transform and opacity.
 */
function ApplePay() {
  return (
    <>
      <span className="pc-touch" />
      <span className="pc-top" />
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
          <b>{PATTERN.price}</b>
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
      <div className="pc-paid">
        <span className="pc-paid-ring">
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r="29" fill="none" stroke="#1a1a2e" strokeWidth="3" />
            <path d="M20 33.5l8 8 16-17" fill="none" stroke="#1a1a2e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <b>Payment complete</b>
        <small>{PATTERN.price} paid. Opening your receipt</small>
      </div>
    </>
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

function AppleMark() {
  return (
    <svg viewBox="0 0 17 20" width="15.3" height="18" fill="currentColor">
      <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.8 1.3 10.3.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.2zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
    </svg>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
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

/* ── The tab cards: a label, a figure, a line that fills while it plays ── */

function CheckoutTabs({ reduced }: { reduced: boolean }) {
  const [cardsRef, live] = useCommerceLive<HTMLDivElement>("0px 0px")
  const [active, setActive] = useState<TabId>("convert")
  const [held, setHeld] = useState(false)
  const [touched, setTouched] = useState(false)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
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

  /* Hover holds the autoplay only for a mouse: a finger scrolling past fires pointerenter too, and must not stop it. */
  const hold = (e: React.PointerEvent, on: boolean) => {
    if (e.pointerType === "mouse") setHeld(on)
  }

  return (
    <div ref={cardsRef} className="cmc-cards" onPointerEnter={(e) => hold(e, true)} onPointerLeave={(e) => hold(e, false)} onFocusCapture={() => setHeld(true)} onBlurCapture={() => setHeld(false)}>
      <div className="cmc-cards-in">
        <div role="tablist" aria-label="What checkout does" className="cmc-tablist">
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
                <span className="cmc-tab-l">{t.label}</span>
                <span className="cmc-tab-s">{t.stat}</span>
                <span className="cmc-tab-bar" aria-hidden="true">
                  {on ? <span key={`${t.id}-${auto}`} className="cmc-tab-fill" data-run={auto || undefined} style={{ animationDuration: `${AUTO_MS}ms` }} /> : null}
                </span>
              </button>
            )
          })}
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
  { id: "kit", img: YARN.img, title: YARN.title, option: YARN.option, price: YARN.price, physical: true },
  { id: "pattern", img: PATTERN.cover, title: PRODUCT, option: PATTERN.kind, price: PATTERN.price, physical: false },
]
/* $64.00 + $12.00 = $76.00; + $6.00 shipping + $6.08 tax (8% of the goods, an example) = $88.08. */
const SUB = "$76.00"
const TOTAL = "$88.08"
const SHOP_HOST = "marenholt.storelib.com"

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
              <img className="cdx-av" src={AVATAR} alt="" loading="eager" decoding="async" width={56} height={56} />
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
                          <img src={l.img} alt="" loading="eager" decoding="async" width={96} height={96} />
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
                        <span className="cdx-s1">$6.00</span>
                      </span>
                    </div>
                    <div className="cdx-row">
                      <span>Tax</span>
                      <span className="cdx-swap">
                        <span className="cdx-s0">Calculated next</span>
                        <span className="cdx-s1">$6.08</span>
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
            Sam Rivera bought {YARN.title} and 1 more for {TOTAL}.
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
        <Phone pay />
      </div>
      <div className="cmv-links">
        <span className="cmv-link" data-on="">
          <span className="cmv-link-m">
            <AppleMark />
            Pay
          </span>
          <span className="cmv-link-t">
            <b>Apple Pay</b>
            <small>iPhone, iPad and Mac</small>
          </span>
          <i className="cmv-ok" />
        </span>
        <span className="cmv-link">
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
        <span className="cmv-link">
          <span className="cmv-link-m cmv-link-st">
            <StripeMark />
          </span>
          <span className="cmv-link-t">
            <b>Cards</b>
            <small>Visa, Mastercard, Amex on Stripe</small>
          </span>
          <i className="cmv-ok" />
        </span>
      </div>
    </div>
  )
}

/* ── Local currencies: one yarn kit, five readings ─────────────────────── */

/* Example prices for one $64 yarn kit as each currency would show it. */
const PRICES = [
  { code: "USD", flag: "US", where: "United States", price: "$64.00" },
  { code: "EUR", flag: "EU", where: "Euro area", price: "€59.00" },
  { code: "GBP", flag: "GB", where: "United Kingdom", price: "£50.00" },
  { code: "JPY", flag: "JP", where: "Japan", price: "¥9,800" },
  { code: "CAD", flag: "CA", where: "Canada", price: "C$88.00" },
] as const

function Flag({ code }: { code: string }) {
  return <img className="cmv-flag" src={`/flags/${code}.svg`} alt="" loading="eager" decoding="async" width={21} height={14} />
}

function VisCurrency() {
  return (
    <div className="cmv-cur">
      <div className="cmv-cc">
        <span className="cmv-cc-pic">
          <img src={PRINT.img} alt="" loading="eager" decoding="async" width={600} height={600} />
        </span>
        <div className="cmv-cc-b">
          <b className="cmv-cc-name">{PRINT.title}</b>
          <small className="cmv-cc-sub">{YARN.option} · {SELLER}</small>
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

/** Three moments on one line that fills as the hour passes, and the email that brings the buyer back. */
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
          <b>Paid {YARN.price}</b>
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
        <div className="cmv-mail-subj">You left {YARN.title} at checkout</div>
        <div className="cmv-mail-h">Still thinking it over?</div>
        <p>Hi Sam, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off.</p>
        <span className="cmv-mail-btn">Finish checkout</span>
        <div className="cmv-mail-line">
          <span className="cmv-thumb">
            <img src={YARN.img} alt="" loading="eager" decoding="async" width={96} height={96} />
          </span>
          <span>{YARN.title}</span>
          <b>{YARN.price}</b>
        </div>
      </div>
    </div>
  )
}

/* ── Styles ──────────────────────────────────────────────────────────── */

const WORDS = CHECKOUT_HEADING.split(" ").length
/* The headline's words, one after another once it is in. */
const wordDelays = () => Array.from({ length: WORDS }, (_, i) => `.cmc[data-cmc-words] .cmc-w[data-w="${i}"]{transition-delay:${0.05 + i * 0.045}s}`).join("\n")

/**
 * ONE LAP OF THE RING, BAKED (round 4's, lighter). Each product rides the same
 * keyframes, a negative delay putting it at its own place on the lap: 24
 * points of an ellipse (x = -cos, y = sin, so the front of the ring is its
 * lower half), smaller and dimmer at the back, with a small lean that rocks
 * twice a lap so the loop closes on itself with no seam. One animated layer
 * per product, transform and opacity only, no 3D, no filter.
 */
const LAP_POINTS = 24
function lapKeyframes(): string {
  const f = (v: number) => String(+v.toFixed(3))
  let lap = ""
  for (let i = 0; i <= LAP_POINTS; i++) {
    const t = (i / LAP_POINTS) * Math.PI * 2
    const x = -Math.cos(t)
    const y = Math.sin(t)
    const d = (1 + y) / 2
    lap += `${f((i / LAP_POINTS) * 100)}%{transform:translate3d(calc(var(--rx) * ${f(x)}),calc(var(--ry) * ${f(y)}),0) rotate(calc(var(--r) * ${f(Math.cos(t * 2))})) scale(${f(0.64 + 0.36 * d)});opacity:${f(0.5 + 0.5 * d)}}`
  }
  return `@keyframes cmc-lap{${lap}}`
}

/*
 * The scene. The track is a screen of stage plus DWELL of scroll, the stage
 * held in it (position: sticky, the browser's own scrolling, nothing per
 * frame). The tab cards follow, pulled up by OVERLAP, so after a short look
 * at the phone they come up the screen with the page, over it. DWELL -
 * OVERLAP is all the page spends on the phone alone.
 *
 * Round 7: the headline centred at the top, the phone centred under it (on a
 * computer too: no copy column beside it). The content box is the page's
 * shared one (globals.css .home-wrap: --home-edge, --home-max), so the cards'
 * edges meet the showcase's.
 */
const DWELL = "80svh"
const OVERLAP = "64svh"
const SCENE_CSS = `
.cmc{position:relative;background:#000;color:#fff;border-radius:clamp(28px,4vw,56px);overflow:clip;padding-block:0!important;isolation:isolate;--edge:var(--home-edge,clamp(20px,5.15vw,84px))}
/* The dots (round 7: "very extremely subtle"): 1px at 7% white on a 24px grid, faded out toward the edges. */
.cmc-dots{position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1.3px);background-size:24px 24px;background-position:12px 12px;-webkit-mask-image:radial-gradient(ellipse 75% 65% at 50% 40%,#000 25%,transparent 80%);mask-image:radial-gradient(ellipse 75% 65% at 50% 40%,#000 25%,transparent 80%)}
.cmc[data-story-section] > .cmc-track.cmc-track{position:relative;z-index:1;max-width:none;margin:0;padding:0;height:calc(100svh + ${DWELL})}
.cmc-stage{position:sticky;top:0;height:100svh;overflow:hidden;
  --hd:60px;--tt:clamp(14px,2.4svh,28px);--pw:min(70vw,300px,calc((100svh - 196px) / 2.07));--rx:41vw;--ry:24svh}
.cmc-copy{position:absolute;z-index:4;left:var(--edge);right:var(--edge);top:calc(var(--hd) + var(--tt));text-align:center}
.cmc-title{margin:0 auto;max-width:15em;font-size:clamp(30px,8.4vw,46px);font-weight:300;line-height:1.04;letter-spacing:-.045em;text-wrap:balance;color:#fff}
.cmc-w{display:inline-block}
.cmc-phone-wrap{position:absolute;z-index:3;left:50%;bottom:clamp(14px,2.4svh,28px);width:var(--pw);margin-left:calc(var(--pw) / -2)}
.cmc-rise{position:relative;z-index:2}

/* The ring, centred on the phone, behind it. Paused until the stage is on screen in a visible tab (data-commerce-live). */
.cmc-floats{position:absolute;z-index:1;left:50%;top:50%;width:0;height:0;pointer-events:none}
.cmc-orbit{position:absolute;left:0;top:0;width:0;height:0}
.cmc-o{position:absolute;left:0;top:0;width:clamp(96px,9vw,156px);transform:translate(-50%,-50%)}
.cmc-lap{display:block;animation:cmc-lap 72s linear infinite both;animation-delay:calc(var(--ph) * -72s);animation-play-state:paused}
.cmc-stage[data-commerce-live] .cmc-lap{animation-play-state:running}
.cmc-pic{display:block;width:100%;height:auto;border-radius:14px;object-fit:cover;background:#1a1a1e;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 18px 40px rgba(0,0,0,.55)}
${lapKeyframes()}

@media (max-width:899px){
  .cmc-o{width:22vw}
  .cmc-o:not([data-m]){display:none}
  .cmc-lap{animation-delay:calc(var(--phm) * -72s)}
  .cmc-pic{border-radius:10px}
}
@media (min-width:900px){
  .cmc-stage{--hd:68px;--tt:clamp(18px,3.4svh,40px);--pw:min(390px,calc((100svh - 220px) / 2.07));--rx:min(25vw,400px);--ry:25svh}
  .cmc-title{max-width:none;font-size:clamp(40px,4.3vw,68px)}
  .cmc-phone-wrap{bottom:clamp(16px,2.6svh,32px)}
}

/* The tab cards: a black ground that fades in from transparent at its top edge, so the cards lie over the phone and it goes under them softly. */
.cmc[data-story-section] > .cmc-cards.cmc-cards{position:relative;z-index:5;max-width:none;margin:calc(${OVERLAP} * -1) 0 0;padding:0;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.72) clamp(110px,16vh,180px),#000 clamp(220px,30vh,320px))}
.cmc-cards-in{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin:0 auto;padding:clamp(72px,10vh,120px) var(--edge) clamp(64px,8vw,120px)}

/*
 * The entrances (useEntrances): armed while a part is below the screen,
 * played once it comes up. Transform and opacity, as transitions, so the
 * compositor runs them and a finger on the glass never waits for them.
 */
@media (prefers-reduced-motion:no-preference){
  .cmc-w{transition:opacity .55s ease,transform .8s cubic-bezier(.16,1,.3,1)}
  .cmc[data-cmc-words-armed]:not([data-cmc-words]) .cmc-w{opacity:0;transform:translate3d(0,.36em,0);transition-duration:0s;transition-delay:0s}
  ${wordDelays()}

  /* The phone rises from below as its own box comes up the screen. */
  .cmc-rise{transition:transform 1.1s cubic-bezier(.16,1,.3,1),opacity .6s ease}
  .cmc[data-cmc-in-armed]:not([data-cmc-in]) .cmc-rise{transform:translate3d(0,34%,0);transition-duration:0s}
  /* The ring comes up a beat behind it, from a little lower (parallax). */
  .cmc-floats{transition:transform 1.4s cubic-bezier(.16,1,.3,1) .08s,opacity .9s ease .08s}
  .cmc[data-cmc-in-armed]:not([data-cmc-in]) .cmc-floats{opacity:0;transform:translate3d(0,22svh,0);transition-duration:0s;transition-delay:0s}

  /* The cards fade in and lift as they come over the phone; the phone, the ring and the headline step back under them. */
  .cmc-cards-in{transition:opacity .7s ease,transform .9s cubic-bezier(.16,1,.3,1)}
  .cmc[data-cmc-over-armed]:not([data-cmc-over]) .cmc-cards-in{opacity:0;transform:translate3d(0,56px,0);transition-duration:0s}
  .cmc-copy,.cmc-orbit{transition:opacity .6s ease}
  .cmc[data-cmc-over] .cmc-rise{opacity:.3;transform:translate3d(0,0,0) scale(.97)}
  .cmc[data-cmc-over] .cmc-orbit{opacity:.25}
  .cmc[data-cmc-over] .cmc-copy{opacity:0}
}
`

/* The iPhone, and the real checkout page inside it at the phone's own width (393px), scaled to the drawing by --k. */
const PHONE_CSS = `
.cmc-phone{position:relative;pointer-events:none;user-select:none;-webkit-user-select:none;width:var(--pw);aspect-ratio:100/207;border-radius:calc(var(--pw) * .178);padding:calc(var(--pw) * .0135);background:linear-gradient(140deg,#77777c 0%,#36363a 14%,#1d1d20 42%,#232326 62%,#3c3c40 86%,#808086 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 0 calc(var(--pw) * .01) rgba(255,255,255,.12),0 calc(var(--pw) * .08) calc(var(--pw) * .16) rgba(0,0,0,.6);
  --k:tan(atan2(calc(var(--pw) * .915),393px))}
.cmc-key{position:absolute;width:calc(var(--pw) * .012);border-radius:2px;background:linear-gradient(90deg,#2a2a2d,#6a6a70 60%,#3a3a3e)}
.cmc-key-act{left:calc(var(--pw) * -.0095);top:17.5%;height:5%}
.cmc-key-up{left:calc(var(--pw) * -.0095);top:25.5%;height:9%}
.cmc-key-dn{left:calc(var(--pw) * -.0095);top:36%;height:9%}
.cmc-key-pw{right:calc(var(--pw) * -.0095);top:28%;height:14%;transform:scaleX(-1)}
.cmc-bezel{height:100%;padding:calc(var(--pw) * .029);border-radius:calc(var(--pw) * .165);background:#030303;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.cmc-screen{position:relative;height:100%;border-radius:calc(var(--pw) * .137);overflow:hidden;background:#fff;color:#1a1a2e}
.cmc-ui{position:absolute;left:0;top:0;width:393px;height:852px;transform-origin:0 0;transform:scale(var(--k));font-size:16px;line-height:1.5;font-family:inherit;text-align:left;-webkit-font-smoothing:antialiased}
.cmc-status{position:absolute;left:0;right:0;top:0;height:3.375em;display:flex;align-items:center;justify-content:space-between;padding:0 1.9em 0 2.35em;font-size:1em;font-weight:600;color:#000}
.cmc-time{font-size:1.0625em;letter-spacing:-.01em;padding-top:.15em}
.cmc-island{position:absolute;left:50%;top:.6875em;width:7.875em;height:2.3125em;margin-left:-3.9375em;border-radius:1.2em;background:#000}
.cmc-icons{display:flex;align-items:center;gap:.32em;padding-top:.15em}
.cmc-batt{position:relative;width:1.6em;height:.78em;border-radius:.26em;border:1.5px solid rgba(0,0,0,.4);padding:1.5px}
.cmc-batt::after{content:"";position:absolute;right:-.2em;top:50%;width:.12em;height:.28em;margin-top:-.14em;border-radius:0 1px 1px 0;background:rgba(0,0,0,.4)}
.cmc-batt span{display:block;width:82%;height:100%;border-radius:.12em;background:#000}
.cmc-home{position:absolute;left:50%;bottom:.5em;width:8.375em;height:.3125em;margin-left:-4.19em;border-radius:1em;background:#0b0b0d}

/* Safari's floating address bar (iOS 26). */
.rc-safari{position:absolute;left:14px;right:14px;bottom:28px;display:flex;align-items:center;gap:10px;height:50px}
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
/* The express button: Stripe's Apple Pay button, black, 44px, checkout's 8px corners. */
.pc-ap{display:flex;align-items:center;justify-content:center;gap:2px;height:44px;border-radius:8px;background:#000;color:#fff;font-size:19px;font-weight:500;letter-spacing:-.01em}
.pc-ap svg{margin-top:-3px}
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
.pc-brands{display:flex;gap:4px;margin-left:auto}
.pc-brands i{display:grid;place-items:center;width:30px;height:20px;border-radius:3px;font-style:normal}
.pc-visa{background:#1a1f71;color:#fff;font-size:9px;font-weight:800;letter-spacing:.02em}
.pc-mc{position:relative;background:#252525}
.pc-mc b{position:absolute;top:4px;width:12px;height:12px;border-radius:50%;background:#eb001b}
.pc-mc b:first-child{left:6px}
.pc-mc b+b{left:12px;background:#f79e1b;opacity:.9}
.pc-terms{margin-top:28px}
.pc-terms u{color:#1a1a2e;font-weight:500;text-decoration-color:#c9ccd2;text-underline-offset:2px}
.pc-pay{display:flex;align-items:center;justify-content:center;height:48px;margin-top:20px;border-radius:8px;background:#1a1a2e;color:#fff;font-size:16px;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 1px rgba(0,0,0,.12),0 3px 8px -2px rgba(26,26,46,.35)}
.rc-pow{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0 4px;margin:14px 0 0;padding:6px 0;font-size:12.5px;color:#8b919a}
.rc-pow-s{display:inline-flex;align-items:center;gap:4px;padding:0 4px}
.rc-pow-s svg{margin-top:1px}
.rc-pow i{font-style:normal;color:#c4c8ce;padding:0 4px}

/* The One-tap demo: the page scrolled down to its form (a still transform), a white strip under the status bar. */
.pc[data-pay] .pc-page{transform:translate3d(0,-478px,0)}
.pc-top{position:absolute;left:0;right:0;top:0;z-index:2;height:54px;background:#fff}
.pc-touch{position:absolute;left:50%;top:108px;z-index:2;width:56px;height:56px;margin-left:-28px;border-radius:50%;background:rgba(26,26,46,.18);opacity:0}
.ap-dim{position:absolute;inset:0;z-index:3;background:#000;opacity:0}
/* Apple Pay's sheet on iOS 26: floating, inset, round. */
.ap-sheet{position:absolute;left:8px;right:8px;bottom:8px;z-index:4;padding:22px 22px 24px;border-radius:44px;background:#fff;box-shadow:0 -10px 40px rgba(0,0,0,.2);transform:translate3d(0,110%,0);font-size:16px;color:#000}
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
/* checkout's paid screen (parts/success.tsx). */
.pc-paid{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 32px 40px;text-align:center;background:#fff;opacity:0}
.pc-paid-ring{display:block;width:64px;height:64px}
.pc-paid-ring svg{display:block}
.pc-paid b{margin-top:20px;font-size:20px;font-weight:600;letter-spacing:-.01em}
.pc-paid small{margin-top:4px;font-size:14px;color:#6b7280}
`
/*
 * Built to convert, the website checkout at a desktop width (880 design
 * units in u, showcase-mocks/frame.tsx): its resting picture is the form
 * filled and paid, which is what reduced motion and a panel not yet shown
 * draw.
 */
const DESK_CSS = u(`
.cdx{position:absolute;left:3%;right:3%;top:50%;aspect-ratio:var(--ar,880/700);transform:translateY(-50%);container-type:size}
.cdx-win{--u:calc(100cqw / 880);--vh:calc(100cqh - 38u);--s1:min(330u,max(0px,1012u - var(--vh)));--s2:max(0px,1012u - var(--vh));position:relative;height:100%;border-radius:12u;overflow:hidden;background:#fff;color:#1a1a2e;font-size:14u;line-height:1.4;letter-spacing:0;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 24u 60u rgba(0,0,0,.5)}
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
.cdx-paid{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:20u;text-align:center;background:rgba(255,255,255,.96);opacity:0}
.cdx-ring{display:block;width:64u;height:64u}
.cdx-ring svg{display:block;width:100%;height:100%}
.cdx-paid b{margin-top:20u;font-size:20u;font-weight:600;letter-spacing:-.01em}
.cdx-paid small{margin-top:4u;font-size:14u;color:#6b7280}
.cdx-paid small+small{font-size:13u}
.cdx .cmv-cursor{position:absolute;left:62%;top:58%;z-index:2;line-height:0;font-size:22u;opacity:0}
`)

/* The tab cards and their mocks. Each mock is drawn in em of a 48 x 42 box (30 x 34 on a narrow screen), so it scales as one picture. */
const TABS_CSS = `
/* The tabs: "Make the work"'s pill tabs in their dark form (a dark track with a 1px light edge, the chosen pill white). */
.cmc-tablist{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.cmc-tab{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-height:44px;padding:20px 20px 24px;border-radius:21px;background:rgba(24,24,27,.94);border:1px solid rgba(255,255,255,.08);color:#a1a1aa;font-family:inherit;text-align:left;cursor:pointer;overflow:hidden;transition:background-color .3s,border-color .3s,color .3s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
@media (hover:hover){.cmc-tab:hover{border-color:rgba(255,255,255,.18);color:#e4e4e7}}
.cmc-tab[data-on]{background:#1d1d21;border-color:rgba(255,255,255,.26);color:#fff}
.cmc-tab:focus-visible{outline:2px solid #fff;outline-offset:3px}
.cmc-tab-l{font-size:14px;font-weight:500}
.cmc-tab-s{font-size:clamp(24px,2.3vw,34px);font-weight:300;letter-spacing:-.04em;line-height:1;color:#fff;white-space:nowrap}
.cmc-tab-bar{position:absolute;left:20px;right:20px;bottom:12px;height:2px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}
.cmc-tab-fill{position:absolute;inset:0;background:#e4e4e7;transform-origin:0 50%;transform:scaleX(1)}
.cmc-tab-fill[data-run]{animation:cmc-fill linear both}
@keyframes cmc-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.cmc-panels{display:grid;margin-top:12px}
.cmc-panel{grid-area:1/1;display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(24px,3.5vw,56px);align-items:center;padding:clamp(28px,3.6vw,52px);border-radius:31px;background:#111113;border:1px solid rgba(255,255,255,.08);opacity:0;visibility:hidden;transition:opacity .35s ease,visibility 0s linear .35s}
.cmc-panel[data-on]{opacity:1;visibility:visible;transition:opacity .45s ease .05s,visibility 0s}
.cmc-panel h3{margin:0;font-size:clamp(26px,3vw,42px);font-weight:400;line-height:1.1;letter-spacing:-.035em;color:#fff;text-wrap:balance}
.cmc-panel p{margin:16px 0 0;max-width:40ch;font-size:clamp(15.5px,1.25vw,18px);line-height:1.6;color:#a1a1aa}
/* A demo is a picture: it takes no pointer and nothing in it can be selected. */
.cmc-vis{position:relative;aspect-ratio:48/42;overflow:hidden;border-radius:20px;container-type:inline-size;pointer-events:none;user-select:none;-webkit-user-select:none}
.cmc-vis-in{position:absolute;inset:0;font-size:calc(100cqw / 48);color:#fff;line-height:1.35}
/* Round 7: a hidden panel is laid out once and never painted (visibility), so opening a tab only paints it; no content-visibility, which made the switch lay the whole demo out in that frame. */

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
/* --pw in the demo box's own units (not em): the screen reads it again inside, where 1em is 16px. */
.cmv-phone{position:absolute;left:5.5em;top:2.4em;--pw:calc(100cqw * 17 / 48)}
.cmv-phone .cmc-phone{box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 1.5em 3em rgba(0,0,0,.55)}
.cmv-links{position:absolute;left:25.5em;right:2.4em;top:9.5em;display:grid;gap:1em}
.cmv-link{position:relative;display:flex;align-items:center;gap:.9em;height:4.6em;padding:0 1em;font-size:1em;opacity:.6}
.cmv-link[data-on]{opacity:1;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.cmv-link[data-on]::before{content:"";position:absolute;right:100%;top:50%;width:3.4em;height:1px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.3))}
.cmv-link-m{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:.08em;width:3.6em;height:2.4em;border-radius:.6em;background:#000;color:#fff;font-size:.95em;font-weight:600;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.cmv-link-m svg{flex:none;width:.95em;height:1.1em}
.cmv-link-gp svg{width:1.05em;height:1.05em}
.cmv-link-gp{background:#fff;color:#3c4043}
.cmv-link-st{background:#635bff}
.cmv-stripe{font-size:1.02em;font-weight:700;letter-spacing:-.03em;color:#fff}
.cmv-link-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.cmv-link-t b{font-size:1.02em;font-weight:600}
.cmv-link-t small{font-size:.84em;color:#8b8b94}
.cmv-ok{position:relative;flex:none;width:1.5em;height:1.5em;border-radius:50%;background:rgba(74,222,128,.16)}
.cmv-ok::after{content:"";position:absolute;left:.52em;top:.36em;width:.36em;height:.62em;border:solid #4ade80;border-width:0 .16em .16em 0;transform:rotate(45deg)}

/* Currencies: one print, five readings. */
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
.cmv-price{margin-top:.5em;font-size:3.6em;font-weight:600;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums}
.cmv-where{font-size:.95em;color:#a1a1aa}
.cmv-chips{grid-column:1/-1;position:relative;display:grid;grid-template-columns:repeat(5,1fr);margin-top:1.4em;padding:.3em;border-radius:1.2em;background:#111113;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.cmv-chip{position:relative;display:flex;align-items:center;justify-content:center;gap:.45em;height:2.8em;font-size:.95em;font-weight:600;letter-spacing:.02em;color:#e4e4e7}
.cmv-hl{position:absolute;left:.3em;top:.3em;bottom:.3em;width:calc((100% - .6em) / 5);border-radius:.9em;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}

/* The reminder: three moments on one rail that fills as the hour passes, and the email. */
.cmv-rec{position:absolute;inset:0;font-size:1.15em}
.cmv-tl{position:absolute;left:3.6em;right:2.4em;top:2.6em;display:grid;grid-template-columns:repeat(3,1fr)}
.cmv-rail{position:absolute;left:.35em;right:calc(33.333% - .35em);top:.25em;height:2px;border-radius:1px;background:rgba(255,255,255,.12);overflow:hidden}
.cmv-fill{position:absolute;inset:0;background:linear-gradient(90deg,#e4e4e7,#4ade80);transform-origin:0 50%}
.cmv-st{position:relative;display:grid;gap:.1em;padding-top:1.5em;font-size:.85em}
.cmv-st i{position:absolute;left:0;top:0;width:.7em;height:.7em;border-radius:50%;background:#e4e4e7;box-shadow:0 0 0 .25em #111113}
.cmv-st3 i{background:#4ade80}
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
  .cmc-tablist{grid-template-columns:repeat(2,1fr);gap:10px}
  .cmc-tab{padding:16px 16px 22px;border-radius:19px}
  .cmc-tab-bar{left:16px;right:16px}
  .cmc-tab-s{font-size:min(6.2vw,26px)}
  .cmc-tab-l{font-size:13px}
  .cmc-panel{grid-template-columns:1fr;align-content:start;gap:20px;border-radius:23px;padding:24px 24px 20px}
  /* On a narrow screen each demo is drawn for a taller box and a larger em, so its words stay readable. */
  .cmc-vis{aspect-ratio:30/34;margin:0 -10px;border-radius:15px}
  .cmc-vis-in{font-size:calc(100cqw / 30)}
  /* Built to convert: the same desktop window, whole, a little taller so the page shows more of itself. */
  .cdx{--ar:880/1000}
  .cmv-phone{left:1.2em;top:1.8em;--pw:calc(100cqw * 12.6 / 30)}
  .cmv-links{left:14.6em;right:.8em;top:8.5em;gap:.8em}
  .cmv-link[data-on]::before{width:.8em}
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
  ${ON} :is(.cdx-v,.cdx-ph,.cdx-scroll,.cdx-sum-in,.cdx-radio i,.cdx-s0,.cdx-s1,.cdx-t0,.cdx-t1,.cdx-box-terms,.cmv-cursor,.cdx-pay,.cdx-paid,.cdx-ring,.cdx-paid b,.cdx-paid small,.cmv-sale,.pc-ap,.pc-touch,.ap-dim,.ap-sheet,.ap-side,.ap-done,.pc-paid,.pc-paid-ring,.pc-paid b,.pc-paid small,.cmv-cyc,.cmv-hl,.cmv-rec,.cmv-fill,.cmv-st,.cmv-mail,.cmv-mail-btn){animation-duration:${LOOP_S}s;animation-iteration-count:infinite;animation-fill-mode:both;animation-timing-function:cubic-bezier(.22,1,.36,1)}
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

  ${ON} .pc-ap{animation-name:pc-press}
  ${ON} .pc-touch{animation-name:pc-touch}
  ${ON} .ap-dim{animation-name:ap-dim}
  ${ON} .ap-sheet{animation-name:ap-sheet}
  ${ON} .ap-side{animation-name:ap-side}
  ${ON} .ap-done{animation-name:ap-done}
  ${ON} .pc-paid{animation-name:pc-paid}
  ${ON} .pc-paid-ring{animation-name:pc-ring}
  ${ON} .pc-paid b,${ON} .pc-paid small{animation-name:pc-paidt}

  ${ON} .cmv-cyc{animation-name:cmv-cyc;animation-delay:calc(var(--i) * ${LOOP_S / 5}s)}
  ${ON} .cmv-hl{animation-name:cmv-hl}

  ${ON} .cmv-rec{animation-name:cmv-rec;animation-timing-function:ease}
  ${ON} .cmv-fill{animation-name:cmv-fill;animation-timing-function:cubic-bezier(.45,0,.2,1)}
  ${ON} .cmv-st1{animation-name:cmv-st1}
  ${ON} .cmv-st2{animation-name:cmv-st2}
  ${ON} .cmv-st3{animation-name:cmv-st3}
  ${ON} .cmv-mail{animation-name:cmv-mail;animation-timing-function:cubic-bezier(.16,1,.3,1)}
  ${ON} .cmv-mail-btn{animation-name:cmv-btn}
}
@keyframes cdx-scroll{0%,${at(2.1)}{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.45,0,.2,1)}${at(2.8)},${at(3.4)}{transform:translate3d(0,calc(var(--s1) * -1),0);animation-timing-function:cubic-bezier(.45,0,.2,1)}${at(4.1)},${at(RESET)}{transform:translate3d(0,calc(var(--s2) * -1),0)}${at(RESET + 0.05)},100%{transform:translate3d(0,0,0)}}
@keyframes cdx-stick{0%,${at(2.1)}{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.45,0,.2,1)}${at(2.8)},${at(3.4)}{transform:translate3d(0,max(0px,calc(var(--s1) - 62u)),0);animation-timing-function:cubic-bezier(.45,0,.2,1)}${at(4.1)},${at(RESET)}{transform:translate3d(0,max(0px,calc(var(--s2) - 62u)),0)}${at(RESET + 0.05)},100%{transform:translate3d(0,0,0)}}
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
/* One-tap payments: a tap on Apple Pay, the wallet's sheet up, Done, the sheet away, Payment complete, and back. Eight layers, transform and opacity, nothing else. */
@keyframes pc-press{0%,${at(1)}{transform:scale(1)}${at(1.12)}{transform:scale(.96)}${at(1.34)},100%{transform:scale(1)}}
@keyframes pc-touch{0%,${at(0.95)}{opacity:0;transform:scale(.4)}${at(1.08)}{opacity:1;transform:scale(1)}${at(1.5)},100%{opacity:0;transform:scale(1.4)}}
@keyframes ap-dim{0%,${at(1.25)}{opacity:0}${at(1.75)},${at(4.25)}{opacity:.32}${at(4.75)},100%{opacity:0}}
@keyframes ap-sheet{0%,${at(1.25)}{transform:translate3d(0,110%,0)}${at(1.9)},${at(4.25)}{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.5,0,.75,0)}${at(4.7)},100%{transform:translate3d(0,110%,0)}}
@keyframes ap-side{0%,${at(2.9)}{opacity:1}${at(3.1)},${at(4.8)}{opacity:0}${at(5)},100%{opacity:1}}
@keyframes ap-done{0%,${at(3)}{opacity:0;transform:scale(.7)}${at(3.4)},${at(4.8)}{opacity:1;transform:scale(1)}${at(5)},100%{opacity:0;transform:scale(.7)}}
@keyframes pc-paid{0%,${at(4.35)}{opacity:0}${at(4.8)},${at(8.9)}{opacity:1}${at(9.4)},100%{opacity:0}}
@keyframes pc-ring{0%,${at(4.45)}{opacity:0;transform:scale(.6)}${at(4.95)},100%{opacity:1;transform:scale(1)}}
@keyframes pc-paidt{0%,${at(4.6)}{opacity:0;transform:translate3d(0,8px,0)}${at(5)},100%{opacity:1;transform:translate3d(0,0,0)}}
/* Local currencies: each reading in turn, the marker stepping along under it. */
@keyframes cmv-cyc{0%{opacity:0;transform:translate3d(0,.25em,0)}4%,17%{opacity:1;transform:translate3d(0,0,0)}21%,100%{opacity:0;transform:translate3d(0,-.25em,0)}}
@keyframes cmv-hl{0%,17%{transform:translate3d(0,0,0)}21%,37%{transform:translate3d(100%,0,0)}41%,57%{transform:translate3d(200%,0,0)}61%,77%{transform:translate3d(300%,0,0)}81%,96%{transform:translate3d(400%,0,0)}100%{transform:translate3d(0,0,0)}}
/* Checkout reminders: left at Pay, the rail fills to the hour, the email comes up, Finish checkout, paid; then the whole demo fades and starts over (one fade, not each part on its own). */
@keyframes cmv-rec{0%{opacity:0}${at(0.3)},${at(9.35)}{opacity:1}${at(9.8)},100%{opacity:0}}
@keyframes cmv-fill{0%,${at(0.35)}{transform:scaleX(0)}${at(1.15)},${at(4.1)}{transform:scaleX(.5)}${at(4.7)},100%{transform:scaleX(1)}}
@keyframes cmv-st1{0%,${at(0.2)}{opacity:.35}${at(0.5)},100%{opacity:1}}
@keyframes cmv-st2{0%,${at(0.95)}{opacity:.35}${at(1.25)},100%{opacity:1}}
@keyframes cmv-st3{0%,${at(4.55)}{opacity:.35}${at(4.85)},100%{opacity:1}}
@keyframes cmv-mail{0%,${at(1)}{opacity:0;transform:translate3d(0,1.4em,0)}${at(1.9)},100%{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-btn{0%,${at(3.8)}{transform:scale(1)}${at(3.95)}{transform:scale(.94)}${at(4.2)},100%{transform:scale(1)}}
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
  .cmc-panel,.cmc-tab{transition:none!important}
}
`

const CHECKOUT_CSS = SCENE_CSS + PHONE_CSS + DESK_CSS + TABS_CSS + LOOP_CSS + REST_CSS + STILL_CSS

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CHECKOUT_STYLES: readonly SectionStyle[] = [
  COMMERCE_KIT_STYLE,
  { href: "w12-commerce-checkout", precedence: "default", css: CHECKOUT_CSS },
]
