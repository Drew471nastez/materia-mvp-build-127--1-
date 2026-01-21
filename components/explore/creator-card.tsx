import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { getStoreUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/ui/smart-link"

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
  const initials = creator.profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const username = creator.profile?.username || creator.slug

  return (
    <SmartLink
      href={`${getStoreUrl(username)}?src=platform`}
      className="group flex flex-col rounded-lg border border-border/60 bg-card p-6 transition-colors hover:border-border"
    >
      <div className="flex items-start gap-4">
        <Avatar className="h-14 w-14">
          {creator.profile?.avatar_url ? (
            <AvatarImage
              src={creator.profile.avatar_url || "/placeholder.svg"}
              alt={creator.profile?.display_name || ""}
            />
          ) : null}
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 overflow-hidden">
          <h3 className="truncate font-medium group-hover:text-primary">
            {creator.profile?.display_name || "Creator"}
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
