/**
 * Renders the Website page on its own — no session, no database, no /app
 * shell — so its layout can be looked at and measured in a browser. Bundled
 * by scripts/check-website-page.mjs, which stubs the router, the toast and
 * the navigation bar.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { TooltipProvider } from "@/components/ui/tooltip"
import { PageSpinner } from "@/components/ui/activity-spinner"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/(storelib)/app/website-builder/website-builder-client"

const OUT = process.env.OUT_DIR!
const now = new Date().toISOString()
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

/** A library already over the limit, which is what produced "5/3". */
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
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `lib-${i}`,
    name: ["Studio", "Atelier", "Coach", "Chair"][i],
    status: "draft" as const,
    theme_id: "storelib-default",
    created_at: ago(60 * 48),
    updated_at: ago(60 * (i + 2)),
    published_at: null,
    snapshot_url: null,
    snapshot_mobile_url: null,
    snapshot_updated_at: null,
    saved_at: ago(60 * (i + 2)),
    theme: { name: "Storelib Default", version: "1.0.0", slug: "storelib-default" },
    settings: null,
  })),
]

const html = renderToStaticMarkup(
  createElement(
    TooltipProvider,
    null,
    createElement(WebsiteBuilderClient, { installs, username: "andrewullz" }),
  ),
)
writeFileSync(join(OUT, "page.html"), html)
/* The slow page's spinner, for the landing probe's "before" document. */
writeFileSync(join(OUT, "spinner.html"), renderToStaticMarkup(createElement(PageSpinner)))
void now
