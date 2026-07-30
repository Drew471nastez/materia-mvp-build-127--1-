"use client"

import Link from "next/link"
import { Home, Search, Plus, MessageSquare, User } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { cn } from "@/lib/utils"

/**
 * Depop/Vinted-style bottom tab bar for the mobile marketplace.
 * Home / Search / Sell (+) / Inbox / Profile. Fixed to the safe-area bottom.
 */
export function MobileBottomNav({
  active = "home",
  onSearch,
}: {
  active?: "home" | "search" | "sell" | "inbox" | "profile"
  /** Focus the feed search instead of navigating. */
  onSearch?: () => void
}) {
  const { t } = useLocale()

  const item = (key: string, icon: React.ReactNode, isActive: boolean) => (
    <span className={cn("flex flex-col items-center gap-1 text-[10px] font-medium", isActive ? "text-neutral-900" : "text-neutral-400")}>
      {icon}
      {t(key)}
    </span>
  )

  return (
    <nav
      className="z-40 shrink-0 border-t border-neutral-200 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 pt-2 pb-1.5">
        <Link href="/" aria-label={t("mfeed.home")}>{item("mfeed.home", <Home className="h-6 w-6" strokeWidth={active === "home" ? 2.4 : 2} />, active === "home")}</Link>

        <button type="button" onClick={onSearch} aria-label={t("mfeed.search")}>
          {item("mfeed.search", <Search className="h-6 w-6" />, active === "search")}
        </button>

        <Link href="/app/products/new" aria-label={t("mfeed.sell")} className="flex flex-col items-center gap-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm active:scale-95 transition-transform">
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </span>
        </Link>

        <Link href="/app" aria-label={t("mfeed.inbox")} className="relative">
          {item("mfeed.inbox", <MessageSquare className="h-6 w-6" />, active === "inbox")}
        </Link>

        <Link href="/app" aria-label={t("mfeed.profile")}>{item("mfeed.profile", <User className="h-6 w-6" />, active === "profile")}</Link>
      </div>
    </nav>
  )
}
