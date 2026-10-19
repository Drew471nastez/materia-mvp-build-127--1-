import Link from "next/link"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { SUPPORT_EMAIL } from "@/lib/help/articles"

/**
 * THE HELP CENTER'S OWN BAR. A help page is for reading: the logo with
 * "Help" beside it (home of the Help Center), a way to write to support and
 * one way back to Storelib. No notifications, no library, no marketing menu,
 * nothing else to open.
 */
export function HelpHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#eef0f2] bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-3 px-4 sm:h-[60px] sm:px-6">
        <Link href="/help" className="group flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" aria-label="Storelib Help">
          <StorelibLogo size={28} />
          <span className="text-[16px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">Help</span>
        </Link>
        <nav className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="hidden h-9 items-center rounded-lg px-3 text-[13.5px] font-medium text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] sm:inline-flex"
          >
            Contact support
          </a>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors hover:border-[#d1d5db] hover:bg-[#f9fafb]"
          >
            Go to Storelib
          </Link>
        </nav>
      </div>
    </header>
  )
}
