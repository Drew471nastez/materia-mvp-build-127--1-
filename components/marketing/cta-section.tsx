"use client"

import Link from "next/link"

export function CtaSection() {
  return (
    <section className="py-10 sm:py-16 bg-white">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="bg-[#6D28D9] rounded-[24px] sm:rounded-[32px] overflow-hidden relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse,rgba(255,255,255,0.08)_0%,transparent_70%)] pointer-events-none" />

          <div className="relative px-6 sm:px-12 md:px-16 py-16 sm:py-20">
            {/* Text content */}
            <div className="text-center max-w-[640px] mx-auto">
              <h2 className="text-[clamp(30px,5vw,48px)] font-bold tracking-tight mb-3.5 text-white leading-[1.1]">
                Turn your ideas into income
              </h2>
              <p className="text-base sm:text-lg text-white/70 mb-8">
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
                  className="inline-flex items-center justify-center gap-2 text-base font-semibold py-4 px-10 rounded-full border-[1.5px] border-white/30 text-white hover:border-white/60 hover:bg-white/10 transition-all duration-300 w-full sm:w-auto max-w-[300px]"
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
