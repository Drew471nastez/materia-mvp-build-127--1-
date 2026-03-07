"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Settings, LogOut, Library, LayoutDashboard, Sparkles } from "lucide-react"
import Link from "next/link"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface UserNavClientProps {
  user: SupabaseUser
  profile: {
    display_name?: string | null
    avatar_url?: string | null
    username?: string | null
    is_creator?: boolean
  } | null
  isCreator: boolean
  creatorSlug: string | null
}

export function UserNavClient({ user, profile, isCreator }: UserNavClientProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    if (isNativePlatform()) {
      window.location.replace("/")
    } else {
      router.push("/login")
      router.refresh()
    }
  }

  const initials = profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="relative h-10 w-10 rounded-full cursor-pointer transition-all duration-150 ease-out hover:ring-2 hover:ring-violet-200 hover:ring-offset-2 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2"
              type="button"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.display_name || ""} />
                <AvatarFallback className="bg-neutral-200 text-neutral-700 font-medium">{initials || "?"}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
          Your Account
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{profile?.display_name || "User"}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isCreator ? (
          <DropdownMenuItem asChild>
            <Link href="/app" className="cursor-pointer">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/signup/success?action=become-creator" className="cursor-pointer">
              <Sparkles className="mr-2 h-4 w-4" />
              <span>Become a Seller</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/library" className="cursor-pointer">
            <Library className="mr-2 h-4 w-4" />
            <span>My Library</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={isCreator ? "/app/settings" : "/library/settings"} className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
