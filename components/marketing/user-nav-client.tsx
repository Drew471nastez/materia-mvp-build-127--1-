"use client"

import { personName } from "@/lib/profile/display-name"
import { AppAvatar } from "@/components/app/app-avatar"
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
import { nativeLogOut } from "@/lib/native-bridge"
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
    await supabase.auth.signOut({ scope: "local" })
    if (isNativePlatform()) {
      nativeLogOut()
    } else {
      router.push("/login")
      router.refresh()
    }
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none ring-offset-2 transition-shadow duration-150 ease-out hover:ring-2 hover:ring-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
              type="button"
            >
              {/* Their own photo, else their initials, else a plain person. No "?". */}
              <AppAvatar src={profile?.avatar_url} name={(profile?.display_name || "").trim()} alt="" size={40} />
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
            <p className="text-sm font-medium leading-none">{personName({ name: profile?.display_name, username: profile?.username })}</p>
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
            <Link href="/sell" className="cursor-pointer">
              <Sparkles className="mr-2 h-4 w-4" />
              <span>Become a seller</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/account/library" className="cursor-pointer">
            <Library className="mr-2 h-4 w-4" />
            <span>My Library</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account" className="cursor-pointer">
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
