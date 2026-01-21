import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { getProductUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/ui/smart-link"

interface ProductCardProps {
  product: {
    id: string
    title: string
    slug: string
    description?: string | null
    price_cents: number
    compare_at_cents?: number | null
    thumbnail_url?: string | null
    type: string
    creator?: {
      id?: string
      slug?: string
      niche_tags?: string[]
      profile?: {
        display_name?: string | null
        avatar_url?: string | null
        username?: string | null
      } | null
    } | null
  }
  srcParam?: string
}

export function ProductCard({ product, srcParam = "" }: ProductCardProps) {
  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const creatorName = product.creator?.profile?.display_name || "Creator"
  const creatorUsername = product.creator?.profile?.username || product.creator?.slug
  const productUrl = creatorUsername
    ? `${getProductUrl(creatorUsername, product.slug)}${srcParam}`
    : `/p/${product.slug}${srcParam}`

  return (
    <SmartLink
      href={productUrl}
      className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card transition-colors hover:border-border"
    >
      <div className="relative aspect-video bg-muted overflow-hidden">
        {product.thumbnail_url ? (
          <Image
            src={product.thumbnail_url || "/placeholder.svg"}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <span className="text-4xl">
              {product.type === "digital" ? "📦" : product.type === "course" ? "📚" : "👥"}
            </span>
          </div>
        )}
        {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
          <Badge variant="destructive" className="absolute left-2 top-2 text-xs">
            {Math.round((1 - product.price_cents / product.compare_at_cents) * 100)}% OFF
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-tight group-hover:text-primary break-words min-w-0">{product.title}</h3>
          <Badge variant="secondary" className="shrink-0 text-xs capitalize">
            {product.type}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground truncate">by {creatorName}</p>
        <div className="mt-auto pt-4">
          <span className="font-semibold">{product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}</span>
          {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
            <span className="ml-2 text-sm text-muted-foreground line-through">
              {formatPrice(product.compare_at_cents)}
            </span>
          )}
        </div>
      </div>
    </SmartLink>
  )
}
