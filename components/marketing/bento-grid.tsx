"use client"

import { useRef, useEffect, useState } from "react"
import dynamic from "next/dynamic"

import { optimizedImageUrl } from "@/lib/images/optimized-url"

/**
 * ===========================================================================
 *  `?width=` ON A /storage/v1/object/ URL IS NOT A RESIZE
 * ===========================================================================
 * That endpoint serves the stored file and ignores every query parameter, so
 * these three read as resized and were not: the widest of them measured 523 KB
 * where the page draws it 800px across. The srcSets were the same original
 * listed at two sizes, which is a picture downloaded twice.
 *
 * `/_next/image` is the resizer that is actually switched on here. Supabase's
 * own transformer is metered, exhausted, and fails the build.
 */
const SELL_ANYTHING_PHONE =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(48).webp"
const SELL_ANYTHING_WIDE =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(2969%20x%201600%20px)%20(2969%20x%201450%20px).webp"
const SELL_ANYWHERE =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/Untitled%20(1250%20x%20500%20px)%20(1250%20x%20400%20px)%20(1100%20x%20400%20px)%20(7).png"


/* ── Globe.gl (requires browser — no SSR) ── */
const GlobeWidget = dynamic(() => import("./globe-widget"), {
  ssr: false,
  loading: () => (
    <div className="w-[220px] h-[220px] mx-auto rounded-full bg-indigo-950/30 animate-pulse" />
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

/* Tags: closer vertically, spread more left/right on mobile */
const TAG_POSITIONS = [
  "top-[18%] left-[-2%] sm:left-[3%]",
  "top-[18%] right-[-3%] sm:right-[1%]",
  "bottom-[18%] left-[0%] sm:left-[8%]",
  "bottom-[18%] right-[-2%] sm:right-[4%]",
]

// Lightweight scroll-reveal animations — GPU-only (opacity + translate3d).
// No blur or filter (causes paint lag on low-end devices).
// All transforms use translate3d for GPU compositor, never layout properties.
type ScrollAnimVariant =
  | "fade-up"
  | "fade-up-scale"
  | "slide-left"
  | "slide-right"
  | "blur-in"   // kept for API compat — just does fade-up now
  | "zoom-in"

const HIDDEN: Record<ScrollAnimVariant, React.CSSProperties> = {
  "fade-up":       { opacity: 0, transform: "translate3d(0, 24px, 0)" },
  "fade-up-scale": { opacity: 0, transform: "translate3d(0, 20px, 0) scale(0.98)" },
  "slide-left":    { opacity: 0, transform: "translate3d(-30px, 0, 0)" },
  "slide-right":   { opacity: 0, transform: "translate3d(30px, 0, 0)" },
  "blur-in":       { opacity: 0, transform: "translate3d(0, 16px, 0)" },
  "zoom-in":       { opacity: 0, transform: "scale(0.96)" },
}
const VISIBLE: Record<ScrollAnimVariant, React.CSSProperties> = {
  "fade-up":       { opacity: 1, transform: "translate3d(0, 0, 0)" },
  "fade-up-scale": { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
  "slide-left":    { opacity: 1, transform: "translate3d(0, 0, 0)" },
  "slide-right":   { opacity: 1, transform: "translate3d(0, 0, 0)" },
  "blur-in":       { opacity: 1, transform: "translate3d(0, 0, 0)" },
  "zoom-in":       { opacity: 1, transform: "scale(1)" },
}

function AnimateOnScroll({
  children,
  className = "",
  variant = "fade-up",
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  variant?: ScrollAnimVariant
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.05, rootMargin: "0px 0px 80px 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...(visible ? VISIBLE[variant] : HIDDEN[variant]),
        transition: `opacity 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms, transform 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms`,
        willChange: visible ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </div>
  )
}

export { AnimateOnScroll }

/* ── Globe + cycling currency tags ── */
function GlobeSection() {
  const [visibleIndex, setVisibleIndex] = useState(0)
  const [fadeIn, setFadeIn] = useState(true)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const interval = setInterval(() => {
      setFadeIn(false)
      const t = setTimeout(() => {
        setVisibleIndex((prev) => (prev + 1) % CURRENCY_SETS.length)
        setFadeIn(true)
      }, 750)
      timers.push(t)
    }, 4500)
    return () => {
      clearInterval(interval)
      timers.forEach(clearTimeout)
    }
  }, [])

  const currentSet = CURRENCY_SETS[visibleIndex]

  return (
    <div className="relative flex items-center justify-center my-2 min-h-[200px]">
      <GlobeWidget />

      {/* Cycling currency tags — smooth cross-fade, no remount */}
      {currentSet.map((b, i) => (
        <div
          key={i}
          className={`absolute flex flex-col items-center gap-0.5 z-[3] ${TAG_POSITIONS[i]}`}
          style={{
            opacity: fadeIn ? 1 : 0,
            transform: fadeIn ? "scale(1) translateY(0)" : "scale(0.88) translateY(6px)",
            transition: `opacity 0.75s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.08}s, transform 0.75s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.08}s`,
          }}
        >
          <div className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-sm shadow-md bg-white">
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
          const duration = 3200
          const start = performance.now()
          const tick = (now: number) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 4)
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

      {/* Area chart — wider, with white edge fades */}
      <div
        className="w-full"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        <svg viewBox="0 0 320 90" className="w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="grad-visits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="grad-revenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c084fc" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.03" />
            </linearGradient>
            <filter id="glow-revenue">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Visits — indigo area */}
          <path
            d="M0,68 C30,64 60,55 95,47 C130,39 165,33 200,28 C235,24 270,18 300,16 L320,14 L320,90 L0,90 Z"
            fill="url(#grad-visits)"
          />
          <path
            d="M0,68 C30,64 60,55 95,47 C130,39 165,33 200,28 C235,24 270,18 300,16 L320,14"
            stroke="#4f46e5"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* Revenue — light purple area with glow */}
          <path
            d="M0,82 C30,79 60,73 95,66 C130,59 165,53 200,48 C235,44 270,38 300,35 L320,33 L320,90 L0,90 Z"
            fill="url(#grad-revenue)"
          />
          <path
            d="M0,82 C30,79 60,73 95,66 C130,59 165,53 200,48 C235,44 270,38 300,35 L320,33"
            stroke="#c084fc"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            filter="url(#glow-revenue)"
          />

          {/* Data points — Visits */}
          <circle cx="0" cy="68" r="2.5" fill="#4f46e5" />
          <circle cx="95" cy="47" r="2.5" fill="#4f46e5" />
          <circle cx="200" cy="28" r="2.5" fill="#4f46e5" />
          <circle cx="320" cy="14" r="2.5" fill="#4f46e5" />

          {/* Data points — Revenue */}
          <circle cx="0" cy="82" r="3" fill="#c084fc" />
          <circle cx="95" cy="66" r="3" fill="#c084fc" />
          <circle cx="200" cy="48" r="3" fill="#c084fc" />
          <circle cx="320" cy="33" r="3" fill="#c084fc" />
        </svg>

        {/* Legend */}
        <div className="flex items-center justify-center gap-5 mt-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
            <span className="text-[10px] text-neutral-400 font-medium">Visits</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="text-[10px] text-neutral-400 font-medium">Revenue</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function BentoGrid() {
  return (
    <section className="py-20 sm:py-24 bg-white">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll variant="blur-in">
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <h2 className="text-[clamp(30px,4vw,44px)] font-semibold leading-[1.15] tracking-tight mb-3.5">
              Everything in one place
            </h2>
            <p className="text-base text-neutral-500 leading-relaxed">
              <span className="hidden sm:inline">
                Storelib is the easiest way to make money online. Run your entire creative business from one place, sell products, build your online store and grow your brand!
              </span>
              <span className="sm:hidden">
                Storelib is the easiest way to make money online. Run your entire creative business from one place.
              </span>
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="fade-up-scale" delay={120}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sell anything — light gray */}
            <div className="rounded-3xl p-7 pb-5 sm:p-9 md:pb-4 bg-neutral-100 min-h-[320px] flex flex-col">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell anything</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px] mb-0">
                Courses, digital products, communities, bookings. If you made it, you can sell it here on Storelib.
              </p>
              <div className="mt-3 sm:mt-2.5 flex-1 flex items-end justify-center overflow-hidden relative min-h-[100px] sm:min-h-[180px]">
                {/* Mobile image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizedImageUrl(SELL_ANYTHING_PHONE, 500, 75)}
                  alt="Digital products showcase"
                  className="w-[125%] rounded-xl object-cover sm:hidden"
                  loading="eager"
                  decoding="async"
                  width={500}
                  height={244}
                />
                {/* Desktop image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizedImageUrl(SELL_ANYTHING_WIDE, 800, 75)}
                  alt="Digital products showcase"
                  className="hidden sm:block w-[110%] rounded-xl object-cover"
                  loading="eager"
                  decoding="async"
                  sizes="800px"
                  width={800}
                  height={390}
                />
              </div>
            </div>

            {/* Make your own money $ — count-up + area chart */}
            <div className="rounded-3xl p-9 bg-white border border-neutral-200 min-h-[320px] flex flex-col">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">
                <span className="hidden sm:inline">Make your own money $</span>
                <span className="sm:hidden">Make your own $$</span>
              </h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Whether you need more balance, flexibility, or just a different gig — chart a new path.
              </p>
              <CountUpRevenue />
            </div>

            {/* Sell to anyone — black card + globe + currencies */}
            <div className="rounded-3xl p-7 bg-neutral-950 min-h-[200px] flex flex-col">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5 text-white">Sell to anyone</h3>
              <p className="text-sm leading-relaxed text-neutral-400 max-w-[320px]">
                Accept payments from 135+ countries. Customers pay in their currency, you get paid in yours.
              </p>
              <GlobeSection />
            </div>

            {/* Sell anywhere — light gray + image */}
            <div className="rounded-3xl p-7 bg-neutral-100 min-h-[200px] flex flex-col">
              <h3 className="text-2xl font-semibold tracking-tight leading-snug mb-2.5">Sell anywhere</h3>
              <p className="text-sm leading-relaxed text-neutral-500 max-w-[320px]">
                Your storefront, any website, or social bio. Reach your audience everywhere.
              </p>
              <div className="mt-4 flex-1 flex items-center justify-center overflow-hidden">
                <img
                  src={optimizedImageUrl(SELL_ANYWHERE, 600, 75)}
                  alt="Sell anywhere illustration"
                  className="w-[204%] sm:w-[123%] rounded-xl"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  sizes="(max-width: 640px) 90vw, 600px"
                  width={600}
                  height={218}
                />
              </div>
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
