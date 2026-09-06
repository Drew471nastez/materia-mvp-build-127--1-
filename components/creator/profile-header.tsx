"use client"

import Image from "next/image"
import { useState } from "react"
import { Pencil } from "lucide-react"

import { SocialMediaIcons } from "@/components/store-builder/social-media-icons"
import type { SocialLinksConfig } from "@/lib/store-builder/types"
import { toOriginalImageUrl } from "@/lib/storage/image-url"
import { cn } from "@/lib/utils"
import { EditProfileModal } from "./edit-profile-modal"

/**
 * ===========================================================================
 *  THE CREATOR IDENTITY HEADER
 * ===========================================================================
 *
 * Cover, avatar, name, handle, bio, social icons — and, for the person who owns
 * the page, a way in to change all of it.
 *
 * WHY THIS IS A FIXED HEADER RATHER THAN A BUILDER SECTION.
 * The storefront renders whatever sections a creator has arranged, so the
 * obvious move was to make this one more of those. It is not, deliberately:
 * identity is not content. Every creator page needs a face, a name and a handle
 * whether or not its owner has ever opened the builder, and a section can be
 * deleted, reordered beneath the fold, or simply never added. So this is drawn
 * above the sections, always, and the builder keeps control of everything below
 * it.
 *
 * NOTHING HERE IS INVENTED DATA. The name, handle, bio, avatar and cover are
 * columns that already exist on the profile; the social links are the ones the
 * store builder already stores and already lets a creator edit. A row only
 * appears when there is something real to put in it — no placeholder bio, no
 * empty social strip, no "@undefined".
 */

export type ProfileHeaderProps = {
  displayName: string
  username: string | null
  bio: string | null
  avatarUrl: string | null
  coverUrl: string | null
  socialLinks?: SocialLinksConfig
  /** True only when the signed-in viewer owns this page. Decided on the server. */
  isOwner?: boolean
  /** Passed through to the edit modal so it can write to the right rows. */
  profileId?: string
  creatorId?: string
}

export function ProfileHeader({
  displayName,
  username,
  bio,
  avatarUrl,
  coverUrl,
  socialLinks,
  isOwner = false,
  profileId,
  creatorId,
}: ProfileHeaderProps) {
  const [editing, setEditing] = useState(false)

  // Live values, so a save is reflected without a reload.
  const [profile, setProfile] = useState({ displayName, bio, avatarUrl, coverUrl, socialLinks })

  const initials = (profile.displayName || username || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  // A social strip is only worth drawing if at least one link is switched on AND
  // has somewhere to go. `enabled` alone is not enough — the builder can leave a
  // platform on with an empty url, and five icons linking to nothing is worse
  // than no strip at all.
  const hasSocials = Object.values(profile.socialLinks ?? {}).some(
    (l) => l && (l as { enabled?: boolean; url?: string }).enabled && (l as { url?: string }).url?.trim(),
  )

  const cover = toOriginalImageUrl(profile.coverUrl)
  const avatar = toOriginalImageUrl(profile.avatarUrl)

  return (
    <header className="w-full">
      {/* ── Cover ────────────────────────────────────────────────────────────
          A fixed aspect ratio rather than a fixed height, so the crop is the
          same shape on a phone and a desktop and a creator's banner is never
          letterboxed on one and cropped to a stripe on the other. */}
      <div className="relative w-full overflow-hidden rounded-b-2xl bg-muted sm:rounded-2xl">
        <div className="relative aspect-[3/1] w-full">
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              priority
              quality={80}
              sizes="(max-width: 1024px) 100vw, 1100px"
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-muted to-muted-foreground/10" />
          )}
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full",
              "bg-black/55 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur-sm",
              "transition-colors hover:bg-black/70 active:scale-[0.98]",
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit profile
          </button>
        )}
      </div>

      {/* ── Avatar, overlapping the cover by half ───────────────────────────
          The negative margin is half the avatar's own height at each breakpoint,
          so the overlap stays exactly half however the ring is sized. */}
      <div className="flex flex-col items-center px-4">
        <div className="-mt-10 sm:-mt-12">
          <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-background bg-muted shadow-sm sm:h-24 sm:w-24">
            {avatar ? (
              <Image src={avatar} alt={profile.displayName} fill sizes="96px" className="object-cover" priority />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                {initials}
              </div>
            )}
          </div>
        </div>

        <h1 className="mt-3 text-center text-2xl font-bold tracking-tight text-foreground">
          {profile.displayName}
        </h1>

        {username && <p className="mt-0.5 text-center text-sm text-muted-foreground">@{username}</p>}

        {profile.bio?.trim() && (
          <p className="mt-3 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
            {profile.bio}
          </p>
        )}

        {hasSocials && (
          <div className="mt-3">
            <SocialMediaIcons socialLinks={profile.socialLinks} iconColor="currentColor" />
          </div>
        )}
      </div>

      {isOwner && editing && (
        <EditProfileModal
          open={editing}
          onOpenChange={setEditing}
          profileId={profileId}
          creatorId={creatorId}
          initial={{
            displayName: profile.displayName,
            bio: profile.bio,
            avatarUrl: profile.avatarUrl,
            coverUrl: profile.coverUrl,
            socialLinks: profile.socialLinks,
          }}
          onSaved={(next) => setProfile((p) => ({ ...p, ...next }))}
        />
      )}
    </header>
  )
}
