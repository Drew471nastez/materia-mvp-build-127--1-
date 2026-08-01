"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, Search, Plus, MessageSquare, User } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { cn } from "@/lib/utils"

// Module-scoped so sixty page navigations do not mean sixty counts: every
// mounted bar shares one number and one in-flight request, refreshed on mount
// only when stale and on window focus — the moment a reply is most likely
// waiting.
let unreadCache = { count: 0, at: 0 }
let unreadInflight: Promise<number> | null = null
const UNREAD_TTL = 30_000

function fetchUnread(): Promise<number> {
  if (unreadInflight) return unreadInflight
  unreadInflight = fetch("/api/messages/unread", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { count: 0 }))
    .then((d) => {
      unreadCache = { count: d?.count ?? 0, at: Date.now() }
      return unreadCache.count
    })
    .catch(() => unreadCache.count)
    .finally(() => {
      unreadInflight = null
    })
  return unreadInflight
}

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
  const pathname = usePathname()
  const [launching, setLaunching] = useState(false)

  // The Profile tab points at /profile now, but the callers that compute
  // `active` still only know about /settings, so the tab would sit unlit on the
  // very screen it opened. Reading the path here lights it without every caller
  // having to learn the new route.
  const profileActive = active === "profile" || (pathname?.startsWith("/profile") ?? false)

  const [unread, setUnread] = useState(unreadCache.count)
  useEffect(() => {
    let alive = true
    const refresh = () => void fetchUnread().then((n) => alive && setUnread(n))
    if (Date.now() - unreadCache.at > UNREAD_TTL) refresh()
    window.addEventListener("focus", refresh)
    return () => {
      alive = false
      window.removeEventListener("focus", refresh)
    }
  }, [])

  // Every destination the bar can reach, prefetched as soon as the bar mounts —
  // which is on every page now. A tab tap then has nothing left to fetch: the
  // route is already in the client cache and the navigation is a render, not a
  // round trip. This is the difference between "instant" and "a second".
  useEffect(() => {
    for (const href of ["/", "/products/new", "/messages", "/profile", "/settings"]) {
      router.prefetch(href)
    }
  }, [router])

  // Navigate on the SAME tick as the tap. The spin used to be played first and
  // the navigation fired 170ms later, so every trip through this button carried
  // a deliberate sixth of a second before anything happened — which is exactly
  // what reads as the app being slow. The spin now runs alongside the
  // navigation instead of in front of it.
  const onSell = useCallback(() => {
    if (launching) return
    setLaunching(true)
    router.push("/products/new")
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
        <Link href="/" prefetch aria-label={t("mfeed.home")}>{item("mfeed.home", <Home className="h-6 w-6" strokeWidth={active === "home" ? 2.4 : 2} />, active === "home")}</Link>

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

        <Link href="/messages" prefetch aria-label={t("mfeed.inbox")} className="relative">
          {item(
            "mfeed.inbox",
            <span className="relative">
              <MessageSquare className="h-6 w-6" />
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#7c3aed] px-[3px] text-[10px] font-bold leading-none text-white ring-2 ring-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>,
            active === "inbox",
          )}
        </Link>

        {/* Your profile, not the seller settings form. This used to open
            /settings, which redirected anyone without a creators row into
            onboarding — so for every buyer the Profile tab simply did not
            work. Settings is still one tap away, behind the gear up there. */}
        <Link href="/profile" prefetch aria-label={t("mfeed.profile")}>{item("mfeed.profile", <User className="h-6 w-6" />, profileActive)}</Link>
      </div>
    </nav>
  )
}
