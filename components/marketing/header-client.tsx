"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { UserNavClient } from "./user-nav-client"

export function MarketingHeaderClient() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [creatorSlug, setCreatorSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/?src=platform" className="flex items-center gap-2 shrink-0">
          <span className="text-lg font-semibold tracking-tight">Materia</span>
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
