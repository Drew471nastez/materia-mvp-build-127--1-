"use client"

import { personName } from "@/lib/profile/display-name"
import { AppAvatar } from "@/components/app/app-avatar"
import { Badge } from "@/components/ui/badge"
import { getStoreUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"

interface CreatorCardProps {
  creator: {
    id: string
    slug: string
    headline?: string | null
    bio?: string | null
    niche_tags?: string[] | null
    products_count?: number
    profile?: {
      display_name?: string | null
      avatar_url?: string | null
      username?: string | null
    } | null
  }
}

export function CreatorCard({ creator }: CreatorCardProps) {
  // Safety check - if creator is null/undefined, don't render
  if (!creator) return null

  // Only use profile.username — it's what /u/[username] routes look up.
  const username = creator.profile?.username || ""

  return (
    <SmartLink
      href={username ? getStoreUrl(username) : "#"}
      className="group flex flex-col rounded-lg border border-border/60 bg-card p-6 transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none hover:border-border hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]"
    >
      <div className="flex items-start gap-4">
        {/* The shared avatar: the photo, else the initials, else a plain person. Never a "?". */}
        <AppAvatar
          src={creator.profile?.avatar_url}
          name={(creator.profile?.display_name || "").trim()}
          alt=""
          size={56}
          tone="theme"
          markWhileLoading
        />
        <div className="flex-1 overflow-hidden">
          <h3 className="truncate font-medium">
            {personName({ name: creator.profile?.display_name, username: creator.profile?.username, slug: creator.slug })}
          </h3>
          {creator.headline && <p className="mt-0.5 truncate text-sm text-muted-foreground">{creator.headline}</p>}
        </div>
      </div>
      {creator.niche_tags && creator.niche_tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {creator.niche_tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-4 text-xs text-muted-foreground">
        {creator.products_count || 0} {creator.products_count === 1 ? "product" : "products"}
      </div>
    </SmartLink>
  )
}
