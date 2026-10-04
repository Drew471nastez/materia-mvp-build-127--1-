/**
 * Profiles, round 10, for scripts/check-profile-round10.mjs. The real
 * components, composed as the routes compose them, with the router and
 * Supabase stubbed by the probe:
 *
 *   ?case=profile&photo=yes|no          /@maya (no store): Storelib's real
 *                                       header (ConditionalHeader), the
 *                                       profile (MemberProfilePage) and the
 *                                       phone tab bar
 *   ?case=creator&sections=calvin|empty|text&communities=none|some
 *        &view=visitor|owner&rule=old|new
 *                                       a creator page with no products, as
 *                                       app/(marketing)/u/[username] builds
 *                                       it: the newsletter bar, the header,
 *                                       the tabs and About. rule=old is the
 *                                       round 9 rule, to reproduce 62.webp
 *   ?case=avatars                       people without photos where they
 *                                       appear: the header (signed in, no
 *                                       photo), comments, the members list,
 *                                       a profile, and a community's mark
 *   ?case=settings                      the account's Profile settings photo
 *                                       row and cover, with the crop sheet
 *   ?case=hub                           /account's band
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { MemberProfilePage } from "@/components/profile/member-profile-page"
import { MemberProfileShell } from "@/components/profile/member-profile-shell"
import { ProfileSocial } from "@/components/profile/profile-social"
import { StorefrontTabs } from "@/components/storefront/storefront-tabs"
import { FirstProductPrompt, drawableSections, sectionsWithoutProducts, tabsWithoutProducts } from "@/components/storefront/no-products"
import { creatorCommunitiesPanel } from "@/components/profile/creator-communities-tab"
import { UnifiedShopHeader, UnifiedSectionRenderer } from "@/components/store-builder/unified-section-renderer"
import { SubscribeBar } from "@/components/store-builder/subscribe-bar"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { AppAvatar } from "@/components/app/app-avatar"
import { CommentsSection } from "@/components/community/member/comments"
import { MemberRow } from "@/components/community/member/members"
import { AccountAvatar, useAccountPhoto } from "@/components/account/account-photo"
import { CoverField } from "@/components/account/cover-field"
import { AccountHub } from "@/components/account/account-hub"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"
import { defaultAboutSettings, defaultGlobalStoreSettings, defaultShopHeaderSettings, defaultTextBlockSettings } from "@/lib/store-builder/defaults"
import type { CommunityCard, CommentView, ViewerView } from "@/lib/communities/types"
import type { MemberProfileData } from "@/lib/profile/member-profile-data"
import { secondaryDepth } from "@/components/ui/depth-button"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const FACE = svg(128, 128, `<rect width="128" height="128" fill="#9fb3a8"/><circle cx="64" cy="52" r="24" fill="#eef2ee"/><rect x="28" y="86" width="72" height="44" rx="22" fill="#eef2ee"/>`)
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const LOGO2 = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#d9cbb6"/><circle cx="64" cy="64" r="28" fill="#8f7a5f"/>`)
const COVER = svg(1600, 600, `<rect width="1600" height="600" fill="#cfdbd5"/><path d="M0 420 C 400 300, 800 520, 1600 360 L1600 600 L0 600 Z" fill="#6f8f7f"/><circle cx="1260" cy="160" r="80" fill="#f2efe6"/>`)

const q = new URLSearchParams(location.search)
const kase = q.get("case") || "profile"

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

function Profile() {
  const photo = q.get("photo") !== "no"
  const profile: MemberProfileData = {
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
    <main className="explore-ground min-h-screen bg-[#f8f9fa]" data-probe-route="profile">
      <MemberProfileShell>
        <MemberProfilePage
          profile={profile}
          viewerId="00000000-0000-4000-8000-0000000000b2"
          viewerFollowing={false}
          extras={{
            activity: { items: activity, next: null, hidden: false },
            communities: {
              enabled: true,
              owned: [],
              member: [card("clay-studio", "Clay Studio", "A working studio for people learning wheel throwing.", LOGO, 1240, "$19/month", "Maya Ortiz"), card("night-runners", "Night Runners", "Easy miles after dark.", null, 86, null, "Theo Grant"), card("glaze-lab", "Glaze Lab", "Recipes and kiln logs.", LOGO2, 1, null, "Ana Pop")],
            },
            shared: [],
            backShown: q.get("back") === "1",
            now,
          }}
        />
      </MemberProfileShell>
    </main>
  )
}

function Creator() {
  const scheme = q.get("scheme") || "default"
  const owner = q.get("view") === "owner"
  const which = q.get("sections") || "calvin"
  const some = q.get("communities") === "some"
  const old = q.get("rule") === "old"
  const chrome = resolveStorefrontChrome(scheme)
  const cards: CommunityCard[] = some ? [card("clay-studio", "Clay Studio", "A working studio for people learning wheel throwing at home.", LOGO, 1240, "$19/month", "Calvin"), card("night-runners", "Night Runners", "Easy miles after dark, every Tuesday.", LOGO2, 86, null, "Calvin")] : []
  /* What the page's config can hold: /calvin's old "header" section, hidden and empty sections, or a real text block. */
  const sections = (
    which === "calvin"
      ? [{ id: "header-1", type: "header", order: 0, settings: { title: "Calvin", subtitle: "Clavin writes.", colors: {} } }]
      : which === "empty"
        ? [
            { id: "t0", type: "text-block", order: 0, settings: { ...defaultTextBlockSettings, headline: "", body: "" } },
            { id: "c0", type: "community", order: 1, settings: { visible: true, communityId: "gone", headline: "", spacing: { paddingTop: 48, paddingBottom: 48, paddingLeft: 0, paddingRight: 0 } } },
            { id: "h0", type: "text-block", order: 2, settings: { ...defaultTextBlockSettings, visible: false, headline: "Hidden", body: "Hidden" } },
          ]
        : [{ id: "t", type: "text-block", order: 1, settings: { ...defaultTextBlockSettings, headline: "Studio notes", body: "Glaze recipes, firing logs and the occasional failure, written up every week." } }]
  ) as Array<{ id: string; type: string; order: number; settings: Record<string, unknown> }>
  const regular = old ? sectionsWithoutProducts(sections, 0) : drawableSections(sections, { productCount: 0, communityBlocks: {} })
  const home = regular.length ? (
    <>
      {regular.map((s) => (
        <UnifiedSectionRenderer key={s.id} section={s as never} products={[]} globalSettings={defaultGlobalStoreSettings as never} creatorName="Calvin" />
      ))}
    </>
  ) : null
  const tabs = tabsWithoutProducts({ home, communitiesPanel: creatorCommunitiesPanel(cards), communities: cards })
  const settings = { ...defaultShopHeaderSettings, showBio: false, showStats: true } as never
  return (
    <div data-storefront-root="" style={{ background: chrome.pageBackground, minHeight: "100vh", color: chrome.text, ...(chrome.tokens as React.CSSProperties) }}>
      <SubscribeBar
        settings={{
          visible: true, customCtaText: "", text: "", placeholder: "Enter your email", buttonText: "", dismissible: false, position: "top", showAvatar: true,
          avatarUrl: FACE, creatorName: "Calvin", backgroundColor: chrome.bar.backgroundColor, textColor: chrome.bar.textColor, buttonColor: chrome.bar.buttonColor, buttonTextColor: chrome.bar.buttonTextColor,
          style: "style1", enableStickyBar: true, enableStickyOnScrollUp: true, buttonStyle: "style1", creatorUserId: "u-calvin",
        } as never}
        creatorId="c-calvin"
      />
      <UnifiedShopHeader
        settings={settings}
        creator={{ cover_url: null, bio: null, show_total_sales_badge: true } as never}
        profile={{ display_name: "Calvin", avatar_url: FACE, username: "calvin", created_at: "2026-09-26" } as never}
        productCount={0}
        globalSettings={defaultGlobalStoreSettings as never}
        followerCount={3}
        surface={{ textColor: chrome.text, mutedColor: chrome.muted, avatarBorderColor: chrome.avatarBorder }}
        followRow={<ProfileSocial tone="storefront" scheme={chrome.action} userId="00000000-0000-4000-8000-0000000000c3" name="Calvin" followers={3} following={2} viewerFollowing={false} signedIn isSelf={owner} />}
      />
      <div data-probe-catalogue="">
        {owner ? <FirstProductPrompt scheme={chrome.action} /> : null}
        {tabs.length ? <StorefrontTabs tabs={tabs} surface={{ textColor: chrome.text, mutedColor: chrome.muted, borderColor: chrome.border }} /> : null}
      </div>
      <div data-probe-about="">
        <UnifiedSectionRenderer
          section={{ id: "about-default", type: "about", order: 1, settings: { ...defaultAboutSettings, colors: { textColor: chrome.text } } } as never}
          creatorName="Calvin"
          sellerMemberSince="2026-09-26T08:47:37Z"
          sellerTotalSales={0}
          sellerProductsCount={0}
          globalSettings={defaultGlobalStoreSettings as never}
        />
      </div>
      <SellerFooter surface={{ backgroundColor: chrome.footerBackground, textColor: chrome.footerText, mutedColor: chrome.footerMuted, borderColor: chrome.border }} />
    </div>
  )
}

function Avatars() {
  const viewer: ViewerView = { userId: "me", signedIn: true, role: "member", status: "active", active: true, tierId: null, level: 2, points: 40, isOwner: false, isCreatorAccount: false, mutedUntil: null, can: { comment: true, react: true } as never }
  const author = (id: string, name: string, avatarUrl: string | null) => ({ id, name, username: name.split(" ")[0].toLowerCase(), avatarUrl, role: "member" as const, level: 3 })
  const comment = (id: string, who: ReturnType<typeof author>, body: string, replies: CommentView[] = []): CommentView => ({ id, postId: "p1", parentId: null, body, status: "published" as never, deleted: false, author: who, reactionCount: 2, reacted: false, createdAt: "2026-10-04T10:00:00Z", editedAt: null, replies, canEdit: false, canModerate: false })
  const comments = [
    comment("c1", author("u1", "Theo Grant", null), "This is the clearest explanation of centering I have read."),
    comment("c2", author("u2", "Ana Pop", FACE), "Agreed, the photos help a lot.", [{ ...comment("c3", author("u3", "Ioana", null), "Same here."), parentId: "c2" }]),
  ]
  const member = (id: string, name: string, avatarUrl: string | null) => ({ userId: id, name, username: name.split(" ")[0].toLowerCase(), avatarUrl, role: "member" as never, level: 2, levelName: "Regular", bio: "Wheel throwing on weekends.", hasStorefront: false })
  return (
    <main className="mx-auto max-w-[720px] space-y-6 px-4 py-6" data-probe-route="avatars">
      <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4" data-probe-avatars="comments">
        <h2 className="mb-3 text-[15px] font-semibold text-[#1a1a2e]">Comments</h2>
        <CommentsSection post={{ id: "p1", communityId: "cm1", locked: false }} slug="clay-studio" viewer={viewer} initial={{ comments, nextCursor: null, commentsEnabled: true, me: { name: "Ava Stone", avatarUrl: null } }} me={{ name: "Ava Stone", avatarUrl: null }} expected={3} />
      </section>
      <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white" data-probe-avatars="members">
        <h2 className="px-4 pt-4 text-[15px] font-semibold text-[#1a1a2e]">Members</h2>
        <ul>
          {[member("m1", "Theo Grant", null), member("m2", "Ana Pop", FACE), member("m3", "Ioana", null)].map((m) => (
            <li key={m.userId}>
              <MemberRow m={m as never} slug="clay-studio" />
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4" data-probe-avatars="sizes">
        {[18, 24, 32, 40, 64, 96].map((s) => (
          <AppAvatar key={s} src={null} name="Theo Grant" size={s} />
        ))}
        <span className="rounded-xl bg-[#0e0e10] p-2"><AppAvatar src={null} name="Theo Grant" size={32} tone="dark" /></span>
        <span className="rounded-xl p-2" style={{ background: "#1c1c1c", color: "#f5f5f5" }}><AppAvatar src={null} name="Theo Grant" size={32} tone="theme" /></span>
        <span data-probe-mark=""><AppAvatar src={null} name="Clay Studio" size={44} className="rounded-[10px]" /></span>
      </section>
    </main>
  )
}

function Settings() {
  const photo = useAccountPhoto("user-1", () => {})
  const shown = q.get("photo") === "no" ? null : FACE
  return (
    <main className="mx-auto max-w-[640px] px-4 py-6" data-probe-route="settings">
      <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5" data-account-card="profile">
        <h2 className="text-[17px] font-semibold text-[#1a1a2e]">Profile</h2>
        <div className="mt-3 flex items-center gap-3" data-account-photo-row="">
          <AccountAvatar src={shown} name="Mara Lind" photo={photo} editable size={80} className="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={photo.pick} disabled={!!photo.busy} data-photo-change="" className={`${secondaryDepth} h-10 rounded-xl px-3.5 text-[14px]`}>
                Change photo
              </button>
            </div>
            <span className="mt-1 block text-[12px] text-[#6b7280]">JPG, PNG or WebP, up to 15MB.</span>
          </div>
        </div>
        {photo.error ? <p data-account-photo-error="">{photo.error}</p> : null}
        {photo.input}
        <div className="mt-5 border-t border-[#f0f1f3] pt-4" data-probe-under-photo="">
          <CoverField initial={COVER} labelClass="text-[13px] font-medium text-[#1a1a2e]" helpClass="mt-1 block text-[12px] text-[#6b7280]" />
        </div>
      </section>
    </main>
  )
}

function Hub() {
  return (
    <AccountHub identity={{ userId: "u1", name: "Mara Lind", username: "mara", avatarUrl: FACE, coverUrl: COVER, bio: "Ceramics.", followers: 12, following: 3 }} communities>
      <p className="text-[14px] text-[#6b7280]">Activity</p>
    </AccountHub>
  )
}

function Page() {
  const body = kase === "creator" ? <Creator /> : kase === "avatars" ? <Avatars /> : kase === "settings" ? <Settings /> : kase === "hub" ? <Hub /> : <Profile />
  const chrome = kase === "profile" || kase === "avatars" || kase === "hub"
  return (
    <div className="flex min-h-svh flex-col bg-[#f8f9fa]">
      {chrome ? <ConditionalHeader onPlatformDomain /> : null}
      <div className="flex-1">{body}</div>
      {chrome ? (
        <Suspense fallback={null}>
          <BuyerTabBar />
        </Suspense>
      ) : null}
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
