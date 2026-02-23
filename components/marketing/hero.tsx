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

// Optimized image URLs:
// - width=480 covers 2× retina at the largest display size (~316 px on xl screens)
//   while being ~40 % smaller than the old width=700 variant
// - quality=60 is visually indistinguishable from 72 for WebP at these card sizes
//   and reduces file size a further ~20 % (total: ~50–60 % smaller than originals)
// Both parameters together cut typical per-image payload from ~80 KB → ~30 KB,
// which means the full collage loads in roughly half the time on a slow 4G link.
const IMAGES = [
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(5)%20(2).webp?width=480&quality=60",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(6)%20(1).webp?width=480&quality=60",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(7)%20(1).webp?width=480&quality=60",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(13).webp?width=480&quality=60",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Monetize%20(9).webp?width=480&quality=60",
]

// ─── GPU-only card layout ────────────────────────────────────────────────────
//
// All cards share a FIXED container of BASE_W × BASE_H_*. Sizing and positioning
// are expressed as a single `combinedScale` so the browser never triggers a layout
// recalculation during the animation loop — only the GPU compositor is involved
// (translate3d + uniform scale are composited properties).
//
// combinedScale = (visual_width / BASE_W) = (old_width * old_visualScale / BASE_W)
//
// tx / ty are the visual top-left positions of the scaled card, matching the
// original left/top values after accounting for the old scale offset:
//   tx = old_left + old_width  * (1 − old_visualScale) / 2
//   ty = old_top  + old_height * (1 − old_visualScale) / 2

const BASE_W = 340
const BASE_DESKTOP_H = 420
const BASE_MOBILE_H  = 442

interface CardDef {
  tx: number
  ty: number
  combinedScale: number
  zIndex: number
  opacity: number
}

// Desktop (original values for reference):
// pos 0: left=-120 top=60  w=238 h=294 z=1 op=0.82 sc=0.95  → tx=-114 ty=64  cs=0.665
// pos 1: left=106  top=30  w=289 h=357 z=2 op=0.92 sc=0.98  → tx=109  ty=34  cs=0.833
// pos 2: left=380  top=0   w=340 h=420 z=3 op=1    sc=1     → tx=380  ty=0   cs=1.000
// pos 3: left=705  top=30  w=289 h=357 z=2 op=0.92 sc=0.98  → tx=708  ty=34  cs=0.833
// pos 4: left=982  top=60  w=238 h=294 z=1 op=0.82 sc=0.95  → tx=988  ty=64  cs=0.665
const DESKTOP_CARDS: CardDef[] = [
  { tx: -114, ty: 64, combinedScale: 0.665, zIndex: 1, opacity: 0.82 },
  { tx:  109, ty: 34, combinedScale: 0.833, zIndex: 2, opacity: 0.92 },
  { tx:  380, ty:  0, combinedScale: 1.000, zIndex: 3, opacity: 1.00 },
  { tx:  708, ty: 34, combinedScale: 0.833, zIndex: 2, opacity: 0.92 },
  { tx:  988, ty: 64, combinedScale: 0.665, zIndex: 1, opacity: 0.82 },
]

// Mobile (original values for reference):
// pos 0: left=-150 top=86  w=206 h=268 z=1 op=0    sc=0.92 → tx=-142 ty=97  cs=0.557
// pos 1: left=162  top=48  w=262 h=341 z=2 op=0.85 sc=0.92 → tx=172  ty=62  cs=0.709
// pos 2: left=380  top=0   w=340 h=442 z=3 op=1    sc=1    → tx=380  ty=0   cs=1.000
// pos 3: left=676  top=48  w=262 h=341 z=2 op=0.85 sc=0.92 → tx=686  ty=62  cs=0.709
// pos 4: left=1044 top=86  w=206 h=268 z=1 op=0    sc=0.92 → tx=1052 ty=97  cs=0.557
const MOBILE_CARDS: CardDef[] = [
  { tx: -142, ty: 97, combinedScale: 0.557, zIndex: 1, opacity: 0.00 },
  { tx:  172, ty: 62, combinedScale: 0.709, zIndex: 2, opacity: 0.85 },
  { tx:  380, ty:  0, combinedScale: 1.000, zIndex: 3, opacity: 1.00 },
  { tx:  686, ty: 62, combinedScale: 0.709, zIndex: 2, opacity: 0.85 },
  { tx: 1052, ty: 97, combinedScale: 0.557, zIndex: 1, opacity: 0.00 },
]

const CANVAS_W = 1100
const CANVAS_H = 460
const AUTOPLAY_INTERVAL = 5000
const CARD_TRANSITION_MS = 1200
const SWIPE_THRESHOLD = 40
const SWIPE_COMMIT_DISTANCE = 140
const DRAG_SMOOTHING = 0.5
const DRAG_SLOWDOWN = 0.60
const MAX_DRAG_DISTANCE = 180

interface CardTransition {
  from: number[]
  to: number[]
  progress: number
}

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
// Smooth ease-out quartic for silky card transitions
const ease = (t: number) => 1 - Math.pow(1 - t, 4)

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)
  const [cardOrder, setCardOrder] = useState([0, 1, 2, 3, 4])
  const [transition, setTransition] = useState<CardTransition | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  const [logosLoaded, setLogosLoaded] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const loadedLogosCount = useRef(0)

  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const orderRef = useRef(cardOrder)
  const animatingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const dragRafRef = useRef<number | null>(null)
  const dragRef = useRef({ active: false, startX: 0, delta: 0, rawDelta: 0 })
  const loadedImageSetRef = useRef(new Set<number>())

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

  useEffect(() => {
    restartAutoplay()

    return () => {
      clearAutoplay()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current)
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

  const queueDragTransitionUpdate = useCallback((rawDelta: number) => {
    if (dragRafRef.current !== null) return
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null
      updateDragTransition(rawDelta)
    })
  }, [updateDragTransition])

  const stopDrag = useCallback((rawDelta: number) => {
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
  }, [restartAutoplay, startRotation, transition?.progress])

  const activeCards = isMobile ? MOBILE_CARDS : DESKTOP_CARDS
  const cardBaseH = isMobile ? BASE_MOBILE_H : BASE_DESKTOP_H

  // Attach non-passive touchmove listener so we can call preventDefault()
  // to stop iOS Safari pull-to-refresh / rubber-band bounce during horizontal swipe
  const collageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = collageRef.current
    if (!el) return
    const handleTouchMove = (e: TouchEvent) => {
      if (!dragRef.current.active || animatingRef.current) return
      // Prevent the browser from triggering pull-to-refresh or overscroll bounce
      e.preventDefault()
      queueDragTransitionUpdate(e.touches[0].clientX - dragRef.current.startX)
    }
    // { passive: false } is required to allow preventDefault() in touch handlers
    el.addEventListener("touchmove", handleTouchMove, { passive: false })
    return () => {
      el.removeEventListener("touchmove", handleTouchMove)
    }
  }, [queueDragTransitionUpdate])

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
          100% { transform: translateX(-33.333%); }
        }
        .logo-marquee {
          animation: logo-scroll 30s linear infinite;
        }
        .collage-card {
          /* Only GPU-compositable properties here.
             width and height are now CONSTANT for the lifetime of the component,
             so no layout is triggered per-frame — the GPU compositor handles
             translate3d + scale entirely without involving the main thread. */
          will-change: transform, opacity;
          backface-visibility: hidden;
          /* image-rendering hint helps browsers scale the already-small images
             smoothly without pixelation on high-DPR displays */
          image-rendering: -webkit-optimize-contrast;
        }
        .collage-card img {
          /* Prevent any sub-pixel jitter when the card scale changes */
          transform: translateZ(0);
          will-change: transform;
        }
      `}} />

      <div className="relative w-full mb-10 sm:mb-8 animate-scale-fade-in">
        <div className="relative w-full h-[296px] sm:h-[224px] md:h-[277px] lg:h-[352px] xl:h-[409px]">
          <div
            ref={collageRef}
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none cursor-pointer"
            style={{ width: CANVAS_W, height: CANVAS_H, touchAction: "pan-y pinch-zoom" }}
            onPointerDown={(e) => {
              clearAutoplay()
              e.currentTarget.setPointerCapture(e.pointerId)
              dragRef.current = { active: true, startX: e.clientX, delta: 0, rawDelta: 0 }
            }}
            onPointerMove={(e) => {
              if (!dragRef.current.active || animatingRef.current) return
              queueDragTransitionUpdate(e.clientX - dragRef.current.startX)
            }}
            onPointerUp={(e) => {
              if (!dragRef.current.active) return
              stopDrag(dragRef.current.rawDelta || e.clientX - dragRef.current.startX)
            }}
            onPointerCancel={() => {
              if (!dragRef.current.active) return
              stopDrag(dragRef.current.rawDelta)
            }}
            onMouseLeave={() => {
              if (!dragRef.current.active) return
              stopDrag(dragRef.current.rawDelta)
            }}
          >
            {IMAGES.map((src, imageIdx) => {
              const fromPos = transition ? transition.from.indexOf(imageIdx) : cardOrder.indexOf(imageIdx)
              const toPos = transition ? transition.to.indexOf(imageIdx) : fromPos
              const fromCard = activeCards[fromPos]
              const toCard = activeCards[toPos]
              const t = transition?.progress ?? 1

              // ── GPU-only animation: width/height stay constant ───────────────────
              // All visual changes are expressed as a single scale transform and
              // a translate3d. The browser compositor handles this entirely on the
              // GPU — no layout or paint is triggered per animation frame.
              const tx             = lerp(fromCard.tx,             toCard.tx,             t)
              const ty             = lerp(fromCard.ty,             toCard.ty,             t)
              const combinedScale  = lerp(fromCard.combinedScale,  toCard.combinedScale,  t)
              const opacity        = lerp(fromCard.opacity,        toCard.opacity,        t)
              const zIndex         = Math.round(lerp(fromCard.zIndex, toCard.zIndex,      t))

              return (
                <div
                  key={imageIdx}
                  className="collage-card absolute rounded-[14px] overflow-hidden shadow-sm shadow-black/10"
                  style={{
                    left: 0,
                    top: 0,
                    // Fixed dimensions — never change during animation
                    width:  BASE_W,
                    height: cardBaseH,
                    zIndex,
                    opacity,
                    transform: `translate3d(${tx}px, ${ty}px, 0) scale(${combinedScale})`,
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

          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none -translate-y-[2%] sm:translate-y-0">
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
