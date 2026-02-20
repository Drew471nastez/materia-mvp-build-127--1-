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
  Link2,
  HelpCircle,
  Zap,
  ChevronDown,
  ChevronRight,
  Compass,
  Library,
  Bell,
  Home,
  Wallet,
  X,
  Store,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
// Sheet removed — mobile sidebar now uses pure CSS transitions for reliable close animation
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { NotificationsModal, NotificationBadge } from "./notifications-modal"
import { useLanguage } from "@/lib/i18n"

// Progress circle component for setup widget
function SetupProgressCircle({ progress, size = 32 }: { progress: number; size?: number }) {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  )
}

interface SidebarProps {
  creatorSlug?: string
  username?: string
  storePublished?: boolean
  avatarUrl?: string
  displayName?: string
  stripeConnected?: boolean
  stripeStatus?: string
  onePagePublished?: boolean
  setupProgress?: { completed: number; total: number }
}

const DISMISSED_NOTIFICATIONS_KEY = "storelib_dismissed_notifications"

function getDismissedNotifications(): string[] {
  if (typeof window === "undefined") return []
  try {
    const dismissed = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY)
    return dismissed ? JSON.parse(dismissed) : []
  } catch {
    return []
  }
}

export function AppSidebar({ creatorSlug, username, storePublished, avatarUrl, displayName, stripeConnected = false, stripeStatus = "not_connected", onePagePublished = false, setupProgress }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [mobileProfileDropdownOpen, setMobileProfileDropdownOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const mobileDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMobileMenuOpen(false)
    setProfileDropdownOpen(false)
    setMobileProfileDropdownOpen(false)
    setHeaderProfileOpen(false)
    setSearchOpen(false)
  }, [pathname])

  // Load dismissed notifications from localStorage
  useEffect(() => {
    setDismissedNotifications(getDismissedNotifications())
  }, [])

  // Re-check dismissed notifications when notifications modal closes
  useEffect(() => {
    if (!notificationsOpen) {
      setDismissedNotifications(getDismissedNotifications())
    }
  }, [notificationsOpen])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false)
      }
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(event.target as Node)) {
        setMobileProfileDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Calculate notification count (respecting dismissed notifications)
  let notificationCount = 0
  if ((!stripeConnected || stripeStatus !== "enabled") && !dismissedNotifications.includes("payment-setup")) notificationCount++
  if (!onePagePublished && !dismissedNotifications.includes("onepage-setup")) notificationCount++

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setMobileMenuOpen(false)
    setProfileDropdownOpen(false)
    router.push("/")
  }

  const mainNavItems = [
    { href: "/app", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/app/products", label: t("nav.products"), icon: Package },
    { href: "/app/analytics", label: t("nav.analytics"), icon: BarChart3 },
    { href: "/app/sales", label: t("nav.sales"), icon: ShoppingCart },
    { href: "/app/onepage", label: t("nav.onepage"), icon: Link2, forceNavigation: true },
    { href: "/store-builder", label: t("nav.storeBuilder"), icon: Store, forceNavigation: true },
    { href: "/app/emails", label: t("nav.emails"), icon: Mail },
    { href: "/app/payouts", label: t("nav.payouts"), icon: Wallet },
  ]

  const profileDropdownItems = [
    { href: "/app/settings", label: t("nav.settings"), icon: Settings },
    { href: "/app/settings/billing", label: t("settings.billing"), icon: CreditCard },
    { href: "/help", label: "Help", icon: HelpCircle },
    { href: "/explore", label: "Explore", icon: Compass, target: "_blank" as const },
    { href: "/library", label: "Library", icon: Library },
  ]

  // Optimize Supabase avatar URLs with render/image transform
  const optimizedAvatar = (size: number) => {
    if (!avatarUrl) return ""
    if (avatarUrl.includes("supabase.co/storage/")) {
      return avatarUrl.replace("/object/public/", "/render/image/public/") + `?width=${size}&height=${size}&resize=cover`
    }
    return avatarUrl
  }

  const storeUrl = username || creatorSlug
  const userDisplayName = displayName || username || creatorSlug || "User"
  const userInitials = userDisplayName.slice(0, 2).toUpperCase()

  // Light NavItem for desktop sidebar
  const NavItem = ({ item, onClick }: { item: (typeof mainNavItems)[0]; onClick?: () => void }) => {
    const Icon = item.icon
    const isActive = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href))

    const baseClassName = cn(
      "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-all duration-150 w-full text-left cursor-pointer",
      isActive
        ? "bg-neutral-200 text-neutral-900"
        : "text-neutral-600 hover:bg-neutral-100/50 hover:text-neutral-900",
    )

    // Use button for force navigation to ensure reliable click handling
    if (item.forceNavigation) {
      return (
        <button
          onClick={() => {
            onClick?.()
            window.location.href = item.href
          }}
          className={baseClassName}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
          <span>{item.label}</span>
        </button>
      )
    }

    return (
      <Link
        href={item.href}
        onClick={() => onClick?.()}
        className={baseClassName}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
        <span>{item.label}</span>
      </Link>
    )
  }

  // Dark NavItem for mobile sidebar (matches dark header)
  const MobileNavItem = ({ item, onClick }: { item: (typeof mainNavItems)[0]; onClick?: () => void }) => {
    const Icon = item.icon
    const isActive = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href))

    const baseClassName = cn(
      "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-all duration-150 w-full text-left cursor-pointer",
      isActive
        ? "bg-white/15 text-white"
        : "text-white/70 hover:bg-white/10 hover:text-white",
    )

    // Use button for force navigation to ensure reliable click handling
    if (item.forceNavigation) {
      return (
        <button
          onClick={() => {
            onClick?.()
            window.location.href = item.href
          }}
          className={baseClassName}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
          <span>{item.label}</span>
        </button>
      )
    }

    return (
      <Link
        href={item.href}
        onClick={() => onClick?.()}
        className={baseClassName}
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
          "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-all duration-200 ease-out cursor-pointer group",
          profileDropdownOpen ? "bg-neutral-100/80" : "hover:bg-neutral-100/70 active:bg-neutral-200/60",
        )}
      >
        <div
          className="relative h-10 w-10 shrink-0 rounded-full overflow-hidden"
          style={{
            transform: 'translateZ(0)',
            willChange: 'contents',
            contain: 'layout paint',
            isolation: 'isolate',
          }}
        >
          {/* Always render fallback behind */}
          <div className="absolute inset-0 bg-neutral-200 flex items-center justify-center text-neutral-600 text-sm font-medium">
            {userInitials}
          </div>
          {/* Image on top when available */}
          {avatarUrl && (
            <img
              src={optimizedAvatar(80)}
              alt={userDisplayName}
              width={40}
              height={40}
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              decoding="async"
              style={{ backfaceVisibility: 'hidden' }}
            />
          )}
        </div>
        <span className="flex-1 text-[14px] font-medium text-neutral-900 truncate">{userDisplayName}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-neutral-400 transition-transform duration-200 ease-out",
            profileDropdownOpen && "rotate-180",
          )}
        />
      </button>

      <div
        className={cn(
          "absolute left-0 right-0 top-full mt-1.5 z-50 origin-top",
          "transition-all ease-out",
          profileDropdownOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-[0.97] -translate-y-1 pointer-events-none"
        )}
        style={{ transitionDuration: '200ms', transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        <div className="rounded-xl border border-neutral-200/70 bg-white p-1 shadow-lg shadow-black/5">
          {profileDropdownItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                {...("target" in item ? { target: item.target, rel: "noopener noreferrer" } : {})}
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
            <span>{t("settings.signOut")}</span>
          </button>
        </div>
      </div>
    </div>
  )

  // Search modal state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{ label: string; href: string; icon: any; category: string }[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const headerProfileRef = useRef<HTMLDivElement>(null)
  const [headerProfileOpen, setHeaderProfileOpen] = useState(false)

  // Search shortcut items (pill buttons in modal)
  const searchShortcuts = [
    { label: "Dashboard", href: "/app", icon: LayoutDashboard },
    { label: "Products", href: "/app/products", icon: Package },
    { label: "Sales", href: "/app/sales", icon: ShoppingCart },
    { label: "Analytics", href: "/app/analytics", icon: BarChart3 },
    { label: "Payouts", href: "/app/payouts", icon: Wallet },
    { label: "Settings", href: "/app/settings", icon: Settings },
    { label: "Emails", href: "/app/emails", icon: Mail },
    { label: "OnePage", href: "/app/onepage", icon: Link2 },
    { label: "Payments", href: "/app/settings/payments", icon: CreditCard },
    { label: "Billing", href: "/app/settings/billing", icon: CreditCard },
  ]

  // All searchable items
  const allSearchItems = [
    { label: "Dashboard", href: "/app", icon: LayoutDashboard, category: "Pages" },
    { label: "Products", href: "/app/products", icon: Package, category: "Pages" },
    { label: "New Product", href: "/app/products/new", icon: Package, category: "Pages" },
    { label: "Analytics", href: "/app/analytics", icon: BarChart3, category: "Pages" },
    { label: "Sales", href: "/app/sales", icon: ShoppingCart, category: "Pages" },
    { label: "OnePage", href: "/app/onepage", icon: Link2, category: "Pages" },
    { label: "Store Builder", href: "/store-builder", icon: Store, category: "Pages" },
    { label: "Emails", href: "/app/emails", icon: Mail, category: "Pages" },
    { label: "Payouts", href: "/app/payouts", icon: Wallet, category: "Pages" },
    { label: "Settings", href: "/app/settings", icon: Settings, category: "Settings" },
    { label: "Billing", href: "/app/settings/billing", icon: CreditCard, category: "Settings" },
    { label: "Payment Methods", href: "/app/settings/billing", icon: CreditCard, category: "Settings" },
    { label: "Profile Settings", href: "/app/settings", icon: Settings, category: "Settings" },
    { label: "Orders", href: "/app/sales", icon: ShoppingCart, category: "Data" },
    { label: "Customers", href: "/app/sales", icon: ShoppingCart, category: "Data" },
    { label: "Customer Emails", href: "/app/sales", icon: Mail, category: "Data" },
    { label: "Email Subscribers", href: "/app/emails", icon: Mail, category: "Data" },
    { label: "Send Email", href: "/app/emails", icon: Mail, category: "Data" },
    { label: "Email Campaigns", href: "/app/emails", icon: Mail, category: "Data" },
    { label: "Revenue", href: "/app/payouts", icon: Wallet, category: "Data" },
    { label: "Traffic", href: "/app/analytics", icon: BarChart3, category: "Data" },
    { label: "Transactions", href: "/app/payouts", icon: Wallet, category: "Data" },
    { label: "Refunds", href: "/app/sales", icon: ShoppingCart, category: "Data" },
    { label: "Coupons", href: "/app/products", icon: Package, category: "Data" },
    { label: "Digital Downloads", href: "/app/products", icon: Package, category: "Data" },
    { label: "Explore", href: "/explore", icon: Compass, category: "Other" },
    { label: "Library", href: "/library", icon: Library, category: "Other" },
    { label: "Help", href: "/help", icon: HelpCircle, category: "Other" },
    { label: "Upgrade to Pro", href: "/upgrade", icon: Zap, category: "Other" },
  ]

  // Search handler
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const q = query.toLowerCase()
    const results = allSearchItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.href.toLowerCase().includes(q)
    )
    setSearchResults(results)
  }, [])

  // Focus search input when modal opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    } else {
      setSearchQuery("")
      setSearchResults([])
    }
  }, [searchOpen])

  // Keyboard shortcut: Cmd/Ctrl+K opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [searchOpen])

  // Close header profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (headerProfileRef.current && !headerProfileRef.current.contains(event.target as Node)) {
        setHeaderProfileOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Check if we should show setup widget (hide on store-builder, onepage, and new product page)
  const showSetupWidget = setupProgress &&
    setupProgress.completed < setupProgress.total &&
    !pathname.startsWith("/store-builder") &&
    !pathname.startsWith("/app/onepage") &&
    !pathname.startsWith("/app/products/new")

  const setupProgressPercent = setupProgress ? Math.round((setupProgress.completed / setupProgress.total) * 100) : 0

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex h-full flex-col bg-[#FAFAFA]">
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

      <div className="px-3 pb-3 space-y-2">
        <Link
          href="/upgrade"
          onClick={onItemClick}
          className="group flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-50/80 to-purple-50/80 border border-violet-100/60 px-3.5 py-3 transition-all duration-150 hover:from-violet-100/80 hover:to-purple-100/80"
        >
          <div>
            <p className="text-[13px] font-semibold text-neutral-900">{t("nav.upgradeToPro")}</p>
            <p className="text-[11px] text-neutral-600">{t("nav.unlockBenefits")}</p>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
            <Zap className="h-3.5 w-3.5 text-violet-500 fill-violet-500" strokeWidth={2} />
          </div>
        </Link>

        <Link
          href="/app/settings"
          onClick={onItemClick}
          className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium text-neutral-600 hover:bg-neutral-100/50 hover:text-neutral-900 transition-all duration-150 w-full"
        >
          <Settings className="h-5 w-5" strokeWidth={1.5} />
          <span>{t("nav.settings")}</span>
        </Link>
      </div>
    </div>
  )

  // Mobile sidebar content with white UI theme (positioned below dark header)
  const MobileSidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex h-full flex-col bg-white">
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

        {/* Setup Progress Section for Mobile sidebar - always shown when incomplete */}
        {setupProgress && setupProgress.completed < setupProgress.total && !pathname.startsWith("/app/emails") && (
          <button
            onClick={() => {
              onItemClick?.()
              if (pathname === "/app") {
                const setupSection = document.getElementById("store-setup-section")
                setupSection?.scrollIntoView({ behavior: "smooth", block: "start" })
              } else {
                router.push("/app")
                setTimeout(() => {
                  const setupSection = document.getElementById("store-setup-section")
                  setupSection?.scrollIntoView({ behavior: "smooth", block: "start" })
                }, 100)
              }
            }}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100/60 p-3 text-left transition-all hover:from-violet-100/80 hover:to-purple-100/80"
          >
            <div className="flex items-center gap-3">
              <div className="relative shrink-0 w-10 h-10">
                <SetupProgressCircle progress={setupProgressPercent} size={40} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-violet-600">{setupProgressPercent}%</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-neutral-900">Store Setup</p>
                <p className="text-[11px] text-neutral-500">{setupProgress.completed} of {setupProgress.total} steps complete</p>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
            </div>
          </button>
        )}
      </nav>

      <div className="px-3 pb-3">
        <Link
          href="/upgrade"
          onClick={onItemClick}
          className="group flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-50/80 to-purple-50/80 border border-violet-100/60 px-3.5 py-3 transition-all duration-150 hover:from-violet-100/80 hover:to-purple-100/80"
        >
          <div>
            <p className="text-[13px] font-semibold text-neutral-900">{t("nav.upgradeToPro")}</p>
            <p className="text-[11px] text-neutral-600">{t("nav.unlockBenefits")}</p>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
            <Zap className="h-3.5 w-3.5 text-violet-500 fill-violet-500" strokeWidth={2} />
          </div>
        </Link>
      </div>

      <div className="border-t border-neutral-200/50 px-4 py-[15px]">
        <div className="flex items-center justify-between">
          <Link
            href="/explore"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onItemClick}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img
              src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"
              alt="Storelib"
              className="h-8 w-8"
            />
            <span className="text-[17px] font-semibold text-neutral-900">Storelib</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <Link
              href="/explore"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onItemClick}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors cursor-pointer"
            >
              <Compass className="h-[19px] w-[19px]" strokeWidth={1.5} />
            </Link>
            <Link
              href="/app/settings"
              onClick={onItemClick}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors cursor-pointer"
            >
              <Settings className="h-[19px] w-[19px]" strokeWidth={1.5} />
            </Link>
          </div>
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
        /* Dark scrollbar for mobile sidebar */
        .sidebar-nav-dark:hover {
          scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        }
        .sidebar-nav-dark:hover::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.2);
        }
        .sidebar-nav-dark::-webkit-scrollbar-thumb:hover {
          background-color: rgba(255, 255, 255, 0.3);
        }
      `}</style>

      {/* Desktop Header Bar — dark bar with concave bottom corners */}
      <header className="fixed top-0 left-0 right-0 z-50 hidden md:block">
        <div className="relative h-[58px] bg-[#131316] flex items-center px-5">
          {/* Left side: Profile dropdown */}
          <div ref={headerProfileRef} className="relative shrink-0">
            <button
              onClick={() => setHeaderProfileOpen(!headerProfileOpen)}
              className={cn(
                "flex items-center gap-2.5 rounded-full px-2.5 py-1.5 transition-all duration-200 ease-out",
                headerProfileOpen ? "bg-white/15" : "hover:bg-white/10"
              )}
            >
              <div
                className="relative h-7 w-7 shrink-0 rounded-full ring-1 ring-white/20 overflow-hidden"
                style={{
                  transform: 'translateZ(0)',
                  willChange: 'contents',
                  contain: 'layout paint',
                  isolation: 'isolate',
                }}
              >
                <div className="absolute inset-0 bg-neutral-700 flex items-center justify-center text-white text-[10px] font-medium">
                  {userInitials}
                </div>
                {avatarUrl && (
                  <img
                    src={optimizedAvatar(56)}
                    alt={userDisplayName}
                    width={28}
                    height={28}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="eager"
                    decoding="async"
                    style={{ backfaceVisibility: 'hidden' }}
                  />
                )}
              </div>
              <span className="text-[13px] font-medium text-white/90 max-w-[140px] truncate">
                {userDisplayName}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-white/50 transition-transform duration-200 ease-out",
                  headerProfileOpen && "rotate-180"
                )}
              />
            </button>

            {/* Header Profile Dropdown */}
            <div
              className={cn(
                "absolute left-0 top-full mt-2 z-[60] min-w-[200px] transition-all duration-200 ease-out origin-top-left",
                headerProfileOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
              )}
            >
              <div className="rounded-xl border border-neutral-200/70 bg-white p-1 shadow-xl shadow-black/10">
                {profileDropdownItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      {...("target" in item ? { target: item.target, rel: "noopener noreferrer" } : {})}
                      onClick={() => setHeaderProfileOpen(false)}
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
                    setHeaderProfileOpen(false)
                    handleSignOut()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span>{t("settings.signOut")}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Center: Search bar */}
          <div className="flex-1 flex justify-center px-6 relative" id="desktop-search-container">
            <button
              onClick={() => setSearchOpen(true)}
              className={cn(
                "flex items-center gap-2.5 w-full max-w-[480px] h-[36px] rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-4 transition-all cursor-text",
                searchOpen && "opacity-0 pointer-events-none"
              )}
            >
              <Search className="h-4 w-4 text-white/40 shrink-0" />
              <span className="text-[13px] text-white/40 flex-1 text-left">Search...</span>
              <kbd className="hidden lg:flex items-center gap-0.5 text-[11px] text-white/30 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                <span className="text-[10px]">⌘</span>K
              </kbd>
            </button>
          </div>

          {/* Right side: Nav icons + Storelib logo */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-1.5">
              <Link
                href="/explore"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all"
                title="Discover"
              >
                <Compass className="h-[19px] w-[19px]" strokeWidth={1.5} />
              </Link>
              <button
                onClick={() => setNotificationsOpen(true)}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all relative"
                title="Notifications"
              >
                <Bell className="h-[19px] w-[19px]" strokeWidth={1.5} />
                <NotificationBadge count={notificationCount} />
              </button>
              <Link
                href="/app/settings"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all"
                title="Settings"
              >
                <Settings className="h-[19px] w-[19px]" strokeWidth={1.5} />
              </Link>
            </div>

            <div className="h-5 w-px bg-white/15" />

            <Link href="/app" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity shrink-0">
              <img
                src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"
                alt="Storelib"
                className="h-7 w-7"
              />
              <span className="text-[15px] font-semibold text-white">Storelib</span>
            </Link>
          </div>
        </div>

        {/* Concave bottom corners - SVG curves on left and right */}
        <div className="relative h-3 pointer-events-none" style={{ marginTop: "-1px" }}>
          {/* Left concave corner */}
          <svg className="absolute left-0 top-0 h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M12 0H0v12C0 5.373 5.373 0 12 0Z" fill="#131316" />
          </svg>
          {/* Right concave corner */}
          <svg className="absolute right-0 top-0 h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M0 0h12v12C12 5.373 6.627 0 0 0Z" fill="#131316" />
          </svg>
        </div>
      </header>

      {/* Search Modal — morphs from search bar position */}
      <div
        className={cn(
          "fixed inset-0 z-[100] bg-black/20 hidden md:block transition-opacity duration-200",
          searchOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSearchOpen(false)}
      />
      <div
        className={cn(
          "fixed z-[101] hidden md:block left-1/2 -translate-x-1/2 w-full max-w-[560px] transition-all duration-250",
          searchOpen
            ? "top-[10px] opacity-100 scale-100 pointer-events-auto"
            : "top-[10px] opacity-0 scale-[0.97] -translate-y-1 pointer-events-none"
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-neutral-200/70 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100">
            <Search className="h-5 w-5 text-neutral-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search pages, settings, data..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="flex-1 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none bg-transparent"
            />
            <button
              onClick={() => setSearchOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 hover:bg-neutral-200 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-neutral-500" />
            </button>
          </div>

          {/* Default: Shortcut Pills */}
          {!searchQuery.trim() && searchOpen && (
            <div className="px-5 py-4">
              <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider mb-3">Quick Navigation</p>
              <div className="flex flex-wrap gap-2">
                {searchShortcuts.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.href}
                      onClick={() => {
                        setSearchOpen(false)
                        if (item.href.startsWith("/store-builder") || item.href.startsWith("/app/onepage")) {
                          window.location.href = item.href
                        } else {
                          router.push(item.href)
                        }
                      }}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/60 text-[13px] font-medium text-neutral-700 hover:text-neutral-900 transition-all"
                    >
                      <Icon className="h-3.5 w-3.5 text-neutral-500" strokeWidth={1.5} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Search Results */}
          {searchQuery.trim() && searchOpen && (
            <div className="max-h-[340px] overflow-y-auto">
              {searchResults.length > 0 ? (
                <div className="py-2">
                  {Object.entries(
                    searchResults.reduce((acc, item) => {
                      if (!acc[item.category]) acc[item.category] = []
                      acc[item.category].push(item)
                      return acc
                    }, {} as Record<string, typeof searchResults>)
                  ).map(([category, items]) => (
                    <div key={category}>
                      <p className="px-5 py-1.5 text-[11px] font-medium text-neutral-400 uppercase tracking-wider">{category}</p>
                      {items.map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            key={item.href + item.label}
                            onClick={() => {
                              setSearchOpen(false)
                              if (item.href.startsWith("/store-builder") || item.href.startsWith("/app/onepage")) {
                                window.location.href = item.href
                              } else {
                                router.push(item.href)
                              }
                            }}
                            className="flex items-center gap-3 w-full px-5 py-2.5 hover:bg-neutral-50 transition-colors text-left"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100">
                              <Icon className="h-4 w-4 text-neutral-600" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-neutral-900 truncate">{item.label}</p>
                              <p className="text-[11px] text-neutral-400 truncate">{item.href}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-neutral-300 shrink-0" />
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-[13px] text-neutral-400">No results for &quot;{searchQuery}&quot;</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Header - Dark background, content below has outward rounded top corners */}
      <header className="fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] md:hidden bg-[#111111]">
        <div className="flex h-[68px] items-center justify-between px-4 py-[10px]">
          {/* Left side: Hamburger */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl text-white/90 hover:text-white hover:bg-white/10 transition-all duration-200 ease-out active:scale-95"
              onClick={() => {
                if (mobileProfileDropdownOpen) {
                  setMobileProfileDropdownOpen(false)
                }
                setMobileMenuOpen(!mobileMenuOpen)
              }}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                <span
                  className={cn(
                    "absolute h-[2px] w-5 bg-current rounded-full transition-all duration-300 ease-out",
                    mobileMenuOpen ? "rotate-45 top-[9px]" : "rotate-0 top-[4px]"
                  )}
                />
                <span
                  className={cn(
                    "absolute h-[2px] w-5 bg-current rounded-full top-[9px] transition-all duration-300 ease-out",
                    mobileMenuOpen ? "opacity-0 scale-x-0" : "opacity-100 scale-x-100"
                  )}
                />
                <span
                  className={cn(
                    "absolute h-[2px] w-5 bg-current rounded-full transition-all duration-300 ease-out",
                    mobileMenuOpen ? "-rotate-45 top-[9px]" : "rotate-0 top-[14px]"
                  )}
                />
              </div>
            </Button>
          </div>

          {/* Profile - positioned left near hamburger */}
          <div ref={mobileDropdownRef} className="relative flex-1 ml-1 z-[60]">
            <button
              onClick={() => {
                if (mobileMenuOpen) {
                  setMobileMenuOpen(false)
                }
                setMobileProfileDropdownOpen(!mobileProfileDropdownOpen)
              }}
              className={cn(
                "flex items-center gap-2 w-fit justify-start rounded-xl px-2 py-1.5 transition-all duration-200 ease-out",
                mobileProfileDropdownOpen ? "bg-white/15" : "hover:bg-white/10"
              )}
            >
              <div
                className="relative h-6 w-6 shrink-0 rounded-full ring-1 ring-white/20 overflow-hidden"
                style={{
                  transform: 'translateZ(0)',
                  willChange: 'contents',
                  contain: 'layout paint',
                  isolation: 'isolate',
                }}
              >
                {/* Always render fallback behind */}
                <div className="absolute inset-0 bg-neutral-700 flex items-center justify-center text-white text-[10px] font-medium">
                  {userInitials}
                </div>
                {/* Image on top when available */}
                {avatarUrl && (
                  <img
                    src={optimizedAvatar(48)}
                    alt={userDisplayName}
                    width={24}
                    height={24}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="eager"
                    decoding="async"
                    style={{ backfaceVisibility: 'hidden' }}
                  />
                )}
              </div>
              <span className="text-[13px] font-medium text-white/90 max-w-[120px] truncate">
                {userDisplayName}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-white/50 transition-transform duration-200 ease-out",
                  mobileProfileDropdownOpen && "rotate-180"
                )}
              />
            </button>

            {/* Mobile Profile Dropdown Menu */}
            <div
              className={cn(
                "absolute left-0 top-full mt-2 z-[60] min-w-[200px] transition-all duration-200 ease-out origin-top-left",
                mobileProfileDropdownOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
              )}
            >
              <div className="rounded-xl border border-neutral-200/70 bg-white p-1 shadow-xl shadow-black/10">
                {profileDropdownItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileProfileDropdownOpen(false)}
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
                    setMobileProfileDropdownOpen(false)
                    handleSignOut()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right side: Notifications + Home */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl text-white/90 hover:text-white hover:bg-white/10 relative"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <NotificationBadge count={notificationCount} />
            </Button>
            <Link href="/app">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-xl text-white/90 hover:text-white hover:bg-white/10"
                aria-label="Home"
              >
                <Home className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Notifications Modal */}
      <NotificationsModal
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        stripeConnected={stripeConnected}
        stripeStatus={stripeStatus}
        onePagePublished={onePagePublished}
      />

      {/* Custom Mobile Sidebar — pure CSS transitions for smooth open AND close */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden bg-black/50",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        style={{
          top: 'calc(68px + env(safe-area-inset-top))',
          transitionProperty: 'opacity',
          transitionDuration: '300ms',
          transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
      <div
        className="fixed z-50 md:hidden w-[260px] max-w-[85vw] bg-white shadow-xl border-r border-neutral-200/50"
        style={{
          top: 'calc(68px + env(safe-area-inset-top))',
          bottom: 0,
          left: 0,
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
          transitionProperty: 'transform',
          transitionDuration: '300ms',
          transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation Menu"
      >
        <MobileSidebarContent onItemClick={() => setMobileMenuOpen(false)} />
      </div>

      <aside className="fixed left-0 top-[58px] z-40 hidden w-[220px] flex-col border-r border-neutral-200/50 md:flex" style={{ height: 'calc(100svh - 58px)' }}>
        <SidebarContent />
      </aside>

      {/* Floating Setup Progress Circle - hidden on mobile for settings and emails pages */}
      {showSetupWidget && !mobileMenuOpen && (
        <button
          onClick={() => {
            // Navigate to dashboard and smooth scroll to setup section
            if (pathname === "/app") {
              // Already on dashboard, just scroll
              const setupSection = document.getElementById("store-setup-section")
              setupSection?.scrollIntoView({ behavior: "smooth", block: "start" })
            } else {
              // Navigate to dashboard then scroll
              router.push("/app")
              // Wait for navigation and scroll
              setTimeout(() => {
                const setupSection = document.getElementById("store-setup-section")
                setupSection?.scrollIntoView({ behavior: "smooth", block: "start" })
              }, 100)
            }
          }}
          className={cn(
            "fixed bottom-6 right-4 md:right-6 z-40 hidden md:flex items-center gap-2 bg-white rounded-full pl-2 pr-3 py-2 md:pl-2.5 md:pr-4 md:py-2.5 shadow-lg border border-neutral-200/70 transition-all duration-200 hover:shadow-xl hover:scale-105 active:scale-95",
            (pathname.startsWith("/app/settings") || pathname.startsWith("/app/emails") || pathname.startsWith("/app/payouts") || pathname.startsWith("/app/analytics")) && "!hidden"
          )}
        >
          <div className="relative shrink-0 w-8 h-8 md:w-[37px] md:h-[37px]">
            <div className="md:hidden">
              <SetupProgressCircle progress={setupProgressPercent} size={32} />
            </div>
            <div className="hidden md:block">
              <SetupProgressCircle progress={setupProgressPercent} size={37} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[8px] md:text-[9px] font-bold text-violet-600">{setupProgressPercent}%</span>
            </div>
          </div>
          <span className="text-[11px] md:text-[12px] font-semibold text-neutral-700 whitespace-nowrap">Setup</span>
        </button>
      )}
    </>
  )
}
