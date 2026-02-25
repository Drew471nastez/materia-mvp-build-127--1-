"use client"

import { useEffect } from "react"
import Image from "next/image"
import { AnimateOnScroll } from "./bento-grid"

// Supabase render API — served at width=1200 quality=92.
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
                {/* Image panel — full width, 16:9, image fills completely */}
                <div
                  className={`w-full md:w-[60%] rounded-3xl ${feature.panelBg} p-3 sm:p-5`}
                >
                  <div className="w-full overflow-hidden rounded-2xl">
                    <Image
                      src={feature.src}
                      alt={feature.title}
                      width={1200}
                      height={800}
                      sizes="(max-width: 768px) 90vw, 700px"
                      className="w-full h-auto"
                      loading="eager"
                      decoding="async"
                      quality={92}
                      unoptimized
                    />
                  </div>
                </div>

                {/* Text */}
                <div className="w-full md:w-[40%] flex flex-col items-start">
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
