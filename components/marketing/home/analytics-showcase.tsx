"use client"

/*
  HOME SECTION 11: ANALYTICS.

  Faithful to Storelib Analytics (app/(storelib)/app/analytics): the figures
  are the page's own (Visitors, Page views, Link clicks, Total sales, each
  against the period before), and the cards are its cards with their real
  tabs: Traffic sources (Source, Social, Campaign), Countries (Visitors,
  Orders), OnePage links (taps and people), Devices (Device, Browser) and
  Operating systems. The live count is Home's ("live": visitors in the last
  five minutes). Storelib does not track age or gender, and the Devices card
  says so rather than inventing a chart for it; cities are not a report
  either, so the globe's toasts name countries.

  The globe (platform-globe.tsx) turns only while the section is on screen.
  Bars grow once; the Countries card flips between its two tabs while the
  section is watched, the way a seller would.
*/

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { SiFacebook, SiInstagram, SiPinterest, SiTiktok, SiX, SiYoutube } from "@/components/icons/brand-icons.generated"
import { PlatformGlobe } from "./platform-globe"
import { PlatformCount, usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./analytics-showcase.module.css"

const count = (n: number) => Math.round(n).toLocaleString("en-US")
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

/** The country each globe spot is in (same order as PLATFORM_GLOBE_SPOTS). */
const SPOT_COUNTRY: Array<[string, string]> = [
  ["US", "the United States"], ["US", "the United States"], ["US", "the United States"], ["CA", "Canada"], ["CA", "Canada"], ["MX", "Mexico"],
  ["BR", "Brazil"], ["AR", "Argentina"], ["CO", "Colombia"], ["GB", "the United Kingdom"], ["IE", "Ireland"], ["FR", "France"],
  ["DE", "Germany"], ["PT", "Portugal"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "the Netherlands"], ["SE", "Sweden"],
  ["PL", "Poland"], ["NG", "Nigeria"], ["KE", "Kenya"], ["ZA", "South Africa"], ["AE", "the United Arab Emirates"], ["IN", "India"],
  ["SG", "Singapore"], ["JP", "Japan"], ["KR", "South Korea"], ["AU", "Australia"], ["AU", "Australia"], ["NZ", "New Zealand"],
]
const VIA = ["Instagram", "TikTok", "YouTube", "Google", "Direct", "X", "Pinterest", "Newsletter"]
const PAGES = ["your OnePage", "Spring glaze drop", "the shop", "Book a studio class", "Free glaze guide"]

/* ── Figures ─────────────────────────────────────────────────────────── */
const KPIS = [
  { label: "Visitors", value: 48210, change: 18, format: count },
  { label: "Page views", value: 131940, change: 22, format: count },
  { label: "Link clicks", value: 22870, change: 9, format: count },
  { label: "Total sales", value: 18420, change: 27, format: money },
]
/* Thirty days of visitors, a launch in the middle. */
const SERIES = [980, 1040, 1010, 1120, 1260, 1190, 1080, 1150, 1230, 1310, 1290, 1420, 1380, 1460, 2310, 2140, 1820, 1690, 1620, 1710, 1660, 1790, 1830, 1760, 1880, 1940, 1870, 2010, 2160, 2240]
const PREV = [860, 900, 920, 880, 990, 1010, 940, 970, 1030, 1080, 1010, 1100, 1050, 1120, 1160, 1090, 1180, 1140, 1210, 1170, 1230, 1260, 1190, 1280, 1310, 1270, 1340, 1300, 1380, 1410]

function linePath(values: number[], w: number, h: number, max: number) {
  return values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - (v / max) * h * 0.86 - 4).toFixed(1)}`).join(" ")
}

function Trend() {
  const W = 600
  const H = 150
  const max = Math.max(...SERIES)
  const d = linePath(SERIES, W, H, max)
  return (
    <div className="relative mt-4 overflow-hidden" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-[120px] w-full sm:h-[150px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="platform-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,0.06)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={linePath(PREV, W, H, max)} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
        <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#platform-trend-fill)" />
        <path d={d} fill="none" stroke="#a78bfa" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={`${s.cover} absolute inset-0 bg-[#0b0b0e]`} />
      <div className="mt-2 flex justify-between text-[11px] text-white/40">
        <span>Oct 14</span>
        <span>Oct 28</span>
        <span>Nov 12</span>
      </div>
    </div>
  )
}

/* ── Breakdown cards ─────────────────────────────────────────────────── */
type Row = { key: string; label: string; value: number; lead?: ReactNode; note?: string }

function Tabs({ options, value }: { options: string[]; value: number }) {
  return (
    <div className="flex rounded-full bg-white/[0.06] p-0.5 text-[11.5px] font-medium">
      {options.map((o, i) => (
        <span key={o} className={`whitespace-nowrap rounded-full px-2 py-1 transition-colors duration-300 ${i === value ? "bg-white/[0.12] text-white" : "text-white/50"}`}>
          {o}
        </span>
      ))}
    </div>
  )
}

function Rows({ rows }: { rows: Row[] }) {
  const max = Math.max(...rows.map((r) => r.value))
  return (
    <ul className="mt-4 space-y-1.5">
      {rows.map((r, i) => (
        <li key={r.key} className="relative flex h-9 items-center gap-2.5 px-2.5 text-[13px]">
          <span
            className={`${s.bar} absolute inset-y-0 left-0 w-full rounded-[10px] bg-[#8b5cf6]/[0.16]`}
            style={{ "--w": (r.value / max).toFixed(3), "--r": i } as CSSProperties}
            aria-hidden="true"
          />
          {r.lead ? <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">{r.lead}</span> : null}
          <span className="relative min-w-0 flex-1 truncate text-white/90">{r.label}</span>
          {r.note ? <span className="relative hidden shrink-0 text-[11.5px] text-white/40 min-[400px]:inline">{r.note}</span> : null}
          <span className="relative w-[52px] shrink-0 text-right font-medium tabular-nums text-white">{count(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

function Card({ title, tabs, index, children }: { title: string; tabs?: ReactNode; index: number; children: ReactNode }) {
  return (
    <article className={`${s.card} ${m.reveal} flex min-w-0 flex-col p-4 sm:p-5`} style={{ "--i": index } as CSSProperties}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="whitespace-nowrap text-[14px] font-medium text-white">{title}</h3>
        {tabs}
      </div>
      {children}
    </article>
  )
}

const iconClass = "h-[15px] w-[15px]"
const SOCIAL: Row[] = [
  { key: "ig", label: "Instagram", value: 9840, lead: <SiInstagram className={iconClass} color="#f472b6" /> },
  { key: "tt", label: "TikTok", value: 7215, lead: <SiTiktok className={iconClass} color="#ffffff" /> },
  { key: "yt", label: "YouTube", value: 3960, lead: <SiYoutube className={iconClass} color="#ff4e45" /> },
  { key: "x", label: "X", value: 1480, lead: <SiX className={iconClass} color="#ffffff" /> },
  { key: "pin", label: "Pinterest", value: 1120, lead: <SiPinterest className={iconClass} color="#ff5a6e" /> },
  { key: "fb", label: "Facebook", value: 860, lead: <SiFacebook className={iconClass} color="#4f8ff7" /> },
]

const flag = (code: string) => (
  /* eslint-disable-next-line @next/next/no-img-element */
  <img src={`/flags/${code}.svg`} alt="" width={18} height={13} loading="lazy" decoding="async" className="h-[13px] w-[18px] rounded-[3px] object-cover" />
)
const COUNTRIES: Array<{ code: string; name: string; visitors: number; orders: number }> = [
  { code: "US", name: "United States", visitors: 14820, orders: 212 },
  { code: "GB", name: "United Kingdom", visitors: 5310, orders: 74 },
  { code: "DE", name: "Germany", visitors: 3940, orders: 58 },
  { code: "CA", name: "Canada", visitors: 3280, orders: 51 },
  { code: "BR", name: "Brazil", visitors: 2610, orders: 33 },
  { code: "JP", name: "Japan", visitors: 1870, orders: 29 },
]

function Countries({ live, index }: { live: boolean; index: number }) {
  const [tab, setTab] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setTab((t) => 1 - t), 4200)
    return () => window.clearInterval(id)
  }, [live])
  const rows = COUNTRIES.map((c) => ({ key: c.code, label: c.name, value: tab ? c.orders : c.visitors, lead: flag(c.code) }))
  return (
    <Card title="Countries" index={index} tabs={<Tabs options={["Visitors", "Orders"]} value={tab} />}>
      <Rows rows={rows} />
    </Card>
  )
}

const LINKS: Row[] = [
  { key: "a", label: "Spring glaze drop", value: 4210 },
  { key: "b", label: "Book a studio class", value: 2640 },
  { key: "c", label: "Free glaze guide", value: 2180 },
  { key: "d", label: "Join Glaze Club", value: 1460 },
  { key: "e", label: "Shop all ceramics", value: 990 },
  { key: "f", label: "Watch the kiln opening", value: 640 },
]

const DEVICES = [
  { label: "Mobile", share: 76, color: "#a78bfa" },
  { label: "Desktop", share: 21, color: "#60a5fa" },
  { label: "Tablet", share: 3, color: "#f472b6" },
]
const SYSTEMS = [
  { label: "iOS", share: 48 },
  { label: "Android", share: 28 },
  { label: "Windows", share: 13 },
  { label: "macOS", share: 9 },
]

function Devices({ index }: { index: number }) {
  return (
    <Card title="Devices" index={index} tabs={<Tabs options={["Device", "Browser"]} value={0} />}>
      <div className="mt-5 flex h-3 gap-1 overflow-hidden rounded-full" aria-hidden="true">
        {DEVICES.map((d, i) => (
          <span key={d.label} className={`${s.seg} h-full rounded-full`} style={{ width: `${d.share}%`, background: d.color, "--r": i } as CSSProperties} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        {DEVICES.map((d) => (
          <li key={d.label} className="flex items-center gap-1.5 text-white/75">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            {d.label} <span className="font-medium tabular-nums text-white">{d.share}%</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 text-[12px] font-medium text-white/50">Operating systems</div>
      <ul className="mt-2 grid grid-cols-2 gap-1.5 text-[12.5px]">
        {SYSTEMS.map((o) => (
          <li key={o.label} className="flex items-center justify-between rounded-[10px] bg-white/[0.05] px-2.5 py-2 text-white/80">
            {o.label}
            <span className="font-medium tabular-nums text-white">{o.share}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-4 text-[12px] leading-[1.5] text-white/45">
        No guessed ages or genders. Storelib reports what a visit really carries: where it came from, the country and the device.
      </p>
    </Card>
  )
}

/* ── Live visitors over the globe ────────────────────────────────────── */
type Tick = { code: string; country: string; via: string; page: string }
const FIRST: Tick = { code: "PT", country: "Portugal", via: "Instagram", page: "your OnePage" }

/*
  Two toast slots, always in the page, that take turns: a new visitor fills
  the resting slot's words and swaps which one shows. Nothing is inserted,
  so the site's :has() rules never restyle the document for a toast, and
  only this component renders when one arrives.
*/
function GlobeStage({ live, seen, reduced }: { live: boolean; seen: boolean; reduced: boolean }) {
  const [slots, setSlots] = useState<[Tick, Tick]>([FIRST, FIRST])
  const [on, setOn] = useState(-1)
  const [liveCount, setLiveCount] = useState(23)
  const lastAt = useRef(0)
  const n = useRef(0)
  const onPulse = useCallback((spot: number) => {
    const now = performance.now()
    if (now - lastAt.current < 2600) return
    lastAt.current = now
    n.current += 1
    const [code, country] = SPOT_COUNTRY[spot] ?? ["US", "the United States"]
    const t: Tick = { code, country, via: VIA[n.current % VIA.length], page: PAGES[n.current % PAGES.length] }
    const slot = n.current % 2
    setSlots((prev) => (slot ? [prev[0], t] : [t, prev[1]]) as [Tick, Tick])
    setOn(slot)
    setLiveCount((c) => Math.max(17, Math.min(31, c + (n.current % 3 === 0 ? -2 : 1))))
  }, [])
  return (
    <div className="relative mx-auto w-full max-w-[600px] pb-6 lg:pb-0">
      <div className={s.globeBox}>
        <PlatformGlobe running={live && seen} reduced={reduced} onPulse={onPulse} />
      </div>
      <div className="absolute left-1 top-1 flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12.5px] font-medium sm:left-2 sm:top-2">
        <span className={`${s.liveDot} ${m.loop} h-2 w-2 rounded-full bg-[#4ade80]`} />
        <span className="tabular-nums text-[#86efac]">{liveCount}</span>
        <span className="text-white/70">live</span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-[4%] grid justify-items-center" aria-hidden="true">
        {slots.map((t, i) => (
          <div
            key={i}
            data-on={String(on === i)}
            className={`${s.tick} col-start-1 row-start-1 flex max-w-[92%] items-center gap-2.5 rounded-2xl bg-[#1a1822]/90 px-3 py-2.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] ring-1 ring-white/10`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/flags/${t.code}.svg`} alt="" width={22} height={16} loading="lazy" decoding="async" className="h-4 w-[22px] shrink-0 rounded-[3px] object-cover" />
            <span className="min-w-0 text-[12.5px] leading-[1.35]">
              <span className="block truncate font-medium text-white">A visitor from {t.country}</span>
              <span className="block truncate text-white/55">
                Opened {t.page} · via {t.via}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalyticsShowcase() {
  const ref = useRef<HTMLElement>(null)
  const { seen, live, reduced } = usePlatformSection(ref, "200px 0px")
  return (
    <section
      ref={ref}
      id="analytics-showcase"
      aria-labelledby="analytics-showcase-title"
      className={`${m.root} bg-black px-[var(--landing-gutter,22px)] py-[clamp(72px,9vw,128px)] text-white`}
    >
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10 max-w-[920px] sm:mb-14">
          <StoryHeading id="analytics-showcase-title" text="Know what's working, as it happens." accent={["as", "it", "happens"]} dark />
          <p className="mt-5 max-w-[60ch] text-[clamp(16px,1.4vw,19px)] leading-[1.6] text-[#a3a0ac]">
            Every visit, tap and sale across your OnePage, website and store, counted by Storelib itself. No setup, no extra app, no sampling.
          </p>
        </div>

        <div className={`${s.stage} ${m.reveal} grid items-center gap-2 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 lg:p-10`}>
          {/* The globe */}
          <GlobeStage live={live} seen={seen} reduced={reduced} />

          {/* The figures */}
          <div className="min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-white/55">Last 30 days</span>
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] text-white/60">vs previous period</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {KPIS.map((k, i) => (
                <div key={k.label} className={`rounded-[18px] px-3.5 py-3 sm:px-4 sm:py-3.5 ${i === 0 ? "bg-white/[0.09] ring-1 ring-[#a78bfa]/40" : "bg-white/[0.05]"}`}>
                  <div className="text-[12px] font-medium text-white/55">{k.label}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[clamp(22px,2.3vw,30px)] font-medium leading-none tracking-[-0.04em]">
                      <PlatformCount value={k.value} start={seen} format={k.format} duration={1600 + i * 150} />
                    </span>
                    <span className="text-[12px] font-medium text-[#4ade80]">+{k.change}%</span>
                  </div>
                </div>
              ))}
            </div>
            <Trend />
          </div>
        </div>

        <div className={`${m.rail} mt-4`}>
          <Card title="Traffic sources" index={1} tabs={<Tabs options={["Source", "Social", "Campaign"]} value={1} />}>
            <Rows rows={SOCIAL} />
          </Card>
          <Countries live={live} index={2} />
          <Card title="OnePage links" index={3} tabs={<span className="text-[11.5px] text-white/45">Taps</span>}>
            <Rows rows={LINKS} />
          </Card>
          <Devices index={4} />
        </div>
      </div>
    </section>
  )
}
