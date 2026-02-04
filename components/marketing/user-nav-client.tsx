"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Settings, Store, LogOut, Package, Library, LayoutDashboard } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { getStoreUrl } from "@/lib/url-helpers"

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

export function UserNavClient({ user, profile, isCreator, creatorSlug }: UserNavClientProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const initials = profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const storeUsername = creatorSlug || profile?.username

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="relative h-10 w-10 rounded-full cursor-pointer transition-all duration-150 hover:ring-2 hover:ring-neutral-200 hover:ring-offset-2 focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2"
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
        {isCreator && storeUsername && (
          <>
            <DropdownMenuItem asChild>
              <a href={getStoreUrl(storeUsername)} className="cursor-pointer">
                <Store className="mr-2 h-4 w-4" />
                <span>My Store</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/store-builder" className="cursor-pointer">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Store Builder</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/app/products" className="cursor-pointer">
                <Package className="mr-2 h-4 w-4" />
                <span>Products</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/app" className="cursor-pointer">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Creator Dashboard</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/library" className="cursor-pointer">
            <Library className="mr-2 h-4 w-4" />
            <span>Library</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
