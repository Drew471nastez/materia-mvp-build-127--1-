"use client"

import { useState, useEffect, useRef } from "react"
import { AnimateOnScroll } from "./bento-grid"

const FLOATING_ICONS = [
  { label: "OnePage", pos: "md:top-[-4px] top-[-16px] left-[5%] md:left-[-2%]", delay: "0s", zClass: "z-[2]", imgSrc: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(38).webp" },
  { label: "Digital Products", pos: "md:top-[34%] md:left-[-11%] bottom-[50px] left-[4%]", delay: "0.5s", zClass: "z-[2]", imgSrc: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(37).webp" },
  { label: "Marketplace", pos: "md:top-[-16px] top-[-36px] right-[2%]", delay: "1s", zClass: "z-[5]", imgSrc: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(39).webp" },
  { emoji: "🎓", label: "Courses", pos: "bottom-[60px] left-0 md:left-[-7%]", delay: "1.5s", hideMobile: true, zClass: "z-[2]" },
  { emoji: "🔗", label: "Links", pos: "bottom-10 md:right-[-46px] right-[0px]", delay: "2s", hideMobile: true, zClass: "z-[5]" },
] as const

const MANAGE_IMG = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(36).webp"
const MANAGE_IMG_SMALL = MANAGE_IMG + "?width=900&quality=75"

function LazyManagedImage() {
  const [loaded, setLoaded] = useState(false)
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect() } },
      { rootMargin: "600px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Preload the optimized image (not the full-size original)
  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "preload"
    link.as = "image"
    link.href = MANAGE_IMG_SMALL
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  return (
    <div ref={ref} className="w-full">
      {inView ? (
        <img
          src={MANAGE_IMG_SMALL}
          alt="Storelib Dashboard"
          width={900}
          height={506}
          className={`w-full rounded-xl sm:rounded-2xl object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          sizes="(max-width: 768px) 90vw, 800px"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <div className="w-full aspect-video rounded-xl sm:rounded-2xl bg-neutral-100 animate-pulse" />
      )}
    </div>
  )
}

export function ManageSection() {
  // Preload floating icon images at optimized size (74px icons don't need full-res)
  useEffect(() => {
    FLOATING_ICONS.forEach((icon) => {
      if ("imgSrc" in icon && icon.imgSrc) {
        const img = new window.Image()
        img.decoding = "async"
        img.src = icon.imgSrc + "?width=150&quality=70"
      }
    })
  }, [])

  return (
    <section className="pt-20 pb-[68px] sm:py-24 text-center relative overflow-hidden bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes manage-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .manage-float-anim { animation: manage-float 4s ease-in-out infinite; }
      `}} />
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll variant="blur-in">
          <h2 className="text-[27px] md:text-[clamp(32px,4.5vw,48px)] font-bold tracking-tight mb-3">
            Manage your business 🚀
          </h2>
          <p className="text-base text-neutral-500 mb-14 max-w-[520px] mx-auto">
            Storelib has everything you need to run your digital business. All-in-one place.
          </p>
        </AnimateOnScroll>

        <AnimateOnScroll variant="zoom-in" delay={100}>
          <div className="relative max-w-[1000px] mx-auto min-h-[300px] sm:min-h-[400px]">
            {/* Floating icons */}
            {FLOATING_ICONS.map((icon) => (
              <div
                key={icon.label}
                className={`absolute flex-col items-center gap-2 ${icon.zClass} manage-float-anim ${icon.pos} ${"hideMobile" in icon && icon.hideMobile ? "hidden md:flex" : "flex"}`}
                style={{ animationDelay: icon.delay }}
              >
                <div className="w-[58px] h-[58px] md:w-[74px] md:h-[74px] rounded-full bg-violet-50 flex items-center justify-center text-[25px] md:text-[32px] shadow-md overflow-hidden">
                  {"imgSrc" in icon && icon.imgSrc ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={icon.imgSrc + "?width=150&quality=70"}
                      alt={icon.label}
                      className={`object-cover rounded-full ${icon.label === "Digital Products" ? "w-[80%] h-[80%]" : icon.label === "Marketplace" ? "w-[130%] h-[130%]" : "w-full h-full"}`}
                      width={74}
                      height={74}
                      loading="eager"
                      decoding="async"
                    />
                  ) : ("emoji" in icon ? icon.emoji : null)}
                </div>
                <span className="text-[10px] md:text-[12px] font-bold uppercase tracking-wider text-neutral-500">
                  {icon.label}
                </span>
              </div>
            ))}

            {/* Image replacing laptop mockup */}
            <div className="relative z-[1] max-w-[800px] mx-auto">
              <LazyManagedImage />
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
