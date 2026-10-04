"use client"

import { useEffect } from "react"
import Image from "next/image"
import { AnimateOnScroll } from "./bento-grid"

// Supabase object storage — original full images (no render crop).
const FEATURES = [
  {
    title: "Build Your One Page",
    description:
      "Create a single page for coaching, digital products, courses, music, links, and more.",
    src: "https://storelib.com/media/platform%20images/Visits%20(14).webp",
    imageLeft: true,
    sectionBg: "bg-gray-50",
  },
  {
    title: "Build Your Online Store",
    description:
      "Customize your store with drag-and-drop sections, products, and branding.",
    src: "https://storelib.com/media/platform%20images/collage%20imags/Visits%20(3).webp",
    imageLeft: false,
    sectionBg: "bg-white",
  },
]

export function SplitFeaturesSection() {
  // Defer preloading to idle time so it doesn't block main thread
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(() => {
        FEATURES.forEach(({ src }) => {
          const img = new window.Image()
          img.decoding = "async"
          img.src = src
        })
      })
    }
  }, [])

  return (
    <div className="overflow-x-hidden">
      {FEATURES.map((feature, idx) => (
        <section key={feature.title} className={`relative py-20 ${"reducedTopPadding" in feature && feature.reducedTopPadding ? "sm:pt-10 sm:pb-28" : "sm:py-28"} ${feature.sectionBg}`}>
          {/* Curved divider at the top of sections transitioning from white to gray */}
          {idx === 0 && (
            <div className="absolute top-0 left-0 w-full overflow-hidden leading-[0] -translate-y-[1px]">
              <svg viewBox="0 0 1440 48" fill="none" preserveAspectRatio="none" className="w-full h-[32px] sm:h-[48px]">
                <path d="M0 0h1440v8c-240 26-480 40-720 40S240 34 0 8V0z" fill="white" />
              </svg>
            </div>
          )}
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
            <AnimateOnScroll variant={idx % 2 === 0 ? "slide-left" : "slide-right"}>
              <div
                className={`flex flex-col md:flex-row items-center gap-8 md:gap-10 lg:gap-16 ${
                  feature.imageLeft ? "" : "md:flex-row-reverse"
                }`}
              >
                {/* Image panel — fixed 52% so remaining space is always enough for text */}
                <div className="w-full md:w-[52%] shrink-0">
                  <Image
                    src={feature.src}
                    alt={feature.title}
                    width={900}
                    height={700}
                    sizes="(max-width: 768px) 95vw, 52vw"
                    className="w-full h-auto object-contain rounded-2xl"
                    loading="eager"
                    decoding="async"
                    /* `unoptimized` was here, so <Image> served the original
                       upload untouched: two screenshots, ~190 KB together, for
                       a panel that is 52% of the page. Without it the same
                       component resizes and re-encodes at the edge, which is
                       the entire reason to be using <Image> at all. */
                  />
                </div>

                {/* Text — flex-1 + min-w-0 so it takes the remaining space and never overflows */}
                <div className="w-full md:flex-1 md:min-w-0 flex flex-col items-start px-2 md:px-0">
                  <h3 className="text-[30px] sm:text-[38px] md:text-[42px] lg:text-[46px] font-bold tracking-tight leading-[1.1] mb-4 text-neutral-900">
                    {feature.title}
                  </h3>
                  <p className="text-base sm:text-[17px] text-neutral-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </AnimateOnScroll>
          </div>
        </section>
      ))}
    </div>
  )
}
