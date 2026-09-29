import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Star, Store } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { MemberFollowButton } from "@/components/profile/member-follow-button"
import { AvatarLightbox } from "@/components/storefront/avatar-lightbox"
import type { MemberProfileData } from "@/lib/profile/member-profile-data"
import { listPrice } from "@/lib/pricing/list-price"
import { getProductUrl, getStoreInternalPath } from "@/lib/url-helpers"
import { secondaryDepth } from "@/components/ui/depth-button"
import { CARD, VIOLET } from "@/components/library/library-ui"
import { cn } from "@/lib/utils"

const CARD_SHADOW = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

function ProfileAside({
  profile,
  isSelf,
  viewerId,
  viewerFollowing,
  storeHref,
}: {
  profile: MemberProfileData
  isSelf: boolean
  viewerId: string | null
  viewerFollowing: boolean
  storeHref: string | null
}) {
  return (
    <aside
      className={`${CARD_SHADOW} flex flex-col items-center px-6 pb-6 pt-5 text-center lg:sticky lg:top-[calc(64px+1.5rem)] lg:max-h-[calc(100svh-5.5rem)] lg:overflow-y-auto`}
      data-member-profile-aside=""
    >
      <AvatarLightbox src={profile.avatarUrl} name={profile.name}>
        <AppAvatar
          src={profile.avatarUrl}
          name={profile.name}
          size={128}
          className="h-[104px] w-[104px] cursor-zoom-in ring-[3px] ring-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_8px_20px_-10px_rgba(16,24,40,0.32)] md:h-[120px] md:w-[120px]"
        />
      </AvatarLightbox>
      <h1 className="mt-3.5 line-clamp-2 max-w-full text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-[#1a1a2e] md:text-[24px]">
        {profile.name}
      </h1>
      <p className="mt-1 text-[13px] text-[#6b7280]">
        <span className="text-[#4b5563]">@{profile.username}</span>
        {profile.memberSince ? (
          <>
            <span aria-hidden className="px-1.5 text-[#c4c8cf]">·</span>
            Joined {profile.memberSince}
          </>
        ) : null}
      </p>
      {profile.bio ? (
        <p className="mt-2.5 max-w-full whitespace-pre-line text-[14px] leading-[1.5] text-[#374151]">{profile.bio}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[13px] text-[#6b7280]">
        <span>
          <span className="font-semibold text-[#1a1a2e] tabular-nums">{profile.followers}</span> followers
        </span>
        <span>
          <span className="font-semibold text-[#1a1a2e] tabular-nums">{profile.following}</span> following
        </span>
        {profile.hasStorefront && profile.productCount > 0 ? (
          <span>
            <span className="font-semibold text-[#1a1a2e] tabular-nums">{profile.productCount}</span> products
          </span>
        ) : null}
      </div>
      {!isSelf ? (
        <div className="mt-4 flex w-full max-w-[280px] flex-col gap-2 sm:flex-row sm:justify-center">
          <MemberFollowButton targetUserId={profile.userId} initialFollowing={viewerFollowing} signedIn={!!viewerId} />
          {storeHref ? (
            <Link href={storeHref} className={cn(secondaryDepth, "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[14px]")} data-member-store="">
              <Store className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              Store
            </Link>
          ) : null}
        </div>
      ) : (
        <Link href="/account" className={cn(secondaryDepth, "mt-4 h-10 min-w-[140px] rounded-xl px-5 text-[14px]")}>
          Edit your profile
        </Link>
      )}
      <p className="mt-6 hidden items-center justify-center gap-1.5 text-[11px] text-[#9ca3af] lg:flex" data-member-powered="">
        <span>Powered by</span>
        <StorelibLogo size={32} fluid className="h-[15px] w-[15px] !rounded-[5px]" alt="Storelib" />
      </p>
    </aside>
  )
}

function ProductGrid({ profile }: { profile: MemberProfileData }) {
  const handle = profile.storefrontHandle
  return (
    <section className={`${CARD_SHADOW} px-4 py-4 sm:px-5 sm:py-5`} aria-labelledby="member-products-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="member-products-heading" className="text-[17px] font-semibold text-[#1a1a2e]">Products</h2>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">From {profile.name}&apos;s store on Storelib</p>
        </div>
        {profile.productCount > profile.products.length ? (
          <Link href={getStoreInternalPath(handle)} className="inline-flex items-center gap-1 text-[13px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
            View all
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
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
                className="group flex gap-3 rounded-xl border border-[#eef0f3] bg-[#fafafa]/80 p-2.5 transition-colors hover:border-[#e0e3e8] hover:bg-white"
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
                  <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e] group-hover:underline">{p.title}</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#1a1a2e]">{price}</p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
      <Link href={getStoreInternalPath(handle)} className={`${VIOLET} mt-5 w-full sm:w-auto`}>
        Visit store
      </Link>
    </section>
  )
}

function ReviewsSection({ profile }: { profile: MemberProfileData }) {
  if (profile.reviews.length === 0) return null
  return (
    <section className={`${CARD_SHADOW} px-4 py-4 sm:px-5 sm:py-5`} aria-label="Public reviews">
      <h2 className="text-[17px] font-semibold text-[#1a1a2e]">Community reviews</h2>
      <p className="mt-0.5 text-[13px] text-[#6b7280]">What they shared after buying on Storelib</p>
      <ul className="mt-4 divide-y divide-[#eef0f3]">
        {profile.reviews.map((r) => (
          <li key={r.id} className="py-3.5 first:pt-0">
            <div className="flex items-center gap-1 text-[#f59e0b]">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-current" : "text-[#e5e7eb]"}`} aria-hidden />
              ))}
            </div>
            <p className="mt-1 text-[14px] font-medium text-[#1a1a2e]">{r.productTitle}</p>
            {r.content ? <p className="mt-1 line-clamp-4 text-[14px] leading-relaxed text-[#4b5563]">{r.content}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function EmptyFeed({ profile, storeHref }: { profile: MemberProfileData; storeHref: string | null }) {
  return (
    <div className={`${CARD} px-5 py-10 text-center sm:px-10 sm:py-12`} data-member-empty="">
      <p className="text-[17px] font-semibold text-[#1a1a2e]">@{profile.username} on Storelib</p>
      <p className="mx-auto mt-2 max-w-[400px] text-[14px] leading-relaxed text-[#6b7280]">
        {profile.hasStorefront
          ? "Their store is being set up. Check back soon for products, or follow them for updates."
          : "This is their public member profile. When they sell on Storelib, their products will show up here."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {storeHref ? (
          <Link href={storeHref} className={VIOLET}>
            View store
          </Link>
        ) : null}
        <Link href="/explore" className={secondaryDepth + " h-10 rounded-xl px-5 text-[14px]"}>
          Explore Storelib
        </Link>
      </div>
    </div>
  )
}

export function MemberProfilePage({
  profile,
  viewerId,
  viewerFollowing,
}: {
  profile: MemberProfileData
  viewerId: string | null
  viewerFollowing: boolean
}) {
  const isSelf = viewerId === profile.userId
  const storeHref = profile.hasStorefront ? getStoreInternalPath(profile.storefrontHandle) : null
  const hasFeed = profile.products.length > 0 || profile.reviews.length > 0

  return (
    <div className="mx-auto w-full max-w-[1080px] pb-10 lg:pb-14" data-member-profile="">
      {/* Cover + mobile identity */}
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-[#e5e7eb]/50 bg-[#e8eaee] sm:mb-5">
        <div className="relative h-[120px] sm:h-[140px] md:h-[160px]">
          {profile.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#e8ecf2] via-[#f3f4f6] to-[#e5e7eb]" aria-hidden />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" aria-hidden />
        </div>
        <div className="relative -mt-12 flex flex-col items-center px-4 pb-5 text-center lg:hidden" data-member-profile-mobile="">
          <AvatarLightbox src={profile.avatarUrl} name={profile.name}>
            <AppAvatar
              src={profile.avatarUrl}
              name={profile.name}
              size={128}
              className="h-[96px] w-[96px] cursor-zoom-in ring-[4px] ring-white shadow-lg"
            />
          </AvatarLightbox>
          <h1 className="mt-2 text-[20px] font-bold text-[#1a1a2e]">{profile.name}</h1>
          <p className="text-[13px] text-[#6b7280]">
            @{profile.username}
            {profile.memberSince ? <span className="text-[#c4c8cf]"> · Joined {profile.memberSince}</span> : null}
          </p>
          {profile.bio ? <p className="mt-2 max-w-md text-[14px] leading-relaxed text-[#374151]">{profile.bio}</p> : null}
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-[#6b7280]">
            <span><span className="font-semibold text-[#1a1a2e]">{profile.followers}</span> followers</span>
            <span><span className="font-semibold text-[#1a1a2e]">{profile.following}</span> following</span>
          </div>
          {!isSelf ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <MemberFollowButton targetUserId={profile.userId} initialFollowing={viewerFollowing} signedIn={!!viewerId} />
              {storeHref ? (
                <Link href={storeHref} className={cn(secondaryDepth, "inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[14px]")}>
                  <Store className="h-4 w-4" aria-hidden />
                  Store
                </Link>
              ) : null}
            </div>
          ) : (
            <Link href="/account" className={cn(secondaryDepth, "mt-3 h-10 rounded-xl px-5 text-[14px]")}>Edit your profile</Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-5 lg:order-1">
          {profile.products.length > 0 ? <ProductGrid profile={profile} /> : null}
          <ReviewsSection profile={profile} />
          {!hasFeed ? <EmptyFeed profile={profile} storeHref={storeHref} /> : null}
        </div>
        <div className="hidden lg:order-2 lg:block">
          <ProfileAside profile={profile} isSelf={isSelf} viewerId={viewerId} viewerFollowing={viewerFollowing} storeHref={storeHref} />
        </div>
      </div>

      <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-[#9ca3af] lg:hidden" data-member-powered-mobile="">
        <span>Powered by</span>
        <StorelibLogo size={32} fluid className="h-[15px] w-[15px] !rounded-[5px]" alt="Storelib" />
      </p>
    </div>
  )
}
