"use client"

/**
 * The creator's own shortcuts, on their own page.
 *
 * "Customize page" beside it opens a dialog because what it edits — the name,
 * the bio, the picture, the links — is small enough to finish in place. This
 * menu is for the things that are not: managing products, laying the page out,
 * reading the numbers. Those have whole screens in /app already, and rebuilding
 * any of them in a popover on a public page would be a worse copy of a thing
 * that already works.
 *
 * So it is a menu of destinations, not a second editor.
 */

import { MoreHorizontal } from "lucide-react"

import { OWNER_CONTROL_DEPTH, OwnerActionsMenu } from "@/components/storefront/owner-actions-menu"

/**
 * NO ICONS ON THE ITEMS. Four rows that each say what they are do not need a
 * picture as well — the glyphs were decoration competing with the words, and a
 * menu is read, not scanned by shape.
 */
const LINKS = [
  { href: "/app/products", label: "Manage products", detail: "Add, edit and price" },
  { href: "/creator-page", label: "Customize page", detail: "Lay out this page" },
  { href: "/app/analytics", label: "Analytics", detail: "Views and sales" },
  { href: "/app/settings", label: "Settings", detail: "Account and payouts" },
] as const

export function OwnerMenu({ embedded = false }: { embedded?: boolean }) {
  /* Inside the workspace frame these are app screens, and loading the app
     inside a frame on a public page is not a destination. _top puts them
     where they belong. */
  const links = LINKS.map((link) => ({ ...link, ...(embedded ? { target: "_top" as const } : {}) }))
  return (
    /* A dropdown under a mouse, the app's bottom sheet on a phone (owner-actions-menu). */
    <OwnerActionsMenu
      ariaLabel="Creator options"
      title="Your page"
      heading="Only you can see this"
      links={links}
      icon={<MoreHorizontal className="h-4 w-4" />}
      triggerClassName={`relative flex h-9 w-9 items-center justify-center rounded-lg bg-white/95 before:absolute before:-inset-1 before:content-[''] text-gray-900 backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${OWNER_CONTROL_DEPTH}`}
    />
  )
}
