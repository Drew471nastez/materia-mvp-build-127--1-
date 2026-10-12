import type { Metadata } from "next"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SmartLink } from "@/components/smart-link"
import { SitesDashboard } from "@/components/sites/sites-dashboard"
import { listSites, SitesUnavailableError } from "@/lib/sites/projects"
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { currentCreatorId } from "@/lib/sites/projects"
import { siteCountGate } from "@/lib/sites/plan"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Storelib AI"),
  }
}

export default async function SitesPage() {
  const { tt } = await getServerTt()
  /**
   * "You have no sites" and "we could not read your sites" are different
   * sentences, and showing the first for the second reason tells somebody
   * their work is gone. It is worth the extra branch: this exact conflation
   * is what made a creator with a published site stare at an invitation to
   * build their first one.
   */
  let sites: Awaited<ReturnType<typeof listSites>> = []
  let unavailable = false
  try {
    sites = await listSites()
  } catch (thrown) {
    if (!(thrown instanceof SitesUnavailableError)) throw thrown
    unavailable = true
  }

  const creatorId = await currentCreatorId()
  const plan = creatorId ? await creatorSitePlan(creatorId) : "free"
  const gate = siteCountGate(plan, sites.length)

  /* app-gutter is the phone number; sm:px-6 keeps this page at 24 from 640 up, as it was. */
  return (
    <div className="mx-auto w-full max-w-[1180px] app-gutter sm:px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{tt("Storelib AI")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tt("Build websites, landing pages and storefronts by describing them.")}
          </p>
        </div>
        {sites.length > 0 && (
          <Button asChild size="sm" disabled={!!gate}>
            <SmartLink href="/app/sites/new">
              <Plus className="mr-1.5 h-4 w-4" />
              {tt("New site")}
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

      {unavailable ? (
        <div className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
          <p className="text-sm font-medium">{tt("We could not load your sites just now.")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tt("Nothing has been lost — this is a problem reading them, not a problem with them. Refresh in a moment, and if it keeps happening the server logs will say why.")}
          </p>
        </div>
      ) : (
        <SitesDashboard sites={sites} canCreate={gate} />
      )}
    </div>
  )
}
