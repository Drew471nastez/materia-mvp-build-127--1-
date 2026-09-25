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

import * as React from "react"
import { MoreHorizontal } from "lucide-react"

import { OwnerActionsMenu } from "@/components/storefront/owner-actions-menu"
import { isInEditorFrame } from "@/lib/store-builder/editor-channel"

export function ProductOwnerMenu({ productId, productHref }: { productId: string; productHref?: string }) {
  /**
   * INSIDE THE WORKSPACE, THE APP OPENS OVER IT. "Edit product" and
   * "View analytics" go to /app, which the canvas refuses to load, so from
   * inside the frame they did nothing when pressed. They leave the frame now,
   * as the header's menu always has. Asked of the window after mounting, so
   * the server render and the first client render agree.
   */
  const [framed, setFramed] = React.useState(false)
  React.useEffect(() => setFramed(isInEditorFrame()), [])
  const top = framed ? { target: "_top" as const } : {}
  /* No icons: three short labels do not need pictures beside them. */
  const links = [
    /* /app/products/[id] redirects into the editor for that product. */
    { href: `/app/products/${productId}`, label: "Edit product", ...top },
    { href: "/app/analytics", label: "View analytics", ...top },
    ...(productHref ? [{ href: productHref, label: "Open product page" }] : []),
  ]
  return (
    <OwnerActionsMenu
      ariaLabel="Product options"
      title="This product"
      links={links}
      /* The card is a link. Opening the menu is not navigating (the menu stops the click: e.preventDefault(), e.stopPropagation()). */
      stopClicks
      icon={<MoreHorizontal className="h-4 w-4" />}
      menuClassName="w-52"
      triggerClassName="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-gray-900 shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    />
  )
}
