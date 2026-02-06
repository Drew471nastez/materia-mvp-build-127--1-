"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

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

    if (displayText.length > 0) {
      const t = setTimeout(() => setDisplayText(displayText.slice(0, -1)), deletingSpeed)
      return () => clearTimeout(t)
    }

    setPhraseIndex((p) => (p + 1) % phrases.length)
    setPhase("typing")
  }, [displayText, phraseIndex, phase, phrases, typingSpeed, deletingSpeed, pauseDuration])

  return displayText
}

const PARTNER_LOGOS = [
  "https://cdn.sanity.io/images/599r6htc/regionalized/a9bfb23cca986ee16b0547274bcd7461ffd373aa-67x18.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/bbfcc0e04437442a9637cc58efde849dfadb313c-76x48.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/927f806a262abfc02a79d68fc83dd6f960a06ada-141x28.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/01d4ea19e824b3596f8f6c701d3b8319e49631b0-146x18.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/5e789db505180ee41e0612d7d53e2ec48c9c5837-153x20.svg?q=75&fit=max&auto=format",
]

const IMAGES = [
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/1351351.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/2423.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitle1411241d%20design.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/1212.png",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/51351.png",
]

interface CardDef {
  left: number
  top: number
  width: number
  height: number
  zIndex: number
  opacity?: number
  scale?: number
}

const DESKTOP_CARDS: CardDef[] = [
  { left: -120, top: 60, width: 238, height: 294, zIndex: 1, opacity: 0.82, scale: 0.95 },
  { left: 106, top: 30, width: 289, height: 357, zIndex: 2, opacity: 0.92, scale: 0.98 },
  { left: 380, top: 0, width: 340, height: 420, zIndex: 3, opacity: 1, scale: 1 },
  { left: 705, top: 30, width: 289, height: 357, zIndex: 2, opacity: 0.92, scale: 0.98 },
  { left: 982, top: 60, width: 238, height: 294, zIndex: 1, opacity: 0.82, scale: 0.95 },
]

const MOBILE_CARDS: CardDef[] = [
  { left: -120, top: 84, width: 220, height: 286, zIndex: 1, opacity: 0, scale: 0.92 },
  { left: 118, top: 52, width: 252, height: 328, zIndex: 2, opacity: 0.85, scale: 0.92 },
  { left: 380, top: 0, width: 340, height: 442, zIndex: 3, opacity: 1, scale: 1 },
  { left: 730, top: 52, width: 252, height: 328, zIndex: 2, opacity: 0.85, scale: 0.92 },
  { left: 1000, top: 84, width: 220, height: 286, zIndex: 1, opacity: 0, scale: 0.92 },
]

const CANVAS_W = 1100
const CANVAS_H = 460
const AUTOPLAY_INTERVAL = 5000

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)
  const [cardOrder, setCardOrder] = useState([0, 1, 2, 3, 4])
  const [isMobile, setIsMobile] = useState(false)
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const rotateForward = useCallback(() => {
    setCardOrder((prev) => {
      const next = [...prev]
      const first = next.shift()!
      next.push(first)
      return next
    })
  }, [])

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    autoplayRef.current = setInterval(() => rotateForward(), AUTOPLAY_INTERVAL)

    return () => {
      if (autoplayRef.current) clearInterval(autoplayRef.current)
    }
  }, [rotateForward])

  const activeCards = isMobile ? MOBILE_CARDS : DESKTOP_CARDS

  return (
    <section className="flex flex-col items-center bg-white pt-6 sm:pt-10 pb-12 sm:pb-[67px] overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.90);
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
          transition: left 1.05s cubic-bezier(0.2, 0.85, 0.22, 1),
                      top 1.05s cubic-bezier(0.2, 0.85, 0.22, 1),
                      width 1.05s cubic-bezier(0.2, 0.85, 0.22, 1),
                      height 1.05s cubic-bezier(0.2, 0.85, 0.22, 1),
                      opacity 0.95s ease,
                      transform 1.05s cubic-bezier(0.2, 0.85, 0.22, 1),
                      filter 0.95s ease;
          will-change: left, top, width, height, opacity, transform, filter;
        }
      `}} />

      <div className="relative w-full mb-6 sm:mb-8">
        <div className="relative w-full h-[206px] sm:h-[224px] md:h-[277px] lg:h-[352px] xl:h-[409px]">
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {cardOrder.map((imageIdx, posIdx) => {
              const card = activeCards[posIdx]

              return (
                <div
                  key={imageIdx}
                  className="collage-card absolute rounded-[14px] overflow-hidden shadow-sm shadow-black/10"
                  style={{
                    left: card.left,
                    top: card.top,
                    width: card.width,
                    height: card.height,
                    zIndex: card.zIndex,
                    opacity: card.opacity ?? 1,
                    transform: `scale(${card.scale ?? 1})`,
                    filter: card.zIndex === 3 ? "saturate(1)" : "saturate(0.96)",
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

          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="relative bg-white rounded-[24px] sm:rounded-[28px] shadow-lg shadow-neutral-200/50 border border-neutral-100/80 px-5 pt-10 pb-7 sm:px-10 sm:pt-12 sm:pb-10 md:px-14 md:pt-14 md:pb-12 w-[82%] max-w-[480px] text-center pointer-events-auto">
              <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 sm:-top-4">
                <div className="flex items-center gap-2 bg-gray-100/95 backdrop-blur-sm text-gray-700 text-[10px] sm:text-[11px] font-medium px-3 sm:px-3.5 py-1.5 rounded-full whitespace-nowrap shadow-sm border border-gray-200/50">
                  <span className="w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-full bg-black inline-flex items-center justify-center overflow-hidden">
                    <img
                      src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/logostorelib_pixian_ai.png"
                      alt="Storelib logo"
                      className="w-full h-full object-contain p-[1px]"
                    />
                  </span>
                  Built for Creators
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

      <p className="text-[16px] sm:text-[18px] text-neutral-600 text-center mb-[74px] sm:mb-[92px] max-w-lg leading-relaxed px-4">
        Storelib lets you turn big ideas into real products. Create, sell, and grow with your audience.
      </p>

      <div className="relative w-full">
        <div className="absolute left-0 top-0 bottom-0 w-20 sm:w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
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
