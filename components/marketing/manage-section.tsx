"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { AnimateOnScroll } from "./bento-grid"

const FLOATING_ICONS = [
  { label: "OnePage", pos: "md:top-[-4px] top-[-16px] left-[5%] md:left-[-2%]", delay: "0s", zClass: "z-[2]", imgSrc: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(38).webp" },
  { label: "Digital Products", pos: "md:top-[34%] md:left-[-11%] bottom-[50px] left-[4%]", delay: "0.5s", zClass: "z-[2]", imgSrc: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(37).webp" },
  { label: "Marketplace", pos: "md:top-[-16px] top-[-36px] right-[2%]", delay: "1s", zClass: "z-[5]", imgSrc: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(39).webp" },
  { emoji: "🎓", label: "Courses", pos: "bottom-[60px] left-0 md:left-[-7%]", delay: "1.5s", hideMobile: true, zClass: "z-[2]" },
  { emoji: "🔗", label: "Links", pos: "bottom-10 md:right-[-46px] right-[0px]", delay: "2s", hideMobile: true, zClass: "z-[5]" },
] as const

const MANAGE_IMAGES = [
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Macbook-Air-storelib.com%20(2).webp",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Macbook-Air-storelib.com%20(1).webp",
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Macbook-Air-storelib.com%20(3).webp",
]

function getOptimized(url: string, width: number, quality: number) {
  return `${url}?width=${width}&quality=${quality}&format=webp`
}

function ManagedImageCarousel() {
  const [current, setCurrent] = useState(0)
  const [loadedSet, setLoadedSet] = useState<Set<number>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadedSetRef = useRef<Set<number>>(new Set())
  const sectionRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [fillProgress, setFillProgress] = useState(0)
  const fillStartRef = useRef<number>(0)
  const fillRafRef = useRef<number>(0)

  const AUTOPLAY_MS = 5000

  const markLoaded = useCallback((idx: number) => {
    if (loadedSetRef.current.has(idx)) return
    loadedSetRef.current.add(idx)
    setLoadedSet(new Set(loadedSetRef.current))
  }, [])

  const startFillAnimation = useCallback(() => {
    fillStartRef.current = performance.now()
    const tick = (now: number) => {
      const elapsed = now - fillStartRef.current
      const progress = Math.min(elapsed / AUTOPLAY_MS, 1)
      setFillProgress(progress)
      if (progress < 1) {
        fillRafRef.current = requestAnimationFrame(tick)
      }
    }
    cancelAnimationFrame(fillRafRef.current)
    setFillProgress(0)
    fillRafRef.current = requestAnimationFrame(tick)
  }, [])

  const startAutoplay = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    startFillAnimation()
    intervalRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % MANAGE_IMAGES.length)
      startFillAnimation()
    }, AUTOPLAY_MS)
  }, [startFillAnimation])

  // Preload all images eagerly on mount and track loading state
  useEffect(() => {
    MANAGE_IMAGES.forEach((url, i) => {
      const img = new window.Image()
      img.decoding = "async"
      img.onload = () => markLoaded(i)
      img.onerror = () => markLoaded(i)
      img.src = getOptimized(url, 420, 20)
    })
  }, [markLoaded])

  // Start autoplay only when section is visible
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (isVisible) {
      startAutoplay()
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      cancelAnimationFrame(fillRafRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      cancelAnimationFrame(fillRafRef.current)
    }
  }, [isVisible, startAutoplay])

  const goTo = useCallback((idx: number) => {
    setCurrent(idx)
    startAutoplay()
  }, [startAutoplay])

  return (
    <div ref={sectionRef} className="w-full">
      {/* Image container with crossfade */}
      <div className="relative w-full aspect-video">
        {MANAGE_IMAGES.map((url, i) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={i}
            src={getOptimized(url, 420, 20)}
            srcSet={`${getOptimized(url, 280, 18)} 360w, ${getOptimized(url, 420, 20)} 600w`}
            alt={`Storelib Dashboard view ${i + 1}`}
            width={600}
            height={338}
            className="absolute inset-0 w-full h-full rounded-xl sm:rounded-2xl object-cover object-top"
            style={{
              opacity: i === current && loadedSet.has(i) ? 1 : 0,
              transition: "opacity 800ms cubic-bezier(0.4, 0, 0.2, 1)",
              willChange: i === current ? "opacity" : "auto",
            }}
            loading="eager"
            decoding="async"
            fetchPriority={i === 0 ? "high" : "low"}
            sizes="(max-width: 640px) 90vw, 600px"
            draggable={false}
            onLoad={() => markLoaded(i)}
            onError={() => markLoaded(i)}
            onContextMenu={(e) => e.preventDefault()}
          />
        ))}
        {/* Placeholder while first image loads */}
        {!loadedSet.has(0) && (
          <div className="absolute inset-0 w-full h-full rounded-xl sm:rounded-2xl bg-neutral-100 animate-pulse" />
        )}
      </div>

      {/* Navigation dots with loading fill */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {MANAGE_IMAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-[6px] rounded-full cursor-pointer relative overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              i === current ? "w-6 bg-violet-200" : "bg-neutral-200 hover:bg-neutral-300 w-[6px]"
            }`}
          >
            {i === current && (
              <div
                className="absolute inset-0 bg-violet-600 rounded-full origin-left"
                style={{ transform: `scaleX(${fillProgress})` }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ManageSection() {
  // Preload floating icon images at optimized size (74px icons don't need full-res)
  useEffect(() => {
    FLOATING_ICONS.forEach((icon) => {
      if ("imgSrc" in icon && icon.imgSrc) {
        const img = new window.Image()
        img.decoding = "async"
        img.src = icon.imgSrc + "?width=80&quality=35&format=webp"
      }
    })
  }, [])

  return (
    <section className="pt-20 pb-[68px] sm:py-24 text-center relative overflow-hidden bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes manage-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .manage-float-anim { animation: manage-float 4s ease-in-out infinite; }
      `}} />
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll variant="blur-in">
          <h2 className="text-[27px] md:text-[clamp(32px,4.5vw,48px)] font-bold tracking-tight mb-3">
            Manage your business 🚀
          </h2>
          <p className="text-base text-neutral-500 mb-14 max-w-[520px] mx-auto">
            Storelib has everything you need to run your digital business. All-in-one place.
          </p>
        </AnimateOnScroll>

        <AnimateOnScroll variant="zoom-in" delay={100}>
          <div className="relative max-w-[1000px] mx-auto min-h-[300px] sm:min-h-[400px]">
            {/* Floating icons */}
            {FLOATING_ICONS.map((icon) => (
              <div
                key={icon.label}
                className={`absolute flex-col items-center gap-2 ${icon.zClass} manage-float-anim ${icon.pos} ${"hideMobile" in icon && icon.hideMobile ? "hidden md:flex" : "flex"}`}
                style={{ animationDelay: icon.delay }}
              >
                <div className="w-[58px] h-[58px] md:w-[74px] md:h-[74px] rounded-full bg-violet-50 flex items-center justify-center text-[25px] md:text-[32px] shadow-md overflow-hidden">
                  {"imgSrc" in icon && icon.imgSrc ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={icon.imgSrc + "?width=80&quality=35&format=webp"}
                      alt={icon.label}
                      className={`object-cover rounded-full ${icon.label === "Digital Products" ? "w-[80%] h-[80%]" : icon.label === "Marketplace" ? "w-[130%] h-[130%]" : "w-full h-full"}`}
                      width={74}
                      height={74}
                      loading="eager"
                      decoding="async"
                    />
                  ) : ("emoji" in icon ? icon.emoji : null)}
                </div>
                <span className={`text-[10px] md:text-[12px] font-bold uppercase tracking-wider text-neutral-500 ${icon.label === "Marketplace" ? "hidden md:block" : ""}`}>
                  {icon.label}
                </span>
              </div>
            ))}

            {/* Image carousel replacing laptop mockup */}
            <div className="relative z-[1] max-w-[800px] mx-auto">
              <ManagedImageCarousel />
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
