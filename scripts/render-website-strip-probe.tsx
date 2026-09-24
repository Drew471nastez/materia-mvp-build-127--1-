/**
 * The Website page with its performance bar, rendered in the browser with
 * no session and no database, for scripts/check-website-strip.mjs. The
 * numbers are fixtures handed to the bar exactly the way the server hands
 * them over: as a promise that resolves after the page has drawn.
 *
 * `?state=` picks what the bar is given:
 *   full        every number measured, one of each verdict
 *   few         speed with too few page loads behind it
 *   collecting  the SQL not run yet: no speed at all
 */
import * as React from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/app/website-builder/website-builder-client"
import WebsiteBuilderLoading from "@/app/app/website-builder/skeleton"
import type { WebsitePerformance } from "@/lib/website-builder/site-performance"
import type { VitalReport } from "@/lib/website-builder/web-vitals"

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

const installs: WebsiteSummary[] = [
  {
    id: "live-1",
    name: "Storelib Default",
    status: "published",
    theme_id: "storelib-default",
    created_at: ago(60 * 24),
    updated_at: ago(4),
    published_at: ago(4),
    snapshot_url: null,
    snapshot_mobile_url: null,
    snapshot_updated_at: null,
    saved_at: ago(4),
    theme: { name: "Storelib Default", version: "1.0.0", slug: "storelib-default" },
    settings: null,
  },
  {
    id: "lib-1",
    name: "Studio",
    status: "draft",
    theme_id: "storelib-default",
    created_at: ago(60 * 48),
    updated_at: ago(120),
    published_at: null,
    snapshot_url: null,
    snapshot_mobile_url: null,
    snapshot_updated_at: null,
    saved_at: ago(120),
    theme: { name: "Storelib Default", version: "1.0.0", slug: "storelib-default" },
    settings: null,
  },
]

const report = (all: number | null, n: number, mobile: number | null, desktop: number | null): VitalReport => ({
  all: { p75: all, samples: n },
  mobile: { p75: mobile, samples: Math.round(n * 0.7) },
  desktop: { p75: desktop, samples: Math.round(n * 0.3) },
})

const FIXTURES: Record<string, WebsitePerformance> = {
  full: {
    visits: { value: 2932, previous: 3533, change: -0.17 },
    orders: { value: 41, previous: 36, change: 0.139 },
    conversion: { value: 41 / 2932, previous: 36 / 3533, change: 0.37 },
    truncated: false,
    vitals: {
      kind: "ready",
      metrics: {
        lcp: report(2932, 1840, 3310, 1720),
        inp: report(184, 1210, 232, 96),
        cls: report(0.31, 1840, 0.34, 0.05),
      },
    },
  },
  few: {
    visits: { value: 38, previous: 0, change: null },
    orders: { value: 0, previous: 0, change: null },
    conversion: { value: 0, previous: 0, change: null },
    truncated: false,
    vitals: {
      kind: "ready",
      metrics: {
        lcp: { all: { p75: null, samples: 12 }, mobile: { p75: null, samples: 9 }, desktop: { p75: null, samples: 3 } },
        inp: { all: { p75: null, samples: 4 }, mobile: { p75: null, samples: 4 }, desktop: { p75: null, samples: 0 } },
        cls: { all: { p75: null, samples: 12 }, mobile: { p75: null, samples: 9 }, desktop: { p75: null, samples: 3 } },
      },
    },
  },
  collecting: {
    visits: { value: 0, previous: 0, change: null },
    orders: null,
    conversion: null,
    truncated: false,
    vitals: { kind: "unavailable" },
  },
}

export function App() {
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search)
  if (params.get("loading") === "1") return <WebsiteBuilderLoading />
  return <Page state={params.get("state") ?? "full"} />
}

function Page({ state }: { state: string }) {
  const [figures] = React.useState(
    () => new Promise<WebsitePerformance | null>((r) => setTimeout(() => r(FIXTURES[state] ?? FIXTURES.full), 300)),
  )
  return (
    <TooltipProvider>
      <WebsiteBuilderClient
        installs={installs}
        username="andrewullz"
        performance={{
          period: { preset: "last_30_days", start: "2026-08-26", end: "2026-09-24" },
          timeZone: "UTC",
          figures,
        }}
      />
    </TooltipProvider>
  )
}
