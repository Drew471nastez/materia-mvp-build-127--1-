"use client"

/**
 * ===========================================================================
 *  THE BUYER'S PROFILE: WHO THEY ARE, ABOVE WHAT THEY HAVE
 * ===========================================================================
 * /account is the signed in person's own profile. The owner asked for it as
 * a profile rather than a settings screen ("the account with multiple
 * subpages there, such as settings, overview. Like a profile, a user
 * profile"), and for the person centred ("The profile avatar and things
 * should be centre positioned, good clean").
 *
 * THE SITE HEADER IS BACK, AT EVERY WIDTH. The profile used to draw a light
 * bar of its own on a phone while the black site header was kept off it.
 * The owner reversed that: "The profile page reached from Explore needs to
 * have the header on it." So /account carries the platform header the way
 * /library does, the light bar is gone, and there is one bar on the screen
 * instead of the two that would otherwise stack.
 *
 * NO OVERVIEW / SETTINGS PILLS ANY MORE either. They were a two item switch
 * sitting directly under an Edit profile button that went to the same
 * place, and Settings has section pills of its own now
 * (components/account/account-settings.tsx). Two rows of pills, one inside
 * the other, is the card in a card of navigation. The profile is one page,
 * Edit profile is the way into Settings, and Settings closes back to here.
 *
 * So this is the person and nothing else: the photo, the name, @username,
 * the line they wrote about themselves, when they joined, and Edit profile.
 * On /account/settings it draws none of that (Settings has its own top row
 * and its own photo control), so a screen never has two faces on it.
 *
 * It lives in the layout (app/account/layout.tsx), so what sits under it is
 * whichever page is open.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { secondaryDepth } from "@/components/ui/depth-button"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { accountTabFor } from "@/lib/account/account-tabs"
import { AccountAvatar } from "@/components/account/account-photo"
import { AvatarLightbox } from "@/components/storefront/avatar-lightbox"
import { cn } from "@/lib/utils"

export interface AccountIdentity {
  /** Whose profile: Settings uploads a new photo under this folder. */
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  /** "March 2025", written on the server so the two renders agree. */
  memberSince: string
  /** profiles.bio, or null when there is none (or the column is not there yet). */
  bio?: string | null
}

export function AccountHub({ identity, children }: { identity: AccountIdentity; children: ReactNode }) {
  const pathname = usePathname()
  const shown = useShellAvatar(identity.avatarUrl)
  /* Settings is its own screen, with its own top row and its own photo. */
  const onSettings = accountTabFor(pathname) === 1
  const bio = (identity.bio || "").trim()

  if (onSettings) return <>{children}</>

  return (
    <div data-account-hub="" className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:items-start lg:gap-8 xl:gap-10">
      <div className="order-2 mt-6 min-w-0 lg:order-1 lg:mt-0" data-account-panel="overview">
        {children}
      </div>

      <header
        data-account-profile=""
        className="order-1 flex flex-col items-center text-center lg:order-2 lg:sticky lg:top-[calc(64px+1.5rem)] lg:rounded-2xl lg:border lg:border-[#e5e7eb]/60 lg:bg-white lg:px-6 lg:pb-6 lg:pt-5 lg:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      >
        {/*
          THE PICTURE OPENS, THE WAY A CREATOR'S DOES. It is the one image
          on this page worth actually looking at, and it was a cropped
          circle with nothing behind the press. This is the creator page's
          own dialog (components/storefront/avatar-lightbox), so the whole
          photograph opens uncropped on a dark ground, Escape and a press
          on the ground close it, focus returns to the circle, and it comes
          and goes on the app's curve rather than a second animation
          written here.

          A RING AND A LITTLE DEPTH, so it sits on the page rather than
          being stamped on it, and so its edge is there on a photograph
          whose corners are near white.

          AND A LITTLE BIGGER, with a little more sky over it: "the avatar
          should be a bit bigger just, and 2% more vertical space between
          the header at the top and the profile avatar". 96 to 104 on a
          phone, 112 to 120 from md. Then a step more, 104 to 112 and 120
          to 128, and a hair more weight under it: one close shadow and the
          same soft one, slightly nearer. Not a float.
        */}
        <div className="mt-[2vh]" data-account-avatar-room="">
          <AvatarLightbox src={shown} name={identity.name}>
            <AccountAvatar
              src={shown}
              name={identity.name}
              size={128}
              className="h-[112px] w-[112px] cursor-zoom-in shadow-[0_1px_2px_rgba(16,24,40,0.08),0_8px_20px_-10px_rgba(16,24,40,0.32)] ring-[3px] ring-white md:h-[128px] md:w-[128px]"
            />
          </AvatarLightbox>
        </div>
        <h1
          className="mt-3.5 line-clamp-2 max-w-full text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-[#1a1a2e] [overflow-wrap:anywhere] md:mt-4 md:text-[26px]"
          data-account-display-name=""
        >
          {identity.name || "Your profile"}
        </h1>
        {/*
          ONE LINE UNDER THE NAME, NOT TWO. The handle and when they joined
          are two small facts about the same person; on rows of their own
          they read as a list of fields rather than as a profile.
        */}
        <p className="mt-1 max-w-full text-[13px] leading-[1.45] text-[#6b7280] [overflow-wrap:anywhere]" data-account-meta="">
          {identity.username ? (
            <>
              <span className="text-[#4b5563]" data-account-username="">
                @{identity.username}
              </span>
              <span aria-hidden="true" className="px-1.5 text-[#c4c8cf]">
                ·
              </span>
            </>
          ) : null}
          Joined {identity.memberSince}
        </p>
        {bio ? (
          <p className="mt-2.5 max-w-[420px] whitespace-pre-line text-[14px] leading-[1.5] text-[#374151] [overflow-wrap:anywhere]" data-account-bio="">
            {bio}
          </p>
        ) : null}

        <Link
          href="/account/settings"
          prefetch={true}
          data-account-edit=""
          className={cn(secondaryDepth, "mt-4 h-10 min-w-[140px] rounded-xl px-5 text-[14px]")}
        >
          Edit profile
        </Link>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-[#9ca3af]" data-account-powered="">
          <span>Powered by</span>
          <StorelibLogo size={14} alt="" />
        </p>
      </header>
    </div>
  )
}
