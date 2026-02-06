"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

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

interface CardTransition {
  from: number[]
  to: number[]
  progress: number
}

const DESKTOP_CARDS: CardDef[] = [
  { left: -120, top: 60, width: 238, height: 294, zIndex: 1, opacity: 0.82, scale: 0.95 },
  { left: 106, top: 30, width: 289, height: 357, zIndex: 2, opacity: 0.92, scale: 0.98 },
  { left: 380, top: 0, width: 340, height: 420, zIndex: 3, opacity: 1, scale: 1 },
  { left: 705, top: 30, width: 289, height: 357, zIndex: 2, opacity: 0.92, scale: 0.98 },
  { left: 982, top: 60, width: 238, height: 294, zIndex: 1, opacity: 0.82, scale: 0.95 },
]

const MOBILE_CARDS: CardDef[] = [
  { left: -150, top: 86, width: 206, height: 268, zIndex: 1, opacity: 0, scale: 0.92 },
  { left: 162, top: 48, width: 262, height: 341, zIndex: 2, opacity: 0.85, scale: 0.92 },
  { left: 380, top: 0, width: 340, height: 442, zIndex: 3, opacity: 1, scale: 1 },
  { left: 676, top: 48, width: 262, height: 341, zIndex: 2, opacity: 0.85, scale: 0.92 },
  { left: 1044, top: 86, width: 206, height: 268, zIndex: 1, opacity: 0, scale: 0.92 },
]

const CANVAS_W = 1100
const CANVAS_H = 460
const AUTOPLAY_INTERVAL = 5000
const CARD_TRANSITION_MS = 1200
const SWIPE_THRESHOLD = 40
const SWIPE_COMMIT_DISTANCE = 140
const DRAG_SMOOTHING = 0.42
const DRAG_SLOWDOWN = 0.60
const MAX_DRAG_DISTANCE = 180

const rotateOrder = (order: number[], direction: 1 | -1) => {
  const next = [...order]
  if (direction === 1) {
    const first = next.shift()!
    next.push(first)
  } else {
    const last = next.pop()!
    next.unshift(last)
  }
  return next
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t
const ease = (t: number) => 1 - Math.pow(1 - t, 3)

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)
  const [cardOrder, setCardOrder] = useState([0, 1, 2, 3, 4])
  const [transition, setTransition] = useState<CardTransition | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [logosLoaded, setLogosLoaded] = useState(false)
  const loadedImagesCount = useRef(0)
  const loadedLogosCount = useRef(0)

  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const orderRef = useRef(cardOrder)
  const animatingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const dragRef = useRef({ active: false, startX: 0, delta: 0, rawDelta: 0 })

  const clearAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current)
      autoplayRef.current = null
    }
  }, [])

  const startRotation = useCallback((direction: 1 | -1 = 1, initialProgress = 0) => {
    if (animatingRef.current) return

    const from = orderRef.current
    const to = rotateOrder(from, direction)
    const start = performance.now()

    animatingRef.current = true

    const tick = (now: number) => {
      const remaining = Math.max(0.001, 1 - initialProgress)
      const duration = Math.max(180, CARD_TRANSITION_MS * remaining)
      const raw = Math.min(1, (now - start) / duration)
      const progress = initialProgress + (1 - initialProgress) * ease(raw)
      setTransition({ from, to, progress })

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      orderRef.current = to
      setCardOrder(to)
      setTransition(null)
      animatingRef.current = false
      rafRef.current = null
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const restartAutoplay = useCallback(() => {
    clearAutoplay()
    autoplayRef.current = setInterval(() => startRotation(1), AUTOPLAY_INTERVAL)
  }, [clearAutoplay, startRotation])

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    restartAutoplay()

    return () => {
      clearAutoplay()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [clearAutoplay, restartAutoplay])

  // Preload collage images
  useEffect(() => {
    loadedImagesCount.current = 0
    const loadImage = (src: string) => {
      return new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => {
          loadedImagesCount.current++
          if (loadedImagesCount.current === IMAGES.length) {
            setImagesLoaded(true)
          }
          resolve()
        }
        img.onerror = () => {
          loadedImagesCount.current++
          if (loadedImagesCount.current === IMAGES.length) {
            setImagesLoaded(true)
          }
          resolve()
        }
        img.src = src
      })
    }

    Promise.all(IMAGES.map(loadImage))
  }, [])

  // Preload partner logos
  useEffect(() => {
    loadedLogosCount.current = 0
    const loadLogo = (src: string) => {
      return new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => {
          loadedLogosCount.current++
          if (loadedLogosCount.current === PARTNER_LOGOS.length) {
            setLogosLoaded(true)
          }
          resolve()
        }
        img.onerror = () => {
          loadedLogosCount.current++
          if (loadedLogosCount.current === PARTNER_LOGOS.length) {
            setLogosLoaded(true)
          }
          resolve()
        }
        img.src = src
      })
    }

    Promise.all(PARTNER_LOGOS.map(loadLogo))
  }, [])

  const updateDragTransition = useCallback((rawDelta: number) => {
    // Clamp raw delta to prevent excessive dragging
    const clampedRawDelta = Math.max(-MAX_DRAG_DISTANCE, Math.min(MAX_DRAG_DISTANCE, rawDelta))
    dragRef.current.rawDelta = clampedRawDelta

    const slowedDelta = clampedRawDelta * DRAG_SLOWDOWN
    const smoothedDelta = lerp(dragRef.current.delta, slowedDelta, DRAG_SMOOTHING)
    dragRef.current.delta = smoothedDelta

    const distance = Math.abs(smoothedDelta)
    if (distance < 1) {
      setTransition(null)
      return
    }

    const direction = clampedRawDelta < 0 ? 1 : -1
    const progress = Math.min(0.88, distance / SWIPE_COMMIT_DISTANCE)
    const from = orderRef.current
    const to = rotateOrder(from, direction)
    setTransition({ from, to, progress })
  }, [])

  const activeCards = isMobile ? MOBILE_CARDS : DESKTOP_CARDS

  return (
    <section className="flex flex-col items-center bg-white pt-6 sm:pt-10 pb-12 sm:pb-[67px] overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.70);
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
          will-change: left, top, width, height, opacity, transform, filter;
          backface-visibility: hidden;
          transform-style: preserve-3d;
        }
      `}} />

      <div className="relative w-full mb-10 sm:mb-8">
        <div className="relative w-full h-[296px] sm:h-[224px] md:h-[277px] lg:h-[352px] xl:h-[409px]">
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none cursor-pointer"
            style={{ width: CANVAS_W, height: CANVAS_H }}
            onTouchStart={(e) => {
              clearAutoplay()
              dragRef.current = { active: true, startX: e.touches[0].clientX, delta: 0, rawDelta: 0 }
            }}
            onTouchMove={(e) => {
              if (!dragRef.current.active || animatingRef.current) return
              updateDragTransition(e.touches[0].clientX - dragRef.current.startX)
            }}
            onTouchEnd={(e) => {
              if (!dragRef.current.active) return

              const rawDelta = dragRef.current.rawDelta || e.changedTouches[0].clientX - dragRef.current.startX
              const progress = transition?.progress ?? Math.min(0.95, Math.abs(rawDelta * DRAG_SLOWDOWN) / SWIPE_COMMIT_DISTANCE)
              dragRef.current.active = false
              dragRef.current.delta = 0
              dragRef.current.rawDelta = 0

              if (Math.abs(rawDelta) >= SWIPE_THRESHOLD) {
                startRotation(rawDelta < 0 ? 1 : -1, progress)
              } else {
                setTransition(null)
              }

              restartAutoplay()
            }}
            onTouchCancel={() => {
              dragRef.current.active = false
              dragRef.current.delta = 0
              dragRef.current.rawDelta = 0
              setTransition(null)
              restartAutoplay()
            }}
            onMouseDown={(e) => {
              clearAutoplay()
              dragRef.current = { active: true, startX: e.clientX, delta: 0, rawDelta: 0 }
            }}
            onMouseMove={(e) => {
              if (!dragRef.current.active || animatingRef.current) return
              updateDragTransition(e.clientX - dragRef.current.startX)
            }}
            onMouseUp={(e) => {
              if (!dragRef.current.active) return

              const rawDelta = dragRef.current.rawDelta || e.clientX - dragRef.current.startX
              const clampedDelta = Math.max(-MAX_DRAG_DISTANCE, Math.min(MAX_DRAG_DISTANCE, rawDelta))
              const progress = transition?.progress ?? Math.min(0.88, Math.abs(clampedDelta * DRAG_SLOWDOWN) / SWIPE_COMMIT_DISTANCE)
              dragRef.current.active = false
              dragRef.current.delta = 0
              dragRef.current.rawDelta = 0

              if (Math.abs(clampedDelta) >= SWIPE_THRESHOLD) {
                startRotation(clampedDelta < 0 ? 1 : -1, progress)
              } else {
                setTransition(null)
              }

              restartAutoplay()
            }}
            onMouseLeave={() => {
              if (!dragRef.current.active) return

              const rawDelta = dragRef.current.rawDelta
              const clampedDelta = Math.max(-MAX_DRAG_DISTANCE, Math.min(MAX_DRAG_DISTANCE, rawDelta))
              const progress = transition?.progress ?? Math.min(0.88, Math.abs(clampedDelta * DRAG_SLOWDOWN) / SWIPE_COMMIT_DISTANCE)
              dragRef.current.active = false
              dragRef.current.delta = 0
              dragRef.current.rawDelta = 0

              if (Math.abs(clampedDelta) >= SWIPE_THRESHOLD) {
                startRotation(clampedDelta < 0 ? 1 : -1, progress)
              } else {
                setTransition(null)
              }

              restartAutoplay()
            }}
          >
            {IMAGES.map((src, imageIdx) => {
              const fromPos = transition ? transition.from.indexOf(imageIdx) : cardOrder.indexOf(imageIdx)
              const toPos = transition ? transition.to.indexOf(imageIdx) : fromPos
              const fromCard = activeCards[fromPos]
              const toCard = activeCards[toPos]
              const t = transition?.progress ?? 1

              const left = lerp(fromCard.left, toCard.left, t)
              const top = lerp(fromCard.top, toCard.top, t)
              const width = lerp(fromCard.width, toCard.width, t)
              const height = lerp(fromCard.height, toCard.height, t)
              const scale = lerp(fromCard.scale ?? 1, toCard.scale ?? 1, t)
              const opacity = lerp(fromCard.opacity ?? 1, toCard.opacity ?? 1, t)
              const zIndex = Math.round(lerp(fromCard.zIndex, toCard.zIndex, t))
              const saturation = lerp(fromCard.zIndex === 3 ? 1 : 0.96, toCard.zIndex === 3 ? 1 : 0.96, t)

              return (
                <div
                  key={imageIdx}
                  className="collage-card absolute rounded-[14px] overflow-hidden shadow-sm shadow-black/10"
                  style={{
                    left,
                    top,
                    width,
                    height,
                    zIndex,
                    opacity,
                    transform: `translateZ(0) scale(${scale})`,
                    filter: `saturate(${saturation})`,
                  }}
                >
                  {!imagesLoaded ? (
                    <Skeleton className="w-full h-full" />
                  ) : (
                    <img
                      src={src}
                      alt=""
                      className="w-full h-full object-cover pointer-events-none"
                      draggable={false}
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none -translate-y-[2%] sm:translate-y-0">
            <div className="relative bg-white rounded-[24px] sm:rounded-[28px] shadow-lg shadow-neutral-200/50 border border-neutral-100/80 px-5 sm:px-10 md:px-14 md:pt-14 md:pb-12 w-[82%] max-w-[480px] text-center pointer-events-auto scale-y-[0.99] sm:scale-y-100 origin-top pt-9 pb-9 sm:pt-12 sm:pb-10">
              {!imagesLoaded ? (
                <>
                  <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 sm:-top-4">
                    <Skeleton className="h-[28px] sm:h-[30px] w-[120px] rounded-full" />
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <Skeleton className="h-[28px] sm:h-[36px] md:h-[46px] w-[85%]" />
                    <Skeleton className="h-[28px] sm:h-[36px] md:h-[46px] w-[75%]" />
                  </div>
                </>
              ) : (
                <>
                  <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 sm:-top-4">
                    <div className="flex items-center gap-2 bg-gray-100/95 backdrop-blur-sm text-gray-700 text-[10px] sm:text-[11px] font-medium px-3 sm:px-3.5 py-1.5 rounded-full whitespace-nowrap shadow-sm border border-gray-200/50">
                      <span className="w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-full bg-black inline-flex items-center justify-center overflow-hidden">
                        <img
                          src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/logostorelib_pixian_ai.png"
                          alt="Storelib logo"
                          className="w-full h-full object-contain p-[1px]"
                        />
                      </span>
                      All-in-one
                    </div>
                  </div>
                  <h1 className="text-[22px] sm:text-3xl md:text-[38px] md:leading-[1.2] font-bold text-neutral-900 leading-tight min-h-[2.5em] sm:min-h-[2.4em] flex items-center justify-center">
                    <span>
                      {typedText}
                      <span className="inline-block w-[3px] h-[0.85em] bg-violet-500 ml-0.5 animate-pulse align-middle rounded-full" />
                    </span>
                  </h1>
                </>
              )}
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
          Start Selling
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <p className="text-[16px] sm:text-[19.5px] text-neutral-600 text-center mb-[102px] sm:mb-[127px] max-w-[90%] sm:max-w-[480px] leading-relaxed px-4">
        The #1 e-commerce platform for creators & entrepreneurs. Create, sell, and grow with your audience.
      </p>

      <div className="relative w-full">
        <div className="absolute left-0 top-0 bottom-0 w-20 sm:w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 sm:w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
        <div className="overflow-hidden">
          {!logosLoaded ? (
            <div className="flex items-center justify-center gap-6 sm:gap-8 md:gap-10 py-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-[17px] sm:h-5 md:h-6 w-[60px] sm:w-[80px] md:w-[100px]" />
              ))}
            </div>
          ) : (
            <div className="logo-marquee flex items-center w-max">
              {[...PARTNER_LOGOS, ...PARTNER_LOGOS].map((src, i) => {
                const isStripe = src.includes("bbfcc0e04437442a9637cc58efde849dfadb313c")
                return (
                  <img
                    key={i}
                    src={src}
                    alt="Partner logo"
                    className={`w-auto mx-6 sm:mx-8 md:mx-10 opacity-95 grayscale select-none ${
                      isStripe ? "h-[36px] sm:h-[43px] md:h-[51px]" : "h-[17px] sm:h-5 md:h-6"
                    }`}
                    draggable={false}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
