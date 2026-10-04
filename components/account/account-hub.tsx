"use client"

/**
 * ===========================================================================
 *  THE PROFILE CENTER: YOUR PAGE, AS EVERYBODY SEES IT, WITH YOUR WAYS IN
 * ===========================================================================
 * /account is the signed in person's own profile page, and the owner asked
 * for it to be exactly the page other people see: "same header, cover,
 * avatar, tabs, look as the creator page) plus owner extras". So the top of
 * it is the very header /@handle draws (components/profile/profile-hero.tsx):
 * the cover edge to edge with Edit profile and the cover's camera button on
 * it, the photo across its lower edge, the name, @username, the bio and the
 * follower counts. Under it, where somebody else would find Follow, the
 * owner's pills (components/profile/profile-owner-pills.tsx): Activity,
 * Communities, Library, Settings.
 *
 * THE COVER IS OUTSIDE THE COLUMN. It runs the window's whole width like a
 * creator page's, so this hub draws the profile's column itself
 * (components/account/account-column.tsx), under the person, rather than
 * being drawn inside the layout's.
 *
 * THE PHOTO IS THE ACCOUNT'S LIVE COPY. A photo just changed in Settings is
 * announced to the shell (lib/account/avatar-store), and the circle here
 * reads that copy, so it is the new face at once. Pressed, it opens the
 * creator page's own lightbox, uncropped, Escape and the ground close it.
 *
 * WHERE IT STANDS ASIDE (lib/profile/owner-pills.ts showsProfileHeader):
 * Settings has its own top row and its own photo, so a screen never has
 * two faces on it; and the library is a page of its own, with its own
 * title over its sub pills (components/library/library-tabs.tsx).
 *
 * The site header stays above all of it at every width, as on every buyer
 * page: one bar on the screen, never two stacked.
 */

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { showsProfileHeader } from "@/lib/profile/owner-pills"
import { AccountAvatar } from "@/components/account/account-photo"
import { AvatarLightbox } from "@/components/storefront/avatar-lightbox"
import { PROFILE_AVATAR_CLASS, PROFILE_AVATAR_PX, ProfileHero } from "@/components/profile/profile-hero"
import { ProfileOwnerPills } from "@/components/profile/profile-owner-pills"
import { AccountColumn } from "@/components/account/account-column"

export interface AccountIdentity {
  /** Whose profile: Settings uploads a new photo under this folder. */
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  /** profiles.bio, or null when there is none (or the column is not there yet). */
  bio?: string | null
  /** Their own cover (profiles.cover_url), else their store's; null for none. */
  coverUrl?: string | null
  followers?: number
  following?: number
}

export function AccountHub({ identity, communities = false, children }: { identity: AccountIdentity; communities?: boolean; children: ReactNode }) {
  const pathname = usePathname()
  const shown = useShellAvatar(identity.avatarUrl)
  const name = identity.name || "Your profile"

  if (!showsProfileHeader(pathname)) return <AccountColumn>{children}</AccountColumn>

  return (
    <div data-account-hub="">
      <ProfileHero
        person={{
          userId: identity.userId,
          name,
          username: identity.username,
          avatarUrl: shown,
          coverUrl: identity.coverUrl ?? null,
          bio: (identity.bio || "").trim() || null,
          followers: identity.followers ?? 0,
          following: identity.following ?? 0,
        }}
        signedIn
        isSelf
        avatar={
          <AvatarLightbox src={shown} name={name}>
            <AccountAvatar
              src={shown}
              name={name}
              size={PROFILE_AVATAR_PX.wide}
              className={PROFILE_AVATAR_CLASS}
            />
          </AvatarLightbox>
        }
      />
      <AccountColumn top={false}>
        <ProfileOwnerPills communities={communities} className="mt-3" />
        <div className="mt-6 min-w-0 sm:mt-8" data-account-panel="">
          {children}
        </div>
      </AccountColumn>
    </div>
  )
}
