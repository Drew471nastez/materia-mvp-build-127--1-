import Link from "next/link"
import { Star } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { MemberFollowButton } from "@/components/profile/member-follow-button"
import type { MemberProfileData } from "@/lib/profile/member-profile-data"
import { getStoreInternalPath } from "@/lib/url-helpers"
import { secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"

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

  return (
    <div className="mx-auto w-full max-w-[560px] pb-10 lg:max-w-[640px] lg:pb-14" data-member-profile="">
      <header className="flex flex-col items-center rounded-2xl border border-[#e5e7eb]/60 bg-white px-6 pb-6 pt-5 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <AppAvatar
          src={profile.avatarUrl}
          name={profile.name}
          size={128}
          className="h-[112px] w-[112px] ring-[3px] ring-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_8px_20px_-10px_rgba(16,24,40,0.32)] md:h-[128px] md:w-[128px]"
        />
        <h1 className="mt-3.5 line-clamp-2 max-w-full text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-[#1a1a2e] md:text-[26px]">
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
          <p className="mt-2.5 max-w-[420px] whitespace-pre-line text-[14px] leading-[1.5] text-[#374151]">{profile.bio}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-[13px] text-[#6b7280]">
          <span>
            <span className="font-semibold text-[#1a1a2e] tabular-nums">{profile.followers}</span> followers
          </span>
          <span>
            <span className="font-semibold text-[#1a1a2e] tabular-nums">{profile.following}</span> following
          </span>
        </div>
        {!isSelf ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <MemberFollowButton targetUserId={profile.userId} initialFollowing={viewerFollowing} signedIn={!!viewerId} />
            {storeHref ? (
              <Link href={storeHref} className={cn(secondaryDepth, "h-10 rounded-xl px-5 text-[14px]")} data-member-store="">
                Visit store
              </Link>
            ) : null}
          </div>
        ) : (
          <Link href="/account" className={cn(secondaryDepth, "mt-4 h-10 min-w-[140px] rounded-xl px-5 text-[14px]")}>
            Your profile
          </Link>
        )}
      </header>

      <section
        className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5 sm:py-5 lg:mt-8"
        aria-label="Public reviews"
      >
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Reviews on Storelib</h2>
        <p className="mt-0.5 text-[13px] text-[#6b7280]">What they shared after a purchase.</p>
        {profile.reviews.length === 0 ? (
          <p className="mt-6 min-h-[120px] text-center text-[14px] text-[#6b7280] sm:text-left">No public reviews yet.</p>
        ) : (
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
        )}
      </section>

      <p className="mt-10 flex items-center justify-center gap-1.5 text-[11px] text-[#9ca3af]" data-member-powered="">
        <span>Powered by</span>
        <StorelibLogo size={32} fluid className="h-[15px] w-[15px] !rounded-[5px]" alt="Storelib" />
      </p>
    </div>
  )
}
