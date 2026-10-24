/**
 * The Publish panel on its own, for scripts/check-publish-domain.mjs, with
 * app/api/domains answered the way the route answers it. `?plan=free` is a
 * plan without domains; `?domain=pending|active` a website domain already
 * connected; `?mobile=1` the phone's sheet.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { PublishPanel } from "@/components/website-builder/publish-panel"

const q = new URLSearchParams(location.search)
const plan = q.get("plan") ?? "pro"
const has = q.get("domain")
const mobile = q.get("mobile") === "1"
const calls: string[] = ((window as unknown as { __calls: string[] }).__calls = [])
let rows: unknown[] = has
  ? [{ id: "d1", domain: "astridstudio.com", status: has, ssl_status: has === "active" ? "active" : null, purpose: "website", is_primary: true, host: "www.astridstudio.com", apex: true, records: [{ type: "A", name: "@", value: "76.76.21.21" }, { type: "CNAME", name: "www", value: "cname.storelib.com" }] }]
  : []
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  calls.push(`${init?.method ?? "GET"} ${url}`)
  if (url === "/api/domains" && init?.method === "POST") {
    const { domain } = JSON.parse(String(init.body ?? "{}")) as { domain: string }
    const row = { id: "d2", domain, status: "pending", purpose: "website", is_primary: true, host: `www.${domain}`, apex: true, records: [{ type: "A", name: "@", value: "76.76.21.21" }, { type: "CNAME", name: "www", value: "cname.storelib.com" }] }
    rows = [row]
    return json({ domain: row })
  }
  /* As the route does: a check that passes marks the row connected, so the next read says so. */
  if (url === "/api/domains/verify") {
    rows = rows.map((r) => ({ ...(r as object), status: "active", ssl_status: "active" }))
    return json({ verified: true, sslPending: false })
  }
  if (url.startsWith("/api/domains")) return json({ domains: rows, canConnect: plan !== "free" })
  if (url.includes("/security")) return json({ issues: [], truncated: false })
  return json({})
}) as typeof fetch

function App() {
  const [open, setOpen] = React.useState(true)
  const anchor = React.useRef<HTMLButtonElement>(null)
  return (
    <div style={{ minHeight: "100vh", background: "#111", display: "flex", justifyContent: "flex-end", padding: 12 }}>
      <button ref={anchor} id="publish" onClick={() => setOpen((o) => !o)} style={{ height: 36, color: "#fff" }}>
        Publish
      </button>
      <PublishPanel
        open={open}
        installId="install-1"
        onOpenChange={setOpen}
        anchorRef={anchor}
        mobile={mobile}
        live
        pending
        publishedAt="2026-10-20T10:00:00Z"
        websiteUrl="https://astrid.storelib.com"
        websiteUrlDisplay="astrid.storelib.com"
        busy={false}
        onPublish={() => calls.push("publish")}
        backupsReady
        connectionsSettled
      />
    </div>
  )
}
createRoot(document.getElementById("app")!).render(<App />)
