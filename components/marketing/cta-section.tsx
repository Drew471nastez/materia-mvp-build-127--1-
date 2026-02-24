"use client"

import Link from "next/link"

export function CtaSection() {
  return (
    <section className="py-20 sm:py-24 bg-neutral-900 text-center relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse,rgba(124,92,252,0.2)_0%,transparent_70%)] pointer-events-none" />
      <div className="max-w-[1200px] mx-auto px-6 relative">
        <h2 className="text-[clamp(34px,5vw,52px)] font-bold tracking-tighter mb-3.5 text-white">
          Your store is waiting.
        </h2>
        <p className="text-base text-neutral-500 mb-9">
          Set up takes 5 minutes. No credit card. No commitment. Just start selling.
        </p>
        <div className="flex items-center justify-center gap-3 flex-col sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 text-base font-semibold py-4.5 px-10 rounded-full bg-white text-neutral-900 hover:bg-neutral-100 transition-all duration-300 hover:-translate-y-0.5 w-full sm:w-auto max-w-[300px]"
          >
            Create your store →
          </Link>
          <Link
            href="#features"
            className="inline-flex items-center justify-center gap-2 text-base font-semibold py-4.5 px-10 rounded-full border-[1.5px] border-white/20 text-white hover:border-white/50 hover:bg-white/5 transition-all duration-300 w-full sm:w-auto max-w-[300px]"
          >
            See how it works
          </Link>
        </div>
      </div>
    </section>
  )
}
