"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, Search, Plus, MessageSquare, User } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { triggerHaptic } from "@/lib/native-bridge"
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
    void triggerHaptic("light")
    setLaunching(true)
    router.push("/products/new")
  }, [launching, router])

  // Every tab answers the finger before the route does.
  //
  // A tab change has a render behind it however well it is warmed, and the gap
  // between touching a tab and seeing anything move is where the bar feels
  // sluggish — not in the milliseconds afterwards. The icon dips on press and
  // buzzes on the tap, both immediately, so the bar is never the thing you are
  // waiting on. The dip is a composited transform on one small element.
  const item = (key: string, icon: React.ReactNode, isActive: boolean) => (
    <span
      className={cn(
        "flex flex-col items-center gap-1 text-[10px] font-medium",
        // No scale. A tab that shrinks under the finger is a web affordance
        // borrowed from buttons, and on a bar you press dozens of times a
        // session it reads as cheap — a native tab bar never does it. The
        // acknowledgement is the haptic, which is instant and silent, and then
        // the page itself, which now paints its shell on the same frame. The
        // colour still settles into the active tint, and that is the whole of
        // the visual feedback a tab needs.
        "transition-colors duration-150 ease-out",
        isActive ? "text-neutral-900" : "text-neutral-400",
      )}
    >
      {icon}
      {t(key)}
    </span>
  )

  /**
   * A whole fifth of the bar, not just the glyph inside it.
   *
   * Each tab was an inline element hugging its own icon and label, so the
   * target was roughly 24px wide with dead space either side of it — press a
   * centimetre off and nothing happened at all. Stretching every tab to fill
   * its column means the miss is impossible: anywhere in that band is the tab.
   * The visual is unchanged; only the region that answers you grew.
   */
  const TAB = "group flex min-h-[54px] flex-1 flex-col items-center justify-center"

  // Tapping a tab is a deliberate act with a result, so it gets the same
  // acknowledgement opening a listing does. A nav item is not a scroll surface,
  // so there is no gesture to disambiguate first.
  const tap = () => void triggerHaptic("light")

  return (
    <nav
      className="z-40 shrink-0 border-t border-neutral-200 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch px-1 pt-1 pb-1">
        <Link href="/" prefetch onClick={tap} aria-label={t("mfeed.home")} className={TAB}>
          {item("mfeed.home", <Home className="h-6 w-6" strokeWidth={active === "home" ? 2.4 : 2} />, active === "home")}
        </Link>

        <button
          type="button"
          onClick={() => {
            tap()
            onSearch?.()
          }}
          aria-label={t("mfeed.search")}
          className={TAB}
        >
          {item("mfeed.search", <Search className="h-6 w-6" />, active === "search")}
        </button>

        <button
          type="button"
          onClick={onSell}
          aria-label={t("mfeed.sell")}
          className="group flex min-h-[54px] flex-1 flex-col items-center justify-center"
        >
          <span
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full text-white transition-transform duration-200",
              !launching && "group-active:scale-95",
            )}
            style={{
              background: "linear-gradient(150deg, #8b5cf6 0%, #7c3aed 100%)",
              boxShadow: "0 6px 18px -4px rgba(124, 58, 237, 0.55), 0 2px 6px -1px rgba(124, 58, 237, 0.35)",
            }}
          >
            <Plus className={cn("h-6 w-6", launching && "plus-launch")} strokeWidth={2.6} />
          </span>
        </button>

        <Link href="/messages" prefetch onClick={tap} aria-label={t("mfeed.inbox")} className={cn(TAB, "relative")}>
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
        <Link href="/profile" prefetch onClick={tap} aria-label={t("mfeed.profile")} className={TAB}>
          {item("mfeed.profile", <User className="h-6 w-6" />, profileActive)}
        </Link>
      </div>
    </nav>
  )
}
