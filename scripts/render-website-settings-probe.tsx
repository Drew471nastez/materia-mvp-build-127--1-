/**
 * Website Settings on its own, for scripts/check-website-settings.mjs: the
 * real component, open, over a page with nothing else on it. The editor's
 * part is played by a few lines of state, so a setting written here comes
 * back the way the editor's `updateSetting` sends it back.
 */
import * as React from "react"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import { AiStatus } from "@/components/website-builder/ai-status"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

declare global {
  interface Window {
    __section?: SettingsSection | null
    __settings?: ThemeSettingsValues
    __calls?: string[]
  }
}

/** The routes the pages call, answered the way the real ones answer. */
function stubFetch() {
  const calls: string[] = (window.__calls = [])
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? "GET"} ${url}`)
    if (url === "/api/domains" && init?.method === "POST") {
      const { domain } = JSON.parse(String(init.body ?? "{}")) as { domain: string }
      return json({ domain: { id: "d2", domain, status: "pending", verification_token: "storelib-verify-3f9c2a71d04b8e56a1c7f02e9d4b6a8c" } })
    }
    if (url === "/api/domains/verify") return json({ verified: false })
    if (url.startsWith("/api/domains")) {
      return json({ domains: [{ id: "d1", domain: "astridstudio.com", status: "active", ssl_status: "active", verified_at: "2026-09-01T10:00:00Z" }] })
    }
    if (url.includes("/backups")) {
      return json({
        backups: [
          { id: "b1", label: "Published", source: "publish", created_at: "2026-09-22T09:30:00Z" },
          { id: "b2", label: "Added a pricing section", source: "ai", created_at: "2026-09-21T16:05:00Z" },
        ],
      })
    }
    if (url.includes("/agent-connections")) return json({ connections: [], ready: true })
    if (url.includes("/github")) return json({ configured: true, ready: true, link: null, repos: [], accounts: [] })
    if (url.includes("/publish")) return json({ ok: true, status: "unpublished" })
    if (url.includes("/duplicate")) return json({ error: "You can keep 3 websites: one live and 2 drafts. Remove one to add another." }, 400)
    return json({})
  }) as typeof fetch
}

export function App() {
  const [open, setOpen] = React.useState(true)
  const [live, setLive] = React.useState(true)
  const [settings, setSettings] = React.useState<ThemeSettingsValues>({
    brand_name: "Astrid",
    seo_title: "",
    seo_description: "",
    font_heading: "Fraunces",
  })
  React.useEffect(() => {
    window.__settings = settings
  }, [settings])
  if (!open) return <p id="closed">closed</p>
  return (
    <ProjectSettings
      open
      onClose={() => setOpen(false)}
      installId="install-1"
      name="Astrid Studio"
      onRenamed={() => {}}
      websiteUrl="https://astrid.storelib.com"
      websiteUrlDisplay="astrid.storelib.com"
      live={live}
      publishedAt="2026-09-22T09:30:00Z"
      initialSection={window.__section ?? null}
      settings={settings}
      onSettingChange={(key, value) => setSettings((s) => ({ ...s, [key]: value }))}
      pages={[
        { key: "home", name: "Home", path: "/" },
        { key: "about", name: "About", path: "/about" },
        { key: "contact", name: "Contact", path: "/contact" },
        { key: "lookbook", name: "Lookbook", path: "/lookbook", custom: true },
      ]}
      productCount={7}
      onUnpublished={() => setLive(false)}
      onNavigate={(href) => window.__calls?.push(`navigate ${href}`)}
    />
  )
}

/** Storelib AI's status line, alone, as the chat draws it. */
function StatusLine() {
  const [label, setLabel] = React.useState("Starting…")
  React.useEffect(() => {
    ;(window as unknown as { __setStatus?: (l: string) => void }).__setStatus = setLabel
  }, [])
  return (
    <div className="bg-background p-6 text-foreground" style={{ width: 360 }}>
      <AiStatus label={label} />
    </div>
  )
}

export function boot(mount: (el: React.ReactElement) => void) {
  stubFetch()
  mount(new URLSearchParams(location.search).has("status") ? <StatusLine /> : <App />)
}
