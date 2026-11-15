"use client"

/*
  HOME SECTION 15: RUN YOUR BUSINESS FROM ANYWHERE.

  Wave 13, the owner: the visual is his own photograph of the Storelib app on
  a phone (public/home/app, two .webp sizes made from his file), shown as it
  is, rounded, at its own 4:3 shape so nothing jumps while it loads. The
  three points keep only their titles, with no check marks (the owner wants
  none on the landing page) and no description lines.

  The App Store badge links where the footer's does: NEXT_PUBLIC_IOS_APP_STORE_ID
  (apps.apple.com/app/id…) or a full NEXT_PUBLIC_IOS_APP_STORE_URL, else
  the section itself until it is set, as the footer does. Google Play is not
  live: its badge is drawn at full strength (not faded), carries a Coming
  soon label, and is not a link.

  Landing round, the owner: the line under the heading was too long, so it
  is one short sentence now, and the photo's corner is a pixel tighter.

  Round 4, the owner: no purple ground; it opened the page's dark close.

  LANDING ROUND 9, THE OWNER: the section is white and sits earlier in the
  page, on a white sheet ("the section should be white"; "as I scroll down,
  make sure the section comes in more smooth and clean"; "add a visual
  motion graphic, clean and smooth"). So:
    ground   white, drawn by the section's own classes, so it reads the
             same wherever the page puts it. The heading is in its light
             form, the badges are black on white.
    stage    one wide black card (<Stage>), always solid, so nothing blank
             or flashing arrives with the scroll: only what is inside it
             eases in, once. A phone with the app's Home stands at the
             centre of thin concentric rings; Sales, Orders, Visitors and
             Payouts drift a little along the rings, beside the phone on a
             wide screen and above and below it on a narrow one.
    the loop every five seconds something lands on the phone: an order, a
             payout, people in the store. A notice drops in at the top of
             the screen, a ring of light runs outward, and the chip it is
             about lights up. One 15 s CSS loop, transform and opacity
             only, paused off screen and in a background tab (m.loop);
             under reduced motion it stands still on the order.
    under it the three points in a row, the badges beside them.
  The owner's photograph of the app (public/home/app/storelib-app-*.webp) is
  not drawn here any more.
*/

import { useRef, type CSSProperties } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { SiApple } from "@/components/icons/brand/SiApple"
import { usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./app-anywhere.module.css"

const IOS_ID = (process.env.NEXT_PUBLIC_IOS_APP_STORE_ID || "").trim()
const IOS_URL = (process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || "").trim()
/** Same reading as the footer and lib/communities/setup-checklist appStoreUrl. */
export const PLATFORM_APP_STORE_HREF: string | null = /^\d+$/.test(IOS_ID)
  ? `https://apps.apple.com/app/id${IOS_ID}`
  : /^https:\/\//.test(IOS_URL)
    ? IOS_URL
    : null

/* ── The badges ──────────────────────────────────────────────────────── */
function AppStoreBadge() {
  const inner = (
    <>
      <SiApple className="h-[22px] w-[22px] shrink-0 sm:h-[26px] sm:w-[26px]" color="#fff" />
      <span className="flex flex-col leading-none">
        <span className="text-[9px] font-medium tracking-[0.01em] sm:text-[10px]">Download on the</span>
        <span className="mt-[3px] text-[18px] font-semibold tracking-[-0.03em] sm:text-[21px]">App Store</span>
      </span>
    </>
  )
  const cls = `${s.badge} inline-flex h-[46px] items-center gap-2 rounded-[10px] bg-black pl-3 pr-3.5 sm:h-[54px] sm:gap-2.5 sm:rounded-[12px] sm:pl-3.5 sm:pr-4 text-white ring-1 ring-[#a6a6a6]`
  return PLATFORM_APP_STORE_HREF ? (
    <a href={PLATFORM_APP_STORE_HREF} target="_blank" rel="noopener noreferrer" aria-label="Download Storelib on the App Store" className={cls}>
      {inner}
    </a>
  ) : (
    <a href="#app-anywhere" aria-label="Storelib on the App Store" className={cls}>
      {inner}
    </a>
  )
}

function GooglePlayBadge() {
  return (
    <span className="relative inline-flex flex-col items-start" aria-label="Google Play, coming soon" role="img">
      <span className={`${s.badge} inline-flex h-[46px] items-center gap-2 rounded-[10px] bg-black pl-3 pr-3.5 sm:h-[54px] sm:gap-2.5 sm:rounded-[12px] sm:pl-3.5 sm:pr-4 text-white ring-1 ring-[#a6a6a6]`} aria-hidden="true">
        <svg viewBox="0 0 24 26" className="h-[22px] w-[20px] shrink-0 sm:h-[26px] sm:w-[24px]">
          <path d="M1.2.6 13.3 12.9 1.2 25.2C.8 24.9.6 24.4.6 23.8V2c0-.6.2-1.1.6-1.4Z" fill="#00d7fe" />
          <path d="m17.3 16.9-4-4 4-4 4.7 2.7c1.3.8 1.3 2 0 2.7l-4.7 2.6Z" fill="#ffce00" />
          <path d="M17.3 16.9 13.3 12.9 1.2 25.2c.5.4 1.2.4 2 0l14.1-8.3Z" fill="#ff3a44" />
          <path d="M17.3 8.9 3.2.6C2.4.2 1.7.2 1.2.6l12.1 12.3 4-4Z" fill="#00f076" />
        </svg>
        <span className="flex flex-col leading-none">
          <span className="text-[9px] font-medium uppercase tracking-[0.04em] sm:text-[10px]">Get it on</span>
          <span className="mt-[3px] text-[17px] font-semibold tracking-[-0.02em] sm:text-[20px]">Google Play</span>
        </span>
      </span>
      <span className={`${s.soon} absolute -right-2.5 -top-2.5 rounded-full bg-white px-2 py-[3px] text-[10.5px] font-semibold leading-none text-[#18181b]`}>Coming soon</span>
    </span>
  )
}

const POINTS = ["A ping for every sale", "Orders, products and numbers", "Your community, in your pocket"]

/* ── The stage ───────────────────────────────────────────────────────── */

/** What drifts on the rings. `on` is which notice lights it (0 the order, 1 the payout, 2 the visitors). */
export const APP_CHIPS = [
  { label: "Orders", on: 0, slot: "a" },
  { label: "Sales", on: 0, slot: "b", late: true },
  { label: "Payouts", on: 1, slot: "c" },
  { label: "Visitors", on: 2, slot: "d" },
] as const

/** The notices that land on the phone, one every five seconds. */
export const APP_NOTICES = [
  { title: "New order", line: "Midnight Studio Tee, $32.00", img: "/home/app/order-tee.webp" },
  { title: "Payout sent", line: "$268.40 is on its way to your bank", img: null },
  { title: "14 people in your store", line: "Most of them came from Instagram", img: null },
] as const

/** Seconds: the whole loop, and how long after its start each notice lands. */
export const APP_LOOP_S = 15
const noticeAt = (i: number) => 0.6 + i * (APP_LOOP_S / APP_NOTICES.length)
const noticeDelay = (i: number) => `${noticeAt(i)}s`

const ORDERS = [
  { name: "Midnight Studio Tee", price: "$32.00", img: "/home/app/order-tee.webp" },
  { name: "Cine Tones LUT Pack", price: "$29.00", img: "/home/app/order-lut.webp" },
]

function Phone() {
  return (
    <div className={s.phone}>
      <div className={s.screen}>
        <div className={s.island} />
        <div className={s.appTop}>
          <span className={s.appHello}>Good afternoon</span>
          <span className={s.appRange}>Today</span>
        </div>
        <div className={s.stats}>
          <span className={s.stat}>
            <span className={s.statLabel}>Visitors</span>
            <span className={s.statValue}>318</span>
          </span>
          <span className={s.stat}>
            <span className={s.statLabel}>Sales</span>
            <span className={s.statValue}>
              $412
              <span className={`${s.plus} ${m.loop}`} style={{ animationDelay: noticeDelay(0) }}>
                +$32
              </span>
            </span>
          </span>
          <span className={s.stat}>
            <span className={s.statLabel}>Orders</span>
            <span className={s.statValue}>9</span>
          </span>
        </div>
        <svg className={s.chart} viewBox="0 0 200 74" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 62 C18 60 26 44 44 46 S70 58 86 40 S112 14 130 24 S156 40 172 20 S192 8 200 10 V74 H0 Z" fill="rgba(139,92,246,0.12)" />
          <path d="M0 62 C18 60 26 44 44 46 S70 58 86 40 S112 14 130 24 S156 40 172 20 S192 8 200 10" fill="none" stroke="#8b5cf6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className={s.orders}>
          <span className={s.ordersTitle}>Latest orders</span>
          {ORDERS.map((o) => (
            <span key={o.name} className={s.order}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.img} alt="" width={96} height={96} loading="lazy" decoding="async" className={s.orderImg} />
              <span className={s.orderName}>{o.name}</span>
              <span className={s.orderPrice}>{o.price}</span>
            </span>
          ))}
        </div>
        <div className={s.tabbar}>
          <span data-on="" />
          <span />
          <span />
          <span />
        </div>
        {APP_NOTICES.map((n, i) => (
          <div key={n.title} className={`${s.notice} ${m.loop}`} data-notice={i} style={{ animationDelay: noticeDelay(i) }}>
            {n.img ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={n.img} alt="" width={96} height={96} loading="lazy" decoding="async" className={s.noticeImg} />
            ) : (
              <span className={s.noticeMark} data-kind={i === 1 ? "payout" : "live"} />
            )}
            <span className={s.noticeText}>
              <span className={s.noticeTitle}>{n.title}</span>
              <span className={s.noticeLine}>{n.line}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stage() {
  return (
    <div className={s.card} data-app-stage="" role="img" aria-label="The Storelib app on a phone: today's visitors, sales and orders, and a new order arriving">
      <div className={`${m.reveal} ${s.rings}`} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={s.ring} data-ring={i} />
        ))}
        <span className={`${s.arc} ${m.loop}`} data-ring={1} />
        <span className={`${s.arc} ${m.loop}`} data-ring={3} />
        {APP_NOTICES.map((n, i) => (
          <span key={n.title} className={`${s.pulse} ${m.loop}`} style={{ animationDelay: noticeDelay(i) }} />
        ))}
      </div>
      <div className={`${m.reveal} ${s.orbits}`} style={{ "--i": 3 } as CSSProperties} aria-hidden="true">
        {APP_CHIPS.map((c, i) => (
          <span key={c.label} className={`${s.arm} ${m.loop}`} data-slot={c.slot}>
            <span className={`${s.turn} ${m.loop}`}>
              <span className={s.chip}>
                {c.label}
                <span className={`${s.lit} ${m.loop}`} data-first={i === 0 ? "" : undefined} style={{ animationDelay: `${noticeAt(c.on) + ("late" in c ? 0.55 : 0.25)}s` }}>
                  {c.label}
                </span>
              </span>
            </span>
          </span>
        ))}
      </div>
      <div className={`${m.reveal} ${s.phoneWrap}`} style={{ "--i": 1 } as CSSProperties} aria-hidden="true">
        <Phone />
      </div>
    </div>
  )
}

export function AppAnywhere() {
  const ref = useRef<HTMLElement>(null)
  usePlatformSection(ref)
  return (
    <section ref={ref} id="app-anywhere" aria-labelledby="app-anywhere-title" className={`${m.root} ${s.section} py-[var(--home-pad,clamp(72px,9vw,128px))]`}>
      {/* The page's one width (.home-wrap): the card's edges on the showcase cards' edges, the heading set in like the showcase's. */}
      <div className="home-wrap">
        <div className={s.head}>
          <StoryHeading id="app-anywhere-title" text="Run your business from anywhere" accent={["anywhere"]} />
          <p className={`mt-5 max-w-[56ch] ${s.lede}`}>Your sales, orders and visitors on your phone, wherever you are.</p>
        </div>

        <Stage />

        <div className={s.foot}>
          <ul className={s.points}>
            {POINTS.map((title) => (
              <li key={title} className={s.point}>
                {title}
              </li>
            ))}
          </ul>
          <div className={`${s.badges} flex flex-wrap items-center gap-3 sm:gap-4`}>
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>
        </div>
      </div>
    </section>
  )
}
