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
  const [isAuthenticated, setIsAuthenticated] = useState(false)
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
    const supabase = createClient()

    const syncAuthState = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setIsAuthenticated(Boolean(user))
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
      updateDragTransition(e.touches[0].clientX - dragRef.current.startX)
    }
    // { passive: false } is required to allow preventDefault() in touch handlers
    el.addEventListener("touchmove", handleTouchMove, { passive: false })
    return () => {
      el.removeEventListener("touchmove", handleTouchMove)
    }
  }, [updateDragTransition])

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
          will-change: left, top, width, height, opacity, transform, filter;
          backface-visibility: hidden;
          transform-style: preserve-3d;
        }
      `}} />

      <div className="relative w-full mb-10 sm:mb-8">
        <div className="relative w-full h-[296px] sm:h-[224px] md:h-[277px] lg:h-[352px] xl:h-[409px]">
          <div
            ref={collageRef}
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none cursor-pointer"
            style={{ width: CANVAS_W, height: CANVAS_H, touchAction: "pan-y" }}
            onTouchStart={(e) => {
              clearAutoplay()
              dragRef.current = { active: true, startX: e.touches[0].clientX, delta: 0, rawDelta: 0 }
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
                      <span className="w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-full bg-gray-900 inline-flex items-center justify-center overflow-hidden">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 396" className="w-[10px] h-[10px] sm:w-3 sm:h-3"><path d="M217.2 93.3a43 43 0 0 1-15 .6c.3.5-6.1.2-6.6-.4-.6-.5-2.7-.6-2.7 0s-2.5.5-3 0q-.5-.6-2.1 0-1.5.6-1.8.5-.2-.2-.3.2c0 .5-2 .5-2.4-.1q-.3-.3-1 0t-1 .2-.2.4q0 .5-.7.7-.8.1-.5-.5t-.9-.2q-1 .4-1 1c.3.5-.4.5-1.3 0q-.5-.4-1 .2-.3.6-.5 0c-.3-.6-1.2-.6-1.4 0q-.1.5-3.4.7-.5 0-.3.4 0 .3-1.1.2-2.4-.1-1.3 1c.6.6-1 1-2.2.4q-1.3-.7-1.3 0 0 .6-.2.5-.3-.1-.2.4.2.5-.6.5-1.3 0-1.3.6 0 .5-.7.3-.6-.2-1.5.3c-1.3.6-1.3.6-2.1 0q-.8-.7-.6.2.1.5-.5.5c-.6 0-1.7 1.4-1.5 1.9q.2.5-.4.2c-.6-.3-2 .2-2.2.7-.1.3-.6.3-1.5 0q-1.2-.5-.6.5.4.6-.5.6c-.8 0-1.9.7-2 1.3q0 .5-.3.2-.4-.4-.5.4-.2.7-.8 0-1-.8-.3.4.7 1-.3.5-2 .9-2.1.5-.1-.4-.3.2-.2.5-.7.5-.5 0-.2.3.5.7-.7.7c-1 0-1.7.3-1.7.8 0 .4-.3.4-.7 0s-1 0-2 1q-1 1-1.2.5c-.2-.7-1.2-.4-1.6.5q-.3.5-1.2-.2c-.6-.5-1.5-.4-2.4.3-1.6 1.2-1.6 1.2-2 0q-.5-1.2-.5.2c0 .8-.8 1.6-1.7 1.6-.8 0-1.1.3-.8.6q.4.4-.1.2c-.4-.2-1.1.4-1.6 1.2q-.8 1.3-1.3.4-.7-1.4-1.5.3c-.4.9-.9.7-.7-.2q.1-.5-.6.2c-.5.6-1 .7-.6.1.4-.5-.5-.3-1.5.3-1.7 1-1.7 1-2.4 0q-.7-.8-.2.6c.5 1.1-.8 1.5-1.5.4q-.2-.5-.7.3-.4.7-.8.4c-.3-.3-.2-.6.4-.6q.5 0-.3-.5c-1-.7-1.6 0-1.3 1.3q.3.8-.4.4c-.4-.3-1 0-1.4.8q-.5 1-1 .2c-.4-.5-.9-.4-1.8.8q-1.2 1.6-1.2.5 0-1.1-.6.5c-.7 1.4-1.4 1.8-1.1.5q.2-.5-.5.2c-.6.5-.8.5-.6-.3q.3-1.2-.4 0c-.9 1.3-1.6 1.3-1.4.1q.2-.6-.5.2c-.5.5-.9.6-.9.2 0-.5-.4-.3-1.1.5q-1.1 1.2-1 .1c0-1.2-.6-.7-1.4 1q-.5 1.3-.7.1c-.1-1.2-1.7-1-2.3.3q-.3.6-.6-.2-.3-1-.6 0c-.4 1-1 1.3-.8.3q.2-.5-.4.2-.7.7-.5-.1.3-1-.5-.2c-.6.6-1 .6-.9 0q.2-.5-.5 0-.6.4-.5-.3c.3-1-1-.7-1.8.4q-.4.7-.3-.3c.2-1.4-.7-1-1.7.6q-.5 1-.6-.2c0-.7-.2-1.1-.4-.7-.2.3-.6.2-.9-.4q-.4-.7-.4.2c0 .9-.6 1.3-1.3.9-.6-.4-1.2.2-1.5 1.6q-.5 1.7-.5.5c0-1.6-.7-1.6-1.4 0q-.5 1-.5 0c0-.8-.3-1.3-.6-1-.4.3-.8-.2-1.1-1.1q-.3-1-.5.2-.1 1-.6.2c-.6-1.1-1.3-1.5-1.3-.7q0 .5-.5-.3c-.4-.7-.7-.7-.7 0q.1.6-.5 0c-.6-.7-.8-.7-.8 0q0 .6-.5-.2-.4-.6-.4 0c.1.5 0 .6-.3.1-.3-.6-.8-.6-1.5 0q-.6.4-.3-.4c.3-.9-.6-.9-1.3 0-.5.6-.7.6-.6-.1q.2-.5-.4 0c-.4.3-.6.2-.4-.3q.2-.7-.6-.2c-1.1.7-2.3.5-1.7-.3.3-.5-.7-.3-1.8.4q-1 .6-.3-.3c.7-.8-.7-1-1.7-.3q-.5.4-.1-.6.5-1.2-.4-.2c-.7.8-1.7 1-1.4.4q.2-.5-.6.1c-.5.4-.7.3-.5-.2q.4-1-.5-.3c-.6.5-1 .4-1-.5q0-.5-.5.2-.5.6-.3-.3c.2-.7 0-.9-.5-.5-.7.5-.7.5-1.1-.3q-.3-.6-.5.1-.2.6-.5-.1c-.4-.7-.7-.7-.7.2q0 .7-.5-.2c-.4-.7-.6-.7-.6 0q0 .5-.5-.1-.4-.5-.4.1c0 .5-.2.6-.6 0-.3-.4-.6-.3-.6.3q0 .9-.5-.1c-.4-.7-.6-.7-.6 0-.1.6-.3.6-.7 0q-.5-.7-.4.1c0 .6-.3.8-.7.3-.3-.3-.4-.3-.2.2.4 1.1-.4 1.1-1.2 0q-.5-.6-.2.3c.4 1.1-.2 1.1-1.1 0q-.6-.8-.3.2.4 1.2-.6.2c-.6-.6-.7-.5-.3.5q.6 1.3-.3.4c-.7-.7-1-1-1-.8 0 .6-1.2.7-1.5.1q-.2-.5-.3.3c0 .8-.3.8-.7.2q-.5-.8-.4.2c0 1-.5 1-1.4.1-.8-.8-1.2-1-1.3-.3q-.1.5-.3-.2c-.3-.7-.6-.8-.8-.2q-.3.7-.5-.2c-.2-.7-.4-.9-.7-.3q-.3.5-.2-.5c.2-.9-.3-.8-.9.2q-.5.7-.3-.2c.3-.8-.5-.8-1 0q-.3.4-.3-.3c0-.6-.3-.8-.6-.5q-.4.3-.2-.5.3-1-.4-.2c-.4.5-.6.4-.3-.3q.3-.8-.5 0c-.5.5-.8.5-.8-.2q0-.4-.5.3c-.3.5-.6.5-.5-.2q.1-.8-.2-.2c-.3.5-.6.4-.6 0q0-.5-.5.2c-.3.5-.5.2-.3-.5q.2-.7-.2-.1c-.5.6-.6.4-.5-.5q.1-.7-.4.1c-.4.6-.6.6-.6-.2q0-.5-.5.3c-.3.5-.5.3-.5-.3q0-.5-.5.3c-.3.5-.5.2-.3-.5q.2-.7-.4.1c-.5.5-.6.2-.5-.6q.1-.5-.5.3c-.6.5-.6.4-.3-.7q.3-1-.4 0c-.4.5-.6.4-.6-.5q0-.5-.3.2c-.4.7-.6.6-.6-.3q0-.5-.4.2c-.4.5-.6.4-.6-.2q0-.5-.3.1c-.5.7-.8.5-.5-.5q.2-.7-.4.2c-.4.6-.6.4-.6-.3q0-.5-.3.1-.7 1.1-.4-.4c.3-1.3-.5-.9-.9.4q-.2.5-.3-.3c-.2-1.2-.5-1.5-.5-.4q0 .6-.3-.2c-.3-1-.6-1-.6-.2 0 .5 0 .6-.3.1q-.3-.5-.3.3c0 .8-.3.8-.5 0q-.4-.9-.2.1c.1.7-.2.7-.7-.2q-.5-1-.5.2.1.6-.4-.3c-.4-.7-.6-.8-.6-.2q0 .5-.4-.3c-.3-.5-.4-.5-.3.2q.1.8-.3-.1c-.4-.8-.7-.7-.7.3q0 .6-.4-.3-.4-.7-.3.1c.2 1-.5 1-.8 0q-.2-.5-.3.3c-.1 1.2-.6 1-1-.6q-.4-1.2-.3.3c0 1-.7.5-1-1q-.2-.7-.4.1-.2.6-.3-.3c-.1-1.1-.6-1.2-.6-.1q0 .5-.4-.3c-.3-.8-.4-.8-.3 0q0 .5-.4-.4-.5-1.2-.3 0c.2.7 0 .7-.4-.2q-.6-1-.3.2c.2.7-.2.7-.8 0-.4-.6-.5-.6-.3.1q.3 1-.3.1c-.5-.7-.7-.6-.3.5q.3 1-.5.2c-1-.8-1.2-.7-.7.3q.4.6-.3-.1c-.6-.5-.8-.4-.8.2 0 .4-.3.3-.5-.4q-.5-1-.3.3c.1.9-.4.6-.7-.4q-.5-1.3-.3.2c.1.8-.2.9-.5.2q-.5-1-.4.2c0 .7-.2.8-.5.3q-.6-1-.3.3c.2.7 0 .7-.3-.1q-.3-.7-.3.2c0 .8-.3.9-.6.2q-.5-.9-.3.2c.1.7-.2.8-.5.2q-.6-1-.3.3c.2.7 0 .8-.6 0q-.5-.7-.2.2.4 1.1-.4.2c-.5-.7-.6-.5-.3.3q.4 1-.4.1c-.6-.7-.8-.7-.3.3q.4.8-.4 0c-.6-.6-.7-.4-.3.3.3.5.3.7-.2.4q-.7-.5-.2.3c.3.5.2.7-.4.3q-.8-.4-.2.4c.5.6.4.8-.3.3q-1-.5-.1.4.6.6-.3.2c-.6-.3-.6-.2-.2.4q.5.7-.3.2c-.7-.4-.8-.3-.5.4q.4.8-.3.2c-.5-.4-.6-.3-.3.4q.4.8-.3.2c-.5-.4-.6-.3-.3.4q.4.9-.3.3c-.5-.4-.6-.3-.3.4.5 1 .4 1-.3.4q-.5-.4-.1.5c.4.6.4.8-.3.3q-.7-.5-.1.5c.5.7.4 1 0 .4q-.5-.5-.1.5c.3.7.2.8-.3.4q-.7-.5-.2.4c.3.7.2.8-.2.4q-.6-.5-.2.5c.4.7.3.8-.3.4q-.7-.5-.2.4c.4.7.3.8-.2.3q-.6-.4-.2.5c.4.7.3.8-.2.3q-.7-.7-.3.5c.3.8.2.8-.3.2q-.4-.4 0 .7.4 1.2-.4.3c-.6-.6-.7-.5-.3.4q.5 1-.3.3c-.7-.5-.7-.5-.4.3q.5 1-.3.2c-.6-.5-.7-.4-.4.4q.5 1-.2.4-.5-.5-.3.4c.3.7.2.8-.2.2q-.3-.5-.2.4c.1.7 0 .7-.4-.2q-.4-.8-.2.4c.2.8 0 .9-.4 0q-.3-.6-.2.4c.1.9 0 .9-.4 0q-.5-.9-.2.5c.2.9 0 1-.4.2q-.3-.5-.2.3c.2.8 0 1-.4.2q-.4-.6-.2.3c.2.9 0 1-.4.2q-.4-.7-.1.5c.2.9.1 1-.3.3q-.3-.5-.2.3c.2.9 0 1-.3.3q-.4-.6-.2.5c.2.7.1.9-.3.3q-.3-.4-.2.5.2 1-.3.3-.4-.5-.2.5c.3 1.1 0 1.3-.4.3q-.3-.7 0 .5c.2.9 0 1-.3.3q-.3-.5 0 .6c.3 1.2 0 1.3-.3.2q-.2-.5 0 .7.2 1.2-.3.5-.3-.5 0 .5c.3 1.1.1 1.3-.3.4q-.3-.6 0 .7c.2 1 0 1-.3.2q-.2-.5 0 .7.3 1.4-.2.6c-.3-.6-.4-.4-.4.4q0 .5.1 1 .2.6-.2-.1c-.3-.5-.4-.4-.4.5q0 1-.2-.2c-.3-.8-.4-.8-.4.4q0 1-.2-.1c-.3-.8-.4-.7-.3.5q.1 1-.3-.2c-.3-1-.4-.9-.3.3q0 1-.2-.2c-.3-1-.4-.9-.3.2q0 1-.2-.2c-.3-1.1-.4-1-.3.2q.2 1.3-.2 0c-.3-1-.4-1-.3.3q.2 1.4-.2 0c-.2-.9-.3-.8-.3.4q0 1.3-.2 0c-.2-1-.3-1-.3.4q0 1.5-.2 0c-.2-1.2-.3-1.2-.2.3q0 1.3-.2-.1c-.2-1.2-.3-1.2-.2.2q0 1-.1-.3-.2-1.8 0 .4c.1 1.1 0 1.3-.2 0q-.3-1.5 0 .3c.2 1 .1 1.2-.2-.2q-.3-1.5 0 .5c.1 1 .1 1-.2-.3q-.3-1.4 0 .5c.1.7 0 .8-.2-.5q-.3-2 0 .4c.2 1 .1 1-.2-.5q-.4-2 0 .3c.2 1.3.1 1.3-.2-.3q-.3-1.5 0 .5.1.8-.2-.5-.4-2 0 .3c.2 1.1.1 1.2-.3-.5q-.4-2.2.1.5.2 1-.2-.5c-.3-1.2-.4-1.4 0 .5q.2 1-.3-.5c-.4-1.2-.4-1.3 0 .5q.3 1.2-.2-.4c-.4-1.2-.5-1.4 0 .5.3 1.4.3 1.4-.2-.3q-.4-1.4.1.5c.3 1 .3 1-.3-.5q-.4-1.3.1.5.3 1.2-.3-.3c-.4-1-.4-1 .1.6q.4 1.2-.3-.4-.5-1.4.1.6.4 1.2-.3-.4c-.5-1-.4-1 .1.6q.4 1.2-.4-.4-.5-1.2.1.6c.4.9.3.9-.3-.4q-.5-1 .1.6c.4 1 .3 1-.4-.3q-.5-1 .1.6.5 1.2-.4-.3-.6-1 .1.5c.5 1 .4 1-.3-.2q-.5-1 .2.6.5 1-.4-.4-.6-1.1.1.5c.5 1 .5 1-.3-.3q-.5-.8.2.5.5 1-.4-.3-.6-1 .2.5.5.8-.4-.2c-.6-.7-.6-.6.2.6q.5.8-.4-.3c-.7-.7-.6-.6.2.6q.5.8-.4-.3c-.7-.7-.6-.6.2.6q.5.8-.5-.2c-.7-.7-.7-.6.2.5q.6.8-.5-.3c-.7-.7-.7-.6.2.5.7.8.7.8-.3-.2q-.7-.7.2.6c.6.8.5.7-.3-.3q-.6-.7.2.5c.6.8.6.8-.4-.2q-.7-.7.2.6c.6.8.6.8-.4-.2q-.7-.7.3.6c.7.8.7.8-.3-.3q-.7-.7.3.5c.7.8.6.7-.4-.3q-.7-.7.3.6c.7.8.6.8-.4-.3q-.7-.7.3.5c.7.7.6.7-.4-.4q-.6-.7.4.5c.7.7.6.7-.4-.5l-.3-.3q.4.5.1 0-.7-1 .3.4c.7.7.6.6-.5-.5q-.5-.5.3.5.5.5-.5-.5c-.7-.7-.6-.6.4.5.6.6.5.6-.5-.5q-.5-.5.4.5c.6.6.6.6-.5-.5-.7-.7-.7-.7.4.5.7.6.6.6-.6-.6-.7-.7-.6-.6.5.6l.7.6q-.5-.4-.7-.7-.5-.5.5.5c.7.5.6.5-.7-.6-.7-.7-.6-.6.7.7.7.6.7.6-.7-.7-.8-.8-.8-.7.7.7.8.7.7.7-.8-.8-.8-.8-.7-.7.8.8.9.7.8.7-.8-.8-.9-.8-.8-.8 1 1 1 .8-.8-.9l-1-1q.8.8 1 1 .7.7-1-1c-1-1-1-1 1 1l1 1q-1-1-1-1 1 1 1 1-1-1-1.2-1 .8.8 1.2 1.1 1 .8-1.2-1.1-1-1-.9-.9l1.3 1.2q1 .9-1.4-1.3-1-1 1.5 1.3 1.3 1.1-1.5-1.4-1.2-1.2 1.6 1.5 1.4 1.2-1.6-1.6-1.5-1.4 1.8 1.7 1.6 1.4-1.8-1.7-1.7-1.5l2 1.8q1.8 1.6-2-1.9-2-1.9 2.3 2.1c1.5 1.4 1.5 1.3-2.3-2.3q-2.3-2.2 2.6 2.5 2.3 2.2-2.8-2.8-2.7-2.6 3.2 3.2 2.7 2.6-3.4-3.5-3.1-3.2 3.8 3.9 3.4 3.3-3.8-4-3.7-3.8l4.4 4.6q4 4.2-4.6-4.8c-2.6-2.9-2.7-2.9 5.3 5.6 5.3 5.5-5-5.2a1361 1361 0 0 1-6.6-6.8q5.4 5.5 6.8 7l-6.2-6.3c2 2 5.5 5.4 7.6 7.6 3.3 3.3 3.6 3.9 3.6 5.3 0 1.2-.4 2.2-1.4 3.5a236 236 0 0 1-10.2 12.2 255 255 0 0 1-4 4.3c-.5.6-1.8 2-2.8 3-1 1.2-1.9 2-1.9 2v.2l.2-.2 7.2-7.4 7.2-7.4c1.5-1.6 5-5.3 7.8-8.3l5-5.4 1-.8q0-.1.7.6l1 1.1a1316 1316 0 0 1 7 7.2c1 1.1 3 3.3 4.3 4.8l2.5 2.7-.2.5a200 200 0 0 1-2.4 3 303 303 0 0 1-5 5.6l-3.2 3.5a1 1 0 0 0 .1 0 484 484 0 0 0 12.6-13.6l.4-.6.8.7a1085 1085 0 0 0 6 5.8l.9.8-.8.8a312 312 0 0 1-7.2 7.4c-2 2-3.5 3.6-3.5 3.7 0 0 .3-.1.6-.4a442 442 0 0 0 7.7-7.7l3.4-3.6.9.8a2420 2420 0 0 0 4.7 4.5l1.4 1.2-.5.5a360 360 0 0 1-2.4 2.6l-5 5.3-2.3 2.5h.1l.7-.6a387 387 0 0 0 9.3-9.8l.8-.8 2 1.7 2 1.7v.3a277 277 0 0 1-9.4 10L205 259c0 .1 5-5 8.2-8.5l1.5-1.6 1.8 1.5 1.7 1.5-.5.6-2.3 2.7a180 180 0 0 1-4.2 4.6l-2.7 2.8-.7.7.2-.1a318 318 0 0 0 10.2-10.8l.7-.8 1.5 1.3 1.5 1.2-.5.5a253 253 0 0 1-6.7 7.3l-3.3 3.4.2-.1a378 378 0 0 0 10.3-10.8l.8-.8.9.7.8.7-.1.3c-.2.2-1.5 1.7-3 3.3l-3 3.2c-1.5 1.6-3 3.2-3.2 3.5l-.4.5.2-.2a419 419 0 0 0 9.5-10.2l.8-.9.9.7.9.6-.2.3a307 307 0 0 1-9.5 10.4c0 .1.3-.2.7-.6a368 368 0 0 0 9.3-10l.5-.7.8.6c.5.3.8.7.8.8l-.5.5a256 256 0 0 1-9.3 10.2 5 5 0 0 0-.4.5l.7-.6a429 429 0 0 0 9.2-10.2l.4-.5.7.4q.7.5.7.6l-.2.3a420 420 0 0 1-9.5 10.4l-.6.6.5-.4a381 381 0 0 0 9.5-10.4l.5-.6q.4 0 .6.4.3.3.3.5l-.2.3a462 462 0 0 1-9.5 10.5q-.3.3 0 0a454 454 0 0 0 9.5-10.5l.4-.5q.2 0 .4.2l.4.4-.3.4a504 504 0 0 1-9 10 4 4 0 0 0-.5.5q.3-.2 1.2-1.2a472 472 0 0 0 8.5-9.5q.2-.2.3 0 .1.2.2.2l-.2.2c-.1.2-1.2 1.4-2.5 2.8a452 452 0 0 1-7 7.7l.2-.2c0-.2 5-5.4 9.4-10.1q.4-.5.4-.1.1.3-.3 1a557 557 0 0 1-8.4 9.4l-1 1q.5-.4 5.2-5.6l4.3-4.7q.2-.2.1.2l-1 1.2-3 3.3-3 3.3-2 2.2.4-.4 4.7-5.2 4.2-4.6q.1-.2.1.1l-.5.8a1093 1093 0 0 1-5.8 6.6l-2.4 2.7q-.3.3 0 0l3.2-3.5 5.2-5.8q.2-.2.2.1-.1.4-1 1.6a458 458 0 0 1-7 7.8q-.3.4-.1.2a503 503 0 0 0 7.7-8.8l.5-.7q0-.2.1.2v.6a466 466 0 0 1-7 8l-1 1.2q-.3.3-.1.2l1.6-1.9a620 620 0 0 0 6.4-7.4q.3-.4.2 0l-.2.5a499 499 0 0 1-7 8.2l-1 1.1q0 .2.4-.4a575 575 0 0 0 7.3-8.5l.6-.7q0-.2.1 0v.6a588 588 0 0 1-7.3 8.6l-.6.8.6-.7a538 538 0 0 0 7.2-8.6q.3-.3.2 0v.5a592 592 0 0 1-7.4 9l-.3.3q0 .1.4-.4l4-4.8a523 523 0 0 0 3.2-4q.2-.2.1 0 0 .2-.2.6a533 533 0 0 1-6.2 7.6l-1.3 1.5q-.2.3 0 0a585 585 0 0 0 7.1-8.8l.6-.8v.4a545 545 0 0 1-7 8.7l-.7.8q-.2.3 0 0a665 665 0 0 0 7-8.9l.6-.7q0-.2 0 .2v.4a489 489 0 0 1-6.8 8.8c-.3.3-.4.5-.3.4l2.4-3.2a618 618 0 0 0 4.5-5.9q.2-.4.2-.1v.4l-1.4 1.8a680 680 0 0 1-5.2 6.9l-.4.5q-.2.3 0 0a546 546 0 0 0 6.6-8.8l.5-.7v.3l-1.2 1.7a595 595 0 0 1-5.4 7.3l-.5.6q.1 0 .6-.7a587 587 0 0 0 5.9-8.2q.3-.3.2 0l-.2.5a563 563 0 0 1-5.8 8l-.7 1q-.2.2 0 0l1.6-2.3A625 625 0 0 0 259 289l.3-.5v.3c-.1.2-.5.9-1 1.5A507 507 0 0 1 253 297l-.4.7q0 .2.3-.3a651 651 0 0 0 5.3-7.7l.7-1.1q.2-.3.1 0l-.3.7a560 560 0 0 1-5.7 8.4q-.2.3 0 .1l.5-.6a545 545 0 0 0 5.1-7.8l.5-.9v.3a534 534 0 0 1-5.4 8.2l-.5.8q0 .1.3-.3l3-4.5a397 397 0 0 0 2.3-3.6l.4-.7q.1-.2 0 .1a533 533 0 0 1-5.2 8.2l-.5.8q-.1.2 0 .1a610 610 0 0 0 5-8l.5-1q.2-.3.1 0v.3a536 536 0 0 1-4.8 7.8l-.5.9q-.2.3 0 .1l.7-1.2a506 506 0 0 0 4.2-7l.4-.7q.2-.3.1 0a595 595 0 0 1-4.7 8l-.5 1q-.2.3 0 .1l.8-1.3a566 566 0 0 0 3.6-6.3l.6-1q.1-.2 0 .1l-.4.8a488 488 0 0 1-4.3 7.5l-.4.8q0 .2.2-.2a630 630 0 0 0 4.2-7.5l.5-1q0-.2 0 0l-.2.7a1001 1001 0 0 1-3.5 6.5q-.7 1.3-.4.8a573 573 0 0 0 3.6-6.7l.5-1q.1-.2 0 0l-.3.7a488 488 0 0 1-3.5 6.8q-.5 1-.2.5a623 623 0 0 0 3.2-6.4l.5-1.2q.2-.3 0 0a437 437 0 0 1-3 6.4l-.6 1.2q-.3.5 0 0a555 555 0 0 0 3-6.3l.4-1.1v.3l-2.7 6q-.3.7-.1.4a544 544 0 0 0 2.7-6.2q.1-.4 0-.1l-.3.8a1048 1048 0 0 1-2 4.6q-.3.7-.2.4l1-2.5 1.4-3.4q.4-1 .1-.2l-.3 1c-.7 1.6-1 2.5-2 5.2q-.3.6 0 0a543 543 0 0 0 2-5.5q.2-.6.1-.2a544 544 0 0 1-1.8 5.2q-.2.5 0 0l.5-1.5a399 399 0 0 0 1.3-3.7q0-.3 0 0a1003 1003 0 0 1-1.6 4.7q-.1.4 0 .1a541 541 0 0 0 1.3-4.1q.2-.5.1-.2l-.6 2a327 327 0 0 1-.7 2.5v.2l.6-2 .7-2.5q.1-.5 0-.1a443 443 0 0 1-1 3.7l-.2 1q-.2.5 0 0l.5-1.6.6-2.3q.2-.5 0 0a339 339 0 0 1-.8 3.1l-.2.8q-.1.5 0 .2l.7-2.7q.3-1 .1-.2l-.4 2a73 73 0 0 1-.3 1.2v.1l.4-1.5q.3-1.1.2-.4l-.4 1.8a40 40 0 0 1-.2.7q-.1.3 0 .1.1-.3.4-1.5l.2-1q.1-.4 0 0a1330 1330 0 0 1-.4 1.7l-.1.7q-.1.2 0 0l.3-1.4q.2-.7.1-.2l-.3 1.3-.1.3.3-1 .1-.5v.3l-.2.7v.3l.2-.5v-.2l-.1.4v.4l.1-.3V297q0 .2 0 0m-60.1-77q0-.2-.2 0a517 517 0 0 1-5 5.4l-.4.5q0 .1.5-.5a339 339 0 0 0 5.1-5.4m-1.4 1.5q0-.1-.2 0a254 254 0 0 1-4.2 4.7l-.5.5q0 .1.4-.4a318 318 0 0 0 4.5-4.8" fill="#fcfcfc"/></svg>
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

      <div className="flex flex-row items-center gap-3 mb-5 sm:mb-[32px]">
        <Link
          href="/explore"
          className="inline-flex items-center px-6 sm:px-7 py-2.5 sm:py-3 rounded-full text-sm font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          Discover
        </Link>
        <Link
          href={isAuthenticated ? "/app" : "/signup"}
          className="inline-flex items-center gap-2 px-6 sm:px-7 py-2.5 sm:py-3 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          {isAuthenticated ? "Dashboard" : "Sign Up"}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <p className="text-[16px] sm:text-[19.5px] text-neutral-600 text-center mb-[102px] sm:mb-[127px] max-w-[90%] sm:max-w-[590px] leading-relaxed px-4 mx-auto">
        The #1 e-commerce platform for creators & entrepreneurs. Sell products, manage links & grow an audience.
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
