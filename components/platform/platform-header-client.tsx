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

import { Globe, Heart, Library, Search, LayoutDashboard, Settings, LogOut } from "lucide-react"
import { LanguageCurrencyModal } from "@/components/platform/language-currency-modal"
import { useLocale } from "@/components/locale-provider"

const LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/storelib.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvc3RvcmVsaWIucG5nIiwiaWF0IjoxNzY3MjU4MDA0LCJleHAiOjU2Nzc3MjIwMDR9.BuD3SQ_kGcR1csk3dq9pr19aZlm7GoM7i_vuDvqTty8"

const DEFAULT_CATEGORIES = [
  "Fonts",
  "Images",
  "Paper Crafts",
  "Needlework",
  "Laser Cutting",
  "3D Printing",
  "Bundles",
  "POD",
  "Learn",
  "AI Studio",
  "Subscription",
]

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
  const { t, languageShort } = useLocale()

  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [loading, setLoading] = useState(true)
  const [wishlistCount, setWishlistCount] = useState(0)

  const mountedRef = useRef(true)

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "")
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "")
  }, [searchParams])

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
    }, 2500)

    const loadUser = async () => {
      try {
        if (!mountedRef.current) return
        setLoading(true)

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
      }
    }

    loadUser()

    const { data } = supabase.auth.onAuthStateChange(() => {
      loadUser()
      fetchWishlistCount()
    })

    return () => {
      mountedRef.current = false
      window.clearTimeout(failSafe)
      data?.subscription?.unsubscribe()
    }
  }, [fetchWishlistCount])

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

  const showCategories = pathname === "/explore" || pathname === "/"

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white border-gray-200 md:rounded-none rounded-b-[20px] md:border-b border-b-0 md:shadow-none shadow-sm">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 md:h-16 items-center justify-between gap-4 py-[18px] md:py-0">
          {/* Logo */}
          <Link href="/" className="shrink-0">
            <Image
              src={LOGO_URL || "/placeholder.svg"}
              alt="Storelib"
              width={128}
              height={43}
              className="h-10 w-auto"
              priority
            />
          </Link>

          {/* Desktop Search - Centered */}
          <form onSubmit={onSubmitSearch} className="hidden md:flex flex-1 max-w-xl mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search_placeholder")}
                className="h-10 w-full rounded-full pl-10 pr-4 bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-300 focus-visible:ring-offset-0"
              />
            </div>
          </form>

          {/* Mobile Search */}
          <div className="md:hidden flex-1 mx-2">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 w-full items-center gap-2 rounded-full border px-3 text-sm border-gray-200 bg-gray-100 text-gray-500"
                  aria-label="Open search"
                >
                  <Search className="h-4 w-4" />
                  <span className="truncate">{t("search_placeholder")}</span>
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
                      className="h-11 pl-10 bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-500"
                    />
                  </div>
                </form>

                <div className="mt-4 flex flex-wrap gap-2">
                  {DEFAULT_CATEGORIES.slice(0, 8).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => onCategoryClick(cat)}
                      className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition"
                    >
                      {cat}
                    </button>
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
                {/* Language */}
                <LanguageCurrencyModal
                  trigger={
                    <button
                      type="button"
                      className="flex h-10 items-center gap-2 rounded-full border px-3 text-sm border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                      aria-label="Language and currency"
                    >
                      <Globe className="h-4 w-4 text-gray-500" />
                      <span className="font-medium hidden sm:inline">{languageShort}</span>
                    </button>
                  }
                />

                {/* Wishlist */}
                <Link
                  href={wishlistHref}
                  className="relative flex h-10 items-center justify-center gap-2 rounded-full px-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
                  aria-label={t("wishlist")}
                >
                  <Heart className="h-5 w-5" />
                  <span className="hidden lg:inline text-sm font-medium">{t("wishlist")}</span>
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1 left-6 lg:left-auto lg:-right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
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

                {/* Start Selling */}
                <Button asChild className="h-10 rounded-full px-5 bg-blue-600 text-white hover:bg-blue-700">
                  <Link href={startSellingHref}>{t("start_selling")}</Link>
                </Button>

                {/* User Menu */}
                {user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-full outline-none ring-offset-white transition focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
                        aria-label="Open profile menu"
                      >
                        <Avatar className="h-10 w-10 border border-gray-200">
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

                      <DropdownMenuItem onClick={() => router.push(dashboardHref)} className="focus:bg-gray-100">
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => router.push("/settings")} className="focus:bg-gray-100">
                        <Settings className="h-4 w-4" />
                        Settings
                      </DropdownMenuItem>

                      <DropdownMenuSeparator className="bg-gray-200" />

                      <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:bg-gray-100">
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

        {/* Categories */}
        {showCategories && (
          <nav className="border-t border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
            <div className="overflow-x-auto">
              <div className="flex h-11 items-center gap-6 whitespace-nowrap text-sm">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onCategoryClick(cat)}
                    className="text-gray-500 hover:text-gray-900 transition"
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
