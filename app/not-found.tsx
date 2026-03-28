import Link from "next/link"
import { Compass } from "lucide-react"

export default function NotFound() {
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
