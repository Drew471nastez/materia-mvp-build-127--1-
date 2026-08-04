"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { HomeIcon, InboxIcon, ProfileIcon, SearchIcon } from "./tab-icons"
import { triggerHaptic, warmHaptics } from "@/lib/native-bridge"
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

  /**
   * The tab your finger just landed on, before the router has caught up.
   *
   * This is the whole of "smooth in between". A tap on a tab used to produce
   * nothing visible at all until the route committed: the haptic fired on
   * pointerdown, the click fired 60–120ms later on release, then the navigation
   * ran, and only when the new page committed did `active` change and the icon
   * fill. On a warm route that gap is short and on a cold one it is not, but it
   * is never zero — and for its whole length the bar is sitting there having
   * apparently ignored you.
   *
   * So the bar answers immediately and the page arrives behind it, which is what
   * a native tab bar does and why one feels instant even when it is not. The
   * optimistic value is dropped the moment the real `active` agrees, and on a
   * timer regardless — a navigation that never happens (a cancelled tap, a
   * failed route) must not leave the wrong tab lit for the rest of the session.
   */
  const [pressed, setPressed] = useState<string | null>(null)
  useEffect(() => {
    if (!pressed) return
    // Caught up: the route is here and `active` is the truth again.
    if (pressed === active || (pressed === "profile" && profileActive)) {
      setPressed(null)
      return
    }
    const give = window.setTimeout(() => setPressed(null), 1400)
    return () => window.clearTimeout(give)
  }, [pressed, active, profileActive])

  /** What the bar SHOWS: the tap if there is one, the route otherwise. */
  const shown = pressed ?? (profileActive ? "profile" : active)

  const [unread, setUnread] = useState(unreadCache.count)
  useEffect(() => {
    let alive = true
    const refresh = () => void fetchUnread().then((n) => alive && setUnread(n))
    // The TTL is what makes this bar cheap, so focus has to respect it too:
    // this bar is mounted on every page, and a handler that refetched on every
    // focus regardless of age meant the cache only ever covered navigation, not
    // the alt-tabbing that actually dominates. Stale means stale in both paths.
    const refreshIfStale = () => {
      if (Date.now() - unreadCache.at <= UNREAD_TTL) return
      refresh()
    }
    refreshIfStale()
    window.addEventListener("focus", refreshIfStale)
    return () => {
      alive = false
      window.removeEventListener("focus", refreshIfStale)
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
    // The buzz already fired on pointerdown, with the finger rather than after
    // it — see `tap` below.
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
        "flex flex-col items-center gap-1 text-[10px]",
        isActive ? "font-semibold" : "font-medium",
        // The label does not move. A tab whose whole contents shrink under the
        // finger is a web affordance borrowed from buttons, and on a bar you
        // press dozens of times a session it reads as cheap — a native tab bar
        // never does it. The ICON dips, which is `.tab-press` on the glyph
        // below: small, immediate, and over before the navigation starts.
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
  const TAB =
    "group flex min-h-[54px] flex-1 flex-col items-center justify-center [-webkit-tap-highlight-color:transparent] touch-manipulation select-none"

  // Tapping a tab is a deliberate act with a result, so it gets the same
  // acknowledgement opening a listing does. A nav item is not a scroll surface,
  // so there is no gesture to disambiguate first.
  //
  // On POINTERDOWN, not click. A haptic is meant to be the bar answering your
  // finger, and click fires on release — so the buzz was arriving after the
  // press had already finished, which reads as confirmation of something you
  // had noticed rather than as feedback. Down is when the finger lands, which
  // is when a physical button would have clicked.
  const tap = (going?: "home" | "search" | "sell" | "inbox" | "profile") => {
    void triggerHaptic("light")
    if (going) setPressed(going)
  }

  // The haptics chunk, fetched while the bar mounts rather than while a finger
  // is waiting on it. See warmHaptics in lib/native-bridge.ts.
  useEffect(() => {
    warmHaptics()
  }, [])

  return (
    <nav
      className="z-40 shrink-0 border-t border-neutral-200 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch px-1 pt-1 pb-1">
        <Link href="/" prefetch onPointerDown={() => tap("home")} aria-label={t("mfeed.home")} className={TAB}>
          {item("mfeed.home", <HomeIcon active={shown === "home"} className="tab-press h-[25px] w-[25px]" />, shown === "home")}
        </Link>

        <button
          type="button"
          onPointerDown={() => tap("search")}
          onClick={() => onSearch?.()}
          aria-label={t("mfeed.search")}
          className={TAB}
        >
          {item("mfeed.search", <SearchIcon active={shown === "search"} className="tab-press h-[25px] w-[25px]" />, shown === "search")}
        </button>

        <button
          type="button"
          onPointerDown={() => tap("sell")}
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

        <Link href="/messages" prefetch onPointerDown={() => tap("inbox")} aria-label={t("mfeed.inbox")} className={cn(TAB, "relative")}>
          {item(
            "mfeed.inbox",
            <span className="relative">
              <InboxIcon active={shown === "inbox"} className="tab-press h-[25px] w-[25px]" />
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#7c3aed] px-[3px] text-[10px] font-bold leading-none text-white ring-2 ring-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>,
            shown === "inbox",
          )}
        </Link>

        {/* Your profile, not the seller settings form. This used to open
            /settings, which redirected anyone without a creators row into
            onboarding — so for every buyer the Profile tab simply did not
            work. Settings is still one tap away, behind the gear up there. */}
        <Link href="/profile" prefetch onPointerDown={() => tap("profile")} aria-label={t("mfeed.profile")} className={TAB}>
          {item("mfeed.profile", <ProfileIcon active={shown === "profile"} className="tab-press h-[25px] w-[25px]" />, shown === "profile")}
        </Link>
      </div>
    </nav>
  )
}
