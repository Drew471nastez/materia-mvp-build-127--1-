/**
 * ===========================================================================
 *  THE TOP OF A PERSON'S PAGE: COVER, PHOTO, NAME, AND WHAT YOU CAN DO
 * ===========================================================================
 * One header for every profile, drawn the same wherever a person is shown
 * as themselves: /@handle for everybody else, and /account, which is that
 * same page seen by its owner (components/account/account-hub.tsx). The
 * creator page's own order: a band (their cover when they have one) with
 * the photo across its lower edge, the name and @handle, the bio, then one
 * quiet followers / following line and the buttons.
 *
 * THE BAND RUNS EDGE TO EDGE, as a creator page's does: "the cover is full
 * bleed like creator pages (not a rounded card)". So this header is drawn
 * outside the page's column, and keeps a column of its own for the person
 * under the band. The band is 157px on a phone, 233 and then 312 wider up
 * (lib/profile/cover.ts PROFILE_COVER_HEIGHTS: fifteen percent over the
 * creator page's 128 / 192 / 256 in round 10, then about six percent more
 * in round 11, as the owner asked of /account and Settings). No "Joined" line under the name: the activity
 * already ends on the day they joined, and the owner asked for it gone.
 *
 * The owner sees their own page with nothing to follow; on the band they
 * get Edit profile, a real Storelib button, which opens Settings at the
 * profile's fields, the cover among them (components/account/cover-field.tsx:
 * pick it, drag it into place). No second button for the cover beside it:
 * the owner asked for the camera gone.
 *
 * THE BUTTON DOES NOT GO UNDER THE BAR. It used to be pinned 12px inside
 * the band's top, which is 12px under a header that stays on screen: the
 * first flick of a scroll cut it in half and the rest of the scroll hid it
 * (the owner's screenshot). It is a sticky row now, pinned 12px below the
 * real measured height of that bar (components/profile/profile-chrome-var
 * .tsx writes --profile-chrome; the bar is 64.6px on a phone, 71.75 on a
 * computer, more in the app by the status bar's inset), so it holds that
 * one place for as long as its own cover is on screen and leaves with the
 * cover rather than sliding under the bar. Its travel stops 12px above the
 * band's foot, which is where the photo crosses the edge.
 *
 * AND IT IS NEVER ON THE PHOTO. The photo straddles the band's lower edge
 * in the CENTRE, so a right aligned button has to clear it: "Edit profile"
 * is about 110px, which on a 320px screen reaches back past the photo's
 * right edge, and the two meet while the button is pinned and the photo
 * rises towards it. Under `sm` the button says "Edit", about 60px, which
 * clears the photo at every width from 320 up; from `sm`, where the band is
 * taller and there is room, it says "Edit profile". Its label for a screen
 * reader is "Edit profile" either way.
 *
 * THE COVER IS DRAWN WHERE IT WAS PLACED. The stored address carries the
 * crop chosen in Settings (lib/profile/cover.ts parseProfileCover), and the
 * picture is laid out with the creator page's own crop model
 * (lib/images/cover-crop.ts coverCropStyle), so the band shows exactly what
 * the frame in Settings showed at this width.
 *
 * No "use client" of its own: on /@handle it is drawn on the server, inside
 * /account by the client hub. Everything interactive in it is a client
 * component already (the lightbox, the counts and Follow).
 */
import Link from "next/link"
import type { ReactNode } from "react"
import { AppAvatar } from "@/components/app/app-avatar"
import { AvatarLightbox } from "@/components/storefront/avatar-lightbox"
import { secondaryDepth } from "@/components/ui/depth-button"
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT } from "@/lib/account/account-tabs"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { coverCropStyle } from "@/lib/images/cover-crop"
import { parseProfileCover } from "@/lib/profile/cover"
import { EDIT_PROFILE_HREF } from "@/lib/profile/owner-pills"
import { cn } from "@/lib/utils"
import { ProfileChromeVar, PROFILE_CHROME_VAR } from "./profile-chrome-var"
import { ProfileCoverImage } from "./profile-cover-image"
import { ProfileSocial } from "./profile-social"

export interface ProfileHeroPerson {
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  coverUrl: string | null
  bio: string | null
  followers: number
  following: number
}

/**
 * THE PHOTO'S SIZE AND RING, shared with /account's live copy of it
 * (components/account/account-hub.tsx) so the two never drift. 125px on a
 * phone and 142px wider up: the 112 / 128 it was, five percent up in round
 * 10 (every creator page and profile), then "a touch bigger (about +6%)" in
 * round 11, asked of /account, which is this same page. The ring is the page's own
 * ground (#f8f9fa, the Storelib page every profile sits on), so the photo
 * reads as cut out of the page where it crosses the cover.
 *
 * A LIGHTER RING: "the avatar border lighter (thinner, softer)". 2px where
 * it was 4, so the photo sits on the band rather than being framed on it.
 *
 * A LITTLE MORE DEPTH, round 13: the photo read flat on the cover. The soft
 * shadow is a touch deeper and travels further (0 10px 22px -12px at 0.34
 * where it was 0 6px 16px -10px at 0.2), and the ring is crisper without
 * being thicker: the same 2px of page ground, with a hairline of ink at its
 * outer edge (an outline, offset to exactly the ring's edge, so it costs no
 * layout and follows the circle). Still no drop shadow under a cut out.
 */
export const PROFILE_AVATAR_PX = { phone: 125, wide: 142 } as const
export const PROFILE_AVATAR_CLASS =
  "h-[125px] w-[125px] cursor-zoom-in shadow-[0_1px_2px_rgba(16,24,40,0.08),0_10px_22px_-12px_rgba(16,24,40,0.34)] ring-2 ring-[#f8f9fa] outline-1 outline-offset-2 outline-[rgba(16,24,40,0.09)] sm:h-[142px] sm:w-[142px]"

/** The person's column under the band: the profile's own width and the account's side padding. */
const COLUMN = "mx-auto w-full max-w-[960px]"

/**
 * WHERE EDIT PROFILE HOLDS: 12px under the bar that stays over the page,
 * measured from the bar itself (components/profile/profile-chrome-var.tsx).
 * The fallback is the phone bar's own height, which is what the header's
 * stand in reserves (components/marketing/conditional-header.tsx), so the
 * first paint before the measurement lands is already right to a pixel or
 * two; and a sticky `top` changes nothing at all until the page is scrolled.
 */
export const EDIT_PIN_TOP = `calc(max(64.6px, var(${PROFILE_CHROME_VAR}, 0px)) + 12px)`
const GUTTERS = { paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT } as const

export function ProfileHero({
  person,
  viewerFollowing = false,
  signedIn,
  isSelf,
  avatar,
  className,
}: {
  person: ProfileHeroPerson
  viewerFollowing?: boolean
  signedIn: boolean
  isSelf: boolean
  /** The photo, when the caller draws its own (the account keeps its live copy of a just changed photo). */
  avatar?: ReactNode
  className?: string
}) {
  const cover = parseProfileCover(person.coverUrl)
  return (
    <div className={className} data-profile-hero="">
      {/* The band, edge to edge, and the photo across its lower edge, as a creator page opens. */}
      {/* The clipping is the picture's own box, not this one: a sticky child of
          an overflow:hidden box takes that box as its scrollport and never
          sticks, and the button on the band has to stick. */}
      <div className="relative w-full bg-[#eceef1]" data-profile-cover={cover.url ? "image" : "plain"}>
        <div className="relative h-[157px] sm:h-[233px] lg:h-[312px] overflow-hidden" data-profile-cover-band="">
          {cover.url ? (
            /* Fades in on the band's grey when the page is opened in the app, rather than landing in one frame. */
            <ProfileCoverImage src={optimizedImageUrl(cover.url, 1600)} style={coverCropStyle(cover.crop)} />
          ) : (
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_140%_at_50%_0%,#f4f5f7_0%,#e7e9ed_100%)]" />
          )}
        </div>
        {isSelf ? (
          <>
            <ProfileChromeVar />
            {/*
              THE BUTTON'S TRACK: 12px inside the band's top, down to its
              foot, so the row's travel is the band's height less that and
              the button's: 101px on a phone, 169 and 248 wider up. Measured
              (scripts/check-profile-band.mjs), that is a few pixels longer
              than it takes for the photo itself to reach the bar, so the
              button holds its place for exactly as long as the photo it
              belongs to is on screen, and the two leave together.

              It takes no touches of its own; the button inside it does, so
              the photo and the cover under it are still pressable.
            */}
            <div className="pointer-events-none absolute inset-x-0 bottom-1 top-3" data-profile-cover-actions="">
              <div className="sticky" style={{ top: EDIT_PIN_TOP }} data-profile-edit-pin="">
                <div className={cn(COLUMN, "flex items-center justify-end gap-2")} style={GUTTERS}>
                  <Link
                    href={EDIT_PROFILE_HREF}
                    prefetch={false}
                    aria-label="Edit profile"
                    data-profile-edit=""
                    className={cn(secondaryDepth, "pointer-events-auto h-10 rounded-[10px] px-4 text-[14px]")}
                  >
                    {/*
                      "Edit profile" everywhere it fits, which is every phone
                      from 390px up. Narrower than that the centred 125px
                      photo and a 106px button cannot both clear the gutters
                      for the whole of the pinned travel: the collision is at
                      viewport < 369px + margin, so 390 is the first common
                      width with room to spare (about 10px at 390, 30 at 430).
                      The accessible name is "Edit profile" at every width.
                    */}
                    <span className="min-[390px]:hidden">Edit</span>
                    <span className="hidden min-[390px]:inline">Edit profile</span>
                  </Link>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Half the photo over the band's lower edge, at both sizes. */}
      <header className={cn(COLUMN, "relative -mt-[62.5px] flex flex-col items-center text-center sm:-mt-[71px]")} style={GUTTERS} data-profile-header="">
        {avatar ?? (
          <AvatarLightbox src={person.avatarUrl} name={person.name}>
            <AppAvatar
              src={person.avatarUrl}
              name={person.name}
              size={PROFILE_AVATAR_PX.wide}
              sizedByClass
              className={PROFILE_AVATAR_CLASS}
            />
          </AvatarLightbox>
        )}
        <h1 className="mt-3 line-clamp-2 max-w-full text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[26px]" data-profile-name="">
          {person.name || "Your profile"}
        </h1>
        {person.username ? (
          <p className="mt-1 max-w-full text-[13px] leading-[1.45] text-[#4b5563] [overflow-wrap:anywhere]" data-profile-handle="">
            @{person.username}
          </p>
        ) : null}
        {person.bio ? (
          <p className="mt-2.5 max-w-[520px] whitespace-pre-line text-[14px] leading-[1.5] text-[#374151] [overflow-wrap:anywhere] sm:text-[15px]" data-profile-bio="">
            {person.bio}
          </p>
        ) : null}

        <ProfileSocial
          className="mt-3 w-full"
          userId={person.userId}
          name={person.name}
          followers={person.followers}
          following={person.following}
          viewerFollowing={viewerFollowing}
          signedIn={signedIn}
          isSelf={isSelf}
        />
      </header>
    </div>
  )
}
