"use client"

import { useRef, useEffect, useState } from "react"

const MINI_PRODUCTS = [
  { emoji: "🎨", type: "Design Kit", price: "$29", bg: "bg-purple-50" },
  { emoji: "🎓", type: "Course", price: "$79", bg: "bg-amber-50" },
  { emoji: "📄", type: "Template", price: "$19", bg: "bg-blue-50" },
]

const CURRENCY_SETS = [
  [
    { flag: "🇺🇸", tag: "$49 USD" },
    { flag: "🇯🇵", tag: "¥7,200" },
    { flag: "🇧🇷", tag: "R$240" },
    { flag: "🇪🇺", tag: "€45 EUR" },
  ],
  [
    { flag: "🇬🇧", tag: "£38 GBP" },
    { flag: "🇰🇷", tag: "₩65,000" },
    { flag: "🇮🇳", tag: "₹4,100" },
    { flag: "🇦🇺", tag: "A$72" },
  ],
  [
    { flag: "🇨🇦", tag: "C$66" },
    { flag: "🇲🇽", tag: "$850 MXN" },
    { flag: "🇳🇬", tag: "₦38K" },
    { flag: "🇸🇪", tag: "520 SEK" },
  ],
]

const TAG_POSITIONS = [
  "top-0 left-[10%]",
  "top-2 right-[8%]",
  "bottom-0 left-[18%]",
  "bottom-2 right-[14%]",
]

function AnimateOnScroll({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {children}
    </div>
  )
}

export { AnimateOnScroll }

function RotatingGlobe() {
  const [setIndex, setSetIndex] = useState(0)
  const [fadeIn, setFadeIn] = useState(true)

  useEffect(() => {
    let timeout: NodeJS.Timeout
    const interval = setInterval(() => {
      setFadeIn(false)
      timeout = setTimeout(() => {
        setSetIndex((prev) => (prev + 1) % CURRENCY_SETS.length)
        setFadeIn(true)
      }, 500)
    }, 4000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  const currentSet = CURRENCY_SETS[setIndex]

  return (
    <div className="relative flex items-center justify-center my-4 min-h-[120px]">
      {/* 3D Globe */}
      <div className="relative w-[100px] h-[100px] z-[2]">
        {/* Sphere base with 3D gradient */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle at 35% 35%, #4338ca, #1e1b4b 55%, #0c0a1d 100%)",
            boxShadow: "0 8px 32px rgba(30,27,75,0.3), inset -6px -6px 16px rgba(0,0,0,0.35), inset 3px 3px 10px rgba(129,140,248,0.1)",
          }}
        />

        {/* Rotating meridian lines */}
        <div className="absolute inset-0 rounded-full overflow-hidden" style={{ perspective: "500px" }}>
          <div className="globe-spin-anim" style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
            {[0, 30, 60, 90, 120, 150].map((deg) => (
              <div
                key={deg}
                className="absolute rounded-full"
                style={{
                  inset: "5%",
                  border: "1.5px solid rgba(255,255,255,0.12)",
                  transform: `rotateY(${deg}deg)`,
                  transformStyle: "preserve-3d",
                  backfaceVisibility: "visible",
                }}
              />
            ))}
          </div>
        </div>

        {/* Equator line */}
        <div
          className="absolute top-1/2 left-[6%] right-[6%] -translate-y-1/2 rounded-full"
          style={{
            height: "1.5px",
            background: "rgba(255,255,255,0.1)",
          }}
        />

        {/* Highlight reflection */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.15) 0%, transparent 45%)",
          }}
        />
      </div>

      {/* Cycling currency tags */}
      {currentSet.map((b, i) => (
        <div
          key={`${setIndex}-${i}`}
          className={`absolute flex flex-col items-center gap-1 z-[3] ${TAG_POSITIONS[i]}`}
          style={{
            opacity: fadeIn ? 1 : 0,
            transform: fadeIn ? "scale(1) translateY(0)" : "scale(0.85) translateY(4px)",
            transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <div className="w-9 h-9 rounded-full border-[3px] border-[#D4F542] flex items-center justify-center text-base shadow-sm bg-white">
            {b.flag}
          </div>
          <div className="bg-white rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm whitespace-nowrap">
            {b.tag}
          </div>
        </div>
      ))}
    </div>
  )
}

function SellAnywhereIllustration() {
  return (
    <div className="mt-5 flex items-center justify-center flex-1">
      <div className="relative w-full max-w-[280px]">
        {/* Mini browser window */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/15 p-3 relative z-[2]">
          <div className="flex items-center gap-1.5 mb-2.5">
            <div className="w-2 h-2 rounded-full bg-red-400/60" />
            <div className="w-2 h-2 rounded-full bg-yellow-400/60" />
            <div className="w-2 h-2 rounded-full bg-green-400/60" />
            <div className="ml-2 flex-1 h-4 bg-white/10 rounded-md text-[7px] text-white/40 flex items-center px-2">
              yoursite.com/store
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { bg: "bg-violet-500/30", label: "Course" },
              { bg: "bg-pink-500/30", label: "Template" },
              { bg: "bg-amber-500/30", label: "eBook" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center">
                <div className={`w-full aspect-square rounded-lg ${item.bg} mb-1`} />
                <div className="text-[7px] text-white/50 font-medium">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating connection nodes */}
        <div className="absolute -top-2 -right-3 w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center text-[14px] z-[3] shadow-lg sell-anywhere-float" style={{ animationDelay: "0s" }}>
          🔗
        </div>
        <div className="absolute -bottom-2 -left-3 w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center text-[14px] z-[3] shadow-lg sell-anywhere-float" style={{ animationDelay: "1s" }}>
          🌐
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 -right-5 w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center text-[14px] z-[3] shadow-lg sell-anywhere-float" style={{ animationDelay: "0.5s" }}>
          📱
        </div>
      </div>
    </div>
  )
}

export function BentoGrid() {
  return (
    <section className="py-20 sm:py-24 bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes globe-spin {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
        .globe-spin-anim {
          animation: globe-spin 8s linear infinite;
        }
        @keyframes sell-anywhere-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .sell-anywhere-float {
          animation: sell-anywhere-bob 3s ease-in-out infinite;
        }
      `}} />
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll>
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <h2 className="text-[clamp(30px,4vw,44px)] font-semibold leading-[1.15] tracking-tight mb-3.5">
              Everything in one place
            </h2>
            <p className="text-base text-neutral-500 leading-relaxed">
              No stitching together five different tools. Storelib is your storefront, link-in-bio, checkout, and audience builder — combined.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sell anything */}
            <div className="rounded-3xl p-9 bg-pink-100/70 min-h-[320px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell anything</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Courses, templates, memberships, files — if you made it, you can sell it here on Storelib.
              </p>
              <div className="mt-6 flex gap-3 justify-center">
                {MINI_PRODUCTS.map((p) => (
                  <div key={p.type} className="w-[120px] bg-white rounded-xl overflow-hidden shadow-sm transition-transform duration-300 hover:-translate-y-1.5">
                    <div className={`h-[90px] flex items-center justify-center text-[32px] ${p.bg}`}>{p.emoji}</div>
                    <div className="px-2.5 py-2">
                      <div className="text-[8px] font-bold uppercase tracking-wide text-neutral-400">{p.type}</div>
                      <div className="text-[13px] font-bold">{p.price}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Make your own money $ */}
            <div className="rounded-3xl p-9 bg-white border border-neutral-200 min-h-[320px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Make your own money $</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Whether you need more balance, flexibility, or just a different gig — chart a new path.
              </p>
              <div className="mt-6 flex gap-4 justify-center items-end">
                {[
                  { value: "9", label: "Products" },
                  { value: "481", label: "Sales" },
                  { value: "$201,083", label: "Total Revenue" },
                ].map((s) => (
                  <div key={s.label} className="text-center bg-neutral-50 rounded-xl px-5 py-3.5">
                    <div className="text-2xl font-extrabold tracking-tight">{s.value}</div>
                    <div className="text-[10px] text-neutral-400 font-medium">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sell to anyone — height reduced by 30% */}
            <div className="rounded-3xl p-9 bg-[#D4F542] min-h-[224px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell to anyone</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Accept payments from 135+ countries. Customers pay in their currency, you get paid in yours.
              </p>
              <RotatingGlobe />
              <div className="mt-auto flex flex-col gap-2.5">
                {["One-time, recurring, or pay-what-you-want", "Instant file delivery after purchase"].map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-[13px] font-medium">
                    <span className="w-[22px] h-[22px] rounded-full bg-black/[0.08] flex items-center justify-center text-xs shrink-0">✓</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Sell anywhere — height reduced by 30% */}
            <div className="rounded-3xl p-9 bg-indigo-950 text-white min-h-[224px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell anywhere</h3>
              <p className="text-sm leading-relaxed text-white/60 max-w-[320px]">
                Your storefront, your existing site, or both. Connect to thousands of apps.
              </p>
              <SellAnywhereIllustration />
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
