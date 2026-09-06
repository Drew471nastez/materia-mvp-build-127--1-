"use client"

/**
 * The creator's own shortcuts, on their own page.
 *
 * "Edit profile" beside it opens a dialog because what it edits — the name,
 * the bio, the picture, the links — is small enough to finish in place. This
 * menu is for the things that are not: managing products, laying the page out,
 * reading the numbers. Those have whole screens in /app already, and rebuilding
 * any of them in a popover on a public page would be a worse copy of a thing
 * that already works.
 *
 * So it is a menu of destinations, not a second editor.
 */

import { SmartLink } from "@/components/smart-link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Package, LayoutTemplate, BarChart3, Settings } from "lucide-react"

const LINKS = [
  { href: "/app/products", label: "Manage products", detail: "Add, edit and price", Icon: Package },
  { href: "/store-builder", label: "Store builder", detail: "Lay out this page", Icon: LayoutTemplate },
  { href: "/app/analytics", label: "Analytics", detail: "Views and sales", Icon: BarChart3 },
  { href: "/app/settings", label: "Settings", detail: "Account and payouts", Icon: Settings },
] as const

export function OwnerMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Creator options"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/95 text-gray-900 shadow-md backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Only you can see this
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LINKS.map(({ href, label, detail, Icon }) => (
          <DropdownMenuItem key={href} asChild className="cursor-pointer gap-3 py-2">
            <SmartLink href={href}>
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex flex-col">
                <span className="text-sm">{label}</span>
                <span className="text-xs text-muted-foreground">{detail}</span>
              </span>
            </SmartLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
