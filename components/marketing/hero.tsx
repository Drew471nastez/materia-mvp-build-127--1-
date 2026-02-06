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

// ── Partner logos ─────────────────────────────────────────────────

const LOGOS = ["Pentagram", "Slack", "Stripe", "Zoom", "Airbnb", "Atlassian", "Dropbox", "Duolingo"]

// ── Hero ──────────────────────────────────────────────────────────

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)

  return (
    <section className="flex flex-col items-center bg-white pt-6 sm:pt-10 pb-10 sm:pb-14 overflow-hidden">
      {/* Responsive scale for the collage — designed at 960×400, scaled to fit viewport */}
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.42);
        }
        @media (min-width: 640px) {
          .hero-collage-inner { transform: scale(0.58); }
        }
        @media (min-width: 768px) {
          .hero-collage-inner { transform: scale(0.75); }
        }
        @media (min-width: 1024px) {
          .hero-collage-inner { transform: scale(0.9); }
        }
        @media (min-width: 1280px) {
          .hero-collage-inner { transform: scale(1); }
        }
      `}} />

      {/* ─── Collage + floating bubble wrapper ─── */}
      <div className="relative w-full mb-6 sm:mb-8">
        {/* Height container — matches scaled collage height at each breakpoint */}
        <div className="relative w-full h-[168px] sm:h-[232px] md:h-[300px] lg:h-[360px] xl:h-[400px]">

          {/* Collage: designed at fixed 960×400, scaled down responsively */}
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top"
            style={{ width: 960, height: 400 }}
          >
            {/* ── Card 1: Yellow "OD WORKS" — far left pillar, tall ── */}
            <div
              className="absolute rounded-2xl overflow-hidden bg-gradient-to-br from-yellow-300 to-amber-400"
              style={{ left: -10, top: 28, width: 155, height: 265, zIndex: 2 }}
            >
              <div className="p-4 h-full flex flex-col justify-between">
                <div className="text-blue-700 font-black text-xl leading-none tracking-tight">
                  OD<br />MENU<br />WORKS
                </div>
                <div className="flex gap-1.5">
                  <div className="w-7 h-7 rounded-full bg-pink-400" />
                  <div className="w-7 h-7 rounded bg-green-500" />
                </div>
              </div>
            </div>

            {/* ── Card 2: Beige/stone texture — small accent, upper left ── */}
            <div
              className="absolute rounded-2xl overflow-hidden bg-gradient-to-br from-stone-200 to-amber-100"
              style={{ left: 152, top: 6, width: 118, height: 158, zIndex: 2 }}
            >
              <div className="p-3 h-full flex flex-col">
                <div className="text-stone-500 text-[9px] tracking-widest mb-2">TEXTURE</div>
                <div className="flex-1 rounded-lg bg-gradient-to-br from-stone-300/50 to-stone-200/30" />
                <div className="mt-2 space-y-1">
                  <div className="h-[3px] bg-stone-300/60 rounded-full w-3/4" />
                  <div className="h-[3px] bg-stone-300/40 rounded-full w-1/2" />
                </div>
              </div>
            </div>

            {/* ── Card 3: Dark "collectiv" — center-left, tall, prominent ── */}
            <div
              className="absolute rounded-2xl overflow-hidden bg-gradient-to-b from-gray-900 to-gray-800"
              style={{ left: 222, top: 10, width: 158, height: 258, zIndex: 3 }}
            >
              <div className="p-4 h-full flex flex-col">
                <div className="text-gray-400 text-[10px] tracking-[0.15em]">collectiv</div>
                <div className="flex gap-0.5 mt-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-yellow-400/70" />
                  ))}
                </div>
                <div className="mt-auto space-y-1.5">
                  <div className="h-[3px] bg-gray-700 rounded-full w-3/4" />
                  <div className="h-[3px] bg-gray-700 rounded-full w-1/2" />
                  <div className="h-[3px] bg-gray-700 rounded-full w-2/3" />
                </div>
              </div>
            </div>

            {/* ── Card 4: Blue "Geo Garden" — CROWN, landscape, top center ── */}
            <div
              className="absolute rounded-2xl overflow-hidden bg-gradient-to-br from-sky-400 to-blue-600"
              style={{ left: 348, top: 0, width: 264, height: 178, zIndex: 5 }}
            >
              <div className="p-5 h-full flex flex-col justify-between relative overflow-hidden">
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-4 right-5 w-16 h-16 bg-white/30 rounded-xl rotate-12" />
                  <div className="absolute bottom-12 left-5 w-10 h-10 bg-teal-300/40 rounded-lg -rotate-6" />
                  <div className="absolute top-1/2 left-1/2 w-8 h-8 bg-cyan-200/30 rounded-full" />
                </div>
                <div className="relative text-white/90 font-light italic text-2xl leading-tight">
                  Geo<br />Garden
                </div>
                <div className="relative flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-white/30 backdrop-blur-sm" />
                  <div className="text-white/50 text-xs font-light">+</div>
                </div>
              </div>
              {/* Badge — bottom center of this card */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                <div className="flex items-center gap-1 bg-gray-100/90 backdrop-blur-sm text-gray-700 text-[10px] font-medium px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
                  <Lock className="w-3 h-3" />
                  Powering 1,550+ Shopify Brands
                </div>
              </div>
            </div>

            {/* ── Card 5: Blue nature — PEEK from below, bottom layer ── */}
            <div
              className="absolute rounded-2xl overflow-hidden bg-gradient-to-br from-sky-500 to-blue-700"
              style={{ left: 280, top: 215, width: 265, height: 165, zIndex: 1 }}
            >
              <div className="p-4 relative h-full overflow-hidden">
                <div className="absolute top-3 right-4 w-8 h-8 bg-white/15 rounded rotate-12" />
                <div className="absolute bottom-6 left-4 w-7 h-7 bg-teal-300/20 rounded -rotate-6" />
                <div className="absolute top-1/3 right-1/4 w-10 h-10 bg-blue-300/15 rounded-xl rotate-45" />
                <div className="text-white/60 text-[10px] tracking-widest">NATURE</div>
                <div className="mt-2 text-white/70 font-light text-sm">Crystal formations</div>
              </div>
            </div>

            {/* ── Card 6: White "A/REPS" portfolio — center-right ── */}
            <div
              className="absolute rounded-2xl overflow-hidden bg-gradient-to-br from-gray-50 to-white border border-gray-100"
              style={{ left: 558, top: 5, width: 148, height: 205, zIndex: 3 }}
            >
              <div className="p-3 h-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-gray-900 font-bold text-[10px] tracking-wide">A / REPS</div>
                  <div className="flex gap-1.5 text-gray-400 text-[8px]">
                    <span>Artists</span>
                    <span>Categories</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <div className="aspect-square bg-gray-100 rounded" />
                  <div className="aspect-square bg-gray-200 rounded" />
                  <div className="aspect-square bg-gray-100 rounded" />
                  <div className="aspect-square bg-gray-200 rounded" />
                  <div className="aspect-square bg-gray-100 rounded" />
                  <div className="aspect-square bg-gray-200 rounded" />
                </div>
              </div>
            </div>

            {/* ── Card 7: Purple showcase — right cluster ── */}
            <div
              className="absolute rounded-2xl overflow-hidden bg-gradient-to-br from-violet-300 to-purple-400"
              style={{ left: 648, top: 12, width: 148, height: 240, zIndex: 3 }}
            >
              <div className="p-4 h-full flex flex-col">
                <div className="text-purple-800 text-[9px] font-medium tracking-wide mb-2">SHOWCASE</div>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  <div className="aspect-square bg-purple-200/60 rounded-lg" />
                  <div className="aspect-square bg-purple-400/30 rounded-lg" />
                  <div className="aspect-square bg-purple-300/40 rounded-lg" />
                  <div className="aspect-square bg-purple-200/50 rounded-lg" />
                </div>
              </div>
            </div>

            {/* ── Card 8: Light purple "Editorial" — far right pillar, tall ── */}
            <div
              className="absolute rounded-2xl overflow-hidden bg-gradient-to-br from-violet-100 to-purple-200"
              style={{ left: 818, top: 28, width: 155, height: 265, zIndex: 2 }}
            >
              <div className="p-4 h-full flex flex-col">
                <div className="text-[8px] text-purple-500/60 mb-2">©Alex Carter</div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-purple-800 font-semibold text-sm">Editorial</span>
                    <span className="text-[8px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">24</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-purple-800 font-semibold text-sm">Commercial</span>
                    <span className="text-[8px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">12</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-purple-800 font-semibold text-sm">Personal</span>
                    <span className="text-[8px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">8</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── White bubble — centered, overlapping collage, NOT scaled ── */}
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="bg-white rounded-[24px] sm:rounded-[28px] shadow-lg shadow-neutral-200/50 border border-neutral-100/80 px-5 py-7 sm:px-10 sm:py-10 md:px-14 md:py-12 w-[82%] max-w-[480px] text-center pointer-events-auto">
              <h1 className="text-[22px] sm:text-3xl md:text-[38px] md:leading-[1.2] font-bold text-neutral-900 leading-tight min-h-[2.4em] flex items-center justify-center">
                <span>
                  {typedText}
                  <span className="inline-block w-[3px] h-[0.85em] bg-violet-500 ml-0.5 animate-pulse align-middle rounded-full" />
                </span>
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* ─── CTA buttons ─── */}
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

      {/* ─── Description ─── */}
      <p className="text-[13px] text-neutral-400 text-center mb-10 sm:mb-12 max-w-sm leading-relaxed px-4">
        Storelib lets you turn big ideas into real products.
        <br />
        Create, sell, and grow with your audience.
      </p>

      {/* ─── Logo row ─── */}
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
