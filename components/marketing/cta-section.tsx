"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"

const CTA_IMG = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(36).webp"

function LazyCtaImage() {
  const [loaded, setLoaded] = useState(false)
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect() } },
      { rootMargin: "300px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="w-full">
      {inView ? (
        <img
          src={CTA_IMG}
          alt="Storelib platform"
          width={1200}
          height={675}
          className={`w-full rounded-xl sm:rounded-2xl object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          sizes="(max-width: 768px) 90vw, 1000px"
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <div className="w-full aspect-video rounded-xl sm:rounded-2xl bg-neutral-800 animate-pulse" />
      )}
    </div>
  )
}

export function CtaSection() {
  return (
    <section className="py-10 sm:py-16 bg-white">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="bg-neutral-900 rounded-[24px] sm:rounded-[32px] overflow-hidden relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse,rgba(124,92,252,0.15)_0%,transparent_70%)] pointer-events-none" />

          <div className="relative px-6 sm:px-12 md:px-16 pt-14 sm:pt-16 pb-0">
            {/* Text content */}
            <div className="text-center max-w-[640px] mx-auto mb-10 sm:mb-12">
              <h2 className="text-[clamp(30px,5vw,48px)] font-bold tracking-tight mb-3.5 text-white leading-[1.1]">
                Turn your ideas into income
              </h2>
              <p className="text-base sm:text-lg text-neutral-400 mb-8">
                Set up in 5 minutes. No credit card. No commitment.
              </p>
              <div className="flex items-center justify-center gap-3 flex-col sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 text-base font-semibold py-4 px-10 rounded-full bg-white text-neutral-900 hover:bg-neutral-100 transition-all duration-300 hover:-translate-y-0.5 w-full sm:w-auto max-w-[300px]"
                >
                  Create your store →
                </Link>
                <Link
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 text-base font-semibold py-4 px-10 rounded-full border-[1.5px] border-white/20 text-white hover:border-white/50 hover:bg-white/5 transition-all duration-300 w-full sm:w-auto max-w-[300px]"
                >
                  See how it works
                </Link>
              </div>
            </div>

            {/* Image */}
            <div className="max-w-[1000px] mx-auto">
              <LazyCtaImage />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
