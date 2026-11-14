"use client"

/**
 * ===========================================================================
 *  HIGH-CONVERTING CHECKOUT: THE SCROLL SCENE (home, section 9)
 * ===========================================================================
 * Black. A modern iPhone with Storelib's own instant checkout on it (the
 * window components/checkout/instant-checkout.tsx draws: the grey head with
 * the product and the seller, Your details, the line and its price, Payment
 * method with the wallet and Card, "Pay $19.00 with Apple Pay") stands beside
 * the headline. The stage holds still while the page scrolls past it, and the
 * scroll moves the purchase on, one step at a time: Pay is pressed and the
 * Apple Pay sheet comes up, Face ID confirms, the sheet goes and the window
 * turns to "Payment complete". Scroll back and it steps back. Under the
 * scene, five tabs (the pill tabs "Make the work" uses, in their dark form),
 * each a true thing checkout does, each with its own small demo that plays
 * through and starts over for as long as it is on screen: the same checkout
 * in a desktop browser, the wallet on a phone alone, one price read in five
 * currencies, the reminder email with its three moments, the paid receipt.
 * On this black ground the cards are dark surfaces; only the product's own
 * screens (the browser, the phone) are drawn light, as they are. Nothing a
 * demo draws takes the pointer: the tabs are the only controls here.
 *
 * SMOOTH BY CONSTRUCTION (the owner: the scroll "feels very bad").
 *   Nothing is tied to the scroll position frame by frame. Three invisible
 *   bands in the track cross the middle of the screen as the page scrolls;
 *   one IntersectionObserver notices and sets data-step on the track (four
 *   attribute changes over the whole scene, never a scroll listener, never a
 *   layout read, never React state). Each step's change then plays as a CSS
 *   transition of transform and opacity, on the compositor, at its own
 *   unhurried pace whatever the speed of the scroll: a fast flick and a slow
 *   drag look the same, and nothing scrubs half way.
 *   The products that used to orbit the phone (eighteen endless 3D loops) are
 *   gone, and so is the purple glow under the phone.
 *   The phone is sized from the viewport alone (no measuring), so nothing in
 *   the scene moves once it is drawn.
 *   Reduced motion: no pinning, no steps, the checkout drawn still.
 *
 * TRUE FIGURES. The tabs say what the code does: email, name and a wallet
 * button in one window (instant checkout), Apple Pay and Google Pay
 * (compact-pay), the currencies fees are written for
 * (lib/payments/fees/currency-rules), the checkout reminder an hour after a
 * checkout that did not finish, only for buyers who ticked the box, worded
 * as lib/physical/email-templates checkoutReminderEmail words it
 * (lib/automations/abandoned.ts), and the seller's sale email subject from
 * lib/notify/templates/catalog.ts. Example prices are labelled.
 */
import { StorelibLogo } from "@/components/brand/storelib-logo"
import type { SectionStyle } from "./lazy-section"
import { useEffect, useRef, useState } from "react"
import { COMMERCE_CURRENCY_COUNT, COMMERCE_KIT_STYLE, CommerceKitStyle, useCommerceLive, useCommerceReducedMotion } from "./commerce-kit"
import { EBOOK, EBOOK_COVER_CSS, EbookCover, EbookCoverStyle } from "./ebook-cover"

const IMG = "/home/commerce"
const PRODUCT = EBOOK.title
const SELLER = EBOOK.author

/** The scroll steps, as data-step on the track: 0 the checkout, 1 Pay pressed and the Apple Pay sheet up, 2 confirmed, 3 paid. */
export const CHECKOUT_STEPS = ["Tap Pay", "Confirm with Face ID", "Paid, receipt sent"] as const

const TABS = [
  {
    id: "convert",
    label: "Built to convert",
    stat: "1 screen",
    title: "One screen, then paid",
    body: "No account to make and no cart to visit. Email, name, pay, in a window that opens over your page on a phone or a computer, so buyers never lose sight of what they came for.",
  },
  {
    id: "tap",
    label: "One-tap payments",
    stat: "1 tap",
    title: "Apple Pay and Google Pay, built in",
    body: "The wallet on their device is offered first wherever it works, with cards beside it. A glance or a fingerprint, and the order is in.",
  },
  {
    id: "currency",
    label: "Local currencies",
    stat: `${COMMERCE_CURRENCY_COUNT} currencies`,
    title: "Prices people read without a calculator",
    body: "Your website can show prices in a visitor's own currency and charge in it: dollars, euros, pounds, yen, Canadian dollars and more.",
  },
  {
    id: "recover",
    label: "Checkout reminders",
    stat: "1 hour",
    title: "Bring back the ones who almost bought",
    body: "Someone reached Pay and left? If they ticked the box for emails, a reminder goes out an hour later, and it stops the moment they buy.",
  },
  {
    id: "paid",
    label: "Order paid",
    stat: "Instant",
    title: "Paid, delivered, and you hear about it",
    body: "The moment the payment clears, the buyer gets the receipt and their access by email, and you get a note saying what sold, for how much.",
  },
] as const
type TabId = (typeof TABS)[number]["id"]
/** One demo, start to finish, in seconds. Every tab's loop is this long, and so is a tab's turn when they play by themselves. */
const LOOP_S = 9
const AUTO_MS = LOOP_S * 1000
/** A moment of the loop (seconds) as a keyframe offset. */
const at = (sec: number) => `${Math.round((sec / LOOP_S) * 10000) / 100}%`

/**
 * The steps. Four bands lie end to end down the track (0 the checkout, 1 Pay
 * and the sheet, 2 confirmed, 3 paid); whichever one is across the middle of
 * the screen is the step. When none is (the middle of the screen is above or
 * below the whole track), the step is 0 before it and 3 after it, read from
 * the rectangle the observer hands over. A second observer, on the screen as
 * a whole, catches a jump that skips the track (an anchor, Home or End). It
 * runs once per crossing, never per frame, and reads no layout.
 */
function useScrollSteps(trackRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const track = trackRef.current
    if (!track || typeof IntersectionObserver !== "function") return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const bands = [...track.querySelectorAll<HTMLElement>("[data-cmc-band]")]
    const across = new Set<number>()
    const set = (step: number) => {
      if (track.dataset.step !== String(step)) track.dataset.step = String(step)
    }
    const outside = (e: IntersectionObserverEntry) => {
      const mid = e.rootBounds ? e.rootBounds.top + e.rootBounds.height / 2 : innerHeight / 2
      return e.boundingClientRect.top > mid ? 0 : 3
    }
    const middle = new IntersectionObserver(
      (entries) => {
        let edge = -1
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.cmcBand)
          if (e.isIntersecting) across.add(n)
          else {
            across.delete(n)
            edge = outside(e)
          }
        }
        if (across.size) set(Math.max(...across))
        else if (edge >= 0) set(edge)
      },
      { rootMargin: "-50% 0px -49% 0px" },
    )
    /* The first band coming on screen with the middle still above its foot is the start; the last band with the middle past its top is the end. */
    const screen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || across.size) continue
        const mid = e.rootBounds ? e.rootBounds.top + e.rootBounds.height / 2 : innerHeight / 2
        const n = Number((e.target as HTMLElement).dataset.cmcBand)
        if (n === 0 && e.boundingClientRect.bottom > mid) set(0)
        else if (n === bands.length - 1 && e.boundingClientRect.top < mid) set(n)
      }
    })
    for (const b of bands) middle.observe(b)
    for (const b of [bands[0], bands[bands.length - 1]]) if (b) screen.observe(b)
    return () => {
      middle.disconnect()
      screen.disconnect()
    }
  }, [trackRef])
}

export function CheckoutScene() {
  const trackRef = useRef<HTMLDivElement>(null)
  const reduced = useCommerceReducedMotion()
  useScrollSteps(trackRef)

  return (
    <section className="cmc" data-story-section="checkout" aria-labelledby="cmc-title">
      <CommerceKitStyle />
      <EbookCoverStyle />
      <style href="w12-commerce-checkout" precedence="default">
        {CHECKOUT_CSS}
      </style>
      <div ref={trackRef} className="cmc-track" data-step="0">
        {[0, 1, 2, 3].map((n) => (
          <span key={n} className="cmc-band" data-cmc-band={n} aria-hidden="true" />
        ))}
        <div className="cmc-stage">
          <div className="cmc-copy">
            <h2 id="cmc-title" className="cmc-title">
              Checkout that turns a tap into a sale
            </h2>
            <ol className="cmc-steps" aria-hidden="true">
              {CHECKOUT_STEPS.map((s, i) => (
                <li key={s} className="cmc-step" data-n={i + 1}>
                  <span className="cmc-step-n">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>

          <div className="cmc-phone-wrap">
            <Phone label={`A Storelib checkout on a phone (an iPhone): ${PRODUCT}, an e-book by ${SELLER}, $19.00, paid with Apple Pay.`} />
          </div>
        </div>
      </div>

      <CheckoutTabs reduced={reduced} />
    </section>
  )
}

/* ── The phone: a modern iPhone, drawn in em so it scales ─────────────── */

/** The iPhone: titanium band, black border, Dynamic Island, the status bar, Storelib's checkout, the Apple Pay sheet. */
function Phone({ label }: { label?: string }) {
  return (
    <div className="cmc-phone" role={label ? "img" : undefined} aria-label={label}>
      <span className="cmc-key cmc-key-act" />
      <span className="cmc-key cmc-key-up" />
      <span className="cmc-key cmc-key-dn" />
      <span className="cmc-key cmc-key-pw" />
      <div className="cmc-bezel">
        <div className="cmc-screen" aria-hidden="true">
          <div className="cmc-ui">
            <CheckoutUI wallet="apple" />
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
            <span className="cmc-scrim" />
            <div className="cmc-sheet-in">
              <div className="cmc-sheet">
                <div className="cmc-sheet-top">
                  <span className="cmc-ap">
                    <AppleMark />
                    Pay
                  </span>
                  <span className="cmc-close">
                    <svg viewBox="0 0 12 12" width="0.6em" height="0.6em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="m2.5 2.5 7 7m0-7-7 7" />
                    </svg>
                  </span>
                </div>
                <div className="cmc-card">
                  <span className="cmc-cardart">
                    <span />
                  </span>
                  <span className="cmc-card-t">
                    <b>Everyday Card</b>
                    <small>•••• 4242</small>
                  </span>
                  <svg viewBox="0 0 8 14" width="0.45em" height="0.8em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m1.5 1.5 5 5.5-5 5.5" />
                  </svg>
                </div>
                <div className="cmc-sheet-row">
                  <span>Pay {SELLER}</span>
                  <b>$19.00</b>
                </div>
                <div className="cmc-confirm">
                  <span className="cmc-fid">
                    <FaceId />
                    <small>Confirm with Side Button</small>
                  </span>
                  <span className="cmc-sheet-ok">
                    <svg viewBox="0 0 40 40" width="2.6em" height="2.6em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="20" cy="20" r="17" />
                      <path d="m12.5 20.5 5 5 10-10.5" />
                    </svg>
                    <small>Done</small>
                  </span>
                </div>
              </div>
            </div>
            <span className="cmc-dbl">Double Click to Pay</span>
            <span className="cmc-home" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Storelib's instant checkout, as components/checkout/instant-checkout.tsx
 * and checkout-window.tsx draw it, in em (1em = 16px of the real window): on
 * a phone it fills the screen, in a browser it is the 520px window.
 */
function CheckoutUI({ wallet, desktop = false, cursor = false, only }: { wallet: "apple" | "google"; desktop?: boolean; cursor?: boolean; only?: "form" | "done" }) {
  return (
    <div className="ck" data-desk={desktop || undefined} data-only={only}>
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
        {only === "done" ? null : (
        <div className="ck-form">
          <div className="ck-sec">
            <div className="ck-h3">Your details</div>
            <div className="ck-field">
              <span className="ck-ph">Email</span>
              <span className="ck-val ck-v1">sam.rivera@mail.com</span>
            </div>
            <div className="ck-field">
              <span className="ck-ph">Name</span>
              <span className="ck-val ck-v2">Sam Rivera</span>
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
          <div className="ck-code">
            Have a code?
            <svg viewBox="0 0 12 12" width="0.85em" height="0.85em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 4.5 3 3 3-3" />
            </svg>
          </div>
          <div className="ck-sec">
            <div className="ck-h3">Payment method</div>
            <div className="ck-methods">
              <span className="ck-m" data-on="">
                {wallet === "apple" ? <AppleMark /> : <GoogleMark />}
                Pay
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
              {wallet === "apple" ? "Pay $19.00 with Apple Pay" : "Pay $19.00 with Google Pay"}
              {cursor ? <Cursor className="cmv-cur2" /> : null}
            </div>
          </div>
          <div className="ck-terms">
            By paying you agree to the <u>Terms</u>. Your receipt and access come by email.
          </div>
        </div>
        )}

        {only === "form" ? null : (
        <div className="ck-done">
          <span className="ck-check">
            <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <div className="ck-done-t">Payment complete</div>
          <div className="ck-done-s">We sent your receipt and your access to sam.rivera@mail.com.</div>
          <div className="ck-open">Open it now</div>
        </div>
        )}
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

function FaceId() {
  return (
    <svg viewBox="0 0 40 40" width="2.6em" height="2.6em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 13V9.5A5.5 5.5 0 0 1 9.5 4H13M27 4h3.5A5.5 5.5 0 0 1 36 9.5V13M36 27v3.5a5.5 5.5 0 0 1-5.5 5.5H27M13 36H9.5A5.5 5.5 0 0 1 4 30.5V27M14 15v3M26 15v3M20.5 15v7.5H18.5M15 27.5c2.8 2.4 7.2 2.4 10 0" />
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

  /* On a phone the five pills are wider than the screen: the chosen one is brought to the middle of its own row (never the page). */
  useEffect(() => {
    const list = listRef.current
    const tab = refs.current[TABS.findIndex((x) => x.id === active)]
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return
    list.scrollTo({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" })
  }, [active, reduced])

  return (
    <div ref={cardsRef} className="cmc-cards" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocusCapture={() => setHeld(true)} onBlurCapture={() => setHeld(false)}>
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
          <div key={t.id} id={`cmc-panel-${t.id}`} role="tabpanel" aria-labelledby={`cmc-tab-${t.id}`} className="cmc-panel" data-on={t.id === active || undefined} inert={t.id !== active}>
            <div className="cmc-panel-copy">
              <span className="cmc-panel-stat">{t.stat}</span>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </div>
            <div className="cmc-vis" aria-hidden="true">
              <div className="cmc-vis-in">
                {t.id === "convert" ? <VisConvert /> : t.id === "tap" ? <VisTap /> : t.id === "currency" ? <VisCurrency /> : t.id === "recover" ? <VisRecover /> : <VisPaid />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A desktop browser with Maya's product page and, over it, the same checkout window. */
function Browser({ wallet, cursor = false, className }: { wallet: "apple" | "google"; cursor?: boolean; className: string }) {
  /* (The wallet is whichever the buyer's device has: compact-pay offers Apple Pay or Google Pay.) */
  return (
    <div className={`cmv-brw ${className}`}>
      <div className="cmv-br">
        <div className="cmv-bar">
          <span className="cmv-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="cmv-url">
            <svg viewBox="0 0 12 14" width="0.7em" height="0.8em" fill="currentColor">
              <path d="M3 6V4.2a3 3 0 0 1 6 0V6h.6c.8 0 1.4.6 1.4 1.4v4.8c0 .8-.6 1.4-1.4 1.4H2.4c-.8 0-1.4-.6-1.4-1.4V7.4C1 6.6 1.6 6 2.4 6H3Zm1.5 0h3V4.2a1.5 1.5 0 0 0-3 0V6Z" />
            </svg>
            storelib.com/mayaellis
          </span>
        </div>
        <div className="cmv-page">
          <div className="cmv-nav">
            <img src={`${IMG}/creator-maya.webp`} alt="" loading="lazy" decoding="async" width={64} height={64} />
            <b>{SELLER}</b>
            <span className="cmv-links">
              <span>Shop</span>
              <span>Recipes</span>
              <span>About</span>
            </span>
          </div>
          <div className="cmv-prod">
            <span className="cmv-prod-img">
              <EbookCover className="cmv-prod-cover" />
            </span>
            <div className="cmv-prod-t">
              <small>E-book</small>
              <b>{PRODUCT}</b>
              <span className="cmv-prod-p">$19.00</span>
              <p>42 pasta recipes for busy evenings, most ready in about 30 minutes. A PDF for your phone, tablet or printer.</p>
              <span className="cmv-buy">
                Buy now
                {cursor ? <Cursor className="cmv-cur1" /> : null}
              </span>
              <small className="cmv-prod-n">Instant download · PDF, {EBOOK.pages} pages</small>
            </div>
          </div>
          <span className="cmv-dim" />
          <div className="cmv-dlg cmv-dlg-form">
            <CheckoutUI wallet={wallet} desktop cursor={cursor} only="form" />
          </div>
          <div className="cmv-dlg cmv-dlg-done">
            <CheckoutUI wallet={wallet} desktop only="done" />
          </div>
        </div>
      </div>
    </div>
  )
}

function VisConvert() {
  return (
    <div className="cmv-convert">
      <Browser wallet="apple" cursor className="cmv-br-convert" />
    </div>
  )
}

/** One-tap payments: a phone and nothing else. Pay, the wallet's sheet, a glance, paid, and again. */
function VisTap() {
  return (
    <div className="cmv-phone">
      <Phone />
    </div>
  )
}

/* Example prices for one $19 product as each currency would show it. */
const PRICES = [
  { code: "USD", flag: "US", where: "United States", price: "$19.00" },
  { code: "EUR", flag: "EU", where: "Euro area", price: "€17.50" },
  { code: "GBP", flag: "GB", where: "United Kingdom", price: "£15.00" },
  { code: "JPY", flag: "JP", where: "Japan", price: "¥2,900" },
  { code: "CAD", flag: "CA", where: "Canada", price: "C$26.00" },
] as const

function Flag({ code }: { code: string }) {
  return <img className="cmv-flag" src={`/flags/${code}.svg`} alt="" loading="lazy" decoding="async" width={21} height={14} />
}

/** One product, one price, read in five currencies in turn. */
function VisCurrency() {
  return (
    <div className="cmv-cur">
      <div className="cmv-cc">
        <div className="cmv-cc-top">
          <EbookCover className="cmv-cc-cover" />
          <span>
            <b>{PRODUCT}</b>
            <small>
              {EBOOK.kind} by {SELLER}
            </small>
          </span>
        </div>
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

/** The reminder: left at Pay, the email an hour later, paid. */
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
          <b>Paid $19.00</b>
          <small>3:31 PM</small>
        </span>
      </div>
      <div className="cmv-mail">
        <div className="cmv-mail-from">
          <img src={`${IMG}/creator-maya.webp`} alt="" loading="lazy" decoding="async" width={64} height={64} />
          <span>
            <b>{SELLER}</b>
            <small>to Sam · 3:14 PM</small>
          </span>
        </div>
        <div className="cmv-mail-subj">You left {PRODUCT} at checkout</div>
        <div className="cmv-mail-h">Still thinking it over?</div>
        <p>Hi Sam, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off.</p>
        <span className="cmv-mail-btn">Finish checkout</span>
        <div className="cmv-mail-line">
          <EbookCover className="cmv-thumb" />
          <span>{PRODUCT}</span>
          <b>$19.00</b>
        </div>
      </div>
    </div>
  )
}

function VisPaid() {
  return (
    <div className="cmv-paid">
      <div className="cmv-rcpt">
        <span className="cmv-rcpt-check">
          <svg viewBox="0 0 24 24" width="1.5em" height="1.5em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <b className="cmv-rcpt-t">Payment complete</b>
        <small className="cmv-rcpt-s">We sent your receipt and your access to sam.rivera@mail.com.</small>
        <div className="cmv-rcpt-rows">
          <div>
            <EbookCover className="cmv-thumb" />
            <span>{PRODUCT}</span>
            <b>$19.00</b>
          </div>
          <div>
            <span>Paid with</span>
            <b className="cmv-rcpt-ap">
              <AppleMark />
              Pay
            </b>
          </div>
        </div>
        <span className="cmv-rcpt-btn">Open it now</span>
      </div>
      <div className="cmv-sale">
        <StorelibLogo size={40} alt="" fluid />
        <span className="cmv-note-t">
          <span className="cmv-note-top">
            <b>Storelib</b>
            <small>now</small>
          </span>
          <span className="cmv-note-s">You sold {PRODUCT} for $19.00</span>
          <span className="cmv-note-p">Sam bought {PRODUCT}.</span>
        </span>
      </div>
    </div>
  )
}

/* ── Styles ──────────────────────────────────────────────────────────── */

/*
 * The scene. The track is the stage's height plus 150vh of scroll; three
 * bands mark where each step begins (the middle of the screen crossing them:
 * a band's top is 50vh plus its share of the 150vh). The stage holds still
 * (position:sticky) and only data-step changes, which the transitions below
 * play on the compositor.
 */
const SCENE_CSS = `
.cmc{position:relative;background:#000;color:#fff;border-radius:clamp(28px,4vw,56px);overflow:clip;padding-block:0!important;isolation:isolate}
.cmc[data-story-section] > .cmc-track.cmc-track{position:relative;max-width:none;margin:0;padding:0;height:calc(100svh + 150vh)}
.cmc-band{position:absolute;left:0;width:1px;pointer-events:none}
.cmc-band[data-cmc-band="0"]{top:0;height:74vh}
.cmc-band[data-cmc-band="1"]{top:74vh;height:39vh}
.cmc-band[data-cmc-band="2"]{top:113vh;height:30vh}
.cmc-band[data-cmc-band="3"]{top:143vh;bottom:0}
.cmc-stage{position:sticky;top:0;height:100svh;overflow:hidden;--hd:60px;--pw:min(80vw,330px,calc((100svh - 230px) / 2.07))}

.cmc-copy{position:absolute;z-index:2;left:20px;right:20px;top:calc(var(--hd) + clamp(16px,3svh,32px));text-align:center}
.cmc-title{margin:0 auto;font-size:clamp(30px,8.6vw,46px);font-weight:300;line-height:1.04;letter-spacing:-.045em;text-wrap:balance;color:#fff}
.cmc-steps{display:none}
.cmc-phone-wrap{position:absolute;z-index:3;left:50%;bottom:22px;transform:translateX(-50%)}

@media (min-width:900px){
  .cmc-stage{--hd:68px;--pw:min(360px,calc((100svh - 160px) / 2.07))}
  .cmc-copy{left:max(var(--landing-gutter,48px),calc(50% - 600px));right:auto;width:min(44vw,560px);top:calc(50% + var(--hd) / 2);transform:translateY(-50%);text-align:left}
  .cmc-title{margin:0;font-size:clamp(42px,4.5vw,72px)}
  .cmc-steps{display:grid;gap:16px;margin:clamp(28px,4svh,44px) 0 0;padding:0;list-style:none}
  .cmc-phone-wrap{left:auto;right:max(var(--landing-gutter,48px),calc(50% - 540px));bottom:auto;top:calc(50% + var(--hd) / 2);transform:translateY(-50%)}
}
.cmc-step{display:flex;align-items:center;gap:14px;font-size:17px;letter-spacing:-.01em;color:#fff;opacity:.4;transition:opacity .5s ease}
.cmc-step-n{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:50%;font-size:13px;font-variant-numeric:tabular-nums;box-shadow:inset 0 0 0 1px rgba(255,255,255,.4)}
.cmc-track[data-step="1"] .cmc-step[data-n="1"],.cmc-track[data-step="2"] .cmc-step[data-n="2"],.cmc-track[data-step="3"] .cmc-step[data-n="3"]{opacity:1}

/* The purchase, one step at a time: transitions of transform and opacity only, each at its own pace. */
.cmc-stage .cmc-scrim{transition:opacity .45s ease}
.cmc-track:is([data-step="1"],[data-step="2"]) .cmc-scrim{opacity:1}
.cmc-stage .cmc-sheet-in{transition:transform .7s cubic-bezier(.32,.72,0,1)}
.cmc-track:is([data-step="1"],[data-step="2"]) .cmc-sheet-in{transform:translate3d(0,0,0)}
.cmc-stage .cmc-dbl{transform:translate3d(.6em,0,0);transition:opacity .3s ease,transform .45s cubic-bezier(.22,1,.36,1)}
.cmc-track[data-step="1"] .cmc-dbl{opacity:1;transform:translate3d(0,0,0);transition-delay:.4s}
.cmc-stage .cmc-fid{transition:opacity .3s ease}
.cmc-track:is([data-step="2"],[data-step="3"]) .cmc-fid{opacity:0}
.cmc-stage .cmc-sheet-ok{transform:scale(.8);transition:opacity .3s ease,transform .5s cubic-bezier(.3,1.4,.5,1)}
.cmc-track:is([data-step="2"],[data-step="3"]) .cmc-sheet-ok{opacity:1;transform:scale(1);transition-delay:.15s}
.cmc-stage .ck-form{transition:opacity .35s ease}
.cmc-track[data-step="3"] .ck-form{opacity:0;transition-delay:.25s}
.cmc-stage .ck-done{transform:translate3d(0,.8em,0) scale(.98);transition:opacity .45s ease,transform .6s cubic-bezier(.22,1,.36,1)}
.cmc-track[data-step="3"] .ck-done{opacity:1;transform:translate3d(0,0,0) scale(1);transition-delay:.45s}
.cmc-track[data-step="1"] .cmc-stage .ck-pay{animation:cmc-press .35s ease both}
@keyframes cmc-press{0%,100%{transform:scale(1)}50%{transform:scale(.96)}}
`

/* The iPhone and the checkout window inside it (and inside the browser mocks). */
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
.cmc-status{position:absolute;left:0;right:0;top:0;height:3.375em;display:flex;align-items:center;justify-content:space-between;padding:0 1.9em 0 2.35em;font-size:1em;font-weight:600;color:#000;pointer-events:none}
.cmc-time{font-size:1.0625em;letter-spacing:-.01em;padding-top:.15em}
.cmc-island{position:absolute;left:50%;top:.6875em;width:7.875em;height:2.3125em;margin-left:-3.9375em;border-radius:1.2em;background:#000}
.cmc-icons{display:flex;align-items:center;gap:.32em;padding-top:.15em}
.cmc-batt{position:relative;width:1.6em;height:.78em;border-radius:.26em;border:1.5px solid rgba(0,0,0,.4);padding:1.5px}
.cmc-batt::after{content:"";position:absolute;right:-.2em;top:50%;width:.12em;height:.28em;margin-top:-.14em;border-radius:0 1px 1px 0;background:rgba(0,0,0,.4)}
.cmc-batt span{display:block;width:82%;height:100%;border-radius:.12em;background:#000}
.cmc-home{position:absolute;left:50%;bottom:.5em;width:8.375em;height:.3125em;margin-left:-4.19em;border-radius:1em;background:#0b0b0d}
.cmc-scrim{position:absolute;inset:0;background:rgba(0,0,0,.26);opacity:0}
.cmc-sheet-in{position:absolute;left:.5em;right:.5em;bottom:.5em;transform:translate3d(0,108%,0)}
.cmc-sheet{background:#fff;border-radius:2.3em;padding:1.25em 1.25em 1.6em;box-shadow:0 -.25em 2.5em rgba(0,0,0,.22);color:#000}
.cmc-sheet-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:1em}
.cmc-ap{display:inline-flex;align-items:center;gap:.08em;font-size:1.45em;font-weight:600;letter-spacing:-.02em}
.cmc-close{display:grid;place-items:center;width:1.9em;height:1.9em;border-radius:50%;background:#ededf0;color:#7a7a80}
.cmc-card{display:flex;align-items:center;gap:.85em;padding:.8em .9em;border-radius:1em;background:#f4f4f7;color:#8a8a90}
.cmc-cardart{position:relative;flex:none;width:3.1em;height:2em;border-radius:.32em;background:linear-gradient(135deg,#46464d,#1f1f23);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.cmc-cardart span{position:absolute;left:.35em;bottom:.35em;width:.7em;height:.5em;border-radius:.12em;background:rgba(255,255,255,.75)}
.cmc-card-t{flex:1;min-width:0;color:#000}
.cmc-card-t b{display:block;font-size:.95em;font-weight:600}
.cmc-card-t small{display:block;font-size:.82em;color:#86868b}
.cmc-sheet-row{display:flex;justify-content:space-between;align-items:baseline;padding:1em .2em .9em;border-bottom:1px solid #e5e5ea;font-size:.95em}
.cmc-sheet-row span{color:#3a3a3c}
.cmc-sheet-row b{font-size:1.25em;font-weight:600;letter-spacing:-.01em}
.cmc-confirm{position:relative;height:5.4em;margin-top:.6em;color:#0a84ff}
.cmc-fid,.cmc-sheet-ok{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.35em}
.cmc-fid small,.cmc-sheet-ok small{font-size:.82em;font-weight:500;color:#3a3a3c}
.cmc-sheet-ok{opacity:0}
.cmc-sheet-ok small{color:#0a84ff;font-weight:600}
.cmc-dbl{position:absolute;right:.35em;top:11.2em;padding:.35em .7em;border-radius:1em;background:rgba(28,28,30,.86);color:#fff;font-size:.72em;font-weight:600;opacity:0}

.ck{position:relative;height:100%;background:#fff;color:#1a1a2e;line-height:1.4;text-align:left}
.ck-head{display:flex;flex-direction:column;align-items:center;text-align:center;padding:3.6875em 1.25em 1.25em;background:#f8f9fa;border-bottom:1px solid #eef0f2}
.ck[data-desk] .ck-head{padding:1em 2em 1.25em;border-radius:1.25em 1.25em 0 0}
.ck-top{align-self:stretch;display:flex;justify-content:flex-end;align-items:center;height:2.75em;margin-right:-.5em;color:#4b5563}
.ck-x{display:grid;place-items:center;width:2.75em;height:2.75em}
.ck-mark{width:4.75em;margin-top:-.75em;border-radius:.75em;box-shadow:0 0 0 1px rgba(17,17,19,.06)}
.ck-title{margin-top:.48em;font-size:1.3125em;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.ck-sub{margin-top:.15em;font-size:.84375em;color:#6b7280}
.ck-body{position:relative;padding:1.25em 1.25em 0}
.ck[data-desk] .ck-body{padding:1.25em 2em 1.5em}
.ck-form{display:flex;flex-direction:column;gap:1.25em}
.ck-sec{display:flex;flex-direction:column;gap:.625em}
.ck-h3{font-size:.90625em;font-weight:600}
.ck-field{display:grid;align-items:center;height:3em;padding:0 .875em;border:1px solid #e1e3e7;border-radius:.75em}
.ck-ph,.ck-val{grid-area:1/1;white-space:nowrap}
.ck-ph{color:#9ca3af;opacity:0}
.ck-opt{display:flex;align-items:center;gap:.625em;padding:.2em 0;font-size:.84375em;color:#4b5563}
.ck-box{display:grid;place-items:center;width:1.15em;height:1.15em;border-radius:.25em;background:#1a1a2e;color:#fff}
.ck-sum{display:flex;align-items:center;gap:.5em;min-height:3.43em;padding:0 1.14em;border:1px solid #e5e7eb;border-radius:.857em;font-size:.875em}
.ck-sum-t{flex:1;min-width:0;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ck-sum b{font-weight:600}
.ck-code{display:flex;align-items:center;gap:.25em;margin-top:-.2em;font-size:.8125em;font-weight:500;color:#6b7280}
.ck-methods{display:grid;grid-template-columns:1fr 1fr;gap:.625em}
.ck-m{display:flex;align-items:center;justify-content:center;gap:.4em;height:3.2em;border:1px solid #e1e3e7;border-radius:.8em;font-size:.9375em;font-weight:500}
.ck-m[data-on]{border-color:#1a1a2e;box-shadow:0 0 0 1px #1a1a2e}
.ck-pay{position:relative;display:flex;align-items:center;justify-content:center;height:3.25em;margin-top:.375em;border-radius:.75em;background:#1a1a2e;color:#fff;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 2px rgba(16,24,40,.2)}
.ck-terms{margin-top:-.4em;text-align:center;font-size:.71875em;line-height:1.6;color:#8b919a}
.ck-terms u{text-decoration-color:#d1d5db;text-underline-offset:2px}
.ck-done{position:absolute;left:1.25em;right:1.25em;top:1.25em;padding:1.5em 1.25em;border:1px solid #e5e7eb;border-radius:1em;background:#fff;text-align:center;opacity:0}
.ck[data-only="done"] .ck-done{position:relative;left:auto;right:auto;top:auto;opacity:1}
.ck-check{display:grid;place-items:center;width:2.5em;height:2.5em;margin:0 auto;border-radius:50%;background:#ecfdf3;color:#15803d}
.ck-done-t{margin-top:.67em;font-size:1.125em;font-weight:600}
.ck-done-s{margin-top:.29em;font-size:.875em;color:#6b7280}
.ck-open{display:flex;align-items:center;justify-content:center;height:2.75em;margin-top:1em;border-radius:.75em;background:#1a1a2e;color:#fff;font-size:.875em;font-weight:600}
.ck[data-desk] .ck-open{width:max-content;margin-inline:auto;padding:0 1.15em}
`

/* The tab cards and their mocks. Each mock is drawn in em of a 48 x 42 box (30 x 34 on a narrow screen), so it scales as one picture. */
const TABS_CSS = `
.cmc[data-story-section] > .cmc-cards.cmc-cards{position:relative;z-index:4;max-width:1320px;margin:0 auto;padding:clamp(28px,4vw,56px) var(--landing-gutter,clamp(20px,5vw,72px)) clamp(64px,8vw,120px)}
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
.cmc-panel{grid-area:1/1;display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(24px,3.5vw,56px);align-items:center;padding:clamp(28px,3.6vw,52px);border-radius:31px;background:#111113;border:1px solid rgba(255,255,255,.08);opacity:0;visibility:hidden;transition:opacity .35s ease,visibility 0s linear .35s}
.cmc-panel[data-on]{opacity:1;visibility:visible;transition:opacity .45s ease .05s,visibility 0s}
.cmc-panel-stat{display:block;margin-bottom:14px;font-size:14px;font-weight:500;color:#8b8b94}
.cmc-panel h3{margin:0;font-size:clamp(26px,3vw,42px);font-weight:400;line-height:1.1;letter-spacing:-.035em;color:#fff;text-wrap:balance}
.cmc-panel p{margin:16px 0 0;max-width:44ch;font-size:clamp(15.5px,1.25vw,18px);line-height:1.6;color:#a1a1aa}
/* A demo is a picture: it takes no pointer and nothing in it can be selected. */
.cmc-vis{position:relative;aspect-ratio:48/42;overflow:hidden;container-type:inline-size;pointer-events:none;user-select:none;-webkit-user-select:none}
.cmc-vis-in{position:absolute;inset:0;font-size:calc(100cqw / 48);color:#fff;line-height:1.35}
/* Wave 13 perf: a panel's mock is drawn only while its panel shows (and through its fade out): the four hidden mocks cost the page their style, layout and 80 font sizes the moment the section was laid out, 300ms at 4x CPU. The box keeps its size (aspect-ratio), so nothing moves. */
.cmc-panel:not([data-on]) .cmc-vis-in{content-visibility:hidden;transition:content-visibility 0s linear .35s allow-discrete}

/* Desktop browser */
.cmv-brw{position:absolute;container-type:inline-size}
.cmv-br{position:relative;font-size:calc(100cqw * 16 / 1200);aspect-ratio:1200/844;border-radius:.75em;overflow:hidden;background:#fff;color:#1a1a2e;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 2.5em 5em rgba(0,0,0,.55)}
.cmv-bar{position:relative;display:flex;align-items:center;justify-content:center;height:2.75em;background:#ececef;border-bottom:1px solid #dcdce0}
.cmv-lights{position:absolute;left:1em;top:50%;display:flex;gap:.5em;transform:translateY(-50%)}
.cmv-lights i{display:block;width:.75em;height:.75em;border-radius:50%;background:#ff5f57}
.cmv-lights i+i{background:#febc2e}
.cmv-lights i+i+i{background:#28c840}
.cmv-url{display:flex;align-items:center;justify-content:center;gap:.45em;width:28em;height:1.85em;border-radius:.55em;background:#fff;font-size:.82em;color:#4b5563}
.cmv-page{position:relative;height:calc(100% - 2.75em)}
.cmv-nav{display:flex;align-items:center;gap:.75em;height:4.25em;padding:0 3em;border-bottom:1px solid #f0f0f2}
.cmv-nav img{width:2.25em;height:2.25em;border-radius:50%;object-fit:cover}
.cmv-nav b{font-size:1.05em;font-weight:600}
.cmv-links{display:flex;gap:2em;margin-left:auto;font-size:.95em;color:#4b5563}
.cmv-prod{display:grid;grid-template-columns:30em 1fr;gap:3.5em;padding:3em 4.5em}
.cmv-prod-img{display:grid;place-items:center;width:30em;height:30em;border-radius:1em;background:#f1f1f3}
.cmv-prod-cover{width:19em;border-radius:.3em;box-shadow:0 .1em .2em rgba(24,24,27,.12),0 1.4em 2.6em -1.2em rgba(24,24,27,.45)}
.cmv-prod-t{display:flex;flex-direction:column;align-items:flex-start;padding-top:1.5em}
.cmv-prod-t small{font-size:.9em;color:#6b7280}
.cmv-prod-t b{margin-top:.3em;font-size:2.4em;font-weight:600;letter-spacing:-.025em;line-height:1.15}
.cmv-prod-p{margin-top:.5em;font-size:1.4em;font-weight:500}
.cmv-prod-t p{margin:1.1em 0 0;max-width:26em;font-size:1em;line-height:1.6;color:#4b5563}
.cmv-buy{position:relative;display:flex;align-items:center;justify-content:center;width:22em;height:3.25em;margin-top:2em;border-radius:.75em;background:#1a1a2e;color:#fff;font-size:1em;font-weight:600}
.cmv-prod-t .cmv-prod-n{margin-top:1em;font-size:.85em}
.cmv-dim{position:absolute;inset:0;background:rgba(11,11,18,.55)}
.cmv-dlg{position:absolute;left:50%;top:50%;width:32.5em;margin-left:-16.25em;border-radius:1.25em;background:#fff;box-shadow:0 1.5em 4em rgba(16,16,24,.35);transform:translateY(-50%)}
.cmv-dlg .ck{height:auto;border-radius:1.25em}
.cmv-cursor{position:absolute;left:58%;top:56%;z-index:2;line-height:0;opacity:0;pointer-events:none}
.cmv-br .cmv-cursor{font-size:1.5em}
.cmv-br-convert{left:.75em;right:.75em;top:4.6em}
.cmv-br-convert .cmv-br{box-shadow:0 0 0 1px rgba(255,255,255,.14)}
.cmv-phone{position:absolute;left:50%;top:1em;margin-left:-9.65em;--pw:19.3em}
.cmv-phone .cmc-phone{box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}

/* The dark cards the other three demos are drawn on. */
.cmv-cc,.cmv-mail,.cmv-rcpt{border-radius:1.4em;background:#1a1a1e;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);color:#f4f4f5}
.cmv-flag{display:block;flex:none;width:1.5em;height:1em;border-radius:.2em;object-fit:cover}
.cmv-thumb{flex:none}

/* Currencies: one price, five readings */
.cmv-cur{position:absolute;inset:0;display:grid;place-items:center}
.cmv-cc{width:30em;font-size:1.3em;padding:1.8em 1.8em 1.6em;box-sizing:border-box}
.cmv-cc-top{display:flex;align-items:center;gap:1em}
.cmv-cc-cover{width:3.6em;flex:none;border-radius:.5em}
.cmv-cc-top b{display:block;font-size:1.15em;font-weight:600;letter-spacing:-.01em}
.cmv-cc-top small{display:block;font-size:.9em;color:#a1a1aa}
.cmv-stack{position:relative;display:grid}
.cmv-cyc{grid-area:1/1;opacity:0}
.cmv-cyc[data-first]{opacity:1}
.cmv-price{margin-top:.45em;font-size:4em;font-weight:300;letter-spacing:-.045em;line-height:1.15;font-variant-numeric:tabular-nums}
.cmv-where{font-size:.95em;color:#a1a1aa}
.cmv-chips{position:relative;display:grid;grid-template-columns:repeat(5,1fr);margin-top:1.5em;padding:.3em;border-radius:1.2em;background:#111113;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.cmv-chip{position:relative;display:flex;align-items:center;justify-content:center;gap:.45em;height:2.6em;font-size:.88em;font-weight:600;letter-spacing:.02em;color:#e4e4e7}
.cmv-hl{position:absolute;left:.3em;top:.3em;bottom:.3em;width:calc((100% - .6em) / 5);border-radius:.9em;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}

/* The reminder: three moments and the email */
.cmv-rec{position:absolute;inset:0;font-size:1.15em}
.cmv-tl{position:absolute;left:3.6em;right:2.4em;top:2.6em;display:grid;grid-template-columns:repeat(3,1fr)}
.cmv-st{position:relative;display:grid;gap:.1em;padding-top:1.5em;font-size:.85em}
.cmv-st i{position:absolute;left:0;top:0;width:.7em;height:.7em;border-radius:50%;background:#e4e4e7}
.cmv-st3 i{background:#4ade80}
.cmv-st::after{content:"";position:absolute;left:1.3em;right:.6em;top:.32em;height:1px;background:rgba(255,255,255,.16)}
.cmv-st3::after{display:none}
.cmv-st b{font-weight:500;color:#f4f4f5;white-space:nowrap}
.cmv-st small{font-size:.9em;color:#8b8b94}
.cmv-mail{position:absolute;left:3.6em;right:3.6em;top:8.6em;padding:1.5em 1.7em 1.5em}
.cmv-mail-from{display:flex;align-items:center;gap:.7em}
.cmv-mail-from img{width:2.3em;height:2.3em;border-radius:50%;object-fit:cover}
.cmv-mail-from b{display:block;font-size:.95em;font-weight:600}
.cmv-mail-from small{display:block;font-size:.8em;color:#8b8b94}
.cmv-mail-subj{margin-top:.9em;padding-bottom:.9em;border-bottom:1px solid rgba(255,255,255,.08);font-size:.9em;font-weight:500;color:#d4d4d8}
.cmv-mail-h{margin-top:.75em;font-size:1.6em;font-weight:500;letter-spacing:-.025em}
.cmv-mail p{margin:.45em 0 0;font-size:.9em;line-height:1.55;color:#a1a1aa}
.cmv-mail-btn{display:flex;align-items:center;justify-content:center;width:10.5em;height:2.6em;margin-top:1.1em;border-radius:1.3em;background:#fff;color:#18181b;font-size:.9em;font-weight:600}
.cmv-mail-line{display:flex;align-items:center;gap:.7em;margin-top:1.2em;padding-top:1em;border-top:1px solid rgba(255,255,255,.08);font-size:.9em;color:#d4d4d8}
.cmv-mail-line .cmv-thumb{width:2.4em;border-radius:.4em}
.cmv-mail-line>span:not(.ebc){flex:1}
.cmv-mail-line b{font-weight:600;color:#fff}

/* Paid: the buyer's receipt and the seller's note */
.cmv-paid{position:absolute;inset:0;font-size:1.2em}
.cmv-rcpt{position:absolute;left:7em;right:7em;top:10em;display:flex;flex-direction:column;align-items:center;padding:1.7em 1.7em 1.6em;text-align:center}
.cmv-rcpt-check{display:grid;place-items:center;width:2.9em;height:2.9em;border-radius:50%;background:rgba(74,222,128,.14);color:#4ade80}
.cmv-rcpt-t{margin-top:.6em;font-size:1.3em;font-weight:500;letter-spacing:-.015em}
.cmv-rcpt-s{margin-top:.3em;font-size:.85em;color:#a1a1aa}
.cmv-rcpt-rows{align-self:stretch;margin-top:1.1em;border-radius:.9em;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);text-align:left}
.cmv-rcpt-rows div{display:flex;align-items:center;gap:.6em;height:3em;padding:0 .9em;font-size:.88em}
.cmv-rcpt-rows div+div{border-top:1px solid rgba(255,255,255,.08)}
.cmv-rcpt-rows .cmv-thumb{width:1.9em;border-radius:.35em}
.cmv-rcpt-rows div>span:not(.ebc){flex:1;color:#a1a1aa}
.cmv-rcpt-rows b{font-weight:600}
.cmv-rcpt-ap{display:inline-flex;align-items:center;gap:.1em}
.cmv-rcpt-btn{display:flex;align-items:center;justify-content:center;height:2.6em;padding:0 1.3em;margin-top:1.1em;border-radius:1.3em;background:#fff;color:#18181b;font-size:.88em;font-weight:600}
.cmv-sale{position:absolute;left:50%;top:3em;width:26em;margin-left:-13em;display:flex;gap:.75em;align-items:flex-start;padding:.85em 1em;border-radius:1.25em;background:#26262b;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),0 1em 2.5em rgba(0,0,0,.5);color:#f4f4f5;box-sizing:border-box}
.cmv-sale img{flex:none;width:2.4em;height:2.4em;border-radius:.6em}
.cmv-note-t{flex:1;min-width:0;display:flex;flex-direction:column;font-size:.86em;line-height:1.3}
.cmv-note-top{display:flex;justify-content:space-between}
.cmv-note-top b{font-weight:600}
.cmv-note-top small{color:#8b8b94}
.cmv-note-s{font-weight:500}
.cmv-note-p{color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/*
 * THE DEMOS LOOP. Each tab's demo is one ${LOOP_S}s cycle of transform and opacity
 * keyframes that ends where it began and starts over, for as long as its
 * panel is the open one and the cards are on screen in a visible tab
 * (data-commerce-live). Off screen the rules below do not match, so nothing
 * runs, and each mock rests on its finished frame; a tab opened again
 * starts from the top.
 */
@media (prefers-reduced-motion:no-preference){
  [data-commerce-live] .cmc-panel[data-on] :is(.cmv-cursor,.cmv-buy,.cmv-dim,.cmv-dlg,.ck-ph,.ck-val,.ck-pay,.ck-check,.ck-form,.ck-done,.cmc-scrim,.cmc-sheet-in,.cmc-dbl,.cmc-fid,.cmc-sheet-ok,.cmv-cyc,.cmv-hl,.cmv-st,.cmv-mail,.cmv-mail-btn,.cmv-rcpt,.cmv-rcpt-check,.cmv-rcpt-rows,.cmv-sale){animation-duration:${LOOP_S}s;animation-iteration-count:infinite;animation-fill-mode:both}

  [data-commerce-live] .cmc-panel[data-on] .cmv-cur1{animation-name:cmv-cur1}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .cmv-buy{animation-name:cmv-buy}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .cmv-dim{animation-name:cmv-dim}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .cmv-dlg-form{animation-name:cmv-dlg-form}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .ck-ph{animation-name:cmv-ph}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .ck-v1{animation-name:cmv-v1}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .ck-v2{animation-name:cmv-v2}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .cmv-cur2{animation-name:cmv-cur2}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .ck-pay{animation-name:cmv-pay}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .cmv-dlg-done{animation-name:cmv-dlg-done}
  [data-commerce-live] .cmc-panel[data-on] .cmv-br-convert .ck-check{animation-name:cmv-check}

  [data-commerce-live] .cmc-panel[data-on] .cmv-phone .ck-pay{animation-name:cmv-ppay}
  [data-commerce-live] .cmc-panel[data-on] .cmv-phone .cmc-scrim{animation-name:cmv-scrim}
  [data-commerce-live] .cmc-panel[data-on] .cmv-phone .cmc-sheet-in{animation-name:cmv-sheet}
  [data-commerce-live] .cmc-panel[data-on] .cmv-phone .cmc-dbl{animation-name:cmv-dbl}
  [data-commerce-live] .cmc-panel[data-on] .cmv-phone .cmc-fid{animation-name:cmv-fid}
  [data-commerce-live] .cmc-panel[data-on] .cmv-phone .cmc-sheet-ok{animation-name:cmv-sok}
  [data-commerce-live] .cmc-panel[data-on] .cmv-phone .ck-form{animation-name:cmv-pform}
  [data-commerce-live] .cmc-panel[data-on] .cmv-phone .ck-done{animation-name:cmv-pdone}

  [data-commerce-live] .cmc-panel[data-on] .cmv-cyc{animation-name:cmv-cyc;animation-delay:calc(var(--i) * ${LOOP_S / 5}s)}
  [data-commerce-live] .cmc-panel[data-on] .cmv-hl{animation-name:cmv-hl}

  [data-commerce-live] .cmc-panel[data-on] .cmv-st1{animation-name:cmv-st1}
  [data-commerce-live] .cmc-panel[data-on] .cmv-st2{animation-name:cmv-st2}
  [data-commerce-live] .cmc-panel[data-on] .cmv-st3{animation-name:cmv-st3}
  [data-commerce-live] .cmc-panel[data-on] .cmv-mail{animation-name:cmv-mail}
  [data-commerce-live] .cmc-panel[data-on] .cmv-mail-btn{animation-name:cmv-mbtn}

  [data-commerce-live] .cmc-panel[data-on] .cmv-rcpt{animation-name:cmv-rcpt}
  [data-commerce-live] .cmc-panel[data-on] .cmv-rcpt-check{animation-name:cmv-rcheck}
  [data-commerce-live] .cmc-panel[data-on] .cmv-rcpt-rows{animation-name:cmv-rrows}
  [data-commerce-live] .cmc-panel[data-on] .cmv-sale{animation-name:cmv-sale}
}
/* Built to convert: the pointer, Buy now, the window, the two fields, Pay, Payment complete, and back to the page. */
@keyframes cmv-cur1{0%,${at(0.25)}{opacity:0;transform:translate3d(6em,4em,0)}${at(0.5)}{opacity:1}${at(1.15)}{opacity:1;transform:translate3d(0,0,0) scale(1)}${at(1.3)}{opacity:1;transform:translate3d(0,0,0) scale(.85)}${at(1.45)}{opacity:1;transform:translate3d(0,0,0) scale(1)}${at(1.8)},100%{opacity:0;transform:translate3d(0,0,0) scale(1)}}
@keyframes cmv-buy{0%,${at(1.15)}{transform:scale(1)}${at(1.3)}{transform:scale(.96)}${at(1.45)},100%{transform:scale(1)}}
@keyframes cmv-dim{0%,${at(1.4)}{opacity:0}${at(1.7)},${at(8.1)}{opacity:1}${at(8.5)},100%{opacity:0}}
@keyframes cmv-dlg-form{0%,${at(1.45)}{opacity:0;transform:translateY(calc(-50% + .5em))}${at(1.8)},${at(3.9)}{opacity:1;transform:translateY(-50%)}${at(4.2)},100%{opacity:0;transform:translateY(-50%)}}
@keyframes cmv-ph{0%,${at(2)}{opacity:1}${at(2.15)},100%{opacity:0}}
@keyframes cmv-v1{0%,${at(2.05)}{opacity:0}${at(2.35)},100%{opacity:1}}
@keyframes cmv-v2{0%,${at(2.45)}{opacity:0}${at(2.75)},100%{opacity:1}}
@keyframes cmv-cur2{0%,${at(2.75)}{opacity:0;transform:translate3d(5em,3.5em,0)}${at(3)}{opacity:1}${at(3.5)}{opacity:1;transform:translate3d(0,0,0) scale(1)}${at(3.62)}{opacity:1;transform:translate3d(0,0,0) scale(.85)}${at(3.75)}{opacity:1;transform:translate3d(0,0,0) scale(1)}${at(4.2)},100%{opacity:0;transform:translate3d(0,0,0) scale(1)}}
@keyframes cmv-pay{0%,${at(3.5)}{transform:scale(1)}${at(3.65)}{transform:scale(.96)}${at(3.8)},100%{transform:scale(1)}}
@keyframes cmv-dlg-done{0%,${at(3.95)}{opacity:0;transform:translateY(calc(-50% + .5em))}${at(4.35)},${at(8.1)}{opacity:1;transform:translateY(-50%)}${at(8.5)},100%{opacity:0;transform:translateY(-50%)}}
@keyframes cmv-check{0%,${at(4.3)}{opacity:0;transform:scale(.5)}${at(4.75)},100%{opacity:1;transform:scale(1)}}
/* One-tap payments: Pay, the wallet's sheet, a glance, Done, Payment complete, and back to the checkout. */
@keyframes cmv-ppay{0%,${at(0.5)}{transform:scale(1)}${at(0.65)}{transform:scale(.96)}${at(0.8)},100%{transform:scale(1)}}
@keyframes cmv-scrim{0%,${at(0.8)}{opacity:0}${at(1.2)},${at(3.9)}{opacity:1}${at(4.4)},100%{opacity:0}}
@keyframes cmv-sheet{0%,${at(0.8)}{transform:translate3d(0,108%,0)}${at(1.45)},${at(3.9)}{transform:translate3d(0,0,0)}${at(4.5)},100%{transform:translate3d(0,108%,0)}}
@keyframes cmv-dbl{0%,${at(1.3)}{opacity:0;transform:translate3d(.6em,0,0)}${at(1.6)},${at(2.6)}{opacity:1;transform:translate3d(0,0,0)}${at(2.9)},100%{opacity:0;transform:translate3d(0,0,0)}}
@keyframes cmv-fid{0%,${at(2)}{opacity:1}${at(2.3)}{opacity:.45}${at(2.6)}{opacity:1}${at(2.9)}{opacity:1}${at(3.1)},${at(4.6)}{opacity:0}${at(4.7)},100%{opacity:1}}
@keyframes cmv-sok{0%,${at(3.05)}{opacity:0;transform:scale(.5)}${at(3.45)},${at(4.6)}{opacity:1;transform:scale(1)}${at(4.7)},100%{opacity:0;transform:scale(.5)}}
@keyframes cmv-pform{0%,${at(4.1)}{opacity:1}${at(4.4)},${at(8.2)}{opacity:0}${at(8.6)},100%{opacity:1}}
@keyframes cmv-pdone{0%,${at(4.3)}{opacity:0;transform:translate3d(0,.8em,0) scale(.98)}${at(4.75)},${at(8.1)}{opacity:1;transform:translate3d(0,0,0) scale(1)}${at(8.4)},100%{opacity:0;transform:translate3d(0,0,0) scale(1)}}
/* Local currencies: each reading in turn, the marker stepping along under it. */
@keyframes cmv-cyc{0%{opacity:0;transform:translate3d(0,.25em,0)}4%,17%{opacity:1;transform:translate3d(0,0,0)}21%,100%{opacity:0;transform:translate3d(0,-.25em,0)}}
@keyframes cmv-hl{0%,17%{transform:translate3d(0,0,0)}21%,37%{transform:translate3d(100%,0,0)}41%,57%{transform:translate3d(200%,0,0)}61%,77%{transform:translate3d(300%,0,0)}81%,96%{transform:translate3d(400%,0,0)}100%{transform:translate3d(0,0,0)}}
/* Checkout reminders: left, reminded (the email arrives), Finish checkout, paid. */
@keyframes cmv-st1{0%,${at(0.3)}{opacity:.3}${at(0.7)},${at(8.2)}{opacity:1}${at(8.6)},100%{opacity:.3}}
@keyframes cmv-st2{0%,${at(1.5)}{opacity:.3}${at(1.9)},${at(8.2)}{opacity:1}${at(8.6)},100%{opacity:.3}}
@keyframes cmv-st3{0%,${at(4.9)}{opacity:.3}${at(5.3)},${at(8.2)}{opacity:1}${at(8.6)},100%{opacity:.3}}
@keyframes cmv-mail{0%,${at(1.6)}{opacity:0;transform:translate3d(0,1.2em,0)}${at(2.3)},${at(8.2)}{opacity:1;transform:translate3d(0,0,0)}${at(8.6)},100%{opacity:0;transform:translate3d(0,0,0)}}
@keyframes cmv-mbtn{0%,${at(4.4)}{transform:scale(1)}${at(4.55)}{transform:scale(.95)}${at(4.7)},100%{transform:scale(1)}}
/* Order paid: the receipt, its tick, its lines, then the seller's note. */
@keyframes cmv-rcpt{0%,${at(0.2)}{opacity:0;transform:translate3d(0,1.2em,0)}${at(0.85)},${at(8.2)}{opacity:1;transform:translate3d(0,0,0)}${at(8.6)},100%{opacity:0;transform:translate3d(0,0,0)}}
@keyframes cmv-rcheck{0%,${at(0.7)}{opacity:0;transform:scale(.5)}${at(1.15)},100%{opacity:1;transform:scale(1)}}
@keyframes cmv-rrows{0%,${at(1)}{opacity:0}${at(1.4)},100%{opacity:1}}
@keyframes cmv-sale{0%,${at(2)}{opacity:0;transform:translate3d(0,-1.2em,0)}${at(2.6)},${at(8.2)}{opacity:1;transform:translate3d(0,0,0)}${at(8.6)},100%{opacity:0;transform:translate3d(0,0,0)}}

/* The mocks' resting states, where no loop runs: the window paid, the phone paid. */
.cmv-dlg-form{opacity:0}
.cmv-phone .ck-done{opacity:1}
.cmv-phone .ck-form{opacity:0}

@media (max-width:899px){
  .cmc-tabs{margin-inline:calc(var(--landing-gutter,20px) * -1 + 12px)}
  .cmc-tab{height:38px;padding:0 15px;font-size:13.5px}
  .cmc-panel{grid-template-columns:1fr;align-content:start;gap:20px;border-radius:23px;padding:24px 24px 20px}
  .cmc-panel-stat{margin-bottom:10px}
  /* On a narrow screen each demo is drawn for a taller box and a larger em, so its words stay readable. */
  .cmc-vis{aspect-ratio:30/34;margin:0 -10px;border-radius:15px}
  .cmc-vis-in{font-size:calc(100cqw / 30)}
  .cmv-br-convert{left:-12em;right:auto;width:54em;top:-3em}
  .cmv-phone{top:1.4em;margin-left:-7.5em;--pw:15em}
  .cmv-br-convert .cmv-br{box-shadow:none}
  .cmv-cc{width:28em;font-size:1em}
  .cmv-rec,.cmv-paid{font-size:1em}
  .cmv-chip{flex-direction:column;gap:.35em;height:4em}
  .cmv-tl{left:1.6em;right:.4em;top:1.2em}
  .cmv-mail{left:1em;right:1em;top:7.4em}
  .cmv-rcpt{left:2.5em;right:2.5em;top:9em}
  .cmv-sale{top:1.4em;width:26em;margin-left:-13em}
}
`

/* Still: the finished scene, nothing pinned or moving. */
const STILL_CSS = `
@media (prefers-reduced-motion:reduce){
  .cmc[data-story-section] > .cmc-track.cmc-track{height:auto}
  .cmc-band{display:none}
  .cmc-stage{position:relative;height:max(100svh,calc(var(--pw) * 2.07 + 200px))}
  .cmc-stage *{transition:none!important;animation:none!important}
  .cmc-step{opacity:.7}
  .cmc-panel,.cmc-tab,.cmc-tab::before{transition:none!important}
}
`

const CHECKOUT_CSS = SCENE_CSS + PHONE_CSS + TABS_CSS + STILL_CSS

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CHECKOUT_STYLES: readonly SectionStyle[] = [
  COMMERCE_KIT_STYLE,
  { href: "w13-ebook-cover", precedence: "default", css: EBOOK_COVER_CSS },
  { href: "w12-commerce-checkout", precedence: "default", css: CHECKOUT_CSS },
]
