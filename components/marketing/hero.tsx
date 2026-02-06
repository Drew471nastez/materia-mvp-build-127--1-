"use client"

import { useState, useEffect, useRef, useCallback } from "react"
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
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitle1411241d%20design.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/1212.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/51351.png",
]

// ── Card layout positions ────────────────────────────────────────

interface CardDef {
  left: number
  top: number
  width: number
  height: number
  zIndex: number
}

const BASE_CARDS: CardDef[] = [
  { left: -120, top: 60, width: 238, height: 294, zIndex: 1 },  // far left
  { left: 106,  top: 30, width: 289, height: 357, zIndex: 2 },  // inner left
  { left: 380,  top: 0,  width: 340, height: 420, zIndex: 3 },  // center
  { left: 705,  top: 30, width: 289, height: 357, zIndex: 2 },  // inner right
  { left: 982,  top: 60, width: 238, height: 294, zIndex: 1 },  // far right
]

const CANVAS_W = 1100
const CANVAS_H = 440
const AUTOPLAY_INTERVAL = 5000

// ── Hero ──────────────────────────────────────────────────────────

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)

  // Card order: indices into IMAGES array
  const [cardOrder, setCardOrder] = useState([0, 1, 2, 3, 4])

  // Swipe gesture detection only — no visual offset
  const dragRef = useRef<{ startX: number; currentX: number } | null>(null)

  // Rotate cards forward (next becomes center)
  const rotateForward = useCallback(() => {
    setCardOrder(prev => {
      const next = [...prev]
      const first = next.shift()!
      next.push(first)
      return next
    })
  }, [])

  // Rotate cards backward (prev becomes center)
  const rotateBackward = useCallback(() => {
    setCardOrder(prev => {
      const next = [...prev]
      const last = next.pop()!
      next.unshift(last)
      return next
    })
  }, [])

  // ── Autoplay every 5s ──
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startAutoplay = useCallback(() => {
    if (autoplayRef.current) clearInterval(autoplayRef.current)
    autoplayRef.current = setInterval(() => {
      rotateForward()
    }, AUTOPLAY_INTERVAL)
  }, [rotateForward])

  useEffect(() => {
    startAutoplay()
    return () => {
      if (autoplayRef.current) clearInterval(autoplayRef.current)
    }
  }, [startAutoplay])

  // ── Mouse swipe gesture (no visual dragging) ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, currentX: e.clientX }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    dragRef.current.currentX = e.clientX
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!dragRef.current) return
    const diff = dragRef.current.currentX - dragRef.current.startX
    const threshold = 40

    if (Math.abs(diff) > threshold) {
      if (diff < 0) rotateForward()
      else rotateBackward()
      startAutoplay() // reset timer after manual swipe
    }

    dragRef.current = null
  }, [rotateForward, rotateBackward, startAutoplay])

  const handleMouseLeave = useCallback(() => {
    if (dragRef.current) handleMouseUp()
  }, [handleMouseUp])

  // ── Touch swipe gesture (no visual dragging) ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    dragRef.current = { startX: touch.clientX, currentX: touch.clientX }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current) return
    dragRef.current.currentX = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback(() => {
    handleMouseUp()
  }, [handleMouseUp])

  return (
    <section className="flex flex-col items-center bg-white pt-6 sm:pt-10 pb-10 sm:pb-14 overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.35);
        }
        @media (min-width: 640px) {
          .hero-collage-inner { transform: scale(0.51); }
        }
        @media (min-width: 768px) {
          .hero-collage-inner { transform: scale(0.63); }
        }
        @media (min-width: 1024px) {
          .hero-collage-inner { transform: scale(0.80); }
        }
        @media (min-width: 1280px) {
          .hero-collage-inner { transform: scale(0.93); }
        }
        @keyframes logo-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .logo-marquee {
          animation: logo-scroll 25s linear infinite;
        }
        .collage-card {
          transition: left 0.7s cubic-bezier(0.25, 0.1, 0.25, 1),
                      top 0.7s cubic-bezier(0.25, 0.1, 0.25, 1),
                      width 0.7s cubic-bezier(0.25, 0.1, 0.25, 1),
                      height 0.7s cubic-bezier(0.25, 0.1, 0.25, 1),
                      z-index 0s,
                      opacity 0.7s ease;
        }
      `}} />

      {/* ─── Collage + floating bubble ─── */}
      <div className="relative w-full mb-6 sm:mb-8">
        <div className="relative w-full h-[154px] sm:h-[224px] md:h-[277px] lg:h-[352px] xl:h-[409px]">

          {/* Collage canvas — swipe gesture area, cards stay in place */}
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none cursor-grab active:cursor-grabbing"
            style={{ width: CANVAS_W, height: CANVAS_H }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {cardOrder.map((imageIdx, posIdx) => {
              const card = BASE_CARDS[posIdx]

              return (
                <div
                  key={imageIdx}
                  className="collage-card absolute rounded-[14px] overflow-hidden shadow-lg shadow-black/8"
                  style={{
                    left: card.left,
                    top: card.top,
                    width: card.width,
                    height: card.height,
                    zIndex: card.zIndex,
                  }}
                >
                  <img
                    src={IMAGES[imageIdx]}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none"
                    draggable={false}
                  />
                </div>
              )
            })}
          </div>

          {/* ── White bubble — centered, overlapping collage, NOT scaled ── */}
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="relative bg-white rounded-[24px] sm:rounded-[28px] shadow-lg shadow-neutral-200/50 border border-neutral-100/80 px-5 pt-10 pb-7 sm:px-10 sm:pt-12 sm:pb-10 md:px-14 md:pt-14 md:pb-12 w-[82%] max-w-[480px] text-center pointer-events-auto">
              {/* Badge — pill on top edge of bubble */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 sm:-top-4">
                <div className="flex items-center gap-1.5 bg-gray-100/95 backdrop-blur-sm text-gray-700 text-[10px] sm:text-[11px] font-medium px-3 sm:px-3.5 py-1.5 rounded-full whitespace-nowrap shadow-sm border border-gray-200/50">
                  <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  Powering 1,550+ Shopify Brands
                </div>
              </div>
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

      {/* ─── Description — 2 rows, ~9-10 words per row ─── */}
      <p className="text-[18px] text-neutral-600 text-center mb-16 sm:mb-20 max-w-lg leading-relaxed px-4">
        Storelib lets you turn big ideas into real products. Create, sell, and grow with your audience.
      </p>

      {/* ─── Scrolling logo marquee with edge fades ─── */}
      <div className="relative w-full">
        {/* Left fade */}
        <div className="absolute left-0 top-0 bottom-0 w-20 sm:w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        {/* Right fade */}
        <div className="absolute right-0 top-0 bottom-0 w-20 sm:w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
        <div className="overflow-hidden">
          <div className="logo-marquee flex items-center w-max">
            {[...PARTNER_LOGOS, ...PARTNER_LOGOS].map((src, i) => (
              <img
                key={i}
                src={src}
                alt="Partner logo"
                className="h-[17px] sm:h-5 md:h-6 w-auto mx-6 sm:mx-8 md:mx-10 opacity-95 grayscale select-none"
                draggable={false}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
