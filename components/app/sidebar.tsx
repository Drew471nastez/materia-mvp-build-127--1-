"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutGrid,
  Package,
  Settings,
  LogOut,
  ShoppingCart,
  BarChart3,
  Mail,
  CreditCard,
  Compass,
  HelpCircle,
  Menu,
  Palette,
  Link2,
  ChevronDown,
  Users,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface SidebarProps {
  creatorSlug?: string
  displayName?: string
  avatarUrl?: string | null
}

export function AppSidebar({ creatorSlug, displayName, avatarUrl }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMobileMenuOpen(false)
    setProfileDropdownOpen(false)
  }, [pathname])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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

  const userName = displayName || creatorSlug || "User"

  const mainNavItems = [
    { href: "/app", label: "Home", icon: LayoutGrid },
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
    { href: "/explore", label: "Discover", icon: Compass },
  ]

  const NavItem = ({ item, onClick }: { item: (typeof mainNavItems)[0]; onClick?: () => void }) => {
    const Icon = item.icon
    const isActive = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href))

    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all duration-150",
          isActive
            ? "bg-[#f5f0ed] text-[#1a1a1a]"
            : "text-[#6b6b6b] hover:bg-[#f8f8f8] hover:text-[#1a1a1a]"
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
        <span>{item.label}</span>
      </Link>
    )
  }

  const ProfileDropdown = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div
      className={cn(
        "absolute left-3 right-3 top-[70px] z-50 overflow-hidden rounded-xl bg-white shadow-lg border border-[#f0f0f0] transition-all duration-200 ease-out",
        profileDropdownOpen
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 -translate-y-2 pointer-events-none"
      )}
      style={{
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)"
      }}
    >
      <div className="py-1.5">
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
              className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-[#4a4a4a] hover:bg-[#f8f8f8] transition-colors"
            >
              <Icon className="h-[16px] w-[16px] text-[#888]" strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          )
        })}
        <div className="my-1.5 mx-3 h-px bg-[#f0f0f0]" />
        <button
          onClick={() => {
            setProfileDropdownOpen(false)
            handleSignOut()
          }}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-[14px] text-[#e74c3c] hover:bg-[#fff5f5] transition-colors"
        >
          <LogOut className="h-[16px] w-[16px]" strokeWidth={1.8} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex h-full flex-col bg-[#fafafa]" ref={dropdownRef}>
      {/* Profile Section */}
      <div className="relative">
        <button
          onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
          className="flex w-full items-center gap-3 px-4 py-4 hover:bg-[#f5f5f5] transition-colors"
        >
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={avatarUrl || undefined} alt={userName} />
            <AvatarFallback className="bg-[#e8e4e1] text-[#6b6b6b] text-sm font-medium">
              {userName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 text-left text-[15px] font-medium text-[#1a1a1a] truncate">
            {userName}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[#888] transition-transform duration-200",
              profileDropdownOpen && "rotate-180"
            )}
            strokeWidth={2}
          />
        </button>
        <ProfileDropdown onItemClick={onItemClick} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2">
        <div className="space-y-0.5">
          {mainNavItems.map((item) => (
            <NavItem key={item.href} item={item} onClick={onItemClick} />
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="px-3 pb-4">
        {/* Upgrade to Pro Card */}
        <div className="mb-4 rounded-xl bg-[#f5f0ed] p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[14px] font-semibold text-[#1a1a1a]">Upgrade to Pro</p>
              <p className="text-[12px] text-[#888] mt-0.5">Unlock more benefits</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ede7e3]">
              <Zap className="h-4 w-4 text-[#7c6f64]" strokeWidth={2} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[16px] font-semibold text-[#1a1a1a] tracking-tight">storelib</span>
          <button className="p-1 hover:bg-[#f0f0f0] rounded-full transition-colors">
            <HelpCircle className="h-5 w-5 text-[#888]" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-[#f0f0f0] bg-[#fafafa] px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={avatarUrl || undefined} alt={userName} />
            <AvatarFallback className="bg-[#e8e4e1] text-[#6b6b6b] text-sm font-medium">
              {userName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-[15px] font-semibold text-[#1a1a1a]">{userName}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 hover:bg-[#f0f0f0]"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-[#1a1a1a]" />
        </Button>
      </header>

      {/* Mobile Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] max-w-[85vw] p-0 pt-[env(safe-area-inset-top)] border-none">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <SidebarContent onItemClick={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-svh w-64 flex-col border-r border-[#f0f0f0] bg-[#fafafa] md:flex">
        <SidebarContent />
      </aside>
    </>
  )
}
