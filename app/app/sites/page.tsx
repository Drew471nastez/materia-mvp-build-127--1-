import type { Metadata } from "next"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SmartLink } from "@/components/smart-link"
import { SitesDashboard } from "@/components/sites/sites-dashboard"
import { listSites } from "@/lib/sites/projects"
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { currentCreatorId } from "@/lib/sites/projects"
import { siteCountGate } from "@/lib/sites/plan"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Storelib AI",
}

export default async function SitesPage() {
  const sites = await listSites()
  const creatorId = await currentCreatorId()
  const plan = creatorId ? await creatorSitePlan(creatorId) : "free"
  const gate = siteCountGate(plan, sites.length)

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Storelib AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build websites, landing pages and storefronts by describing them.
          </p>
        </div>
        {sites.length > 0 && (
          <Button asChild size="sm" disabled={!!gate}>
            <SmartLink href="/app/sites/new">
              <Plus className="mr-1.5 h-4 w-4" />
              New site
            </SmartLink>
          </Button>
        )}
      </div>

      {/*
        The gate is shown, not just enforced. A disabled button with no reason
        beside it is the most annoying thing a paid product does.
      */}
      {gate && sites.length > 0 && (
        <p className="mb-4 rounded-[10px] border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {gate}
        </p>
      )}

      <SitesDashboard sites={sites} canCreate={gate} />
    </div>
  )
}
