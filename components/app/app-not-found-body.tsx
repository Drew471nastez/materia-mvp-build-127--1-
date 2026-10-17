import Link from "next/link"
import { Home } from "lucide-react"

/** Shared presentation; the route supplies server translations, browser probes supply their fixture words. */
export function AppNotFoundBody({ tt }: { tt: (text: string) => string }) {
  return (
    <div className="page-scroll h-full overflow-y-auto bg-[#f8f9fa] flex items-center justify-center p-8">
      <div className="text-center max-w-sm mx-auto">
        <p className="text-[96px] font-black text-[#e5e7eb] leading-none tracking-tight mb-1 select-none">404</p>
        <h1 className="text-[22px] font-bold text-[#1a1a2e] mb-2">{tt("Page not found")}</h1>
        <p className="text-[14px] text-[#6b7280] leading-relaxed mb-8">{tt("This page doesn't exist or you don't have access to it.")}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/app" className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-[#1a1a2e] text-white text-[13px] font-semibold hover:bg-[#2d2d4e] transition-colors">
            <Home className="h-4 w-4" />{tt("Dashboard")}
          </Link>
          <Link href="/app/products" className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-[#e5e7eb] bg-white text-[#374151] text-[13px] font-semibold hover:bg-[#f9fafb] transition-colors">{tt("My Products")}</Link>
        </div>
      </div>
    </div>
  )
}
