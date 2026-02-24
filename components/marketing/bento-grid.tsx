"use client"

import { useRef, useEffect, useState } from "react"

const MINI_PRODUCTS = [
  { emoji: "🎨", type: "Design Kit", price: "$29", bg: "bg-purple-50" },
  { emoji: "🎓", type: "Course", price: "$79", bg: "bg-amber-50" },
  { emoji: "📄", type: "Template", price: "$19", bg: "bg-blue-50" },
]

const BUYERS = [
  { flag: "🇺🇸", tag: "$49 USD", bg: "bg-indigo-100", pos: "top-0 left-[10%]" },
  { flag: "🇯🇵", tag: "¥7,200", bg: "bg-amber-50", pos: "top-2 right-[8%]" },
  { flag: "🇧🇷", tag: "R$240", bg: "bg-green-50", pos: "bottom-0 left-[18%]" },
  { flag: "🇪🇺", tag: "€45 EUR", bg: "bg-pink-50", pos: "bottom-2 right-[14%]" },
]

const APP_ICONS = [
  { letter: "S", bg: "bg-orange-500", text: "text-white" },
  { letter: "✦", bg: "bg-violet-600", text: "text-white" },
  { letter: "W", bg: "bg-white", text: "text-neutral-900" },
  { letter: "✎", bg: "bg-yellow-300", text: "text-neutral-900" },
  { letter: "$", bg: "bg-green-500", text: "text-white" },
  { letter: "T", bg: "bg-blue-600", text: "text-white" },
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

export function BentoGrid() {
  return (
    <section className="py-20 sm:py-24 bg-white">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll>
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-4">
              🚀 Platform
            </span>
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
                Video lessons. Subscriptions. Templates. Whatever you create, Storelib sells it.
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

            {/* Make your own road */}
            <div className="rounded-3xl p-9 bg-white border border-neutral-200 min-h-[320px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Make your own road</h3>
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

            {/* Sell to anyone */}
            <div className="rounded-3xl p-9 bg-[#D4F542] min-h-[320px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell to anyone</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Accept payments from 135+ countries. Customers pay in their currency, you get paid in yours.
              </p>
              {/* Globe + buyers illustration */}
              <div className="relative flex items-center justify-center my-5 min-h-[130px]">
                <div className="w-[110px] h-[110px] rounded-full bg-gradient-to-br from-indigo-950 to-indigo-800 flex items-center justify-center text-[52px] relative z-[2] shadow-[0_8px_32px_rgba(30,27,75,0.25)]">
                  🌍
                </div>
                {BUYERS.map((b) => (
                  <div key={b.tag} className={`absolute flex flex-col items-center gap-1 z-[3] ${b.pos}`}>
                    <div className={`w-10 h-10 rounded-full border-[3px] border-[#D4F542] flex items-center justify-center text-lg shadow-sm ${b.bg}`}>
                      {b.flag}
                    </div>
                    <div className="bg-white rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm whitespace-nowrap">
                      {b.tag}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-auto flex flex-col gap-2.5">
                {["One-time, recurring, or pay-what-you-want", "Instant file delivery after purchase"].map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-[13px] font-medium">
                    <span className="w-[22px] h-[22px] rounded-full bg-black/[0.08] flex items-center justify-center text-xs shrink-0">✓</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Sell anywhere */}
            <div className="rounded-3xl p-9 bg-indigo-950 text-white min-h-[320px] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell anywhere</h3>
              <p className="text-sm leading-relaxed text-white/60 max-w-[320px]">
                Your storefront, your existing site, or both. Connect to thousands of apps.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2.5">
                {APP_ICONS.map((a) => (
                  <div
                    key={a.letter}
                    className={`aspect-square rounded-2xl flex items-center justify-center text-[22px] font-extrabold transition-transform duration-300 hover:scale-[1.08] ${a.bg} ${a.text}`}
                  >
                    {a.letter}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
