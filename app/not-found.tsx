import Link from "next/link"
import { Compass } from "lucide-react"

import { NotFoundBody } from "@/components/platform/not-found-body"
import { SiteNotFound } from "@/components/website-builder/site-not-found"

/**
 * Two answers, one route. See components/platform/not-found-body.tsx: on
 * storelib.com this is Storelib's 404, and on a creator's own address it is
 * the 404 page the creator arranged in the builder, inside their own header
 * and footer (components/website-builder/site-not-found.tsx), with the plain
 * page below when the site's own cannot be drawn. Neither mentions Storelib
 * or offers to take the visitor off the site they were on.
 */
export default function NotFound() {
  return <NotFoundBody platform={<PlatformNotFound />} site={<SiteNotFound fallback={<PlainSiteNotFound />} />} />
}

/** A page that is not there, on somebody's own website, when their own 404 page cannot be drawn. */
function PlainSiteNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-24 text-center">
      <h1 className="text-[26px] font-semibold tracking-tight text-[#1a1a2e] sm:text-[30px]">That page is not here</h1>
      <p className="max-w-sm text-[15px] leading-relaxed text-[#6b7280]">
        The link may be old, or the page may have moved.
      </p>
      {/* `/` is the front page of whatever address the visitor is already at. */}
      <Link
        href="/"
        className="mt-3 inline-flex h-11 items-center rounded-xl bg-[#1a1a2e] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#2d2d4e]"
      >
        Back to the home page
      </Link>
    </main>
  )
}

function PlatformNotFound() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16 sm:py-24">
      <div className="text-center max-w-lg mx-auto">
        {/* Big 404 */}
        <p className="text-[120px] sm:text-[160px] font-black text-[#f3f4f6] leading-none tracking-tight mb-6 select-none">
          404
        </p>

        <h1 className="text-[26px] sm:text-[32px] font-bold text-[#1a1a2e] tracking-tight mb-3">
          Page not found
        </h1>
        <p className="text-[15px] sm:text-[16px] text-[#6b7280] leading-relaxed mb-10 max-w-sm mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved to a different URL.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-[#1a1a2e] text-white text-[14px] font-semibold hover:bg-[#2d2d4e] transition-colors"
          >
            <Compass className="h-4 w-4" />
            Explore Storelib
          </Link>
        </div>

        {/* Help links */}
        <div className="mt-10 pt-8 border-t border-[#f3f4f6] flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link href="/help" className="text-[13px] text-[#9ca3af] hover:text-[#6b7280] transition-colors">
            Help Center
          </Link>
          <Link href="/privacy" className="text-[13px] text-[#9ca3af] hover:text-[#6b7280] transition-colors">
            Privacy Policy
          </Link>
          <a href="https://storelib.com/terms" className="text-[13px] text-[#9ca3af] hover:text-[#6b7280] transition-colors">
            Terms of Service
          </a>
        </div>
      </div>
    </main>
  )
}
