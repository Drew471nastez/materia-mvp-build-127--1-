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
]

export function CarouselSection() {
  const [current, setCurrent] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)

  const getSlideWidth = useCallback(() => {
    if (!trackRef.current) return 704
    const slide = trackRef.current.querySelector<HTMLElement>("[data-slide]")
    return slide ? slide.offsetWidth + 24 : 704
  }, [])

  const goTo = useCallback((n: number) => {
    const clamped = Math.max(0, Math.min(n, SLIDES.length - 1))
    setCurrent(clamped)
  }, [])

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

  return (
    <section className="py-20 sm:py-24 bg-neutral-50/80">
      <div className="max-w-[1400px] mx-auto">
        <AnimateOnScroll className="px-6">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-4">
              🔗 OnePage
            </span>
            <h2 className="text-[clamp(30px,4vw,44px)] font-semibold leading-[1.15] tracking-tight mb-3.5">
              Your link-in-bio, but it actually makes money
            </h2>
            <p className="text-base text-neutral-500 max-w-[500px] mx-auto">
              See how creators use Storelib OnePage to turn followers into customers.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll>
          <div className="relative overflow-hidden mx-[-24px] px-6">
            <div
              ref={trackRef}
              className="flex gap-6 py-5 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
              onTouchEnd={(e) => {
                const diff = touchStartX.current - e.changedTouches[0].clientX
                if (Math.abs(diff) > 50) goTo(diff > 0 ? current + 1 : current - 1)
              }}
            >
              {SLIDES.map((slide, i) => (
                <div
                  key={slide.name}
                  data-slide
                  className="flex-shrink-0 w-[calc(100vw-72px)] sm:w-[680px] grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-6 sm:gap-9 items-center bg-white border border-neutral-100 rounded-3xl p-6 sm:p-8 transition-all duration-300 hover:shadow-md"
                >
                  {/* Phone mockup */}
                  <div className="w-[200px] sm:w-[240px] mx-auto sm:mx-0 bg-neutral-900 rounded-[32px] p-2.5 shadow-lg">
                    <div className="bg-white rounded-3xl overflow-hidden">
                      <div className="w-20 h-1 bg-neutral-900 rounded mx-auto mt-2" />
                      <div className="text-center px-4 pt-5 pb-3 border-b border-neutral-100">
                        <div className="w-[52px] h-[52px] rounded-full mx-auto mb-2.5" style={{ background: slide.avatar }} />
                        <div className="text-sm font-bold">{slide.name}</div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">{slide.bio}</div>
                      </div>
                      <div className="p-3.5 flex flex-col gap-2">
                        {slide.links.map((link) => (
                          <div key={link.label} className="flex items-center gap-2.5 px-3 py-2.5 bg-neutral-50 rounded-[10px] text-xs font-medium">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${link.bg}`}>
                              {link.icon}
                            </div>
                            {link.label}
                          </div>
                        ))}
                        <div className="flex items-center justify-center px-3 py-2.5 bg-neutral-900 text-white rounded-[10px] text-xs font-semibold">
                          ✦ Visit my store
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="py-2">
                    <div className="text-[22px] font-bold mb-1">{slide.name}</div>
                    <div className="text-sm text-violet-600 font-semibold mb-6">{slide.role}</div>
                    <div className="text-[17px] italic leading-relaxed text-neutral-500 pl-5 border-l-[3px] border-violet-300">
                      {slide.quote}
                    </div>
                    <div className="mt-5 text-amber-400 text-base tracking-widest">★★★★★</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnimateOnScroll>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 mt-8 px-6">
          <button
            onClick={() => goTo(current - 1)}
            className="w-12 h-12 rounded-full bg-white border-[1.5px] border-neutral-200 flex items-center justify-center text-lg text-neutral-900 transition-all duration-300 hover:border-violet-500 hover:text-violet-600 hover:bg-violet-50"
          >
            ←
          </button>
          <div className="flex gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${i === current ? "bg-violet-600 w-6" : "bg-neutral-200 w-2"}`}
              />
            ))}
          </div>
          <button
            onClick={() => goTo(current + 1)}
            className="w-12 h-12 rounded-full bg-white border-[1.5px] border-neutral-200 flex items-center justify-center text-lg text-neutral-900 transition-all duration-300 hover:border-violet-500 hover:text-violet-600 hover:bg-violet-50"
          >
            →
          </button>
        </div>
      </div>
    </section>
  )
}
