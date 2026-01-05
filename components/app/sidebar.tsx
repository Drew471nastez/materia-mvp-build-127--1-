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
  Users,
  HelpCircle,
  Zap,
  ChevronDown,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface SidebarProps {
  creatorSlug?: string
  username?: string
  storePublished?: boolean
  avatarUrl?: string
  displayName?: string
}

export function AppSidebar({ creatorSlug, username, storePublished, avatarUrl, displayName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMobileMenuOpen(false)
    setProfileDropdownOpen(false)
  }, [pathname])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setMobileMenuOpen(false)
    setProfileDropdownOpen(false)
    router.push("/")
  }

  const mainNavItems = [
    { href: "/app", label: "Home", icon: LayoutDashboard },
    { href: "/app/products", label: "Products", icon: Package },
    { href: "/app/orders", label: "Sales", icon: ShoppingCart },
    { href: "/app/customers", label: "Customers", icon: Users },
    { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/app/onepage", label: "OnePage", icon: Link2 },
    { href: "/store-builder", label: "Store Builder", icon: Palette },
    { href: "/app/emails", label: "Emails", icon: Mail },
  ]

  const discoverNavItems = [
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/library", label: "Library", icon: Library },
  ]

  const profileDropdownItems = [
    { href: "/app/settings", label: "Settings", icon: Settings },
    { href: "/app/settings/payments", label: "Billing", icon: CreditCard },
    { href: "/help", label: "Help", icon: HelpCircle },
    { href: "/explore", label: "Discover", icon: Compass },
  ]

  const storeUrl = username || creatorSlug
  const userDisplayName = displayName || username || creatorSlug || "User"
  const userInitials = userDisplayName.slice(0, 2).toUpperCase()

  const NavItem = ({ item, onClick }: { item: (typeof mainNavItems)[0]; onClick?: () => void }) => {
    const Icon = item.icon
    const isActive = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href))

    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-all duration-200",
          isActive 
            ? "bg-neutral-100 text-neutral-900" 
            : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
        <span>{item.label}</span>
      </Link>
    )
  }

  const ProfileDropdown = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div 
      ref={dropdownRef}
      className="relative"
    >
      <button
        onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
          profileDropdownOpen 
            ? "bg-neutral-100" 
            : "hover:bg-neutral-50"
        )}
      >
        <Avatar className="h-9 w-9 ring-2 ring-neutral-100">
          <AvatarImage src={avatarUrl} alt={userDisplayName} />
          <AvatarFallback className="bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-600 text-sm font-medium">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 text-[15px] font-medium text-neutral-900 truncate">{userDisplayName}</span>
        <ChevronDown 
          className={cn(
            "h-4 w-4 text-neutral-400 transition-transform duration-200",
            profileDropdownOpen && "rotate-180"
          )} 
        />
      </button>

      {profileDropdownOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="rounded-xl border border-neutral-200/80 bg-white p-1.5 shadow-lg shadow-neutral-200/50">
            {profileDropdownItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setProfileDropdownOpen(false)
                    onItemClick?.()
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
            <div className="my-1.5 h-px bg-neutral-100" />
            <button
              onClick={() => {
                setProfileDropdownOpen(false)
                handleSignOut()
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex h-full flex-col bg-neutral-50/50">
      <div className="px-3 pt-4 pb-2">
        <ProfileDropdown onItemClick={onItemClick} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-0.5">
          {mainNavItems.map((item) => (
            <NavItem key={item.href} item={item} onClick={onItemClick} />
          ))}
        </div>

        <div className="mt-6">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Discover
          </p>
          <div className="space-y-0.5">
            {discoverNavItems.map((item) => (
              <NavItem key={item.href} item={item} onClick={onItemClick} />
            ))}
          </div>
        </div>

        {storeUrl && !storePublished && (
          <div className="mt-6 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
            <p className="text-[13px] text-amber-700">
              Store is unpublished. Go to Settings to publish.
            </p>
          </div>
        )}
      </nav>

      <div className="px-3 pb-3">
        <Link
          href="/upgrade"
          onClick={onItemClick}
          className="group flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100/80 px-4 py-3 transition-all duration-200 hover:from-violet-100 hover:to-purple-100"
        >
          <div>
            <p className="text-[14px] font-semibold text-neutral-900">Upgrade to Pro</p>
            <p className="text-[12px] text-neutral-500">Unlock more benefits</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 group-hover:bg-violet-200 transition-colors">
            <Zap className="h-4 w-4 text-violet-600" strokeWidth={2} />
          </div>
        </Link>
      </div>

      <div className="border-t border-neutral-200/60 px-4 py-4">
        <div className="flex items-center justify-between">
          <Link 
            href="/" 
            onClick={onItemClick}
            className="text-[18px] font-semibold tracking-tight text-violet-600 hover:text-violet-700 transition-colors"
          >
            storelib
          </Link>
          <button className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors">
            <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-neutral-200/60 bg-white/80 backdrop-blur-xl px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <Link href="/app" className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-violet-600">storelib</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-xl"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] max-w-[85vw] p-0 pt-[env(safe-area-inset-top)] border-neutral-200/60">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <SidebarContent onItemClick={() => setMobileMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <aside className="fixed left-0 top-0 z-40 hidden h-svh w-[260px] flex-col border-r border-neutral-200/60 bg-white md:flex">
        <SidebarContent />
      </aside>
    </>
  )
}
