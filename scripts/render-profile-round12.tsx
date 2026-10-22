/**
 * Profiles, round 12, for scripts/check-profile-round12.mjs. The real
 * components, composed as the routes compose them, with the router and
 * Supabase stubbed by the probe:
 *
 *   ?case=person&photo=yes|no&self=0|1&back=0|1   /@maya, a person without a
 *                       store (MemberProfilePage, the creator page's template
 *                       without products), under the real ConditionalHeader
 *                       at /@maya, which must draw nothing
 *   ?case=creator       a creator page with no products in the default
 *                       scheme, as app/(marketing)/u/[username] builds it
 *                       (the newsletter bar, the header, the tabs, About and
 *                       the footer, through components/storefront/
 *                       storefront-template), to be measured against the
 *                       person's page
 *   ?case=settings&supported=1|0   the account's Profile settings with the
 *                       city and country fields (or without, before part 98)
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { MemberProfilePage } from "@/components/profile/member-profile-page"
import { ProfileSocial } from "@/components/profile/profile-social"
import { StorefrontTabs } from "@/components/storefront/storefront-tabs"
import { tabsWithoutProducts } from "@/components/storefront/no-products"
import { creatorCommunitiesPanel } from "@/components/profile/creator-communities-tab"
import { UnifiedShopHeader, UnifiedSectionRenderer } from "@/components/store-builder/unified-section-renderer"
import { SubscribeBar } from "@/components/store-builder/subscribe-bar"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { AccountSettings } from "@/components/account/account-settings"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"
import { storefrontFooterSurface, storefrontHeaderSurface, storefrontRootStyle, storefrontTabsSurface } from "@/components/storefront/storefront-template"
import { defaultAboutSettings, defaultGlobalStoreSettings, defaultShopHeaderSettings } from "@/lib/store-builder/defaults"
import { locationLine } from "@/lib/profile/location"
import type { CommunityCard } from "@/lib/communities/types"
import type { MemberProfileData } from "@/lib/profile/member-profile-data"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const FACE = svg(128, 128, `<rect width="128" height="128" fill="#9fb3a8"/><circle cx="64" cy="52" r="24" fill="#eef2ee"/><rect x="28" y="86" width="72" height="44" rx="22" fill="#eef2ee"/>`)
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const LOGO2 = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#d9cbb6"/><circle cx="64" cy="64" r="28" fill="#8f7a5f"/>`)
const COVER = svg(1600, 600, `<rect width="1600" height="600" fill="#cfdbd5"/><path d="M0 420 C 400 300, 800 520, 1600 360 L1600 600 L0 600 Z" fill="#6f8f7f"/><circle cx="1260" cy="160" r="80" fill="#f2efe6"/>`)

const q = new URLSearchParams(location.search)
const kase = q.get("case") || "person"

const card = (id: string, name: string, tagline: string, logo: string | null, members: number, price: string | null, creator: string): CommunityCard => ({
  id,
  slug: id,
  name,
  tagline,
  logoUrl: logo,
  coverUrl: null,
  category: null,
  access: price ? "paid" : "free",
  visibility: "public",
  memberCount: members,
  priceLine: price ?? "Free",
  creator: { id: "cr", name: creator, username: creator.toLowerCase().replace(/\s+/g, ""), avatarUrl: FACE },
  url: `/community/${id}`,
})
const CARDS = [card("clay-studio", "Clay Studio", "A working studio for people learning wheel throwing.", LOGO, 1240, "$19/month", "Mara Lind"), card("night-runners", "Night Runners", "Easy miles after dark.", null, 86, null, "Theo Grant"), card("glaze-lab", "Glaze Lab", "Recipes and kiln logs.", LOGO2, 1, null, "Ana Pop")]

function Person() {
  const photo = q.get("photo") !== "no"
  const self = q.get("self") === "1"
  const profile: MemberProfileData = { socials: [],
    userId: "00000000-0000-4000-8000-0000000000a1",
    name: "Maya Ortiz",
    username: "maya",
    avatarUrl: photo ? FACE : null,
    coverUrl: photo ? COVER : null,
    bio: "Learning to throw pots. Night runs on Tuesdays.",
    memberSince: "January 2025",
    joinedAt: "2025-01-04T10:00:00Z",
    hasStorefront: false,
    storefrontHandle: "maya",
    creatorId: null,
    followers: 128,
    following: 41,
    products: [],
    productCount: 0,
    reviews: [],
    privacy: { showActivity: true, showCommunities: true } as never,
  }
  const now = Date.parse("2026-10-04T12:00:00Z")
  const activity = [
    { key: "a1", at: "2026-10-03T09:00:00Z", kind: "posted" as const, title: "First bowl that did not collapse", context: "Wins · Clay Studio", excerpt: null, rating: null, href: "/community/clay-studio/post/1", imageUrl: LOGO },
    { key: "a2", at: "2026-09-28T19:00:00Z", kind: "joined" as const, title: "Night Runners", context: null, excerpt: null, rating: null, href: "/community/night-runners", imageUrl: LOGO2 },
    { key: "a3", at: "2026-09-20T19:00:00Z", kind: "completed_course" as const, title: "Wheel basics", context: "Clay Studio", excerpt: null, rating: null, href: "/community/clay-studio/classroom", imageUrl: LOGO },
  ]
  return (
    <MemberProfilePage
      profile={profile}
      viewerId={self ? profile.userId : "00000000-0000-4000-8000-0000000000b2"}
      viewerFollowing={false}
      extras={{
        activity: { items: activity, next: null, hidden: false },
        communities: { enabled: q.get("communities") !== "off", owned: [], member: CARDS },
        shared: [],
        backShown: q.get("back") === "1",
        now,
        location: photo ? locationLine({ city: "Lisbon", country: "PT" }) : null,
      }}
    />
  )
}

/** A creator page with no products and some communities, in the default scheme, as the route builds it. */
function Creator() {
  const chrome = resolveStorefrontChrome("default")
  /* Home with a section in it, so the strip is drawn and its type can be measured against the person's. */
  const tabs = tabsWithoutProducts({ home: <p className="mx-auto max-w-[1180px] px-3 sm:px-4 lg:px-6">Studio notes</p>, communitiesPanel: creatorCommunitiesPanel(CARDS), communities: CARDS })
  return (
    <div className="min-h-screen overflow-x-hidden" data-storefront-root="" style={storefrontRootStyle(chrome)}>
      <SubscribeBar
        settings={{
          visible: true, customCtaText: "", text: "", placeholder: "Enter your email", buttonText: "", dismissible: false, position: "top", showAvatar: true,
          avatarUrl: FACE, creatorName: "Calvin", backgroundColor: chrome.bar.backgroundColor, textColor: chrome.bar.textColor, buttonColor: chrome.bar.buttonColor, buttonTextColor: chrome.bar.buttonTextColor,
          style: "style1", enableStickyBar: true, enableStickyOnScrollUp: true, buttonStyle: "style1", creatorUserId: "u-calvin",
        } as never}
        creatorId="c-calvin"
      />
      <UnifiedShopHeader
        settings={{ ...defaultShopHeaderSettings, coverImageUrl: COVER } as never}
        creator={{ cover_url: null, bio: "Hand tools and slow furniture.", show_total_sales_badge: true } as never}
        profile={{ display_name: "Calvin Reyes", avatar_url: FACE, username: "calvin", created_at: "2025-01-04" } as never}
        productCount={0}
        globalSettings={defaultGlobalStoreSettings as never}
        surface={storefrontHeaderSurface(chrome)}
        followRow={<ProfileSocial tone="storefront" scheme={chrome.action} userId="00000000-0000-4000-8000-0000000000c3" name="Calvin" showCounts={false} viewerFollowing={false} signedIn isSelf={false} location={locationLine({ city: "Lisbon", country: "PT" })} />}
      />
      {tabs.length ? <StorefrontTabs tabs={tabs} surface={storefrontTabsSurface(chrome)} /> : null}
      <div data-probe-about="">
        <UnifiedSectionRenderer
          section={{ id: "about-default", type: "about", order: 1, settings: { ...defaultAboutSettings, colors: { textColor: chrome.text } } } as never}
          creatorName="Calvin Reyes"
          sellerMemberSince="2025-01-04T08:47:37Z"
          sellerTotalSales={0}
          sellerProductsCount={0}
          globalSettings={defaultGlobalStoreSettings as never}
        />
      </div>
      <SellerFooter surface={storefrontFooterSurface(chrome)} />
    </div>
  )
}

function Settings() {
  const supported = q.get("supported") !== "0"
  return (
    <main className="mx-auto max-w-[680px] px-4 py-6" data-probe-route="settings">
      <AccountSettings
        userId="user-1"
        email="ava@example.com"
        name="Ava Stone"
        bio="Ceramics on weekends."
        bioSupported
        avatarUrl={null}
        createdAt="2025-01-04T10:00:00Z"
        hasPassword
        via=""
        isSeller={false}
        newsletter={false}
        personalized
        username="ava"
        cover={{ url: null, supported: false }}
        location={supported ? { city: null, country: null, supported: true } : { city: null, country: null, supported: false }}
      />
    </main>
  )
}

function Page() {
  if (kase === "creator") return <Creator />
  if (kase === "settings") return <Settings />
  return (
    <div className="flex min-h-svh flex-col">
      {/* The real header, at /@maya: it must draw nothing over a person's page now. */}
      <ConditionalHeader onPlatformDomain />
      <div className="flex-1">
        <Person />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false}>
    <LocaleProvider>
      <Page />
    </LocaleProvider>
  </PlatformSettingsProvider>,
)
