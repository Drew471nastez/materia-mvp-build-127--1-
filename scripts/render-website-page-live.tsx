/**
 * The Website page mounted in a real browser, for the parts of
 * scripts/check-website-page.mjs that need it to run: the full library sheet
 * and an import from file to arrival.
 *
 * `?scenario=full` is a library at the limit, so Import opens the sheet.
 * Anything else leaves room for one more. The router's refresh (stubbed by
 * the probe) calls `__probe.refresh()`, which adds the website the probe's
 * fake server said it made, the way the real refresh brings the new row.
 */
import { createElement } from "react"
import { createRoot } from "react-dom/client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/app/website-builder/website-builder-client"
import { THEME_INSTALL_LIMIT } from "@/lib/website-builder/theme-registry"

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function site(id: string, name: string, status: WebsiteSummary["status"], minutes: number): WebsiteSummary {
  return {
    id,
    name,
    status,
    theme_id: "storelib-default",
    created_at: ago(60 * 48),
    updated_at: ago(minutes),
    published_at: status === "published" ? ago(minutes) : null,
    snapshot_url: null,
    snapshot_mobile_url: null,
    snapshot_updated_at: null,
    saved_at: ago(minutes),
    theme: { name: "Storelib Default", version: "1.0.0", slug: "storelib-default" },
    settings: null,
  }
}

const params = new URLSearchParams(location.search)
const scenario = params.get("scenario")
const full = scenario === "full"
/* `?drafts=N` sets how many drafts sit beside the live website: 0 is a library of one, 3 makes the import the fifth. */
const drafts = params.has("drafts") ? Number(params.get("drafts")) : full ? THEME_INSTALL_LIMIT - 1 : 2
const names = ["Studio", "Atelier", "Coach", "Chair", "Loft", "Mill"]
let installs: WebsiteSummary[] = [
  /* `?scenario=offline`: the website that was live has been taken offline, and nothing is live. */
  scenario === "offline"
    ? { ...site("live-1", "Storelib Default", "unpublished", 4), published_at: ago(90) }
    : site("live-1", "Storelib Default", "published", 4),
  ...Array.from({ length: drafts }, (_, i) => site(`lib-${i}`, names[i], "draft", 60 * (i + 2))),
]

type ProbeWindow = Window & { __probe?: { refresh: () => void }; __probeNext?: { id: string; name: string } | null }
const w = window as ProbeWindow

const root = createRoot(document.getElementById("root")!)
function render() {
  root.render(
    createElement(
      TooltipProvider,
      null,
      createElement(
        "div",
        { "data-probe-shell": "", style: { height: "100vh" } },
        createElement(WebsiteBuilderClient, { installs, username: "andrewullz" }),
      ),
    ),
  )
}

w.__probe = {
  refresh() {
    const next = w.__probeNext
    if (next) {
      installs = [...installs, site(next.id, next.name, "draft", 0)]
      w.__probeNext = null
    }
    render()
  },
}
render()
