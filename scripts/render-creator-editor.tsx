/**
 * ===========================================================================
 *  THE CREATOR PAGE EDITOR'S OWN CONTROLS, FOR A BROWSER TO DRIVE
 * ===========================================================================
 * Served by scripts/check-creator-editor.mjs. The real UnifiedShopHeader with
 * the real owner controls in its slot (EditProfileButton and OwnerMenu), on a
 * page painted by the real scheme resolver, and `fetch` answered here so a
 * save, an upload and a scheme preview can be driven without a server.
 *
 *   #profile   the header and its controls, for open / close / reopen runs
 *   #share     the workspace's "Your page is live" card, on its own
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { UnifiedShopHeader } from "@/components/store-builder/unified-section-renderer"
import { EditProfileButton } from "@/components/storefront/edit-profile-button"
import { OwnerMenu } from "@/components/storefront/owner-menu"
import { CreatorPageShare } from "@/components/app/creator-page-share"
import { defaultGlobalStoreSettings, defaultShopHeaderSettings, themePresets } from "@/lib/store-builder/defaults"
import { schemeRootPaints } from "@/lib/store-builder/scheme-preview"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"

declare global {
  interface Window {
    __ready: boolean
    __bodies: unknown[]
    __hold: boolean
    __release?: () => void
    __refreshes: number
    __renders: number
    __setShare?: (open: boolean) => void
    __onReplace?: (href: string) => void
    __onRefresh?: () => void
    __rtt?: number
  }
}
window.__refreshes = 0
window.__renders = 0
window.__ready = false

function cover(): string {
  const c = document.createElement("canvas")
  c.width = 1500
  c.height = 500
  const g = c.getContext("2d")!
  const grad = g.createLinearGradient(0, 0, 1500, 500)
  grad.addColorStop(0, "#2f5d46")
  grad.addColorStop(1, "#d9c7a3")
  g.fillStyle = grad
  g.fillRect(0, 0, 1500, 500)
  return c.toDataURL("image/png")
}

const creator = { id: "c1", slug: "andrewrullz", niche_tags: [], show_total_sales_badge: false } as never
const profile = { id: "p1", username: "andrewrullz", display_name: "AndrewRullz", avatar_url: null } as never

/**
 * The server, as far as a scheme is concerned: the router stub hands every
 * replace() here, and the page is drawn again in the scheme the address asks
 * for after a round trip's worth of delay, the way the real page would be.
 */
function ProfilePage({ src }: { src: string }) {
  const [drawn, setDrawn] = React.useState<string>("default")
  const [saved, setSaved] = React.useState<string>("default")
  React.useEffect(() => {
    window.__onReplace = (href: string) => {
      const scheme = new URL(href, location.href).searchParams.get("scheme")
      window.setTimeout(() => setDrawn(scheme && scheme in themePresets ? scheme : saved), window.__rtt ?? 250)
    }
    window.__onRefresh = () => {
      const last = window.__bodies.filter((b) => (b as { body?: { themePreset?: string } }).body?.themePreset).pop() as { body: { themePreset: string } } | undefined
      if (last) { setSaved(last.body.themePreset); setDrawn(last.body.themePreset) }
    }
  }, [saved])
  const chrome = resolveStorefrontChrome(drawn)
  const theme = themePresets[drawn as keyof typeof themePresets]
  const roots = React.useMemo(() => schemeRootPaints({}), [])
  const settings = { ...defaultShopHeaderSettings, coverImageUrl: src } as never
  return (
    <div
      data-storefront-root=""
      style={{ minHeight: "200vh", fontFamily: "Inter, system-ui, sans-serif", background: chrome.pageBackground, color: chrome.text, ...(chrome.tokens as React.CSSProperties) }}
    >
      <div data-bar="" style={{ height: 84, background: chrome.bar.backgroundColor, color: chrome.bar.textColor }} />
      <UnifiedShopHeader
        settings={settings}
        creator={creator}
        profile={profile}
        products={[]}
        globalSettings={{ ...(defaultGlobalStoreSettings as object), themePreset: drawn } as never}
        surface={{ textColor: chrome.text, mutedColor: chrome.muted }}
        ownerActions={
          <div className="flex items-center gap-2">
            <EditProfileButton
              embedded
              displayName="AndrewRullz"
              bio="Guides and presets."
              username="andrewrullz"
              avatarUrl={null}
              coverUrl={src}
              socialLinks={{}}
              themePreset={saved}
              schemeRoots={roots}
            />
            <OwnerMenu embedded />
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} data-card="" className="rounded-lg border p-3" style={{ background: theme.productCard.backgroundColor, borderColor: theme.productCard.borderColor, color: theme.productCard.textColor }}>
            <div className="aspect-video rounded bg-muted" />
            <p className="mt-2 text-sm font-medium">Preset pack {i + 1}</p>
            <p className="text-sm" style={{ color: theme.productCard.priceColor }}>$12</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SharePage() {
  const [open, setOpen] = React.useState(false)
  const phone = window.innerWidth < 768
  window.__setShare = setOpen
  return (
    <div className="relative h-svh overflow-hidden bg-[#f1f1f3]">
      <div style={{ height: 46, background: "#fff" }} />
      <div style={{ position: "absolute", inset: "46px 0 0 0", background: "linear-gradient(#fafafa, #e5e7eb)" }} />
      <CreatorPageShare open={open} onClose={() => setOpen(false)} handle="andrewrullz" isPhone={phone} />
    </div>
  )
}

async function main() {
  const mode = location.hash.replace("#", "") || "profile"
  window.__bodies = []
  window.__hold = false
  window.fetch = (async (url: unknown, init?: RequestInit) => {
    window.__bodies.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
    if (window.__hold) await new Promise<void>((resolve) => { window.__release = resolve })
    if (String(url).includes("/api/domains")) return new Response(JSON.stringify({ domains: [] }), { status: 200 })
    return new Response(JSON.stringify({ ok: true, storefront: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  const root = createRoot(document.getElementById("app")!)
  if (mode === "share") root.render(<SharePage />)
  else root.render(<ProfilePage src={cover()} />)
  window.__ready = true
}

void main()
