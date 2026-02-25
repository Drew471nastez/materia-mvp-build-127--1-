"use client"

import { useEffect } from "react"

import { AnimateOnScroll } from "./bento-grid"

// Supabase render API — 1200×781 panel, images served at width=1200 quality=92.
const FEATURES = [
  {
    title: "Build Your One Page",
    description:
      "Create a single page for coaching, digital products, courses, music, links, and more.",
    src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Visits%20(1).webp?width=1200&quality=92",
    imageLeft: true,
    panelBg: "bg-violet-50",
  },
  {
    title: "Build Your Online Store",
    description:
      "Customize your store with drag-and-drop sections, products, and branding.",
    src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Visits%20(3).webp?width=1200&quality=92",
    imageLeft: false,
    panelBg: "bg-stone-50",
  },
  {
    title: "Know what makes you money",
    description:
      "Track revenue, analytics, payouts, and get paid to your bank account.",
    src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Visits%20(2).webp?width=1200&quality=92",
    imageLeft: true,
    panelBg: "bg-violet-50",
  },
]

export function SplitFeaturesSection() {
  // Fire all 3 image requests immediately on mount so they're in cache
  // before the user scrolls to them. Uses the same Supabase render URLs
  // so the browser recognises the cached response when Next/Image requests them.
  useEffect(() => {
    FEATURES.forEach(({ src }) => {
      const img = new window.Image()
      img.decoding = "async"
      img.src = src
    })
  }, [])

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex flex-col gap-20 sm:gap-28">
          {FEATURES.map((feature) => (
            <AnimateOnScroll key={feature.title}>
              <div
                className={`flex flex-col md:flex-row items-center gap-8 md:gap-14 ${
                  feature.imageLeft ? "" : "md:flex-row-reverse"
                }`}
              >
                {/* Image panel — plain img with w-full h-auto guarantees the image
                    displays at its EXACT natural aspect ratio. No fill, no forced
                    aspect ratio, no object-fit = zero cropping possible. */}
                <div
                  className={`w-full md:w-[55%] rounded-3xl ${feature.panelBg} p-4 sm:p-6 md:p-8`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={feature.src}
                    alt={feature.title}
                    className="w-full h-auto block rounded-xl"
                    loading="eager"
                    decoding="async"
                  />
                </div>

                {/* Text */}
                <div className="w-full md:w-[45%] flex flex-col items-start">
                  <h3 className="text-[30px] sm:text-[38px] md:text-[46px] font-bold tracking-tight leading-[1.1] mb-4 text-neutral-900">
                    {feature.title}
                  </h3>
                  <p className="text-base sm:text-[17px] text-neutral-500 leading-relaxed max-w-[420px]">
                    {feature.description}
                  </p>
                </div>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  )
}
