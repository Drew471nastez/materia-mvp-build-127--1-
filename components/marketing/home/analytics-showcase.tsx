"use client"

/*
  HOME SECTION 11: KNOW WHAT'S WORKING, AS IT HAPPENS.

  LANDING ROUND, THE OWNER: smaller, smooth and clean. Two rows.

  LANDING ROUND 3, THE OWNER: "white modals on black background looks ugly".
  The section sits on the purple sheet, so every card in it is a dark
  surface.

  LANDING ROUND 5, THE OWNER: the reports are white pills with a little
  depth and a touch of glass; the dots behind the purple are fewer and
  fainter (./dot-field); the SEO card's own grid is quieter; the engine
  switcher is the one from before round 4, with a very quiet light turning
  around it.

  LANDING ROUND 4, THE OWNER: the search example is a LUT pack now, not a
  bread recipe; the SEO card keeps the dark of the other cards with a very quiet
  dot grid drifting behind it; "Ready for Google and AI search" plays by
  itself and can be pressed, and as it changes a soft light in the engine's
  own colours changes behind it; the reports are fewer words, lit from above
  for a little depth; the globe's two small cards are cleaner and read the
  same on a phone.

  1. See where your visitors are. A title, one line and the reports Storelib
     Analytics really has (app/(storelib)/app/analytics), as chips. Beside it
     a dark card with a dotted globe whose visits arc in to one creator
     (./analytics-globe, the engine of section 3 reused read only), her card
     and her top places by country with each one's share of her visitors
     (Storelib keeps countries, never cities, ages or genders). The creator,
     Nora Vik, a colorist in Oslo who sells LUT packs, is invented; her
     portrait is an Unsplash photograph.

  2. SEO, GEO and AEO. A search for "cinematic LUT pack for Premiere Pro"
     with three results, hers first (example addresses; the stills are
     Unsplash photographs), and beside it the engines a store is read by,
     Google, ChatGPT, Claude, Perplexity and Gemini, in their own marks
     (./engine-marks), taking turns in a pill.

  Motion: the globe turns only while the section is live and in view. The
  switcher is one small render per turn; names, lights and dots move by
  transform and opacity on the compositor. Off screen, in a background tab
  and under reduced motion, nothing runs.
*/

import { useEffect, useRef, useState, type CSSProperties, type ComponentType } from "react"
import { ArrowUpRight, Eye, Globe2, Link2, ShoppingBag, Smartphone } from "lucide-react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { AnalyticsGlobe } from "./analytics-globe"
import { ClaudeMark, GeminiMark, GoogleG, OpenAIMark, PerplexityMark } from "./engine-marks"
import { usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./analytics-showcase.module.css"

const IMG = "/home/analytics"

/** The reports, in Analytics' own words, as few as say it. */
const REPORTS: Array<{ label: string; Icon: ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { label: "Views", Icon: Eye },
  { label: "Traffic sources", Icon: ArrowUpRight },
  { label: "Countries", Icon: Globe2 },
  { label: "Top links", Icon: Link2 },
  { label: "Devices", Icon: Smartphone },
  { label: "Sales", Icon: ShoppingBag },
]

const VISITORS = 21480
/** Her top places, each with its visitors: the share is of VISITORS. */
const PLACES = [
  { code: "US", name: "United States", visitors: 9840 },
  { code: "GB", name: "United Kingdom", visitors: 4120 },
  { code: "DE", name: "Germany", visitors: 3310 },
]
const num = (v: number) => v.toLocaleString("en-US")

function GlobeCard({ live, reduced }: { live: boolean; reduced: boolean }) {
  return (
    <div
      className={`${s.dark} ${s.globeCard}`}
      role="img"
      aria-label="A dotted globe with visits arcing in to Nora Vik, a colorist who sells LUT packs, and her top countries: the United States, the United Kingdom and Germany."
    >
      <AnalyticsGlobe live={live} reduced={reduced} className={s.globe} />
      <div className={s.live} aria-hidden="true">
        <span className={`${s.liveDot} ${m.loop}`} />
        <span className="tabular-nums text-white">23</span>
        <span className="text-[#a3a1ad]">live</span>
      </div>
      <div className={s.overlay} aria-hidden="true">
        <div className={s.profile}>
          <div className={s.who}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG}/nora.webp`} alt="" width={56} height={56} loading="lazy" decoding="async" className={s.avatar} />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-white">Nora Vik</div>
              <div className="truncate text-[12.5px] text-[#a3a1ad]">@noravik.grade</div>
            </div>
          </div>
          <div className={s.figures}>
            <div>
              <div className="text-[11px] text-[#8f8d99]">Visitors</div>
              <div className="text-[15px] font-semibold tabular-nums text-white">{num(VISITORS)}</div>
            </div>
            <div>
              <div className="text-[11px] text-[#8f8d99]">Countries</div>
              <div className="text-[15px] font-semibold tabular-nums text-white">31</div>
            </div>
          </div>
        </div>
        <div className={s.places}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13.5px] font-semibold text-white">Top places</span>
            <span className="shrink-0 text-[11.5px] text-[#8f8d99]">30 days</span>
          </div>
          <ol className="mt-2.5 grid grid-cols-1 gap-2.5">
            {PLACES.map((p) => (
              <li key={p.code}>
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/flags/${p.code}.svg`} alt="" width={18} height={13} loading="lazy" decoding="async" className="h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[#ececf1]">{p.name}</span>
                  <span className="shrink-0 text-[12.5px] tabular-nums text-[#a3a1ad]">{Math.round((p.visitors / VISITORS) * 100)}%</span>
                </div>
                <span className={s.share}>
                  <span style={{ transform: `scaleX(${(p.visitors / VISITORS).toFixed(3)})` }} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

/* ── SEO, GEO, AEO ───────────────────────────────────────────────────── */
const QUERY = "cinematic LUT pack for Premiere Pro"
const RESULTS = [
  { site: "Nora Vik", initial: "N", url: "noravik.example › luts", title: "Fjord LUTs: 24 cinematic looks for Premiere Pro", body: "Cube files for Premiere, DaVinci Resolve and Final Cut.", img: "lut-fog.webp" },
  { site: "Frame & Grain", initial: "F", url: "frameandgrain.example › guides", title: "How to install a LUT pack in Premiere Pro", body: "Lumetri, Creative, Look, and the pack is in. Step by step.", img: "lut-neon.webp" },
  { site: "Colorist Notes", initial: "C", url: "coloristnotes.example › film", title: "Film emulation LUTs that keep skin tones", body: "Warm film looks without orange faces, side by side.", img: "lut-autumn.webp" },
]

function SearchCard() {
  return (
    <div className={`${s.dark} ${s.fixed} ${m.reveal} flex flex-col px-5 pt-5 sm:px-7 sm:pt-7`} style={{ "--i": 2 } as CSSProperties}>
      {/* A very quiet dot grid, drifting one cell at a time (a transform loop). */}
      <span className={`${s.dots} ${m.loop}`} aria-hidden="true" />
      <h3 className="relative text-[clamp(24px,2.2vw,30px)] font-medium leading-none tracking-[-0.03em] text-white">SEO · GEO · AEO</h3>
      <p className="relative mt-2.5 max-w-[46ch] text-[15px] leading-[1.55] text-[#a3a1ad]">Show up in Google, ChatGPT and answer engines.</p>
      {/* A search, as it reads at night: the whole card stays dark, nothing in it can be pressed. */}
      <div className={`${s.serp} mt-5`} aria-hidden="true">
        <div className={s.serpBar}>
          <GoogleG className="h-[18px] w-[18px] shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#ececf1]">{QUERY}</span>
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-[#8f8d99]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
        </div>
        <div className="mt-3 flex gap-5 border-b border-white/[0.08] px-1 text-[13px] text-[#8f8d99]">
          <span className="border-b-2 border-white pb-2 font-medium text-white">All</span>
          <span className="pb-2">Videos</span>
          <span className="pb-2">Images</span>
          <span className="pb-2 max-sm:hidden">Shopping</span>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-3.5 pb-4">
          {RESULTS.map((r) => (
            <li key={r.site} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-semibold text-[#ececf1]">{r.initial}</span>
                  <span className="min-w-0 leading-[1.2]">
                    <span className="block truncate text-[12.5px] text-[#ececf1]">{r.site}</span>
                    <span className="block truncate text-[11.5px] text-[#8f8d99]">https://{r.url}</span>
                  </span>
                </div>
                <div className="mt-1 truncate text-[15.5px] leading-[1.3] text-[#a9c1ff]">{r.title}</div>
                <div className="truncate text-[12.5px] leading-[1.45] text-[#a3a1ad]">{r.body}</div>
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
/*
  Landing round 5, the owner: "keep it how it was before" (971429ade),
  "with the subtle clean gradients going around, very subtle". The card is
  that version again (no row of buttons, no light per engine), with one
  quiet light behind it: two soft tints that turn slowly around the card's
  middle, one transform on one layer, paused off screen.
*/
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
      <span className={`${s.orbit} ${m.loop}`} aria-hidden="true" />
      <div className="relative flex min-h-[150px] flex-1 items-center">
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
      <div className="relative">
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
      className={`${m.root} bg-white py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#0f0e13]`}
    >
      <div className="mx-auto max-w-[1400px] px-[var(--landing-gutter,22px)]">
        <div className="mb-10 max-w-[920px] sm:mb-14">
          <StoryHeading id="analytics-showcase-title" text="Know what's working, as it happens." accent={["as", "it", "happens"]} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className={`${m.reveal} flex flex-col justify-center pb-4 lg:col-span-5 lg:pb-0 lg:pr-8`} style={{ "--i": 0 } as CSSProperties}>
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-medium leading-[1.1] tracking-[-0.035em] text-[var(--band-ink,#0f0e13)]">See where your visitors are</h3>
            <p className="mt-3 max-w-[40ch] text-[15.5px] leading-[1.6] text-[var(--band-muted,#55525e)]">Every visit and sale on your page and store, live.</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {REPORTS.map(({ label, Icon }) => (
                <li key={label} className={s.report}>
                  <Icon className="h-[14px] w-[14px] opacity-80" strokeWidth={1.9} aria-hidden="true" />
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
