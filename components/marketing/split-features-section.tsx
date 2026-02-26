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
    src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Visits%20(9).webp",
    imageLeft: true,
    sectionBg: "bg-gray-50",
  },
  {
    title: "Build Your Online Store",
    description:
      "Customize your store with drag-and-drop sections, products, and branding.",
    src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/Visits%20(3).webp",
    imageLeft: false,
    sectionBg: "bg-white",
  },
  {
    title: "Know what makes you money",
    description:
      "Track revenue, analytics, payouts, and get paid to your bank account.",
    src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Visits%20(10)%20(1).webp",
    imageLeft: true,
    sectionBg: "bg-gray-50",
    reducedTopPadding: true,
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
    <div>
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
          <div className="max-w-[1200px] mx-auto px-3 sm:px-6">
            <AnimateOnScroll variant={idx % 2 === 0 ? "slide-left" : "slide-right"}>
              <div
                className={`flex flex-col md:flex-row items-center gap-6 md:gap-14 ${
                  feature.imageLeft ? "" : "md:flex-row-reverse"
                }`}
              >
                {/* Image panel — full width, 16:9, image fills completely */}
                <div className="w-full md:w-[60%]">
                  <Image
                    src={feature.src}
                    alt={feature.title}
                    width={800}
                    height={450}
                    sizes="(max-width: 768px) 90vw, 700px"
                    className="w-full aspect-video object-contain rounded-2xl"
                    loading="lazy"
                    decoding="async"
                    quality={65}
                  />
                </div>

                {/* Text */}
                <div className="w-full md:w-[35%] flex flex-col items-start px-6 md:px-0">
                  <h3 className="text-[30px] sm:text-[38px] md:text-[46px] font-bold tracking-tight leading-[1.1] mb-4 text-neutral-900">
                    {feature.title}
                  </h3>
                  <p className="text-base sm:text-[17px] text-neutral-500 leading-relaxed max-w-[85%] md:max-w-[420px]">
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
