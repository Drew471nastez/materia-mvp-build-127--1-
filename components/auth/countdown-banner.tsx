"use client"

import { useState, useEffect } from "react"
import Image from "next/image"

interface CountdownBannerProps {
  imageSrc: string
  imageAlt: string
  priority?: boolean
}

const TARGET_DATE = new Date("2026-03-10T00:00:00")

function getTimeRemaining() {
  const now = new Date()
  const diff = TARGET_DATE.getTime() - now.getTime()

  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function CountdownBanner({ imageSrc, imageAlt, priority = false }: CountdownBannerProps) {
  const [time, setTime] = useState(getTimeRemaining)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const timer = setInterval(() => {
      setTime(getTimeRemaining())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="relative hidden lg:block lg:w-1/2 overflow-hidden">
      {/* Blurred background image */}
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        className="object-cover scale-110 blur-[18px] brightness-[0.7]"
        sizes="(min-width: 1024px) 50vw, 0px"
        quality={65}
        priority={priority}
      />

      {/* Glass overlay */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      {/* Countdown content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-8">
        {/* Beta badge */}
        <div className="mb-5 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
          <span className="text-[13px] font-semibold text-white/90 tracking-wider uppercase">
            Beta Release
          </span>
        </div>

        {/* Heading */}
        <h2 className="text-white text-[22px] font-bold tracking-tight mb-6 text-center">
          Official Launch In
        </h2>

        {/* Countdown boxes */}
        <div className="flex items-center gap-3">
          {[
            { value: mounted ? time.days : 0, label: "Days" },
            { value: mounted ? time.hours : 0, label: "Hours" },
            { value: mounted ? time.minutes : 0, label: "Min" },
            { value: mounted ? time.seconds : 0, label: "Sec" },
          ].map((unit, i) => (
            <div key={unit.label} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className="w-[68px] h-[72px] rounded-2xl bg-white/12 backdrop-blur-xl border border-white/15 flex items-center justify-center shadow-lg">
                  <span className="text-[32px] font-bold text-white tabular-nums leading-none">
                    {pad(unit.value)}
                  </span>
                </div>
                <span className="mt-2 text-[11px] font-medium text-white/60 uppercase tracking-widest">
                  {unit.label}
                </span>
              </div>
              {i < 3 && (
                <span className="text-white/40 text-[24px] font-light mb-5">:</span>
              )}
            </div>
          ))}
        </div>

        {/* Target date */}
        <div className="mt-7 flex items-center gap-2">
          <div className="h-px w-8 bg-white/20" />
          <span className="text-[13px] font-medium text-white/50 tracking-wide">
            10 March
          </span>
          <div className="h-px w-8 bg-white/20" />
        </div>
      </div>
    </div>
  )
}
