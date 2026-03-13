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
    <section className="mt-16 rounded-2xl bg-neutral-50 border border-neutral-200 px-6 py-12 sm:px-10 sm:py-14 text-center">
      <h3 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-2">
        Start your online business!
      </h3>
      <p className="text-neutral-500 text-sm sm:text-base mb-7 max-w-md mx-auto leading-relaxed">
        Turn your digital creations into income. Launch your store in minutes, no credit card required.
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-0 max-w-md mx-auto">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="flex-1 min-w-0 h-11 px-4 bg-white border border-neutral-300 rounded-l-xl text-sm text-neutral-900 placeholder-neutral-400 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
        />
        <button
          type="submit"
          className="h-11 px-5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold rounded-r-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          Get Started
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </form>
    </section>
  )
}
