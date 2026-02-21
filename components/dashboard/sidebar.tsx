"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Package, LogOut, Download, Menu, Heart, Compass, Settings, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

const LOGO_URL = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"

export function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isCreator, setIsCreator] = useState(false)

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const supabase = createClient()
    async function checkCreatorStatus() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_creator")
          .eq("id", user.id)
          .single()
        setIsCreator(profile?.is_creator ?? false)
      }
    }
    checkCreatorStatus()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setMobileMenuOpen(false)
    router.push("/")
  }

  const navItems = [
    { href: "/library", label: "Overview", icon: LayoutDashboard },
    { href: "/library/my-downloads", label: "My Downloads", icon: Download },
    { href: "/library/wishlist", label: "Wishlist", icon: Heart },
    { href: "/library/settings", label: "Settings", icon: Settings },
  ]

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <>
      <div className="flex h-16 items-center border-b border-border px-4">
        <Link href="/library" className="flex items-center gap-2.5" onClick={onItemClick}>
          <Image
            src={LOGO_URL}
            alt="Storelib"
            width={37}
            height={37}
            className="h-[37px] w-[37px] shrink-0"
          />
          <span className="text-xl font-semibold tracking-tight truncate">Storelib</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== "/library" && pathname.startsWith(item.href))

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
          onClick={onItemClick}
          className="mb-2 flex items-center justify-center gap-2 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 active:scale-[0.98] transition-colors cursor-pointer"
        >
          <Compass className="h-4 w-4 shrink-0" />
          <span className="truncate">Discover</span>
        </Link>
        {!isCreator && (
          <Link
            href="/signup/success?action=become-creator"
            onClick={onItemClick}
            className="mb-1 flex items-center justify-center gap-2 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] transition-colors"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>Start Selling</span>
          </Link>
        )}
        {isCreator && (
          <Link
            href="/app"
            onClick={onItemClick}
            className="mb-1 flex items-center gap-3 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium bg-neutral-900 text-white hover:bg-black active:scale-[0.98] transition-colors justify-center"
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            <span>Dashboard</span>
          </Link>
        )}
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
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <Link href="/library" className="flex items-center gap-2">
          <Image
            src={LOGO_URL}
            alt="Storelib"
            width={37}
            height={37}
            className="h-[37px] w-[37px] shrink-0"
          />
          <span className="text-lg font-semibold tracking-tight">Storelib</span>
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
      </header>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] max-w-[85vw] p-0 pt-[env(safe-area-inset-top)]">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <SidebarContent onItemClick={() => setMobileMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-svh w-64 flex-col border-r border-border bg-background md:flex">
        <SidebarContent />
      </aside>
    </>
  )
}
