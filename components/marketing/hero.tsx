"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowRight, Lock } from "lucide-react"

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

// ── Partner logos (single row, 8 logos) ────────────────────────────

const LOGOS = ["Pentagram", "Slack", "Stripe", "Zoom", "Airbnb", "Atlassian", "Dropbox", "Duolingo"]

// ── Hero ──────────────────────────────────────────────────────────

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)

  return (
    <section className="flex flex-col items-center bg-white pt-6 sm:pt-10 pb-10 sm:pb-14 overflow-hidden">
      {/* ─── Collage + floating bubble wrapper ─── */}
      <div className="relative w-full mb-6 sm:mb-8">
        {/* A) Image collage — single horizontal band of 7 cards */}
        <div className="flex items-end justify-center gap-2.5 sm:gap-3">
          {/* Card 1 — Yellow "OD WORKS" (tall, partially cropped left) */}
          <div className="w-[120px] sm:w-[150px] md:w-[175px] shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-yellow-300 to-amber-400 h-[170px] sm:h-[210px] md:h-[250px]">
            <div className="p-3 sm:p-4 h-full flex flex-col justify-between">
              <div className="text-blue-700 font-black text-sm sm:text-lg leading-none tracking-tight">
                OD<br />MENU<br />WORKS
              </div>
              <div className="flex gap-1">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-pink-400" />
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-green-500" />
              </div>
            </div>
          </div>

          {/* Card 2 — Dark "collectiv" (slightly taller) */}
          <div className="w-[120px] sm:w-[150px] md:w-[175px] shrink-0 rounded-2xl overflow-hidden bg-gradient-to-b from-gray-900 to-gray-800 h-[185px] sm:h-[230px] md:h-[275px]">
            <div className="p-3 sm:p-4 h-full flex flex-col">
              <div className="text-gray-400 text-[9px] sm:text-[10px] tracking-[0.15em]">collectiv</div>
              <div className="flex gap-0.5 mt-2 sm:mt-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-yellow-400/70" />
                ))}
              </div>
              <div className="mt-auto space-y-1.5">
                <div className="h-[3px] bg-gray-700 rounded-full w-3/4" />
                <div className="h-[3px] bg-gray-700 rounded-full w-1/2" />
                <div className="h-[3px] bg-gray-700 rounded-full w-2/3" />
              </div>
            </div>
          </div>

          {/* Card 3 — Blue "Geo Garden" (CENTER — tallest, raised higher via mb) */}
          <div className="w-[140px] sm:w-[175px] md:w-[210px] shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-sky-400 to-blue-600 h-[200px] sm:h-[260px] md:h-[310px] mb-3 sm:mb-5 relative">
            <div className="p-3 sm:p-5 h-full flex flex-col justify-between relative overflow-hidden">
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-5 right-5 w-14 h-14 bg-white/30 rounded-xl rotate-12" />
                <div className="absolute bottom-16 left-5 w-10 h-10 bg-teal-300/40 rounded-lg -rotate-6" />
                <div className="absolute top-1/2 left-1/2 w-8 h-8 bg-cyan-200/30 rounded-full" />
              </div>
              <div className="relative text-white/90 font-light italic text-lg sm:text-2xl leading-tight">
                Geo<br />Garden
              </div>
              <div className="relative flex items-center gap-1.5">
                <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-white/30" />
                <div className="text-white/50 text-[10px]">+</div>
              </div>
            </div>
            {/* Badge — on the Geo Garden image, near the bottom, centered */}
            <div className="absolute bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-10">
              <div className="flex items-center gap-1 bg-gray-100/90 backdrop-blur-sm text-gray-700 text-[9px] sm:text-[10px] font-medium px-2.5 sm:px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
                <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                Powering 1,550+ Shopify Brands
              </div>
            </div>
          </div>

          {/* Card 4 — White "A/REPS" portfolio */}
          <div className="w-[120px] sm:w-[150px] md:w-[175px] shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-gray-50 to-white border border-gray-100 h-[170px] sm:h-[210px] md:h-[250px]">
            <div className="p-3 sm:p-4 h-full">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="text-gray-900 font-bold text-[9px] sm:text-[10px] tracking-wide">A / REPS</div>
                <div className="hidden sm:flex gap-1.5 text-gray-400 text-[7px] sm:text-[8px]">
                  <span>Artists</span>
                  <span>Categories</span>
                  <span>Contact</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                <div className="aspect-square bg-gray-100 rounded" />
                <div className="aspect-square bg-gray-200 rounded" />
                <div className="aspect-square bg-gray-100 rounded" />
                <div className="aspect-square bg-gray-200 rounded" />
                <div className="aspect-square bg-gray-100 rounded" />
                <div className="aspect-square bg-gray-200 rounded" />
              </div>
            </div>
          </div>

          {/* Card 5 — Purple "Editorial" */}
          <div className="w-[120px] sm:w-[150px] md:w-[175px] shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-violet-200 to-purple-300 h-[170px] sm:h-[210px] md:h-[250px]">
            <div className="p-3 sm:p-4 h-full flex flex-col">
              <div className="text-[7px] sm:text-[8px] text-purple-500/60 mb-1.5 sm:mb-2">©Alex Carter</div>
              <div className="space-y-1 sm:space-y-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-purple-800 font-semibold text-xs sm:text-sm">Editorial</span>
                  <span className="text-[7px] sm:text-[8px] text-purple-500 bg-purple-100 px-1 sm:px-1.5 py-0.5 rounded">24</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-purple-800 font-semibold text-xs sm:text-sm">Commercial</span>
                  <span className="text-[7px] sm:text-[8px] text-purple-500 bg-purple-100 px-1 sm:px-1.5 py-0.5 rounded">12</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-purple-800 font-semibold text-xs sm:text-sm">Personal</span>
                  <span className="text-[7px] sm:text-[8px] text-purple-500 bg-purple-100 px-1 sm:px-1.5 py-0.5 rounded">8</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 6 — Rose/hand (slightly taller) */}
          <div className="w-[120px] sm:w-[150px] md:w-[175px] shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-red-300 to-rose-400 h-[185px] sm:h-[230px] md:h-[275px]">
            <div className="p-3 sm:p-4 h-full flex items-center justify-center relative overflow-hidden">
              <div className="absolute -bottom-4 -right-4 w-20 h-20 sm:w-24 sm:h-24 bg-rose-500/20 rounded-full" />
              <div className="w-12 h-16 sm:w-16 sm:h-20 bg-rose-200/60 rounded-lg border border-rose-300/40" />
            </div>
          </div>

          {/* Card 7 — Light purple (partially cropped right) */}
          <div className="w-[120px] sm:w-[150px] md:w-[175px] shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-violet-100 to-purple-200 h-[170px] sm:h-[210px] md:h-[250px]">
            <div className="p-3 sm:p-4 h-full flex flex-col justify-between">
              <div className="text-purple-400 text-[8px] sm:text-[9px] tracking-[0.2em]">STUDIO</div>
              <div>
                <div className="text-purple-700 font-semibold text-xs sm:text-sm mb-1.5">Design<br />Collection</div>
                <div className="space-y-1">
                  <div className="h-[3px] bg-purple-300/60 rounded-full w-full" />
                  <div className="h-[3px] bg-purple-300/40 rounded-full w-3/4" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* B) White text bubble — centered, overlapping the collage */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-white rounded-[24px] sm:rounded-[28px] shadow-lg shadow-neutral-200/50 border border-neutral-100/80 px-6 py-8 sm:px-10 sm:py-10 md:px-14 md:py-12 w-[85%] max-w-[480px] text-center pointer-events-auto">
            <h1 className="text-[22px] sm:text-3xl md:text-[38px] md:leading-[1.2] font-bold text-neutral-900 leading-tight min-h-[2.4em] flex items-center justify-center">
              <span>
                {typedText}
                <span className="inline-block w-[3px] h-[0.85em] bg-violet-500 ml-0.5 animate-pulse align-middle rounded-full" />
              </span>
            </h1>
          </div>
        </div>
      </div>

      {/* C) CTA buttons — below collage, centered */}
      <div className="flex flex-row items-center gap-3 mb-5">
        <Link
          href="/explore"
          className="inline-flex items-center px-6 sm:px-7 py-2.5 sm:py-3 rounded-full text-sm font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          Discover
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 px-6 sm:px-7 py-2.5 sm:py-3 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          Try free
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* D) Small description under buttons */}
      <p className="text-[13px] text-neutral-400 text-center mb-10 sm:mb-12 max-w-sm leading-relaxed px-4">
        Storelib lets you turn big ideas into real products.
        <br />
        Create, sell, and grow with your audience.
      </p>

      {/* E) Logo row — single row, 8 logos, dark gray, evenly spaced */}
      <div className="w-full max-w-4xl px-4">
        <div className="flex items-center justify-center gap-4 sm:gap-6 md:gap-8 flex-wrap">
          {LOGOS.map((name) => (
            <span
              key={name}
              className="text-[11px] sm:text-xs font-bold text-neutral-800 tracking-wide select-none"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
