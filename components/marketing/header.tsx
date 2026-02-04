import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { UserNav } from "@/components/marketing/user-nav"

export async function MarketingHeader() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile = null
  let isCreator = false
  let creatorSlug: string | null = null

  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, username, is_creator")
      .eq("id", user.id)
      .single()

    profile = profileData
    isCreator = profileData?.is_creator ?? false

    if (isCreator) {
      const { data: creatorData } = await supabase.from("creators").select("slug").eq("user_id", user.id).single()
      creatorSlug = creatorData?.slug || profileData?.username || null
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/?src=platform" className="flex items-center gap-2 shrink-0">
          <span className="text-3xl font-semibold tracking-tight">Storelib</span>
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
  )
}
