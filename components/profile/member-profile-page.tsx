/**
 * ===========================================================================
 *  A PERSON'S PROFILE, BUILT LIKE A CREATOR'S PAGE
 * ===========================================================================
 * /@handle, for everybody on Storelib. The owner: "plain users get the same
 * page STRUCTURE as a creator page, without the selling parts". So the
 * order is the creator page's:
 *
 *   THE HEADER   a band (their cover when they have one), the photo across
 *                its lower edge, the name, @handle and when they joined,
 *                the bio, then followers / following and the buttons:
 *                Follow, and Message where the two of them share a
 *                community that allows it.
 *   YOUR OWN     instead of Follow, the pills to your own places: Library,
 *                Courses, Communities, Edit profile, Settings.
 *   THE TABS     the creator page's own underline tabs (StorefrontTabs):
 *                Activity, Communities, and Products only for somebody
 *                with a live store. A single tab draws no tab bar.
 *
 * Every number is a count of real rows; nothing is shown that the person
 * chose to hide (their activity, the communities they are in), except to
 * themselves, with a line saying only they can see it.
 */
import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { AvatarLightbox } from "@/components/storefront/avatar-lightbox"
import { StorefrontTabs, type StorefrontTab } from "@/components/storefront/storefront-tabs"
import { CommunityCardTile } from "@/components/community/public/community-card"
import { secondaryDepth } from "@/components/ui/depth-button"
import type { MemberProfileData } from "@/lib/profile/member-profile-data"
import type { CommunityCard } from "@/lib/communities/types"
import { listPrice } from "@/lib/pricing/list-price"
import { getProductUrl, getStoreInternalPath } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"
import { ProfileActivity, type ActivityItemView } from "./profile-activity"
import { ProfileBackBar } from "./profile-back-bar"
import { ProfileOwnerPills } from "./profile-owner-pills"
import { ProfileSocial } from "./profile-social"

const CARD_SHADOW = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

export interface ProfilePageExtras {
  messageHref: string | null
  activity: { items: ActivityItemView[]; next: string | null; hidden: boolean }
  communities: { enabled: boolean; owned: CommunityCard[]; member: CommunityCard[] }
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
            <CommunityCardTile card={c} priority={i < 2} />
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
  const showMemberships = profile.privacy.showCommunities || isSelf

  const tabs: StorefrontTab[] = []
  tabs.push({
    id: "activity",
    label: "Activity",
    panel: activity.hidden && !isSelf ? (
      <p className="mx-auto max-w-[680px] rounded-2xl border border-dashed border-[#e5e7eb] px-6 py-10 text-center text-[14px] text-[#6b7280]" data-profile-activity-hidden="">
        {first} keeps their activity private.
      </p>
    ) : (
      <ProfileActivity
        userId={profile.userId}
        initial={activity.items}
        initialNext={activity.next}
        now={extras.now}
        hiddenNote={isSelf && activity.hidden ? <OnlyYouNote>Only you can see your activity.</OnlyYouNote> : undefined}
        emptyText={isSelf ? "Nothing here yet. Join a community or review something you bought and it shows up here." : "No public activity yet."}
      />
    ),
  })
  const memberCards = showMemberships ? communities.member : []
  if (communities.enabled && (communities.owned.length > 0 || memberCards.length > 0 || isSelf)) {
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
              No communities yet.{" "}
              <Link href="/explore/communities" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                Find one
              </Link>
            </p>
          ) : null}
        </div>
      ),
    })
  }
  if (profile.hasStorefront && profile.products.length > 0) {
    tabs.push({ id: "products", label: "Products", panel: <ProductGrid profile={profile} /> })
  }

  return (
    <div className="mx-auto w-full max-w-[960px] pb-12" data-member-profile="" data-profile-self={isSelf ? "true" : "false"}>
      <ProfileBackBar initiallyShown={extras.backShown} />

      {/* The band and the photo across its lower edge, as a creator page opens. */}
      <div className="relative overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-[#eceef1]" data-profile-cover="">
        <div className="relative h-[112px] sm:h-[168px]">
          {profile.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_140%_at_50%_0%,#f4f5f7_0%,#e7e9ed_100%)]" />
          )}
        </div>
      </div>

      <header className="relative -mt-[56px] flex flex-col items-center px-2 text-center sm:-mt-[64px]" data-profile-header="">
        <AvatarLightbox src={profile.avatarUrl} name={profile.name}>
          <AppAvatar
            src={profile.avatarUrl}
            name={profile.name}
            size={128}
            sizedByClass
            className="h-[112px] w-[112px] cursor-zoom-in shadow-[0_1px_2px_rgba(16,24,40,0.08),0_8px_20px_-10px_rgba(16,24,40,0.32)] ring-4 ring-[#f8f9fa] sm:h-[128px] sm:w-[128px]"
          />
        </AvatarLightbox>
        <h1 className="mt-3 line-clamp-2 max-w-full text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[26px]" data-profile-name="">
          {profile.name}
        </h1>
        <p className="mt-1 max-w-full text-[13px] leading-[1.45] text-[#6b7280] [overflow-wrap:anywhere]">
          <span className="text-[#4b5563]" data-profile-handle="">
            @{profile.username}
          </span>
          {profile.memberSince ? (
            <>
              <span aria-hidden className="px-1.5 text-[#c4c8cf]">
                ·
              </span>
              Joined {profile.memberSince}
            </>
          ) : null}
        </p>
        {profile.bio ? (
          <p className="mt-2.5 max-w-[520px] whitespace-pre-line text-[14px] leading-[1.5] text-[#374151] [overflow-wrap:anywhere] sm:text-[15px]" data-profile-bio="">
            {profile.bio}
          </p>
        ) : null}

        <ProfileSocial
          className="mt-2 w-full"
          userId={profile.userId}
          name={profile.name}
          followers={profile.followers}
          following={profile.following}
          viewerFollowing={viewerFollowing}
          signedIn={!!viewerId}
          isSelf={isSelf}
          messageHref={extras.messageHref}
        />
        {isSelf ? <ProfileOwnerPills communities={communities.enabled} className="mt-3 w-full" /> : null}
      </header>

      <div className="mt-6 sm:mt-8" data-profile-tabs="">
        <StorefrontTabs tabs={tabs} />
      </div>
    </div>
  )
}
