/**
 * ===========================================================================
 *  A PERSON'S PROFILE, BUILT LIKE A CREATOR'S PAGE
 * ===========================================================================
 * /@handle, for everybody on Storelib. The owner: "plain users get the same
 * page STRUCTURE as a creator page, without the selling parts". So the
 * order is the creator page's:
 *
 *   THE HEADER   a band edge to edge (their cover when they have one), the
 *                photo across its lower edge, the name, @handle, the bio,
 *                then followers / following and Follow (only Follow:
 *                the owner asked for Message to go for now).
 *   YOUR OWN     the same page /account is (components/account/account-
 *                hub.tsx): instead of Follow, the pills to your own places
 *                (Activity, Communities, Library, Edit profile, Settings)
 *                and your activity under them.
 *   THE TABS     the creator page's own underline tabs (StorefrontTabs):
 *                Activity, Communities, and Products only for somebody
 *                with a live store. A single tab draws no tab bar. When the
 *                viewer shares a community with them, Activity opens with
 *                "In <community>": their posts there, six at a time.
 *
 * A PERSON WITH A STORE HAS NO ACTIVITY. The owner: "In creator pages or
 * creator profiles there should be no activity." Their /@handle is a
 * creator profile, so it has no Activity tab and no "In <community>" posts:
 * their Products, then the communities they made (as their creator page's
 * Communities tab lists, never the ones they only joined). On your own
 * page as a creator the pills have no Activity either, and what visitors
 * see sits under them.
 *
 * Every number is a count of real rows; nothing is shown that the person
 * chose to hide (their activity, the communities they are in), except to
 * themselves, with a line saying only they can see it.
 */
import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { StorefrontTabs, type StorefrontTab } from "@/components/storefront/storefront-tabs"
import { ExploreCommunityCard } from "@/components/explore/community-card"
import { secondaryDepth } from "@/components/ui/depth-button"
import type { MemberProfileData } from "@/lib/profile/member-profile-data"
import type { CommunityCard } from "@/lib/communities/types"
import { listPrice } from "@/lib/pricing/list-price"
import { getProductUrl, getStoreInternalPath } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"
import type { SharedCommunity, SharedPostsPage } from "@/lib/profile/shared-view"
import { ProfileActivity, type ActivityItemView } from "./profile-activity"
import { ProfileHero } from "./profile-hero"
import { ProfileOwnerPills } from "./profile-owner-pills"
import { ProfileTopBar } from "./profile-top-bar"
import { SharedCommunityPosts } from "./shared-community-posts"

const CARD_SHADOW = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

export interface ProfilePageExtras {
  activity: { items: ActivityItemView[]; next: string | null; hidden: boolean }
  communities: { enabled: boolean; owned: CommunityCard[]; member: CommunityCard[] }
  /** The communities the viewer shares with them, each with the first page of their posts there. */
  shared?: { community: SharedCommunity; page: SharedPostsPage }[]
  backShown: boolean
  now: number
}

function ProductGrid({ profile }: { profile: MemberProfileData }) {
  const handle = profile.storefrontHandle
  return (
    <section className={`${CARD_SHADOW} mx-auto w-full max-w-[880px] px-4 py-4 sm:px-5 sm:py-5`} aria-labelledby="member-products-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="member-products-heading" className="text-[17px] font-semibold text-[#1a1a2e]">
          Products
        </h2>
        {profile.productCount > profile.products.length ? (
          <Link href={getStoreInternalPath(handle)} className="inline-flex h-10 items-center gap-1 text-[13px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
            View all {profile.productCount}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {profile.products.map((p) => {
          const href = getProductUrl(handle, p.slug)
          const price = listPrice({
            price_cents: p.priceCents,
            pay_what_you_want: p.payWhatYouWant,
            pwyw_min_price_cents: p.pwywMinPriceCents,
            type: p.type,
            price_interval: p.priceInterval,
          })
          return (
            <li key={p.id}>
              <Link
                href={href}
                className="group/product flex gap-3 rounded-xl border border-[#eef0f3] bg-[#fafafa]/80 p-2.5 transition-colors hover:border-[#e0e3e8] hover:bg-white"
                data-member-product=""
              >
                <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-[#eceef1]">
                  {p.thumbnailUrl ? (
                    <Image src={p.thumbnailUrl} alt="" fill sizes="72px" className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[11px] text-[#9ca3af]">No image</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e] group-hover/product:underline">{p.title}</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#1a1a2e]">{price.main}</p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
      <Link href={getStoreInternalPath(handle)} className={cn(secondaryDepth, "mt-4 h-10 w-full rounded-xl px-5 text-[14px] sm:w-auto")} data-member-store="">
        Visit store
      </Link>
    </section>
  )
}

function CommunityList({ title, cards }: { title: string | null; cards: CommunityCard[] }) {
  if (cards.length === 0) return null
  return (
    <section className="min-w-0" aria-label={title ?? "Communities"}>
      {title ? <h2 className="mb-3 text-[15px] font-semibold text-[#1a1a2e]">{title}</h2> : null}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" data-profile-communities="">
        {cards.map((c, i) => (
          <li key={c.id} className="min-w-0">
            <ExploreCommunityCard card={c} priority={i < 2} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function OnlyYouNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 flex flex-wrap items-center justify-center gap-x-1.5 rounded-xl bg-[#f1f2f4] px-4 py-2.5 text-center text-[13px] leading-[1.45] text-[#4b5563]" data-profile-only-you="">
      {children}
      <Link href="/account/settings?section=privacy" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
        Change
      </Link>
    </p>
  )
}

export function MemberProfilePage({ profile, viewerId, viewerFollowing, extras }: { profile: MemberProfileData; viewerId: string | null; viewerFollowing: boolean; extras: ProfilePageExtras }) {
  const isSelf = !!viewerId && viewerId === profile.userId
  const first = profile.name.split(/\s+/)[0] || profile.name
  const { activity, communities } = extras
  /* A creator profile: no activity, and only the communities they made. See A PERSON WITH A STORE HAS NO ACTIVITY. */
  const creator = profile.hasStorefront
  const showMemberships = !creator && (profile.privacy.showCommunities || isSelf)
  const shared = creator ? [] : (extras.shared ?? [])

  const activityPanel = (
    <ProfileActivity
      userId={profile.userId}
      initial={activity.hidden && !isSelf ? [] : activity.items}
      initialNext={activity.hidden && !isSelf ? null : activity.next}
      now={extras.now}
      /* Their posts where you both are come first, whether or not the rest is public: you can read them in the community anyway. */
      lead={
        shared.length ? (
          <>
            {shared.map((s) => (
              <SharedCommunityPosts key={s.community.id} userId={profile.userId} community={s.community} initial={s.page} now={extras.now} firstName={first} />
            ))}
          </>
        ) : undefined
      }
      hiddenNote={
        isSelf && activity.hidden ? (
          <OnlyYouNote>Only you can see your activity.</OnlyYouNote>
        ) : activity.hidden ? (
          <p className="mb-3 rounded-xl bg-[#f1f2f4] px-4 py-2.5 text-center text-[13px] leading-[1.45] text-[#4b5563]" data-profile-activity-hidden="">
            {first} keeps the rest of their activity private.
          </p>
        ) : undefined
      }
      /* A hidden list still ends on the day they joined, which their profile says anyway. */
      joinedAt={profile.joinedAt}
      emptyText={isSelf ? "Nothing here yet. Join a community or review something you bought and it shows up here." : "No public activity yet."}
    />
  )

  const tabs: StorefrontTab[] = creator ? [] : [{ id: "activity", label: "Activity", panel: activityPanel }]
  if (creator && profile.products.length > 0) {
    tabs.push({ id: "products", label: "Products", panel: <ProductGrid profile={profile} /> })
  }
  const memberCards = showMemberships ? communities.member : []
  if (communities.enabled && (communities.owned.length > 0 || memberCards.length > 0 || isSelf || creator)) {
    const both = communities.owned.length > 0 && memberCards.length > 0
    tabs.push({
      id: "communities",
      label: "Communities",
      panel: (
        <div className="mx-auto w-full max-w-[960px] space-y-8">
          {isSelf && !profile.privacy.showCommunities && memberCards.length > 0 ? <OnlyYouNote>Only you can see the communities you are in.</OnlyYouNote> : null}
          <CommunityList title={both ? "Runs" : null} cards={communities.owned} />
          <CommunityList title={both ? "Member of" : null} cards={memberCards} />
          {communities.owned.length === 0 && memberCards.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#e5e7eb] px-6 py-10 text-center text-[14px] text-[#6b7280]">
              No communities yet.
              {creator ? null : (
                <>
                  {" "}
                  <Link href="/explore?type=communities" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                    Find one
                  </Link>
                </>
              )}
            </p>
          ) : null}
        </div>
      ),
    })
  }
  if (!creator && profile.hasStorefront && profile.products.length > 0) {
    tabs.push({ id: "products", label: "Products", panel: <ProductGrid profile={profile} /> })
  }

  return (
    <div className="pb-12" data-member-profile="" data-profile-self={isSelf ? "true" : "false"}>
      {/* The way back, in a bar of its own next to the person, when they came from a community, Explore or search. */}
      <ProfileTopBar initiallyShown={extras.backShown} name={profile.name} avatarUrl={profile.avatarUrl} />

      {/* The band runs the window's whole width, as a creator page's does; the person and the tabs keep the profile's column. */}
      <ProfileHero
        person={{
          userId: profile.userId,
          name: profile.name,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          coverUrl: profile.coverUrl,
          bio: profile.bio,
          followers: profile.followers,
          following: profile.following,
        }}
        viewerFollowing={viewerFollowing}
        signedIn={!!viewerId}
        isSelf={isSelf}
      />

      <div className="mx-auto w-full max-w-[960px] px-4 sm:px-6 lg:px-0">
        {isSelf && creator ? (
          /* A creator's own page: the pills (no Activity), then what visitors see. */
          <>
            <ProfileOwnerPills communities={communities.enabled} creator active={null} className="mt-3" />
            <div className="mt-6 sm:mt-8" data-profile-tabs="">
              {tabs.length ? <StorefrontTabs tabs={tabs} /> : null}
            </div>
          </>
        ) : isSelf ? (
          /* Your own page is /account's page: the pills to your places, and your activity under them. */
          <>
            <ProfileOwnerPills communities={communities.enabled} active="activity" className="mt-3" />
            <div className="mt-6 sm:mt-8" data-profile-tabs="">
              {activityPanel}
            </div>
          </>
        ) : (
          <div className="mt-6 sm:mt-8" data-profile-tabs="">
            {tabs.length ? <StorefrontTabs tabs={tabs} /> : null}
          </div>
        )}
      </div>
    </div>
  )
}
