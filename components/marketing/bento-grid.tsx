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

/* ── Enhanced 3D Rotating Globe ── */
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
      }, 600)
    }, 4000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  const currentSet = CURRENCY_SETS[setIndex]

  return (
    <div className="relative flex items-center justify-center my-4 min-h-[130px]">
      {/* Outer ambient glow */}
      <div className="absolute w-[150px] h-[150px] rounded-full z-[1] globe-glow-pulse" style={{
        background: "radial-gradient(circle, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.04) 45%, transparent 70%)",
      }} />

      {/* Globe container */}
      <div className="relative w-[110px] h-[110px] z-[2] rounded-full overflow-hidden" style={{
        boxShadow: "0 0 40px rgba(251,191,36,0.12), 0 0 80px rgba(251,191,36,0.06), 0 8px 32px rgba(0,0,0,0.4)",
      }}>
        {/* Base sphere — dark ocean with 3D lighting */}
        <div className="absolute inset-0" style={{
          background: "radial-gradient(circle at 35% 32%, #1a2744 0%, #0c1a30 45%, #060e1f 75%, #030812 100%)",
        }} />

        {/* Scrolling continent glow — amber/gold land masses */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="globe-continents" style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "220%",
            height: "100%",
            willChange: "transform",
            background: [
              "radial-gradient(ellipse 6% 20% at 5% 38%, rgba(251,191,36,0.45) 0%, transparent 100%)",
              "radial-gradient(ellipse 9% 28% at 12% 50%, rgba(251,191,36,0.35) 0%, transparent 100%)",
              "radial-gradient(ellipse 4% 14% at 8% 28%, rgba(251,191,36,0.3) 0%, transparent 100%)",
              "radial-gradient(ellipse 7% 18% at 22% 40%, rgba(251,191,36,0.38) 0%, transparent 100%)",
              "radial-gradient(ellipse 11% 30% at 30% 55%, rgba(251,191,36,0.32) 0%, transparent 100%)",
              "radial-gradient(ellipse 5% 12% at 36% 68%, rgba(251,191,36,0.25) 0%, transparent 100%)",
              "radial-gradient(ellipse 8% 22% at 44% 42%, rgba(251,191,36,0.35) 0%, transparent 100%)",
              "radial-gradient(ellipse 5% 16% at 50% 60%, rgba(251,191,36,0.28) 0%, transparent 100%)",
              "radial-gradient(ellipse 6% 20% at 55% 38%, rgba(251,191,36,0.45) 0%, transparent 100%)",
              "radial-gradient(ellipse 9% 28% at 62% 50%, rgba(251,191,36,0.35) 0%, transparent 100%)",
              "radial-gradient(ellipse 4% 14% at 58% 28%, rgba(251,191,36,0.3) 0%, transparent 100%)",
              "radial-gradient(ellipse 7% 18% at 72% 40%, rgba(251,191,36,0.38) 0%, transparent 100%)",
              "radial-gradient(ellipse 11% 30% at 80% 55%, rgba(251,191,36,0.32) 0%, transparent 100%)",
              "radial-gradient(ellipse 5% 12% at 86% 68%, rgba(251,191,36,0.25) 0%, transparent 100%)",
              "radial-gradient(ellipse 8% 22% at 94% 42%, rgba(251,191,36,0.35) 0%, transparent 100%)",
              "radial-gradient(ellipse 5% 16% at 100% 60%, rgba(251,191,36,0.28) 0%, transparent 100%)",
            ].join(","),
          }} />
        </div>

        {/* City light dots — scrolling at different speed */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="globe-city-dots" style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "220%",
            height: "100%",
            willChange: "transform",
            background: [
              "radial-gradient(circle 1.5px at 6% 35%, rgba(255,220,150,0.8) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 10% 42%, rgba(255,220,150,0.6) 0%, transparent 100%)",
              "radial-gradient(circle 1.5px at 14% 52%, rgba(255,220,150,0.7) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 18% 30%, rgba(255,255,200,0.5) 0%, transparent 100%)",
              "radial-gradient(circle 1.5px at 24% 45%, rgba(255,220,150,0.7) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 28% 58%, rgba(255,220,150,0.5) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 32% 38%, rgba(255,255,200,0.6) 0%, transparent 100%)",
              "radial-gradient(circle 1.5px at 38% 48%, rgba(255,220,150,0.7) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 42% 55%, rgba(255,220,150,0.5) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 46% 35%, rgba(255,255,200,0.6) 0%, transparent 100%)",
              "radial-gradient(circle 1.5px at 56% 35%, rgba(255,220,150,0.8) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 60% 42%, rgba(255,220,150,0.6) 0%, transparent 100%)",
              "radial-gradient(circle 1.5px at 64% 52%, rgba(255,220,150,0.7) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 68% 30%, rgba(255,255,200,0.5) 0%, transparent 100%)",
              "radial-gradient(circle 1.5px at 74% 45%, rgba(255,220,150,0.7) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 78% 58%, rgba(255,220,150,0.5) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 82% 38%, rgba(255,255,200,0.6) 0%, transparent 100%)",
              "radial-gradient(circle 1.5px at 88% 48%, rgba(255,220,150,0.7) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 92% 55%, rgba(255,220,150,0.5) 0%, transparent 100%)",
              "radial-gradient(circle 1px at 96% 35%, rgba(255,255,200,0.6) 0%, transparent 100%)",
            ].join(","),
          }} />
        </div>

        {/* 3D rotating meridian lines */}
        <div className="absolute inset-0 rounded-full" style={{ perspective: "600px" }}>
          <div className="absolute inset-0 globe-spin-anim" style={{ transformStyle: "preserve-3d" }}>
            {[0, 30, 60, 90, 120, 150].map((deg) => (
              <div
                key={deg}
                className="absolute rounded-full"
                style={{
                  inset: "4%",
                  border: "1px solid rgba(251,191,36,0.08)",
                  transform: `rotateY(${deg}deg)`,
                  transformStyle: "preserve-3d",
                  backfaceVisibility: "visible",
                }}
              />
            ))}
          </div>
        </div>

        {/* Latitude lines */}
        {[25, 50, 75].map((top) => (
          <div key={top} className="absolute left-[6%] right-[6%]" style={{
            top: `${top}%`,
            height: "1px",
            background: "rgba(251,191,36,0.06)",
          }} />
        ))}

        {/* Atmosphere — inner shadow + specular highlight */}
        <div className="absolute inset-0 rounded-full" style={{
          background: "radial-gradient(circle at 28% 22%, rgba(255,255,255,0.08) 0%, transparent 38%)",
          boxShadow: "inset -5px -5px 15px rgba(0,0,0,0.5), inset 2px 2px 8px rgba(255,255,255,0.03), inset 0 0 30px rgba(251,191,36,0.04)",
        }} />

        {/* Edge atmosphere ring */}
        <div className="absolute inset-0 rounded-full" style={{
          boxShadow: "inset 0 0 3px rgba(100,180,255,0.08), inset 0 0 6px rgba(100,180,255,0.04)",
        }} />
      </div>

      {/* Cycling currency tags — smooth fade in/out */}
      {currentSet.map((b, i) => (
        <div
          key={`${setIndex}-${i}`}
          className={`absolute flex flex-col items-center gap-1 z-[3] ${TAG_POSITIONS[i]}`}
          style={{
            opacity: fadeIn ? 1 : 0,
            transform: fadeIn ? "scale(1) translateY(0)" : "scale(0.8) translateY(6px)",
            transition: "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
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

/* ── Count-Up Revenue Card ── */
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
    <div ref={ref} className="mt-5 flex flex-col items-center flex-1 justify-center">
      {/* Large count-up dollar amount */}
      <div
        className="text-[52px] sm:text-[58px] font-extrabold tracking-tight text-black leading-none mb-4"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        ${count.toLocaleString()}
      </div>

      {/* 3 stat cards row */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-[340px]">
        {/* Green — Storelib users */}
        <div className="bg-[#4ade80] rounded-xl py-2.5 px-2 flex flex-col items-center">
          <div className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center text-[11px] mb-1">👤</div>
          <div className="text-[15px] font-extrabold text-black leading-tight">30m</div>
          <div className="text-[7px] font-bold text-black/50 uppercase tracking-wider leading-tight mt-0.5">Storelib users</div>
        </div>

        {/* Purple — Visitors this week */}
        <div className="bg-[#c026d3] rounded-xl py-2.5 px-2 flex flex-col items-center text-white">
          <div className="text-[6px] font-bold uppercase tracking-wider text-white/50 mb-0.5">Monthly AVG</div>
          <svg className="w-full h-[14px] mb-0.5" viewBox="0 0 80 16" fill="none">
            <path d="M0,14 C10,12 18,9 28,7 C38,5 44,3 54,5 C64,7 70,2 80,1" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          </svg>
          <div className="text-[15px] font-extrabold leading-tight">2.3M</div>
          <div className="text-[7px] font-bold text-white/50 uppercase tracking-wider leading-tight mt-0.5 text-center">Visitors this week</div>
        </div>

        {/* Teal — Design & Fitness */}
        <div className="bg-[#06b6d4] rounded-xl py-2.5 px-2 flex flex-col items-center text-white">
          <div className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center text-[11px] mb-1">😊</div>
          <div className="text-[15px] font-extrabold leading-tight">+6%</div>
          <div className="text-[7px] font-bold text-white/50 uppercase tracking-wider leading-tight mt-0.5 text-center">Design &amp; Fitness</div>
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
          {/* Store preview inside browser */}
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
        @keyframes globe-spin {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
        @keyframes globe-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes globe-glow-pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes sell-anywhere-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .globe-spin-anim {
          animation: globe-spin 10s linear infinite;
        }
        .globe-continents {
          animation: globe-scroll 25s linear infinite;
        }
        .globe-city-dots {
          animation: globe-scroll 20s linear infinite;
        }
        .globe-glow-pulse {
          animation: globe-glow-pulse 4s ease-in-out infinite;
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
            {/* Sell anything — light purple background */}
            <div className="rounded-3xl p-9 bg-violet-100/70 min-h-[320px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
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

            {/* Make your own money $ — count-up + stat cards */}
            <div className="rounded-3xl p-9 bg-white border border-neutral-200 min-h-[320px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Make your own money $</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Whether you need more balance, flexibility, or just a different gig — chart a new path.
              </p>
              <CountUpRevenue />
            </div>

            {/* Sell to anyone — 3D globe + currencies */}
            <div className="rounded-3xl p-9 bg-[#D4F542] min-h-[224px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell to anyone</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Accept payments from 135+ countries. Customers pay in their currency, you get paid in yours.
              </p>
              <RotatingGlobe />
              <div className="mt-auto flex flex-col gap-2.5">
                {["One-time, recurring, or pay-what-you-want", "Instant file delivery after purchase"].map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-[13px] font-medium">
                    <span className="w-[22px] h-[22px] rounded-full bg-black/20 flex items-center justify-center text-xs shrink-0 text-white font-bold">✓</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Sell anywhere — improved illustration */}
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
