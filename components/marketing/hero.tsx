"use client"

import { useState, useEffect, useRef, useCallback, type PointerEvent, type WheelEvent } from "react"
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

interface SlotDef {
  left: number
  top: number
  width: number
  height: number
  scale: number
  opacity: number
  rotate: number
  zIndex: number
}

const DESKTOP_SLOTS: SlotDef[] = [
  { left: -120, top: 60, width: 238, height: 294, scale: 0.9, opacity: 0.72, rotate: -4, zIndex: 1 },
  { left: 106, top: 30, width: 289, height: 357, scale: 0.95, opacity: 0.86, rotate: -2.2, zIndex: 2 },
  { left: 380, top: 0, width: 340, height: 420, scale: 1, opacity: 1, rotate: 0, zIndex: 4 },
  { left: 705, top: 30, width: 289, height: 357, scale: 0.95, opacity: 0.86, rotate: 2.2, zIndex: 2 },
  { left: 982, top: 60, width: 238, height: 294, scale: 0.9, opacity: 0.72, rotate: 4, zIndex: 1 },
]

const MOBILE_SLOTS: SlotDef[] = [
  { left: -180, top: 54, width: 148, height: 194, scale: 0.88, opacity: 0, rotate: -4, zIndex: 1 },
  { left: 44, top: 40, width: 174, height: 228, scale: 0.75, opacity: 0.84, rotate: -3, zIndex: 2 },
  { left: 184, top: 0, width: 232, height: 304, scale: 1, opacity: 1, rotate: 0, zIndex: 4 },
  { left: 382, top: 40, width: 174, height: 228, scale: 0.75, opacity: 0.84, rotate: 3, zIndex: 2 },
  { left: 600, top: 54, width: 148, height: 194, scale: 0.88, opacity: 0, rotate: 4, zIndex: 1 },
]

const CANVAS_W = 1100
const CANVAS_H = 440
const AUTOPLAY_INTERVAL = 5000
const AUTOPLAY_RESUME_DELAY = 2600
const DESKTOP_STEP = 196
const MOBILE_STEP = 156
const SNAP_DISTANCE_RATIO = 0.22
const SNAP_VELOCITY = 0.42

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)
  const [centerIndex, setCenterIndex] = useState(2)
  const [isMobile, setIsMobile] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [isReady, setIsReady] = useState(false)

  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
  })
  const dragXRef = useRef(0)
  const springRafRef = useRef<number | null>(null)
  const wheelBufferRef = useRef(0)

  const autoplayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoplayResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = IMAGES.length
  const slots = isMobile ? MOBILE_SLOTS : DESKTOP_SLOTS
  const step = isMobile ? MOBILE_STEP : DESKTOP_STEP

  const setDragXSynced = useCallback((next: number) => {
    dragXRef.current = next
    setDragX(next)
  }, [])

  const shiftCenter = useCallback((direction: 1 | -1) => {
    setCenterIndex((prev) => (prev + direction + total) % total)
  }, [total])

  const stopAutoplay = useCallback(() => {
    if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current)
    autoplayIntervalRef.current = null
  }, [])

  const startAutoplay = useCallback(() => {
    stopAutoplay()
    autoplayIntervalRef.current = setInterval(() => {
      if (!dragRef.current.active && springRafRef.current === null) {
        shiftCenter(1)
      }
    }, AUTOPLAY_INTERVAL)
  }, [shiftCenter, stopAutoplay])

  const scheduleAutoplayResume = useCallback(() => {
    if (autoplayResumeTimeoutRef.current) clearTimeout(autoplayResumeTimeoutRef.current)
    autoplayResumeTimeoutRef.current = setTimeout(() => {
      if (!dragRef.current.active && springRafRef.current === null) startAutoplay()
    }, AUTOPLAY_RESUME_DELAY)
  }, [startAutoplay])

  const stopSpring = useCallback(() => {
    if (springRafRef.current !== null) cancelAnimationFrame(springRafRef.current)
    springRafRef.current = null
  }, [])

  const animateSpringTo = useCallback((target: number, initialVelocity = 0, onDone?: () => void) => {
    stopSpring()
    let x = dragXRef.current
    let velocity = initialVelocity

    const tick = () => {
      const displacement = target - x
      const spring = displacement * 0.13
      velocity = (velocity + spring) * 0.82
      x += velocity

      if (Math.abs(displacement) < 0.35 && Math.abs(velocity) < 0.35) {
        setDragXSynced(target)
        springRafRef.current = null
        onDone?.()
        return
      }

      setDragXSynced(x)
      springRafRef.current = requestAnimationFrame(tick)
    }

    springRafRef.current = requestAnimationFrame(tick)
  }, [setDragXSynced, stopSpring])

  const settleDrag = useCallback((releaseVelocity: number) => {
    const threshold = step * SNAP_DISTANCE_RATIO
    const distance = dragXRef.current

    let direction: 1 | -1 | 0 = 0
    if (distance <= -threshold || releaseVelocity <= -SNAP_VELOCITY) direction = 1
    if (distance >= threshold || releaseVelocity >= SNAP_VELOCITY) direction = -1

    if (direction === 0) {
      animateSpringTo(0, releaseVelocity * 9, () => {
        setDragXSynced(0)
        scheduleAutoplayResume()
      })
      return
    }

    const target = direction === 1 ? -step : step
    animateSpringTo(target, releaseVelocity * 10, () => {
      shiftCenter(direction)
      setDragXSynced(0)
      scheduleAutoplayResume()
    })
  }, [animateSpringTo, scheduleAutoplayResume, setDragXSynced, shiftCenter, step])

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    stopSpring()
    stopAutoplay()

    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      lastT: performance.now(),
      velocity: 0,
    }
  }, [stopAutoplay, stopSpring])

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return

    const now = performance.now()
    const dt = Math.max(8, now - dragRef.current.lastT)
    const delta = event.clientX - dragRef.current.lastX
    dragRef.current.velocity = delta / dt

    dragRef.current.lastX = event.clientX
    dragRef.current.lastT = now

    const raw = event.clientX - dragRef.current.startX
    setDragXSynced(raw)

    if (raw <= -step) {
      shiftCenter(1)
      dragRef.current.startX += step
      setDragXSynced(event.clientX - dragRef.current.startX)
    } else if (raw >= step) {
      shiftCenter(-1)
      dragRef.current.startX -= step
      setDragXSynced(event.clientX - dragRef.current.startX)
    }
  }, [setDragXSynced, shiftCenter, step])

  const endDrag = useCallback(() => {
    if (!dragRef.current.active) return
    const velocity = dragRef.current.velocity
    dragRef.current.active = false
    settleDrag(velocity)
  }, [settleDrag])

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return
    endDrag()
  }, [endDrag])

  const onPointerCancel = useCallback(() => {
    endDrag()
  }, [endDrag])

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    stopAutoplay()

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    wheelBufferRef.current += delta

    if (Math.abs(wheelBufferRef.current) >= 125) {
      const direction: 1 | -1 = wheelBufferRef.current > 0 ? 1 : -1
      wheelBufferRef.current = 0
      stopSpring()
      setDragXSynced(0)
      shiftCenter(direction)
    }

    scheduleAutoplayResume()
  }, [scheduleAutoplayResume, setDragXSynced, shiftCenter, stopAutoplay, stopSpring])

  useEffect(() => {
    startAutoplay()
    return () => {
      stopAutoplay()
      stopSpring()
      if (autoplayResumeTimeoutRef.current) clearTimeout(autoplayResumeTimeoutRef.current)
    }
  }, [startAutoplay, stopAutoplay, stopSpring])

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

  const progress = clamp(dragX / step, -1, 1)

  const getSlotInterpolated = useCallback((slotIndex: number): SlotDef => {
    const current = slots[slotIndex]
    const amount = Math.abs(progress)
    if (amount <= 0.0001) return current

    const movingLeft = progress < 0
    const targetIndex = movingLeft
      ? clamp(slotIndex - 1, 0, slots.length - 1)
      : clamp(slotIndex + 1, 0, slots.length - 1)
    const target = slots[targetIndex]

    return {
      left: lerp(current.left, target.left, amount),
      top: lerp(current.top, target.top, amount),
      width: lerp(current.width, target.width, amount),
      height: lerp(current.height, target.height, amount),
      scale: lerp(current.scale, target.scale, amount),
      opacity: lerp(current.opacity, target.opacity, amount),
      rotate: lerp(current.rotate, target.rotate, amount),
      zIndex: Math.round(lerp(current.zIndex, target.zIndex, amount)),
    }
  }, [progress, slots])

  return (
    <section className={`flex flex-col items-center bg-white pt-6 sm:pt-10 pb-12 sm:pb-[67px] overflow-hidden transition-all duration-700 ease-out ${isReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.41);
          transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
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
          transition: left 0.14s linear,
                      top 0.14s linear,
                      width 0.14s linear,
                      height 0.14s linear,
                      opacity 0.14s linear,
                      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
          will-change: left, top, width, height, opacity, transform;
        }
      `}} />

      <div className="relative w-full mb-6 sm:mb-8">
        <div className="relative w-full h-[154px] sm:h-[224px] md:h-[277px] lg:h-[352px] xl:h-[409px]">
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none cursor-grab active:cursor-grabbing touch-pan-y"
            style={{ width: CANVAS_W, height: CANVAS_H }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerCancel}
            onWheel={onWheel}
          >
            {slots.map((_, slotIndex) => {
              const imageIndex = (centerIndex + (slotIndex - 2) + total) % total
              const card = getSlotInterpolated(slotIndex)

              return (
                <div
                  key={`${imageIndex}-${slotIndex}`}
                  className="collage-card absolute rounded-[14px] overflow-hidden shadow-lg shadow-black/10"
                  style={{
                    left: card.left,
                    top: card.top,
                    width: card.width,
                    height: card.height,
                    zIndex: card.zIndex,
                    opacity: card.opacity,
                    transform: `scale(${card.scale}) rotate(${card.rotate}deg)`,
                  }}
                >
                  <img
                    src={IMAGES[imageIndex]}
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
