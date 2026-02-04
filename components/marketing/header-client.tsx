"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { UserNavClient } from "./user-nav-client"
import { Heart, Menu, X, Grid3X3, Sparkles, Code, Megaphone, Briefcase, GraduationCap, Layers } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Categories for dropdown
const CATEGORIES = [
  { id: "all", label: "All", icon: Layers },
  { id: "design", label: "Design", icon: Sparkles },
  { id: "development", label: "Development", icon: Code },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "education", label: "Education", icon: GraduationCap },
]

export function MarketingHeaderClient() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [creatorSlug, setCreatorSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [categoriesOpen, setCategoriesOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setUser(user)

        const { data: profileData } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, username, is_creator")
          .eq("id", user.id)
          .single()

        setProfile(profileData)
        setIsCreator(profileData?.is_creator ?? false)

        if (profileData?.is_creator) {
          const { data: creatorData } = await supabase.from("creators").select("slug").eq("user_id", user.id).single()
          setCreatorSlug(creatorData?.slug || profileData?.username || null)
        }
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
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Left side - Logo and Categories */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/?src=platform" className="flex items-center gap-2 shrink-0">
            <span className="text-3xl font-semibold tracking-tight">Storelib</span>
          </Link>

          {/* Categories Dropdown */}
          <div className="relative" data-categories-dropdown>
            <button
              onClick={() => setCategoriesOpen(!categoriesOpen)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <Grid3X3 className="w-4 h-4" />
              <span>Categories</span>
            </button>

            {/* Dropdown Menu */}
            {categoriesOpen && (
              <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                <div className="p-4">
                  <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                    Browse
                  </div>
                  <div className="space-y-1">
                    {CATEGORIES.map((category) => {
                      const Icon = category.icon
                      return (
                        <Link
                          key={category.id}
                          href={`/explore?category=${category.id}`}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors"
                          onClick={() => setCategoriesOpen(false)}
                        >
                          <Icon className="w-5 h-5 text-neutral-500" />
                          <span className="font-medium">{category.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
                <div className="border-t border-neutral-100 p-3 bg-neutral-50">
                  <Link
                    href="/explore"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium text-violet-600 hover:bg-violet-50 transition-colors"
                    onClick={() => setCategoriesOpen(false)}
                  >
                    View all categories
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center - Navigation */}
        <nav className="hidden items-center gap-6 sm:flex">
          <Link
            href="/explore?src=platform"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Explore
          </Link>
        </nav>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Wishlist Heart */}
          {!loading && user && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/library"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-all duration-150"
                >
                  <Heart className="w-5 h-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1">
                Wishlist
              </TooltipContent>
            </Tooltip>
          )}

          {!loading && user && profile ? (
            <UserNavClient user={user} profile={profile} isCreator={isCreator} creatorSlug={creatorSlug} />
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup" className="whitespace-nowrap">
                  <span className="hidden xs:inline">Start selling</span>
                  <span className="xs:hidden">Sign up</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
