"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { AnimateOnScroll } from "./bento-grid"

const SLIDES = [
  {
    name: "Negru W.",
    role: "DJ & Music Producer",
    bio: "DJ & Music Producer · 12K followers",
    avatar: "linear-gradient(135deg,#FF6B35,#FFa040)",
    phoneImage: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(43).webp",
    links: [
      { icon: "🎵", label: "Sample Pack Vol. 3 — $24", bg: "bg-violet-50" },
      { icon: "🎹", label: "Beat Kit (50 beats) — $49", bg: "bg-orange-50" },
      { icon: "📄", label: "Free: Mix Template", bg: "bg-green-50" },
    ],
    quote: "\"I sell my mixes and sample packs on Storelib. Everything is in one place, the page looks professional. I don't have to think about the tech stuff anymore, I just upload and it's live. Honestly wish I found this earlier.\"",
  },
  {
    name: "Satori Studio",
    role: "Creative Studio",
    bio: "Creative Studio · 42K followers",
    avatar: "linear-gradient(135deg,#7C5CFC,#a78bfa)",
    phoneImage: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(41).png",
    links: [
      { icon: "📚", label: "UI Design Masterclass — $49", bg: "bg-violet-50" },
      { icon: "🎨", label: "Icon Pack (200+) — $19", bg: "bg-amber-50" },
      { icon: "📋", label: "Free: Design System Checklist", bg: "bg-green-50" },
    ],
    quote: "\"We switched to Storelib a few months ago and it's been great honestly. We use it to showcase our photography portfolio, sell presets to other creatives, and manage all our links in one page. Clients can find everything in one place which saves us so much back and forth.\"",
  },
]

export function CarouselSection() {
  const [current, setCurrent] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // No longer needed — slides are 100% wide, translate by percentage

  const goTo = useCallback((n: number) => {
    setCurrent(((n % SLIDES.length) + SLIDES.length) % SLIDES.length)
  }, [])

  // Reset autoplay timer whenever current changes
  const resetAutoplay = useCallback(() => {
    if (autoplayRef.current) clearInterval(autoplayRef.current)
    autoplayRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % SLIDES.length)
    }, 6000)
  }, [])

  useEffect(() => {
    resetAutoplay()
    return () => { if (autoplayRef.current) clearInterval(autoplayRef.current) }
  }, [resetAutoplay])

  useEffect(() => {
    if (!trackRef.current) return
    trackRef.current.style.transform = `translateX(-${current * 100}%)`
  }, [current])

  const handleGoTo = useCallback((n: number) => {
    goTo(n)
    resetAutoplay()
  }, [goTo, resetAutoplay])

  return (
    <section className="py-16 sm:py-22 bg-white">
      <div className="max-w-[1260px] mx-auto lg:border lg:border-neutral-200/70 lg:rounded-3xl lg:py-4 pr-3 sm:pr-6">
        <AnimateOnScroll variant="blur-in" className="px-6">
          <div className="text-center mb-10 sm:mb-12">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-4">
              🔗 OnePage
            </span>
            <h2 className="text-[clamp(27px,3.6vw,40px)] lg:text-[60px] font-semibold leading-[1.15] tracking-tight mb-3.5">
              The link in bio creators love
            </h2>
            <p className="text-[15px] text-neutral-500 max-w-[460px] mx-auto">
              A simple page for your products, links and audience.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="fade-up-scale" delay={150}>
          <div ref={containerRef} className="relative overflow-hidden">
            <div
              ref={trackRef}
              className="flex py-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
              onTouchEnd={(e) => {
                const diff = touchStartX.current - e.changedTouches[0].clientX
                if (Math.abs(diff) > 50) handleGoTo(diff > 0 ? current + 1 : current - 1)
              }}
            >
              {SLIDES.map((slide) => (
                <div key={slide.name} data-slide className="min-w-full px-4 sm:px-10">
                <div
                  className="grid grid-cols-[140px_1fr] sm:grid-cols-[216px_1fr] gap-3 sm:gap-8 items-center bg-neutral-50/60 border border-neutral-200/70 rounded-2xl sm:rounded-3xl p-4 sm:p-7 transition-all duration-300 hover:shadow-md"
                >
                  {/* Phone mockup */}
                  {"phoneImage" in slide && slide.phoneImage ? (
                    <div className="w-[140px] sm:w-[216px] mx-auto sm:mx-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={slide.phoneImage + "?width=432&quality=70"}
                        alt={slide.name}
                        width={216}
                        height={432}
                        className="w-full rounded-[20px] sm:rounded-[28px] shadow-lg object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ) : (
                    <div className="w-[140px] sm:w-[216px] mx-auto sm:mx-0 bg-neutral-900 rounded-[20px] sm:rounded-[28px] p-1.5 sm:p-2 shadow-lg">
                      <div className="bg-white rounded-[14px] sm:rounded-[22px] overflow-hidden">
                        <div className="w-10 sm:w-16 h-0.5 sm:h-1 bg-neutral-900 rounded mx-auto mt-1 sm:mt-1.5" />
                        <div className="text-center px-2 sm:px-3.5 pt-2.5 sm:pt-4 pb-1.5 sm:pb-2.5 border-b border-neutral-100">
                          <div className="w-[28px] h-[28px] sm:w-[46px] sm:h-[46px] rounded-full mx-auto mb-1 sm:mb-2" style={{ background: slide.avatar }} />
                          <div className="text-[9px] sm:text-[13px] font-bold leading-tight">{slide.name}</div>
                          <div className="text-[7px] sm:text-[10px] text-neutral-400 mt-0.5 hidden sm:block">{slide.bio}</div>
                        </div>
                        <div className="p-1.5 sm:p-3 flex flex-col gap-1 sm:gap-1.5">
                          {slide.links.map((link) => (
                            <div key={link.label} className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2.5 py-1 sm:py-2 bg-neutral-50 rounded sm:rounded-lg text-[8px] sm:text-[11px] font-medium">
                              <div className={`w-4 h-4 sm:w-6 sm:h-6 rounded sm:rounded-md flex items-center justify-center text-[8px] sm:text-xs shrink-0 ${link.bg}`}>
                                {link.icon}
                              </div>
                              <span className="truncate">{link.label}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-center px-1.5 sm:px-2.5 py-1 sm:py-2 bg-neutral-900 text-white rounded sm:rounded-lg text-[8px] sm:text-[11px] font-semibold">
                            Visit my store
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Info */}
                  <div className="py-0 sm:py-2 min-w-0 overflow-hidden pr-1 sm:pr-2">
                    <div className="text-[13px] sm:text-[20px] font-bold mb-0.5">{slide.name}</div>
                    <div className="text-[10px] sm:text-[13px] text-violet-600 font-semibold mb-2 sm:mb-5">{slide.role}</div>
                    <div className="text-[10px] sm:text-[15px] italic leading-relaxed text-neutral-500 pl-2.5 sm:pl-4 pr-1 border-l-2 sm:border-l-[3px] border-violet-300 line-clamp-4 sm:line-clamp-none break-words">
                      {slide.quote}
                    </div>
                    <div className="mt-2 sm:mt-4 text-amber-400 text-[12px] sm:text-[15px] tracking-widest">★★★★★</div>
                  </div>
                </div>
                </div>
              ))}
            </div>
          </div>
        </AnimateOnScroll>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 mt-7 px-6">
          <button
            onClick={() => handleGoTo(current - 1)}
            aria-label="Previous slide"
            className="w-11 h-11 rounded-full bg-white border-[1.5px] border-neutral-200 flex items-center justify-center text-neutral-900 transition-all duration-300 hover:border-violet-500 hover:text-violet-600 hover:bg-violet-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div className="flex gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => handleGoTo(i)}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${i === current ? "bg-violet-600 w-6" : "bg-neutral-200 w-2"}`}
              />
            ))}
          </div>
          <button
            onClick={() => handleGoTo(current + 1)}
            aria-label="Next slide"
            className="w-11 h-11 rounded-full bg-white border-[1.5px] border-neutral-200 flex items-center justify-center text-neutral-900 transition-all duration-300 hover:border-violet-500 hover:text-violet-600 hover:bg-violet-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      </div>
    </section>
  )
}
