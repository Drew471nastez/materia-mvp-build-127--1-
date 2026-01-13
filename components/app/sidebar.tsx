"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Package,
  Settings,
  LogOut,
  ShoppingCart,
  BarChart3,
  Mail,
  CreditCard,
  Menu,
  Palette,
  Link2,
  Users,
  HelpCircle,
  Zap,
  ChevronDown,
  Compass,
  Library,
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

  const profileDropdownItems = [
    { href: "/app/settings", label: "Settings", icon: Settings },
    { href: "/app/settings/payments", label: "Billing", icon: CreditCard },
    { href: "/help", label: "Help", icon: HelpCircle },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/library", label: "Library", icon: Library },
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
          "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-all duration-150",
          isActive
            ? "bg-neutral-200 text-neutral-900"
            : "text-neutral-600 hover:bg-neutral-100/50 hover:text-neutral-900",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
        <span>{item.label}</span>
      </Link>
    )
  }

  const ProfileDropdown = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
        className={cn(
          "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-all duration-150",
          profileDropdownOpen ? "bg-neutral-100/80" : "hover:bg-neutral-100/50",
        )}
      >
        <Avatar className="h-10 w-10 shrink-0">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={userDisplayName} className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-neutral-200 text-neutral-600 text-sm font-medium">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 text-[14px] font-medium text-neutral-900 truncate">{userDisplayName}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-neutral-400 transition-transform duration-150",
            profileDropdownOpen && "rotate-180",
          )}
        />
      </button>

      {profileDropdownOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="rounded-xl border border-neutral-200/70 bg-white p-1 shadow-lg shadow-black/5">
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
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
            <div className="my-1 h-px bg-neutral-100" />
            <button
              onClick={() => {
                setProfileDropdownOpen(false)
                handleSignOut()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex h-full flex-col bg-[#FAFAFA]">
      <div className="px-3 pt-4 pb-1">
        <ProfileDropdown onItemClick={onItemClick} />
      </div>

      <nav className="sidebar-nav flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-0.5">
          {mainNavItems.map((item) => (
            <NavItem key={item.href} item={item} onClick={onItemClick} />
          ))}
        </div>

        {storeUrl && !storePublished && (
          <div className="mt-4 rounded-[10px] bg-amber-50/80 border border-amber-100/80 px-3 py-2.5">
            <p className="text-[12px] text-amber-700">Store is unpublished. Go to Settings to publish.</p>
          </div>
        )}
      </nav>

      <div className="px-3 pb-3">
        <Link
          href="/upgrade"
          onClick={onItemClick}
          className="group flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-50/80 to-purple-50/80 border border-violet-100/60 px-3.5 py-3 transition-all duration-150 hover:from-violet-100/80 hover:to-purple-100/80"
        >
          <div>
            <p className="text-[13px] font-semibold text-neutral-900">Upgrade to Pro</p>
            <p className="text-[11px] text-neutral-600">Unlock more benefits</p>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100/80 group-hover:bg-violet-200/80 transition-colors">
            <Zap className="h-3.5 w-3.5 text-violet-600" strokeWidth={2} />
          </div>
        </Link>
      </div>

      <div className="border-t border-neutral-200/50 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            onClick={onItemClick}
            className="text-[17px] font-semibold tracking-tight text-violet-600 hover:text-violet-700 transition-colors"
          >
            storelib
          </Link>
          <button className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-500 transition-colors">
            <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <style jsx global>{`
        .sidebar-nav {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
        }
        .sidebar-nav:hover {
          scrollbar-color: rgba(0, 0, 0, 0.15) transparent;
        }
        .sidebar-nav::-webkit-scrollbar {
          width: 4px;
        }
        .sidebar-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-nav::-webkit-scrollbar-thumb {
          background-color: transparent;
          border-radius: 4px;
        }
        .sidebar-nav:hover::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.15);
        }
        .sidebar-nav::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0, 0, 0, 0.25);
        }
      `}</style>

      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-neutral-200/50 bg-white/90 backdrop-blur-xl px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <Link href="/app" className="flex items-center gap-2">
          <span className="text-[17px] font-semibold tracking-tight text-violet-600">storelib</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-lg"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="left"
          className="w-[260px] max-w-[85vw] p-0 pt-[env(safe-area-inset-top)] border-neutral-200/50"
          hideCloseButton
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <SidebarContent onItemClick={() => setMobileMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <aside className="fixed left-0 top-0 z-40 hidden h-svh w-[220px] flex-col border-r border-neutral-200/50 md:flex">
        <SidebarContent />
      </aside>
    </>
  )
}
