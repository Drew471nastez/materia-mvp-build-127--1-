import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { UserNav } from "@/components/marketing/user-nav"
import { Type } from "lucide-react"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"

// Secondary nav categories (shown under header)
const SECONDARY_NAV_CATEGORIES = [
  { label: "Fonts", href: "/explore?q=fonts" },
  { label: "Images", href: "/explore?q=images" },
  { label: "Paper Crafts", href: "/explore?q=paper+crafts" },
  { label: "Needlework", href: "/explore?q=needlework" },
  { label: "Laser Cutting", href: "/explore?q=laser+cutting" },
  { label: "3D Printing", href: "/explore?q=3d+printing" },
]

export function MarketingHeaderSkeleton() {
  return (
    <div className="relative z-40 w-full bg-black backdrop-blur supports-[backdrop-filter]:bg-black pt-[env(safe-area-inset-top)]">
      {/* Main Header Row */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Skeleton className="h-8 w-32 bg-white/10" />
          <nav className="hidden items-center gap-6 sm:flex">
            <Skeleton className="h-4 w-16 bg-white/10" />
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-9 w-20 bg-white/10" />
            <Skeleton className="h-9 w-24 bg-white/10" />
          </div>
        </div>
      </header>

      {/* Secondary Navigation Row */}
      <nav className="border-b border-white/10 bg-black">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-6 py-2.5 overflow-x-auto scrollbar-hide">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-20 bg-white/10" />
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}

export async function MarketingHeader() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile = null
  let isCreator = false
  let creatorSlug: string | null = null

  if (user) {
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

    isCreator = !!creatorData?.onboarding_completed

    // profiles.avatar_url only: a photo removed in Settings stays removed (lib/account/avatar)
    const resolvedAvatarUrl = profileData?.avatar_url || null

    profile = profileData ? { ...profileData, avatar_url: resolvedAvatarUrl } : profileData
    creatorSlug = creatorData?.slug || profileData?.username || null
  }

  return (
    <div className="relative z-40 w-full bg-black backdrop-blur supports-[backdrop-filter]:bg-black pt-[env(safe-area-inset-top)]">
      {/* Main Header Row */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/explore" className="flex items-center gap-2 shrink-0">
            <span className="text-[2rem] font-bold tracking-tight leading-none text-white">Storelib</span>
          </Link>
          <nav className="hidden items-center gap-6 sm:flex">
            <Link
              href="/explore?src=platform"
              className="text-sm text-white/70 transition-colors hover:text-white"
            >
              Explore
            </Link>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            {user && profile ? (
              <UserNav user={user} profile={profile} isCreator={isCreator} creatorSlug={creatorSlug} />
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
          </div>
        </div>
      </header>

      {/* Secondary Navigation Row - Category Links */}
      <nav className="border-b border-white/10 bg-black">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-6 py-2.5 overflow-x-auto scrollbar-hide">
            {SECONDARY_NAV_CATEGORIES.map((category, index) => (
              <Link
                key={category.label}
                href={category.href}
                className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white whitespace-nowrap transition-colors cursor-pointer"
              >
                {/* Show icon only on first category */}
                {index === 0 && <Type className="w-4 h-4" />}
                <span>{category.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}
