"use client"

/**
 * The creator's shortcut into one product, from their own storefront.
 *
 * OWNER ONLY, and it is gated the same way the header's controls are: the
 * server decides who is looking and simply does not render this for anybody
 * else. There is no CSS hiding it and no client-side check that a visitor
 * could defeat — a visitor never receives the component.
 *
 * It links rather than edits. A product has a whole editor in /app with
 * uploads, variants, pricing and files in it; a popover on a public page could
 * only ever be a worse version of that, so the menu takes you there.
 */

import { SmartLink } from "@/components/smart-link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal } from "lucide-react"

export function ProductOwnerMenu({ productId, productHref }: { productId: string; productHref?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Product options"
        onClick={(e) => {
          // The card is a link. Opening the menu is not navigating.
          e.preventDefault()
          e.stopPropagation()
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-gray-900 shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-52" onClick={(e) => e.stopPropagation()}>
        {/* No icons — three short labels do not need pictures beside them. */}
        <DropdownMenuItem asChild className="cursor-pointer">
          {/* /app/products/[id] redirects into the editor for that product. */}
          <SmartLink href={`/app/products/${productId}`}>Edit product</SmartLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer">
          <SmartLink href="/app/analytics">View analytics</SmartLink>
        </DropdownMenuItem>
        {productHref && (
          <DropdownMenuItem asChild className="cursor-pointer">
            <SmartLink href={productHref}>Open product page</SmartLink>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
