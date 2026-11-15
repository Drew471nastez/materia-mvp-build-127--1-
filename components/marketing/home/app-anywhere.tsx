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

  Round 4, the owner: no purple ground. It opens the page's dark close now
  (the near-black that runs on into the footer), drawn for dark itself: the
  photograph first and large, in a thin light edge; beside it the heading,
  the line, the three points between faint hairlines and the badges. No
  card: on dark the only surface is the photograph.
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
      <span className="absolute -right-2.5 -top-2.5 rounded-full bg-white px-2 py-[3px] text-[10.5px] font-semibold leading-none text-[#18181b]">Coming soon</span>
    </span>
  )
}

const POINTS = ["A ping for every sale", "Orders, products and numbers", "Your community, in your pocket"]

export function AppAnywhere() {
  const ref = useRef<HTMLElement>(null)
  usePlatformSection(ref)
  return (
    <section
      ref={ref}
      id="app-anywhere"
      aria-labelledby="app-anywhere-title"
      className={`${m.root} ${s.section} px-[var(--landing-gutter,22px)] py-[var(--home-pad,clamp(72px,9vw,128px))]`}
    >
      <div className="mx-auto grid max-w-[1400px] items-center gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-20">
        <div className={`${m.reveal} ${s.photo} lg:order-first`} style={{ "--i": 1 } as CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/home/app/storelib-app-720.webp"
            srcSet="/home/app/storelib-app-720.webp 720w, /home/app/storelib-app-1280.webp 1280w"
            sizes="(min-width: 1400px) 760px, (min-width: 1024px) 54vw, calc(100vw - 44px)"
            width={1280}
            height={960}
            alt="The Storelib app's Home on a phone: visitors, revenue, orders and the week's chart"
            loading="lazy"
            decoding="async"
            className={s.img}
          />
        </div>

        <div className="min-w-0 order-first lg:order-none">
          <StoryHeading id="app-anywhere-title" text="Run your business from anywhere" accent={["anywhere"]} dark />
          <p className={`mt-5 max-w-[44ch] ${s.lede}`}>Your sales, orders and visitors on your phone, wherever you are.</p>
          <ul className={`${s.points} mt-8`}>
            {POINTS.map((title, i) => (
              <li key={title} className={`${m.reveal} ${s.point}`} style={{ "--i": i + 1 } as CSSProperties}>
                {title}
              </li>
            ))}
          </ul>
          <div className={`${m.reveal} mt-9 flex flex-wrap items-center gap-3 sm:gap-4`} style={{ "--i": 4 } as CSSProperties}>
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>
        </div>
      </div>
    </section>
  )
}
