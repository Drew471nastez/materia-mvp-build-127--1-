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
// Collage: exactly 5 cards in a single tight horizontal strip,
// designed at 920×350 fixed canvas, scaled responsively.
// Center Geo Garden is widest + raised. Edge cards are tall pillars.
// White bubble overlaps the middle of the strip.

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)

  return (
    <section className="flex flex-col items-center bg-white pt-6 sm:pt-10 pb-10 sm:pb-14 overflow-hidden">
      {/* Responsive scaling — 920px design → viewport fit */}
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.35);
        }
        @media (min-width: 640px) {
          .hero-collage-inner { transform: scale(0.50); }
        }
        @media (min-width: 768px) {
          .hero-collage-inner { transform: scale(0.65); }
        }
        @media (min-width: 1024px) {
          .hero-collage-inner { transform: scale(0.85); }
        }
        @media (min-width: 1280px) {
          .hero-collage-inner { transform: scale(1); }
        }
      `}} />

      {/* ─── Collage + floating bubble ─── */}
      <div className="relative w-full mb-6 sm:mb-8">
        {/* Height container — matches scaled height at each breakpoint */}
        <div className="relative w-full h-[123px] sm:h-[175px] md:h-[228px] lg:h-[298px] xl:h-[350px]">

          {/* Collage canvas: 920×350, absolute cards, scaled */}
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top"
            style={{ width: 920, height: 350 }}
          >
            {/* ─ Card 1: Yellow "OD WORKS" — LEFT PILLAR, tall narrow ─ */}
            <div
              className="absolute rounded-[16px] overflow-hidden bg-gradient-to-br from-yellow-300 to-amber-400"
              style={{ left: 0, top: 5, width: 160, height: 340, zIndex: 2 }}
            >
              <div className="p-5 h-full flex flex-col justify-between">
                <div className="text-blue-700 font-black text-[26px] leading-[0.9] tracking-tight">
                  OD<br />MENU<br />WORKS
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-pink-400" />
                    <div className="w-8 h-8 rounded bg-green-500" />
                    <div className="w-8 h-8 rounded bg-blue-400" />
                  </div>
                  <div className="flex gap-1">
                    <div className="h-8 w-14 rounded bg-pink-300/50" />
                    <div className="h-8 w-14 rounded bg-green-300/50" />
                  </div>
                </div>
              </div>
            </div>

            {/* ─ Card 2: Dark "collectiv" — left-center, large vertical ─ */}
            <div
              className="absolute rounded-[16px] overflow-hidden bg-gradient-to-b from-gray-900 to-gray-800"
              style={{ left: 148, top: 30, width: 200, height: 305, zIndex: 2 }}
            >
              <div className="p-5 h-full flex flex-col">
                <div className="text-gray-400 text-xs tracking-[0.15em] mb-3">collectiv</div>
                <div className="flex gap-1 mb-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-yellow-400/60" />
                  ))}
                </div>
                <div className="flex-1 rounded-lg bg-gradient-to-b from-gray-800 to-gray-700/50 mb-3" />
                <div className="text-[9px] text-gray-500 mb-1">Classical Landscape Engraving</div>
                <div className="mt-2 space-y-1.5">
                  <div className="h-1 bg-gray-700 rounded-full w-full" />
                  <div className="h-1 bg-gray-700 rounded-full w-full" />
                  <div className="h-1 bg-gray-700 rounded-full w-3/4" />
                </div>
              </div>
            </div>

            {/* ─ Card 3: Blue "Geo Garden" — CENTER, widest, raised, landscape ─ */}
            <div
              className="absolute"
              style={{ left: 330, top: 0, width: 270, height: 240, zIndex: 3 }}
            >
              {/* The card itself */}
              <div
                className="absolute inset-x-0 top-0 rounded-[16px] overflow-hidden bg-gradient-to-br from-sky-400 to-blue-600"
                style={{ height: 215 }}
              >
                <div className="p-5 h-full flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-5 right-6 w-20 h-20 bg-white/30 rounded-xl rotate-12" />
                    <div className="absolute bottom-14 left-6 w-12 h-12 bg-teal-300/40 rounded-lg -rotate-6" />
                    <div className="absolute top-1/2 left-1/2 w-10 h-10 bg-cyan-200/30 rounded-full" />
                  </div>
                  <div className="relative text-white/80 font-light italic text-[30px] leading-[0.95] tracking-wide" style={{ fontFamily: "serif" }}>
                    Geo<br />Garden
                  </div>
                  <div className="relative flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-white/30 backdrop-blur-sm" />
                    <div className="text-white/50 text-sm font-light">+</div>
                  </div>
                </div>
              </div>
              {/* Badge — half inside, half outside the card's bottom edge */}
              <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 203 }}>
                <div className="flex items-center gap-1.5 bg-gray-100/95 backdrop-blur-sm text-gray-700 text-[11px] font-medium px-3.5 py-1.5 rounded-full whitespace-nowrap shadow-sm">
                  <Lock className="w-3.5 h-3.5" />
                  Powering 1,550+ Shopify Brands
                </div>
              </div>
            </div>

            {/* ─ Card 4: Purple "Editorial" — right-center, large vertical ─ */}
            <div
              className="absolute rounded-[16px] overflow-hidden bg-gradient-to-br from-violet-200 to-purple-300"
              style={{ left: 580, top: 30, width: 200, height: 305, zIndex: 2 }}
            >
              <div className="p-4 h-full flex flex-col">
                <div className="text-[8px] text-purple-500/60 mb-1">©Alex Carter</div>
                <div className="text-[8px] text-purple-400/60 mb-3 flex gap-3">
                  <span>Work</span>
                  <span>About</span>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-purple-800 font-bold text-base">Editorial</span>
                    <span className="text-[9px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">24</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-purple-800 font-bold text-base">Commercial</span>
                    <span className="text-[9px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">12</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-purple-800 font-bold text-base">Personal</span>
                    <span className="text-[9px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">8</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 mt-auto">
                  <div className="aspect-[3/4] bg-purple-400/20 rounded-lg" />
                  <div className="aspect-[3/4] bg-purple-300/25 rounded-lg" />
                </div>
              </div>
            </div>

            {/* ─ Card 5: Light purple — RIGHT PILLAR, tall narrow ─ */}
            <div
              className="absolute rounded-[16px] overflow-hidden bg-gradient-to-br from-purple-400 to-violet-500"
              style={{ left: 765, top: 5, width: 160, height: 340, zIndex: 2 }}
            >
              <div className="p-3 h-full flex flex-col gap-1.5">
                <div className="flex-1 rounded-lg bg-purple-300/30" />
                <div className="flex gap-1.5 h-[30%]">
                  <div className="flex-1 rounded-lg bg-purple-200/25" />
                  <div className="flex-1 rounded-lg bg-violet-300/30" />
                </div>
                <div className="flex-1 rounded-lg bg-purple-300/20" />
                <div className="flex gap-1.5 h-[25%]">
                  <div className="flex-1 rounded-lg bg-violet-200/25" />
                  <div className="flex-1 rounded-lg bg-purple-400/20" />
                </div>
              </div>
            </div>
          </div>

          {/* ── White bubble — centered, overlapping collage middle, NOT scaled ── */}
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
