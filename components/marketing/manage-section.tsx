"use client"

import { AnimateOnScroll } from "./bento-grid"

const FLOATING_ICONS = [
  { emoji: "📄", label: "OnePage", pos: "md:top-[-4px] top-[-12px] left-[5%]", delay: "0s", zClass: "z-[2]" },
  { emoji: "📕", label: "Digital Products", pos: "md:top-[34%] md:left-[-4%] bottom-[50px] left-[4%]", delay: "0.5s", zClass: "z-[2]" },
  { emoji: "🛍️", label: "Marketplace", pos: "md:top-[-4px] top-[-12px] right-[2%]", delay: "1s", zClass: "z-[5]" },
  { emoji: "🎓", label: "Courses", pos: "bottom-[60px] left-0", delay: "1.5s", hideMobile: true, zClass: "z-[2]" },
  { emoji: "🔗", label: "Links", pos: "bottom-10 right-[-70px]", delay: "2s", hideMobile: true, zClass: "z-[5]" },
]

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
                className={`absolute flex-col items-center gap-2 ${icon.zClass} manage-float-anim ${icon.pos} ${icon.hideMobile ? "hidden md:flex" : "flex"}`}
                style={{ animationDelay: icon.delay }}
              >
                <div className="w-16 h-16 md:w-[74px] md:h-[74px] rounded-full bg-violet-50 flex items-center justify-center text-[28px] md:text-[32px] shadow-md">
                  {icon.emoji}
                </div>
                <span className="text-[11px] md:text-[12px] font-bold uppercase tracking-wider text-neutral-500">
                  {icon.label}
                </span>
              </div>
            ))}

            {/* Laptop */}
            <div className="relative z-[1] max-w-[700px] mx-auto">
              <div className="bg-neutral-900 rounded-t-xl p-2">
                <div className="rounded-t-md overflow-hidden bg-neutral-100 aspect-[16/9] relative">
                  <img
                    src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/Untitled%20design%20(20).webp"
                    alt="Storelib Dashboard"
                    className="w-full h-full object-cover pointer-events-none select-none"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    sizes="(max-width: 768px) 90vw, 700px"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                </div>
              </div>
              <div className="bg-neutral-800 h-4 rounded-b-lg max-w-[760px] mx-auto">
                <div className="w-20 h-1 bg-neutral-600 rounded-b mx-auto" />
              </div>
            </div>

            {/* Phone */}
            <div className="absolute right-[-5px] sm:right-[-10px] bottom-[-5px] sm:bottom-[-20px] z-[3] w-[100px] sm:w-[200px]">
              <div className="bg-neutral-900 rounded-[24px] sm:rounded-[28px] p-1.5 sm:p-2 shadow-lg">
                <div className="rounded-[18px] sm:rounded-[22px] overflow-hidden bg-neutral-100 aspect-[9/19.5] relative">
                  <img
                    src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/Untitled%20design%20(22).webp"
                    alt="Storelib Mobile"
                    className="w-full h-full object-cover object-center pointer-events-none select-none"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    sizes="(max-width: 640px) 100px, 200px"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                </div>
              </div>
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
