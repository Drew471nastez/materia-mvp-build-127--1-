"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, LogOut, Download, Menu, Heart, Compass, Settings, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import { isNativeApp, nativeLogOut, openExternal } from "@/lib/native-bridge"
import { StorelibLogo } from "@/components/brand/storelib-logo"

const EXPLORE_FULL_URL = `https://${process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"}/explore`

export function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  // Close on navigation
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Close on Escape key
  useEffect(() => {
    if (!mobileMenuOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [mobileMenuOpen])

  useEffect(() => {
    const supabase = createClient()
    async function checkCreatorStatus() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Use creators.onboarding_completed as source of truth (not profiles.is_creator
        // which can be true before onboarding is fully completed)
        const { data: creator } = await supabase
          .from("creators")
          .select("onboarding_completed")
          .eq("user_id", user.id)
          .maybeSingle()
        setIsCreator(creator?.onboarding_completed === true)
      }
    }
    checkCreatorStatus()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
    setMobileMenuOpen(false)
    if (isNativePlatform()) {
      nativeLogOut()
    } else {
      router.push("/")
    }
  }

  const closeSidebar = useCallback(() => setMobileMenuOpen(false), [])

  const navItems = [
    { href: "/account/library", label: "Overview", icon: LayoutDashboard },
    { href: "/account/library", label: "My Downloads", icon: Download },
    { href: "/account/library/wishlist", label: "Wishlist", icon: Heart },
  ]

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <>
      <div className="flex h-16 items-center border-b border-border px-4">
        <Link href="/account/library" className="flex items-center gap-2.5" onClick={onItemClick}>
          <StorelibLogo size={37} />
          <span className="text-xl font-semibold tracking-tight truncate">Storelib</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== "/account/library" && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium transition-colors active:scale-[0.98]",
                isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Link
          href="/explore"
          onClick={(e) => {
            if (isNativeApp()) { e.preventDefault(); openExternal(EXPLORE_FULL_URL) }
            onItemClick?.()
          }}
          className="mb-2 flex items-center justify-center gap-2 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 active:scale-[0.98] transition-colors cursor-pointer"
        >
          <Compass className="h-4 w-4 shrink-0" />
          <span className="truncate">Discover</span>
        </Link>
        {!isCreator && (
          <Link
            /* /sell is the one way in to selling: it takes a buyer into seller onboarding. */
            href="/sell"
            onClick={onItemClick}
            className="mb-2 flex items-center justify-center gap-2 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium bg-neutral-900 text-white hover:bg-black active:scale-[0.98] transition-colors"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>Become a seller</span>
          </Link>
        )}
        {isCreator && (
          <Link
            href="/app"
            onClick={onItemClick}
            className="mb-2 flex items-center gap-3 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium bg-neutral-900 text-white hover:bg-black active:scale-[0.98] transition-colors justify-center"
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            <span>Dashboard</span>
          </Link>
        )}
        <Link
          href="/account"
          onClick={onItemClick}
          className="mb-1 flex items-center gap-3 px-3 py-3 min-h-[44px] text-sm font-medium text-muted-foreground hover:text-foreground transition-colors active:scale-[0.98]"
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span className="truncate">Settings</span>
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start min-h-[44px] text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-[0.98] cursor-pointer"
          onClick={handleSignOut}
        >
          <LogOut className="mr-3 h-5 w-5 shrink-0" />
          <span className="truncate">Sign out</span>
        </Button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile header */}
      <header
        className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background md:hidden"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div className="flex h-14 items-center justify-between px-4">
        <Link href="/account/library" className="flex items-center gap-2">
          <StorelibLogo size={37} />
          <span className="text-lg font-semibold tracking-tight">Storelib</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/explore"
            onClick={(e) => { if (isNativeApp()) { e.preventDefault(); openExternal(EXPLORE_FULL_URL) } }}
            className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Discover"
          >
            <Compass className="h-5 w-5" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────
          Mobile sidebar drawer — pure CSS transitions, NO Radix Dialog.
          Eliminates every possible scroll-lock side-effect (no
          react-remove-scroll, no overscrollBehavior manipulation, no
          touchmove preventDefault, no data-scroll-locked attributes).
          ────────────────────────────────────────────────────────────── */}

      {/* Backdrop — always in DOM, visibility controlled by opacity + pointer-events */}
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden"
        style={{
          opacity: mobileMenuOpen ? 1 : 0,
          pointerEvents: mobileMenuOpen ? "auto" : "none",
        }}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* Sidebar panel — always in DOM, slides via translateX */}
      <div
        className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] bg-background shadow-xl border-r border-border transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden"
        style={{
          transform: mobileMenuOpen ? "translateX(0)" : "translateX(-100%)",
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation Menu"
      >
        <div className="flex h-full flex-col">
          <SidebarContent onItemClick={closeSidebar} />
        </div>
      </div>

      {/* Desktop sidebar — pt-[env(safe-area-inset-top)] pushes the logo
          row below the iOS/iPadOS status bar in Capacitor.
          In a browser env() = 0 so layout is unchanged. */}
      <aside className="fixed left-0 top-0 z-40 hidden h-svh w-64 flex-col border-r border-border bg-background md:flex pt-[env(safe-area-inset-top,_0px)] pl-[env(safe-area-inset-left,_0px)]">
        <SidebarContent />
      </aside>
    </>
  )
}
