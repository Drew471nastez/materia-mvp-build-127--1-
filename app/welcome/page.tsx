"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"

// ─── Assets ────────────────────────────────────────────────────────────────
const LOGO_SRC =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"

const TYPING_PHRASES = [
  "Start monetizing your passion...",
  "Build link in bio pages...",
  "Sell digital products...",
  "Share your passion...",
  "Build your online store...",
]

const IMG_BASE =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags"
const IMG_NAMES = [
  "Monetize%20(5)%20(2).webp",
  "Monetize%20(6)%20(1).webp",
  "Monetize%20(7)%20(1).webp",
  "Monetize%20(21).webp",
  "Monetize%20(9).webp",
]
const IMAGES_SM = IMG_NAMES.map(
  (n) => `${IMG_BASE}/${n}?width=280&height=350&resize=cover&quality=55`,
)
const IMAGES_LG = IMG_NAMES.map(
  (n) => `${IMG_BASE}/${n}?width=480&height=600&resize=cover&quality=70`,
)
const IMAGES = IMAGES_SM

// ─── Card layout (mirrors Hero's MOBILE_CARDS) ─────────────────────────────
const CARDS = [
  { left: 38,  top: 50, width: 180, height: 225, zIndex: 1, opacity: 0,    scale: 0.95 },
  { left: 205, top: 25, width: 220, height: 275, zIndex: 2, opacity: 0.85, scale: 0.98 },
  { left: 415, top: 0,  width: 260, height: 325, zIndex: 3, opacity: 1,    scale: 1    },
  { left: 665, top: 25, width: 220, height: 275, zIndex: 2, opacity: 0.85, scale: 0.98 },
  { left: 872, top: 50, width: 180, height: 225, zIndex: 1, opacity: 0,    scale: 0.95 },
]

const CANVAS_W = 1100
const CANVAS_H = 375
const AUTOPLAY_INTERVAL = 3800
const CARD_TRANSITION_MS = 1500

// ─── Helpers ───────────────────────────────────────────────────────────────
const lerp = (from: number, to: number, t: number) => from + (to - from) * t
const ease = (t: number) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2

const rotateOrder = (order: number[], dir: 1 | -1) => {
  const next = [...order]
  if (dir === 1) { next.push(next.shift()!) } else { next.unshift(next.pop()!) }
  return next
}

// ─── Typing effect hook ────────────────────────────────────────────────────
function useTyping(
  phrases: string[],
  typingSpeed = 70,
  deletingSpeed = 35,
  pauseDuration = 2000,
) {
  const [text, setText] = useState("")
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [phase, setPhase] = useState<"typing" | "deleting">("typing")

  useEffect(() => {
    const current = phrases[phraseIdx]
    if (phase === "typing") {
      if (text.length < current.length) {
        const t = setTimeout(() => setText(current.slice(0, text.length + 1)), typingSpeed)
        return () => clearTimeout(t)
      }
      const t = setTimeout(() => setPhase("deleting"), pauseDuration)
      return () => clearTimeout(t)
    }
    if (text.length > 0) {
      const t = setTimeout(() => setText(text.slice(0, -1)), deletingSpeed)
      return () => clearTimeout(t)
    }
    setPhraseIdx((p) => (p + 1) % phrases.length)
    setPhase("typing")
  }, [text, phraseIdx, phase, phrases, typingSpeed, deletingSpeed, pauseDuration])

  return text
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function WelcomePage() {
  const typedText = useTyping(TYPING_PHRASES)
  const [cardOrder, setCardOrder] = useState([0, 1, 2, 3, 4])
  const [transition, setTransition] = useState<{
    from: number[]; to: number[]; progress: number
  } | null>(null)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())

  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const orderRef = useRef(cardOrder)
  const animatingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const loadedSetRef = useRef(new Set<number>())
  const sectionRef = useRef<HTMLDivElement>(null)

  const clearAutoplay = useCallback(() => {
    if (autoplayRef.current) { clearInterval(autoplayRef.current); autoplayRef.current = null }
  }, [])

  const cancelAnim = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    animatingRef.current = false
    setTransition(null)
  }, [])

  const startRotation = useCallback((dir: 1 | -1 = 1) => {
    if (animatingRef.current) return
    const from = orderRef.current
    const to = rotateOrder(from, dir)
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced || document.hidden) {
      orderRef.current = to; setCardOrder(to); return
    }
    const start = performance.now()
    animatingRef.current = true
    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / CARD_TRANSITION_MS)
      setTransition({ from, to, progress: ease(raw) })
      if (raw < 1) { rafRef.current = requestAnimationFrame(tick); return }
      orderRef.current = to; setCardOrder(to)
      setTransition(null); animatingRef.current = false; rafRef.current = null
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const restartAutoplay = useCallback(() => {
    clearAutoplay()
    autoplayRef.current = setInterval(() => startRotation(1), AUTOPLAY_INTERVAL)
  }, [clearAutoplay, startRotation])

  // Autoplay with IntersectionObserver pause
  useEffect(() => {
    const el = sectionRef.current
    if (!el) { restartAutoplay(); return () => { clearAutoplay(); if (rafRef.current) cancelAnimationFrame(rafRef.current) } }
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !document.hidden) restartAutoplay(); else clearAutoplay()
    }, { threshold: 0.1 })
    observer.observe(el)
    const onVis = () => { if (document.hidden) { clearAutoplay(); cancelAnim() } else restartAutoplay() }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", onVis)
      clearAutoplay()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [clearAutoplay, restartAutoplay, cancelAnim])

  // Image loading
  const markLoaded = useCallback((idx: number) => {
    if (loadedSetRef.current.has(idx)) return
    loadedSetRef.current.add(idx)
    setLoadedImages(new Set(loadedSetRef.current))
  }, [])

  const loadImage = useCallback((idx: number) => {
    if (loadedSetRef.current.has(idx)) return
    const img = new Image()
    img.decoding = "async"
    img.onload = () => markLoaded(idx)
    img.onerror = () => markLoaded(idx)
    img.src = IMAGES[idx]
  }, [markLoaded])

  useEffect(() => {
    loadImage(2); loadImage(1); loadImage(3)
    const idle = () => { loadImage(0); loadImage(4) }
    if (typeof window.requestIdleCallback === "function") {
      const h = window.requestIdleCallback(idle, { timeout: 1400 })
      return () => window.cancelIdleCallback(h)
    }
    const t = window.setTimeout(idle, 700)
    return () => window.clearTimeout(t)
  }, [loadImage])

  return (
    <div
      ref={sectionRef}
      className="min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: "#f0f0f0" }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .welcome-collage-inner { transform: scale(0.96); transform-origin: top center; }
        .welcome-card {
          will-change: transform, opacity;
          backface-visibility: hidden;
          contain: layout style paint;
        }
        .welcome-card img { content-visibility: auto; contain-intrinsic-size: 280px 350px; }
        @keyframes welcome-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .welcome-shimmer {
          background: linear-gradient(90deg,#e0e0e0 0%,#ebebeb 25%,#e3e3e3 50%,#ebebeb 75%,#e0e0e0 100%);
          background-size: 200% 100%;
          animation: welcome-shimmer 1.8s ease-in-out infinite;
        }
        .welcome-shimmer-overlay { transition: opacity 0.8s cubic-bezier(0.4,0,0.2,1); }
        @media (prefers-reduced-motion: reduce) {
          .welcome-card { transition: none !important; animation: none !important; }
        }
      `}} />

      {/* Logo */}
      <div className="flex items-center justify-center gap-2.5 pt-14 pb-6">
        <img
          src={LOGO_SRC}
          alt="Storelib"
          width={46}
          height={46}
          className="h-[46px] w-[46px]"
        />
        <span className="text-[28px] font-bold tracking-tight text-neutral-900">Storelib</span>
      </div>

      {/* Card carousel */}
      <div className="relative w-full h-[330px] shrink-0">
        <div
          className="welcome-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none"
          style={{ width: CANVAS_W, height: CANVAS_H }}
        >
          {IMAGES.map((src, imageIdx) => {
            const fromPos = transition ? transition.from.indexOf(imageIdx) : cardOrder.indexOf(imageIdx)
            const toPos = transition ? transition.to.indexOf(imageIdx) : fromPos
            const fromCard = CARDS[fromPos]
            const toCard = CARDS[toPos]
            const t = transition?.progress ?? 1

            const left   = lerp(fromCard.left,   toCard.left,   t)
            const top    = lerp(fromCard.top,     toCard.top,    t)
            const width  = lerp(fromCard.width,   toCard.width,  t)
            const height = lerp(fromCard.height,  toCard.height, t)
            const scale  = lerp(fromCard.scale,   toCard.scale,  t)
            const opacity = lerp(fromCard.opacity, toCard.opacity, t)
            const zIndex = Math.round(lerp(fromCard.zIndex, toCard.zIndex, t))
            const tx = left + width * (1 - scale) / 2
            const ty = top  + height * (1 - scale) / 2

            return (
              <div
                key={imageIdx}
                className="welcome-card absolute rounded-[14px] overflow-hidden shadow-sm shadow-black/10"
                style={{
                  left: 0, top: 0, width, height, zIndex, opacity,
                  transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
                  transformOrigin: "0 0",
                }}
              >
                <div
                  className="welcome-shimmer welcome-shimmer-overlay absolute inset-0 z-10 rounded-[14px]"
                  style={{ opacity: loadedImages.has(imageIdx) ? 0 : 1, pointerEvents: "none" }}
                />
                <img
                  srcSet={`${IMAGES_SM[imageIdx]} 320w, ${IMAGES_LG[imageIdx]} 560w`}
                  sizes="260px"
                  src={src}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none transition-opacity duration-700 ease-out"
                  style={{ opacity: loadedImages.has(imageIdx) ? 1 : 0 }}
                  draggable={false}
                  decoding="async"
                  loading={imageIdx === cardOrder[2] ? "eager" : "lazy"}
                  fetchPriority={imageIdx === cardOrder[2] ? "high" : "low"}
                  onLoad={() => markLoaded(imageIdx)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Typing text */}
      <div className="px-6 mt-6">
        <h1 className="text-[26px] font-bold text-neutral-900 leading-tight min-h-[2.4em] flex items-center">
          <span>
            {typedText}
            <span className="inline-block w-[3px] h-[0.85em] bg-violet-500 ml-0.5 animate-pulse align-middle rounded-full" />
          </span>
        </h1>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* CTA Buttons */}
      <div className="px-4 pb-12 flex flex-col gap-3">
        <Link
          href="/signup"
          className="flex items-center justify-center h-14 w-full rounded-2xl bg-violet-600 text-white text-[17px] font-semibold"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="flex items-center justify-center h-14 w-full rounded-2xl bg-neutral-900 text-white text-[17px] font-semibold"
        >
          Log in
        </Link>
      </div>
    </div>
  )
}
