/**
 * Home's banner as it was before the announcements (commit 96949910), the
 * same markup, with the old globe: the "before" that
 * scripts/check-home-scroll.mjs swipes past in the same run as the new one,
 * so the two are measured on the same machine at the same moment.
 * `@probe/old-globe` is the old globe.tsx, which the probe takes from git.
 */
import Link from "next/link"
import Image from "next/image"
// @ts-expect-error resolved by the probe's bundler, to the old globe from git
import { BannerGlobe } from "@probe/old-globe"

export function HomeBanner({ planId }: { planId: string }) {
  const pro = planId === "growth" || planId === "pro"
  return (
    <div className="relative overflow-hidden rounded-2xl" data-home-banner="">
      <Image
        src="https://images.unsplash.com/photo-1541367777708-7905fe3296c0?w=1200&h=300&fit=crop"
        alt=""
        width={1200}
        height={300}
        sizes="(max-width: 640px) 100vw, 640px"
        priority
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-[300px] w-[340px] bg-[radial-gradient(closest-side,rgba(8,6,18,0.62),rgba(8,6,18,0))] sm:-bottom-28 sm:right-0 sm:h-[340px] sm:w-[420px]" />
      <BannerGlobe className="absolute -right-10 top-8 h-[190px] w-[190px] sm:right-6 sm:top-2 sm:h-[250px] sm:w-[250px] lg:right-12" />
      <div className="pointer-events-none relative z-10 max-w-[62%] px-5 py-5 sm:max-w-[calc(100%-260px)] sm:px-8 sm:py-6 lg:max-w-[calc(100%-300px)] [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        {pro ? (
          <>
            <p className="text-[16px] sm:text-[20px] font-medium text-white mb-1">Track what&apos;s working in real time</p>
            <p className="text-[13px] sm:text-[14px] text-white/80 mb-3 sm:mb-4">Use your dashboard to optimize for more sales.</p>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Link href="/app/analytics" className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors">
                View analytics
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[13px] sm:text-[15px] font-semibold text-white">Pro plan</span>
            </div>
            <p className="text-[14px] sm:text-[16px] text-white/90 mb-3 sm:mb-4">3% fees instead of 6%, and 25 GB of storage instead of 1 GB.</p>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Link href="/app/settings/billing/upgrade" className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors">
                Upgrade
              </Link>
              <button type="button" className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[12px] sm:text-[13px] font-medium text-white hover:bg-white/20 transition-colors cursor-pointer">
                Features
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
