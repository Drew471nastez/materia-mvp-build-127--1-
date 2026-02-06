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

// ── Partner logos (SVG images) ────────────────────────────────────

const PARTNER_LOGOS = [
  "https://cdn.sanity.io/images/599r6htc/regionalized/a9bfb23cca986ee16b0547274bcd7461ffd373aa-67x18.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/bbfcc0e04437442a9637cc58efde849dfadb313c-76x48.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/927f806a262abfc02a79d68fc83dd6f960a06ada-141x28.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/01d4ea19e824b3596f8f6c701d3b8319e49631b0-146x18.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/5e789db505180ee41e0612d7d53e2ec48c9c5837-153x20.svg?q=75&fit=max&auto=format",
]

// ── Collage images (Supabase) ────────────────────────────────────

const IMAGES = [
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/1351351.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/2423.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/1351.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/1212.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/51351.png",
]

// ── Hero ──────────────────────────────────────────────────────────
// 5 real image cards in a tight horizontal collage,
// designed at 1100×400 fixed canvas, scaled responsively.
// Center card is widest + raised. Edge cards partially cropped.
// White bubble overlaps the middle of the strip.

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)

  return (
    <section className="flex flex-col items-center bg-white pt-6 sm:pt-10 pb-10 sm:pb-14 overflow-hidden">
      {/* Responsive scaling — 1100px design → viewport fit */}
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.32);
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
        @keyframes logo-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .logo-marquee {
          animation: logo-scroll 25s linear infinite;
        }
      `}} />

      {/* ─── Collage + floating bubble ─── */}
      <div className="relative w-full mb-6 sm:mb-8">
        {/* Height container — matches scaled height at each breakpoint */}
        <div className="relative w-full h-[128px] sm:h-[200px] md:h-[260px] lg:h-[340px] xl:h-[400px]">

          {/* Collage canvas: 1100×400, absolute cards, scaled */}
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top"
            style={{ width: 1100, height: 400 }}
          >
            {/* ─ Card 1: LEFT PILLAR — tall, partially off left edge ─ */}
            <div
              className="absolute rounded-[16px] overflow-hidden shadow-lg shadow-black/10"
              style={{ left: -25, top: 5, width: 205, height: 385, zIndex: 1 }}
            >
              <img
                src={IMAGES[0]}
                alt="Product showcase"
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>

            {/* ─ Card 2: LEFT-CENTER — tall dark card ─ */}
            <div
              className="absolute rounded-[16px] overflow-hidden shadow-lg shadow-black/10"
              style={{ left: 168, top: 28, width: 220, height: 345, zIndex: 2 }}
            >
              <img
                src={IMAGES[1]}
                alt="Product showcase"
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>

            {/* ─ Card 3: CENTER — widest, raised, landscape + badge ─ */}
            <div
              className="absolute"
              style={{ left: 370, top: 0, width: 350, height: 240, zIndex: 3 }}
            >
              {/* The card itself */}
              <div
                className="absolute inset-x-0 top-0 rounded-[16px] overflow-hidden shadow-xl shadow-black/15"
                style={{ height: 215 }}
              >
                <img
                  src={IMAGES[2]}
                  alt="Featured product"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
              {/* Badge — half inside, half outside the card's bottom edge */}
              <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 203 }}>
                <div className="flex items-center gap-1.5 bg-gray-100/95 backdrop-blur-sm text-gray-700 text-[11px] font-medium px-3.5 py-1.5 rounded-full whitespace-nowrap shadow-sm">
                  <Lock className="w-3.5 h-3.5" />
                  Powering 1,550+ Shopify Brands
                </div>
              </div>
            </div>

            {/* ─ Card 4: RIGHT-CENTER — tall card ─ */}
            <div
              className="absolute rounded-[16px] overflow-hidden shadow-lg shadow-black/10"
              style={{ left: 702, top: 28, width: 220, height: 345, zIndex: 2 }}
            >
              <img
                src={IMAGES[3]}
                alt="Product showcase"
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>

            {/* ─ Card 5: RIGHT PILLAR — tall, partially off right edge ─ */}
            <div
              className="absolute rounded-[16px] overflow-hidden shadow-lg shadow-black/10"
              style={{ left: 910, top: 5, width: 205, height: 385, zIndex: 1 }}
            >
              <img
                src={IMAGES[4]}
                alt="Product showcase"
                className="w-full h-full object-cover"
                draggable={false}
              />
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

      {/* ─── Scrolling logo marquee ─── */}
      <div className="w-full overflow-hidden">
        <div className="logo-marquee flex items-center w-max">
          {/* Render logos twice for seamless loop */}
          {[...PARTNER_LOGOS, ...PARTNER_LOGOS].map((src, i) => (
            <img
              key={i}
              src={src}
              alt="Partner logo"
              className="h-5 sm:h-6 md:h-7 w-auto mx-6 sm:mx-8 md:mx-10 opacity-70 grayscale select-none"
              draggable={false}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
