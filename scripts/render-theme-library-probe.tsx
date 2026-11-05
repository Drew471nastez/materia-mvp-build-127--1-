/**
 * The Website page with a full Browse themes (ten listings, so the library
 * shows its eight and the marketplace card), drawn on the server for
 * scripts/check-theme-marketplace.mjs, and the same cards mounted live in a
 * browser for the hover. COVER is the address of a tall full page picture
 * the script serves.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { TooltipProvider } from "@/components/ui/tooltip"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/(storelib)/app/website-builder/website-builder-client"
import { probeListings } from "./theme-marketplace-fixtures"

const OUT = process.env.OUT_DIR!
const COVER = process.env.COVER ?? ""
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

const installs: WebsiteSummary[] = [
  {
    id: "live-1",
    name: "Storelib Default",
    status: "published",
    theme_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
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
]

const html = renderToStaticMarkup(
  createElement(TooltipProvider, null, createElement(WebsiteBuilderClient, { installs, username: "andrewullz", listings: probeListings(COVER) })),
)
writeFileSync(join(OUT, "library.html"), html)
