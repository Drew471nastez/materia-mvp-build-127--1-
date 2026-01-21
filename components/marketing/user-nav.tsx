"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LayoutDashboard, Settings, LogOut, ShoppingBag, Store } from "lucide-react"
import type { User } from "@supabase/supabase-js"
import { getStoreUrl } from "@/lib/url-helpers"

interface UserNavProps {
  user: User
  profile: {
    display_name: string | null
    avatar_url: string | null
    username: string | null
    is_creator: boolean | null
  }
  isCreator: boolean
  creatorSlug: string | null
}

export function UserNav({ user, profile, isCreator, creatorSlug }: UserNavProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const initials =
    profile.display_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() ||
    user.email?.[0].toUpperCase() ||
    "?"

  const handleSignOut = async () => {
    setIsLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const storeUsername = creatorSlug || profile.username

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || "User"} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            {profile.display_name && <p className="font-medium">{profile.display_name}</p>}
            <p className="w-[200px] truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        {isCreator ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/app" className="cursor-pointer">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Creator Dashboard
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="cursor-pointer">
                <ShoppingBag className="mr-2 h-4 w-4" />
                My Purchases
              </Link>
            </DropdownMenuItem>
            {storeUsername && (
              <DropdownMenuItem asChild>
                <Link href={`${getStoreUrl(storeUsername)}?src=platform`} className="cursor-pointer">
                  <Store className="mr-2 h-4 w-4" />
                  View My Store
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href="/app/settings" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="cursor-pointer">
                <ShoppingBag className="mr-2 h-4 w-4" />
                My Purchases
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/onboarding" className="cursor-pointer">
                <Store className="mr-2 h-4 w-4" />
                Become a Creator
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onSelect={handleSignOut}
          disabled={isLoading}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isLoading ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
