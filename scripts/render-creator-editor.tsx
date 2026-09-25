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
import { defaultGlobalStoreSettings, defaultShopHeaderSettings } from "@/lib/store-builder/defaults"
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

function ProfilePage({ src }: { src: string }) {
  const chrome = resolveStorefrontChrome("default")
  const settings = { ...defaultShopHeaderSettings, coverImageUrl: src } as never
  return (
    <div
      data-storefront-root=""
      style={{ minHeight: "200vh", fontFamily: "Inter, system-ui, sans-serif", background: chrome.pageBackground, color: chrome.text, ...(chrome.tokens as React.CSSProperties) }}
    >
      <div style={{ height: 84 }} />
      <UnifiedShopHeader
        settings={settings}
        creator={creator}
        profile={profile}
        products={[]}
        globalSettings={defaultGlobalStoreSettings as never}
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
            />
            <OwnerMenu embedded />
          </div>
        }
      />
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
