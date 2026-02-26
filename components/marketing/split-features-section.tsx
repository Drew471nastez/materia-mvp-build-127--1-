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
    src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Visits%20(8).webp",
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
    src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/Visits%20(6).webp",
    imageLeft: true,
    sectionBg: "bg-gray-50",
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
    <div>
      {FEATURES.map((feature) => (
        <section key={feature.title} className={`py-20 sm:py-28 ${feature.sectionBg}`}>
          <div className="max-w-[1200px] mx-auto px-3 sm:px-6">
            <AnimateOnScroll>
              <div
                className={`flex flex-col md:flex-row items-center gap-8 md:gap-14 ${
                  feature.imageLeft ? "" : "md:flex-row-reverse"
                }`}
              >
                {/* Image panel — full width, 16:9, image fills completely */}
                <div className="w-full md:w-[60%]">
                  <Image
                    src={feature.src}
                    alt={feature.title}
                    width={1200}
                    height={675}
                    sizes="(max-width: 768px) 90vw, 700px"
                    className="w-full aspect-video object-contain rounded-2xl"
                    loading="eager"
                    decoding="async"
                    quality={95}
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
