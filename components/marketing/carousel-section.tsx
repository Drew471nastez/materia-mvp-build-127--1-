"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { AnimateOnScroll } from "./bento-grid"

const SLIDES = [
  {
    name: "Andrew M.",
    role: "Artist & Musician",
    bio: "Artist & Musician · 12K followers",
    avatar: "linear-gradient(135deg,#FF6B35,#FFa040)",
    links: [
      { icon: "🎵", label: "Sample Pack Vol. 3 — $24", bg: "bg-violet-50" },
      { icon: "🎹", label: "Beat Kit (50 beats) — $49", bg: "bg-orange-50" },
      { icon: "📄", label: "Free: Mix Template", bg: "bg-green-50" },
    ],
    quote: "\"I switched from Gumroad and my conversions doubled in the first week. Having everything on one page — products, links, email capture — just works.\"",
  },
  {
    name: "Sarah Chen",
    role: "UX/UI Designer",
    bio: "UX/UI Designer · 42K followers",
    avatar: "linear-gradient(135deg,#7C5CFC,#a78bfa)",
    links: [
      { icon: "📚", label: "UI Design Masterclass — $49", bg: "bg-violet-50" },
      { icon: "🎨", label: "Icon Pack (200+) — $19", bg: "bg-amber-50" },
      { icon: "📋", label: "Free: Design System Checklist", bg: "bg-green-50" },
    ],
    quote: "\"I replaced three tools with one Storelib OnePage — my link-in-bio, landing page, and checkout. Revenue went up 40% in the first month.\"",
  },
  {
    name: "James Ortiz",
    role: "Business Coach",
    bio: "Business Coach · 89K followers",
    avatar: "linear-gradient(135deg,#22C55E,#4ade80)",
    links: [
      { icon: "🚀", label: "Scale to $10K Course — $149", bg: "bg-orange-50" },
      { icon: "📋", label: "Business Plan Template — $29", bg: "bg-violet-50" },
      { icon: "🎙️", label: "Free: Weekly Newsletter", bg: "bg-green-50" },
    ],
    quote: "\"Finally, a platform that looks premium. My customers tell me my store looks like I hired a designer. That credibility matters when you charge $149.\"",
  },
  {
    name: "Maya Kim",
    role: "Photographer",
    bio: "Photographer · 28K followers",
    avatar: "linear-gradient(135deg,#F97316,#fb923c)",
    links: [
      { icon: "📸", label: "Lightroom Preset Pack — $35", bg: "bg-amber-50" },
      { icon: "🎓", label: "Photography 101 — $79", bg: "bg-violet-50" },
      { icon: "📄", label: "Free: Editing Cheat Sheet", bg: "bg-green-50" },
    ],
    quote: "\"Sold $6K in presets last month alone. The OnePage makes it so easy for followers to find what they need and buy right there.\"",
  },
  {
    name: "Liam Torres",
    role: "Fitness Creator",
    bio: "Fitness Creator · 56K followers",
    avatar: "linear-gradient(135deg,#06B6D4,#22d3ee)",
    links: [
      { icon: "🏋️", label: "12-Week Program — $59", bg: "bg-cyan-50" },
      { icon: "📋", label: "Meal Plan Bundle — $29", bg: "bg-orange-50" },
      { icon: "🎥", label: "Free: Daily Workout Video", bg: "bg-green-50" },
    ],
    quote: "\"Moving to Storelib was the best decision I made. My fitness programs sell themselves now — the OnePage checkout flow is seamless and my customers love it.\"",
  },
]

export function CarouselSection() {
  const [current, setCurrent] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const getSlideWidth = useCallback(() => {
    if (!trackRef.current) return 704
    const slide = trackRef.current.querySelector<HTMLElement>("[data-slide]")
    return slide ? slide.offsetWidth + 24 : 704
  }, [])

  const goTo = useCallback((n: number) => {
    const clamped = Math.max(0, Math.min(n, SLIDES.length - 1))
    setCurrent(clamped)
  }, [])

  // Reset autoplay timer whenever current changes
  const resetAutoplay = useCallback(() => {
    if (autoplayRef.current) clearInterval(autoplayRef.current)
    autoplayRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % SLIDES.length)
    }, 4000)
  }, [])

  useEffect(() => {
    resetAutoplay()
    return () => { if (autoplayRef.current) clearInterval(autoplayRef.current) }
  }, [resetAutoplay])

  useEffect(() => {
    if (!trackRef.current) return
    trackRef.current.style.transform = `translateX(-${current * getSlideWidth()}px)`
  }, [current, getSlideWidth])

  useEffect(() => {
    const onResize = () => {
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(-${current * getSlideWidth()}px)`
      }
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [current, getSlideWidth])

  const handleGoTo = useCallback((n: number) => {
    goTo(n)
    resetAutoplay()
  }, [goTo, resetAutoplay])

  return (
    <section className="py-16 sm:py-22 bg-white">
      <div className="max-w-[1260px] mx-auto">
        <AnimateOnScroll className="px-6">
          <div className="text-center mb-10 sm:mb-12">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-4">
              🔗 OnePage
            </span>
            <h2 className="text-[clamp(27px,3.6vw,40px)] font-semibold leading-[1.15] tracking-tight mb-3.5">
              The link in bio creators love
            </h2>
            <p className="text-[15px] text-neutral-500 max-w-[460px] mx-auto">
              A simple page for your products, links and audience.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll>
          <div className="relative overflow-hidden mx-[-24px] px-6 pl-8 sm:pl-10">
            <div
              ref={trackRef}
              className="flex gap-6 py-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
              onTouchEnd={(e) => {
                const diff = touchStartX.current - e.changedTouches[0].clientX
                if (Math.abs(diff) > 50) handleGoTo(diff > 0 ? current + 1 : current - 1)
              }}
            >
              {SLIDES.map((slide) => (
                <div
                  key={slide.name}
                  data-slide
                  className="flex-shrink-0 w-[calc(100vw-56px)] sm:w-[714px] grid grid-cols-[120px_1fr] sm:grid-cols-[216px_1fr] gap-3 sm:gap-8 items-center bg-neutral-50/60 border border-neutral-200/70 rounded-2xl sm:rounded-3xl p-4 sm:p-7 transition-all duration-300 hover:shadow-md"
                >
                  {/* Phone mockup */}
                  <div className="w-[120px] sm:w-[216px] mx-auto sm:mx-0 bg-neutral-900 rounded-[20px] sm:rounded-[28px] p-1.5 sm:p-2 shadow-lg">
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

                  {/* Info */}
                  <div className="py-0 sm:py-2">
                    <div className="text-[15px] sm:text-[20px] font-bold mb-0.5">{slide.name}</div>
                    <div className="text-[11px] sm:text-[13px] text-violet-600 font-semibold mb-2 sm:mb-5">{slide.role}</div>
                    <div className="text-[12px] sm:text-[15px] italic leading-relaxed text-neutral-500 pl-3 sm:pl-4 border-l-2 sm:border-l-[3px] border-violet-300 line-clamp-4 sm:line-clamp-none">
                      {slide.quote}
                    </div>
                    <div className="mt-2 sm:mt-4 text-amber-400 text-[13px] sm:text-[15px] tracking-widest">★★★★★</div>
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
            className="w-11 h-11 rounded-full bg-white border-[1.5px] border-neutral-200 flex items-center justify-center text-base text-neutral-900 transition-all duration-300 hover:border-violet-500 hover:text-violet-600 hover:bg-violet-50"
          >
            ←
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
            className="w-11 h-11 rounded-full bg-white border-[1.5px] border-neutral-200 flex items-center justify-center text-base text-neutral-900 transition-all duration-300 hover:border-violet-500 hover:text-violet-600 hover:bg-violet-50"
          >
            →
          </button>
        </div>
      </div>
    </section>
  )
}
