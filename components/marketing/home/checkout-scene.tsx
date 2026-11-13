"use client"

/**
 * ===========================================================================
 *  HIGH-CONVERTING CHECKOUT: THE SCROLL SCENE (home, section 9, wave 13)
 * ===========================================================================
 * Black. A modern iPhone with Storelib's own instant checkout on it (the
 * window components/checkout/instant-checkout.tsx draws: the grey head with
 * the product and the seller, Your details, the line and its price, Payment
 * method with the wallet and Card, "Pay $19.00 with Apple Pay") is already
 * on screen, a little bigger, when the section arrives. Six things creators
 * sell (a cap, a record, a preset pack, a tee, a course, a membership card)
 * orbit slowly around it. As the page scrolls the phone settles into its
 * place beside the headline, Pay is pressed, the Apple Pay sheet comes up,
 * Face ID confirms, and the window turns to "Payment complete". Under the
 * scene, five tabs, each a true thing checkout does, each with its own
 * small mock: the same checkout in a desktop browser, both wallets, five
 * currencies with their flags, the reminder email, the paid confirmation.
 *
 * MOTION, CHEAPLY.
 *   scroll   CSS scroll-driven animations on one named view timeline (the
 *            track), transform and opacity only, run by the compositor.
 *            Where animation-timeline is not supported, one rAF per scroll
 *            frame (only while the track is on screen) writes a single
 *            custom property, --cmc-p, and the same transforms read it.
 *   orbit    every product rides one ellipse around the phone: two nested
 *            sine loops (x, then y a quarter turn later) make a constant,
 *            seamless circle with no stop and no jump; the y loop carries
 *            the depth (smaller, dimmer and softer at the back, a cross fade
 *            to a pre-blurred webp, never a live filter); a third loop
 *            turns the product in 3D. All time based, paused off screen
 *            and in a background tab (data-commerce-live on the track).
 *   sizes    the phone is sized from the viewport alone (no measuring), so
 *            nothing in the scene moves once it is drawn.
 *   reduced  prefers-reduced-motion: no pinning, loops held still, the
 *            finished layout drawn: phone in place, headline in.
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

const IMG = "/home/commerce"

/**
 * The orbiting products: their size, their place on the ring (phase 0 to 1,
 * and a second set for phones, which show four), how far out they ride (k),
 * a small lift off the ring, how long one 3D turn takes, and the object's size
 * inside the blurred file (for lining the two files up).
 */
const FLOATS = [
  { id: "cap", obj: [220, 109], w: "clamp(120px,13vw,210px)", wm: "36vw", ph: 0, phm: 0, k: 1, oy: "-2svh", r: -10, m: true },
  { id: "vinyl", obj: [220, 159], w: "clamp(130px,14vw,230px)", wm: "38vw", ph: 1 / 6, phm: 0.25, k: 0.94, oy: "1svh", r: 8, m: true },
  { id: "box", obj: [201, 220], w: "clamp(96px,10vw,165px)", wm: "28vw", ph: 2 / 6, phm: 0.5, k: 1.04, oy: "0svh", r: -6, m: true },
  { id: "tee", obj: [151, 220], w: "clamp(100px,10.5vw,170px)", wm: "30vw", ph: 3 / 6, phm: 0.75, k: 0.98, oy: "2svh", r: 7, m: true },
  { id: "course", obj: [220, 193], w: "clamp(120px,12vw,200px)", wm: "0px", ph: 4 / 6, phm: 0, k: 1.02, oy: "-1svh", r: -5, m: false },
  { id: "member", obj: [220, 143], w: "clamp(120px,12.5vw,205px)", wm: "0px", ph: 5 / 6, phm: 0, k: 0.96, oy: "1svh", r: 9, m: false },
] as const
const BLUR_PAD = 24

const TABS = [
  {
    id: "convert",
    label: "Built to convert",
    stat: "1 screen",
    title: "One screen, then paid",
    body: "No account to make and no cart to visit. Email, name, pay, in a window that opens over your page on a phone or a computer, so fans never lose sight of what they came for.",
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
    title: "Prices fans read without a calculator",
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
const AUTO_MS = 7000

export function CheckoutScene() {
  const [trackRef] = useCommerceLive<HTMLDivElement>("120px 0px", false)
  const rootRef = useRef<HTMLElement>(null)
  const reduced = useCommerceReducedMotion()

  /* The fallback for browsers without scroll-driven animations. */
  useEffect(() => {
    const track = trackRef.current
    const root = rootRef.current
    if (!track || !root) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: view()")) return
    root.setAttribute("data-cmc-js", "")
    let frame = 0
    let active = false
    let vh = innerHeight
    const paint = () => {
      frame = 0
      const r = track.getBoundingClientRect()
      const span = Math.max(1, r.height - vh)
      const p = Math.max(-1, Math.min(1.6, -r.top / span))
      track.style.setProperty("--cmc-p", p.toFixed(4))
    }
    const schedule = () => {
      if (active && !frame) frame = requestAnimationFrame(paint)
    }
    const resize = () => {
      vh = innerHeight
      schedule()
    }
    const io = new IntersectionObserver((e) => {
      active = e[e.length - 1].isIntersecting
      schedule()
    })
    io.observe(track)
    addEventListener("scroll", schedule, { passive: true })
    addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(frame)
      io.disconnect()
      removeEventListener("scroll", schedule)
      removeEventListener("resize", resize)
      root.removeAttribute("data-cmc-js")
    }
  }, [trackRef])

  return (
    <section ref={rootRef} className="cmc" data-story-section="checkout" aria-labelledby="cmc-title">
      <CommerceKitStyle />
      <style href="w12-commerce-checkout" precedence="default">
        {CHECKOUT_CSS}
      </style>
      <div ref={trackRef} className="cmc-track">
        <div className="cmc-stage">
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

          <div className="cmc-copy">
            <h2 id="cmc-title" className="cmc-title">
              Checkout that turns a tap into a sale
            </h2>
          </div>

          <div className="cmc-phone-wrap">
            <Phone label="A Storelib checkout on a phone (an iPhone): Golden Hour presets by Maya Ellis Studio, $19.00, paid with Apple Pay." />
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
                  <span>Pay Maya Ellis Studio</span>
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
        <img className="ck-mark" src={`${IMG}/golden-cover.webp`} alt="" loading="lazy" decoding="async" width={120} height={120} />
        <div className="ck-title">Golden Hour presets</div>
        <div className="ck-sub">Maya Ellis Studio</div>
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
            <span className="ck-sum-t">Golden Hour presets</span>
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

  return (
    <div ref={cardsRef} className="cmc-cards" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocusCapture={() => setHeld(true)} onBlurCapture={() => setHeld(false)}>
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
          <div key={t.id} id={`cmc-panel-${t.id}`} role="tabpanel" aria-labelledby={`cmc-tab-${t.id}`} className="cmc-panel" data-on={t.id === active || undefined} inert={t.id !== active}>
            <div className="cmc-panel-copy">
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
      <p className="cmc-foot">Card payments are processed by Stripe. Wallets show where the buyer&apos;s device and browser offer them. Prices in other currencies are examples.</p>
    </div>
  )
}

/** A desktop browser with Maya's product page and, over it, the same checkout window. */
function Browser({ wallet, cursor = false, className }: { wallet: "apple" | "google"; cursor?: boolean; className: string }) {
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
            <b>Maya Ellis Studio</b>
            <span className="cmv-links">
              <span>Shop</span>
              <span>Presets</span>
              <span>About</span>
            </span>
          </div>
          <div className="cmv-prod">
            <img className="cmv-prod-img" src={`${IMG}/golden-cover.webp`} alt="" loading="lazy" decoding="async" width={240} height={240} />
            <div className="cmv-prod-t">
              <small>Lightroom presets</small>
              <b>Golden Hour presets</b>
              <span className="cmv-prod-p">$19.00</span>
              <p>12 presets for warm, low sun light. Desktop and mobile, with a short guide to each one.</p>
              <span className="cmv-buy">
                Buy now
                {cursor ? <Cursor className="cmv-cur1" /> : null}
              </span>
              <small className="cmv-prod-n">Instant download · .xmp and .dng</small>
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

function VisTap() {
  return (
    <div className="cmv-tap">
      <Browser wallet="google" cursor className="cmv-br-tap" />
      <div className="cmv-mini">
        <Phone />
      </div>
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

function VisCurrency() {
  return (
    <div className="cmv-cur">
      <div className="cmv-pcard">
        <img className="cmv-pcard-img" src={`${IMG}/golden-cover.webp`} alt="" loading="lazy" decoding="async" width={240} height={240} />
        <div className="cmv-pcard-b">
          <b>Golden Hour presets</b>
          <small>Maya Ellis Studio</small>
          <div className="cmv-pcard-row">
            <span className="cmv-stack cmv-price">
              {PRICES.map((p, i) => (
                <span key={p.code} className="cmv-cyc" data-first={i === 0 || undefined} style={{ "--i": i } as React.CSSProperties}>
                  {p.price}
                </span>
              ))}
            </span>
            <span className="cmv-pill">
              <span className="cmv-stack cmv-pill-in">
                {PRICES.map((p, i) => (
                  <span key={p.code} className="cmv-cyc" data-first={i === 0 || undefined} style={{ "--i": i } as React.CSSProperties}>
                    <Flag code={p.flag} />
                    {p.code}
                  </span>
                ))}
              </span>
            </span>
          </div>
          <span className="cmv-pcard-buy">Buy now</span>
        </div>
      </div>
      <div className="cmv-list">
        <span className="cmv-hl" />
        {PRICES.map((p) => (
          <div key={p.code} className="cmv-row">
            <Flag code={p.flag} />
            <span className="cmv-row-t">
              <b>{p.code}</b>
              <small>{p.where}</small>
            </span>
            <span className="cmv-row-p">{p.price}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function VisRecover() {
  return (
    <div className="cmv-rec">
      <div className="cmv-mail">
        <div className="cmv-mail-from">
          <img src={`${IMG}/creator-maya.webp`} alt="" loading="lazy" decoding="async" width={64} height={64} />
          <span>
            <b>Maya Ellis Studio</b>
            <small>to Sam · 3:14 PM</small>
          </span>
        </div>
        <div className="cmv-mail-subj">You left Golden Hour presets at checkout</div>
        <div className="cmv-mail-h">Still thinking it over?</div>
        <p>Hi Sam, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off.</p>
        <span className="cmv-mail-btn">Finish checkout</span>
        <div className="cmv-mail-line">
          <img src={`${IMG}/golden-cover.webp`} alt="" loading="lazy" decoding="async" width={96} height={96} />
          <span>Golden Hour presets</span>
          <b>$19.00</b>
        </div>
      </div>
      <div className="cmv-note">
        <span className="cmv-note-icon">
          <svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round">
            <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
            <path d="m3.8 7 8.2 6 8.2-6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="cmv-note-t">
          <span className="cmv-note-top">
            <b>Maya Ellis Studio</b>
            <small>now</small>
          </span>
          <span className="cmv-note-s">You left Golden Hour presets at checkout</span>
          <span className="cmv-note-p">Hi Sam, you got as far as checkout and stopped there.</span>
        </span>
      </div>
      <div className="cmv-steps">
        <span className="cmv-st cmv-st1">
          <i />
          <small>2:14 PM</small>
          Left at Pay
        </span>
        <span className="cmv-st cmv-st2">
          <i />
          <small>3:14 PM</small>
          Reminder sent
        </span>
        <span className="cmv-st cmv-st3">
          <i />
          <small>3:31 PM</small>
          Paid $19.00
        </span>
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
            <img src={`${IMG}/golden-cover.webp`} alt="" loading="lazy" decoding="async" width={96} height={96} />
            <span>Golden Hour presets</span>
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
          <span className="cmv-note-s">You sold Golden Hour presets for $19.00</span>
          <span className="cmv-note-p">Sam bought Golden Hour presets.</span>
        </span>
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
 * pre-blurred file with the depth: compositor work only, little for the main
 * thread to update. Every value is transform or opacity.
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
    const at = `${f((i / LAP_POINTS) * 100)}%`
    lap += `${at}{transform:perspective(900px) translate3d(calc(var(--rk) * ${f(x)}),calc(var(--ry) * ${f(y)} + var(--oy)),0) scale(${f(0.6 + 0.46 * d)}) rotateX(${f(11 * Math.sin(turn + 1.3))}deg) rotateY(${f(24 * Math.sin(turn))}deg) rotateZ(calc(var(--r) * ${f(Math.cos(turn))}));opacity:${f(0.42 + 0.58 * d)}}`
    sharp += `${at}{opacity:${f(Math.min(1, d * 2))}}`
    soft += `${at}{opacity:${f(Math.min(1, Math.max(0, (0.62 - d) / 0.37)))}}`
  }
  return `@keyframes cmc-lap{${lap}}\n@keyframes cmc-focus-sharp{${sharp}}\n@keyframes cmc-focus-soft{${soft}}\n`
}

/* The scene: stage, orbit, headline, phone placement, scroll choreography. */
const SCENE_CSS = `
.cmc{position:relative;background:#000;color:#fff;border-radius:clamp(28px,4vw,56px);overflow:clip;padding-block:0!important;isolation:isolate}
.cmc[data-story-section] > .cmc-track.cmc-track{position:relative;max-width:none;margin:0;padding:0;height:calc(100svh + 170vh);view-timeline-name:--cmc;--cmc-p:1}
.cmc-stage{position:sticky;top:0;height:100svh;overflow:hidden;
  --hd:60px;--pw:min(84vw,360px,calc((100svh - 200px) / 2.07));
  --dx:0px;--sy:15svh;--s0:1.1;--ocx:0px;--ocy:7svh;
  --rx:50vw;--ry:38svh;--lap:64s}
.cmc-floats{position:absolute;inset:0;pointer-events:none}
.cmc-orbit{position:absolute;left:50%;top:calc(50% + var(--ocy));width:0;height:0}
.cmc-o{position:absolute;left:0;top:0;width:var(--w);transform:translate(-50%,-50%)}
.cmc-o{--rk:calc(var(--rx) * var(--k))}
.cmc-lap,.cmc-sharp,.cmc-soft{animation:cmc-lap var(--lap) linear infinite both;animation-delay:calc(var(--ph) * var(--lap) * -1);animation-play-state:paused}
.cmc-obj{position:relative}
.cmc-obj img{position:absolute;display:block;max-width:none}
.cmc-sharp{inset:0;width:100%;height:100%;animation-name:cmc-focus-sharp}
.cmc-soft{animation-name:cmc-focus-soft}
.cmc-track[data-commerce-live] .cmc-lap,.cmc-track[data-commerce-live] .cmc-sharp,.cmc-track[data-commerce-live] .cmc-soft{animation-play-state:running}
${orbitKeyframes()}

.cmc-copy{position:absolute;z-index:2;left:20px;right:20px;top:calc(var(--hd) + clamp(14px,3svh,32px));text-align:center}
.cmc-title{margin:0 auto;font-size:clamp(30px,8.6vw,46px);font-weight:300;line-height:1.04;letter-spacing:-.045em;text-wrap:balance;color:#fff}
.cmc-phone-wrap{position:absolute;z-index:3;left:calc(50% + var(--dx));top:calc(100% - 22px - var(--pw) * 1.035);transform:translate(-50%,-50%)}

@media (min-width:900px){
  .cmc-stage{--hd:68px;--pw:min(372px,calc((100svh - 150px) / 2.07));--dx:min(18vw,270px);--sy:13svh;--s0:1.12;--ocx:var(--dx);--ocy:calc(var(--hd) / 2);--rx:min(24vw,345px);--ry:31svh}
  .cmc-copy{left:max(var(--landing-gutter,48px),calc(50% - 620px));right:calc(50% - var(--dx) + var(--pw) / 2 + clamp(40px,5vw,88px));top:calc(50% + var(--hd) / 2);transform:translateY(-50%);text-align:left}
  .cmc-title{margin:0;font-size:clamp(42px,4.5vw,72px)}
  .cmc-phone-wrap{top:calc(50% + var(--hd) / 2)}
}
@media (max-width:899px){
  .cmc-o{width:var(--wm)}
  .cmc-o:not([data-m]){display:none}
  .cmc-lap,.cmc-sharp,.cmc-soft{animation-delay:calc(var(--phm) * var(--lap) * -1)}
}

/* Scroll-driven, where the browser runs it on the compositor. */
@media (prefers-reduced-motion:no-preference){
  @supports (animation-timeline:view()){
    .cmc-floats{animation:cmc-par linear both;animation-timeline:--cmc;animation-range:cover 0% cover 100%}
    .cmc-orbit{animation:cmc-orbit linear both,cmc-dim linear both;animation-timeline:--cmc,--cmc;animation-range:entry 55% contain 24%,contain 14% contain 30%}
    .cmc-phone{animation:cmc-phone linear both;animation-timeline:--cmc;animation-range:entry 55% contain 24%}
    .cmc-title{animation:cmc-copy linear both;animation-timeline:--cmc;animation-range:contain 2% contain 22%}
    .cmc-stage .ck-pay{animation:cmc-press linear both;animation-timeline:--cmc;animation-range:contain 28% contain 34%}
    .cmc-stage .cmc-scrim{animation:cmc-scrim linear both;animation-timeline:--cmc;animation-range:contain 32% contain 64%}
    .cmc-stage .cmc-sheet-in{animation:cmc-sheet-up linear both;animation-timeline:--cmc;animation-range:contain 32% contain 40%}
    .cmc-stage .cmc-sheet{animation:cmc-sheet-down linear both;animation-timeline:--cmc;animation-range:contain 56% contain 63%}
    .cmc-stage .cmc-dbl{animation:cmc-dbl linear both;animation-timeline:--cmc;animation-range:contain 38% contain 50%}
    .cmc-stage .cmc-fid{animation:cmc-fade-out linear both;animation-timeline:--cmc;animation-range:contain 46% contain 49%}
    .cmc-stage .cmc-sheet-ok{animation:cmc-pop linear both;animation-timeline:--cmc;animation-range:contain 48% contain 52%}
    .cmc-stage .ck-form{animation:cmc-fade-out linear both;animation-timeline:--cmc;animation-range:contain 58% contain 63%}
    .cmc-stage .ck-done{animation:cmc-done linear both;animation-timeline:--cmc;animation-range:contain 61% contain 70%}
  }
}
@keyframes cmc-par{from{transform:translate3d(0,5vh,0)}to{transform:translate3d(0,-9vh,0)}}
@keyframes cmc-orbit{from{transform:translate3d(0,calc(var(--sy) * .4),0)}to{transform:translate3d(var(--ocx),0,0)}}
@keyframes cmc-dim{from{opacity:1}to{opacity:.78}}
@keyframes cmc-phone{from{transform:translate3d(calc(var(--dx) * -1),var(--sy),0) scale(var(--s0))}to{transform:translate3d(0,0,0) scale(1)}}
@keyframes cmc-copy{from{opacity:0;transform:translate3d(0,28px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmc-fade-out{from{opacity:1}to{opacity:0}}
@keyframes cmc-press{0%,100%{transform:scale(1)}50%{transform:scale(.96)}}
@keyframes cmc-scrim{0%{opacity:0}20%,80%{opacity:1}100%{opacity:0}}
@keyframes cmc-sheet-up{from{transform:translate3d(0,108%,0)}to{transform:translate3d(0,0,0)}}
@keyframes cmc-sheet-down{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,108%,0)}}
@keyframes cmc-dbl{0%{opacity:0;transform:translate3d(.6em,0,0)}25%,75%{opacity:1;transform:translate3d(0,0,0)}100%{opacity:0;transform:translate3d(0,0,0)}}
@keyframes cmc-pop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
@keyframes cmc-done{from{opacity:0;transform:translate3d(0,.8em,0) scale(.98)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}

/* The same scene from one custom property, for browsers without scroll timelines (p: 0 when the stage pins, 1 when it lets go). */
.cmc[data-cmc-js] .cmc-track{--a:clamp(0,calc((var(--cmc-p) + .26) / .5),1);--h:clamp(0,calc((var(--cmc-p) - .02) / .2),1);--dm:clamp(0,calc((var(--cmc-p) - .14) / .16),1);--pr:clamp(0,calc(1 - max(var(--cmc-p) - .31,.31 - var(--cmc-p)) / .03),1);--u:clamp(0,calc((var(--cmc-p) - .32) / .08),1);--sc:clamp(0,min(calc((var(--cmc-p) - .32) / .06),calc((.64 - var(--cmc-p)) / .06)),1);--k:clamp(0,calc((var(--cmc-p) - .48) / .04),1);--fi:clamp(0,calc((var(--cmc-p) - .46) / .03),1);--o:clamp(0,calc((var(--cmc-p) - .56) / .07),1);--x:clamp(0,calc((var(--cmc-p) - .58) / .05),1);--dn:clamp(0,calc((var(--cmc-p) - .61) / .09),1)}
.cmc[data-cmc-js] .cmc-phone{transform:translate3d(calc((1 - var(--a)) * var(--dx) * -1),calc((1 - var(--a)) * var(--sy)),0) scale(calc(1 + (1 - var(--a)) * (var(--s0) - 1)))}
.cmc[data-cmc-js] .cmc-orbit{transform:translate3d(calc(var(--a) * var(--ocx)),calc((1 - var(--a)) * var(--sy) * .4),0);opacity:calc(1 - var(--dm) * .22)}
.cmc[data-cmc-js] .cmc-floats{transform:translate3d(0,calc(2vh - var(--cmc-p) * 7vh),0)}
.cmc[data-cmc-js] .cmc-title{opacity:var(--h);transform:translate3d(0,calc((1 - var(--h)) * 28px),0)}
.cmc[data-cmc-js] .cmc-stage .ck-pay{transform:scale(calc(1 - var(--pr) * .04))}
.cmc[data-cmc-js] .cmc-stage .cmc-scrim{opacity:var(--sc)}
.cmc[data-cmc-js] .cmc-stage .cmc-sheet-in{transform:translate3d(0,calc((1 - var(--u)) * 108%),0)}
.cmc[data-cmc-js] .cmc-stage .cmc-fid{opacity:calc(1 - var(--fi))}
.cmc[data-cmc-js] .cmc-stage .cmc-sheet-ok{opacity:var(--k)}
.cmc[data-cmc-js] .cmc-stage .cmc-sheet{transform:translate3d(0,calc(var(--o) * 108%),0)}
.cmc[data-cmc-js] .cmc-stage .ck-form{opacity:calc(1 - var(--x))}
.cmc[data-cmc-js] .cmc-stage .ck-done{opacity:var(--dn);transform:translate3d(0,calc((1 - var(--dn)) * .8em),0)}
`

/* The iPhone and the checkout window inside it (and inside the browser mocks). */
const PHONE_CSS = `
.cmc-phone{position:relative;width:var(--pw);aspect-ratio:100/207;border-radius:calc(var(--pw) * .178);padding:calc(var(--pw) * .0135);background:linear-gradient(140deg,#77777c 0%,#36363a 14%,#1d1d20 42%,#232326 62%,#3c3c40 86%,#808086 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 0 calc(var(--pw) * .01) rgba(255,255,255,.12),0 calc(var(--pw) * .12) calc(var(--pw) * .3) calc(var(--pw) * -.08) rgba(124,58,237,.42),0 calc(var(--pw) * .08) calc(var(--pw) * .16) rgba(0,0,0,.6)}
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
.cmc-cardart{position:relative;flex:none;width:3.1em;height:2em;border-radius:.32em;background:linear-gradient(135deg,#8b5cf6,#4338ca);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
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
.ck-mark{display:block;width:4.75em;height:4.75em;margin-top:-.75em;border-radius:.75em;object-fit:cover;box-shadow:0 0 0 1px rgba(17,17,19,.06)}
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

/* The tab cards and their mocks. Each mock is drawn in em of a 48 x 36 box, so it scales as one picture. */
const TABS_CSS = `
.cmc[data-story-section] > .cmc-cards.cmc-cards{position:relative;z-index:4;max-width:1320px;margin:0 auto;padding:clamp(28px,4vw,56px) var(--landing-gutter,clamp(20px,5vw,72px)) clamp(64px,8vw,120px)}
.cmc-tablist{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.cmc-tab{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-height:44px;padding:20px 20px 24px;border-radius:22px;background:rgba(24,24,27,.94);border:1px solid rgba(255,255,255,.08);color:#a1a1aa;text-align:left;cursor:pointer;overflow:hidden;transition:background-color .3s,border-color .3s,color .3s;-webkit-tap-highlight-color:transparent}
.cmc-tab:hover{border-color:rgba(255,255,255,.18);color:#e4e4e7}
.cmc-tab[data-on]{background:#1d1d21;border-color:rgba(188,163,255,.35);color:#fff}
.cmc-tab:focus-visible{outline:2px solid #bca3ff;outline-offset:3px}
.cmc-tab-l{font-size:14px;font-weight:500}
.cmc-tab-s{font-size:clamp(24px,2.3vw,34px);font-weight:300;letter-spacing:-.04em;line-height:1;color:#fff;white-space:nowrap}
.cmc-tab-bar{position:absolute;left:20px;right:20px;bottom:12px;height:2px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}
.cmc-tab-fill{position:absolute;inset:0;background:linear-gradient(90deg,#a78bfa,#818cf8);transform-origin:0 50%;transform:scaleX(1)}
.cmc-tab-fill[data-run]{animation:cmc-fill linear both}
@keyframes cmc-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.cmc-panels{display:grid;margin-top:12px}
.cmc-panel{grid-area:1/1;display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(24px,3.5vw,56px);align-items:center;padding:clamp(28px,3.6vw,52px);border-radius:32px;background:#141416;border:1px solid rgba(255,255,255,.07);opacity:0;visibility:hidden;transition:opacity .35s ease,visibility 0s linear .35s}
.cmc-panel[data-on]{opacity:1;visibility:visible;transition:opacity .45s ease .05s,visibility 0s}
.cmc-panel h3{margin:0;font-size:clamp(26px,3vw,42px);font-weight:400;line-height:1.1;letter-spacing:-.035em;color:#fff;text-wrap:balance}
.cmc-panel p{margin:16px 0 0;max-width:44ch;font-size:clamp(15.5px,1.25vw,18px);line-height:1.6;color:#a1a1aa}
.cmc-vis{position:relative;aspect-ratio:4/3;border-radius:24px;background:radial-gradient(120% 90% at 85% 0%,rgba(124,58,237,.3),transparent 60%),radial-gradient(100% 80% at 0% 100%,rgba(79,70,229,.2),transparent 60%),#0c0c0f;overflow:hidden;container-type:inline-size}
.cmc-vis-in{position:absolute;inset:0;font-size:calc(100cqw / 48);color:#fff;line-height:1.35}
/* Wave 13 perf: a panel's mock is drawn only while its panel shows (and through its fade out): the four hidden mocks cost the page their style, layout and 80 font sizes the moment the section was laid out, 300ms at 4x CPU. The box keeps its size (aspect-ratio), so nothing moves. */
.cmc-panel:not([data-on]) .cmc-vis-in{content-visibility:hidden;transition:content-visibility 0s linear .35s allow-discrete}
.cmc-foot{margin:16px 4px 0;font-size:13px;color:#71717a}

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
.cmv-prod-img{display:block;width:30em;height:30em;border-radius:1em;object-fit:cover}
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
.cmv-br-convert{left:2em;right:2em;top:2.4em}
.cmv-br-tap{left:1.4em;width:36em;top:2.2em}
.cmv-mini{position:absolute;right:1.6em;top:4.6em;--pw:12.2em}
.cmv-mini .cmc-phone{box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 1.5em 3em rgba(0,0,0,.6)}

/* Currencies */
.cmv-cur{position:absolute;inset:0;display:grid;grid-template-columns:19em 1fr;gap:2.2em;align-items:center;padding:0 2.6em}
.cmv-pcard{border-radius:1.2em;background:#fff;color:#1a1a2e;overflow:hidden;box-shadow:0 1.5em 3em rgba(0,0,0,.45)}
.cmv-pcard-img{display:block;width:100%;height:12em;object-fit:cover}
.cmv-pcard-b{display:flex;flex-direction:column;padding:1.1em 1.2em 1.25em}
.cmv-pcard-b b{font-size:1.2em;font-weight:600;letter-spacing:-.01em}
.cmv-pcard-b small{font-size:.9em;color:#6b7280}
.cmv-pcard-row{display:flex;align-items:center;justify-content:space-between;margin-top:.8em}
.cmv-stack{position:relative;display:grid}
.cmv-cyc{grid-area:1/1;display:flex;align-items:center;gap:.4em;opacity:0;animation:cmv-cyc 12.5s ease both infinite;animation-delay:calc(var(--i) * 2.5s);animation-play-state:paused}
.cmv-cyc[data-first]{opacity:1}
.cmv-price{font-size:1.9em;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;min-width:4.6em}
.cmv-pill{display:flex;align-items:center;height:2em;padding:0 .7em;border-radius:1em;background:#f2f2f5;font-size:.9em;font-weight:600;overflow:hidden}
.cmv-pill-in{min-width:3.6em}
.cmv-pcard-buy{display:flex;align-items:center;justify-content:center;height:2.6em;margin-top:1em;border-radius:.7em;background:#1a1a2e;color:#fff;font-size:.95em;font-weight:600}
.cmv-flag{display:block;flex:none;width:1.5em;height:1em;border-radius:.2em;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.cmv-list{position:relative;display:flex;flex-direction:column}
.cmv-hl{position:absolute;left:0;right:0;top:0;height:20%;border-radius:.9em;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(188,163,255,.35);animation:cmv-hl 12.5s ease infinite both;animation-play-state:paused}
.cmv-row{position:relative;display:flex;align-items:center;gap:.9em;height:4.2em;padding:0 1.1em}
.cmv-row .cmv-flag{width:2.1em;height:1.4em;border-radius:.25em}
.cmv-row-t{flex:1;min-width:0}
.cmv-row-t b{display:block;font-size:1.05em;font-weight:600;letter-spacing:.03em}
.cmv-row-t small{display:block;font-size:.85em;color:#8b8b94}
.cmv-row-p{font-size:1.15em;font-weight:500;font-variant-numeric:tabular-nums}
.cmc-cards[data-commerce-live] .cmv-cyc,.cmc-cards[data-commerce-live] .cmv-hl{animation-play-state:running}
@keyframes cmv-cyc{0%{opacity:0;transform:translate3d(0,.45em,0)}3.2%,18%{opacity:1;transform:translate3d(0,0,0)}21.2%,100%{opacity:0;transform:translate3d(0,-.45em,0)}}
@keyframes cmv-hl{0%,17%{transform:translate3d(0,0,0)}20%,37%{transform:translate3d(0,100%,0)}40%,57%{transform:translate3d(0,200%,0)}60%,77%{transform:translate3d(0,300%,0)}80%,96%{transform:translate3d(0,400%,0)}100%{transform:translate3d(0,0,0)}}

/* Reminder email and the notification it arrives as */
.cmv-rec{position:absolute;inset:0}
.cmv-mail{position:absolute;left:8em;right:8em;top:7.2em;padding:1.3em 1.5em 1.4em;border-radius:1.1em;background:#fff;color:#1a1a2e;box-shadow:0 1.5em 3em rgba(0,0,0,.45)}
.cmv-mail-from{display:flex;align-items:center;gap:.6em}
.cmv-mail-from img{width:2.1em;height:2.1em;border-radius:50%;object-fit:cover}
.cmv-mail-from b{display:block;font-size:.9em;font-weight:600}
.cmv-mail-from small{display:block;font-size:.75em;color:#8b8b94}
.cmv-mail-subj{margin-top:.8em;padding-bottom:.8em;border-bottom:1px solid #f0f0f2;font-size:.85em;font-weight:600;color:#4b5563}
.cmv-mail-h{margin-top:.75em;font-size:1.45em;font-weight:600;letter-spacing:-.02em}
.cmv-mail p{margin:.4em 0 0;font-size:.82em;line-height:1.55;color:#6b7280}
.cmv-mail-btn{display:flex;align-items:center;justify-content:center;width:10em;height:2.5em;margin-top:.9em;border-radius:.6em;background:#1a1a2e;color:#fff;font-size:.88em;font-weight:600}
.cmv-mail-line{display:flex;align-items:center;gap:.7em;margin-top:1em;padding-top:.9em;border-top:1px solid #f0f0f2;font-size:.85em}
.cmv-mail-line img{width:2.4em;height:2.4em;border-radius:.4em;object-fit:cover}
.cmv-mail-line span{flex:1}
.cmv-note,.cmv-sale{position:absolute;display:flex;gap:.75em;align-items:flex-start;padding:.85em 1em;border-radius:1.25em;background:rgba(246,246,248,.97);color:#111;box-shadow:0 1em 2.5em rgba(0,0,0,.45)}
.cmv-note{left:6em;right:6em;top:1.4em}
.cmv-note-icon{display:grid;place-items:center;flex:none;width:2.4em;height:2.4em;border-radius:.6em;background:linear-gradient(180deg,#1e9bff,#0a6cff)}
.cmv-note-t{flex:1;min-width:0;display:flex;flex-direction:column;font-size:.86em;line-height:1.3}
.cmv-note-top{display:flex;justify-content:space-between}
.cmv-note-top b{font-weight:600}
.cmv-note-top small{color:#8a8a8e}
.cmv-note-s{font-weight:500}
.cmv-note-p{color:#55555a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmv-steps{position:absolute;left:2em;right:2em;bottom:1.5em;display:flex;justify-content:center;gap:.6em}
.cmv-st{display:flex;align-items:center;gap:.45em;height:2.2em;padding:0 .85em;border-radius:1.1em;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);font-size:.8em;white-space:nowrap;color:#e4e4e7}
.cmv-st small{color:#8b8b94}
.cmv-st i{display:block;width:.55em;height:.55em;border-radius:50%;background:#a78bfa}
.cmv-st3 i{background:#22c55e}

/* Paid */
.cmv-paid{position:absolute;inset:0}
.cmv-rcpt{position:absolute;left:10.5em;right:10.5em;top:8.4em;display:flex;flex-direction:column;align-items:center;padding:1.6em 1.6em 1.5em;border-radius:1.2em;background:#fff;color:#1a1a2e;text-align:center;box-shadow:0 1.5em 3em rgba(0,0,0,.45)}
.cmv-rcpt-check{display:grid;place-items:center;width:2.9em;height:2.9em;border-radius:50%;background:#ecfdf3;color:#15803d}
.cmv-rcpt-t{margin-top:.6em;font-size:1.25em;font-weight:600}
.cmv-rcpt-s{margin-top:.3em;font-size:.8em;color:#6b7280}
.cmv-rcpt-rows{align-self:stretch;margin-top:1em;border:1px solid #eceef1;border-radius:.8em;text-align:left}
.cmv-rcpt-rows div{display:flex;align-items:center;gap:.6em;height:2.9em;padding:0 .9em;font-size:.85em}
.cmv-rcpt-rows div+div{border-top:1px solid #f1f2f4}
.cmv-rcpt-rows img{width:1.9em;height:1.9em;border-radius:.35em;object-fit:cover}
.cmv-rcpt-rows span{flex:1;color:#6b7280}
.cmv-rcpt-rows b{font-weight:600}
.cmv-rcpt-ap{display:inline-flex;align-items:center;gap:.1em}
.cmv-rcpt-btn{display:flex;align-items:center;justify-content:center;height:2.6em;padding:0 1.2em;margin-top:1em;border-radius:.65em;background:#1a1a2e;color:#fff;font-size:.85em;font-weight:600}
.cmv-sale{right:1.6em;top:1.6em;width:22em}
.cmv-sale img{flex:none;width:2.4em;height:2.4em;border-radius:.6em}

/* One-shot sequences, played each time a tab opens (the finished frame is the resting state). */
@media (prefers-reduced-motion:no-preference){
  .cmc-panel[data-on] .cmv-cur1{animation:cmv-cur1 1.5s cubic-bezier(.3,.7,.2,1) both .25s}
  .cmc-panel[data-on] .cmv-br-convert .cmv-buy{animation:cmv-press .3s ease both 1.15s}
  .cmc-panel[data-on] .cmv-br-convert .cmv-dim{animation:cmv-in .3s ease-out both 1.4s}
  .cmc-panel[data-on] .cmv-br-convert .cmv-dlg-form{animation:cmv-dlg-seq 4.25s linear both}
  .cmc-panel[data-on] .cmv-br-convert .ck-ph{animation:cmv-ph 2s linear both 1.6s}
  .cmc-panel[data-on] .cmv-br-convert .ck-v1{animation:cmv-in .3s ease both 2.05s}
  .cmc-panel[data-on] .cmv-br-convert .ck-v2{animation:cmv-in .3s ease both 2.45s}
  .cmc-panel[data-on] .cmv-br-convert .cmv-cur2{animation:cmv-cur2 1s cubic-bezier(.3,.7,.2,1) both 2.75s}
  .cmc-panel[data-on] .cmv-br-convert .ck-pay{animation:cmv-press .3s ease both 3.55s}
  .cmc-panel[data-on] .cmv-br-convert .cmv-dlg-done{animation:cmv-dlg .4s cubic-bezier(.2,.8,.2,1) both 3.95s}
  .cmc-panel[data-on] .cmv-br-convert .ck-check{animation:cmv-check .45s cubic-bezier(.3,1.5,.5,1) both 4.3s}

  .cmc-panel[data-on] .cmv-br-tap .cmv-cur2{animation:cmv-cur2 1s cubic-bezier(.3,.7,.2,1) both .5s}
  .cmc-panel[data-on] .cmv-br-tap .ck-pay{animation:cmv-press .3s ease both 1.3s}
  .cmc-panel[data-on] .cmv-br-tap .cmv-dlg-form{animation:cmv-dlg-out .35s ease both 1.65s}
  .cmc-panel[data-on] .cmv-br-tap .cmv-dlg-done{animation:cmv-dlg .4s cubic-bezier(.2,.8,.2,1) both 1.7s}
  .cmc-panel[data-on] .cmv-br-tap .ck-check{animation:cmv-check .45s cubic-bezier(.3,1.5,.5,1) both 2.05s}
  .cmc-panel[data-on] .cmv-mini .cmc-scrim{animation:cmv-scrim 3.5s ease both .3s}
  .cmc-panel[data-on] .cmv-mini .cmc-sheet-in{animation:cmv-sheet 3.5s cubic-bezier(.2,.8,.2,1) both .3s}
  .cmc-panel[data-on] .cmv-mini .cmc-dbl{animation:cmv-dbl 2.4s ease both .7s}
  .cmc-panel[data-on] .cmv-mini .cmc-fid{animation:cmv-fid 2.2s ease both .8s}
  .cmc-panel[data-on] .cmv-mini .cmc-sheet-ok{animation:cmv-check .45s cubic-bezier(.3,1.5,.5,1) both 2.55s}
  .cmc-panel[data-on] .cmv-mini .ck-form{animation:cmv-out .3s ease both 3.6s}
  .cmc-panel[data-on] .cmv-mini .ck-done{animation:cmv-done .45s cubic-bezier(.2,.8,.2,1) both 3.75s}

  .cmc-panel[data-on] .cmv-pcard{animation:cmv-rise .55s cubic-bezier(.2,.8,.2,1) both}
  .cmc-panel[data-on] .cmv-row{animation:cmv-rise .5s cubic-bezier(.2,.8,.2,1) both .1s}

  .cmc-panel[data-on] .cmv-st1{animation:cmv-in .4s ease both .1s}
  .cmc-panel[data-on] .cmv-note{animation:cmv-drop .6s cubic-bezier(.2,.9,.25,1.05) both .6s}
  .cmc-panel[data-on] .cmv-st2{animation:cmv-in .4s ease both .75s}
  .cmc-panel[data-on] .cmv-mail{animation:cmv-rise .6s cubic-bezier(.2,.8,.2,1) both 1.3s}
  .cmc-panel[data-on] .cmv-mail-btn{animation:cmv-press .3s ease both 3s}
  .cmc-panel[data-on] .cmv-st3{animation:cmv-in .4s ease both 3.35s}

  .cmc-panel[data-on] .cmv-rcpt{animation:cmv-rise .6s cubic-bezier(.2,.8,.2,1) both .15s}
  .cmc-panel[data-on] .cmv-rcpt-check{animation:cmv-check .5s cubic-bezier(.3,1.5,.5,1) both .55s}
  .cmc-panel[data-on] .cmv-rcpt-rows{animation:cmv-in .4s ease both .9s}
  .cmc-panel[data-on] .cmv-sale{animation:cmv-slide .6s cubic-bezier(.2,.9,.25,1.05) both 1.6s}
}
@keyframes cmv-in{from{opacity:0}to{opacity:1}}
@keyframes cmv-out{from{opacity:1}to{opacity:0}}
@keyframes cmv-ph{0%{opacity:1}22%{opacity:1}30%{opacity:0}100%{opacity:0}}
@keyframes cmv-press{0%,100%{transform:scale(1)}45%{transform:scale(.96)}}
@keyframes cmv-dlg{from{opacity:0;transform:translateY(calc(-50% + .5em))}to{opacity:1;transform:translateY(-50%)}}
@keyframes cmv-dlg-out{from{opacity:1}to{opacity:0}}
@keyframes cmv-dlg-seq{0%,34%{opacity:0;transform:translateY(calc(-50% + .5em));animation-timing-function:ease-out}42%,91.5%{opacity:1;transform:translateY(-50%)}100%{opacity:0;transform:translateY(-50%)}}
@keyframes cmv-cur1{0%{opacity:0;transform:translate3d(6em,4em,0)}15%{opacity:1}62%{transform:translate3d(0,0,0) scale(1)}70%{transform:translate3d(0,0,0) scale(.85)}78%{opacity:1;transform:translate3d(0,0,0) scale(1)}100%{opacity:0;transform:translate3d(0,0,0)}}
@keyframes cmv-cur2{0%{opacity:0;transform:translate3d(5em,3.5em,0)}20%{opacity:1}75%{transform:translate3d(0,0,0) scale(1)}85%{transform:translate3d(0,0,0) scale(.85)}100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes cmv-done{from{opacity:0;transform:translate3d(0,.8em,0) scale(.98)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes cmv-check{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}
@keyframes cmv-scrim{0%{opacity:0}12%,80%{opacity:1}100%{opacity:0}}
@keyframes cmv-sheet{0%{transform:translate3d(0,108%,0)}14%,80%{transform:translate3d(0,0,0)}100%{transform:translate3d(0,108%,0)}}
@keyframes cmv-dbl{0%{opacity:0;transform:translate3d(.6em,0,0)}15%,70%{opacity:1;transform:translate3d(0,0,0)}100%{opacity:0;transform:translate3d(0,0,0)}}
@keyframes cmv-fid{0%{opacity:1}25%{opacity:.45}50%{opacity:1}70%{opacity:.45}82%{opacity:1}100%{opacity:0}}
@keyframes cmv-rise{from{opacity:0;transform:translate3d(0,1.2em,0)}to{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cmv-drop{from{opacity:0;transform:translate3d(0,-1.6em,0) scale(.97)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes cmv-slide{from{opacity:0;transform:translate3d(1.6em,0,0)}to{opacity:1;transform:translate3d(0,0,0)}}

/* The mocks' resting states, where the sequence above does not run: the dialog open, the sale made. */
.cmv-dlg-form{opacity:0}
.cmv-mini .ck-done{opacity:1}
.cmv-mini .ck-form{opacity:0}
.cmv-br-tap .cmv-cur2{opacity:1}

@media (max-width:1099px) and (min-width:900px){
  .cmc-tab{padding:16px 14px 22px}
  .cmc-tab-l{font-size:12.5px}
  .cmc-tab-bar{left:14px;right:14px}
}
@media (max-width:899px){
  .cmc-tablist{grid-template-columns:repeat(2,1fr);gap:10px}
  .cmc-tab:last-child{grid-column:1/-1}
  .cmc-tab{padding:16px 16px 22px;border-radius:20px}
  .cmc-tab-bar{left:16px;right:16px}
  .cmc-panel{grid-template-columns:1fr;align-content:start;gap:24px;border-radius:24px;padding:24px}
  .cmc-vis{margin:0 -10px;border-radius:18px}
}
@media (max-width:639px){
  .cmc-tab-s{font-size:min(6.2vw,26px)}
  .cmc-tab-l{font-size:13px}
}
`

/* Still: the finished scene, nothing pinned or moving. */
const STILL_CSS = `
@media (prefers-reduced-motion:reduce){
  .cmc[data-story-section] > .cmc-track.cmc-track{height:auto}
  .cmc-stage{position:relative;height:max(100svh,calc(var(--pw) * 2.07 + 200px))}
  .cmc-lap,.cmc-sharp,.cmc-soft,.cmc-track[data-commerce-live] .cmc-lap,.cmc-track[data-commerce-live] .cmc-sharp,.cmc-track[data-commerce-live] .cmc-soft{animation-play-state:paused!important}
  .cmc-orbit{opacity:.7;transform:translate3d(var(--ocx),0,0)}
  .cmv-cyc,.cmv-hl,.cmc-panel{animation:none!important;transition:none!important}
}
`

const CHECKOUT_CSS = SCENE_CSS + PHONE_CSS + TABS_CSS + STILL_CSS

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CHECKOUT_STYLES: readonly SectionStyle[] = [COMMERCE_KIT_STYLE, { href: "w12-commerce-checkout", precedence: "default", css: CHECKOUT_CSS }]
