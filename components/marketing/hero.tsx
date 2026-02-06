"use client"

import { useState, useEffect, useRef, useCallback, type WheelEvent } from "react"
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
        const t = setTimeout(
          () => setDisplayText(current.slice(0, displayText.length + 1)),
          typingSpeed,
        )
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
}

const DESKTOP_CARDS: CardDef[] = [
  { left: -120, top: 60, width: 238, height: 294, zIndex: 1 },
  { left: 106, top: 30, width: 289, height: 357, zIndex: 2 },
  { left: 380, top: 0, width: 340, height: 420, zIndex: 3 },
  { left: 705, top: 30, width: 289, height: 357, zIndex: 2 },
  { left: 982, top: 60, width: 238, height: 294, zIndex: 1 },
]

const MOBILE_CARDS: CardDef[] = [
  { left: -178, top: 58, width: 152, height: 198, zIndex: 1, opacity: 0 },
  { left: 40, top: 38, width: 174, height: 228, zIndex: 2 },
  { left: 184, top: 0, width: 232, height: 304, zIndex: 3 },
  { left: 386, top: 38, width: 174, height: 228, zIndex: 2 },
  { left: 596, top: 58, width: 152, height: 198, zIndex: 1, opacity: 0 },
]

const CANVAS_W = 1100
const CANVAS_H = 440
const AUTOPLAY_INTERVAL = 5000
const DESKTOP_ROTATE_STEP = 196
const MOBILE_ROTATE_STEP = 160

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const lerp = (from: number, to: number, t: number) => from + (to - from) * t

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)
  const [cardOrder, setCardOrder] = useState([0, 1, 2, 3, 4])
  const [isMobile, setIsMobile] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [isReady, setIsReady] = useState(false)

  const dragRef = useRef<{ startX: number; active: boolean }>({ startX: 0, active: false })
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wheelBufferRef = useRef(0)
  const autoplayResumeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rotateForward = useCallback(() => {
    setCardOrder((prev) => {
      const next = [...prev]
      const first = next.shift()!
      next.push(first)
      return next
    })
  }, [])

  const rotateBackward = useCallback(() => {
    setCardOrder((prev) => {
      const next = [...prev]
      const last = next.pop()!
      next.unshift(last)
      return next
    })
  }, [])

  const getStep = useCallback(() => (isMobile ? MOBILE_ROTATE_STEP : DESKTOP_ROTATE_STEP), [isMobile])

  const startAutoplay = useCallback(() => {
    if (autoplayRef.current) clearInterval(autoplayRef.current)
    autoplayRef.current = setInterval(() => {
      if (!dragRef.current.active) rotateForward()
    }, AUTOPLAY_INTERVAL)
  }, [rotateForward])

  useEffect(() => {
    startAutoplay()
    return () => {
      if (autoplayRef.current) clearInterval(autoplayRef.current)
      if (autoplayResumeRef.current) clearTimeout(autoplayResumeRef.current)
    }
  }, [startAutoplay])

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsReady(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) clearInterval(autoplayRef.current)
  }, [])

  const queueAutoplayResume = useCallback(() => {
    if (autoplayResumeRef.current) clearTimeout(autoplayResumeRef.current)
    autoplayResumeRef.current = setTimeout(() => {
      if (!dragRef.current.active) startAutoplay()
    }, 1100)
  }, [startAutoplay])

  const handleDragStart = useCallback((clientX: number) => {
    dragRef.current = { startX: clientX, active: true }
    setDragOffset(0)
    stopAutoplay()
  }, [stopAutoplay])

  const handleDragMove = useCallback((clientX: number) => {
    if (!dragRef.current.active) return

    const step = getStep()
    const diff = clientX - dragRef.current.startX
    setDragOffset(diff)

    if (diff <= -step) {
      rotateForward()
      dragRef.current.startX -= step
      setDragOffset(clientX - dragRef.current.startX)
    } else if (diff >= step) {
      rotateBackward()
      dragRef.current.startX += step
      setDragOffset(clientX - dragRef.current.startX)
    }
  }, [getStep, rotateBackward, rotateForward])

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setDragOffset(0)
    startAutoplay()
  }, [startAutoplay])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => handleDragMove(event.clientX)
    const onMouseUp = () => handleDragEnd()

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [handleDragEnd, handleDragMove])

  const activeCards = isMobile ? MOBILE_CARDS : DESKTOP_CARDS
  const dragProgress = clamp(dragOffset / getStep(), -1, 1)

  const getCardStyle = useCallback((positionIndex: number): CardDef => {
    const current = activeCards[positionIndex]
    if (!current) return activeCards[2]

    if (dragProgress === 0) return current

    const movingLeft = dragProgress < 0
    const targetIndex = movingLeft
      ? clamp(positionIndex + 1, 0, activeCards.length - 1)
      : clamp(positionIndex - 1, 0, activeCards.length - 1)

    const target = activeCards[targetIndex]
    const t = Math.abs(dragProgress)

    return {
      left: lerp(current.left, target.left, t),
      top: lerp(current.top, target.top, t),
      width: lerp(current.width, target.width, t),
      height: lerp(current.height, target.height, t),
      zIndex: Math.round(lerp(current.zIndex, target.zIndex, t)),
      opacity: lerp(current.opacity ?? 1, target.opacity ?? 1, t),
    }
  }, [activeCards, dragProgress])

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    stopAutoplay()

    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    wheelBufferRef.current += dominantDelta

    if (Math.abs(wheelBufferRef.current) >= 130) {
      if (wheelBufferRef.current > 0) {
        rotateForward()
      } else {
        rotateBackward()
      }
      wheelBufferRef.current = 0
    }

    queueAutoplayResume()
  }, [queueAutoplayResume, rotateBackward, rotateForward, stopAutoplay])

  return (
    <section className={`flex flex-col items-center bg-white pt-6 sm:pt-10 pb-12 sm:pb-[67px] overflow-hidden transition-all duration-700 ease-out ${isReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.41);
          transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
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
          transition: left 0.22s cubic-bezier(0.22, 1, 0.36, 1),
                      top 0.22s cubic-bezier(0.22, 1, 0.36, 1),
                      width 0.22s cubic-bezier(0.22, 1, 0.36, 1),
                      height 0.22s cubic-bezier(0.22, 1, 0.36, 1),
                      opacity 0.22s ease;
          will-change: left, top, width, height, opacity;
        }
      `}} />

      <div className="relative w-full mb-6 sm:mb-8">
        <div className="relative w-full h-[154px] sm:h-[224px] md:h-[277px] lg:h-[352px] xl:h-[409px]">
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none cursor-grab active:cursor-grabbing"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              handleDragStart(e.clientX)
            }}
            onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
            onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
            onTouchEnd={handleDragEnd}
            onWheel={handleWheel}
          >
            {cardOrder.map((imageIdx, posIdx) => {
              const card = getCardStyle(posIdx)

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
                    opacity: card.opacity ?? 1,
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
                      className="w-[165%] h-[165%] object-cover object-left"
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
