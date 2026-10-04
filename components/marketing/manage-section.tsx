"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { AnimateOnScroll } from "./bento-grid"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"

const FLOATING_ICONS = [
  { label: "OnePage", pos: "md:top-[-4px] top-[-16px] left-[5%] md:left-[-2%]", delay: "0s", zClass: "z-[2]", imgSrc: "https://storelib.com/media/platform%20images/Untitled%20design%20(38).webp" },
  { label: "Digital Products", pos: "md:top-[34%] md:left-[-11%] bottom-[50px] left-[4%]", delay: "0.5s", zClass: "z-[2]", imgSrc: "https://storelib.com/media/platform%20images/Untitled%20design%20(37).webp" },
  { label: "Marketplace", pos: "md:top-[-16px] top-[-36px] right-[2%]", delay: "1s", zClass: "z-[5]", imgSrc: "https://storelib.com/media/platform%20images/Untitled%20design%20(39).webp" },
  { emoji: "🎓", label: "Courses", pos: "bottom-[60px] left-0 md:left-[-7%]", delay: "1.5s", hideMobile: true, zClass: "z-[2]" },
  { emoji: "🔗", label: "Links", pos: "bottom-10 md:right-[-46px] right-[0px]", delay: "2s", hideMobile: true, zClass: "z-[5]" },
] as const

const MANAGE_IMAGES = [
  "https://storelib.com/media/platform%20images/Macbook-Air-storelib.com%20(2).webp",
  "https://storelib.com/media/platform%20images/Macbook-Air-storelib.com%20(1).webp",
  "https://storelib.com/media/platform%20images/Macbook-Air-storelib.com%20(3).webp",
]

/*
  WHY EVERY URL HERE GOES THROUGH `/_next/image`.

  Supabase's own transformer is metered, this project has exhausted it, and
  tests/no-image-transforms.test.ts fails the build over any use of it. The
  conclusion once drawn from that — hand back the original upload — meant this
  section shipped three 2718px dashboard screenshots at full size into a 800px
  frame, and three more at full size into 74px circles; one of those circles
  was fetching 304 KB.

  `/_next/image` is a different endpoint with no relationship to Supabase's:
  Next resizes and re-encodes at the edge and caches for a year. `q` must be a
  value listed in next.config's `images.qualities` and `w` a member of its
  size lists, or the answer is a 400 rather than a picture — which is why the
  helpers in lib/images/optimized-url.ts exist rather than string building
  here.
*/

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

  /*
    ═══════════════════════════════════════════════════════════════════════
     A PICTURE THAT ARRIVED BEFORE THE PAGE COULD HEAR IT
    ═══════════════════════════════════════════════════════════════════════
    "The Manage your business images are not displaying at all, it shows
    just a grey." The three slides are in the server's HTML with opacity 0,
    and each is shown by its own onLoad. But this section is a dynamic
    import, hydrated well after the HTML is parsed, and the pictures are
    eager and small: on a warm cache, or any quick line, they had finished
    loading before React attached a listener to them. A load event that has
    already happened is never sent again, so nothing ever marked them
    loaded, the pictures stayed at opacity 0 and the grey pulse stayed over
    them, on storelib.com, for good.

    So on mount each one is asked whether it is already complete, the way
    AppAvatar asks for a photo drawn by the server. A picture that failed
    before hydration is complete too, and is marked the same way onError
    would have marked it.
  */
  const imgRefs = useRef<Array<HTMLImageElement | null>>([])
  useEffect(() => {
    imgRefs.current.forEach((img, i) => {
      if (img?.complete) markLoaded(i)
    })
  }, [markLoaded])

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

  /*
    THE PRELOAD IS GONE, AND IT WAS COSTING DOUBLE.

    It fetched `w=1080` while the <img> below rendered `w=828`: two different
    files for each of three pictures, six downloads for three slides. Its only
    job was to set `loadedSet`, which the <img>'s own onLoad already does —
    those elements are in the document with loading="eager", so there is
    nothing a detached Image() starts any sooner.
  */

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
            ref={(el) => {
              imgRefs.current[i] = el
            }}
            /*
              ═══════════════════════════════════════════════════════════════
               ENOUGH PIXELS FOR THE SCREEN IT IS PAINTED ON
              ═══════════════════════════════════════════════════════════════
              Reported as bad quality, and it was arithmetic rather than
              opinion. This sits in `max-w-[800px]`, so on a desktop it is
              drawn 800 CSS px wide — 1600 device pixels on a 2x screen, 2400
              on a 3x one. It was asking for 828, from an original that is
              2718px wide. Just over half the resolution the screen can show,
              which is exactly what soft looks like.

              The old srcSet made it worse by lying about its candidates:
              a candidate produced at 828px was described as "600w". A `w`
              descriptor is the width of the FILE, and
              a browser choosing between two of them by numbers neither one is
              cannot land anywhere sensible.
            */
            src={optimizedImageUrl(url, 540, 75)}
            srcSet={optimizedSrcSet(url, [640, 828, 1080, 1920, 2048], 75)}
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
            /* The frame is `max-w-[800px]` inside `max-w-[1200px] px-6`, so it is
               800 until the viewport is narrow enough for the padding to bite. */
            sizes="(max-width: 848px) calc(100vw - 48px), 800px"
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
        img.src = icon.imgSrc
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
                      /* 74px on the widest screen, so the optimizer is asked
                         for that and not for the 304 KB original. */
                      src={optimizedImageUrl(icon.imgSrc, 74, 75)}
                      alt={icon.label}
                      className={`object-cover rounded-full ${icon.label === "Digital Products" ? "w-[80%] h-[80%]" : icon.label === "Marketplace" ? "w-[130%] h-[130%]" : "w-full h-full"}`}
                      width={74}
                      height={74}
                      loading="eager"
                      decoding="async"
                    />
                  ) : ("emoji" in icon ? icon.emoji : null)}
                </div>
                <span className={`text-[10px] md:text-[12px] font-bold uppercase tracking-wider text-neutral-500 ${icon.label === "Marketplace" || icon.label === "OnePage" ? "hidden md:block" : ""}`}>
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
