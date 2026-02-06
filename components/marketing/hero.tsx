"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

// Typing animation phrases
const TYPING_PHRASES = [
  "Start monetizing your passion...",
  "Build link in bio pages...",
  "Sell digital products...",
  "Share your passion...",
  "Build your online store...",
]

// Background collage thumbnails — gradient blocks that mimic product cards
const COLLAGE_ITEMS = [
  { gradient: "from-violet-300 to-purple-400" },
  { gradient: "from-pink-300 to-rose-400" },
  { gradient: "from-blue-300 to-indigo-400" },
  { gradient: "from-amber-300 to-orange-400" },
  { gradient: "from-emerald-300 to-teal-400" },
  { gradient: "from-cyan-300 to-sky-400" },
  { gradient: "from-fuchsia-300 to-pink-400" },
  { gradient: "from-lime-300 to-green-400" },
  { gradient: "from-rose-300 to-red-400" },
  { gradient: "from-indigo-300 to-blue-400" },
  { gradient: "from-teal-300 to-emerald-400" },
  { gradient: "from-orange-300 to-amber-400" },
  { gradient: "from-purple-300 to-violet-400" },
  { gradient: "from-sky-300 to-cyan-400" },
  { gradient: "from-red-300 to-rose-400" },
  { gradient: "from-green-300 to-lime-400" },
  { gradient: "from-yellow-300 to-amber-400" },
  { gradient: "from-slate-300 to-gray-400" },
  { gradient: "from-violet-400 to-indigo-500" },
  { gradient: "from-pink-400 to-fuchsia-500" },
]

// Custom typing hook — types, pauses, deletes, loops
function useTypingEffect(
  phrases: string[],
  typingSpeed = 70,
  deletingSpeed = 35,
  pauseDuration = 2000,
) {
  const [displayText, setDisplayText] = useState("")
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [phase, setPhase] = useState<"typing" | "paused" | "deleting">("typing")

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex]

    if (phase === "typing") {
      if (displayText.length < currentPhrase.length) {
        const timeout = setTimeout(() => {
          setDisplayText(currentPhrase.slice(0, displayText.length + 1))
        }, typingSpeed)
        return () => clearTimeout(timeout)
      } else {
        const timeout = setTimeout(() => setPhase("deleting"), pauseDuration)
        return () => clearTimeout(timeout)
      }
    }

    if (phase === "deleting") {
      if (displayText.length > 0) {
        const timeout = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1))
        }, deletingSpeed)
        return () => clearTimeout(timeout)
      } else {
        setPhraseIndex((prev) => (prev + 1) % phrases.length)
        setPhase("typing")
      }
    }
  }, [displayText, phraseIndex, phase, phrases, typingSpeed, deletingSpeed, pauseDuration])

  return displayText
}

export function Hero() {
  const typedText = useTypingEffect(TYPING_PHRASES)

  return (
    <section className="relative min-h-[560px] sm:min-h-[620px] md:min-h-[680px] flex flex-col items-center justify-center overflow-hidden bg-neutral-50">
      {/* Background collage grid */}
      <div className="absolute inset-0 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2 p-3 opacity-[0.07]">
        {COLLAGE_ITEMS.map((item, i) => (
          <div
            key={i}
            className={`rounded-xl bg-gradient-to-br ${item.gradient} aspect-[4/3]`}
          />
        ))}
      </div>

      {/* Soft radial fade overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_20%,_rgb(250,250,250)_70%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-50/40 via-transparent to-neutral-50/80" />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 py-16 sm:py-20 md:py-24 w-full max-w-3xl mx-auto">
        {/* White bubble with typing text */}
        <div className="bg-white rounded-[28px] shadow-xl shadow-neutral-200/60 border border-neutral-100/80 px-6 py-10 sm:px-10 sm:py-12 md:px-14 md:py-14 w-full max-w-2xl text-center mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-[42px] md:leading-[1.2] font-bold text-neutral-900 leading-tight min-h-[2.4em] flex items-center justify-center">
            <span>
              {typedText}
              <span className="inline-block w-[3px] h-[0.9em] bg-violet-500 ml-0.5 animate-pulse align-middle rounded-full" />
            </span>
          </h1>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-row items-center gap-3 mb-5">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 px-6 py-2.5 sm:px-7 sm:py-3 rounded-full text-sm font-semibold bg-neutral-200/80 text-neutral-700 hover:bg-neutral-300/80 transition-colors"
          >
            Discover
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-2.5 sm:px-7 sm:py-3 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          >
            Try free
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Supporting text */}
        <p className="text-sm text-neutral-400 text-center mb-14 sm:mb-16">
          Join thousands of creators selling digital products on Storelib
        </p>

        {/* Partner logo row */}
        <div className="flex items-center justify-center gap-6 sm:gap-8 md:gap-10 flex-wrap">
          {["Notion", "Figma", "Canva", "Stripe", "Gumroad"].map((name) => (
            <span
              key={name}
              className="text-xs sm:text-sm font-semibold text-neutral-300 tracking-wider uppercase select-none"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
