"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"

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
  "https://cdn.sanity.io/images/599r6htc/regionalized/01d4ea19e824b3596f8f6c701d3b8319e49631b0-146x18.svg?q=75&fit=max&auto=format",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/popj.svg",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/eyJidWNrZXQiOiJwYXJ0bmVycGFnZS5wcm9kIiwia2V5IjoibWVkaWEvY29udGFjdF9pbWFnZXMvOWQ0MDVmYmMtNGJkMS00NzEz.svg",
]

// Supabase image transform: width=600&height=750 gives exact 4:5 ratio (matches originals
// which are 1080×1350). resize=cover ensures Supabase preserves aspect ratio. quality=85.
const IMAGES = [
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(5)%20(2).webp?width=600&height=750&resize=cover&quality=80",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(6)%20(1).webp?width=600&height=750&resize=cover&quality=80",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(7)%20(1).webp?width=600&height=750&resize=cover&quality=80",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(13).webp?width=600&height=750&resize=cover&quality=80",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(9).webp?width=600&height=750&resize=cover&quality=80",
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

// Card aspect ratio = 4:5 (1080×1350). 7px gap between every card. Depth scale restored.
// Positions derived by working outward from center (canvas center = 550).
// tx = left + width*(1−scale)/2  →  rendered_left/right verified below.
//
// Desktop — rendered edges (all gaps = 7px):
//   edge -29→161 | 7 | adj 168→403 | 7 | center 410→690 | 7 | adj 697→933 | 7 | edge 940→1130
const DESKTOP_CARDS: CardDef[] = [
  { left: -34,  top: 50, width: 200, height: 250, zIndex: 1, opacity: 0.82, scale: 0.95 },
  { left: 166,  top: 25, width: 240, height: 300, zIndex: 2, opacity: 0.92, scale: 0.98 },
  { left: 410,  top: 0,  width: 280, height: 350, zIndex: 3, opacity: 1,    scale: 1    },
  { left: 695,  top: 25, width: 240, height: 300, zIndex: 2, opacity: 0.92, scale: 0.98 },
  { left: 935,  top: 50, width: 200, height: 250, zIndex: 1, opacity: 0.82, scale: 0.95 },
]

// Mobile — rendered edges (all gaps = 10px):
//   edge   14→184 | 10 | adj 194→410 | 10 | center 420→680 | 10 | adj 690→906 | 10 | edge 916→1087
const MOBILE_CARDS: CardDef[] = [
  { left: 9,    top: 50, width: 180, height: 225, zIndex: 1, opacity: 0,    scale: 0.95 },
  { left: 192,  top: 25, width: 220, height: 275, zIndex: 2, opacity: 0.85, scale: 0.98 },
  { left: 420,  top: 0,  width: 260, height: 325, zIndex: 3, opacity: 1,    scale: 1    },
  { left: 688,  top: 25, width: 220, height: 275, zIndex: 2, opacity: 0.85, scale: 0.98 },
  { left: 911,  top: 50, width: 180, height: 225, zIndex: 1, opacity: 0,    scale: 0.95 },
]

const CANVAS_W = 1100
const CANVAS_H = 375
const AUTOPLAY_INTERVAL = 5000
const CARD_TRANSITION_MS = 1500

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
// Smooth ease-in-out quartic — gentle start AND gentle end for silky autoplay
const ease = (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)
  const [cardOrder, setCardOrder] = useState([0, 1, 2, 3, 4])
  const [transition, setTransition] = useState<CardTransition | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  // imagesLoaded (all-5 flag) removed — text is now shown immediately without waiting
  // for all images. Per-card skeleton uses loadedImages.has(idx) instead.
  const [logosLoaded, setLogosLoaded] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const loadedLogosCount = useRef(0)

  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const orderRef = useRef(cardOrder)
  const animatingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const loadedImageSetRef = useRef(new Set<number>())

  const clearAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current)
      autoplayRef.current = null
    }
  }, [])

  // Cancel any in-progress RAF animation and reset the animating lock.
  const cancelAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    animatingRef.current = false
    setTransition(null)
  }, [])

  const startRotation = useCallback((direction: 1 | -1 = 1) => {
    if (animatingRef.current) return

    const from = orderRef.current
    const to = rotateOrder(from, direction)

    // Skip animation for prefers-reduced-motion or hidden tabs (instant swap)
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced || document.hidden) {
      orderRef.current = to
      setCardOrder(to)
      return
    }

    const start = performance.now()
    animatingRef.current = true

    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / CARD_TRANSITION_MS)
      setTransition({ from, to, progress: ease(raw) })

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
    const supabase = createClient()

    const syncAuthState = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setIsAuthenticated(Boolean(user))
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_creator")
          .eq("id", user.id)
          .maybeSingle()
        setIsCreator(profile?.is_creator ?? false)
      }
    }

    syncAuthState()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user))
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Pause autoplay when hero is scrolled out of view to save CPU
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = sectionRef.current
    if (!el) {
      restartAutoplay()
      return () => {
        clearAutoplay()
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !document.hidden) {
          restartAutoplay()
        } else {
          clearAutoplay()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)

    // Pause animation when tab goes to background — saves CPU/GPU on slow devices
    const onVisibility = () => {
      if (document.hidden) {
        clearAutoplay()
        cancelAnimation()
      } else {
        restartAutoplay()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      clearAutoplay()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [clearAutoplay, restartAutoplay])

  const markImageLoaded = useCallback((idx: number) => {
    if (loadedImageSetRef.current.has(idx)) return
    loadedImageSetRef.current.add(idx)
    setLoadedImages(new Set(loadedImageSetRef.current))
  }, [])

  const loadImageByIndex = useCallback((idx: number) => {
    if (loadedImageSetRef.current.has(idx)) return Promise.resolve()

    return new Promise<void>((resolve) => {
      const img = new Image()
      img.decoding = "async"
      img.onload = () => {
        markImageLoaded(idx)
        resolve()
      }
      img.onerror = () => {
        markImageLoaded(idx)
        resolve()
      }
      img.src = IMAGES[idx]
    })
  }, [markImageLoaded])


  // Progressive image loading for collage:
  // Center + adjacent cards load IN PARALLEL for fast initial display.
  // Sequential queue was too slow on poor connections (5 images × wait-time each).
  // Edge cards (0, 4) are deferred until the browser is idle.
  useEffect(() => {
    const CENTER = 2
    // Fire all three requests simultaneously — browser HTTP/2 handles concurrency
    loadImageByIndex(CENTER)
    loadImageByIndex(CENTER - 1)
    loadImageByIndex(CENTER + 1)

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }).connection
    const isConstrained = Boolean(
      connection?.saveData ||
      connection?.effectiveType?.includes("2g") ||
      connection?.effectiveType === "slow-2g",
    )

    if (isConstrained) return

    const scheduleBackgroundLoad = () => {
      loadImageByIndex(0)
      loadImageByIndex(4)
    }

    if (typeof window.requestIdleCallback === "function") {
      const idleHandle = window.requestIdleCallback(scheduleBackgroundLoad, { timeout: 1400 })
      return () => window.cancelIdleCallback(idleHandle)
    }

    const timeout = window.setTimeout(scheduleBackgroundLoad, 700)
    return () => window.clearTimeout(timeout)
  }, [loadImageByIndex])

  // Ensure currently visible cards are always loaded — load directly, no queue overhead
  useEffect(() => {
    const fromOrder = transition?.from ?? cardOrder
    const toOrder = transition?.to ?? cardOrder
    const prioritized = new Set<number>([
      fromOrder[1], fromOrder[2], fromOrder[3],
      toOrder[1],   toOrder[2],   toOrder[3],
    ])
    for (const idx of prioritized) {
      if (typeof idx === "number") loadImageByIndex(idx)
    }
  }, [cardOrder, loadImageByIndex, transition])

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

  const activeCards = isMobile ? MOBILE_CARDS : DESKTOP_CARDS

  return (
    <section ref={sectionRef} className="flex flex-col items-center bg-white pt-6 sm:pt-10 pb-12 sm:pb-[67px] overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.88);
        }
        @media (min-width: 640px) {
          .hero-collage-inner { transform: scale(0.67); }
        }
        @media (min-width: 768px) {
          .hero-collage-inner { transform: scale(0.80); }
        }
        @media (min-width: 1024px) {
          .hero-collage-inner { transform: scale(0.96); }
        }
        @media (min-width: 1280px) {
          .hero-collage-inner { transform: scale(1.09); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-collage-inner, .collage-card {
            transition: none !important;
            animation: none !important;
          }
        }
        @keyframes logo-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .logo-marquee {
          animation: logo-scroll 30s linear infinite;
          will-change: transform;
          backface-visibility: hidden;
        }
        .collage-card {
          /* Only list GPU-compositable properties — left/top/width/height/filter
             are layout/paint ops that cannot be composited and hurt perf in will-change */
          will-change: transform, opacity;
          backface-visibility: hidden;
          contain: layout style paint;
          /* transform-style: preserve-3d removed — creates an expensive 3D stacking
             context on every card with no visual benefit for this 2D collage */
        }
        .collage-card img {
          content-visibility: auto;
          contain-intrinsic-size: 280px 350px;
        }
      `}} />

      <div className="relative w-full mb-10 sm:mb-8 animate-scale-fade-in">
        <div className="relative w-full h-[330px] sm:h-[251px] md:h-[300px] lg:h-[360px] xl:h-[409px]">
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none"
            style={{ width: CANVAS_W, height: CANVAS_H }}
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
              // saturation removed — was lerped from 0.96→1, imperceptible difference
              // but caused a CSS filter repaint on every RAF tick (60fps × 5 cards)

              // Move position into transform so layout is never triggered during animation.
              // translate3d(x, y, 0) is handled entirely by the GPU compositor —
              // equivalent visual to `left/top` but skips layout + paint each RAF tick.
              // Adjustment matches the original scale-from-center (50% 50%) behaviour:
              //   tx = left + width*(1-scale)/2
              //   ty = top  + height*(1-scale)/2
              const tx = left + width * (1 - scale) / 2
              const ty = top + height * (1 - scale) / 2

              return (
                <div
                  key={imageIdx}
                  className="collage-card absolute rounded-[14px] overflow-hidden shadow-sm shadow-black/10"
                  style={{
                    left: 0,
                    top: 0,
                    width,
                    height,
                    zIndex,
                    opacity,
                    transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
                    transformOrigin: "0 0",
                  }}
                >
                  {!loadedImages.has(imageIdx) ? (
                    <Skeleton className="w-full h-full" />
                  ) : (
                    <img
                      src={src}
                      alt=""
                      className="w-full h-full object-cover pointer-events-none"
                      draggable={false}
                      decoding="async"
                      loading={imageIdx === cardOrder[2] ? "eager" : "lazy"}
                      fetchPriority={imageIdx === cardOrder[2] ? "high" : "low"}
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none -translate-y-[7%] sm:translate-y-0">
            <div className="relative bg-white rounded-[24px] sm:rounded-[28px] shadow-lg shadow-neutral-200/50 border border-neutral-100/80 px-5 sm:px-10 md:px-14 md:pt-14 md:pb-12 w-[82%] max-w-[480px] text-center pointer-events-auto scale-y-[0.99] sm:scale-y-100 origin-top pt-9 pb-9 sm:pt-12 sm:pb-10">
              {/* Text shown immediately — no dependency on image loading state.
                  Previously gated on imagesLoaded which meant ALL 5 collage images
                  had to finish before the headline or CTA text would appear. On slow
                  connections this could take 10–30 s. Now the text appears instantly
                  and the typing cursor starts right away. */}
              <>
                <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 sm:-top-4">
                  <div className="flex items-center gap-2 bg-gray-100/95 backdrop-blur-sm text-gray-700 text-[10px] sm:text-[11px] font-medium px-3 sm:px-3.5 py-1.5 rounded-full whitespace-nowrap shadow-sm border border-gray-200/50">
                    <span className="w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-full bg-gray-900 inline-flex items-center justify-center overflow-hidden">
                      <img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/image2vector.svg" alt="" width={12} height={12} className="w-[10px] h-[10px] sm:w-3 sm:h-3" loading="eager" decoding="async" />
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
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-row items-center gap-3 mb-5 sm:mb-[32px] animate-fade-in-up delay-200">
        <Link
          href="/explore"
          className="inline-flex items-center px-6 sm:px-7 py-2.5 sm:py-3 rounded-full text-sm font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          Discover
        </Link>
        <Link
          href={isAuthenticated ? (isCreator ? "/app" : "/library") : "/signup"}
          className="inline-flex items-center gap-2 px-6 sm:px-7 py-2.5 sm:py-3 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          {isAuthenticated ? (isCreator ? "Dashboard" : "Library") : "Sign Up"}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <p className="text-[16px] sm:text-[19.5px] text-neutral-600 text-center mb-[102px] sm:mb-[127px] max-w-[90%] sm:max-w-[590px] leading-relaxed px-4 mx-auto animate-fade-in-up delay-300">
        The #1 e-commerce platform for creators & entrepreneurs. Sell products, manage links & grow an audience.
      </p>

      <div className="relative w-full animate-fade-in delay-500">
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
              {[...PARTNER_LOGOS, ...PARTNER_LOGOS, ...PARTNER_LOGOS].map((src, i) => {
                const isStripe = src.includes("bbfcc0e04437442a9637cc58efde849dfadb313c")
                const isAnthropic = src.includes("a9bfb23cca986ee16b0547274bcd7461ffd373aa")
                const isAtlassian = src.includes("01d4ea19e824b3596f8f6c701d3b8319e49631b0")
                const isPopj = src.includes("popj.svg")
                const isNewLogo = src.includes("eyJidWNrZXQiOiJwYXJ0bmVycGFnZS5wcm9k")
                const heightClass = isStripe
                  ? "h-[36px] sm:h-[43px] md:h-[51px]"
                  : isAnthropic
                    ? "h-[18px] sm:h-[21px] md:h-[26px]"
                    : isAtlassian
                      ? "h-[15px] sm:h-[18px] md:h-[22px]"
                      : isPopj
                        ? "h-[30px] sm:h-[36px] md:h-[43px]"
                        : isNewLogo
                          ? "h-[22px] sm:h-[26px] md:h-[31px]"
                          : "h-[17px] sm:h-5 md:h-6"
                return (
                  <img
                    key={i}
                    src={src}
                    alt="Partner logo"
                    className={`w-auto mx-6 sm:mx-8 md:mx-10 opacity-95 grayscale select-none ${heightClass}`}
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
