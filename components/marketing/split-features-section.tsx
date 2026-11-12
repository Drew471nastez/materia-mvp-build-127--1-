"use client"

import { StoryHeading } from "./story-heading"

import Image from "next/image"
import { AnimateOnScroll } from "./bento-grid"

// Supabase object storage — original full images (no render crop).
const FEATURES = [
  {
    title: "Your links. Your look. Your OnePage.",
    description:
      "Create a single page for coaching, digital products, courses, music, links, and more.",
    src: "https://storelib.com/media/platform%20images/Visits%20(14).webp",
    imageLeft: true,
    sectionBg: "bg-gray-50",
  },
  {
    title: "A storefront built around your brand.",
    description:
      "Customize your store with drag-and-drop sections, products, and branding.",
    src: "https://storelib.com/media/platform%20images/collage%20imags/Visits%20(3).webp",
    imageLeft: false,
    sectionBg: "bg-white",
  },
]

export function SplitFeaturesSection() {
  /*
    Round 48: no idle Image() of each original upload. The <Image> below draws
    the optimizer's resized file, so that was a second, larger download of
    each picture that nothing painted.
  */

  return (
    <div className="overflow-clip">
      {FEATURES.map((feature, idx) => (
        <section data-story-section="split" key={feature.title} className={`relative py-20 ${"reducedTopPadding" in feature && feature.reducedTopPadding ? "sm:pt-10 sm:pb-28" : "sm:py-28"} ${feature.sectionBg}`}>
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
            <AnimateOnScroll variant={idx % 2 === 0 ? "slide-left" : "slide-right"}>
              <div
                className={`flex flex-col md:flex-row items-center gap-8 md:gap-10 lg:gap-16 ${
                  feature.imageLeft ? "" : "md:flex-row-reverse"
                }`}
              >
                {/* Image panel — fixed 52% so remaining space is always enough for text */}
                <div className="w-full md:w-[52%] shrink-0 rounded-[28px] bg-white/70 p-3 sm:p-5 border border-neutral-200/60">
                  <Image
                    src={feature.src}
                    alt={feature.title}
                    width={900}
                    height={700}
                    sizes="(max-width: 768px) 95vw, 52vw"
                    className="w-full h-auto object-contain rounded-2xl"
                    /* Round 48: lazy (it was eager, which put a preload for each in the head of the home page, ahead of the hero). */
                    loading="lazy"
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
                  <StoryHeading as="h3" text={feature.title} accent={["onepage", "brand"]} className="mb-6" />
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
