/**
 * A creator page with no products, and a member's /account communities row,
 * for scripts/check-creator-no-products.mjs. The real components, composed
 * the way app/(storelib)/(marketing)/u/[username]/page.tsx composes them:
 *
 *   ?<scheme>&<view>&<content>
 *     scheme    default (Storelib light), sage (tinted), astrid (dark)
 *     view      visitor, owner (the owner gets the first product line)
 *     content   communities   nothing left in Home, two communities made
 *               text          a text section in Home, and the communities
 *               nothing       no sections, no communities
 *   ?rows       /account Communities for a plain member (AndrewRullz's
 *               community, default "Members" tier), an owner and a request
 */
import { createRoot } from "react-dom/client"
import { ProfileSocial } from "@/components/profile/profile-social"
import { StorefrontTabs } from "@/components/storefront/storefront-tabs"
import { FirstProductPrompt, sectionsWithoutProducts, tabsWithoutProducts } from "@/components/storefront/no-products"
import { creatorCommunitiesPanel } from "@/components/profile/creator-communities-tab"
import { UnifiedShopHeader, UnifiedSectionRenderer } from "@/components/store-builder/unified-section-renderer"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { LibraryCommunitiesList } from "@/components/community/public/library-list"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"
import { defaultAboutSettings, defaultFeaturedProductsSettings, defaultGlobalStoreSettings, defaultShopHeaderSettings, defaultTextBlockSettings } from "@/lib/store-builder/defaults"
import type { CommunityCard } from "@/lib/communities/types"
import type { LibraryCommunityRow } from "@/components/community/public/types"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const FACE = svg(128, 128, `<rect width="128" height="128" fill="#9fb3a8"/><circle cx="64" cy="52" r="24" fill="#eef2ee"/><rect x="28" y="86" width="72" height="44" rx="22" fill="#eef2ee"/>`)
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const LOGO2 = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#d9cbb6"/><circle cx="64" cy="64" r="28" fill="#8f7a5f"/>`)
const COVER = svg(1600, 600, `<rect width="1600" height="600" fill="#cfdbd5"/><path d="M0 420 C 400 300, 800 520, 1600 360 L1600 600 L0 600 Z" fill="#6f8f7f"/><circle cx="1260" cy="160" r="80" fill="#f2efe6"/>`)

window.fetch = (async () => new Response(JSON.stringify({ following: true, followers: 1 }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch

const card = (id: string, name: string, tagline: string, logo: string | null, cover: string | null, members: number, price: string | null): CommunityCard => ({
  id,
  slug: id,
  name,
  tagline,
  logoUrl: logo,
  coverUrl: cover,
  category: null,
  access: price ? "paid" : "free",
  visibility: "public",
  memberCount: members,
  priceLine: price ?? "Free",
  creator: { id: "cr", name: "Maya Ortiz", username: "maya", avatarUrl: FACE },
  url: `/community/${id}`,
})
const communities = [card("clay-studio", "Clay Studio", "A working studio for people learning wheel throwing at home.", LOGO, COVER, 1240, "$19/month"), card("night-runners", "Night Runners", "Easy miles after dark, every Tuesday.", LOGO2, null, 86, null)]

const q = new URLSearchParams(location.search)
let app: React.ReactNode = null

if (q.has("rows")) {
  const row = (id: string, name: string, role: LibraryCommunityRow["role"], status: LibraryCommunityRow["status"], tierName: string | null): LibraryCommunityRow => ({
    id,
    slug: id,
    name,
    logoUrl: LOGO,
    coverUrl: null,
    creatorName: "AndrewRullz",
    status,
    role,
    tierName,
    memberCount: 4,
    url: `/community/${id}`,
    card: { ...card(id, name, "One love ponda' Salajan", LOGO, null, 4, null), creator: { id: "a", name: "AndrewRullz", username: "andrewrullz", avatarUrl: FACE } },
  })
  app = (
    <main className="min-h-screen bg-[#f8f9fa] px-4 py-6">
      <div className="mx-auto max-w-[640px]">
        <LibraryCommunitiesList rows={[row("salajanywood-club", "SalajanyWood Club", "member", "active", "Members"), row("gold-room", "Gold Room", "member", "active", "Gold"), row("own-club", "Own Club", "owner", "active", "Members"), row("asked-club", "Asked Club", "member", "pending", null)]} />
      </div>
    </main>
  )
} else {
  const scheme = q.has("astrid") ? "astrid" : q.has("sage") ? "sage" : "default"
  const owner = q.has("owner")
  const content = q.has("text") ? "text" : q.has("nothing") ? "nothing" : "communities"
  const chrome = resolveStorefrontChrome(scheme)
  const cards = content === "nothing" ? [] : communities
  /* The page's sections: a Featured rail always (the page drops it without products), and a text block for "text". */
  const sections = sectionsWithoutProducts(
    [
      { id: "f", type: "featured-products", order: 0, settings: { ...defaultFeaturedProductsSettings } },
      ...(content === "text" ? [{ id: "t", type: "text-block", order: 1, settings: { ...defaultTextBlockSettings, headline: "Studio notes", body: "Glaze recipes, firing logs and the occasional failure, written up every week." } }] : []),
    ],
    0,
  )
  const home = sections.length ? (
    <>
      {sections.map((s) => (
        <UnifiedSectionRenderer key={s.id} section={s as never} products={[]} globalSettings={defaultGlobalStoreSettings as never} creatorName="Maya Ortiz" />
      ))}
    </>
  ) : null
  const tabs = tabsWithoutProducts({ home, communitiesPanel: creatorCommunitiesPanel(cards), communities: cards })
  const settings = { ...defaultShopHeaderSettings, showBio: true, bio: "Ceramics, glaze recipes and a weekly studio community.", showStats: true, coverImageUrl: COVER } as never
  app = (
    <div data-storefront-root="" style={{ background: chrome.pageBackground, minHeight: "100vh", color: chrome.text, ...(chrome.tokens as React.CSSProperties) }}>
      <UnifiedShopHeader
        settings={settings}
        creator={{ cover_url: COVER, bio: null, show_total_sales_badge: true } as never}
        profile={{ display_name: "Maya Ortiz", avatar_url: FACE, username: "maya", created_at: "2024-01-01" } as never}
        productCount={0}
        globalSettings={defaultGlobalStoreSettings as never}
        surface={{ textColor: chrome.text, mutedColor: chrome.muted, avatarBorderColor: chrome.avatarBorder }}
        followRow={owner ? null : <ProfileSocial tone="storefront" scheme={chrome.action} userId="00000000-0000-4000-8000-0000000000c3" name="Maya Ortiz" showCounts={false} viewerFollowing={false} signedIn isSelf={false} />}
      />
      <div data-probe-catalogue="">
        {owner ? <FirstProductPrompt scheme={chrome.action} /> : null}
        {tabs.length ? <StorefrontTabs tabs={tabs} surface={{ textColor: chrome.text, mutedColor: chrome.muted, borderColor: chrome.border }} /> : null}
      </div>
      <div data-probe-about="">
        <UnifiedSectionRenderer
          section={{ id: "about", type: "about", order: 0, settings: { ...defaultAboutSettings, colors: { textColor: chrome.text } } } as never}
          creatorName="Maya Ortiz"
          sellerMemberSince="2024-01-01T00:00:00Z"
          sellerTotalSales={0}
          sellerProductsCount={0}
          globalSettings={defaultGlobalStoreSettings as never}
        />
      </div>
      <SellerFooter surface={{ backgroundColor: chrome.footerBackground, textColor: chrome.footerText, mutedColor: chrome.footerMuted, borderColor: chrome.border }} />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(app)
