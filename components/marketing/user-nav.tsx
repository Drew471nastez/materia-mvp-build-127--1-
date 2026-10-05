"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { AppAvatar } from "@/components/app/app-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LayoutDashboard, Settings, LogOut, Library, Sparkles } from "lucide-react"
import type { User } from "@supabase/supabase-js"
import { displayEmail } from "@/lib/businesses/email-alias"

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

export function UserNav({ user, profile, isCreator }: UserNavProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleSignOut = async () => {
    setIsLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
    if (isNativePlatform()) {
      window.location.replace("/welcome")
    } else {
      router.push("/")
      router.refresh()
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          {/* Their photo, else their initials, else a plain person. Never the
              first letter of their email, which is not a name. */}
          <AppAvatar src={profile.avatar_url} name={(profile.display_name || profile.username || "").trim()} alt="" size={32} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            {profile.display_name && <p className="font-medium">{profile.display_name}</p>}
            {/* Their own address, never the tag (lib/businesses/email-alias.ts displayEmail). */}
            <p className="w-[200px] truncate text-sm text-muted-foreground">{displayEmail(user.email)}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        {isCreator ? (
          <DropdownMenuItem asChild>
            <Link href="/app" className="cursor-pointer">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/sell" className="cursor-pointer">
              <Sparkles className="mr-2 h-4 w-4" />
              Become a seller
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/account/library" className="cursor-pointer">
            <Library className="mr-2 h-4 w-4" />
            My Library
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={handleSignOut}
          disabled={isLoading}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isLoading ? "Signing out..." : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
