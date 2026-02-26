"use client"

import { useRef, useEffect, useState } from "react"
import { AnimateOnScroll } from "./bento-grid"

const STATS = [
  { target: 137, prefix: "", suffix: "+", label: "Creators signed up" },
  { target: 4.3, prefix: "$", suffix: "K+", label: "Processed in sales", decimals: 1 },
  { target: 412, prefix: "", suffix: "+", label: "Products sold" },
  { target: 38, prefix: "", suffix: "", label: "Countries reached" },
]

function CountUpNumber({ target, prefix, suffix, decimals = 0 }: { target: number; prefix: string; suffix: string; decimals?: number }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [count, setCount] = useState(0)
  const animatedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animatedRef.current) {
          animatedRef.current = true
          const duration = 2000
          const start = performance.now()

          const tick = (now: number) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setCount(eased * target)
            if (progress < 1) requestAnimationFrame(tick)
          }

          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.3 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [target])

  const display = count >= target
    ? `${prefix}${decimals > 0 ? target.toFixed(decimals) : target}${suffix}`
    : `${prefix}${decimals > 0 ? count.toFixed(decimals) : Math.round(count)}${suffix}`

  return (
    <h3
      ref={ref}
      className="text-[40px] font-bold tracking-tighter mb-1"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {display}
    </h3>
  )
}

export function StatsBar() {
  return (
    <section className="py-14 sm:py-16 border-t border-b border-neutral-100">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll variant="fade-up-scale">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <CountUpNumber target={s.target} prefix={s.prefix} suffix={s.suffix} decimals={"decimals" in s ? s.decimals : 0} />
                <p className="text-sm text-neutral-500">{s.label}</p>
              </div>
            ))}
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
