"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowRight, Zap } from "lucide-react"

// ── Typing animation ──────────────────────────────────────────────

const TYPING_PHRASES = [
  "Start monetizing your passion...",
  "Build link in bio pages...",
  "Sell digital products...",
  "Share your passion...",
  "Build your online store...",
]

function useTypingEffect(
  phrases: string[],
  typingSpeed = 70,
  deletingSpeed = 35,
  pauseDuration = 2000,
) {
  const [displayText, setDisplayText] = useState("")
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [phase, setPhase] = useState<"typing" | "deleting">("typing")

  useEffect(() => {
    const current = phrases[phraseIndex]
    if (phase === "typing") {
      if (displayText.length < current.length) {
        const t = setTimeout(
          () => setDisplayText(current.slice(0, displayText.length + 1)),
          typingSpeed,
        )
        return () => clearTimeout(t)
      }
      const t = setTimeout(() => setPhase("deleting"), pauseDuration)
      return () => clearTimeout(t)
    }
    if (phase === "deleting") {
      if (displayText.length > 0) {
        const t = setTimeout(
          () => setDisplayText(displayText.slice(0, -1)),
          deletingSpeed,
        )
        return () => clearTimeout(t)
      }
      setPhraseIndex((p) => (p + 1) % phrases.length)
      setPhase("typing")
    }
  }, [displayText, phraseIndex, phase, phrases, typingSpeed, deletingSpeed, pauseDuration])

  return displayText
}

// ── Collage card designs ──────────────────────────────────────────
// Large rounded-rectangle cards mimicking product/website screenshots.
// Two horizontal rows: top row (7 cards), bottom row (5 cards).

const TOP_ROW = [
  {
    gradient: "from-yellow-300 to-amber-400",
    el: (
      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
        <div className="text-blue-700 font-black text-lg sm:text-xl leading-none tracking-tight">
          OD<br />MENU<br />WORKS
        </div>
        <div className="flex gap-1.5">
          <div className="w-7 h-7 rounded-full bg-pink-400" />
          <div className="w-7 h-7 rounded bg-green-500" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-gray-900 to-gray-800",
    el: (
      <div className="p-4 sm:p-5 h-full flex flex-col">
        <div className="text-gray-400 text-[10px] tracking-[0.15em]">collectiv</div>
        <div className="flex gap-0.5 mt-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-yellow-400/70" />
          ))}
        </div>
        <div className="mt-auto space-y-1.5">
          <div className="h-1 bg-gray-700 rounded-full w-3/4" />
          <div className="h-1 bg-gray-700 rounded-full w-1/2" />
          <div className="h-1 bg-gray-700 rounded-full w-2/3" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-sky-400 to-blue-600",
    el: (
      <div className="p-4 sm:p-5 h-full flex flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-5 right-5 w-16 h-16 bg-white/30 rounded-xl rotate-12" />
          <div className="absolute bottom-10 left-5 w-10 h-10 bg-teal-300/40 rounded-lg -rotate-6" />
          <div className="absolute top-1/2 left-1/2 w-8 h-8 bg-cyan-200/30 rounded-full" />
        </div>
        <div className="relative text-white/90 font-light italic text-xl sm:text-2xl leading-tight">
          Geo<br />Garden
        </div>
        <div className="relative flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-white/30 backdrop-blur-sm" />
          <div className="text-white/50 text-xs font-light">+</div>
        </div>
      </div>
    ),
  },
  {
    gradient: "from-gray-50 to-white",
    el: (
      <div className="p-4 sm:p-5 h-full border border-gray-100 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-gray-900 font-bold text-xs tracking-wide">A / REPS</div>
          <div className="flex gap-2 text-gray-400 text-[9px]">
            <span>Artists</span>
            <span>Categories</span>
            <span>Contact</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="aspect-square bg-gray-100 rounded" />
          <div className="aspect-square bg-gray-200 rounded" />
          <div className="aspect-square bg-gray-100 rounded" />
          <div className="aspect-square bg-gray-200 rounded" />
          <div className="aspect-square bg-gray-100 rounded" />
          <div className="aspect-square bg-gray-200 rounded" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-violet-200 to-purple-300",
    el: (
      <div className="p-4 sm:p-5 h-full flex flex-col">
        <div className="text-[9px] text-purple-500/60 mb-2">©Alex Carter</div>
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-purple-800 font-semibold text-sm">Editorial</span>
            <span className="text-[9px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">24</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-purple-800 font-semibold text-sm">Commercial</span>
            <span className="text-[9px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">12</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-purple-800 font-semibold text-sm">Personal</span>
            <span className="text-[9px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">8</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    gradient: "from-red-300 to-rose-400",
    el: (
      <div className="p-4 sm:p-5 h-full flex items-center justify-center relative overflow-hidden">
        <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-rose-500/20 rounded-full" />
        <div className="w-16 h-20 bg-rose-200/60 rounded-lg border border-rose-300/40" />
      </div>
    ),
  },
  {
    gradient: "from-slate-800 to-gray-900",
    el: (
      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
        <div className="text-gray-500 text-[9px] tracking-[0.2em]">MINIMAL</div>
        <div>
          <div className="text-white font-semibold text-sm mb-2">Dark Mode</div>
          <div className="space-y-1">
            <div className="h-1 bg-gray-700 rounded-full w-full" />
            <div className="h-1 bg-gray-700 rounded-full w-3/4" />
          </div>
        </div>
      </div>
    ),
  },
]

const BOTTOM_ROW = [
  {
    gradient: "from-rose-200 to-pink-300",
    el: (
      <div className="p-4 sm:p-5 h-full">
        <div className="text-rose-700 font-bold text-xs mb-3">Portfolio</div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="aspect-[4/3] bg-rose-300/60 rounded-lg" />
          <div className="aspect-[4/3] bg-rose-400/40 rounded-lg" />
          <div className="aspect-[4/3] bg-rose-300/40 rounded-lg" />
          <div className="aspect-[4/3] bg-rose-400/60 rounded-lg" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-sky-500 to-blue-700",
    el: (
      <div className="p-4 sm:p-5 relative h-full overflow-hidden">
        <div className="absolute top-4 right-4 w-8 h-8 bg-white/20 rounded rotate-12" />
        <div className="absolute bottom-8 left-4 w-6 h-6 bg-teal-300/30 rounded -rotate-6" />
        <div className="absolute top-1/2 right-1/3 w-10 h-10 bg-blue-300/20 rounded-xl rotate-45" />
        <div className="text-white/70 text-[10px] tracking-widest">NATURE</div>
        <div className="mt-3 text-white font-semibold text-sm">Crystal</div>
      </div>
    ),
  },
  {
    gradient: "from-indigo-500 to-purple-600",
    el: (
      <div className="p-4 sm:p-5 h-full">
        <div className="text-white text-[9px] tracking-widest mb-2">STUDIO</div>
        <div className="text-white/80 font-bold text-base leading-tight">
          Design<br />Collection
        </div>
        <div className="mt-3 w-full h-[2px] bg-white/20 rounded-full" />
      </div>
    ),
  },
  {
    gradient: "from-emerald-300 to-teal-400",
    el: (
      <div className="p-4 sm:p-5 h-full">
        <div className="text-emerald-800 font-bold text-xs mb-2">Fresh</div>
        <div className="flex gap-2 mt-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/30" />
          <div className="w-8 h-8 rounded-full bg-teal-500/20" />
          <div className="w-8 h-8 rounded-full bg-green-500/25" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-orange-400 to-red-500",
    el: (
      <div className="p-4 sm:p-5 h-full">
        <div className="text-white font-black text-lg">CRAFT</div>
        <div className="text-white/60 text-[10px] mt-1 mb-3">Handmade goods</div>
        <div className="flex gap-1">
          <div className="w-5 h-5 rounded bg-white/20" />
          <div className="w-5 h-5 rounded bg-white/15" />
          <div className="w-5 h-5 rounded bg-white/10" />
        </div>
      </div>
    ),
  },
]

// Partner logos — 2 rows of 8
const LOGOS_1 = ["LA Times", "Pentagram", "Slack", "Stripe", "Zoom", "Airbnb", "Atlassian", "Dropbox"]
const LOGOS_2 = ["Duolingo", "Spotify", "Notion", "Figma", "Canva", "Webflow", "Framer", "Linear"]

// ── Hero component ────────────────────────────────────────────────

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)

  return (
    <section className="relative flex flex-col items-center overflow-hidden bg-white pt-8 sm:pt-12 pb-10 sm:pb-14">
      {/* Keyframes for horizontal marquee scroll */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes heroScrollLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes heroScrollRight {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}} />

      {/* ── A) Collage area ── */}
      {/* The 2-row horizontal strip of screenshot cards, centered, with bubble on top */}
      <div className="relative w-full max-w-5xl mx-auto">
        {/* Collage rows container — fixed height, overflow hidden */}
        <div className="relative h-[280px] sm:h-[320px] md:h-[380px] overflow-hidden">

          {/* Top row — scrolls left, 7 cards */}
          <div className="absolute inset-x-0 top-0 overflow-hidden">
            <div
              className="flex gap-3 sm:gap-4 w-max"
              style={{ animation: "heroScrollLeft 40s linear infinite" }}
            >
              {[...TOP_ROW, ...TOP_ROW].map((card, i) => (
                <div
                  key={i}
                  className={`w-[160px] sm:w-[200px] md:w-[240px] aspect-[5/4] rounded-2xl sm:rounded-3xl bg-gradient-to-br ${card.gradient} overflow-hidden shrink-0`}
                >
                  {card.el}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom row — scrolls right, 5 cards, offset + overlaps top */}
          <div className="absolute inset-x-0 bottom-0 overflow-hidden pl-8 sm:pl-16 md:pl-24">
            <div
              className="flex gap-3 sm:gap-4 w-max"
              style={{ animation: "heroScrollRight 45s linear infinite" }}
            >
              {[...BOTTOM_ROW, ...BOTTOM_ROW].map((card, i) => (
                <div
                  key={i}
                  className={`w-[160px] sm:w-[200px] md:w-[240px] aspect-[5/4] rounded-2xl sm:rounded-3xl bg-gradient-to-br ${card.gradient} overflow-hidden shrink-0`}
                >
                  {card.el}
                </div>
              ))}
            </div>
          </div>

          {/* ── Fade / mask overlays on the collage ── */}
          {/* Radial fade — strongest in center where bubble sits */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_50%,_rgba(255,255,255,0.85)_0%,_rgba(255,255,255,0.3)_60%,_transparent_100%)] pointer-events-none z-[2]" />
          {/* Left edge fade */}
          <div className="absolute inset-y-0 left-0 w-[15%] bg-gradient-to-r from-white to-transparent pointer-events-none z-[3]" />
          {/* Right edge fade */}
          <div className="absolute inset-y-0 right-0 w-[15%] bg-gradient-to-l from-white to-transparent pointer-events-none z-[3]" />
          {/* Top edge fade */}
          <div className="absolute top-0 inset-x-0 h-[20%] bg-gradient-to-b from-white to-transparent pointer-events-none z-[3]" />
          {/* Bottom edge fade */}
          <div className="absolute bottom-0 inset-x-0 h-[25%] bg-gradient-to-t from-white to-transparent pointer-events-none z-[3]" />

          {/* ── B) White bubble — overlapping the collage center ── */}
          <div className="absolute inset-0 flex items-center justify-center z-[5] pointer-events-none">
            <div className="relative bg-white rounded-[28px] shadow-2xl shadow-neutral-200/60 border border-neutral-100/80 px-6 py-8 sm:px-10 sm:py-10 md:px-14 md:py-12 w-[88%] max-w-[520px] text-center pointer-events-auto">
              {/* Badge — half in, half out */}
              <div className="absolute -top-[14px] left-1/2 -translate-x-1/2 z-10">
                <div className="flex items-center gap-1.5 bg-gray-900 text-white text-[11px] sm:text-xs font-medium px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                  <Zap className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  Powering 10,000+ Creators
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-[40px] md:leading-[1.2] font-bold text-neutral-900 leading-tight min-h-[2.4em] flex items-center justify-center">
                <span>
                  {typedText}
                  <span className="inline-block w-[3px] h-[0.85em] bg-violet-500 ml-0.5 animate-pulse align-middle rounded-full" />
                </span>
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* ── C) CTA buttons — below collage ── */}
      <div className="relative z-10 flex flex-row items-center gap-3 mt-6 sm:mt-8 mb-5">
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors border border-neutral-200"
        >
          Discover
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          Try free
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ── D) Description + logo rows ── */}
      <p className="text-[13px] text-neutral-300 text-center mb-10 sm:mb-12 max-w-md leading-relaxed px-4">
        Storelib lets you turn big ideas into real products.
        <br />
        Create, sell, and grow with your audience.
      </p>

      <div className="w-full max-w-4xl space-y-3 px-4">
        <div className="flex items-center justify-center gap-3 sm:gap-5 md:gap-7 flex-wrap">
          {LOGOS_1.map((name) => (
            <span
              key={name}
              className="text-[10px] sm:text-[11px] font-bold text-neutral-300 tracking-wide select-none"
            >
              {name}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3 sm:gap-5 md:gap-7 flex-wrap">
          {LOGOS_2.map((name) => (
            <span
              key={name}
              className="text-[10px] sm:text-[11px] font-bold text-neutral-300 tracking-wide select-none"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
