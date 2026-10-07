/**
 * ===========================================================================
 *  A PERSON WITHOUT A STORE: THE CREATOR PAGE, WITHOUT THE PRODUCTS
 * ===========================================================================
 * /@handle for everybody who does not sell (a creator's /@handle is a 308 to
 * their creator page: app/(marketing)/member/[username]/layout.tsx). Round
 * 12, the owner: "ONE profile system ... a person without a store gets the
 * SAME page template and chrome as a creator page ... simply without
 * products". So this is drawn with the creator page's own pieces, in the
 * order app/(marketing)/u/[username] draws them, in the default scheme
 * (components/storefront/storefront-template.tsx PERSON_CHROME):
 *
 *   THE TOP BAR   the creator page opens on its newsletter bar; a person has
 *                 no newsletter, so the same white bar with their photo and
 *                 name (ProfileTopBar, `always`), the way back in front of
 *                 it when they came from somewhere. No Storelib header with
 *                 its wishlist and library (components/marketing/
 *                 conditional-header.tsx leaves /@ and /member alone).
 *   THE HEADER    the creator header itself (ShopHeaderRenderer): their
 *                 cover edge to edge, the photo across its edge, the name,
 *                 @handle and bio, then where they are from, followers /
 *                 following and Follow (ProfileSocial). On your own page,
 *                 Edit profile on the cover where a creator's sits.
 *   THE TABS      the creator page's underline tabs (StorefrontTabs):
 *                 Activity (their public activity, and first the posts of
 *                 theirs you can read in a community you share), then
 *                 Communities (the ones they run and, when they show them,
 *                 the ones they are in). One tab draws no strip; it gets a
 *                 heading instead, as a creator page's lone Communities does.
 *   ABOUT         "About <name>" with the day they joined, where they are
 *                 from, how many communities they are in and the line they
 *                 wrote about themselves (components/profile/person-about).
 *                 The day they joined used to be the last line of their
 *                 Activity ("Joined Storelib"), which is not activity.
 *   THE FOOTER    "Powered by Storelib", the creator page's own.
 *
 * A PULL AT THE TOP, on a touch screen, asks the server for the page again
 * and the Activity list for its first page again (components/ui/
 * pull-to-refresh.tsx, the engine every other Storelib page pulls with).
 *
 * When they open a store this page is not changed into anything: the address
 * starts answering a 308 to their creator page, which is this same page with
 * their products in it.
 *
 * Every number is a count of real rows; nothing is shown that the person
 * chose to hide (their activity, the communities they are in), except to
 * themselves, with a line saying only they can see it.
 *
 * No "use client": drawn on the server, the panels handed to the tabs.
 */
import Link from "next/link"
import { ShopHeaderRenderer } from "@/components/store-builder/section-renderer"
import { StorefrontTabs, type StorefrontTab } from "@/components/storefront/storefront-tabs"
import { SellerFooter } from "@/components/storefront/seller-footer"
import {
  PERSON_CHROME,
  storefrontFooterSurface,
  storefrontHeaderSurface,
  storefrontRootStyle,
  storefrontTabsSurface,
} from "@/components/storefront/storefront-template"
import { defaultShopHeaderSettings } from "@/lib/store-builder/defaults"
import type { ShopHeaderSettings } from "@/lib/store-builder/types"
import type { MemberProfileData } from "@/lib/profile/member-profile-data"
import type { CommunityCard } from "@/lib/communities/types"
import type { ContributionSection, SharedCommunity, SharedPostsPage } from "@/lib/profile/shared-view"
import { parseProfileCover } from "@/lib/profile/cover"
import { MEMBER_REFRESH_SCOPE } from "@/lib/profile/refresh-scope"
import { RouterPullToRefresh } from "@/components/ui/pull-to-refresh"
import { ProfileActivity, type ActivityItemView } from "./profile-activity"
import { ProfileCommunityList } from "./profile-community-list"
import { ProfileSocial } from "./profile-social"
import { ProfileTopBar } from "./profile-top-bar"
import { PersonAbout } from "./person-about"
import { PersonOwnerActions } from "./person-owner-actions"
import { SharedCommunityPosts } from "./shared-community-posts"

export interface ProfilePageExtras {
  activity: { items: ActivityItemView[]; next: string | null; hidden: boolean }
  communities: { enabled: boolean; owned: CommunityCard[]; member: CommunityCard[] }
  /** The communities the viewer shares with them, each with the first page of their posts there. */
  /** Their contributions per community the viewer may read them in (round 13: with what they gave it, and the viewer's own posts editable). */
  shared?: (ContributionSection | { community: SharedCommunity; page: SharedPostsPage })[]
  backShown: boolean
  now: number
  /** Where they are from, one line (lib/profile/location.ts locationLine); null when they never said. */
  location?: string | null
}

/**
 * The creator page's column (components/storefront/no-products.tsx COLUMN),
 * and the narrower one a list of things reads best in, on the column's left
 * edge, under the tab strip and in line with About, so the page keeps one
 * left edge from the tabs down.
 */
const COLUMN = "mx-auto w-full max-w-[1180px] px-3 sm:px-4 lg:px-6"
const LIST = "w-full max-w-[680px]"

function OnlyYouNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 flex flex-wrap items-center justify-center gap-x-1.5 rounded-xl bg-muted px-4 py-2.5 text-center text-[13px] leading-[1.45] text-muted-foreground" data-profile-only-you="">
      {children}
      <Link href="/account/settings?section=privacy" className="font-medium text-foreground underline-offset-2 hover:underline">
        Change
      </Link>
    </p>
  )
}

/** The header's settings for a person: the creator default, with their own cover (and where they placed it) in the band. */
export function personHeaderSettings(coverUrl: string | null): ShopHeaderSettings {
  const cover = parseProfileCover(coverUrl)
  return {
    ...defaultShopHeaderSettings,
    coverImageUrl: cover.url ?? undefined,
    coverFocalPoint: { x: cover.crop.x, y: cover.crop.y },
    coverZoom: cover.crop.zoom,
  }
}

export function MemberProfilePage({ profile, viewerId, viewerFollowing, extras }: { profile: MemberProfileData; viewerId: string | null; viewerFollowing: boolean; extras: ProfilePageExtras }) {
  const isSelf = !!viewerId && viewerId === profile.userId
  const first = profile.name.split(/\s+/)[0] || profile.name
  const { activity, communities } = extras
  const chrome = PERSON_CHROME
  const showMemberships = profile.privacy.showCommunities || isSelf
  const memberCards = showMemberships ? communities.member : []
  const shared = extras.shared ?? []

  const activityPanel = (
    <div className={COLUMN}>
      <div className={LIST}>
        <ProfileActivity
          userId={profile.userId}
          tone="storefront"
          initial={activity.hidden && !isSelf ? [] : activity.items}
          initialNext={activity.hidden && !isSelf ? null : activity.next}
          now={extras.now}
          /* Their posts where you both are come first, whether or not the rest is public: you can read them in the community anyway. */
          lead={
            shared.length ? (
              <>
                {shared.map((s) => (
                  <SharedCommunityPosts key={s.community.id} userId={profile.userId} community={s.community} initial={s.page} now={extras.now} firstName={first} stats={"stats" in s ? s.stats : null} own={"own" in s ? s.own : false} />
                ))}
              </>
            ) : undefined
          }
          hiddenNote={
            isSelf && activity.hidden ? (
              <OnlyYouNote>Only you can see your activity.</OnlyYouNote>
            ) : activity.hidden ? (
              <p className="mb-3 rounded-xl bg-muted px-4 py-2.5 text-center text-[13px] leading-[1.45] text-muted-foreground" data-profile-activity-hidden="">
                {first} keeps the rest of their activity private.
              </p>
            ) : undefined
          }
          refreshScope={MEMBER_REFRESH_SCOPE}
          emptyText={isSelf ? "Nothing here yet. Join a community or review something you bought and it shows up here." : `${first} has nothing public here yet.`}
        />
      </div>
    </div>
  )

  const tabs: StorefrontTab[] = [{ id: "activity", label: "Activity", panel: activityPanel }]
  if (communities.enabled) {
    tabs.push({
      id: "communities",
      label: "Communities",
      panel: (
        <div className={COLUMN}>
          <div className={`${LIST} space-y-4`}>
            {isSelf && !profile.privacy.showCommunities && memberCards.length > 0 ? <OnlyYouNote>Only you can see the communities you are in.</OnlyYouNote> : null}
            {/* A person's communities are places on their page, a list rather than Explore's cover cards (components/profile/profile-community-list.tsx). */}
            <ProfileCommunityList owned={communities.owned} member={memberCards} />
            {communities.owned.length === 0 && memberCards.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-[14px] text-muted-foreground" data-panel-spacing="">
                No communities yet.
                {isSelf ? (
                  <>
                    {" "}
                    <Link href="/explore?type=communities" className="font-medium text-foreground underline-offset-2 hover:underline">
                      Find one
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      ),
    })
  }

  /* The count About shows: only the communities anybody may see them in. */
  const shownCommunities = !communities.enabled ? null : communities.owned.length + memberCards.length

  return (
    <RouterPullToRefresh scope={MEMBER_REFRESH_SCOPE}>
    <div className="min-h-screen overflow-x-hidden" style={storefrontRootStyle(chrome)} data-storefront-root="" data-member-profile="" data-profile-self={isSelf ? "true" : "false"}>
      {/* The page's own top bar: the photo and the name, and the way back in front of them when they came from somewhere. */}
      <ProfileTopBar always initiallyShown={extras.backShown} name={profile.name} avatarUrl={profile.avatarUrl} width="max-w-[1150px]" />

      <ShopHeaderRenderer
        settings={personHeaderSettings(profile.coverUrl)}
        creator={{ cover_url: null, bio: profile.bio, show_total_sales_badge: false }}
        profile={{ display_name: profile.name, avatar_url: profile.avatarUrl, username: profile.username, created_at: profile.joinedAt }}
        products={[]}
        productCount={0}
        followerCount={profile.followers}
        ownerActions={isSelf ? <PersonOwnerActions /> : null}
        followRow={
          <ProfileSocial
            tone="storefront"
            scheme={chrome.action}
            userId={profile.userId}
            name={profile.name}
            followers={profile.followers}
            following={profile.following}
            viewerFollowing={viewerFollowing}
            signedIn={!!viewerId}
            isSelf={isSelf}
            location={extras.location ?? null}
          />
        }
        surface={storefrontHeaderSurface(chrome)}
      />

      <div data-profile-tabs="">
        {tabs.length > 1 ? (
          <StorefrontTabs tabs={tabs} surface={storefrontTabsSurface(chrome)} />
        ) : (
          /* One panel is never a tab strip: it stands under a heading of its own, as a creator page's lone Communities does. */
          <section className="pt-6 sm:pt-8" aria-labelledby="person-lone-heading">
            <div className={COLUMN}>
              <h2 id="person-lone-heading" className={`${LIST} mb-4 text-[17px] font-semibold text-foreground sm:text-[19px]`}>
                {tabs[0].label}
              </h2>
            </div>
            {tabs[0].panel}
          </section>
        )}
      </div>

      <PersonAbout
        name={profile.name}
        joinedAt={profile.joinedAt}
        bio={profile.bio}
        location={extras.location ?? null}
        communities={shownCommunities}
        socials={profile.socials}
        chrome={chrome}
      />

      <SellerFooter surface={storefrontFooterSurface(chrome)} />
    </div>
    </RouterPullToRefresh>
  )
}
