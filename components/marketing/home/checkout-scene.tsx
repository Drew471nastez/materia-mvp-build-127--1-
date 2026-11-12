"use client"

/**
 * ===========================================================================
 *  HIGH-CONVERTING CHECKOUT: THE SCROLL SCENE (home, section 9)
 * ===========================================================================
 * Black. Six things creators sell (a tee, a cap, a record, a preset pack, a
 * course, a membership card) float and turn slowly in the dark. As the page
 * scrolls, a phone rises with Storelib's own instant checkout on it (the
 * window components/checkout/instant-checkout.tsx draws: the grey head with
 * the product and the seller, Contact, the line and its price, Payment
 * method with the wallet and Card, "Pay $19.00 with Apple Pay"), the thin
 * headline fades in above it, the products fall out of focus, the Apple Pay
 * sheet comes up and the window turns to "Payment complete". Then the dark
 * cards rise over the phone: four tabs, each a true thing checkout does.
 *
 * MOTION, CHEAPLY.
 *   scroll   CSS scroll-driven animations on one named view timeline (the
 *            track), transform and opacity only, run by the compositor.
 *            Where animation-timeline is not supported, one rAF per scroll
 *            frame (only while the track is on screen) writes a single
 *            custom property, --cmc-p, and the same transforms read it.
 *   focus    each product has a sharp and a pre-blurred webp
 *            (public/home/commerce/float-*-blur.webp); "falling out of
 *            focus" is a cross fade between them, never a live filter.
 *   drift    a slow time-based loop per product, paused offscreen and in a
 *            background tab (data-commerce-live).
 *   reduced  prefers-reduced-motion: no pinning, no drift, the finished
 *            state drawn still: phone up, headline in, cards in place.
 *
 * TRUE FIGURES. The tabs say what the code does: three fields and a wallet
 * button (instant checkout), Apple Pay and Google Pay (compact-pay), the
 * currencies fees are written for (lib/payments/fees/currency-rules), and
 * the checkout reminder an hour after a checkout that did not finish, only
 * for buyers who ticked the box (lib/automations/abandoned.ts).
 */
import type { SectionStyle } from "./lazy-section"
import { useEffect, useRef, useState } from "react"
import { COMMERCE_CURRENCY_COUNT, COMMERCE_KIT_STYLE, CommerceKitStyle, useCommerceLive, useCommerceReducedMotion } from "./commerce-kit"

const IMG = "/home/commerce"

/** Each floating product: where it sits (percent of the stage), its width, its drift, and the object's size inside the blurred file (for lining the two files up). */
const FLOATS = [
  { id: "cap", alt: "", x: 9, y: 14, w: "clamp(120px,15vw,250px)", obj: [220, 109], d: 17, r: -14, far: false, m: true },
  { id: "vinyl", alt: "", x: 73, y: 9, w: "clamp(150px,19vw,300px)", obj: [220, 159], d: 21, r: 9, far: false, m: true },
  { id: "tee", alt: "", x: 4, y: 50, w: "clamp(120px,14vw,230px)", obj: [151, 220], d: 19, r: 8, far: false, m: true },
  { id: "box", alt: "", x: 83, y: 47, w: "clamp(90px,11vw,180px)", obj: [201, 220], d: 23, r: -10, far: true, m: true },
  { id: "course", alt: "", x: 70, y: 70, w: "clamp(130px,15vw,250px)", obj: [220, 193], d: 25, r: -6, far: true, m: false },
  { id: "member", alt: "", x: 17, y: 77, w: "clamp(130px,15vw,240px)", obj: [220, 143], d: 20, r: 12, far: true, m: false },
] as const
const BLUR_PAD = 24

const TABS = [
  {
    id: "convert",
    label: "Built to convert",
    stat: "1 screen",
    title: "Three fields, then paid",
    body: "No account to make and no cart to visit. Email, name, pay, in a window that opens over your page, so fans never lose sight of what they came for.",
  },
  {
    id: "tap",
    label: "One-tap payments",
    stat: "1 tap",
    title: "Apple Pay and Google Pay, built in",
    body: "The phone's own wallet is offered first wherever it works, with cards beside it. A face or a fingerprint, and the order is in.",
  },
  {
    id: "currency",
    label: "Local currencies",
    stat: `${COMMERCE_CURRENCY_COUNT} currencies`,
    title: "Prices fans read without a calculator",
    body: "Your website can show prices in a visitor's own currency and charge in it: dollars, euros, pounds, yen and more.",
  },
  {
    id: "recover",
    label: "Checkout reminders",
    stat: "1 hour",
    title: "Bring back the ones who almost bought",
    body: "Someone reached Pay and left? If they ticked the box for emails, a reminder goes out an hour later, and it stops the moment they buy.",
  },
] as const
type TabId = (typeof TABS)[number]["id"]
const AUTO_MS = 6500

export function CheckoutScene() {
  const [rootRef, live] = useCommerceLive<HTMLElement>("200px 0px")
  const trackRef = useRef<HTMLDivElement>(null)
  const reduced = useCommerceReducedMotion()

  /* The phone is sized to the room the headline leaves (measured, on resize only). */
  useEffect(() => {
    const copy = rootRef.current?.querySelector<HTMLElement>(".cmc-copy")
    const stage = copy?.parentElement
    if (!copy || !stage || typeof ResizeObserver !== "function") return
    const ro = new ResizeObserver(() => stage.style.setProperty("--cmc-copy", `${Math.ceil(copy.offsetTop + copy.offsetHeight)}px`))
    ro.observe(copy)
    return () => ro.disconnect()
  }, [rootRef])

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
      const p = Math.max(-0.7, Math.min(1, -r.top / span))
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
  }, [rootRef])

  return (
    <section ref={rootRef} className="cmc" data-story-section="checkout" aria-labelledby="cmc-title">
      <CommerceKitStyle />
      <style href="w12-commerce-checkout" precedence="default">
        {CHECKOUT_CSS}
      </style>
      <div ref={trackRef} className="cmc-track">
        <div className="cmc-stage">
          <div className="cmc-floats" aria-hidden="true">
            {FLOATS.map((f) => (
              <div
                key={f.id}
                className="cmc-f"
                data-far={f.far || undefined}
                data-m={f.m || undefined}
                style={{ left: `${f.x}%`, top: `${f.y}%`, width: f.w, "--d": `${f.d}s`, "--r": `${f.r}deg` } as React.CSSProperties}
              >
                <div className="cmc-drift">
                  <div className="cmc-obj" style={{ aspectRatio: `${f.obj[0]} / ${f.obj[1]}` }}>
                    {f.far ? null : <img className="cmc-sharp" src={`${IMG}/float-${f.id}.webp`} alt="" loading="lazy" decoding="async" width={f.obj[0] * 2} height={f.obj[1] * 2} />}
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
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="cmc-copy">
            <h2 id="cmc-title" className="cmc-title">
              Checkout that turns a tap into a sale
            </h2>
            <p className="cmc-sub">One screen, no account, Apple Pay and Google Pay built in. Fans pay in seconds, right where they found you.</p>
          </div>

          <div className="cmc-phone-wrap">
            <Phone />
          </div>
        </div>
      </div>

      <CheckoutTabs live={live} reduced={reduced} />
    </section>
  )
}

/* ── The phone: Storelib's instant checkout, drawn in em so it scales ─── */

function Phone() {
  return (
    <div className="cmc-phone" role="img" aria-label="A Storelib checkout on a phone: Golden Hour presets by Maya Ellis Studio, $19.00, paid with Apple Pay.">
      <div className="cmc-screen" aria-hidden="true">
        <div className="cmc-ui">
          <div className="cmc-status">
            <span>9:41</span>
            <span className="cmc-island" />
            <span className="cmc-icons">
              <svg viewBox="0 0 18 12" width="1.1em" height="0.75em" fill="currentColor">
                <rect x="0" y="8" width="3" height="4" rx="1" />
                <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                <rect x="10" y="3" width="3" height="9" rx="1" />
                <rect x="15" y="0" width="3" height="12" rx="1" />
              </svg>
              <svg viewBox="0 0 16 12" width="1em" height="0.75em" fill="currentColor">
                <path d="M8 2.3c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .5 10.4 10.4 0 0 0 .8 3.4L2 4.7a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.6 6.6 0 0 0 8 4.1c-1.8 0-3.4.7-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3Zm0 3.6c-.6 0-1.1.2-1.5.6L8 11.7l1.5-1.6c-.4-.4-.9-.6-1.5-.6Z" />
              </svg>
              <span className="cmc-batt" />
            </span>
          </div>

          <div className="cmc-head">
            <div className="cmc-headrow">
              <span>Back</span>
              <svg viewBox="0 0 20 20" width="1.25em" height="1.25em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M5 5l10 10M15 5 5 15" />
              </svg>
            </div>
            <img className="cmc-mark" src={`${IMG}/art-golden.webp`} alt="" loading="lazy" decoding="async" width={160} height={160} />
            <div className="cmc-ptitle">Golden Hour presets</div>
            <div className="cmc-seller">Maya Ellis Studio</div>
          </div>

          <div className="cmc-body">
            <div className="cmc-form">
              <div className="cmc-h3">Contact</div>
              <div className="cmc-field">sam.rivera@mail.com</div>
              <div className="cmc-field">Sam Rivera</div>
              <div className="cmc-summary">
                <span>Golden Hour presets</span>
                <b>$19.00</b>
              </div>
              <div className="cmc-h3">Payment method</div>
              <div className="cmc-methods">
                <span data-on="">
                  <AppleMark />
                  Pay
                </span>
                <span>
                  <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2.25" />
                    <path d="M2.75 9.5h18.5M6.5 15h3" strokeLinecap="round" />
                  </svg>
                  Card
                </span>
              </div>
              <div className="cmc-pay">Pay $19.00 with Apple Pay</div>
              <div className="cmc-terms">By paying you agree to the Terms</div>
            </div>

            <div className="cmc-done">
              <span className="cmc-check">
                <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              </span>
              <div className="cmc-done-t">Payment complete</div>
              <div className="cmc-done-s">We sent your receipt and your access to sam.rivera@mail.com.</div>
              <div className="cmc-receipt">View receipt</div>
            </div>
          </div>

          <div className="cmc-sheet-in">
            <div className="cmc-sheet">
              <div className="cmc-sheet-top">
                <span className="cmc-ap">
                  <AppleMark />
                  Pay
                </span>
                <span className="cmc-cancel">Cancel</span>
              </div>
              <div className="cmc-card">
                <span className="cmc-cardart" />
                <span>
                  <b>Everyday card</b>
                  <small>•••• 4242</small>
                </span>
              </div>
              <div className="cmc-sheet-row">
                <span>Pay Maya Ellis Studio</span>
                <b>$19.00</b>
              </div>
              <div className="cmc-confirm">
                <span className="cmc-face" />
                <span className="cmc-sheet-ok">
                  <svg viewBox="0 0 24 24" width="1.6em" height="1.6em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m7.5 12.3 3 3 6-6.3" />
                  </svg>
                  Done
                </span>
              </div>
            </div>
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

/* ── The dark tab cards ──────────────────────────────────────────────── */

function CheckoutTabs({ live, reduced }: { live: boolean; reduced: boolean }) {
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
    <div className="cmc-cards" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocusCapture={() => setHeld(true)} onBlurCapture={() => setHeld(false)}>
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
          <div key={t.id} id={`cmc-panel-${t.id}`} role="tabpanel" aria-labelledby={`cmc-tab-${t.id}`} className="cmc-panel" data-on={t.id === active || undefined} hidden={t.id !== active}>
            <div className="cmc-panel-copy">
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </div>
            <div className="cmc-vis" aria-hidden="true">
              {t.id === "convert" ? <VisConvert /> : t.id === "tap" ? <VisTap /> : t.id === "currency" ? <VisCurrency /> : <VisRecover />}
            </div>
          </div>
        ))}
      </div>
      <p className="cmc-foot">Card payments are processed by Stripe. Wallets show where the buyer&apos;s device and browser offer them.</p>
    </div>
  )
}

function VisConvert() {
  const steps = ["Email", "Name", "Pay"]
  return (
    <div className="cmv-convert">
      {steps.map((s, i) => (
        <div key={s} className="cmv-step" style={{ "--i": i } as React.CSSProperties}>
          <span className="cmv-num">{i + 1}</span>
          <span className="cmv-step-l">{s}</span>
          <span className="cmv-tick">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>
      ))}
      <div className="cmv-never">
        <span>Create an account</span>
        <span>View cart</span>
        <span>Leave the page</span>
      </div>
    </div>
  )
}

function VisTap() {
  return (
    <div className="cmv-tap">
      <div className="cmv-wallet cmv-apple">
        <AppleMark />
        Pay
        <span className="cmv-ripple" />
      </div>
      <div className="cmv-wallet cmv-google">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z" />
          <path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
        </svg>
        Pay
      </div>
      <div className="cmv-wallet cmv-card">Card</div>
      <div className="cmv-paid">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
        Paid $19.00
      </div>
    </div>
  )
}

/* Example prices for one $19 product as each currency would show it. */
const PRICES = [
  ["USD", "$19.00", "Austin"],
  ["EUR", "€17.50", "Berlin"],
  ["GBP", "£15.00", "London"],
  ["JPY", "¥2,900", "Tokyo"],
  ["CAD", "C$26.00", "Toronto"],
  ["AUD", "A$29.00", "Sydney"],
  ["RON", "87 lei", "Bucharest"],
] as const

function VisCurrency() {
  return (
    <div className="cmv-cur">
      <div className="cmv-cur-list">
        {PRICES.map(([code, price, city], i) => (
          <div key={code} className="cmv-cur-row" style={{ "--i": i } as React.CSSProperties}>
            <span className="cmv-code">{code}</span>
            <span className="cmv-city">{city}</span>
            <b>{price}</b>
          </div>
        ))}
      </div>
      <span className="cmv-cur-note">Example prices for one $19 product</span>
    </div>
  )
}

function VisRecover() {
  return (
    <div className="cmv-rec">
      <div className="cmv-line">
        <div className="cmv-ev" style={{ "--i": 0 } as React.CSSProperties}>
          <span className="cmv-dot" />
          <span>
            <b>Checkout started</b>
            <small>2:14 PM · ticked “Email me”</small>
          </span>
        </div>
        <div className="cmv-ev" style={{ "--i": 1 } as React.CSSProperties}>
          <span className="cmv-dot" />
          <span>
            <b>Reminder sent</b>
            <small>3:14 PM</small>
          </span>
        </div>
        <div className="cmv-ev" style={{ "--i": 2 } as React.CSSProperties}>
          <span className="cmv-dot cmv-dot-ok" />
          <span>
            <b>Order paid · $19.00</b>
            <small>3:31 PM · reminders stop</small>
          </span>
        </div>
      </div>
      <div className="cmv-mail">
        <img src={`${IMG}/art-golden.webp`} alt="" loading="lazy" decoding="async" width={96} height={96} />
        <span>
          <small>Maya Ellis Studio</small>
          <b>Still thinking about Golden Hour?</b>
          <em>Finish checkout</em>
        </span>
      </div>
    </div>
  )
}

/* ── Styles ──────────────────────────────────────────────────────────── */

const CHECKOUT_CSS = `
.cmc{position:relative;background:#000;color:#fff;border-radius:clamp(28px,4vw,56px);overflow:clip;padding-block:0!important;isolation:isolate}
.cmc-track{position:relative;height:calc(100svh + 150vh);view-timeline-name:--cmc;--cmc-p:1}
.cmc-stage{position:sticky;top:0;height:100svh;overflow:hidden;display:flex;flex-direction:column;align-items:center;--cmc-pw:max(200px,min(310px,66vw,calc((100svh - var(--cmc-copy,290px) - 40px) / 2.145)))}
.cmc-floats{position:absolute;inset:-4% 0;pointer-events:none}
.cmc-f{position:absolute;translate:-0% 0}
.cmc-drift{animation:cmc-drift var(--d) ease-in-out infinite alternate;animation-play-state:paused}
[data-commerce-live] .cmc-drift{animation-play-state:running}
@keyframes cmc-drift{0%{transform:translate3d(0,0,0) rotate(var(--r))}50%{transform:translate3d(14px,-22px,0) rotate(calc(var(--r) * -.4))}100%{transform:translate3d(-10px,12px,0) rotate(calc(var(--r) * .6))}}
.cmc-obj{position:relative}
.cmc-obj img{position:absolute;display:block;max-width:none}
.cmc-sharp{inset:0;width:100%;height:100%}
.cmc-soft{opacity:1}
.cmc-f:not([data-far]) .cmc-soft{opacity:1}
.cmc-f:not([data-far]) .cmc-sharp{opacity:0}
.cmc-f[data-far]{opacity:.55}
.cmc-copy{position:relative;z-index:2;padding:clamp(80px,12svh,124px) 20px 0;text-align:center;max-width:1240px}
.cmc-title{margin:0;font-size:clamp(34px,min(5.4vw,7svh),76px);font-weight:300;line-height:1.02;letter-spacing:-.045em;text-wrap:balance;color:#fff}
.cmc-sub{margin:16px auto 0;max-width:46ch;font-size:clamp(15.5px,1.3vw,19px);line-height:1.55;color:#a1a1aa;text-wrap:pretty}
.cmc-phone-wrap{position:relative;z-index:3;margin-top:auto;padding-bottom:clamp(12px,3svh,32px)}
.cmc-phone{width:var(--cmc-pw);aspect-ratio:9/19.3;border-radius:calc(var(--cmc-pw) * .16);padding:calc(var(--cmc-pw) * .03);background:linear-gradient(145deg,#3a3a40,#121214 40%,#26262b);box-shadow:0 0 0 1px rgba(255,255,255,.12),0 40px 120px -20px rgba(124,58,237,.35),0 30px 60px rgba(0,0,0,.6)}
.cmc-screen{position:relative;height:100%;border-radius:calc(var(--cmc-pw) * .135);overflow:hidden;background:#fff;container-type:inline-size;color:#1a1a2e}
.cmc-ui{position:absolute;inset:0;font-size:calc(100cqw * 16 / 375);font-family:inherit;line-height:1.35}
.cmc-status{position:relative;height:3.2em;display:flex;align-items:center;justify-content:space-between;padding:0 1.9em 0 2.1em;background:#f8f9fa;font-size:.95em;font-weight:600}
.cmc-island{position:absolute;left:50%;top:.7em;width:6.6em;height:1.9em;margin-left:-3.3em;border-radius:1em;background:#000}
.cmc-icons{display:flex;align-items:center;gap:.35em}
.cmc-batt{width:1.55em;height:.75em;border-radius:.22em;border:1px solid currentColor;position:relative;opacity:.9}
.cmc-batt::after{content:"";position:absolute;inset:1.5px 3px 1.5px 1.5px;background:currentColor;border-radius:1px}
.cmc-head{background:#f8f9fa;border-bottom:1px solid #eef0f2;padding:.1em 1.25em 1.15em;text-align:center}
.cmc-headrow{display:flex;justify-content:space-between;align-items:center;height:2.5em;color:#4b5563;font-size:.85em;font-weight:500}
.cmc-mark{display:block;margin:-.5em auto 0;width:4.75em;height:4.75em;border-radius:.75em;object-fit:cover;box-shadow:0 0 0 1px rgba(17,17,19,.06)}
.cmc-ptitle{margin-top:.6em;font-size:1.3em;font-weight:600;letter-spacing:-.01em}
.cmc-seller{margin-top:.1em;font-size:.84em;color:#6b7280}
.cmc-body{position:relative;padding:1.15em 1.25em}
.cmc-form{display:grid;gap:.6em}
.cmc-h3{font-size:.9em;font-weight:600;margin-top:.15em}
.cmc-field{height:3em;display:flex;align-items:center;padding:0 .9em;border:1px solid #e1e3e7;border-radius:.75em;font-size:.95em}
.cmc-summary{height:3em;display:flex;align-items:center;justify-content:space-between;padding:0 1em;border:1px solid #e5e7eb;border-radius:.75em;font-size:.88em;color:#6b7280}
.cmc-summary b{color:#1a1a2e;font-weight:600}
.cmc-methods{display:grid;grid-template-columns:1fr 1fr;gap:.6em}
.cmc-methods span{height:3em;display:flex;align-items:center;justify-content:center;gap:.35em;border:1px solid #e1e3e7;border-radius:.75em;font-size:.95em;font-weight:500}
.cmc-methods [data-on]{border-color:#1a1a2e;box-shadow:0 0 0 1px #1a1a2e}
.cmc-pay{height:3.25em;display:flex;align-items:center;justify-content:center;border-radius:.75em;background:#1a1a2e;color:#fff;font-weight:600;margin-top:.2em;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 2px rgba(16,24,40,.2)}
.cmc-terms{text-align:center;font-size:.72em;color:#8b919a}
.cmc-done{position:absolute;inset:1.15em 1.25em auto;border:1px solid #e5e7eb;border-radius:1em;padding:1.6em 1.2em;text-align:center;opacity:0}
.cmc-check{display:grid;place-items:center;width:2.5em;height:2.5em;margin:0 auto;border-radius:50%;background:#ecfdf3;color:#15803d}
.cmc-done-t{margin-top:.75em;font-size:1.12em;font-weight:600}
.cmc-done-s{margin-top:.3em;font-size:.88em;color:#6b7280}
.cmc-receipt{margin-top:1em;height:2.75em;display:flex;align-items:center;justify-content:center;border-radius:.75em;background:#1a1a2e;color:#fff;font-size:.88em;font-weight:600}
.cmc-sheet-in{position:absolute;left:0;right:0;bottom:0;transform:translate3d(0,105%,0)}
.cmc-sheet{background:#f2f2f7;border-radius:1.4em 1.4em 0 0;padding:1em 1.1em 2.4em;box-shadow:0 -10px 40px rgba(0,0,0,.25);color:#000}
.cmc-sheet-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:.9em}
.cmc-ap{display:inline-flex;align-items:center;gap:.15em;font-size:1.3em;font-weight:600}
.cmc-cancel{color:#0a66ff;font-size:.95em}
.cmc-card{display:flex;align-items:center;gap:.8em;padding:.75em .85em;background:#fff;border-radius:.8em;font-size:.9em}
.cmc-card b{display:block;font-weight:600}
.cmc-card small{color:#6b7280;font-size:.9em}
.cmc-cardart{width:2.9em;height:1.9em;border-radius:.3em;background:linear-gradient(135deg,#7c3aed,#4338ca)}
.cmc-sheet-row{display:flex;justify-content:space-between;padding:.9em .2em;font-size:.95em;border-bottom:1px solid #d9d9df}
.cmc-sheet-row b{font-weight:600}
.cmc-confirm{position:relative;height:3.6em;display:grid;place-items:center;margin-top:.7em}
.cmc-face{width:2.6em;height:2.6em;border-radius:.7em;border:2px solid #0a66ff;opacity:.85}
.cmc-sheet-ok{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.1em;color:#0a66ff;font-size:.82em;font-weight:600;opacity:0;background:#f2f2f7}

.cmc-cards{position:relative;z-index:4;max-width:1320px;margin:-30svh auto 0;padding:0 var(--landing-gutter,clamp(20px,5vw,72px)) clamp(64px,8vw,120px)}
.cmc-tablist{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.cmc-tab{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-height:44px;padding:20px 22px 24px;border-radius:24px;background:rgba(24,24,27,.94);border:1px solid rgba(255,255,255,.08);color:#a1a1aa;text-align:left;cursor:pointer;overflow:hidden;transition:background-color .3s,border-color .3s,color .3s,transform .4s cubic-bezier(.2,.8,.2,1)}
.cmc-tab:hover{border-color:rgba(255,255,255,.18);color:#e4e4e7}
.cmc-tab[data-on]{background:#1d1d21;border-color:rgba(188,163,255,.35);color:#fff}
.cmc-tab:focus-visible{outline:2px solid #bca3ff;outline-offset:3px}
.cmc-tab-l{font-size:14.5px;font-weight:500}
.cmc-tab-s{font-size:clamp(26px,2.6vw,40px);font-weight:300;letter-spacing:-.04em;line-height:1;color:#fff}
.cmc-tab-bar{position:absolute;left:22px;right:22px;bottom:12px;height:2px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}
.cmc-tab-fill{position:absolute;inset:0;background:linear-gradient(90deg,#a78bfa,#818cf8);transform-origin:0 50%;transform:scaleX(1)}
.cmc-tab-fill[data-run]{animation:cmc-fill linear both}
@keyframes cmc-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.cmc-panels{margin-top:12px}
.cmc-panel{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:32px;align-items:center;min-height:380px;padding:clamp(28px,4vw,56px);border-radius:32px;background:#141416;border:1px solid rgba(255,255,255,.07)}
.cmc-panel[data-on]{animation:cmc-panel .55s cubic-bezier(.2,.8,.2,1) both}
@keyframes cmc-panel{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}
.cmc-panel h3{margin:0;font-size:clamp(26px,3vw,42px);font-weight:400;line-height:1.1;letter-spacing:-.035em;color:#fff;text-wrap:balance}
.cmc-panel p{margin:16px 0 0;max-width:44ch;font-size:clamp(15.5px,1.25vw,18px);line-height:1.6;color:#a1a1aa}
.cmc-vis{position:relative;min-height:280px;border-radius:24px;background:radial-gradient(120% 90% at 80% 0%,rgba(124,58,237,.28),transparent 60%),radial-gradient(100% 80% at 0% 100%,rgba(79,70,229,.22),transparent 60%),#0d0d10;display:grid;place-items:center;overflow:hidden;padding:28px}
.cmc-foot{margin:16px 4px 0;font-size:13px;color:#71717a}

.cmv-convert{display:grid;gap:10px;width:min(100%,340px)}
.cmv-step{display:flex;align-items:center;gap:12px;height:52px;padding:0 16px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);opacity:0;animation:cmv-in .5s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * .35s + .15s)}
.cmv-num{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.1);font-size:13px;font-weight:600}
.cmv-step-l{flex:1;font-size:15px;font-weight:500}
.cmv-tick{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#22c55e;color:#04210f;opacity:0;transform:scale(.5);animation:cmv-pop .4s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--i) * .35s + .55s)}
.cmv-never{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.cmv-never span{font-size:12.5px;color:#71717a;padding:5px 10px;border-radius:99px;border:1px dashed rgba(255,255,255,.14);text-decoration:line-through;text-decoration-color:rgba(255,255,255,.3)}
@keyframes cmv-in{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}
@keyframes cmv-pop{to{opacity:1;transform:scale(1)}}
.cmv-tap{display:grid;gap:10px;width:min(100%,320px)}
.cmv-wallet{position:relative;display:flex;align-items:center;justify-content:center;gap:4px;height:52px;border-radius:14px;font-size:17px;font-weight:600;overflow:hidden}
.cmv-apple{background:#fff;color:#000}
.cmv-google{background:#1f1f23;color:#fff;border:1px solid rgba(255,255,255,.12)}
.cmv-card{background:transparent;color:#a1a1aa;border:1px solid rgba(255,255,255,.12);font-weight:500;font-size:15px}
.cmv-ripple{position:absolute;left:50%;top:50%;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:rgba(124,58,237,.35);transform:scale(0);opacity:0;animation:cmv-ripple 2.6s ease-out infinite .6s;animation-play-state:paused}
[data-commerce-live] .cmv-ripple{animation-play-state:running}
@keyframes cmv-ripple{0%{transform:scale(0);opacity:.9}35%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}
.cmv-paid{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px;font-size:14px;color:#86efac;opacity:0;animation:cmv-in .5s ease both 1s}
.cmv-cur{display:grid;gap:12px;width:min(100%,340px)}
.cmv-cur-list{display:grid;gap:6px}
.cmv-cur-row{display:grid;grid-template-columns:48px 1fr auto;align-items:center;height:40px;padding:0 14px;border-radius:12px;background:rgba(255,255,255,.05);font-size:14px;opacity:0;animation:cmv-in .45s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * .09s)}
.cmv-code{font-size:12px;font-weight:600;color:#bca3ff;letter-spacing:.04em}
.cmv-city{color:#a1a1aa}
.cmv-cur-row b{font-weight:500;font-variant-numeric:tabular-nums;color:#fff}
.cmv-cur-note{font-size:12px;color:#71717a;text-align:center}
.cmv-rec{display:grid;gap:18px;width:min(100%,360px)}
.cmv-line{position:relative;display:grid;gap:14px;padding-left:4px}
.cmv-line::before{content:"";position:absolute;left:10px;top:12px;bottom:12px;width:1px;background:rgba(255,255,255,.14)}
.cmv-ev{position:relative;display:flex;gap:14px;align-items:flex-start;opacity:0;animation:cmv-in .5s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * .45s)}
.cmv-ev b{display:block;font-size:14.5px;font-weight:500}
.cmv-ev small{font-size:12.5px;color:#8b8b94}
.cmv-dot{position:relative;z-index:1;margin-top:4px;width:13px;height:13px;border-radius:50%;background:#18181b;border:2px solid #a78bfa}
.cmv-dot-ok{background:#22c55e;border-color:#22c55e}
.cmv-mail{display:flex;gap:12px;align-items:center;padding:12px;border-radius:16px;background:#fff;color:#18181b;opacity:0;animation:cmv-in .55s cubic-bezier(.2,.8,.2,1) both .7s}
.cmv-mail img{width:48px;height:48px;border-radius:10px;object-fit:cover}
.cmv-mail small{display:block;font-size:12px;color:#71717a}
.cmv-mail b{display:block;font-size:14px;font-weight:600}
.cmv-mail em{display:inline-block;margin-top:4px;font-style:normal;font-size:12px;font-weight:600;color:#7c3aed}

@media (max-width:899px){
  .cmc-tablist{grid-template-columns:repeat(2,1fr);gap:10px}
  .cmc-tab{padding:16px 16px 22px;border-radius:20px}
  .cmc-tab-bar{left:16px;right:16px}
  .cmc-panel{grid-template-columns:1fr;gap:24px;border-radius:24px;padding:24px}
  .cmc-vis{min-height:240px;border-radius:18px;padding:20px}
}
@media (max-width:639px){
  .cmc-f:not([data-m]){display:none}
  .cmc-f[data-far]{opacity:.45}
  .cmc-tab-s{font-size:min(5.6vw,26px);white-space:nowrap}
  .cmc-tab-l{font-size:13px}
  .cmc-cards{margin-top:-22svh}
}

/* Scroll-driven, where the browser runs it on the compositor. */
@media (prefers-reduced-motion:no-preference){
  @supports (animation-timeline:view()){
    .cmc-floats{animation:cmc-par linear both;animation-timeline:--cmc;animation-range:entry 0% exit 0%}
    .cmc-f:not([data-far]) .cmc-sharp{opacity:1;animation:cmc-fade-out linear both;animation-timeline:--cmc;animation-range:contain 4% contain 34%}
    .cmc-f:not([data-far]) .cmc-soft{opacity:0;animation:cmc-fade-in linear both;animation-timeline:--cmc;animation-range:contain 4% contain 34%}
    .cmc-phone{animation:cmc-rise linear both;animation-timeline:--cmc;animation-range:entry 55% contain 34%}
    .cmc-title{animation:cmc-copy linear both;animation-timeline:--cmc;animation-range:contain 0% contain 22%}
    .cmc-sub{animation:cmc-copy linear both;animation-timeline:--cmc;animation-range:contain 8% contain 30%}
    .cmc-sheet-in{animation:cmc-sheet-up linear both;animation-timeline:--cmc;animation-range:contain 38% contain 50%}
    .cmc-sheet{animation:cmc-sheet-down linear both;animation-timeline:--cmc;animation-range:contain 64% contain 74%}
    .cmc-sheet-ok{animation:cmc-fade-in linear both;animation-timeline:--cmc;animation-range:contain 54% contain 58%}
    .cmc-pay{animation:cmc-press linear both;animation-timeline:--cmc;animation-range:contain 32% contain 40%}
    .cmc-form{animation:cmc-fade-out linear both;animation-timeline:--cmc;animation-range:contain 66% contain 74%}
    .cmc-done{animation:cmc-done linear both;animation-timeline:--cmc;animation-range:contain 70% contain 80%}
  }
}
@keyframes cmc-par{from{transform:translate3d(0,9vh,0) scale(.96)}to{transform:translate3d(0,-9vh,0) scale(1.06)}}
@keyframes cmc-fade-out{from{opacity:1}to{opacity:0}}
@keyframes cmc-fade-in{from{opacity:0}to{opacity:1}}
@keyframes cmc-rise{from{transform:translate3d(0,62svh,0) scale(.92)}to{transform:none}}
@keyframes cmc-copy{from{opacity:0;transform:translate3d(0,36px,0)}to{opacity:1;transform:none}}
@keyframes cmc-sheet-up{from{transform:translate3d(0,105%,0)}to{transform:translate3d(0,0,0)}}
@keyframes cmc-sheet-down{from{transform:none}to{transform:translate3d(0,105%,0)}}
@keyframes cmc-press{0%,100%{transform:none}50%{transform:scale(.95)}}
@keyframes cmc-done{from{opacity:0;transform:translate3d(0,.8em,0) scale(.98)}to{opacity:1;transform:none}}

/* The same scene from one custom property, for browsers without scroll timelines. */
[data-cmc-js] .cmc-track{--a:clamp(0,calc((var(--cmc-p) + .3) / .64),1);--h:clamp(0,calc(var(--cmc-p) / .22),1);--s:clamp(0,calc((var(--cmc-p) - .08) / .22),1);--f:clamp(0,calc((var(--cmc-p) - .04) / .3),1);--u:clamp(0,calc((var(--cmc-p) - .38) / .12),1);--k:clamp(0,calc((var(--cmc-p) - .54) / .04),1);--o:clamp(0,calc((var(--cmc-p) - .64) / .1),1);--x:clamp(0,calc((var(--cmc-p) - .66) / .08),1);--dn:clamp(0,calc((var(--cmc-p) - .7) / .1),1)}
[data-cmc-js] .cmc-phone{transform:translate3d(0,calc((1 - var(--a)) * 62svh),0) scale(calc(.92 + var(--a) * .08))}
[data-cmc-js] .cmc-title{opacity:var(--h);transform:translate3d(0,calc((1 - var(--h)) * 36px),0)}
[data-cmc-js] .cmc-sub{opacity:var(--s);transform:translate3d(0,calc((1 - var(--s)) * 36px),0)}
[data-cmc-js] .cmc-f:not([data-far]) .cmc-sharp{opacity:calc(1 - var(--f))}
[data-cmc-js] .cmc-f:not([data-far]) .cmc-soft{opacity:var(--f)}
[data-cmc-js] .cmc-floats{transform:translate3d(0,calc(9vh - var(--cmc-p) * 14vh),0)}
[data-cmc-js] .cmc-sheet-in{transform:translate3d(0,calc((1 - var(--u)) * 105%),0)}
[data-cmc-js] .cmc-sheet-ok{opacity:var(--k)}
[data-cmc-js] .cmc-sheet{transform:translate3d(0,calc(var(--o) * 105%),0)}
[data-cmc-js] .cmc-form{opacity:calc(1 - var(--x))}
[data-cmc-js] .cmc-done{opacity:var(--dn);transform:translate3d(0,calc((1 - var(--dn)) * .8em),0)}

/* Still: the finished scene, nothing pinned or moving. */
@media (prefers-reduced-motion:reduce){
  .cmc-track{height:auto}
  .cmc-stage{position:relative;height:auto;min-height:0;padding-bottom:30svh}
  .cmc-drift,.cmc-panel[data-on],.cmv-step,.cmv-tick,.cmv-cur-row,.cmv-ev,.cmv-mail,.cmv-paid{animation:none!important;opacity:1;transform:none}
  .cmv-ripple{display:none}
  .cmc-phone-wrap{margin-top:40px}
  .cmc-form{opacity:0}
  .cmc-done{opacity:1}
  .cmc-cards{margin-top:-24svh}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CHECKOUT_STYLES: readonly SectionStyle[] = [COMMERCE_KIT_STYLE, { href: "w12-commerce-checkout", precedence: "default", css: CHECKOUT_CSS }]
