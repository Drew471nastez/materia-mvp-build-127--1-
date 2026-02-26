"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
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

// Gallery grid images — square thumbnails for horizontal scrolling rows
const IMG_BASE = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags"
const GALLERY_IMAGES = [
  `${IMG_BASE}/Monetize%20(5)%20(2).webp?width=260&height=260&resize=cover&quality=70`,
  `${IMG_BASE}/Monetize%20(6)%20(1).webp?width=260&height=260&resize=cover&quality=70`,
  `${IMG_BASE}/Monetize%20(7)%20(1).webp?width=260&height=260&resize=cover&quality=70`,
  `${IMG_BASE}/Monetize%20(21).webp?width=260&height=260&resize=cover&quality=70`,
  `${IMG_BASE}/Monetize%20(9).webp?width=260&height=260&resize=cover&quality=70`,
]

// Build rows with shuffled images for visual variety
const ROW_CONFIGS = [
  { images: [0, 2, 4, 1, 3, 0, 2, 4], direction: "left" as const, duration: 35, offset: -40 },
  { images: [3, 1, 4, 0, 2, 3, 1, 4], direction: "right" as const, duration: 40, offset: -20 },
  { images: [2, 0, 3, 4, 1, 2, 0, 3], direction: "left" as const, duration: 38, offset: -60 },
  { images: [4, 3, 1, 2, 0, 4, 3, 1], direction: "right" as const, duration: 42, offset: -10 },
]

function GalleryRow({ imageIndices, direction, duration, offsetX }: {
  imageIndices: number[]
  direction: "left" | "right"
  duration: number
  offsetX: number
}) {
  const tripled = [...imageIndices, ...imageIndices, ...imageIndices]
  const animName = direction === "left" ? "gallery-scroll-left" : "gallery-scroll-right"

  return (
    <div className="overflow-hidden" style={{ marginLeft: `${offsetX}px` }}>
      <div
        className="flex gap-3"
        style={{
          animation: `${animName} ${duration}s linear infinite`,
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      >
        {tripled.map((imgIdx, i) => (
          <div
            key={i}
            className="w-[130px] h-[130px] sm:w-[150px] sm:h-[150px] md:w-[170px] md:h-[170px] rounded-2xl overflow-hidden bg-neutral-100 shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GALLERY_IMAGES[imgIdx]}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              draggable={false}
              width={260}
              height={260}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)
  const [logosLoaded, setLogosLoaded] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const loadedLogosCount = useRef(0)
  const sectionRef = useRef<HTMLElement>(null)

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

  return (
    <section ref={sectionRef} className="flex flex-col items-center bg-white pt-7 sm:pt-10 pb-8 sm:pb-[67px] overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gallery-scroll-left {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-33.333%, 0, 0); }
        }
        @keyframes gallery-scroll-right {
          0% { transform: translate3d(-33.333%, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
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
        @media (prefers-reduced-motion: reduce) {
          .gallery-row-anim, .logo-marquee {
            animation: none !important;
          }
        }
      `}} />

      {/* Gallery grid background + white modal overlay */}
      <div className="relative w-full mb-7 sm:mb-[42px] lg:mb-[95px] animate-scale-fade-in">
        <div className="relative w-full h-[330px] sm:h-[280px] md:h-[330px] lg:h-[380px] xl:h-[420px] overflow-hidden">
          {/* Horizontal scrolling gallery rows — behind the white modal */}
          <div className="absolute inset-0 z-0 opacity-[0.95]">
            <div className="flex flex-col gap-3 justify-center h-full" style={{ marginTop: "-10px" }}>
              {ROW_CONFIGS.map((row, i) => (
                <GalleryRow
                  key={i}
                  imageIndices={row.images}
                  direction={row.direction}
                  duration={row.duration}
                  offsetX={row.offset}
                />
              ))}
            </div>

            {/* Gradient overlays — fade edges so grid blends with white bg */}
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* Top fade — subtle */}
              <div className="absolute top-0 left-0 right-0 h-[10%] bg-gradient-to-b from-white/80 to-transparent" />
              {/* Bottom fade — subtle */}
              <div className="absolute bottom-0 left-0 right-0 h-[12%] bg-gradient-to-t from-white/80 to-transparent" />
              {/* Left fade */}
              <div className="absolute top-0 left-0 bottom-0 w-[12%] bg-gradient-to-r from-white to-transparent" />
              {/* Right fade */}
              <div className="absolute top-0 right-0 bottom-0 w-[12%] bg-gradient-to-l from-white to-transparent" />
            </div>
          </div>

          {/* White modal with typing effect — centered on top */}
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none -translate-y-[7%] sm:translate-y-0">
            <div className="relative bg-white rounded-[24px] sm:rounded-[28px] shadow-lg shadow-neutral-200/50 border border-neutral-100/80 px-5 sm:px-10 md:px-14 md:pt-14 md:pb-12 w-[82%] max-w-[480px] text-center pointer-events-auto scale-y-[0.99] sm:scale-y-100 origin-top pt-9 pb-9 sm:pt-12 sm:pb-10">
              <>
                <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 sm:-top-4">
                  <div className="flex items-center gap-2 bg-gray-100/95 backdrop-blur-sm text-gray-700 text-[10px] sm:text-[11px] font-medium px-3 sm:px-3.5 py-1.5 rounded-full whitespace-nowrap shadow-sm border border-gray-200/50">
                    <span className="w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-full bg-gray-200 inline-flex items-center justify-center">
                      <svg viewBox="0 0 16 16" fill="none" className="w-[9px] h-[9px] sm:w-[10px] sm:h-[10px]">
                        <path d="M8.5 1L3 9.5h4.5L7 15l6-8.5H8.5L9 1h-.5z" fill="#7c3aed" stroke="#7c3aed" strokeWidth="0.5" strokeLinejoin="round" />
                      </svg>
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

      <div className="flex flex-row items-center gap-2.5 sm:gap-3 mb-5 sm:mb-[32px] animate-fade-in-up delay-200">
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

      <p className="text-[16px] sm:text-[19.5px] text-neutral-600 text-center mb-[86px] sm:mb-[127px] max-w-[90%] sm:max-w-[590px] leading-relaxed px-4 mx-auto animate-fade-in-up delay-300">
        The #1 e-commerce platform for creators & entrepreneurs. Sell products, manage links & grow an audience.
      </p>

      <div className="relative w-full animate-fade-in delay-500">
        <div className="absolute left-0 top-0 bottom-0 w-20 sm:w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 sm:w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
        <div className="overflow-hidden">
          {!logosLoaded ? (
            <div className="flex items-center justify-center gap-6 sm:gap-8 md:gap-10 py-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-[20px] sm:h-5 md:h-6 w-[69px] sm:w-[80px] md:w-[100px] rounded bg-gray-200/60 animate-pulse" />
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
                  ? "h-[41px] sm:h-[43px] md:h-[51px]"
                  : isAnthropic
                    ? "h-[21px] sm:h-[21px] md:h-[26px]"
                    : isAtlassian
                      ? "h-[17px] sm:h-[18px] md:h-[22px]"
                      : isPopj
                        ? "h-[35px] sm:h-[36px] md:h-[43px]"
                        : isNewLogo
                          ? "h-[25px] sm:h-[26px] md:h-[31px]"
                          : "h-[20px] sm:h-5 md:h-6"
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
