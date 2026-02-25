"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { AnimateOnScroll } from "./bento-grid"

const FEATURES = [
  {
    title: "Build Your One Page",
    description:
      "Create a single page for coaching, digital products, courses, music, links, and more.",
    image:
      "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/Visits%20(1).webp",
  },
  {
    title: "Build Your Online Store",
    description:
      "Customize your store with drag-and-drop sections, products, and branding.",
    image:
      "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/Visits%20(3).webp",
  },
  {
    title: "Know what makes you money",
    description:
      "Track revenue, analytics, payouts, and get paid to your bank account.",
    image:
      "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/Visits%20(2).webp",
  },
]

/** Lazy wrapper — only renders the Next/Image once the container nears viewport */
function LazyFeatureImage({ src, alt }: { src: string; alt: string }) {
  const [inView, setInView] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="relative w-full aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-100">
      {inView ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 92vw, 540px"
          className={`object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <div className="absolute inset-0 bg-neutral-100 animate-pulse rounded-2xl" />
      )}
    </div>
  )
}

export function SplitFeaturesSection() {
  return (
    <section className="py-20 sm:py-24 bg-white">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll>
          <div className="text-center max-w-[640px] mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-4">
              How it works
            </span>
            <h2 className="text-[clamp(30px,4vw,44px)] font-semibold leading-[1.15] tracking-tight mb-3.5">
              Three steps to launch your business
            </h2>
            <p className="text-base text-neutral-500 leading-relaxed">
              From link-in-bio to full online store — set up in minutes, not months.
            </p>
          </div>
        </AnimateOnScroll>

        <div className="flex flex-col gap-16 sm:gap-20">
          {FEATURES.map((feature, i) => {
            const imageLeft = i % 2 === 0
            return (
              <AnimateOnScroll key={feature.title}>
                <div
                  className={`flex flex-col md:flex-row items-center gap-8 md:gap-14 ${
                    imageLeft ? "" : "md:flex-row-reverse"
                  }`}
                >
                  {/* Image */}
                  <div className="w-full md:w-1/2">
                    <LazyFeatureImage
                      src={feature.image}
                      alt={feature.title}
                    />
                  </div>

                  {/* Text */}
                  <div className="w-full md:w-1/2 flex flex-col items-start">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-violet-50 text-violet-600 text-sm font-bold mb-4">
                      {i + 1}
                    </span>
                    <h3 className="text-[22px] sm:text-[28px] font-semibold tracking-tight leading-snug mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-base text-neutral-500 leading-relaxed max-w-[440px]">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </AnimateOnScroll>
            )
          })}
        </div>
      </div>
    </section>
  )
}
