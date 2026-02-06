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
        const t = setTimeout(() => setDisplayText(current.slice(0, displayText.length + 1)), typingSpeed)
        return () => clearTimeout(t)
      }
      const t = setTimeout(() => setPhase("deleting"), pauseDuration)
      return () => clearTimeout(t)
    }
    if (phase === "deleting") {
      if (displayText.length > 0) {
        const t = setTimeout(() => setDisplayText(displayText.slice(0, -1)), deletingSpeed)
        return () => clearTimeout(t)
      }
      setPhraseIndex((p) => (p + 1) % phrases.length)
      setPhase("typing")
    }
  }, [displayText, phraseIndex, phase, phrases, typingSpeed, deletingSpeed, pauseDuration])

  return displayText
}

// ── Collage card designs (CSS-rendered product screenshots) ───────
// Each column has 4+ cards that auto-scroll vertically

const COL_0 = [
  {
    gradient: "from-yellow-300 to-amber-400",
    el: (
      <div className="p-3 h-full flex flex-col justify-between">
        <div className="text-blue-700 font-black text-sm sm:text-base leading-none tracking-tight">
          OD<br />MENU<br />WORKS
        </div>
        <div className="flex gap-1">
          <div className="w-5 h-5 rounded-full bg-pink-400" />
          <div className="w-5 h-5 rounded bg-green-500" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-slate-800 to-gray-900",
    el: (
      <div className="p-3 h-full flex flex-col justify-between">
        <div className="text-gray-500 text-[8px] tracking-[0.2em]">MINIMAL</div>
        <div className="space-y-1">
          <div className="h-[3px] bg-gray-700 rounded-full w-3/4" />
          <div className="h-[3px] bg-gray-700 rounded-full w-1/2" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-rose-200 to-pink-300",
    el: (
      <div className="p-3">
        <div className="text-rose-700 font-bold text-[10px]">Portfolio</div>
        <div className="mt-2 grid grid-cols-2 gap-1">
          <div className="aspect-square bg-rose-300/60 rounded" />
          <div className="aspect-square bg-rose-400/40 rounded" />
          <div className="aspect-square bg-rose-300/40 rounded" />
          <div className="aspect-square bg-rose-400/60 rounded" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-amber-100 to-orange-200",
    el: (
      <div className="p-3">
        <div className="w-6 h-6 rounded-full bg-orange-400/50 mb-2" />
        <div className="text-orange-900 font-semibold text-[10px]">Brand Kit</div>
      </div>
    ),
  },
]

const COL_1 = [
  {
    gradient: "from-gray-900 to-gray-800",
    el: (
      <div className="p-3 h-full flex flex-col">
        <div className="text-gray-400 text-[8px] tracking-[0.15em]">collectiv</div>
        <div className="flex gap-0.5 mt-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-yellow-400/70" />
          ))}
        </div>
        <div className="mt-auto">
          <div className="h-[3px] bg-gray-700 rounded-full w-2/3 mb-1" />
          <div className="h-[3px] bg-gray-700 rounded-full w-1/3" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-sky-500 to-blue-700",
    el: (
      <div className="p-3 relative h-full">
        <div className="absolute top-3 right-3 w-5 h-5 bg-white/20 rounded rotate-12" />
        <div className="absolute bottom-6 left-3 w-4 h-4 bg-teal-300/30 rounded -rotate-6" />
        <div className="text-white/60 text-[8px] tracking-widest">NATURE</div>
      </div>
    ),
  },
  {
    gradient: "from-emerald-300 to-teal-400",
    el: (
      <div className="p-3">
        <div className="text-emerald-800 font-bold text-[10px]">Fresh</div>
        <div className="mt-2 w-full h-[3px] bg-emerald-500/40 rounded-full" />
      </div>
    ),
  },
  {
    gradient: "from-violet-200 to-purple-300",
    el: (
      <div className="p-3">
        <div className="text-purple-800 text-[8px] font-medium tracking-wide">CREATIVE</div>
        <div className="mt-2 flex gap-1">
          <div className="w-3 h-3 rounded-full bg-purple-500/40" />
          <div className="w-3 h-3 rounded-full bg-purple-400/40" />
          <div className="w-3 h-3 rounded-full bg-purple-300/40" />
        </div>
      </div>
    ),
  },
]

const COL_2 = [
  {
    gradient: "from-sky-400 to-blue-600",
    el: (
      <div className="p-3 sm:p-4 h-full flex flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-4 right-4 w-12 h-12 bg-white/30 rounded-xl rotate-12" />
          <div className="absolute bottom-8 left-4 w-8 h-8 bg-teal-300/40 rounded-lg -rotate-6" />
        </div>
        <div className="relative text-white/90 font-light italic text-lg sm:text-xl leading-tight">
          Geo<br />Garden
        </div>
        <div className="relative flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-white/30" />
          <div className="text-white/50 text-[8px]">+</div>
        </div>
      </div>
    ),
  },
  {
    gradient: "from-indigo-500 to-purple-600",
    el: (
      <div className="p-3 sm:p-4">
        <div className="text-white text-[8px] tracking-widest mb-2">STUDIO</div>
        <div className="text-white/80 font-bold text-xs sm:text-sm">
          Design<br />Collection
        </div>
        <div className="mt-3 w-full h-[2px] bg-white/20 rounded-full" />
      </div>
    ),
  },
  {
    gradient: "from-orange-400 to-red-500",
    el: (
      <div className="p-3 sm:p-4">
        <div className="text-white font-black text-sm sm:text-base">CRAFT</div>
        <div className="text-white/60 text-[8px] mt-1">Handmade goods</div>
      </div>
    ),
  },
  {
    gradient: "from-neutral-100 to-gray-200",
    el: (
      <div className="p-3 sm:p-4">
        <div className="text-gray-800 font-semibold text-[10px]">Templates</div>
        <div className="mt-2 space-y-1">
          <div className="h-5 bg-white rounded border border-gray-200" />
          <div className="h-5 bg-white rounded border border-gray-200" />
        </div>
      </div>
    ),
  },
]

const COL_3 = [
  {
    gradient: "from-gray-50 to-white",
    el: (
      <div className="p-3 h-full border border-gray-100 rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-gray-900 font-bold text-[9px] tracking-wide">A / REPS</div>
          <div className="flex gap-1">
            <span className="text-gray-400 text-[7px]">Artists</span>
            <span className="text-gray-400 text-[7px]">Categories</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-0.5 mt-1">
          <div className="aspect-square bg-gray-100 rounded-sm" />
          <div className="aspect-square bg-gray-200 rounded-sm" />
          <div className="aspect-square bg-gray-100 rounded-sm" />
          <div className="aspect-square bg-gray-200 rounded-sm" />
          <div className="aspect-square bg-gray-100 rounded-sm" />
          <div className="aspect-square bg-gray-200 rounded-sm" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-gray-800 to-gray-900",
    el: (
      <div className="p-3">
        <div className="text-gray-400 text-[8px] tracking-wide">MOODY</div>
        <div className="mt-3 w-full h-10 bg-gradient-to-r from-gray-700 to-gray-600 rounded-lg" />
      </div>
    ),
  },
  {
    gradient: "from-cyan-300 to-teal-400",
    el: (
      <div className="p-3">
        <div className="text-teal-800 font-medium text-[10px]">Organic</div>
        <div className="mt-2 flex gap-1">
          <div className="w-4 h-4 rounded-full bg-teal-500/30" />
          <div className="w-4 h-4 rounded-full bg-teal-400/30" />
        </div>
      </div>
    ),
  },
  {
    gradient: "from-pink-400 to-rose-500",
    el: (
      <div className="p-3">
        <div className="text-white font-bold text-[10px]">BLOOM</div>
        <div className="mt-2 w-2/3 h-[2px] bg-white/40 rounded-full" />
      </div>
    ),
  },
]

const COL_4 = [
  {
    gradient: "from-violet-200 to-purple-300",
    el: (
      <div className="p-3 h-full flex flex-col">
        <div className="text-[7px] text-purple-500/60 mb-1">©Alex Carter</div>
        <div className="text-purple-800 font-semibold text-[10px] leading-relaxed">
          Editorial{" "}
          <span className="text-[7px] text-purple-500">24</span>
          <br />
          Commercial{" "}
          <span className="text-[7px] text-purple-500">12</span>
          <br />
          Personal{" "}
          <span className="text-[7px] text-purple-500">8</span>
        </div>
      </div>
    ),
  },
  {
    gradient: "from-red-300 to-rose-400",
    el: (
      <div className="p-3 h-full flex items-center justify-center">
        <div className="w-8 h-12 bg-rose-500/30 rounded-lg" />
      </div>
    ),
  },
  {
    gradient: "from-gray-700 to-slate-800",
    el: (
      <div className="p-3">
        <div className="text-gray-400 text-[8px] tracking-widest">DUSK</div>
        <div className="mt-2 w-1/2 h-[2px] bg-gray-600 rounded-full" />
      </div>
    ),
  },
  {
    gradient: "from-lime-200 to-green-300",
    el: (
      <div className="p-3">
        <div className="text-green-800 font-medium text-[10px]">Natural</div>
        <div className="mt-2 flex gap-1">
          <div className="w-3 h-3 rounded-full bg-green-400/40" />
          <div className="w-3 h-3 rounded-full bg-green-500/40" />
        </div>
      </div>
    ),
  },
]

// Column definitions: cards, top offset for arc shape, scroll speed
const COLUMNS = [
  { cards: COL_0, marginTop: "mt-16 md:mt-24", duration: 25 },
  { cards: COL_1, marginTop: "mt-8 md:mt-12", duration: 30 },
  { cards: COL_2, marginTop: "mt-0", duration: 35 },
  { cards: COL_3, marginTop: "mt-8 md:mt-12", duration: 28 },
  { cards: COL_4, marginTop: "mt-16 md:mt-24", duration: 32 },
]

// Partner logos — 2 rows of 8
const LOGOS_1 = ["LA Times", "Pentagram", "Slack", "Stripe", "Zoom", "Airbnb", "Atlassian", "Dropbox"]
const LOGOS_2 = ["Duolingo", "Spotify", "Notion", "Figma", "Canva", "Webflow", "Framer", "Linear"]

// ── Hero component ────────────────────────────────────────────────

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)

  return (
    <section className="relative min-h-[600px] sm:min-h-[660px] md:min-h-[740px] flex flex-col items-center justify-center overflow-hidden bg-white">
      {/* Keyframe for continuous column scroll */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes heroScrollUp {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      ` }} />

      {/* ── Background collage ── */}
      <div className="absolute inset-0 flex items-start justify-center gap-2 sm:gap-3 px-1 sm:px-3 md:px-6">
        {COLUMNS.map((col, colIdx) => (
          <div
            key={colIdx}
            className={`flex-1 max-w-[140px] sm:max-w-[170px] md:max-w-[200px] ${col.marginTop} overflow-hidden`}
          >
            <div
              className="flex flex-col gap-2 sm:gap-3"
              style={{ animation: `heroScrollUp ${col.duration}s linear infinite` }}
            >
              {/* Original + duplicate for seamless loop */}
              {[...col.cards, ...col.cards].map((card, i) => (
                <div
                  key={i}
                  className={`rounded-xl sm:rounded-2xl bg-gradient-to-br ${card.gradient} aspect-[4/5] overflow-hidden shrink-0`}
                >
                  {card.el}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Fade overlays ── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,_white_15%,_transparent_60%)] pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 h-[40%] bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none" />
      <div className="absolute top-0 inset-x-0 h-[15%] bg-gradient-to-b from-white to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-white to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-[12%] bg-gradient-to-l from-white to-transparent pointer-events-none" />

      {/* ── Main content ── */}
      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 w-full max-w-3xl mx-auto">
        {/* White bubble with badge */}
        <div className="relative bg-white rounded-[28px] shadow-2xl shadow-neutral-300/40 border border-neutral-100 px-6 py-10 sm:px-10 sm:py-12 md:px-14 md:py-14 w-full max-w-[560px] text-center mb-8">
          {/* Badge — half in, half out of the container */}
          <div className="absolute -top-[14px] left-1/2 -translate-x-1/2 z-20">
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

        {/* CTA buttons */}
        <div className="flex flex-row items-center gap-3 mb-5">
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

        {/* Supporting text — more gray, explains Storelib */}
        <p className="text-[13px] text-neutral-300 text-center mb-14 sm:mb-16 max-w-md leading-relaxed">
          Storelib lets you turn big ideas into real products.
          <br />
          Create, sell, and grow with your audience.
        </p>

        {/* Partner logo rows — 8 per row, 2 rows */}
        <div className="w-full max-w-4xl space-y-3">
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
      </div>
    </section>
  )
}
