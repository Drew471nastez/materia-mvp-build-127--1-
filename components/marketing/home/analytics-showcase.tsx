"use client"

/*
  HOME SECTION 11: GET FOUND, AND SEE WHO FINDS YOU.

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
     (./engine-marks), sliding by one at a time.

  LANDING ROUND 7, THE OWNER: "instead of the white pill shapes, some other
  shape, cleaner, smoother", and nothing purple on the purple sheet, not even
  light purple. The reports are one near-black panel of six even cells with
  hairlines between them (no icons, no pills); the heading's accent, the
  line under the title and the share bars are white or neutral grey, and
  the light behind the engines is neutral. "Ready for Google and AI search"
  is smoother: the five names sit on ONE strip that slides a step every turn
  (one transform on one layer, no per-name changes, no scaling of text), the
  names brightening as they pass the middle through a mask that never moves.
  The section sits in the page's one width (--home-edge and --home-max,
  app/globals.css), its headings set in by --home-head-inset.

  LANDING ROUND 8, THE OWNER: a clearer heading than "Know what's working,
  as it happens": "Get found, and see who finds you." says both rows (the
  search card, then the visitors) in plain words. The reports are white
  glass now, not black: a soft white gradient at about a seventh, lit along
  the top edge, a hairline, white words. No backdrop blur (the purple behind
  is flat, so a blur would cost a layer and show nothing). The globe card,
  Nora's card, her top places and the SEO card carry the soft orbs the
  engines card has, quieter: small round lights drifting by transform alone
  (no layer bigger than its card, no blur filter), paused off screen.

  LANDING ROUND 9, THE OWNER: "as I reach the section, the tabs and things
  should appear smoothly, clean, animated as I scroll down". The section's
  blocks used to rise together the moment the section came within 200px of
  the screen, so most of it had finished before it was seen and the second
  row never moved at all. Now each block has its own entrance, the first
  time IT comes on screen: the words, then the six reports one after
  another 55ms apart, the globe card, and further down the search card and
  the engines. Opacity and the `translate` property only (16px for a block,
  10px for a report), once, on the compositor; nothing is hidden by the
  markup, only by the script and only while a block is still below the
  screen, so nothing can flash or shift and reduced motion hides nothing.
  The heading keeps the page's own entrance (components/marketing/
  landing-story.tsx); these blocks are not in its list, so nothing runs
  twice. The globe is lighter on a phone (./analytics-globe).

  Motion: the globe turns only while the section is live and in view. The
  strip of engines moves by one custom property written every 2.6s (no React
  render); names, lights and dots move by transform and opacity on the
  compositor. Off screen, in a background tab
  and under reduced motion, nothing runs.
*/

import { useEffect, useRef, type CSSProperties, type ComponentType, type RefObject } from "react"
import { Eye, Globe, Link2, MonitorSmartphone, ShoppingBag, Waypoints, type LucideIcon } from "lucide-react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { AnalyticsGlobe } from "./analytics-globe"
import { ClaudeMark, GeminiMark, GoogleG, OpenAIMark, PerplexityMark } from "./engine-marks"
import { touchScreen, usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./analytics-showcase.module.css"

const IMG = "/home/analytics"

/**
 * The reports, in Analytics' own words, as few as say it. Landing round 11,
 * the owner: "smooth, clean icons; non-AI, simple, clean". One line set
 * (lucide, the app's own), 16px at a 1.75 stroke, a little dimmer than the
 * word so the word stays the louder of the two.
 */
const REPORTS: ReadonlyArray<{ label: string; Icon: LucideIcon }> = [
  { label: "Views", Icon: Eye },
  { label: "Traffic sources", Icon: Waypoints },
  { label: "Countries", Icon: Globe },
  { label: "Top links", Icon: Link2 },
  { label: "Devices", Icon: MonitorSmartphone },
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
      <span className={`${s.orb} ${s.orbGlobeA} ${m.loop}`} aria-hidden="true" />
      <span className={`${s.orb} ${s.orbGlobeB} ${m.loop}`} aria-hidden="true" />
      <AnalyticsGlobe live={live} reduced={reduced} className={s.globe} />
      <div className={s.live} aria-hidden="true">
        <span className={`${s.liveDot} ${m.loop}`} />
        <span className="tabular-nums text-white">23</span>
        <span className="text-[#a3a1ad]">live</span>
      </div>
      <div className={s.overlay} aria-hidden="true">
        <div className={s.profile}>
          <span className={`${s.orb} ${s.orbChip} ${m.loop}`} aria-hidden="true" />
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
          <span className={`${s.orb} ${s.orbChip} ${s.orbChipLate} ${m.loop}`} aria-hidden="true" />
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
/*
  Landing round 11, the owner: the results "should also have favicons".
  Landing round 12, the owner: they were "still letter tiles". Each site has
  a small mark of its own now, the kind of icon a small studio draws for its
  site: Nora Vik a fjord at dusk (two peaks, the water, a low sun), Frame and
  Grain a strip of film with its sprocket holes, Colorist Notes the three
  lights of a grade meeting in white. Flat shapes on a 16px grid so they stay
  crisp in Google's round 26px well; no letters, no files to load, no real
  brand.
*/
function FjordIcon() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} className={s.favicon} aria-hidden="true" focusable="false" data-favicon="fjord">
      <rect width="16" height="16" rx="3.5" fill="#173f48" />
      <circle cx="11.6" cy="4.4" r="1.6" fill="#f0b36a" />
      <path d="M1.5 11.5 5.6 5.2 7.9 8.5 9.6 6.6 14.5 11.5Z" fill="#f3efe6" />
      <path d="M5.6 5.2 4.1 7.5 5.7 6.9 6.8 7.7Z" fill="#173f48" opacity=".3" />
      <rect x="3" y="12.6" width="10" height="1" rx=".5" fill="#f3efe6" opacity=".5" />
    </svg>
  )
}
function FilmIcon() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} className={s.favicon} aria-hidden="true" focusable="false" data-favicon="film">
      <rect width="16" height="16" rx="3.5" fill="#d9692a" />
      <rect x="3.5" y="2" width="9" height="12" rx="1.3" fill="#1d1712" />
      <rect x="5.7" y="4" width="4.6" height="3.5" rx=".5" fill="#f6c58f" />
      <rect x="5.7" y="8.5" width="4.6" height="3.5" rx=".5" fill="#f6c58f" opacity=".55" />
      <path d="M4.2 3.2h.9v1h-.9zM4.2 5.9h.9v1h-.9zM4.2 8.6h.9v1h-.9zM4.2 11.3h.9v1h-.9zM10.9 3.2h.9v1h-.9zM10.9 5.9h.9v1h-.9zM10.9 8.6h.9v1h-.9zM10.9 11.3h.9v1h-.9z" fill="#d9692a" />
    </svg>
  )
}
function LightsIcon() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} className={s.favicon} aria-hidden="true" focusable="false" data-favicon="lights">
      <circle cx="8" cy="8" r="8" fill="#121317" />
      <g style={{ isolation: "isolate" }}>
        <circle cx="8" cy="6.1" r="3.4" fill="#ff3b30" style={{ mixBlendMode: "screen" }} />
        <circle cx="6.15" cy="9.3" r="3.4" fill="#2bd45a" style={{ mixBlendMode: "screen" }} />
        <circle cx="9.85" cy="9.3" r="3.4" fill="#2f6bff" style={{ mixBlendMode: "screen" }} />
      </g>
    </svg>
  )
}
const RESULTS = [
  { site: "Nora Vik", Icon: FjordIcon, url: "noravik.example › luts", title: "Fjord LUTs: 24 cinematic looks for Premiere Pro", body: "Cube files for Premiere, DaVinci Resolve and Final Cut.", img: "lut-fog.webp" },
  { site: "Frame & Grain", Icon: FilmIcon, url: "frameandgrain.example › guides", title: "How to install a LUT pack in Premiere Pro", body: "Lumetri, Creative, Look, and the pack is in. Step by step.", img: "lut-neon.webp" },
  { site: "Colorist Notes", Icon: LightsIcon, url: "coloristnotes.example › film", title: "Film emulation LUTs that keep skin tones", body: "Warm film looks without orange faces, side by side.", img: "lut-autumn.webp" },
]

function SearchCard() {
  return (
    <div className={`${s.dark} ${s.fixed} ${s.rise} flex flex-col px-5 pt-5 sm:px-7 sm:pt-7`} data-rise="">
      {/* A very quiet dot grid, drifting one cell at a time (a transform loop). */}
      <span className={`${s.dots} ${m.loop}`} aria-hidden="true" />
      <span className={`${s.orb} ${s.orbSearch} ${m.loop}`} aria-hidden="true" />
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
                  <span className={s.faviconWell}>
                    <r.Icon />
                  </span>
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
/** The names three times over, so the strip can always slide one more step; it jumps back by one set, unseen, before it runs out. */
const STRIP = [...ENGINES, ...ENGINES, ...ENGINES]

function EnginesCard({ live, reduced }: { live: boolean; reduced: boolean }) {
  const strip = useRef<HTMLDivElement>(null)
  const pos = useRef(EN)
  useEffect(() => {
    const el = strip.current
    if (!el || !live || reduced) return
    const id = window.setInterval(() => {
      if (pos.current >= 2 * EN) {
        /* The same names one set back: jump there with no transition, settle the style once, then slide on. */
        pos.current -= EN
        el.setAttribute("data-snap", "")
        el.style.setProperty("--pos", String(pos.current))
        void getComputedStyle(el).transform
        el.removeAttribute("data-snap")
      }
      pos.current += 1
      el.style.setProperty("--pos", String(pos.current))
    }, TURN_MS)
    return () => window.clearInterval(id)
  }, [live, reduced])
  return (
    <div className={`${s.dark} ${s.fixed} ${s.rise} flex flex-col p-5 sm:p-7`} data-rise="" style={{ "--i": 1 } as CSSProperties}>
      <span className={`${s.orbit} ${m.loop}`} aria-hidden="true" />
      <div className="relative flex min-h-[150px] flex-1 items-center">
        <div className={`${s.engines} w-full`} aria-hidden="true">
          <span className={s.enginePill} />
          <div ref={strip} className={s.strip} style={{ "--pos": EN } as CSSProperties}>
            {STRIP.map((e, i) => (
              <span key={i} className={s.engine}>
                <e.Mark className={s.engineMark} />
                {e.name}
              </span>
            ))}
          </div>
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

/*
  THE ENTRANCE (landing round 9). Every block marked data-rise is watched by
  one IntersectionObserver. The first report about a block decides: wholly
  below the screen (or in a lazy box the browser is still skipping), it is
  hidden ("wait") until it comes on screen ("in");
  already on screen or above it, it is left exactly as it is. So a block is
  never hidden while it could be seen, and without script or under reduced
  motion nothing is hidden at all. No scroll listener, nothing measured.
*/
function useRise(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root || typeof IntersectionObserver !== "function") return
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return
    /* Wave 17: on a phone or touch screen nothing waits for an entrance (landing-story.tsx): a block hidden until it is on screen arrived blank on an iPhone flick. */
    if (touchScreen()) return
    const seen = new WeakSet<Element>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          if (!seen.has(el)) {
            seen.add(el)
            if (!entry.isIntersecting) {
              /* An empty rectangle: the block is in a lazy box the browser is still skipping (content-visibility), which it only does far off screen. */
              const box = entry.boundingClientRect
              if (box.top > innerHeight || (box.width === 0 && box.height === 0)) el.dataset.rise = "wait"
              else io.unobserve(el)
              continue
            }
          }
          if (entry.isIntersecting) {
            if (el.dataset.rise === "wait") el.dataset.rise = "in"
            io.unobserve(el)
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    )
    root.querySelectorAll("[data-rise]").forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [ref])
}

export function AnalyticsShowcase() {
  const ref = useRef<HTMLElement>(null)
  const { live, reduced } = usePlatformSection(ref, "200px 0px")
  useRise(ref)
  return (
    <section
      ref={ref}
      id="analytics-showcase"
      aria-labelledby="analytics-showcase-title"
      className={`${m.root} ${s.section} bg-white py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#0f0e13]`}
    >
      <div className="home-wrap">
        <div className={`${s.inset} mb-10 max-w-[920px] sm:mb-14 [@media(min-width:1024px)_and_(max-height:900px)]:!mb-10`}>
          <StoryHeading id="analytics-showcase-title" text="Get found, and see who finds you." accent={["see", "who", "finds", "you"]} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className={`${s.inset} flex flex-col justify-center pb-4 lg:col-span-5 lg:pb-0 lg:pr-8`}>
            <div className={s.rise} data-rise="">
              <h3 className="text-[clamp(26px,2.6vw,36px)] font-medium leading-[1.1] tracking-[-0.035em] text-[var(--band-ink,#0f0e13)]">See where your visitors are</h3>
              <p className="mt-3 max-w-[40ch] text-[15.5px] leading-[1.6] text-[var(--band-muted,#55525e)]">Every visit and sale on your page and store, live.</p>
            </div>
            {/* The reports come in one after another (--i), when the row itself is on screen. */}
            <ul className={`${s.reports} mt-6`} aria-label="Reports" data-rise="">
              {REPORTS.map(({ label, Icon }, i) => (
                <li key={label} className={s.report} style={{ "--i": i } as CSSProperties}>
                  <Icon className={s.reportIcon} size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className={s.reportLabel}>{label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={`${s.rise} lg:col-span-7`} data-rise="" style={{ "--i": 1 } as CSSProperties}>
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
