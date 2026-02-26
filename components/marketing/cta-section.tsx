"use client"

import { useRef, useEffect, useState } from "react"
import Link from "next/link"

export function CtaSection() {
  const cardRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const card = cardRef.current
    const glow = glowRef.current
    if (!card || !glow) return

    const handleMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      glow.style.opacity = "1"
      glow.style.background = `radial-gradient(600px circle at ${x}px ${y}px, rgba(124,58,237,0.12), transparent 60%)`
    }

    const handleLeave = () => {
      glow.style.opacity = "0"
    }

    card.addEventListener("mousemove", handleMove)
    card.addEventListener("mouseleave", handleLeave)
    return () => {
      card.removeEventListener("mousemove", handleMove)
      card.removeEventListener("mouseleave", handleLeave)
    }
  }, [mounted])

  return (
    <section className="py-10 sm:py-16 bg-white">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div
          ref={cardRef}
          className="bg-neutral-950 rounded-[24px] sm:rounded-[32px] overflow-hidden relative"
        >
          {/* Mouse-tracking glow */}
          <div
            ref={glowRef}
            className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-500"
            style={{ opacity: 0 }}
          />

          {/* Pulsing wave rings — smooth continuous loop around logo */}
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes cta-pulse {
              0% { transform: translate(-50%,-50%) scale(0.7); opacity: 0.35; }
              70% { opacity: 0.08; }
              100% { transform: translate(-50%,-50%) scale(3); opacity: 0; }
            }
          `}} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[240px] pointer-events-none z-0">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="absolute top-1/2 left-1/2 w-full h-full rounded-full border border-white/[0.10]"
                style={{
                  animation: `cta-pulse 5s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                  animationDelay: `${i * 1.25}s`,
                }}
              />
            ))}
          </div>

          <div className="relative z-10 px-6 sm:px-12 md:px-16 py-16 sm:py-20">
            {/* Storelib logo */}
            <div className="flex justify-center mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"
                alt="Storelib"
                width={40}
                height={40}
                className="w-10 h-10"
              />
            </div>

            {/* Text content */}
            <div className="text-center max-w-[640px] mx-auto">
              <h2 className="text-[clamp(30px,5vw,48px)] font-bold tracking-tight mb-3.5 text-white leading-[1.1]">
                Turn your ideas into income
              </h2>
              <p className="text-base sm:text-lg text-neutral-300 mb-8 font-medium tracking-wide">
                Set up in 5 minutes. No credit card. No commitment.
              </p>
              <div className="flex items-center justify-center gap-3 flex-col sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 text-base font-semibold py-4 px-10 rounded-full bg-white text-neutral-900 hover:bg-neutral-100 transition-all duration-300 hover:-translate-y-0.5 w-full sm:w-auto max-w-[300px]"
                >
                  Create your store →
                </Link>
                <Link
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 text-base font-semibold py-4 px-10 rounded-full border-[1.5px] border-white/20 text-white hover:border-white/50 hover:bg-white/5 transition-all duration-300 w-full sm:w-auto max-w-[300px]"
                >
                  See how it works
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
