/**
 * ===========================================================================
 *  THE TOP OF A PERSON'S PAGE: COVER, PHOTO, NAME, AND WHAT YOU CAN DO
 * ===========================================================================
 * One header for every profile, drawn the same wherever a person is shown
 * as themselves: /@handle for everybody else, and /account, which is that
 * same page seen by its owner (components/account/account-hub.tsx). The
 * creator page's own order: a band (their cover when they have one) with
 * the photo across its lower edge, the name, @handle and when they joined,
 * the bio, then followers / following and the buttons.
 *
 * The owner sees their own page with nothing to follow; they get a quiet
 * "Add cover" or "Change cover" on the band instead, which opens Settings
 * at the cover, and the pills to their own places under the header (the
 * caller draws those).
 *
 * No "use client" of its own: on /@handle it is drawn on the server, inside
 * /account by the client hub. Everything interactive in it is a client
 * component already (the lightbox, the counts and Follow).
 */
import Link from "next/link"
import type { ReactNode } from "react"
import { ImagePlus } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { AvatarLightbox } from "@/components/storefront/avatar-lightbox"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { cn } from "@/lib/utils"
import { ProfileSocial } from "./profile-social"

export interface ProfileHeroPerson {
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  coverUrl: string | null
  bio: string | null
  /** "March 2025", written on the server so both renders agree. */
  memberSince: string
  followers: number
  following: number
}

/** Where the owner's cover control goes: Settings, at the cover. */
export const COVER_SETTINGS_HREF = "/account/settings?section=profile#cover"

export function ProfileHero({
  person,
  viewerFollowing = false,
  signedIn,
  isSelf,
  messageHref = null,
  avatar,
  className,
}: {
  person: ProfileHeroPerson
  viewerFollowing?: boolean
  signedIn: boolean
  isSelf: boolean
  messageHref?: string | null
  /** The photo, when the caller draws its own (the account keeps its live copy of a just changed photo). */
  avatar?: ReactNode
  className?: string
}) {
  return (
    <div className={className} data-profile-hero="">
      {/* The band and the photo across its lower edge, as a creator page opens. */}
      <div className="relative overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-[#eceef1]" data-profile-cover={person.coverUrl ? "image" : "plain"}>
        <div className="relative h-[112px] sm:h-[168px]">
          {person.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={optimizedImageUrl(person.coverUrl, 960)}
              alt=""
              decoding="async"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_140%_at_50%_0%,#f4f5f7_0%,#e7e9ed_100%)]" />
          )}
          {isSelf ? (
            <Link
              href={COVER_SETTINGS_HREF}
              prefetch={false}
              data-profile-cover-edit=""
              className={cn(
                "absolute right-2.5 top-2.5 inline-flex h-10 items-center sm:bottom-2.5 sm:top-auto gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none backdrop-blur-sm transition-[background-color,scale] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/70 [-webkit-tap-highlight-color:transparent]",
                person.coverUrl ? "bg-black/45 text-white hover:bg-black/60" : "bg-white/85 text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:bg-white",
              )}
            >
              {/* Top right on a phone, where the photo across the band's edge cannot be under it. */}
              <ImagePlus className="h-4 w-4" aria-hidden />
              {person.coverUrl ? "Change cover" : "Add cover"}
            </Link>
          ) : null}
        </div>
      </div>

      <header className="relative -mt-[56px] flex flex-col items-center px-2 text-center sm:-mt-[64px]" data-profile-header="">
        {avatar ?? (
          <AvatarLightbox src={person.avatarUrl} name={person.name}>
            <AppAvatar
              src={person.avatarUrl}
              name={person.name}
              size={128}
              sizedByClass
              className="h-[112px] w-[112px] cursor-zoom-in shadow-[0_1px_2px_rgba(16,24,40,0.08),0_8px_20px_-10px_rgba(16,24,40,0.32)] ring-4 ring-[#f8f9fa] sm:h-[128px] sm:w-[128px]"
            />
          </AvatarLightbox>
        )}
        <h1 className="mt-3 line-clamp-2 max-w-full text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[26px]" data-profile-name="">
          {person.name || "Your profile"}
        </h1>
        <p className="mt-1 max-w-full text-[13px] leading-[1.45] text-[#6b7280] [overflow-wrap:anywhere]">
          {person.username ? (
            <span className="text-[#4b5563]" data-profile-handle="">
              @{person.username}
            </span>
          ) : null}
          {person.username && person.memberSince ? (
            <span aria-hidden className="px-1.5 text-[#c4c8cf]">
              ·
            </span>
          ) : null}
          {person.memberSince ? <>Joined {person.memberSince}</> : null}
        </p>
        {person.bio ? (
          <p className="mt-2.5 max-w-[520px] whitespace-pre-line text-[14px] leading-[1.5] text-[#374151] [overflow-wrap:anywhere] sm:text-[15px]" data-profile-bio="">
            {person.bio}
          </p>
        ) : null}

        <ProfileSocial
          className="mt-2 w-full"
          userId={person.userId}
          name={person.name}
          followers={person.followers}
          following={person.following}
          viewerFollowing={viewerFollowing}
          signedIn={signedIn}
          isSelf={isSelf}
          messageHref={messageHref}
        />
      </header>
    </div>
  )
}
