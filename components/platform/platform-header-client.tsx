"use client"

import type React from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { Heart, Library, Search, LayoutDashboard, Settings, LogOut, Menu, ChevronDown, Type, X, Loader2, Bell } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

const LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/storelib.svg"

const DEFAULT_CATEGORIES = [
  "Fonts",
  "Images",
  "Paper Crafts",
  "Needlework",
  "Laser Cutting",
  "3D Printing",
]

// Search modal categories - expanded list
const SEARCH_CATEGORIES = [
  { label: "Design", href: "/explore?category=design" },
  { label: "Development", href: "/explore?category=development" },
  { label: "Marketing", href: "/explore?category=marketing" },
  { label: "Business", href: "/explore?category=business" },
  { label: "Education", href: "/explore?category=education" },
  { label: "Music & Audio", href: "/explore?category=music" },
  { label: "Photography", href: "/explore?category=photography" },
  { label: "Writing", href: "/explore?category=writing" },
  { label: "Video & Film", href: "/explore?category=video" },
]

// Product type for search results
type SearchProduct = {
  id: string
  title: string
  slug: string
  thumbnail_url?: string
  price_cents: number
  creator?: {
    display_name?: string
    slug?: string
  }
}

type Profile = {
  display_name?: string | null
  avatar_url?: string | null
  username?: string | null
  is_creator?: boolean | null
}

export function PlatformHeaderClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t } = useLocale()

  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isCreator, setIsCreator] = useState(false)
  // Start with false to avoid skeleton flash - only show skeleton on true initial load
  const [loading, setLoading] = useState(false)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [wishlistCount, setWishlistCount] = useState(0)

  const mountedRef = useRef(true)

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "")
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "")
  }, [searchParams])

  // Close modals on route change
  useEffect(() => {
    setSearchModalOpen(false)
    setCategoriesDropdownOpen(false)
    setMobileMenuOpen(false)
  }, [pathname])

  // Close categories dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-categories-dropdown]')) {
        setCategoriesDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Live search with debounce
  const handleSearchChange = useCallback((value: string) => {
    setQuery(value)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (value.trim().length < 1) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("products")
          .select(`
            id,
            title,
            slug,
            thumbnail_url,
            price_cents,
            creator_id,
            creators!inner (
              display_name,
              slug
            )
          `)
          .ilike("title", `%${value}%`)
          .eq("status", "published")
          .limit(8)

        if (!error && data) {
          const results = data.map((p: any) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            thumbnail_url: p.thumbnail_url,
            price_cents: p.price_cents,
            creator: p.creators ? {
              display_name: p.creators.display_name,
              slug: p.creators.slug,
            } : undefined,
          }))
          setSearchResults(results)
        }
      } catch (err) {
        console.error("Search error:", err)
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }, [])

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const fetchWishlistCount = useCallback(async () => {
    try {
      const guestId = typeof localStorage !== "undefined" ? localStorage.getItem("materia_guest_id") : null
      const url = guestId ? `/api/wishlist?guestId=${encodeURIComponent(guestId)}` : "/api/wishlist"

      const res = await fetch(url, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        setWishlistCount(data.count || data.items?.length || 0)
      }
    } catch (err) {
      console.error("[v0] Failed to fetch wishlist count:", err)
    }
  }, [])

  useEffect(() => {
    fetchWishlistCount()
  }, [fetchWishlistCount])

  useEffect(() => {
    const handleWishlistUpdate = (event: CustomEvent) => {
      if (typeof event.detail?.count === "number") {
        setWishlistCount(event.detail.count)
      } else {
        fetchWishlistCount()
      }
    }

    window.addEventListener("wishlist-updated", handleWishlistUpdate as EventListener)
    return () => window.removeEventListener("wishlist-updated", handleWishlistUpdate as EventListener)
  }, [fetchWishlistCount])

  useEffect(() => {
    mountedRef.current = true
    const supabase = createClient()

    const failSafe = window.setTimeout(() => {
      if (!mountedRef.current) return
      setLoading(false)
      setInitialLoadDone(true)
    }, 2500)

    const loadUser = async (isInitial = false) => {
      try {
        if (!mountedRef.current) return
        // Only show loading skeleton on initial load, not on auth state changes
        if (isInitial && !initialLoadDone) {
          setLoading(true)
        }

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (error || !user) {
          if (!mountedRef.current) return
          setUser(null)
          setProfile(null)
          setIsCreator(false)
          return
        }

        if (!mountedRef.current) return
        setUser(user)

        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, username, is_creator")
          .eq("id", user.id)
          .single()

        if (!mountedRef.current) return
        if (profileErr) {
          setProfile(null)
          setIsCreator(false)
        } else {
          setProfile((profileData as Profile) ?? null)
          setIsCreator(!!profileData?.is_creator)
        }
      } catch {
        if (!mountedRef.current) return
        setUser(null)
        setProfile(null)
        setIsCreator(false)
      } finally {
        if (!mountedRef.current) return
        setLoading(false)
        setInitialLoadDone(true)
      }
    }

    loadUser(true)

    const { data } = supabase.auth.onAuthStateChange(() => {
      loadUser(false)
      fetchWishlistCount()
    })

    return () => {
      mountedRef.current = false
      window.clearTimeout(failSafe)
      data?.subscription?.unsubscribe()
    }
  }, [fetchWishlistCount, initialLoadDone])

  const startSellingHref = useMemo(() => {
    if (!user) return "/signup"
    return isCreator ? "/app" : "/onboarding"
  }, [user, isCreator])

  const dashboardHref = useMemo(() => {
    if (!user) return "/signup"
    return isCreator ? "/app" : "/dashboard"
  }, [user, isCreator])

  const wishlistHref = useMemo(() => {
    return user ? "/library/wishlist" : "/wishlist"
  }, [user])

  const avatarUrl =
    profile?.avatar_url ||
    ((user?.user_metadata as any)?.avatar_url as string | undefined) ||
    ((user?.user_metadata as any)?.picture as string | undefined)

  const displayName =
    profile?.display_name ||
    profile?.username ||
    ((user?.user_metadata as any)?.full_name as string | undefined) ||
    (user?.email ? user.email.split("@")[0] : "User")

  const initials = (displayName || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("")

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed) {
      router.push(`/explore?q=${encodeURIComponent(trimmed)}`)
    } else {
      router.push("/explore")
    }
  }

  const onCategoryClick = (cat: string) => {
    router.push(`/explore?category=${encodeURIComponent(cat)}`)
  }

  const showCategories = pathname === "/explore" || pathname.startsWith("/explore")

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 rounded-t-[14px] md:rounded-none">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-[68px] md:h-16 items-center justify-between gap-4">
          {/* Left side - Logo and Categories Button */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Logo - 40% bigger */}
            <Link href="/" className="shrink-0">
              <Image
                src={LOGO_URL || "/placeholder.svg"}
                alt="Storelib"
                width={183}
                height={62}
                className="h-[57px] w-auto"
                priority
              />
            </Link>

            {/* Categories Dropdown Button */}
            <div className="relative hidden sm:block" data-categories-dropdown>
              <button
                onClick={() => setCategoriesDropdownOpen(!categoriesDropdownOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                  categoriesDropdownOpen
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Menu className="w-4 h-4" />
                <span>Categories</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${categoriesDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Categories Megamenu Dropdown */}
              {categoriesDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-[280px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200 z-50">
                  <div className="p-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Browse Categories</h3>
                    <div className="space-y-0.5">
                      {SEARCH_CATEGORIES.map((cat) => (
                        <Link
                          key={cat.label}
                          href={cat.href}
                          onClick={() => setCategoriesDropdownOpen(false)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
                        >
                          {cat.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Desktop Search - Centered with Modal */}
          <div className="hidden md:flex flex-1 max-w-xl mx-4 relative">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setSearchModalOpen(true)}
                placeholder={t("search_placeholder")}
                className="h-10 w-full rounded-full pl-10 pr-4 bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:border-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    setSearchResults([])
                    searchInputRef.current?.focus()
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search Modal Dropdown */}
            {searchModalOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setSearchModalOpen(false)}
                />
                {/* Modal */}
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200 z-50 max-h-[70vh] overflow-y-auto">
                  {/* Categories Section */}
                  {!query && (
                    <div className="p-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Categories</h3>
                      <div className="flex flex-wrap gap-2">
                        {SEARCH_CATEGORIES.map((cat) => (
                          <Link
                            key={cat.label}
                            href={cat.href}
                            onClick={() => setSearchModalOpen(false)}
                            className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors cursor-pointer"
                          >
                            {cat.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Loading State */}
                  {searchLoading && (
                    <div className="p-6 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                      <span className="ml-2 text-sm text-gray-500">Searching...</span>
                    </div>
                  )}

                  {/* Search Results */}
                  {!searchLoading && searchResults.length > 0 && (
                    <div className="p-2">
                      <h3 className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Products</h3>
                      {searchResults.map((product) => (
                        <Link
                          key={product.id}
                          href={`/p/${product.slug}`}
                          onClick={() => setSearchModalOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer group"
                        >
                          {product.thumbnail_url ? (
                            <Image
                              src={product.thumbnail_url}
                              alt={product.title}
                              width={48}
                              height={48}
                              className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                              <Search className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                              {product.title}
                            </p>
                            {product.creator?.display_name && (
                              <p className="text-xs text-gray-500 truncate">
                                Product by {product.creator.display_name}
                              </p>
                            )}
                          </div>
                          <div className="text-sm font-medium text-gray-900">
                            {product.price_cents === 0 ? "Free" : `$${(product.price_cents / 100).toFixed(0)}+`}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* No Results */}
                  {!searchLoading && query.trim().length >= 1 && searchResults.length === 0 && (
                    <div className="p-6 text-center">
                      <p className="text-sm text-gray-500">No products found for "{query}"</p>
                    </div>
                  )}

                  {/* Search Tip */}
                  {!query && (
                    <div className="p-4 bg-gray-50 text-center">
                      <p className="text-xs text-gray-500">Start typing to search products</p>
                    </div>
                  )}

                  {/* View All Results Button */}
                  {query.trim() && (
                    <div className="p-3 border-t border-gray-100 bg-gray-50">
                      <button
                        type="button"
                        onClick={() => {
                          router.push(`/explore?q=${encodeURIComponent(query)}`)
                          setSearchModalOpen(false)
                        }}
                        className="w-full py-2.5 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        View all results for "{query}"
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Mobile Header - hamburger menu, search, avatar */}
          <div className="md:hidden flex items-center gap-2 flex-1">
            {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>

              <SheetContent side="left" className="w-[280px] pt-[env(safe-area-inset-top)] bg-white border-r border-gray-200">
                <SheetHeader>
                  <SheetTitle className="text-gray-900 text-left">Menu</SheetTitle>
                </SheetHeader>

                {/* Mobile Search */}
                <form onSubmit={onSubmitSearch} className="mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("search_placeholder")}
                      className="h-11 pl-10 bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-500 rounded-full"
                    />
                  </div>
                </form>

                {/* Mobile Categories */}
                <div className="mt-6">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Categories</h3>
                  <div className="space-y-1">
                    {SEARCH_CATEGORIES.map((cat) => (
                      <Link
                        key={cat.label}
                        href={cat.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        {cat.label}
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Mobile Quick Links */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="space-y-1">
                    <Link
                      href="/library"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <Library className="h-4 w-4" />
                      Library
                    </Link>
                    {user && (
                      <Link
                        href={dashboardHref}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Mobile Search Button */}
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                  aria-label="Search"
                >
                  <Search className="h-5 w-5" />
                </button>
              </SheetTrigger>

              <SheetContent side="top" className="pt-[env(safe-area-inset-top)] bg-white border-b border-gray-200">
                <SheetHeader>
                  <SheetTitle className="text-gray-900">Search</SheetTitle>
                </SheetHeader>

                <form onSubmit={onSubmitSearch} className="mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("search_placeholder")}
                      className="h-11 pl-10 bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-500 rounded-full"
                    />
                  </div>
                </form>

                <div className="mt-4 flex flex-wrap gap-2">
                  {SEARCH_CATEGORIES.map((cat) => (
                    <Link
                      key={cat.label}
                      href={cat.href}
                      className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition cursor-pointer"
                    >
                      {cat.label}
                    </Link>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {loading ? (
              <HeaderActionsSkeleton />
            ) : (
              <>
                {/* Wishlist - icon only */}
                <Link
                  href={wishlistHref}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
                  aria-label={t("wishlist")}
                >
                  <Heart className="h-5 w-5" />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                      {wishlistCount > 99 ? "99+" : wishlistCount}
                    </span>
                  )}
                </Link>

                {/* Library */}
                <Link
                  href="/library"
                  className="hidden sm:flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                  aria-label={t("library")}
                >
                  <Library className="h-4 w-4" />
                  <span className="hidden lg:inline">{t("library")}</span>
                </Link>

                {/* Start Selling or Dashboard */}
                <Button asChild className="h-10 rounded-full px-5 bg-blue-600 text-white hover:bg-blue-700">
                  <Link href={user && isCreator ? "/app" : startSellingHref}>
                    {user && isCreator ? t("dashboard") : t("start_selling")}
                  </Link>
                </Button>

                {/* User Menu - only show when logged in */}
                {user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-full cursor-pointer outline-none ring-offset-white transition-all duration-150 ease-out hover:ring-2 hover:ring-blue-200 hover:ring-offset-2 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
                        aria-label="Open profile menu"
                      >
                        <Avatar className="h-10 w-10 border border-gray-200 transition-opacity duration-150">
                          <AvatarImage src={avatarUrl || "/placeholder.svg"} alt={displayName} />
                          <AvatarFallback className="text-xs bg-gray-100 text-gray-700">{initials}</AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="end"
                      className="min-w-[220px] bg-white text-gray-900 border border-gray-200"
                    >
                      <DropdownMenuLabel className="py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium leading-none">{displayName}</span>
                          {user.email && <span className="text-xs text-gray-500 mt-1">{user.email}</span>}
                        </div>
                      </DropdownMenuLabel>

                      <DropdownMenuSeparator className="bg-gray-200" />

                      <DropdownMenuItem
                        onClick={() => router.push(dashboardHref)}
                        className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 gap-2"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() => router.push("/settings")}
                        className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 gap-2"
                      >
                        <Settings className="h-4 w-4" />
                        Settings
                      </DropdownMenuItem>

                      <DropdownMenuSeparator className="bg-gray-200" />

                      <DropdownMenuItem
                        onClick={handleLogout}
                        className="cursor-pointer text-red-600 hover:bg-gray-100 focus:bg-gray-100 gap-2"
                      >
                        <LogOut className="h-4 w-4" />
                        Log out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </div>
        </div>

        {/* Categories - only on /explore page, left-aligned with content */}
        {showCategories && (
          <nav className="border-t border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 hidden md:block">
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex h-11 items-center justify-start gap-6 whitespace-nowrap text-sm">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onCategoryClick(cat)}
                    className="text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}

function HeaderActionsSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-10 w-10 rounded-full bg-gray-200" />
      <Skeleton className="h-10 w-10 rounded-full bg-gray-200" />
      <Skeleton className="h-10 w-20 rounded-full hidden sm:block bg-gray-200" />
      <Skeleton className="h-10 w-24 rounded-full bg-gray-200" />
    </div>
  )
}
