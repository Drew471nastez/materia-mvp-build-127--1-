"use client"

import { useRef, useEffect, useState } from "react"
import dynamic from "next/dynamic"

/* ── Globe.gl (requires browser — no SSR) ── */
const GlobeWidget = dynamic(() => import("./globe-widget"), {
  ssr: false,
  loading: () => (
    <div className="w-[130px] h-[130px] mx-auto rounded-full bg-indigo-950/30 animate-pulse" />
  ),
})

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
  "top-0 left-[8%]",
  "top-1 right-[5%]",
  "bottom-0 left-[15%]",
  "bottom-1 right-[10%]",
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

/* ── Globe + cycling currency tags ── */
function GlobeSection() {
  const [setIndex, setSetIndex] = useState(0)
  const [fadeIn, setFadeIn] = useState(true)

  useEffect(() => {
    let timeout: NodeJS.Timeout
    const interval = setInterval(() => {
      setFadeIn(false)
      timeout = setTimeout(() => {
        setSetIndex((prev) => (prev + 1) % CURRENCY_SETS.length)
        setFadeIn(true)
      }, 600)
    }, 4000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  const currentSet = CURRENCY_SETS[setIndex]

  return (
    <div className="relative flex items-center justify-center my-4 min-h-[140px]">
      {/* Real 3D globe */}
      <GlobeWidget />

      {/* Cycling currency tags — smooth fade in/out */}
      {currentSet.map((b, i) => (
        <div
          key={`${setIndex}-${i}`}
          className={`absolute flex flex-col items-center gap-1 z-[3] ${TAG_POSITIONS[i]}`}
          style={{
            opacity: fadeIn ? 1 : 0,
            transform: fadeIn ? "scale(1) translateY(0)" : "scale(0.8) translateY(6px)",
            transition: "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <div className="w-9 h-9 rounded-full border-[3px] border-[#D4F542] flex items-center justify-center text-base shadow-md bg-white">
            {b.flag}
          </div>
          <div className="bg-white rounded-md px-2 py-0.5 text-[10px] font-bold shadow-md whitespace-nowrap">
            {b.tag}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Count-Up $4,289 + area chart ── */
function CountUpRevenue() {
  const ref = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(0)
  const animatedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animatedRef.current) {
          animatedRef.current = true
          const target = 4289
          const duration = 2200
          const start = performance.now()
          const tick = (now: number) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setCount(Math.round(eased * target))
            if (progress < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.25 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} className="mt-4 flex flex-col items-center flex-1 justify-center">
      {/* Large count-up dollar amount */}
      <div
        className="text-[48px] sm:text-[56px] font-extrabold tracking-tight text-black leading-none mb-3"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        ${count.toLocaleString()}
      </div>

      {/* Area chart illustration — Visits + Unique visitors */}
      <div className="w-full max-w-[320px]">
        <svg viewBox="0 0 280 90" className="w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="grad-visits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="grad-unique" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Visits — indigo area */}
          <path
            d="M0,68 C25,64 50,55 80,47 C110,39 140,33 170,28 C200,24 230,18 260,16 L280,14 L280,90 L0,90 Z"
            fill="url(#grad-visits)"
          />
          <path
            d="M0,68 C25,64 50,55 80,47 C110,39 140,33 170,28 C200,24 230,18 260,16 L280,14"
            stroke="#4f46e5"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* Unique visitors — purple area */}
          <path
            d="M0,82 C25,79 50,73 80,66 C110,59 140,53 170,48 C200,44 230,38 260,35 L280,33 L280,90 L0,90 Z"
            fill="url(#grad-unique)"
          />
          <path
            d="M0,82 C25,79 50,73 80,66 C110,59 140,53 170,48 C200,44 230,38 260,35 L280,33"
            stroke="#a855f7"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* Data points — Visits */}
          <circle cx="0" cy="68" r="2.5" fill="#4f46e5" />
          <circle cx="80" cy="47" r="2.5" fill="#4f46e5" />
          <circle cx="170" cy="28" r="2.5" fill="#4f46e5" />
          <circle cx="280" cy="14" r="2.5" fill="#4f46e5" />

          {/* Data points — Unique visitors */}
          <circle cx="0" cy="82" r="2.5" fill="#a855f7" />
          <circle cx="80" cy="66" r="2.5" fill="#a855f7" />
          <circle cx="170" cy="48" r="2.5" fill="#a855f7" />
          <circle cx="280" cy="33" r="2.5" fill="#a855f7" />
        </svg>

        {/* Legend */}
        <div className="flex items-center justify-center gap-5 mt-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
            <span className="text-[10px] text-neutral-400 font-medium">Visits</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <span className="text-[10px] text-neutral-400 font-medium">Unique visitors</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sell Anywhere Illustration ── */
function SellAnywhereIllustration() {
  return (
    <div className="mt-5 flex items-center justify-center flex-1">
      <div className="relative w-full max-w-[300px]">
        {/* Browser window mockup */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/15 p-3 relative z-[2]">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-400/60" />
            <div className="w-2 h-2 rounded-full bg-yellow-400/60" />
            <div className="w-2 h-2 rounded-full bg-green-400/60" />
            <div className="ml-2 flex-1 h-4 bg-white/10 rounded-md text-[7px] text-white/40 flex items-center px-2">
              yourbrand.storelib.com
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-violet-500/40" />
              <div className="flex-1">
                <div className="h-1.5 bg-white/15 rounded-full w-16 mb-1" />
                <div className="h-1 bg-white/10 rounded-full w-10" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { bg: "bg-violet-500/30", label: "Course" },
                { bg: "bg-pink-500/30", label: "Template" },
                { bg: "bg-amber-500/30", label: "eBook" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center">
                  <div className={`w-full aspect-[4/3] rounded-md ${item.bg} mb-1`} />
                  <div className="text-[6px] text-white/40 font-medium">{item.label}</div>
                  <div className="h-1 bg-white/10 rounded-full w-8 mt-0.5" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Floating platform badges */}
        <div className="absolute -top-3 -right-2 bg-white/15 border border-white/20 rounded-lg px-2 py-1 text-[8px] font-bold text-white/70 z-[3] shadow-lg sell-anywhere-float" style={{ animationDelay: "0s" }}>
          🌐 Website
        </div>
        <div className="absolute -bottom-3 -left-2 bg-white/15 border border-white/20 rounded-lg px-2 py-1 text-[8px] font-bold text-white/70 z-[3] shadow-lg sell-anywhere-float" style={{ animationDelay: "0.8s" }}>
          📱 Social Bio
        </div>
        <div className="absolute top-1/3 -right-4 bg-white/15 border border-white/20 rounded-lg px-2 py-1 text-[8px] font-bold text-white/70 z-[3] shadow-lg sell-anywhere-float" style={{ animationDelay: "0.4s" }}>
          📋 Embed
        </div>
        <div className="absolute bottom-1/3 -left-4 bg-white/15 border border-white/20 rounded-lg px-2 py-1 text-[8px] font-bold text-white/70 z-[3] shadow-lg sell-anywhere-float" style={{ animationDelay: "1.2s" }}>
          🔗 QR Code
        </div>
      </div>
    </div>
  )
}

export function BentoGrid() {
  return (
    <section className="py-20 sm:py-24 bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
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
              Storelib is the easiest way to make money online. Run your entire creative business from one place, sell products, build your online store and grow your brand!
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sell anything — lighter purple + illustration image */}
            <div className="rounded-3xl p-9 bg-violet-50/80 min-h-[320px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell anything</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Courses, templates, memberships, files — if you made it, you can sell it here on Storelib.
              </p>
              <div className="mt-5 flex-1 flex items-center justify-center">
                <img
                  src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/Untitled%20(1250%20x%20500%20px)%20(1250%20x%20400%20px)%20(1100%20x%20400%20px)%20(1).png?width=600&quality=75"
                  alt="Digital products showcase"
                  className="w-full rounded-xl shadow-sm"
                  loading="lazy"
                  decoding="async"
                  width={600}
                  height={218}
                />
              </div>
            </div>

            {/* Make your own money $ — count-up + area chart */}
            <div className="rounded-3xl p-9 bg-white border border-neutral-200 min-h-[320px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Make your own money $</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Whether you need more balance, flexibility, or just a different gig — chart a new path.
              </p>
              <CountUpRevenue />
            </div>

            {/* Sell to anyone — real globe.gl + currencies */}
            <div className="rounded-3xl p-9 bg-[#D4F542] min-h-[224px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell to anyone</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Accept payments from 135+ countries. Customers pay in their currency, you get paid in yours.
              </p>
              <GlobeSection />
              <div className="mt-auto flex flex-col gap-2.5">
                {["One-time, recurring, or pay-what-you-want", "Instant file delivery after purchase"].map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-[13px] font-medium">
                    <span className="w-[22px] h-[22px] rounded-full bg-black/20 flex items-center justify-center text-xs shrink-0 text-white font-bold">✓</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Sell anywhere — illustration */}
            <div className="rounded-3xl p-9 bg-indigo-950 text-white min-h-[224px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell anywhere</h3>
              <p className="text-sm leading-relaxed text-white/60 max-w-[320px]">
                Embed your store on any website, share via social bio links, or launch your own Storelib storefront. Be everywhere your audience is.
              </p>
              <SellAnywhereIllustration />
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
