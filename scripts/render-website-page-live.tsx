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

/**
 * `&snapshot=1` gives the live website a real picture, the way the server
 * hands one over after a save: a 1440x900 page with a white bar at the top
 * (so a hairline has to keep it off the white card), a dark hero and a row of
 * products. Taken after the last save, so the page does not ask for another.
 */
const SITE_PICTURE =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">
<rect width="1440" height="900" fill="#ffffff"/>
<text x="72" y="46" font-family="Inter, Arial" font-size="22" font-weight="700" fill="#111">Northwind</text>
<g font-family="Inter, Arial" font-size="15" fill="#444"><text x="560" y="45">Home</text><text x="640" y="45">Services</text><text x="740" y="45">Portfolio</text><text x="840" y="45">How it works</text></g>
<rect x="1248" y="22" width="120" height="36" rx="8" fill="#3b6cf6"/><text x="1308" y="46" text-anchor="middle" font-family="Inter, Arial" font-size="14" font-weight="600" fill="#fff">Contact</text>
<rect y="80" width="1440" height="480" fill="#0b0b0c"/>
<g font-family="Inter, Arial" font-weight="500" fill="#fff" font-size="64" letter-spacing="-2"><text x="120" y="230">LinkedIn posts</text><text x="120" y="300">for founders.</text><text x="120" y="370">Content for brands.</text></g>
<text x="120" y="420" font-family="Inter, Arial" font-size="18" fill="#bbb">Ghostwriting and SEO content, written with you every week.</text>
<rect x="120" y="456" width="180" height="48" rx="6" fill="#3b6cf6"/><text x="210" y="486" text-anchor="middle" font-family="Inter, Arial" font-size="15" font-weight="600" fill="#fff">Choose a service</text>
<rect x="900" y="150" width="360" height="340" rx="14" fill="#f4f4f5"/><rect x="930" y="180" width="300" height="180" rx="8" fill="#d9dce3"/><rect x="930" y="384" width="200" height="14" rx="7" fill="#9aa0ad"/><rect x="930" y="410" width="140" height="14" rx="7" fill="#c3c7cf"/>
<g fill="#f1f2f4"><rect x="120" y="610" width="380" height="240" rx="12"/><rect x="530" y="610" width="380" height="240" rx="12"/><rect x="940" y="610" width="380" height="240" rx="12"/></g>
</svg>`)

const params = new URLSearchParams(location.search)
const scenario = params.get("scenario")
/* `&snapshot=slow`: the same picture from the probe's server, answered late, so the cover's box can be measured before it arrives. */
const slowPicture = params.get("snapshot") === "slow"
const withPicture = params.get("snapshot") === "1" || slowPicture
const full = scenario === "full"
/* `?drafts=N` sets how many drafts sit beside the live website: 0 is a library of one, 3 makes the import the fifth. */
const drafts = params.has("drafts") ? Number(params.get("drafts")) : full ? THEME_INSTALL_LIMIT - 1 : 2
const names = ["Studio", "Atelier", "Coach", "Chair", "Loft", "Mill"]
let installs: WebsiteSummary[] = [
  /* `?scenario=offline`: the website that was live has been taken offline, and nothing is live. */
  scenario === "offline"
    ? { ...site("live-1", "Storelib Default", "unpublished", 4), published_at: ago(90) }
    : withPicture
      ? { ...site("live-1", "Storelib Default", "published", 4), snapshot_url: slowPicture ? "/slow-cover.svg" : SITE_PICTURE, snapshot_updated_at: ago(1) }
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
      /* An import is first in the library: the server gives it the lowest place (lib/website-builder/library-limit.ts). */
      installs = [site(next.id, next.name, "draft", 0), ...installs]
      w.__probeNext = null
    }
    render()
  },
}
render()
