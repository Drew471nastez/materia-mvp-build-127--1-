"use client"

import { useState, useEffect, useRef } from "react"
import { AnimateOnScroll } from "./bento-grid"

const OnePageIcon = () => (
  <svg width="25" height="31" viewBox="0 0 28 34" fill="none" className="md:w-[32px] md:h-[39px]">
    <rect x="1" y="1" width="26" height="32" rx="4" fill="white" stroke="#a78bfa" strokeWidth="1.5"/>
    <circle cx="14" cy="10" r="4.5" fill="#c4b5fd"/>
    <rect x="7" y="18" width="14" height="2" rx="1" fill="#a78bfa"/>
    <rect x="9" y="22.5" width="10" height="1.5" rx="0.75" fill="#ddd6fe"/>
    <rect x="9" y="26" width="10" height="1.5" rx="0.75" fill="#ddd6fe"/>
    <rect x="9" y="29.5" width="10" height="1.5" rx="0.75" fill="#ddd6fe"/>
  </svg>
)

const FLOATING_ICONS = [
  { label: "OnePage", pos: "md:top-[-4px] top-[-16px] left-[5%]", delay: "0s", zClass: "z-[2]", isOnePage: true },
  { emoji: "📕", label: "Digital Products", pos: "md:top-[34%] md:left-[-4%] bottom-[50px] left-[4%]", delay: "0.5s", zClass: "z-[2]" },
  { emoji: "🛍️", label: "Marketplace", pos: "md:top-[-4px] top-[-36px] right-[2%]", delay: "1s", zClass: "z-[5]" },
  { emoji: "🎓", label: "Courses", pos: "bottom-[60px] left-0", delay: "1.5s", hideMobile: true, zClass: "z-[2]" },
  { emoji: "🔗", label: "Links", pos: "bottom-10 right-[-70px]", delay: "2s", hideMobile: true, zClass: "z-[5]" },
] as const

// Supabase image transform URLs — serve resized WebP to cut payload 70–80%
// Laptop: use 'contain' + object-contain so the full dashboard image is always visible
const LAPTOP_IMG_SM = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Untitled%20design%20(20).webp?width=900&quality=90&resize=contain"
const LAPTOP_IMG_LG = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Untitled%20design%20(20).webp?width=1500&quality=92&resize=contain"
// Phone: max quality + higher resolution for crisp mobile mockup
const PHONE_IMG_SM = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Untitled%20design%20(35).webp?width=500&quality=95&resize=contain"
const PHONE_IMG_LG = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/collage%20imags/Untitled%20design%20(35).webp?width=700&quality=97&resize=contain"

/** Lazy-loaded image that only fetches when near the viewport */
function LazyManagedImage({
  srcSmall,
  srcLarge,
  alt,
  className,
  sizes,
}: {
  srcSmall: string
  srcLarge: string
  alt: string
  className: string
  sizes: string
}) {
  const [loaded, setLoaded] = useState(false)
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect() } },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="w-full h-full">
      {inView ? (
        <img
          srcSet={`${srcSmall} 900w, ${srcLarge} 1500w`}
          sizes={sizes}
          src={srcSmall}
          alt={alt}
          className={`${className} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <div className="w-full h-full bg-neutral-100 animate-pulse rounded" />
      )}
    </div>
  )
}

export function ManageSection() {
  return (
    <section className="py-20 sm:py-24 text-center relative overflow-hidden bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes manage-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .manage-float-anim { animation: manage-float 4s ease-in-out infinite; }
      `}} />
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll>
          <h2 className="text-[27px] md:text-[clamp(32px,4.5vw,48px)] font-bold tracking-tight mb-3">
            Manage your business 🚀
          </h2>
          <p className="text-base text-neutral-500 mb-14 max-w-[520px] mx-auto">
            Storelib has everything you need to run your digital business. All-in-one place.
          </p>
        </AnimateOnScroll>

        <AnimateOnScroll>
          <div className="relative max-w-[1000px] mx-auto min-h-[400px] sm:min-h-[500px]">
            {/* Floating icons */}
            {FLOATING_ICONS.map((icon) => (
              <div
                key={icon.label}
                className={`absolute flex-col items-center gap-2 ${icon.zClass} manage-float-anim ${icon.pos} ${"hideMobile" in icon && icon.hideMobile ? "hidden md:flex" : "flex"}`}
                style={{ animationDelay: icon.delay }}
              >
                <div className="w-[58px] h-[58px] md:w-[74px] md:h-[74px] rounded-full bg-violet-50 flex items-center justify-center text-[25px] md:text-[32px] shadow-md">
                  {"isOnePage" in icon && icon.isOnePage ? <OnePageIcon /> : ("emoji" in icon ? icon.emoji : null)}
                </div>
                <span className="text-[10px] md:text-[12px] font-bold uppercase tracking-wider text-neutral-500">
                  {icon.label}
                </span>
              </div>
            ))}

            {/* Laptop — image displayed in full (object-contain) so no cropping occurs */}
            <div className="relative z-[1] max-w-[700px] mx-auto">
              <div className="bg-neutral-900 rounded-t-xl p-2">
                <div className="rounded-t-md overflow-hidden bg-white aspect-[16/9] relative flex items-center justify-center">
                  <LazyManagedImage
                    srcSmall={LAPTOP_IMG_SM}
                    srcLarge={LAPTOP_IMG_LG}
                    alt="Storelib Dashboard"
                    className="w-full h-full object-contain pointer-events-none select-none"
                    sizes="(max-width: 768px) 90vw, 700px"
                  />
                </div>
              </div>
              <div className="bg-neutral-800 h-4 rounded-b-lg max-w-[760px] mx-auto">
                <div className="w-20 h-1 bg-neutral-600 rounded-b mx-auto" />
              </div>
            </div>

            {/* Phone — resized via Supabase transforms */}
            <div className="absolute right-[5px] sm:right-[-10px] bottom-[5px] sm:bottom-[-20px] z-[3] w-[140px] sm:w-[224px]">
              <LazyManagedImage
                srcSmall={PHONE_IMG_SM}
                srcLarge={PHONE_IMG_LG}
                alt="Storelib Mobile"
                className="w-full h-auto object-contain pointer-events-none select-none"
                sizes="(max-width: 640px) 140px, 224px"
              />
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
