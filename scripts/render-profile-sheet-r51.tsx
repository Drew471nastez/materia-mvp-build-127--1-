/**
 * ===========================================================================
 *  THE PROFILE DETAILS SHEET, ON A PAGE THAT ANSWERS LIKE THE SERVER (r51)
 * ===========================================================================
 * Served by scripts/check-profile-sheet-r51.mjs. The real UnifiedShopHeader
 * and the real About block with the real EditProfileButton in the header's
 * owner slot. `fetch` stands in for /api/creator-profile: a PATCH is merged
 * the way the route merges it (socials through resolveSocialInput, the three
 * switches, the scheme), and a refresh draws the page again from what was
 * saved. So "the page shows it before Save", "Save keeps it" and "Cancel puts
 * it back" are each something the browser can read off the page.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { UnifiedShopHeader } from "@/components/store-builder/unified-section-renderer"
import { SectionRenderer } from "@/components/store-builder/section-renderer"
import { EditProfileButton } from "@/components/storefront/edit-profile-button"
import { defaultAboutSettings, defaultGlobalStoreSettings, defaultShopHeaderSettings, themePresets } from "@/lib/store-builder/defaults"
import { schemeRootPaints } from "@/lib/store-builder/scheme-preview"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"
import { SOCIAL_PLATFORM_KEYS, resolveSocialInput } from "@/lib/social/platforms"
import { cropFromSettings } from "@/lib/images/cover-crop"

declare global {
  interface Window {
    __ready: boolean
    __bodies: Array<{ url: string; body: Record<string, unknown> | null }>
    __hold: boolean
    __release?: () => void
    __refreshes: number
    __onReplace?: (href: string) => void
    __onRefresh?: () => void
    __rtt?: number
    __saved: Saved
    __uploadedUrl?: string
  }
}
window.__refreshes = 0
window.__ready = false

function picture(w: number, h: number, a: string, b: string): string {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const g = c.getContext("2d")!
  const grad = g.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, a)
  grad.addColorStop(1, b)
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  g.fillStyle = "rgba(255,255,255,0.85)"
  g.font = `${Math.round(h / 6)}px sans-serif`
  g.fillText("STORELIB", w * 0.38, h * 0.55)
  return c.toDataURL("image/png")
}

interface Saved {
  name: string
  bio: string
  avatar: string | null
  cover: string | null
  coverFocalPoint: { x: number; y: number } | null
  coverZoom: number | null
  socialLinks: Record<string, { enabled: boolean; url: string }>
  showStats: boolean
  showReviews: boolean
  showTotalSalesBadge: boolean
  hideSocialLinks: boolean
  scheme: string
}

const params = new URLSearchParams(location.search)
const startScheme = params.get("scheme0") || "default"

function initialSaved(): Saved {
  return {
    name: "AndrewRullz",
    bio: "Guides and presets for film photographers.",
    avatar: picture(400, 400, "#7c5cff", "#f0abfc"),
    cover: picture(1500, 500, "#2f5d46", "#d9c7a3"),
    coverFocalPoint: null,
    coverZoom: null,
    socialLinks: {
      instagram: { enabled: true, url: "https://www.instagram.com/andrewrullz" },
      tiktok: { enabled: true, url: "https://www.tiktok.com/@andrewrullz" },
      youtube: { enabled: false, url: "" },
      twitter: { enabled: false, url: "" },
      facebook: { enabled: false, url: "" },
      linkedin: { enabled: false, url: "" },
      twitch: { enabled: false, url: "" },
      spotify: { enabled: false, url: "" },
    },
    showStats: true,
    showReviews: true,
    showTotalSalesBadge: true,
    hideSocialLinks: false,
    scheme: startScheme,
  }
}

/** /api/creator-profile's merge, for the fields this sheet sends. */
function merge(saved: Saved, body: Record<string, unknown>): Saved {
  const next = { ...saved }
  if (typeof body.displayName === "string") next.name = body.displayName.trim()
  if (typeof body.bio === "string") next.bio = body.bio.trim()
  if ("avatarUrl" in body) next.avatar = (body.avatarUrl as string | null) ?? null
  if ("coverUrl" in body) next.cover = (body.coverUrl as string | null) ?? null
  if ("coverFocalPoint" in body) next.coverFocalPoint = (body.coverFocalPoint as Saved["coverFocalPoint"]) ?? null
  if ("coverZoom" in body) next.coverZoom = (body.coverZoom as number | null) ?? null
  if (body.socialLinks && typeof body.socialLinks === "object") {
    const src = body.socialLinks as Record<string, unknown>
    const out: Saved["socialLinks"] = {}
    for (const key of SOCIAL_PLATFORM_KEYS) {
      const url = resolveSocialInput(key, src[key])
      out[key] = url ? { enabled: true, url } : { enabled: false, url: "" }
    }
    next.socialLinks = out
  }
  const d = (body.display || {}) as Record<string, unknown>
  if (typeof d.showReviews === "boolean") {
    next.showReviews = d.showReviews
    if (d.showReviews) next.showStats = true
  }
  if (typeof d.showTotalSalesBadge === "boolean") next.showTotalSalesBadge = d.showTotalSalesBadge
  if (typeof d.showSocialMedia === "boolean") next.hideSocialLinks = !d.showSocialMedia
  if (typeof body.themePreset === "string" && body.themePreset in themePresets) next.scheme = body.themePreset
  return next
}

function ProfilePage() {
  const [saved, setSaved] = React.useState<Saved>(initialSaved)
  const [drawn, setDrawn] = React.useState<string>(startScheme)
  window.__saved = saved
  React.useEffect(() => {
    window.__onReplace = (href: string) => {
      const scheme = new URL(href, location.href).searchParams.get("scheme")
      window.setTimeout(() => setDrawn(scheme && scheme in themePresets ? scheme : saved.scheme), window.__rtt ?? 120)
    }
    window.__onRefresh = () => {
      let next = saved
      for (const b of window.__bodies) if (b.url.includes("/api/creator-profile") && b.body) next = merge(next, b.body)
      window.__bodies = []
      setSaved(next)
      setDrawn(next.scheme)
    }
  }, [saved])
  const chrome = resolveStorefrontChrome(drawn)
  const theme = themePresets[drawn as keyof typeof themePresets]
  const roots = React.useMemo(() => schemeRootPaints({}), [])
  const settings = {
    ...defaultShopHeaderSettings,
    coverImageUrl: saved.cover ?? undefined,
    avatarUrl: saved.avatar ?? "",
    bio: saved.bio,
    coverFocalPoint: saved.coverFocalPoint ?? undefined,
    coverZoom: saved.coverZoom ?? undefined,
    socialLinks: saved.socialLinks,
    showStats: saved.showStats,
    showReviews: saved.showReviews,
    showTotalSalesBadge: saved.showTotalSalesBadge,
    hideSocialLinks: saved.hideSocialLinks,
  } as never
  const crop = cropFromSettings(saved.coverFocalPoint, saved.coverZoom)
  void crop
  const links = Object.fromEntries(Object.entries(saved.socialLinks).map(([k, v]) => [k, v.url]))
  const salesShown = saved.showTotalSalesBadge
  return (
    <div
      data-storefront-root=""
      style={{ minHeight: "200vh", fontFamily: "Inter, system-ui, sans-serif", background: chrome.pageBackground, color: chrome.text, ...(chrome.tokens as React.CSSProperties) }}
    >
      <div data-bar="" style={{ height: 56, background: chrome.bar.backgroundColor, color: chrome.bar.textColor }} />
      <UnifiedShopHeader
        settings={settings}
        creator={{ id: "c1", slug: "andrewrullz", niche_tags: [], show_total_sales_badge: salesShown } as never}
        profile={{ id: "p1", username: "andrewrullz", display_name: saved.name, avatar_url: saved.avatar } as never}
        products={[]}
        globalSettings={{ ...(defaultGlobalStoreSettings as object), themePreset: drawn } as never}
        surface={{ textColor: chrome.text, mutedColor: chrome.muted }}
        reviewCount={12}
        reviewAverage={4.8}
        ownerActions={
          <EditProfileButton
            embedded
            displayName={saved.name}
            bio={saved.bio}
            username="andrewrullz"
            avatarUrl={saved.avatar}
            coverUrl={saved.cover}
            coverFocalPoint={saved.coverFocalPoint}
            coverZoom={saved.coverZoom}
            socialLinks={links}
            display={{
              showReviews: saved.showStats && saved.showReviews,
              showTotalSalesBadge: saved.showTotalSalesBadge,
              showSocialMedia: !saved.hideSocialLinks,
            }}
            themePreset={saved.scheme}
            schemeRoots={roots}
          />
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
      <div data-about="">
        <SectionRenderer
          section={{ id: "about", type: "about", order: 9, settings: { ...defaultAboutSettings, showSalesStats: true } } as never}
          products={[]}
          globalSettings={{ ...(defaultGlobalStoreSettings as object), themePreset: drawn } as never}
          creatorName={saved.name}
          creatorUsername="andrewrullz"
          sellerMemberSince="2024-03-01T00:00:00Z"
          sellerTotalSales={salesShown ? 482 : 0}
          sellerProductsCount={3}
          aboutOwnerActions={<span />}
        />
      </div>
    </div>
  )
}

async function main() {
  window.__bodies = []
  window.__hold = false
  window.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    window.__bodies.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (window.__hold) await new Promise<void>((resolve) => { window.__release = resolve })
    if (u.includes("/api/creator-page/viewer")) return new Response(JSON.stringify({ owner: true, bought: false, contactEmail: null, totalSales: 482 }), { status: 200 })
    return new Response(JSON.stringify({ ok: true, storefront: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  createRoot(document.getElementById("app")!).render(<ProfilePage />)
  window.__ready = true
}

void main()
