"use client"

/*
  HOME SECTION 11: ANALYTICS. (wave 13: light, simpler)

  Faithful to Storelib Analytics (app/(storelib)/app/analytics): the four
  figures are the page's own four, in its order and with its words
  (Visitors, Total Revenue, Total Orders, Conversion Rate, each against the
  period before, lib/i18n/translations.ts), above the chart of the one
  chosen. Under them three of its real cards with their real tabs: Traffic
  sources (Source, Social, Campaign), Countries (Visitors, Orders) and
  Devices (Device, Browser). Nothing Storelib does not report: no age, no
  gender, no cities. The live count is Home's ("live": visitors in the last
  five minutes), and the globe's toasts name countries, the finest place
  Storelib keeps.

  The globe (platform-globe.tsx) turns only while the section is on screen.
  Bars grow once; the Countries card flips between its two tabs while the
  section is watched, the way a seller would.
*/

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { SiInstagram, SiTiktok, SiYoutube } from "@/components/icons/brand-icons.generated"
import { PlatformGlobe } from "./platform-globe"
import { PlatformCount, usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./analytics-showcase.module.css"

const count = (n: number) => Math.round(n).toLocaleString("en-US")
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`
const rate = (n: number) => `${n.toFixed(2)}%`

/** The country each globe spot is in (same order as PLATFORM_GLOBE_SPOTS). */
const SPOT_COUNTRY: Array<[string, string]> = [
  ["US", "the United States"], ["US", "the United States"], ["US", "the United States"], ["CA", "Canada"], ["CA", "Canada"], ["MX", "Mexico"],
  ["BR", "Brazil"], ["AR", "Argentina"], ["CO", "Colombia"], ["GB", "the United Kingdom"], ["IE", "Ireland"], ["FR", "France"],
  ["DE", "Germany"], ["PT", "Portugal"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "the Netherlands"], ["SE", "Sweden"],
  ["PL", "Poland"], ["NG", "Nigeria"], ["KE", "Kenya"], ["ZA", "South Africa"], ["AE", "the United Arab Emirates"], ["IN", "India"],
  ["SG", "Singapore"], ["JP", "Japan"], ["KR", "South Korea"], ["AU", "Australia"], ["AU", "Australia"], ["NZ", "New Zealand"],
]
const VIA = ["Instagram", "YouTube", "Google", "TikTok", "Direct", "Newsletter"]
const PAGES = ["your OnePage", "Ridge hoodie", "the shop", "Trail map pack", "LUT pack"]

/* ── The four figures and the chart ──────────────────────────────────── */
const KPIS = [
  { label: "Visitors", value: 48210, change: 18, format: count },
  { label: "Total Revenue", value: 18420, change: 27, format: money },
  { label: "Total Orders", value: 612, change: 21, format: count },
  { label: "Conversion Rate", value: 1.27, change: 4, format: rate },
]
/* Thirty days of visitors, a restock email in the middle. */
const SERIES = [980, 1040, 1010, 1120, 1260, 1190, 1080, 1150, 1230, 1310, 1290, 1420, 1380, 1460, 2310, 2140, 1820, 1690, 1620, 1710, 1660, 1790, 1830, 1760, 1880, 1940, 1870, 2010, 2160, 2240]
const PREV = [860, 900, 920, 880, 990, 1010, 940, 970, 1030, 1080, 1010, 1100, 1050, 1120, 1160, 1090, 1180, 1140, 1210, 1170, 1230, 1260, 1190, 1280, 1310, 1270, 1340, 1300, 1380, 1410]

function linePath(values: number[], w: number, h: number, max: number) {
  return values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - (v / max) * h * 0.84 - 6).toFixed(1)}`).join(" ")
}

function Trend() {
  const W = 600
  const H = 160
  const max = Math.max(...SERIES)
  const d = linePath(SERIES, W, H, max)
  return (
    <div className="relative px-4 pb-4 pt-5 sm:px-5" aria-hidden="true">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-[130px] w-full sm:h-[160px]" preserveAspectRatio="none">
          <defs>
            <linearGradient id="platform-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7c3aed" stopOpacity="0.16" />
              <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1="0" x2={W} y1={H * g - 0.5} y2={H * g - 0.5} stroke="#eef0f2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={linePath(PREV, W, H, max)} fill="none" stroke="#c4c7cf" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#platform-trend-fill)" />
          <path d={d} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className={`${s.cover} absolute inset-0 bg-white`} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-[#9ca3af]">
        <span>Oct 14</span>
        <span>Oct 28</span>
        <span>Nov 12</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[#6b7280]">
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-3.5 rounded-full bg-[#7c3aed]" />
          Oct 14 to Nov 12
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-[1.5px] border-dashed border-[#b6b9c2]" />
          Previous period
        </span>
      </div>
    </div>
  )
}

function Dashboard({ seen }: { seen: boolean }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_24px_48px_-28px_rgba(30,20,60,0.3)]">
      <div className="flex items-center justify-between border-b border-[#eef0f2] px-4 py-3 sm:px-5">
        <span className="text-[15px] font-semibold text-[#1a1a2e]">Analytics</span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e2e4e8] px-3 text-[12.5px] font-medium text-[#1a1a2e]" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#6b7280]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3.5" y="5" width="17" height="15" rx="2" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
          Last 30 days
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {KPIS.map((k, i) => (
          <div key={k.label} className={`relative px-4 py-3.5 sm:px-5 ${i % 2 ? "border-l border-[#eef0f2]" : ""} ${i > 1 ? "border-t border-[#eef0f2] md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
            <div className="truncate text-[12px] text-[#6b7280] sm:text-[12.5px]">{k.label}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[clamp(19px,1.9vw,24px)] font-semibold leading-none tracking-[-0.03em] text-[#1a1a2e]">
                <PlatformCount value={k.value} start={seen} format={k.format} duration={1500 + i * 150} />
              </span>
              <span className="text-[11.5px] font-medium text-[#15803d]">+{k.change}%</span>
            </div>
            {i === 0 ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#1a1a2e]" /> : null}
          </div>
        ))}
      </div>
      <div className="border-t border-[#eef0f2]">
        <Trend />
      </div>
    </div>
  )
}

/* ── Breakdown cards ─────────────────────────────────────────────────── */
type Row = { key: string; label: string; value: number; lead?: ReactNode }

function Tabs({ options, value }: { options: string[]; value: number }) {
  return (
    <div className="flex rounded-lg bg-[#f3f4f6] p-0.5 text-[11.5px] font-medium">
      {options.map((o, i) => (
        <span key={o} className={`whitespace-nowrap rounded-md px-2 py-1 transition-colors duration-300 ${i === value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280]"}`}>
          {o}
        </span>
      ))}
    </div>
  )
}

function Rows({ rows, format = count }: { rows: Row[]; format?: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value))
  return (
    <ul className="mt-4 space-y-1">
      {rows.map((r, i) => (
        <li key={r.key} className="relative flex h-9 items-center gap-2.5 px-2.5 text-[13px]">
          <span className={`${s.bar} absolute inset-y-0 left-0 w-full rounded-lg bg-[#7c3aed]/[0.08]`} style={{ "--w": (r.value / max).toFixed(3), "--r": i } as CSSProperties} aria-hidden="true" />
          {r.lead ? <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">{r.lead}</span> : null}
          <span className="relative min-w-0 flex-1 truncate text-[#1a1a2e]">{r.label}</span>
          <span className="relative shrink-0 text-right font-medium tabular-nums text-[#1a1a2e]">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

function Card({ title, tabs, index, children }: { title: string; tabs?: ReactNode; index: number; children: ReactNode }) {
  return (
    <article className={`${s.card} ${m.reveal} flex min-w-0 flex-col p-4 sm:p-5`} style={{ "--i": index } as CSSProperties}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="whitespace-nowrap text-[14.5px] font-semibold text-[#1a1a2e]">{title}</h3>
        {tabs}
      </div>
      {children}
    </article>
  )
}

const iconClass = "h-[15px] w-[15px]"
const Dot = ({ c }: { c: string }) => <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
const SOURCES: Row[] = [
  { key: "ig", label: "Instagram", value: 14380, lead: <SiInstagram className={iconClass} color="#E4405F" /> },
  { key: "yt", label: "YouTube", value: 11240, lead: <SiYoutube className={iconClass} color="#FF0000" /> },
  { key: "gg", label: "Google", value: 8960, lead: <Dot c="#4285F4" /> },
  { key: "dr", label: "Direct", value: 7120, lead: <Dot c="#9ca3af" /> },
  { key: "tt", label: "TikTok", value: 4310, lead: <SiTiktok className={iconClass} color="#111111" /> },
]

const flag = (code: string) => (
  /* eslint-disable-next-line @next/next/no-img-element */
  <img src={`/flags/${code}.svg`} alt="" width={18} height={13} loading="lazy" decoding="async" className="h-[13px] w-[18px] rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" />
)
const COUNTRIES: Array<{ code: string; name: string; visitors: number; orders: number }> = [
  { code: "US", name: "United States", visitors: 17820, orders: 241 },
  { code: "GB", name: "United Kingdom", visitors: 6310, orders: 88 },
  { code: "DE", name: "Germany", visitors: 4940, orders: 71 },
  { code: "CA", name: "Canada", visitors: 3280, orders: 46 },
  { code: "AU", name: "Australia", visitors: 2610, orders: 39 },
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

const DEVICES: Row[] = [
  { key: "m", label: "Mobile", value: 36640 },
  { key: "d", label: "Desktop", value: 10120 },
  { key: "t", label: "Tablet", value: 1450 },
]

function Devices({ index }: { index: number }) {
  const total = DEVICES.reduce((t, d) => t + d.value, 0)
  return (
    <Card title="Devices" index={index} tabs={<Tabs options={["Device", "Browser"]} value={0} />}>
      <Rows rows={DEVICES} />
      <div className="mt-auto flex h-2 gap-1 overflow-hidden rounded-full pt-0" aria-hidden="true">
        {DEVICES.map((d, i) => (
          <span key={d.key} className={`${s.seg} h-full rounded-full`} style={{ width: `${(d.value / total) * 100}%`, background: ["#7c3aed", "#a78bfa", "#ddd6fe"][i], "--r": i } as CSSProperties} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] text-[#6b7280]">
        {DEVICES.map((d) => (
          <span key={d.key}>
            {d.label} <span className="font-medium text-[#1a1a2e]">{Math.round((d.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
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
    if (now - lastAt.current < 2800) return
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
    <div className="relative mx-auto w-full max-w-[520px] pb-14 sm:pb-16">
      <div className={s.globeBox}>
        <PlatformGlobe running={live && seen} reduced={reduced} onPulse={onPulse} />
      </div>
      <div className="absolute left-0 top-0 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_2px_6px_-2px_rgba(16,24,40,0.1)]">
        <span className={`${s.liveDot} ${m.loop} h-2 w-2 rounded-full bg-[#22c55e]`} />
        <span className="tabular-nums text-[#1a1a2e]">{liveCount}</span>
        <span className="text-[#6b7280]">live</span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid justify-items-center" aria-hidden="true">
        {slots.map((t, i) => (
          <div key={i} data-on={String(on === i)} className={`${s.tick} col-start-1 row-start-1 flex max-w-[94%] items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_16px_32px_-16px_rgba(30,20,60,0.35)]`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/flags/${t.code}.svg`} alt="" width={22} height={16} loading="lazy" decoding="async" className="h-4 w-[22px] shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" />
            <span className="min-w-0 text-[12.5px] leading-[1.35]">
              <span className="block truncate font-medium text-[#1a1a2e]">A visitor from {t.country}</span>
              <span className="block truncate text-[#6b7280]">
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
      className={`${m.root} bg-white px-[var(--landing-gutter,22px)] py-[clamp(72px,9vw,128px)] text-[#0f0e13]`}
    >
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10 max-w-[920px] sm:mb-14">
          <StoryHeading id="analytics-showcase-title" text="Know what's working, as it happens." accent={["as", "it", "happens"]} />
          <p className="mt-5 max-w-[56ch] text-[clamp(16px,1.4vw,19px)] leading-[1.6] text-[#55525e]">
            Every visit, tap and sale on your OnePage, website and store, counted by Storelib. No setup, no extra app.
          </p>
        </div>

        <div className={`${s.stage} ${m.reveal} grid items-center gap-6 p-4 sm:p-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10 lg:p-10`}>
          <GlobeStage live={live} seen={seen} reduced={reduced} />
          <Dashboard seen={seen} />
        </div>

        <div className={`${s.cards} mt-4`}>
          <Card title="Traffic sources" index={1} tabs={<Tabs options={["Source", "Social", "Campaign"]} value={0} />}>
            <Rows rows={SOURCES} />
          </Card>
          <Countries live={live} index={2} />
          <Devices index={3} />
        </div>
      </div>
    </section>
  )
}
