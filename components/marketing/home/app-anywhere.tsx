"use client"

/*
  HOME SECTION 15: RUN YOUR BUSINESS FROM ANYWHERE.

  A photograph (Unsplash, free licence, photo-1529653762956: a hand holding
  a phone, its screen painted out and the frame cropped to the phone, kept
  as two .webp files in public/home/platform) with Storelib's Home drawn into
  the glass: the violet Try Pro strip, the greeting, the live count and the
  period, the four figures and the chart (components/app/dashboard-client),
  and the floating tab bar's Home, Orders, Products and Analytics
  (components/app/sidebar-mobile-nav). A sale arrives the way the app
  announces one ("You sold … for …", lib/notify/templates/catalog.ts).

  The App Store badge links where the footer's does: NEXT_PUBLIC_IOS_APP_STORE_ID
  (apps.apple.com/app/id…) or a full NEXT_PUBLIC_IOS_APP_STORE_URL, else
  the section itself until it is set, as the footer does. Google Play is not live: its badge is greyed, says Coming
  soon, and is not a link.
*/

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { SiApple } from "@/components/icons/brand-icons.generated"
import { STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"
import { PlatformCount, usePlatformSection } from "./platform-motion"
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

const SALES = [
  { product: "Glaze sampler set", total: "$48.00" },
  { product: "Studio class, Saturday", total: "$65.00" },
  { product: "Moss green mug", total: "$36.00" },
]

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
      <span className={`${s.badge} inline-flex h-[46px] items-center gap-2 rounded-[10px] bg-black pl-3 pr-3.5 sm:h-[54px] sm:gap-2.5 sm:rounded-[12px] sm:pl-3.5 sm:pr-4 text-white opacity-40 ring-1 ring-[#a6a6a6] grayscale`} aria-hidden="true">
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
      <span className="absolute -right-2 -top-2.5 rounded-full bg-[#18181b] px-2 py-[3px] text-[10.5px] font-semibold text-white ring-2 ring-white">Coming soon</span>
    </span>
  )
}

/* ── The phone's screen ──────────────────────────────────────────────── */
function StatusBar() {
  return (
    <div className="relative flex h-[4.4em] items-center justify-between px-[2.4em] pt-[0.6em] text-[1.45em] font-semibold">
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-[0.35em]" aria-hidden="true">
        <svg viewBox="0 0 18 12" className="h-[0.75em] w-[1.15em]" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg viewBox="0 0 16 12" className="h-[0.75em] w-[1.05em]" fill="currentColor">
          <path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 0 0 8 .3 10.6 10.6 0 0 0 .5 3.4l1.3 1.3A8.7 8.7 0 0 1 8 2.2Zm0 3.7c1.4 0 2.7.5 3.6 1.4l1.3-1.3A7 7 0 0 0 8 4a7 7 0 0 0-4.9 2l1.3 1.3c.9-.9 2.2-1.4 3.6-1.4Zm0 3.7c.5 0 1 .2 1.3.5L8 11.5 6.7 10.1c.3-.3.8-.5 1.3-.5Z" />
        </svg>
        <span className="relative ml-[0.1em] h-[0.8em] w-[1.7em] rounded-[0.25em] border border-current p-[0.1em] opacity-90">
          <span className="block h-full w-[78%] rounded-[0.12em] bg-current" />
        </span>
      </span>
    </div>
  )
}

const CHART = [32, 38, 35, 44, 41, 52, 49, 58, 55, 63, 60, 71, 68, 79]

function Screen({ seen, live, reduced }: { seen: boolean; live: boolean; reduced: boolean }) {
  const [sale, setSale] = useState(-1)
  const [revenue, setRevenue] = useState(2184)
  const [visitors, setVisitors] = useState(7)
  /* A sale every few seconds while watched: the notification, then the figure moves. */
  useEffect(() => {
    if (!live || reduced) return
    const timers: number[] = []
    let k = 0
    const next = () => {
      const i = k % SALES.length
      k += 1
      setSale(i)
      timers.push(window.setTimeout(() => setRevenue((r) => r + parseFloat(SALES[i].total.slice(1))), 900))
      timers.push(window.setTimeout(() => setVisitors((v) => (v >= 11 ? 6 : v + 1)), 1300))
      timers.push(window.setTimeout(() => setSale(-1), 3800))
      timers.push(window.setTimeout(next, 6200))
    }
    timers.push(window.setTimeout(next, 1400))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [live, reduced])

  const max = Math.max(...CHART)
  const path = CHART.map((v, i) => `${i ? "L" : "M"}${((i / (CHART.length - 1)) * 300).toFixed(1)} ${(80 - (v / max) * 70).toFixed(1)}`).join(" ")
  const shown = sale >= 0 ? SALES[sale] : SALES[0]

  return (
    <div className={s.ui} aria-hidden="true">
      {/* The notch is the phone's own: above everything the app draws. */}
      <span className="absolute left-1/2 top-0 z-10 h-[2.1em] w-[14.4em] -translate-x-1/2 rounded-b-[1.4em] bg-black" />
      <div className="bg-[#8b5cf6] text-white">
        <StatusBar />
        <div className="flex h-[3em] items-center justify-center gap-[0.6em] text-[1.2em]">
          <span className="font-semibold">Try Pro</span>
          <span className="rounded-full bg-white/20 px-[0.7em] py-[0.15em] text-[0.9em] font-semibold">Upgrade</span>
        </div>
      </div>

      <div className="px-[1.6em] pt-[1.6em]">
        <div className="flex justify-end">
          <span className="flex max-w-[60%] items-center gap-[0.5em] truncate rounded-full bg-[#eceef1] px-[0.9em] py-[0.45em] text-[1.1em] font-medium text-[#4b5060]">
            <span className="h-[0.9em] w-[0.9em] shrink-0 rounded-full bg-[#8b5cf6]" />
            storelib.com/mayalin
          </span>
        </div>
        <div className="mt-[0.8em] text-[2.2em] font-semibold tracking-[-0.03em]">Good morning, Maya</div>
        <div className="mt-[0.2em] text-[1.3em] text-[#6b7280]">Here&apos;s what&apos;s happening with your store</div>
        <div className="mt-[1.2em] flex items-center gap-[0.8em]">
          <span className="flex h-[3.4em] items-center gap-[0.6em] rounded-[1.1em] bg-[#f3f4f6] px-[1.1em] text-[1.15em] font-medium text-emerald-600">
            <span className="h-[0.75em] w-[0.75em] rounded-full bg-emerald-500 shadow-[0_0_0.5em_rgba(16,185,129,0.6)]" />
            <span className="tabular-nums">{visitors}</span> live
          </span>
          <span className="flex h-[3.4em] items-center gap-[0.5em] rounded-[1.1em] border border-[#e5e7eb] bg-white px-[1.1em] text-[1.15em] font-medium">
            Last 7 days
            <svg viewBox="0 0 12 12" className="h-[0.8em] w-[0.8em]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m3 4.5 3 3 3-3" />
            </svg>
          </span>
        </div>

        <div className="mt-[1.8em] overflow-hidden rounded-[1.6em] border border-[#e5e7eb]/70 bg-white shadow-[0_0.1em_0.3em_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-[1fr_1fr_0.45fr] divide-x divide-[#e5e7eb]/70">
            <div className="bg-[#faf9ff] px-[1.3em] py-[1.2em] shadow-[inset_0_-0.2em_0_#8b5cf6]">
              <div className="text-[1.1em] font-medium text-[#6b7280]">Visitors</div>
              <div className="mt-[0.2em] text-[2.2em] font-semibold tracking-[-0.03em]">3.2K</div>
              <div className="mt-[0.2em] text-[1em] text-[#6b7280]">
                <span className="font-semibold text-emerald-600">↑ 12%</span> · 8.9K views
              </div>
            </div>
            <div className="px-[1.3em] py-[1.2em]">
              <div className="text-[1.1em] font-medium text-[#6b7280]">Revenue</div>
              <div className="mt-[0.2em] text-[2.2em] font-semibold tracking-[-0.03em]">
                <PlatformCount value={revenue} from={1600} start={seen} format={(n) => `$${Math.round(n).toLocaleString("en-US")}`} duration={900} />
              </div>
              <div className="mt-[0.2em] text-[1em] text-[#6b7280]">
                <span className="font-semibold text-emerald-600">↑ 24%</span>
              </div>
            </div>
            <div className="px-[1.1em] py-[1.2em]">
              <div className="text-[1.1em] font-medium text-[#6b7280]">Orders</div>
              <div className="mt-[0.2em] text-[2.2em] font-semibold tracking-[-0.03em]">41</div>
            </div>
          </div>
          <div className="relative border-t border-[#e5e7eb]/70 px-[1em] py-[1.2em]">
            <svg viewBox="0 0 300 84" className="block h-[9em] w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="platform-app-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.22" />
                  <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${path} L300 84 L0 84 Z`} fill="url(#platform-app-fill)" />
              <path d={path} fill="none" stroke="#8b5cf6" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            <div className={`${s.cover} absolute inset-y-0 right-0 w-full bg-white`} />
          </div>
        </div>

        <div className="mt-[1.6em] rounded-[1.6em] border border-[#e5e7eb]/70 bg-white px-[1.4em] py-[1.2em]">
          <div className="text-[1.15em] font-medium text-[#6b7280]">Top products</div>
          {[
            { name: "Glaze sampler set", sold: "14 sold", total: "$672", tint: "linear-gradient(140deg,#5d7c74,#3f5b54)" },
            { name: "Moss green mug", sold: "11 sold", total: "$396", tint: "linear-gradient(140deg,#c8693f,#9e4d2b)" },
          ].map((p) => (
            <div key={p.name} className="mt-[1em] flex items-center gap-[1em]">
              <span className="h-[3.4em] w-[3.4em] shrink-0 rounded-[0.9em]" style={{ background: p.tint }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1.25em] font-medium">{p.name}</span>
                <span className="block text-[1.05em] text-[#6b7280]">{p.sold}</span>
              </span>
              <span className="text-[1.25em] font-semibold tabular-nums">{p.total}</span>
            </div>
          ))}
        </div>

        <div className="mt-[1.4em] overflow-hidden rounded-[1.6em] border border-[#e5e7eb]/70 bg-white">
          {[
            { k: "Orders to ship", v: "2", dot: "#f59e0b" },
            { k: "New messages", v: "3", dot: "#8b5cf6" },
          ].map((r) => (
            <div key={r.k} className="flex items-center gap-[0.9em] border-b border-[#f0f0f2] px-[1.4em] py-[1.2em] text-[1.25em] last:border-b-0">
              <span className="h-[0.6em] w-[0.6em] rounded-full" style={{ background: r.dot }} />
              <span className="flex-1 font-medium">{r.k}</span>
              <span className="rounded-full bg-[#f3f4f6] px-[0.6em] text-[0.95em] font-semibold tabular-nums">{r.v}</span>
              <svg viewBox="0 0 12 12" className="h-[0.8em] w-[0.8em] text-[#9ca3af]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m4.5 3 3 3-3 3" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* The floating tab bar */}
      <div className="absolute inset-x-[1.6em] bottom-[1.4em] flex h-[5.4em] items-center justify-around rounded-full bg-white/95 px-[0.6em] shadow-[0_0.6em_2em_-0.4em_rgba(16,24,40,0.25),0_0_0_1px_rgba(0,0,0,0.04)]">
        {[
          { label: "Home", d: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" },
          { label: "Orders", d: "M6 2h12l2 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm-2 5h16M9 11a3 3 0 0 0 6 0" },
          { label: "Products", d: "M21 8 12 3 3 8v8l9 5 9-5Zm-18 0 9 5 9-5m-9 5v8" },
          { label: "Analytics", d: "M4 20V10m6 10V4m6 16v-7m6 7H2" },
        ].map((t, i) => (
          <span key={t.label} className={`flex flex-col items-center gap-[0.2em] rounded-full px-[1.1em] py-[0.5em] ${i === 0 ? "bg-[#f1ecff] text-[#7c3aed]" : "text-[#6b7280]"}`}>
            <svg viewBox="0 0 24 24" className="h-[2em] w-[2em]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.d} />
            </svg>
            <span className="text-[0.95em] font-medium">{t.label}</span>
          </span>
        ))}
      </div>

      {/* A sale, as the app announces it */}
      <div data-on={String(sale >= 0)} className={`${s.push} flex items-center gap-[1em] p-[1.1em] pr-[1.4em]`}>
        <span className="flex h-[3.6em] w-[3.6em] shrink-0 items-center justify-center rounded-[0.9em] bg-[#8b5cf6] text-white">
          <svg viewBox="0 0 200 200" className="h-[2.2em] w-[2.2em]">
            <path d={STORELIB_S_PATH} transform={STORELIB_S_TRANSFORM} fill="currentColor" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between text-[1.15em]">
            <span className="font-semibold">Storelib</span>
            <span className="text-[#8a8f98]">now</span>
          </span>
          <span className="block truncate text-[1.25em] text-[#1a1a2e]">
            You sold {shown.product} for {shown.total}
          </span>
        </span>
      </div>
    </div>
  )
}

const POINTS = [
  { title: "A ping for every sale", body: "A notification the moment something sells, with what it was and for how much." },
  { title: "Orders, products and numbers", body: "Ship orders, edit products and check your figures from the same tabs as on the web." },
  { title: "Your community, in your pocket", body: "Post, reply and welcome new members wherever you are." },
]

export function AppAnywhere() {
  const ref = useRef<HTMLElement>(null)
  const { seen, live, reduced } = usePlatformSection(ref)
  return (
    <section
      ref={ref}
      id="app-anywhere"
      aria-labelledby="app-anywhere-title"
      className={`${m.root} bg-white px-[var(--landing-gutter,22px)] py-[clamp(72px,9vw,128px)] text-[#18181b]`}
    >
      <div className="mx-auto grid max-w-[1400px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-20">
        <div className="min-w-0">
          <StoryHeading id="app-anywhere-title" text="Run your business from anywhere" accent={["anywhere"]} />
          <p className="mt-5 max-w-[52ch] text-[clamp(16px,1.4vw,19px)] leading-[1.6] text-[#5f5d66]">
            The Storelib app puts your sales, orders and visitors on your phone, so you can step away from the desk without stepping away from the business.
          </p>
          <ul className="mt-9 space-y-5">
            {POINTS.map((p, i) => (
              <li key={p.title} className={`${m.reveal} flex gap-4`} style={{ "--i": i + 1 } as CSSProperties}>
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3efff] text-[#7c3aed]">
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                </span>
                <span>
                  <span className="block text-[17px] font-medium tracking-[-0.01em]">{p.title}</span>
                  <span className="mt-1 block text-[15px] leading-[1.55] text-[#5f5d66]">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className={`${m.reveal} mt-10 flex flex-wrap items-center gap-3 sm:gap-4`} style={{ "--i": 4 } as CSSProperties}>
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>
        </div>

        <div className={`${m.reveal} relative mx-auto w-full max-w-[600px]`} style={{ "--i": 1 } as CSSProperties}>
          <div className={s.photo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/home/platform/hands-phone-640.webp"
              srcSet="/home/platform/hands-phone-640.webp 640w, /home/platform/hands-phone-1200.webp 1200w"
              sizes="(min-width: 1024px) 600px, calc(100vw - 44px)"
              width={1200}
              height={1499}
              alt="A hand holding a phone showing the Storelib app's Home screen"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className={s.screen}>
              <Screen seen={seen} live={live} reduced={reduced} />
            </div>
          </div>
          <div className={`${s.float} ${m.loop} absolute -left-3 bottom-[12%] hidden rounded-2xl bg-white p-3.5 pr-5 shadow-[0_24px_50px_-20px_rgba(24,16,48,0.45),0_0_0_1px_rgba(24,16,48,0.05)] sm:block lg:-left-10`}>
            <div className="text-[12px] font-medium text-[#6b6874]">Today</div>
            <div className="mt-0.5 text-[22px] font-medium tracking-[-0.03em]">
              <PlatformCount value={412} start={seen} format={(n) => `$${Math.round(n)}`} />
            </div>
            <div className="mt-0.5 text-[12px] text-emerald-600">9 orders · 3 countries</div>
          </div>
        </div>
      </div>
    </section>
  )
}
