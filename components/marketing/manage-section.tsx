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
  { label: "OnePage", pos: "md:top-[-4px] top-[-16px] left-[5%] md:left-[-2%]", delay: "0s", zClass: "z-[2]", isOnePage: true },
  { emoji: "📕", label: "Digital Products", pos: "md:top-[34%] md:left-[-11%] bottom-[50px] left-[4%]", delay: "0.5s", zClass: "z-[2]", customIcon: true },
  { emoji: "🛍️", label: "Marketplace", pos: "md:top-[-16px] top-[-36px] right-[2%]", delay: "1s", zClass: "z-[5]" },
  { emoji: "🎓", label: "Courses", pos: "bottom-[60px] left-0 md:left-[-7%]", delay: "1.5s", hideMobile: true, zClass: "z-[2]" },
  { emoji: "🔗", label: "Links", pos: "bottom-10 md:right-[-46px] right-[0px]", delay: "2s", hideMobile: true, zClass: "z-[5]" },
] as const

const MANAGE_IMG = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(36).webp"

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

  // Preload image as soon as component mounts
  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "preload"
    link.as = "image"
    link.href = MANAGE_IMG
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  return (
    <div ref={ref} className="w-full">
      {inView ? (
        <img
          src={MANAGE_IMG}
          alt="Storelib Dashboard"
          width={1200}
          height={675}
          className={`w-full rounded-xl sm:rounded-2xl object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          sizes="(max-width: 768px) 90vw, 900px"
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
        <AnimateOnScroll>
          <h2 className="text-[27px] md:text-[clamp(32px,4.5vw,48px)] font-bold tracking-tight mb-3">
            Manage your business 🚀
          </h2>
          <p className="text-base text-neutral-500 mb-14 max-w-[520px] mx-auto">
            Storelib has everything you need to run your digital business. All-in-one place.
          </p>
        </AnimateOnScroll>

        <AnimateOnScroll>
          <div className="relative max-w-[1000px] mx-auto min-h-[300px] sm:min-h-[400px]">
            {/* Floating icons */}
            {FLOATING_ICONS.map((icon) => (
              <div
                key={icon.label}
                className={`absolute flex-col items-center gap-2 ${icon.zClass} manage-float-anim ${icon.pos} ${"hideMobile" in icon && icon.hideMobile ? "hidden md:flex" : "flex"}`}
                style={{ animationDelay: icon.delay }}
              >
                <div className="w-[58px] h-[58px] md:w-[74px] md:h-[74px] rounded-full bg-violet-50 flex items-center justify-center text-[25px] md:text-[32px] shadow-md overflow-hidden">
                  {"isOnePage" in icon && icon.isOnePage ? <OnePageIcon /> : ("customIcon" in icon && icon.customIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(37).webp"
                      alt="Digital Products"
                      className="w-full h-full object-cover rounded-full"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : ("emoji" in icon ? icon.emoji : null))}
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
