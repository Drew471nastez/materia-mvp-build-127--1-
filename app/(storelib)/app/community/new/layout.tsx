import type React from "react"
import { notFound } from "next/navigation"
import { PageLayer } from "@/components/app/page-layer"
import { communitiesEnabled } from "@/lib/communities/flag"

/**
 * A new community's editor, laid out as New product's
 * (app/app/products/new/layout.tsx): on a phone a page of its own over the
 * whole window with its own bar at the top and the nav pill kept; from md a
 * page in the shell; from lg the bar moves to the foot of the pane. A 404
 * while communities are switched off, like every page under it.
 */
export default async function NewCommunityLayout({ children }: { children: React.ReactNode }) {
  if (!(await communitiesEnabled())) notFound()
  return (
    <PageLayer pill inset="bar" phoneOnly>
      {children}
    </PageLayer>
  )
}
