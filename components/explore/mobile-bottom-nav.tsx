"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
  const router = useRouter()
  const [launching, setLaunching] = useState(false)
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Prefetch the new-product page so the tap navigates near-instantly.
  useEffect(() => {
    router.prefetch("/app/products/new")
  }, [router])

  // Sell button: play the smooth spin once, then glide to the new-product page.
  // A short delay lets the spin read as intentional without feeling slow.
  const onSell = useCallback(() => {
    if (launching) return
    setLaunching(true)
    if (navTimer.current) clearTimeout(navTimer.current)
    navTimer.current = setTimeout(() => router.push("/app/products/new"), 170)
  }, [launching, router])

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

        <button
          type="button"
          onClick={onSell}
          aria-label={t("mfeed.sell")}
          className="flex flex-col items-center gap-1"
        >
          <span
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full text-white transition-transform duration-200",
              !launching && "active:scale-95",
            )}
            style={{
              background: "linear-gradient(150deg, #8b5cf6 0%, #7c3aed 100%)",
              boxShadow: "0 6px 18px -4px rgba(124, 58, 237, 0.55), 0 2px 6px -1px rgba(124, 58, 237, 0.35)",
            }}
          >
            <Plus className={cn("h-6 w-6", launching && "plus-launch")} strokeWidth={2.6} />
          </span>
        </button>

        <Link href="/app" aria-label={t("mfeed.inbox")} className="relative">
          {item("mfeed.inbox", <MessageSquare className="h-6 w-6" />, active === "inbox")}
        </Link>

        <Link href="/app" aria-label={t("mfeed.profile")}>{item("mfeed.profile", <User className="h-6 w-6" />, active === "profile")}</Link>
      </div>
    </nav>
  )
}
