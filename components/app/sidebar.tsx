"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Package,
  Settings,
  ExternalLink,
  LogOut,
  ShoppingCart,
  BarChart3,
  Mail,
  CreditCard,
  Compass,
  Library,
  Menu,
  Palette,
  Link2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface SidebarProps {
  creatorSlug?: string
  username?: string
  storePublished?: boolean
}

export function AppSidebar({ creatorSlug, username, storePublished }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setMobileMenuOpen(false)
    router.push("/")
  }

  const mainNavItems = [
    { href: "/app", label: "Home", icon: LayoutDashboard },
    { href: "/app/products", label: "Products", icon: Package },
    { href: "/app/orders", label: "Sales", icon: ShoppingCart },
    { href: "/app/customers", label: "Customers", icon: Mail },
    { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/app/onepage", label: "OnePage", icon: Link2 },
    { href: "/store-builder", label: "Store Builder", icon: Palette },
    { href: "/app/emails", label: "Emails", icon: Mail },
  ]

  const settingsNavItems = [
    { href: "/app/settings/payments", label: "Payments", icon: CreditCard },
    { href: "/app/settings", label: "Settings", icon: Settings },
  ]

  const discoverNavItems = [
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/library", label: "Library", icon: Library },
  ]

  const storeUrl = username || creatorSlug

  const NavItem = ({ item, onClick }: { item: (typeof mainNavItems)[0]; onClick?: () => void }) => {
    const Icon = item.icon
    const isActive = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href))

    if (item.disabled) {
      return (
        <div className="flex items-center gap-3 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium text-muted-foreground/50 cursor-not-allowed">
          <Icon className="h-5 w-5 shrink-0" />
          <span className="truncate">{item.label}</span>
        </div>
      )
    }

    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium transition-colors active:scale-[0.98]",
          isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    )
  }

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <>
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link href="/app" className="flex items-center gap-2" onClick={onItemClick}>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground shrink-0">
            <span className="text-sm font-bold text-background">M</span>
          </div>
          <span className="text-lg font-semibold tracking-tight truncate">Materia</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {mainNavItems.map((item) => (
            <NavItem key={item.href} item={item} onClick={onItemClick} />
          ))}
        </div>

        <div className="mt-6">
          <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Discover</p>
          <div className="space-y-1">
            {discoverNavItems.map((item) => (
              <NavItem key={item.href} item={item} onClick={onItemClick} />
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Settings</p>
          <div className="space-y-1">
            {settingsNavItems.map((item) => (
              <NavItem key={item.href} item={item} onClick={onItemClick} />
            ))}
          </div>
        </div>
      </nav>

      <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {storeUrl && storePublished && (
          <Link
            href={`/u/${storeUrl}`}
            target="_blank"
            onClick={onItemClick}
            className="mb-1 flex items-center gap-3 rounded-lg px-3 py-3 min-h-[44px] text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-[0.98]"
          >
            <ExternalLink className="h-5 w-5 shrink-0" />
            <span className="truncate">View storefront</span>
          </Link>
        )}
        {storeUrl && !storePublished && (
          <div className="mb-1 px-3 py-2 text-xs text-muted-foreground">
            Store is unpublished. Go to Settings to publish.
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start min-h-[44px] text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-[0.98]"
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
        <Link href="/app" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground shrink-0">
            <span className="text-sm font-bold text-background">M</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">Materia</span>
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

      {/* Desktop sidebar - unchanged positioning */}
      <aside className="fixed left-0 top-0 z-40 hidden h-svh w-64 flex-col border-r border-border bg-background md:flex">
        <SidebarContent />
      </aside>
    </>
  )
}
