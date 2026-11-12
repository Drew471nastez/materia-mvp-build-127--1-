"use client"

/*
  HOME SECTION 3: EVERYTHING IN ONE PLACE.

  Four cards, each with a small drawn scene instead of an icon: a shelf of
  things a creator sells, income that repeats, one product shown in many
  markets, and one link that opens everywhere. Every claim is a Storelib
  feature: digital, physical, courses and memberships in one catalog
  (lib/products), communities and bookings, markets with local currencies and
  translated pages (lib/markets), OnePage and websites from one catalog.

  Four across on a desktop, two by two on a tablet, a swipeable rail on a
  phone. Scenes animate once on arrival; the short loops (a sale toast, a
  tap) pause off screen through platform-motion.
*/

import { useRef, type CSSProperties, type ReactNode } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { PlatformCount, usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./everything-in-one-place.module.css"

function Card({ index, title, body, children }: { index: number; title: string; body: string; children: ReactNode }) {
  return (
    <article className={`${s.card} ${m.reveal} ${m.lift}`} style={{ "--i": index } as CSSProperties}>
      {children}
      <div className="px-5 pb-6 pt-5 sm:px-6 sm:pb-7">
        <h3 className="text-[19px] font-medium leading-[1.25] tracking-[-0.02em] text-[#18181b] sm:text-[20px]">{title}</h3>
        <p className="mt-2 text-[15px] leading-[1.55] text-[#5f5d66]">{body}</p>
      </div>
    </article>
  )
}

/* ── 1. Sell what you create ─────────────────────────────────────────── */
function ShelfScene() {
  return (
    <div className={`${s.visual} ${s.shelf}`} aria-hidden="true">
      {/* An ebook */}
      <div className={`${s.tile} ${s.tileBack1} p-2`}>
        <div className="aspect-[4/5] rounded-[10px] bg-[linear-gradient(160deg,#1e1b2e_0%,#3b2a6b_100%)] p-3 text-white">
          <div className="text-[8px] uppercase tracking-[0.18em] text-white/60">Guide</div>
          <div className="mt-1.5 font-serif text-[15px] leading-[1.05]">Field notes on film</div>
          <div className="mt-3 h-px w-8 bg-white/40" />
        </div>
        <div className="flex items-center justify-between px-1 pb-0.5 pt-2 text-[10px]">
          <span className="font-medium text-[#18181b]">Ebook</span>
          <span className="text-[#6b6874]">$18</span>
        </div>
      </div>
      {/* A tee */}
      <div className={`${s.tile} ${s.tileBack2} p-2`}>
        <div className="flex aspect-[4/5] items-center justify-center rounded-[10px] bg-[#f3f2f5]">
          <svg viewBox="0 0 100 100" className="w-[78%]">
            <path d="M34 14 L20 20 L6 36 L18 46 L26 40 L26 88 L74 88 L74 40 L82 46 L94 36 L80 20 L66 14 C62 22 38 22 34 14 Z" fill="#18181b" />
            <circle cx="50" cy="48" r="9" fill="none" stroke="#a78bfa" strokeWidth="2.5" />
            <circle cx="50" cy="48" r="3" fill="#a78bfa" />
          </svg>
        </div>
        <div className="flex items-center justify-between px-1 pb-0.5 pt-2 text-[10px]">
          <span className="font-medium text-[#18181b]">Studio tee</span>
          <span className="text-[#6b6874]">$32</span>
        </div>
      </div>
      {/* Presets, the one in front */}
      <div className={`${s.tile} ${s.tileFront} p-2`}>
        <div className="grid aspect-[4/5] grid-rows-4 overflow-hidden rounded-[10px]">
          <div className="bg-[#e8b28a]" />
          <div className="bg-[#c9785b]" />
          <div className="bg-[#6d5a8c]" />
          <div className="bg-[#2c2a3a]" />
        </div>
        <div className="px-1 pb-0.5 pt-2">
          <div className="truncate text-[11px] font-semibold text-[#18181b]">Film Look Presets</div>
          <div className="mt-0.5 flex items-center justify-between text-[10px]">
            <span className="truncate text-[#7c3aed]">Download</span>
            <span className="font-medium text-[#18181b]">$24</span>
          </div>
        </div>
      </div>
      <div className={`${s.toast} ${m.loop}`}>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7c3aed]">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
          </svg>
        </span>
        New sale · Film Look Presets <span className="text-[#c4b5fd]">+$24.00</span>
      </div>
    </div>
  )
}

/* ── 2. Make more from what you do ───────────────────────────────────── */
const STREAMS = [
  { label: "Membership", note: "212 members", amount: "$1,908", dot: "#a78bfa" },
  { label: "Paid community", note: "96 members", amount: "$1,152", dot: "#60a5fa" },
  { label: "1:1 sessions", note: "18 bookings", amount: "$1,080", dot: "#f472b6" },
]
const BARS = [0.34, 0.42, 0.38, 0.55, 0.62, 0.71, 0.93]

function EarnScene({ start }: { start: boolean }) {
  return (
    <div className={`${s.visual} ${s.earn} flex flex-col p-4 sm:p-5`} aria-hidden="true">
      <div className="text-[11px] font-medium text-white/55">Recurring this month</div>
      <div className="mt-0.5 text-[30px] font-medium leading-none tracking-[-0.04em] sm:text-[32px]">
        <PlatformCount value={4812} start={start} format={(n) => `$${Math.round(n).toLocaleString("en-US")}`} duration={1600} />
      </div>
      <div className="mt-3 flex min-h-[28px] flex-1 items-end gap-[6%] pb-3">
        {BARS.map((h, b) => (
          <div
            key={b}
            className={`${s.bar} flex-1 rounded-[4px] ${b === BARS.length - 1 ? "bg-[#a78bfa]" : "bg-white/[0.16]"}`}
            style={{ height: "100%", "--h": h, "--b": b } as CSSProperties}
          />
        ))}
      </div>
      <ul className="space-y-1.5">
        {STREAMS.map((r, i) => (
          <li
            key={r.label}
            className={`${s.stream} flex items-center gap-2 rounded-[10px] bg-white/[0.06] px-2.5 py-[7px] text-[11px]`}
            style={{ "--s": i } as CSSProperties}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.dot }} />
            <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
            <span className="hidden text-white/45 min-[380px]:inline">{r.note}</span>
            <span className="w-[46px] text-right font-medium tabular-nums">{r.amount}</span>
          </li>
        ))}
      </ul>
      <div className={`${s.chip} ${m.loop}`}>+$9.00 new member</div>
    </div>
  )
}

/* ── 3. Sell beyond borders ──────────────────────────────────────────── */
const MARKETS = [
  { flag: "US", lang: "English", name: "Film Look Presets", price: "$24.00" },
  { flag: "FR", lang: "Français", name: "Préréglages Film Look", price: "22,00 €" },
  { flag: "JP", lang: "日本語", name: "フィルムルック プリセット", price: "¥3,600" },
  { flag: "BR", lang: "Português", name: "Presets Film Look", price: "R$ 129,00" },
  { flag: "GB", lang: "English (UK)", name: "Film Look Presets", price: "£19.00" },
]

/* Flags riding the outer ring, at angles that keep them clear of the card. */
const ORBIT = [
  { flag: "DE", a: -2.2 },
  { flag: "JP", a: -0.9 },
  { flag: "BR", a: 0.75 },
  { flag: "IT", a: 2.35 },
  { flag: "CA", a: 3.6 },
]

function BordersScene() {
  const rows = [...MARKETS, MARKETS[0]]
  return (
    <div className={`${s.visual} ${s.borders}`} aria-hidden="true">
      <div className={`${s.ring} ${s.orbit} ${m.loop} aspect-square w-[76%]`}>
        {ORBIT.map((o) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={o.flag}
            src={`/flags/${o.flag}.svg`}
            alt=""
            width={26}
            height={26}
            loading="lazy"
            decoding="async"
            className="absolute h-[26px] w-[26px] rounded-full object-cover shadow-[0_6px_14px_-4px_rgba(10,5,40,0.5)] ring-2 ring-white/80"
            style={{ left: `calc(50% + ${Math.cos(o.a).toFixed(4)} * 50% - 13px)`, top: `calc(50% + ${Math.sin(o.a).toFixed(4)} * 50% - 13px)` }}
          />
        ))}
      </div>
      <div className={`${s.ring} aspect-square w-[52%] border-white/20`} />
      <div className="absolute inset-x-[9%] top-1/2 -translate-y-1/2 rounded-[18px] bg-white p-3 shadow-[0_24px_50px_-20px_rgba(20,10,60,0.6)]">
        <div className="flex items-center gap-2.5">
          <div className="grid h-11 w-11 shrink-0 grid-rows-4 overflow-hidden rounded-[10px]">
            <div className="bg-[#e8b28a]" />
            <div className="bg-[#c9785b]" />
            <div className="bg-[#6d5a8c]" />
            <div className="bg-[#2c2a3a]" />
          </div>
          <div className={`${s.ticker} min-w-0 flex-1`}>
            <div className={`${s.tickerTrack} ${m.loop}`}>
              {rows.map((r, i) => (
                <div key={i} className="flex flex-col justify-center">
                  <div className="truncate text-[12px] font-semibold text-[#18181b]">{r.name}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#6b6874]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/flags/${r.flag}.svg`} alt="" width={14} height={10} loading="lazy" decoding="async" className="h-2.5 w-3.5 rounded-[2px] object-cover" />
                    <span className="truncate">{r.lang}</span>
                    <span className="ml-auto font-semibold tabular-nums text-[#18181b]">{r.price}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 border-t border-[#efedf3] pt-2.5 text-[10px] font-medium text-[#5b21b6]">
          <span className="rounded-full bg-[#f3efff] px-2 py-1">Local currency</span>
          <span className="rounded-full bg-[#f3efff] px-2 py-1">Translated</span>
        </div>
      </div>
    </div>
  )
}

/* ── 4. Your store everywhere ────────────────────────────────────────── */
const LINKS = ["Spring glaze drop", "Book a studio class", "Free glaze guide", "Join the community"]

function EverywhereScene() {
  return (
    <div className={`${s.visual} ${s.everywhere}`} aria-hidden="true">
      <div className={`${s.urlPill} flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-[#18181b] shadow-[0_6px_20px_-10px_rgba(24,16,48,0.4)]`}>
        <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
        storelib.com/mayalin
      </div>
      <div className={`${s.sidecard} ${s.sideLeft} p-1.5`}>
        <div className="aspect-[4/3] rounded-[9px] bg-[linear-gradient(140deg,#c7b9a6,#8f7a66)]" />
        <div className="px-1 pt-1.5 text-[9px] font-medium text-[#18181b]">mayalin.studio</div>
        <div className="px-1 pb-0.5 text-[8px] text-[#8a8793]">Website</div>
      </div>
      <div className={`${s.sidecard} ${s.sideRight} p-1.5`}>
        <div className="flex items-center gap-1.5 p-1">
          <div className="h-5 w-5 rounded-full bg-[linear-gradient(140deg,#a78bfa,#6366f1)]" />
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-[#18181b]">Glaze Club</div>
            <div className="text-[8px] text-[#8a8793]">Community</div>
          </div>
        </div>
        <div className="mx-1 mb-1 h-1.5 rounded-full bg-[#efedf3]" />
        <div className="mx-1 mb-1 h-1.5 w-2/3 rounded-full bg-[#efedf3]" />
      </div>
      <div className={s.phone}>
        <div className="flex flex-col items-center px-3 pt-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(140deg,#d6b48c,#8b5e3c)] text-[11px] font-semibold text-white">ML</div>
          <div className="mt-1.5 text-[11px] font-semibold text-[#18181b]">Maya Lin</div>
          <div className="text-[9px] text-[#8a8793]">Ceramics · Portland</div>
          <div className="mt-2.5 w-full space-y-1.5">
            {LINKS.map((l, k) => (
              <div
                key={l}
                className={`${s.linkBtn} ${m.loop} rounded-[10px] border border-[#ebe9f0] bg-[#faf9fc] truncate px-1.5 py-[7px] text-center text-[9px] font-medium text-[#18181b]`}
                style={{ "--k": k } as CSSProperties}
              >
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function EverythingInOnePlace() {
  const ref = useRef<HTMLElement>(null)
  const { seen } = usePlatformSection(ref)
  return (
    <section
      ref={ref}
      id="everything-in-one-place"
      aria-labelledby="everything-in-one-place-title"
      className={`${m.root} bg-white px-[var(--landing-gutter,22px)] py-[clamp(72px,9vw,128px)] text-[#18181b]`}
    >
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10 max-w-[880px] sm:mb-14">
          <StoryHeading id="everything-in-one-place-title" text="Everything in one place" accent={["one", "place"]} />
          <p className="mt-5 max-w-[60ch] text-[clamp(16px,1.4vw,19px)] leading-[1.6] text-[#5f5d66]">
            Your products, payments, audience and numbers live together in Storelib, so the hours go into what you make, not into stitching tools together.
          </p>
        </div>
        <div className={m.rail}>
          <Card index={0} title="Sell what you create" body="Downloads, courses, memberships and physical products in one catalog, with one checkout for all of them.">
            <ShelfScene />
          </Card>
          <Card index={1} title="Make more from what you do" body="Memberships, paid communities and bookings turn the work you already do into income that comes back every month.">
            <EarnScene start={seen} />
          </Card>
          <Card index={2} title="Sell beyond borders" body="Buyers see your pages in their language and your prices in their currency, wherever they find you.">
            <BordersScene />
          </Card>
          <Card index={3} title="Your store everywhere" body="One catalog behind your OnePage, your website and every link you share, so each follower lands somewhere they can buy.">
            <EverywhereScene />
          </Card>
        </div>
      </div>
    </section>
  )
}
