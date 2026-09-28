"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { UserNavClient } from "./user-nav-client"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Heart,
  Menu,
  Layers,
  Sparkles,
  Code,
  Megaphone,
  Briefcase,
  GraduationCap,
  Music,
  Film,
  BookOpen,
  Palette,
  Camera,
  PenTool,
  FileText,
  Zap,
  Users,
  Star,
  Type,
  Image as ImageIcon,
  Scissors,
  Cpu,
  Printer,
  ChevronDown
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Main categories for megamenu
const MAIN_CATEGORIES = [
  { id: "all", label: "All Products", icon: Layers, href: "/explore" },
  { id: "design", label: "Design", icon: Sparkles, href: "/explore?category=design" },
  { id: "development", label: "Development", icon: Code, href: "/explore?category=development" },
  { id: "marketing", label: "Marketing", icon: Megaphone, href: "/explore?category=marketing" },
  { id: "business", label: "Business & Money", icon: Briefcase, href: "/explore?category=business" },
  { id: "education", label: "Education", icon: GraduationCap, href: "/explore?category=education" },
]

// Popular subcategories for megamenu
const POPULAR_SUBCATEGORIES = [
  { label: "Templates", icon: FileText, href: "/explore?q=templates" },
  { label: "Courses", icon: BookOpen, href: "/explore?q=courses" },
  { label: "Graphics", icon: Palette, href: "/explore?q=graphics" },
  { label: "Photography", icon: Camera, href: "/explore?q=photography" },
  { label: "UI Kits", icon: PenTool, href: "/explore?q=ui+kits" },
  { label: "Music", icon: Music, href: "/explore?q=music" },
  { label: "Video", icon: Film, href: "/explore?q=video" },
  { label: "eBooks", icon: BookOpen, href: "/explore?q=ebooks" },
]

// Discover/Extras for megamenu
const EXTRAS = [
  { label: "Trending", icon: Zap, href: "/explore" },
  { label: "Top Creators", icon: Users, href: "/explore" },
  { label: "New Releases", icon: Star, href: "/explore" },
]

// Secondary nav categories (shown under header)
const SECONDARY_NAV_CATEGORIES = [
  { label: "Fonts", icon: Type, href: "/explore?q=fonts" },
  { label: "Images", icon: ImageIcon, href: "/explore?q=images" },
  { label: "Paper Crafts", icon: Scissors, href: "/explore?q=paper+crafts" },
  { label: "Needlework", icon: PenTool, href: "/explore?q=needlework" },
  { label: "Laser Cutting", icon: Cpu, href: "/explore?q=laser+cutting" },
  { label: "3D Printing", icon: Printer, href: "/explore?q=3d+printing" },
]

export function MarketingHeaderClient() {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [creatorSlug, setCreatorSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(null)

  // Logo always links to /explore
  const logoLink = '/explore'

  useEffect(() => {
    const supabase = createClient()

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setUser(user)

        // profiles.avatar_url is the single source of truth for avatar.
        // Both /app/settings and Store Builder sync avatar changes to this field.
        const { data: profileData } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, username, is_creator")
          .eq("id", user.id)
          .single()

        // Check creator record for onboarding_completed (source of truth for seller status)
        const { data: creatorData } = await supabase
          .from("creators")
          .select("slug, onboarding_completed")
          .eq("user_id", user.id)
          .maybeSingle()

        const isSeller = !!creatorData?.onboarding_completed

        /* The profile's photo only (lib/account/avatar): no Google fallback. */
        const finalAvatar = profileData?.avatar_url || null

        setProfile(profileData)
        setIsCreator(isSeller)
        setResolvedAvatarUrl(finalAvatar)
        setCreatorSlug(creatorData?.slug || profileData?.username || null)
      }
      setLoading(false)
    }

    loadUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUser()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('[data-categories-dropdown]')) {
        setCategoriesOpen(false)
      }
    }

    if (categoriesOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [categoriesOpen])

  return (
    <div className="relative z-40 w-full bg-black backdrop-blur supports-[backdrop-filter]:bg-black pt-[env(safe-area-inset-top)]">
      {/* Main Header Row */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 gap-4">
          {/* Left side - Logo and Categories Button */}
          <div className="flex items-center gap-4 shrink-0">
            {/* Logo - 30% bigger (~2.6rem from 2rem) */}
            <Link href={logoLink} className="flex items-center gap-2 shrink-0">
              <span className="text-[2.6rem] font-bold tracking-tight leading-none text-white">Storelib</span>
            </Link>

            {/* Categories Dropdown Button */}
            <div className="relative" data-categories-dropdown>
              <button
                onClick={() => setCategoriesOpen(!categoriesOpen)}
                className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                  categoriesOpen
                    ? "bg-white/15 text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Menu className="w-4 h-4" />
                <span>Categories</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${categoriesOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Megamenu Dropdown */}
              {categoriesOpen && (
                <div className="absolute top-full left-0 mt-2 w-[640px] bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200 z-50">
                  <div className="grid grid-cols-3 divide-x divide-neutral-100">
                    {/* Browse Column */}
                    <div className="p-5">
                      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                        Browse
                      </div>
                      <div className="space-y-1">
                        {MAIN_CATEGORIES.map((category) => {
                          const Icon = category.icon
                          return (
                            <Link
                              key={category.id}
                              href={category.href}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
                              onClick={() => setCategoriesOpen(false)}
                            >
                              <Icon className="w-5 h-5 text-neutral-500" />
                              <span className="font-medium">{category.label}</span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>

                    {/* Popular Column */}
                    <div className="p-5">
                      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                        Most Popular
                      </div>
                      <div className="space-y-1">
                        {POPULAR_SUBCATEGORIES.map((item) => {
                          const Icon = item.icon
                          return (
                            <Link
                              key={item.label}
                              href={item.href}
                              className="flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors cursor-pointer"
                              onClick={() => setCategoriesOpen(false)}
                            >
                              <Icon className="w-4 h-4 text-neutral-400" />
                              <span className="text-sm">{item.label}</span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>

                    {/* Extras Column */}
                    <div className="p-5 bg-neutral-50/50">
                      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                        Discover
                      </div>
                      <div className="space-y-1">
                        {EXTRAS.map((item) => {
                          const Icon = item.icon
                          return (
                            <Link
                              key={item.label}
                              href={item.href}
                              className="flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-600 hover:bg-white hover:text-neutral-900 transition-colors cursor-pointer"
                              onClick={() => setCategoriesOpen(false)}
                            >
                              <Icon className="w-4 h-4 text-violet-500" />
                              <span className="text-sm font-medium">{item.label}</span>
                            </Link>
                          )
                        })}
                      </div>

                      {/* View All Link */}
                      <div className="mt-6 pt-4 border-t border-neutral-200">
                        <Link
                          href="/explore"
                          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer"
                          onClick={() => setCategoriesOpen(false)}
                        >
                          View all categories
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {loading ? (
              <>
                <Skeleton className="w-10 h-10 rounded-full" />
                <Skeleton className="hidden sm:block w-20 h-9 rounded-lg" />
                <Skeleton className="w-20 h-9 rounded-lg" />
              </>
            ) : (
              <>
                {/* Wishlist Heart */}
                {user && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/library"
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all duration-150 cursor-pointer"
                      >
                        <Heart className="w-5 h-5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1">
                      Wishlist
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Library link */}
                {user && (
                  <Link
                    href="/library"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Library</span>
                  </Link>
                )}

                {/* Dashboard button for sellers, Library for buyers */}
                {user && isCreator ? (
                  <Button size="sm" asChild className="bg-violet-600 hover:bg-violet-700">
                    <Link href="/app">Dashboard</Link>
                  </Button>
                ) : user ? (
                  <Button size="sm" asChild className="bg-violet-600 hover:bg-violet-700">
                    <Link href="/library">Library</Link>
                  </Button>
                ) : null}

                {user && profile ? (
                  <UserNavClient user={user} profile={{...profile, avatar_url: resolvedAvatarUrl || profile?.avatar_url}} isCreator={isCreator} creatorSlug={creatorSlug} />
                ) : (
                  <>
                    <Button variant="ghost" size="sm" asChild className="text-white/80 hover:text-white hover:bg-white/10">
                      <Link href="/login">Sign in</Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href="/signup" className="whitespace-nowrap">
                        Sign up
                      </Link>
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Secondary Navigation Row - Category Links (left-aligned with logo/content) */}
      <nav className="border-b border-white/10 bg-black">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-start gap-6 py-2.5 overflow-x-auto scrollbar-hide">
            {SECONDARY_NAV_CATEGORIES.map((category, index) => {
              const Icon = category.icon
              return (
                <Link
                  key={category.label}
                  href={category.href}
                  className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white whitespace-nowrap transition-colors cursor-pointer"
                >
                  {/* Show icon only on first category (Fonts) */}
                  {index === 0 && <Icon className="w-4 h-4 text-white/50" />}
                  <span>{category.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>
    </div>
  )
}
