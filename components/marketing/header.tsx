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
    <div className="relative z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
      {/* Main Header Row */}
      <header className="border-b border-border/40">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Skeleton className="h-8 w-32" />
          <nav className="hidden items-center gap-6 sm:flex">
            <Skeleton className="h-4 w-16" />
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </header>

      {/* Secondary Navigation Row */}
      <nav className="border-b border-border/40 bg-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-6 py-2.5 overflow-x-auto scrollbar-hide">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-20" />
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

    // Use profiles.avatar_url, fall back to Google OAuth avatar
    let resolvedAvatarUrl = profileData?.avatar_url || null
    if (!resolvedAvatarUrl) {
      resolvedAvatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null
    }

    profile = profileData ? { ...profileData, avatar_url: resolvedAvatarUrl } : profileData
    creatorSlug = creatorData?.slug || profileData?.username || null
  }

  return (
    <div className="relative z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Main Header Row */}
      <header className="border-b border-border/40">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/explore" className="flex items-center gap-2 shrink-0">
            <span className="text-[2rem] font-bold tracking-tight leading-none">Storelib</span>
          </Link>
          <nav className="hidden items-center gap-6 sm:flex">
            <Link
              href="/explore?src=platform"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Explore
            </Link>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            {user && profile ? (
              <UserNav user={user} profile={profile} isCreator={isCreator} creatorSlug={creatorSlug} />
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

      {/* Secondary Navigation Row - Category Links */}
      <nav className="border-b border-border/40 bg-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-6 py-2.5 overflow-x-auto scrollbar-hide">
            {SECONDARY_NAV_CATEGORIES.map((category, index) => (
              <Link
                key={category.label}
                href={category.href}
                className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 whitespace-nowrap transition-colors cursor-pointer"
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
