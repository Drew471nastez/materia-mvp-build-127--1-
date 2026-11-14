"use client"

/**
 * ===========================================================================
 *  CHECKOUT THAT TURNS A TAP INTO A SALE (home, section 9, landing round 5)
 * ===========================================================================
 * Black, with a fine dot grid. The owner's order, round 5:
 *
 *   1. the phone     an iPhone showing Storelib's real instant checkout, the
 *                    window a buyer gets on a OnePage in Safari. It is there
 *                    from the first pixel of the section and slides up into
 *                    place as the section comes in (a one-shot transform,
 *                    started once by an observer, never tied to scroll)
 *   2. the headline  beside it (under it on a phone), its words in one after
 *                    another on the same signal
 *   3. the tabs      scrolling on, the stage holds and the four tab cards
 *                    (Built to convert, One-tap payments, Local currencies,
 *                    Checkout reminders) come up over the phone with the page
 *                    and hide it. Plain scroll moves them: nothing is drawn per
 *                    frame, there is no scroll timeline and no orbit
 *
 * The tabs are the cards they were before the pill row (Nov 13, 0724a74c1):
 * a label, a short figure, a line that fills while the tab has its turn.
 *
 * THE PHONE IS THE REAL WINDOW. RealCheckout below is
 * components/checkout/instant-checkout.tsx inside checkout-window.tsx, as a
 * phone draws them (the window full screen, its grey head with the product's
 * picture, title and seller, Your details, the order line, Have a code?, the
 * payment method from components/community/public/compact-pay.tsx with the
 * device's wallet chosen, Pay, the terms line and Powered by Stripe), with the
 * same sizes, colours and words, laid out at the iPhone's own width (393px)
 * and scaled to the drawn phone in one transform. Safari's status bar and its
 * bottom address bar sit over it, as they do on the phone.
 *
 * TRUE FIGURES. The desktop window is the website checkout as
 * app/(storelib)/checkout/site/site-checkout.tsx lays it out, drawn whole
 * (both columns, every corner) and scaled to the box on any screen. The
 * seller's notice is the in-app sale notification (lib/notify/templates/
 * catalog.ts). The currencies are ones fees are written for
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
const HOW = "/home/how"
/**
 * What the phone sells: Nadia Brooks's field guide to street photography in
 * Chicago's Loop, an e-book. Its cover is a picture file, as a creator uploads
 * one (rendered once from a real Unsplash photograph of LaSalle Street,
 * photo-1519501025264-65ba15a82390, with the title set on paper stock).
 */
export const GUIDE = { title: "The Loop", author: "Nadia Brooks", price: "$19.00", cover: `${IMG}/guide-loop.webp` } as const
const PRODUCT = GUIDE.title
const SELLER = GUIDE.author
/** The physical product the demos sell beside the e-book: an embroidered cap, made when it is ordered. */
const CAP = { title: "Darkroom cap", option: "Yellow", price: "$28.00", img: `${HOW}/cap-yellow.webp` } as const

export const CHECKOUT_HEADING = "Checkout that turns a tap into a sale"

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
 * The entrance, without scroll work. One observer on the track: while the
 * track is wholly below the screen the section is armed (data-cmc-armed: the
 * phone a little low, the words out); once its top is 12% up the screen,
 * data-cmc-in plays the rise and the words as CSS transitions, on the
 * compositor. Mounted while already on screen, nothing is armed, so the
 * phone is simply there. Scrolled back up past it, it re-arms.
 */
function useEntrance(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    const track = root?.querySelector<HTMLElement>(".cmc-track")
    if (!root || !track || typeof IntersectionObserver !== "function") return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1]
        if (e.isIntersecting) {
          if (root.hasAttribute("data-cmc-armed")) root.setAttribute("data-cmc-in", "")
        } else if (e.boundingClientRect.top > 0) {
          root.removeAttribute("data-cmc-in")
          root.setAttribute("data-cmc-armed", "")
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    )
    io.observe(track)
    return () => {
      io.disconnect()
      root.removeAttribute("data-cmc-armed")
      root.removeAttribute("data-cmc-in")
    }
  }, [rootRef])
}

export function CheckoutScene() {
  const rootRef = useRef<HTMLElement>(null)
  const reduced = useCommerceReducedMotion()
  useEntrance(rootRef)
  const words = CHECKOUT_HEADING.split(" ")

  return (
    <section ref={rootRef} className="cmc" data-story-section="checkout" aria-labelledby="cmc-title">
      <CommerceKitStyle />
      <style href="w12-commerce-checkout" precedence="default">
        {CHECKOUT_CSS}
      </style>
      <span className="cmc-dots" aria-hidden="true" />
      <div className="cmc-track">
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
            <div className="cmc-rise">
              <Phone label={`A Storelib checkout on a phone (an iPhone): ${PRODUCT}, an e-book by ${SELLER}, ${GUIDE.price}, with Apple Pay.`} />
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

/** The iPhone: titanium band, black border, Dynamic Island, and the checkout under Safari's bars. */
function Phone({ label, wallets = false }: { label?: string; wallets?: boolean }) {
  return (
    <div className="cmc-phone" role={label ? "img" : undefined} aria-label={label}>
      <span className="cmc-key cmc-key-act" />
      <span className="cmc-key cmc-key-up" />
      <span className="cmc-key cmc-key-dn" />
      <span className="cmc-key cmc-key-pw" />
      <div className="cmc-bezel">
        <div className="cmc-screen" aria-hidden="true" inert>
          <div className="cmc-ui">
            <RealCheckout wallets={wallets} />
            <SafariBar />
            <StatusBar />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The instant checkout a buyer sees on a phone, in the real window's own
 * pixels (the rc- rules copy the Tailwind classes of checkout-window.tsx,
 * instant-checkout.tsx and compact-pay.tsx one for one). With `wallets`, the
 * One-tap payments demo: Apple Pay, then Google Pay on an Android phone, then
 * the card field, each with its own Pay.
 */
function RealCheckout({ wallets }: { wallets: boolean }) {
  return (
    <div className="rc">
      <div className="rc-head">
        <div className="rc-row">
          <span />
          <span className="rc-x">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
        </div>
        <div className="rc-who">
          <img className="rc-mark" src={GUIDE.cover} alt="" width={57} height={76} loading="lazy" decoding="async" />
          <div className="rc-title">{PRODUCT}</div>
          <div className="rc-sub">{SELLER}</div>
        </div>
      </div>
      <div className="rc-body">
        <div className="rc-body-in">
          <div className="rc-sec">
            <div className="rc-h3">Your details</div>
            <div className="rc-in">sam.rivera@mail.com</div>
            <div className="rc-in">Sam Rivera</div>
            <div className="rc-opt">
              <span className="rc-cb" />
              Email me news and offers
            </div>
          </div>
          <div className="rc-sum">
            <span className="rc-sum-t">{PRODUCT}</span>
            <b>{GUIDE.price}</b>
          </div>
          <div className="rc-code">
            Have a code?
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          <div className="rc-paysec">
            <div className="rc-h3 rc-h3-pay">Payment method</div>
            <div className="rc-mwrap">
              <div className="rc-methods">
                <span className="rc-m" data-on={wallets ? undefined : ""}>
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
                <span className="rc-m">
                  <CardGlyph />
                  Card
                </span>
              </div>
              {wallets ? (
                <>
                  <span className="ck-ring" />
                  <span className="rc-cardf">
                    <svg viewBox="0 0 24 16" width="24" height="16">
                      <rect width="24" height="16" rx="2.5" fill="#1a1f71" />
                      <path d="M9.6 10.9 10.6 5h1.6l-1 5.9H9.6Zm6.9-5.8a4 4 0 0 0-1.4-.2c-1.6 0-2.7.8-2.7 1.9 0 .9.8 1.3 1.4 1.6.6.3.8.5.8.7 0 .4-.5.6-1 .6a3.4 3.4 0 0 1-1.5-.3l-.2-.1-.2 1.3c.4.2 1 .3 1.7.3 1.7 0 2.8-.8 2.8-2 0-.7-.4-1.2-1.4-1.6-.6-.3-.9-.5-.9-.8 0-.2.3-.5.9-.5.5 0 .9.1 1.2.2l.1.1.4-1.2ZM20.6 5h-1.2c-.4 0-.7.1-.8.5l-2.4 5.4h1.7l.3-.9h2.1l.2.9h1.5L20.6 5Zm-2 3.8.6-1.6.2-.5.1.5.4 1.6h-1.3ZM8.3 5 6.7 9 6.5 8.2A4.7 4.7 0 0 0 4.3 5.6l1.5 5.3h1.7L10 5H8.3Z" fill="#fff" />
                    </svg>
                    <span className="rc-cardn">4242 4242 4242 4242</span>
                    <span className="rc-cardx">08 / 29</span>
                    <span className="rc-cardx">314</span>
                  </span>
                </>
              ) : null}
            </div>
            <div className="rc-after">
              <div className="rc-pay">
                <span className="ck-stack">
                  <span className="ck-w ck-w-a">{`Pay ${GUIDE.price} with Apple Pay`}</span>
                  {wallets ? (
                    <>
                      <span className="ck-w ck-w-g">{`Pay ${GUIDE.price} with Google Pay`}</span>
                      <span className="ck-w ck-w-c">{`Pay ${GUIDE.price}`}</span>
                    </>
                  ) : null}
                </span>
              </div>
              <p className="rc-terms">
                By paying you agree to the <u>Terms</u>. Your receipt and access come by email.
              </p>
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
        </div>
      </div>
    </div>
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
  { id: "cap", img: CAP.img, title: CAP.title, option: CAP.option, price: CAP.price, physical: true },
  { id: "guide", img: GUIDE.cover, title: PRODUCT, price: GUIDE.price, physical: false },
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

const WORDS = CHECKOUT_HEADING.split(" ").length
/* The headline's words, one after another once the section is in. */
const wordDelays = () => Array.from({ length: WORDS }, (_, i) => `.cmc[data-cmc-in] .cmc-w[data-w="${i}"]{transition-delay:${0.15 + i * 0.05}s}`).join("\n")

/*
 * The scene. The track is a screen of stage plus DWELL of scroll, the stage
 * held in it (position: sticky, the browser's own scrolling, nothing per
 * frame). The tab cards follow, pulled up by OVERLAP, so after a short look
 * at the phone they come up the screen with the page, over it, and hide it.
 * DWELL - OVERLAP is all the page spends on the phone alone.
 */
const DWELL = "80svh"
const OVERLAP = "64svh"
const SCENE_CSS = `
.cmc{position:relative;background:#000;color:#fff;border-radius:clamp(28px,4vw,56px);overflow:clip;padding-block:0!important;isolation:isolate}
.cmc-dots{position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(rgba(255,255,255,.13) 1px,transparent 1.4px);background-size:22px 22px;background-position:11px 11px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 35%,#000 20%,transparent 75%);mask-image:radial-gradient(ellipse 70% 60% at 50% 35%,#000 20%,transparent 75%)}
.cmc[data-story-section] > .cmc-track.cmc-track{position:relative;z-index:1;max-width:none;margin:0;padding:0;height:calc(100svh + ${DWELL})}
.cmc-stage{position:sticky;top:0;height:100svh;overflow:hidden;
  --hd:60px;--pw:min(70vw,300px,calc((100svh - 250px) / 2.07))}
.cmc-copy{position:absolute;z-index:4;left:20px;right:20px;top:calc(var(--hd) + clamp(14px,3svh,32px));text-align:center}
.cmc-title{margin:0 auto;font-size:clamp(30px,8.6vw,46px);font-weight:300;line-height:1.04;letter-spacing:-.045em;text-wrap:balance;color:#fff}
.cmc-w{display:inline-block}
.cmc-phone-wrap{position:absolute;z-index:3;left:50%;bottom:20px;width:var(--pw);margin-left:calc(var(--pw) / -2)}
.cmc-rise{position:relative}

@media (min-width:900px){
  .cmc-stage{--hd:68px;--pw:min(410px,calc((100svh - 104px) / 2.07))}
  .cmc-copy{left:max(var(--landing-gutter,48px),calc(50% - 600px));right:auto;width:min(44vw,560px);top:calc(50% + var(--hd) / 2);transform:translateY(-50%);text-align:left}
  .cmc-title{margin:0;font-size:clamp(42px,4.5vw,72px)}
  .cmc-phone-wrap{left:auto;right:max(calc(var(--landing-gutter,48px) + 40px),calc(50% - 500px));bottom:auto;top:calc(50% + var(--hd) / 2);margin:0;transform:translateY(-50%)}
}

/* The tab cards: a black ground that fades in from transparent at its top edge, so the phone goes under it softly. */
.cmc[data-story-section] > .cmc-cards.cmc-cards{position:relative;z-index:5;max-width:none;margin:calc(${OVERLAP} * -1) 0 0;padding:0;background:linear-gradient(180deg,rgba(0,0,0,0),#000 clamp(90px,14vh,160px))}
.cmc-cards-in{max-width:1320px;margin:0 auto;padding:clamp(72px,10vh,120px) var(--landing-gutter,clamp(20px,5vw,72px)) clamp(64px,8vw,120px)}

/*
 * The entrance (useEntrance): armed while the section is below the screen,
 * played once it comes in. Transform and opacity, as transitions, so the
 * compositor runs them and a finger on the glass never waits for them.
 */
@media (prefers-reduced-motion:no-preference){
  .cmc-rise{transition:transform 1.15s cubic-bezier(.16,1,.3,1)}
  .cmc-w{transition:opacity .6s ease,transform .8s cubic-bezier(.16,1,.3,1)}
  .cmc[data-cmc-armed]:not([data-cmc-in]) .cmc-rise{transform:translate3d(0,22%,0);transition-duration:0s}
  .cmc[data-cmc-armed]:not([data-cmc-in]) .cmc-w{opacity:0;transform:translate3d(0,.32em,0);transition-duration:0s}
  ${wordDelays()}
}
`

/* The iPhone, and the real checkout inside it at the phone's own width (393px), scaled to the drawing by --k. */
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

/* checkout-window.tsx on a phone: the window full screen, its head, its scrolling body. */
.rc{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;color:#1a1a2e}
.rc-head{flex:none;padding:66px 20px 20px;background:#f8f9fa;border-bottom:1px solid #eef0f2}
.rc-row{display:flex;align-items:center;justify-content:space-between}
.rc-x{display:grid;place-items:center;width:44px;height:44px;margin-right:-8px;border-radius:50%;color:#4b5563}
.rc-who{display:flex;flex-direction:column;align-items:center;margin-top:-12px;text-align:center}
.rc-mark{display:block;width:57px;height:76px;border-radius:12px;object-fit:cover;background:#eef0f2;box-shadow:0 0 0 1px rgba(17,17,19,.06)}
.rc-title{margin-top:10px;font-size:21px;font-weight:600;letter-spacing:-.01em}
.rc-sub{margin-top:2px;font-size:13.5px;color:#6b7280}
.rc-body{position:relative;flex:1;min-height:0;overflow:hidden}
.rc-body-in{display:flex;flex-direction:column;gap:20px;padding:20px 20px 0}
/* instant-checkout.tsx */
.rc-sec{display:flex;flex-direction:column;gap:10px}
.rc-h3{font-size:14.5px;font-weight:600}
.rc-h3-pay{margin-bottom:8px}
.rc-in{display:flex;align-items:center;height:48px;padding:0 14px;border:1px solid #e1e3e7;border-radius:12px;background:#fff;font-size:16px;white-space:nowrap;box-sizing:border-box}
.rc-opt{display:flex;align-items:center;gap:10px;padding:4px 0;font-size:13.5px;color:#4b5563}
.rc-cb{flex:none;width:16px;height:16px;border:1px solid #8e8e93;border-radius:4px;background:#fff;box-sizing:border-box}
.rc-sum{display:flex;align-items:center;gap:8px;min-height:48px;padding:0 16px;border:1px solid #e5e7eb;border-radius:12px;font-size:14px}
.rc-sum-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b7280}
.rc-sum b{font-weight:600;font-variant-numeric:tabular-nums}
.rc-code{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:500;color:#6b7280}
/* compact-pay.tsx: the wallet and the card as two choices, the card field, Pay. */
.rc-mwrap{position:relative}
.rc-methods{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rc-m{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;border:1px solid #e1e3e7;border-radius:12px;background:#fff;font-size:15px;font-weight:500;box-sizing:border-box}
.rc-m[data-on]{border-color:#1a1a2e;box-shadow:0 0 0 1px #1a1a2e}
.rc-after{position:relative}
.rc-pay{display:flex;align-items:center;justify-content:center;height:52px;margin-top:16px;border-radius:12px;background:#1a1a2e;color:#fff;font-size:16px;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 2px rgba(16,24,40,.2)}
.rc-terms{margin:20px 0 0;text-align:center;font-size:11.5px;line-height:1.625;color:#8b919a}
.rc-terms u{text-decoration-color:#d1d5db;text-underline-offset:2px}
.rc-pow{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0 4px;margin:14px 0 0;padding:6px 0;font-size:12.5px;color:#8b919a}
.rc-pow-s{display:inline-flex;align-items:center;gap:4px;padding:0 4px}
.rc-pow-s svg{margin-top:1px}
.rc-pow i{font-style:normal;color:#c4c8ce;padding:0 4px}
/* The One-tap demo's moving parts: a ring that moves to Card, the card field it opens. */
.ck-stack{display:inline-grid;place-items:center}
.ck-stack>*{grid-area:1/1}
.ck-w{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.ck-mw-a{gap:2px}
.ck-mw-g{gap:4px}
.ck-w-g,.ck-w-c,.ck-mw-g{opacity:0}
.ck-ring{position:absolute;left:0;top:0;z-index:1;width:calc(50% - 5px);height:48px;border-radius:12px;box-shadow:0 0 0 2px #1a1a2e;pointer-events:none}
.rc-cardf{position:absolute;left:0;right:0;top:calc(100% + 12px);display:flex;align-items:center;gap:12px;height:48px;padding:0 14px;border:1px solid #e1e3e7;border-radius:12px;background:#fff;font-size:16px;box-sizing:border-box;opacity:0}
.rc-cardn{flex:1;white-space:nowrap}
.rc-cardx{flex:none;color:#1a1a2e}
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
  ${ON} :is(.cdx-v,.cdx-ph,.cdx-scroll,.cdx-sum-in,.cdx-radio i,.cdx-s0,.cdx-s1,.cdx-t0,.cdx-t1,.cdx-box-terms,.cmv-cursor,.cdx-pay,.cdx-paid,.cdx-ring,.cdx-paid b,.cdx-paid small,.cmv-sale,.ck-ring,.ck-w-a,.ck-w-g,.ck-w-c,.ck-mw-a,.ck-mw-g,.rc-cardf,.rc-after,.rc-body-in,.cmv-link,.cmv-ok,.cmv-cyc,.cmv-hl,.cmv-st,.cmv-mail){animation-duration:${LOOP_S}s;animation-iteration-count:infinite;animation-fill-mode:both;animation-timing-function:cubic-bezier(.22,1,.36,1)}
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
  ${ON} .rc-cardf{animation-name:cmv-cardf}
  ${ON} .rc-after{animation-name:cmv-after}
  ${ON} .rc-body-in{animation-name:cmv-lift}
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
/* One-tap payments: Apple Pay, then Google Pay, then the card on Stripe, each lit on the phone and beside it, each ticked as connected. */
@keyframes cmv-ring{0%,${at(3.2)}{transform:translate3d(0,0,0)}${at(3.6)},${at(6.4)}{transform:translate3d(0,0,0)}${at(6.8)},${at(9.6)}{transform:translate3d(calc(100% + 10px),0,0)}100%{transform:translate3d(0,0,0)}}
@keyframes cmv-wa{0%,${at(3.2)}{opacity:1;transform:translate3d(0,0,0)}${at(3.5)},${at(9.6)}{opacity:0;transform:translate3d(0,-.4em,0)}100%{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-wg{0%,${at(3.25)}{opacity:0;transform:translate3d(0,.4em,0)}${at(3.55)},${at(6.4)}{opacity:1;transform:translate3d(0,0,0)}${at(6.7)},100%{opacity:0;transform:translate3d(0,-.4em,0)}}
@keyframes cmv-mwa{0%,${at(3.2)}{opacity:1;transform:translate3d(0,0,0)}${at(3.5)},${at(6.4)}{opacity:0;transform:translate3d(0,-.4em,0)}${at(6.7)},100%{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-mwg{0%,${at(3.25)}{opacity:0;transform:translate3d(0,.4em,0)}${at(3.55)},${at(6.4)}{opacity:1;transform:translate3d(0,0,0)}${at(6.7)},100%{opacity:0;transform:translate3d(0,-.4em,0)}}
@keyframes cmv-cardf{0%,${at(6.45)}{opacity:0}${at(6.75)},${at(9.6)}{opacity:1}${at(9.9)},100%{opacity:0}}
@keyframes cmv-after{0%,${at(6.4)}{transform:translate3d(0,0,0)}${at(6.75)},${at(9.6)}{transform:translate3d(0,60px,0)}${at(9.95)},100%{transform:translate3d(0,0,0)}}
@keyframes cmv-lift{0%,${at(6.4)}{transform:translate3d(0,0,0)}${at(6.75)},${at(9.6)}{transform:translate3d(0,-60px,0)}${at(9.95)},100%{transform:translate3d(0,0,0)}}
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
  .cmc-panel,.cmc-tab{transition:none!important}
}
`

const CHECKOUT_CSS = SCENE_CSS + PHONE_CSS + DESK_CSS + TABS_CSS + LOOP_CSS + REST_CSS + STILL_CSS

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CHECKOUT_STYLES: readonly SectionStyle[] = [
  COMMERCE_KIT_STYLE,
  { href: "w12-commerce-checkout", precedence: "default", css: CHECKOUT_CSS },
]
