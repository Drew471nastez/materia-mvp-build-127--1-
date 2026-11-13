"use client"

/*
  HOME SECTION 11: KNOW WHAT'S WORKING, AS IT HAPPENS.

  LANDING ROUND, THE OWNER: smaller, smooth and clean. Two rows.

  1. See where your visitors are. On the left a title, one line and the
     reports Storelib Analytics really has (app/(storelib)/app/analytics:
     views and clicks, traffic sources, countries, top links, devices, sales,
     and Home's live visitors), as quiet chips. On the right a dark card with
     a dotted globe whose visits arc in to one creator (./analytics-globe,
     the engine of section 3 reused read only), her card, and the top places
     by country (Storelib keeps countries, never cities, ages or genders).
     The creator, Nora Vik, a baker who sells a sourdough course, is
     invented; her portrait is an Unsplash photograph.

  2. SEO, GEO and AEO. A search for "sourdough starter for beginners" with
     three results, hers first (example addresses), and beside it the
     engines a store is read by, Google, ChatGPT, Claude, Perplexity and
     Gemini, in their own marks (./engine-marks), taking turns in a pill.
     Every page gets its own title, description and structured data (the
     SEO panel and lib/seo/structured-data).

  Motion: the globe turns only while the section is live and in view, drawn
  off the page's thread where it can be. The switcher is one small render
  every 2.6s; the names move by transform and opacity. The live dot is a CSS
  loop. Off screen, in a background tab and under reduced motion, nothing
  runs.
*/

import { useEffect, useRef, useState, type CSSProperties, type ComponentType } from "react"
import { Activity, ArrowUpRight, Eye, Globe2, Link2, ShoppingBag, Smartphone } from "lucide-react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { AnalyticsGlobe } from "./analytics-globe"
import { ClaudeMark, GeminiMark, GoogleG, OpenAIMark, PerplexityMark } from "./engine-marks"
import { usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./analytics-showcase.module.css"

const IMG = "/home/analytics"

/** The reports, in Analytics' own words. */
const REPORTS: Array<{ label: string; Icon: ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { label: "Views and clicks", Icon: Eye },
  { label: "Traffic sources", Icon: ArrowUpRight },
  { label: "Countries", Icon: Globe2 },
  { label: "Top links", Icon: Link2 },
  { label: "Devices", Icon: Smartphone },
  { label: "Live visitors", Icon: Activity },
  { label: "Sales", Icon: ShoppingBag },
]

const PLACES = [
  { code: "US", name: "United States", visitors: "9,840" },
  { code: "GB", name: "United Kingdom", visitors: "4,120" },
  { code: "DE", name: "Germany", visitors: "3,310" },
]

function GlobeCard({ live, reduced }: { live: boolean; reduced: boolean }) {
  return (
    <div
      className={`${s.dark} ${s.globeCard}`}
      role="img"
      aria-label="A dotted globe with visits arcing in to Nora Vik, a baker who sells a sourdough course, and her top countries: the United States, the United Kingdom and Germany."
    >
      <AnalyticsGlobe live={live} reduced={reduced} className={s.globe} />
      <div className={s.live} aria-hidden="true">
        <span className={`${s.liveDot} ${m.loop}`} />
        <span className="tabular-nums text-white">23</span>
        <span className="text-[#a3a1ad]">live</span>
      </div>
      <div className={s.overlay} aria-hidden="true">
        <div className={s.profile}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${IMG}/nora.webp`} alt="" width={56} height={56} loading="lazy" decoding="async" className="h-14 w-14 rounded-full object-cover shadow-[0_0_0_3px_#fff,0_0_0_4px_rgba(16,24,40,0.08)]" />
          <div className="mt-2.5 text-[15px] font-semibold text-[#14131a]">Nora Vik</div>
          <div className="text-[12.5px] text-[#6b7280]">@noravikbakes</div>
          <div className="mt-3 grid w-full grid-cols-2 border-t border-[#eef0f2] pt-2.5 text-left">
            <div>
              <div className="text-[11px] text-[#6b7280]">Visitors</div>
              <div className="text-[15px] font-semibold tabular-nums text-[#14131a]">21,480</div>
            </div>
            <div className="border-l border-[#eef0f2] pl-3">
              <div className="text-[11px] text-[#6b7280]">Countries</div>
              <div className="text-[15px] font-semibold tabular-nums text-[#14131a]">31</div>
            </div>
          </div>
        </div>
        <div className={s.places}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13.5px] font-semibold text-[#14131a]">Top places</span>
            <span className="shrink-0 rounded-md bg-[#f1f2f4] px-1.5 py-px text-[11px] font-medium text-[#6b7280] max-sm:hidden">Last 30 days</span>
          </div>
          <ol className="mt-2.5 grid grid-cols-1 gap-2">
            {PLACES.map((p, i) => (
              <li key={p.code} className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/flags/${p.code}.svg`} alt="" width={18} height={13} loading="lazy" decoding="async" className="h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#14131a]">
                  {i + 1}. {p.name}
                </span>
                <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280] max-sm:hidden">{p.visitors}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

/* ── SEO, GEO, AEO ───────────────────────────────────────────────────── */
const RESULTS = [
  { site: "Nora Vik", initial: "N", url: "noravik.example › courses", title: "Sourdough for beginners: a 7 day starter course", body: "Feed it, wait, bake. Short videos and a printable schedule.", img: "sourdough-loaf.webp" },
  { site: "The Crumb Journal", initial: "C", url: "crumbjournal.example › starter", title: "How to make a sourdough starter at home", body: "Flour, water and a week of patience, step by step.", img: "sourdough-crumb.webp" },
  { site: "Field Bakery", initial: "F", url: "fieldbakery.example › guides", title: "Sourdough starter not rising? What to change", body: "Too runny, too sour or too slow, and how to fix each.", img: "sourdough-rustic.webp" },
]

function SearchCard() {
  return (
    <div className={`${s.light} ${s.fixed} ${m.reveal} flex flex-col px-5 pt-5 sm:px-7 sm:pt-7`} style={{ "--i": 2 } as CSSProperties}>
      <h3 className="text-[clamp(24px,2.2vw,30px)] font-medium leading-none tracking-[-0.03em] text-[#0f0e13]">SEO · GEO · AEO</h3>
      <p className="mt-2.5 max-w-[46ch] text-[15px] leading-[1.55] text-[#55525e]">Improve how your store appears in Google, ChatGPT and answer engines.</p>
      <div className={`${s.serp} mt-5`} aria-hidden="true">
        <div className="flex h-11 items-center gap-3 rounded-full border border-[#dfe1e5] bg-white px-4 shadow-[0_1px_4px_rgba(32,33,36,0.08)]">
          <GoogleG className="h-[18px] w-[18px] shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#202124]">sourdough starter for beginners</span>
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-[#5f6368]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
        </div>
        <div className="mt-3 flex gap-5 border-b border-[#ebebeb] px-1 text-[13px] text-[#5f6368]">
          <span className="border-b-2 border-[#202124] pb-2 font-medium text-[#202124]">All</span>
          <span className="pb-2">Images</span>
          <span className="pb-2">Videos</span>
          <span className="pb-2 max-sm:hidden">Shopping</span>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-3.5 pb-4">
          {RESULTS.map((r) => (
            <li key={r.site} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#f1f3f4] font-serif text-[13px] font-semibold text-[#3c4043]">{r.initial}</span>
                  <span className="min-w-0 leading-[1.2]">
                    <span className="block truncate text-[12.5px] text-[#202124]">{r.site}</span>
                    <span className="block truncate text-[11.5px] text-[#4d5156]">https://{r.url}</span>
                  </span>
                </div>
                <div className="mt-1 truncate text-[15.5px] leading-[1.3] text-[#1a0dab]">{r.title}</div>
                <div className="truncate text-[12.5px] leading-[1.45] text-[#4d5156]">{r.body}</div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${IMG}/${r.img}`} alt="" width={88} height={88} loading="lazy" decoding="async" className="mt-1 h-[60px] w-[60px] shrink-0 rounded-[8px] object-cover sm:h-[68px] sm:w-[68px]" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ── The engines, taking turns ───────────────────────────────────────── */
const ENGINES: Array<{ name: string; Mark: ComponentType<{ className?: string }> }> = [
  { name: "Google", Mark: GoogleG },
  { name: "ChatGPT", Mark: OpenAIMark },
  { name: "Claude", Mark: ClaudeMark },
  { name: "Perplexity", Mark: PerplexityMark },
  { name: "Gemini", Mark: GeminiMark },
]
const EN = ENGINES.length
const TURN_MS = 2600

function EnginesCard({ live, reduced }: { live: boolean; reduced: boolean }) {
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (!live || reduced) return
    const id = window.setInterval(() => setActive((a) => (a + 1) % EN), TURN_MS)
    return () => window.clearInterval(id)
  }, [live, reduced])
  return (
    <div className={`${s.dark} ${s.fixed} ${m.reveal} flex flex-col p-5 sm:p-7`} style={{ "--i": 3 } as CSSProperties}>
      <div className="flex min-h-[150px] flex-1 items-center">
      <div className={`${s.engines} w-full`} aria-hidden="true">
        <span className={s.enginePill} />
        {ENGINES.map((e, i) => {
          const rel = ((i - active + EN + 2) % EN) - 2
          return (
            <span key={e.name} className={s.engine} data-rel={rel}>
              <e.Mark className={s.engineMark} />
              {e.name}
            </span>
          )
        })}
      </div>
      </div>
      <div>
        <h3 className="text-[20px] font-medium tracking-[-0.02em] text-white">Ready for Google and AI search</h3>
        <p className="mt-1.5 max-w-[42ch] text-[14.5px] leading-[1.55] text-[#a3a1ad]">
          Every page gets its own title, description and structured data, read by search engines and AI assistants alike.
        </p>
        <p className="sr-only">Read by {ENGINES.map((e) => e.name).join(", ")}.</p>
      </div>
    </div>
  )
}

export function AnalyticsShowcase() {
  const ref = useRef<HTMLElement>(null)
  const { live, reduced } = usePlatformSection(ref, "200px 0px")
  return (
    <section
      ref={ref}
      id="analytics-showcase"
      aria-labelledby="analytics-showcase-title"
      className={`${m.root} bg-white px-[var(--landing-gutter,22px)] py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#0f0e13]`}
    >
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10 max-w-[920px] sm:mb-14">
          <StoryHeading id="analytics-showcase-title" text="Know what's working, as it happens." accent={["as", "it", "happens"]} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className={`${m.reveal} flex flex-col justify-center pb-4 lg:col-span-5 lg:pb-0 lg:pr-8`} style={{ "--i": 0 } as CSSProperties}>
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-medium leading-[1.1] tracking-[-0.035em] text-[#0f0e13]">See where your visitors are</h3>
            <p className="mt-3 max-w-[44ch] text-[15.5px] leading-[1.6] text-[#55525e]">Every visit, tap and sale on your page and store, counted live. No setup, no extra app.</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {REPORTS.map(({ label, Icon }) => (
                <li key={label} className="inline-flex h-9 items-center gap-2 rounded-full bg-[#f4f4f6] px-3.5 text-[13.5px] font-medium text-[#1f1d26]">
                  <Icon className="h-[15px] w-[15px] text-[#7c3aed]" strokeWidth={2} aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <div className={`${m.reveal} lg:col-span-7`} style={{ "--i": 1 } as CSSProperties}>
            <GlobeCard live={live} reduced={reduced} />
          </div>
          <div className="lg:col-span-7">
            <SearchCard />
          </div>
          <div className="lg:col-span-5">
            <EnginesCard live={live} reduced={reduced} />
          </div>
        </div>
      </div>
    </section>
  )
}
