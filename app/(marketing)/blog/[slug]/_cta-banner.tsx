"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function CtaBanner() {
  const [email, setEmail] = useState("")
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (trimmed) {
      router.push(`/signup?email=${encodeURIComponent(trimmed)}`)
    } else {
      router.push("/signup")
    }
  }

  return (
    <section className="mt-16 rounded-2xl bg-neutral-950 px-6 py-12 sm:px-10 sm:py-14 text-center">
      <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
        Start for free!
      </h3>
      <p className="text-neutral-400 text-sm sm:text-base mb-7 max-w-md mx-auto leading-relaxed">
        Turn your digital creations into income. Launch your store in minutes — no credit card required.
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-0 max-w-md mx-auto">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="flex-1 min-w-0 h-11 px-4 bg-white/10 border border-white/20 rounded-l-xl text-sm text-white placeholder-neutral-500 outline-none focus:border-purple-500 focus:bg-white/[0.12] transition-colors"
        />
        <button
          type="submit"
          className="h-11 px-5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-r-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          Get Started
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </form>
    </section>
  )
}
