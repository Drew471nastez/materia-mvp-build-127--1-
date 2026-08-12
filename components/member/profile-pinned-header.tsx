"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Bookmark, Settings, Share2 } from "lucide-react"

import { AvatarPhoto } from "@/components/ui/initial-avatar"
import { ProfileBadges } from "@/components/marketplace/profile-badges"
import { savedShelfHref } from "@/lib/marketplace/saved-items"
import { triggerHaptic } from "@/lib/native-bridge"
import { beginTabLeave } from "@/lib/tab-leave"

/**
 * ===========================================================================
 *  THE BAR THAT ARRIVES WHEN THE NAME LEAVES
 * ===========================================================================
 *
 * Scroll a profile and everything identifying it goes: the cover, the avatar,
 * the name, and the four controls that were sitting on the cover. Forty cards
 * down you are looking at an anonymous grid of photographs with no way to reach
 * settings, no way to share, and nothing saying whose shop this is — on the one
 * screen where "whose is this" is the entire question.
 *
 * So the identity re-forms at the top: the name, and the controls that were on
 * the cover, sliding down as the real one goes.
 *
 * NOT the edit control. There is a full "Editează profilul" button in the
 * header — a pencil in a bar that appears next to it is the same door twice,
 * and the icon is the one of the four whose meaning is least obvious.
 *
 * ---------------------------------------------------------------------------
 * IT IS NOT DRIVEN BY A SCROLL HANDLER
 * ---------------------------------------------------------------------------
 * `visible` comes from an IntersectionObserver watching a zero-height sentinel
 * under the name, which the caller places. That matters for how this feels: a
 * scroll listener runs on the main thread on every frame of every flick, on the
 * one screen that is already scrolling a grid of images, to compute a boolean
 * that changes twice per session. The observer fires exactly twice.
 *
 * And the bar itself moves on transform and opacity only, so its arrival is the
 * compositor's business and never the layout's.
 *
 * Portalled to the body because the profile column carries a transform during
 * its arrival animation, and `position: fixed` inside a transformed ancestor is
 * fixed to THAT — which would park this bar somewhere down the page.
 */
export function ProfilePinnedHeader({
  instant,
  name,
  username,
  verified,
  staff,
  avatarUrl,
  visible,
  isOwner,
  onShare,
}: {
  name: string
  /** Whose profile this bar stands in for — the bookmark below points at their
   *  Salvate tab, and it only renders when that is you. */
  username: string
  /** The same two marks the header above carries. A bar that stands in for
   *  the identity has to stand in for all of it — a name that is verified up
   *  the page and unmarked in the bar is the bar disagreeing with the page it
   *  replaced. */
  verified?: boolean | null
  staff?: boolean | null
  /** The same picture the header above uses. `null` for a member who has not
   *  uploaded one — see the fallback in `PinnedAvatar`. */
  avatarUrl: string | null
  visible: boolean
  isOwner: boolean
  onShare: () => void
  /**
   * True when this bar is hidden because the SCREEN went, not because the
   * scroll did. See `left` in lib/marketplace/use-pinned-bar — it makes the
   * disappearance instant, so the bar does not slide out of the top of the
   * screen while a sheet climbs in from the bottom of it.
   */
  instant?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <div
      className="profile-pinned"
      data-shown={visible ? "true" : "false"}
      data-instant={instant ? "true" : undefined}
      aria-hidden={!visible}
    >
      <div className="mx-auto flex h-[52px] w-full max-w-[1100px] items-center gap-3 px-4 md:px-8">
        {/* The name, at the size a title bar uses rather than the size the
            header uses — this is a label saying where you are, not the heading
            again. It takes the whole measure it can and truncates, because the
            controls have a fixed width and a long display name must never push
            them off the edge. */}
        {/* THE FACE AND THE NAME ARE ONE OBJECT, AND THE FACE LEADS.

            The avatar was once pushed to the far end of the bar, against the
            controls — so the two halves of "whose profile is this" sat at
            opposite edges with a void between them, and the picture read as a
            fourth button rather than as part of the identity. Grouping them
            fixed that and has never been in question.

            THE ORDER HAS BEEN. It was written name-then-face, then face-then-
            name, then back again, and the record of that is worth keeping
            because the deciding argument was not an aesthetic one either time:
            it was asked for, then the opposite was asked for, and the second
            ask is the current one. Face first — the order the header below uses,
            and the order a profile is read in everywhere else.

            The layout is the same either way. `min-w-0` on the group with
            `truncate` on the text means a long display name shortens rather
            than shoving the controls off the edge, which is the only failure
            mode that actually matters, and it holds whichever element is
            first. So this is a preference, it is settled, and it should change
            only if the same person asks again. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PinnedAvatar name={name} url={avatarUrl} />
          <span className="min-w-0 truncate text-[16px] font-bold tracking-[-0.01em] text-neutral-900">
            {name}
          </span>
          <ProfileBadges verified={verified} staff={staff} size={15} />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <PinnedButton label="Distribuie" onClick={onShare}>
            <Share2 className="h-[18px] w-[18px]" />
          </PinnedButton>
          {isOwner && (
            <>
              {/* The tab on the page this bar is standing in for, not the
                  separate /wishlist screen it used to leave for. */}
              <PinnedButton label="Salvate" href={savedShelfHref(username)}>
                <Bookmark className="h-[18px] w-[18px]" />
              </PinnedButton>
              <PinnedButton label="Setări" href="/settings">
                <Settings className="h-[18px] w-[18px]" />
              </PinnedButton>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * 28px of face, and a LETTER when there is no face.
 *
 * NOT AN EMOJI, and that is worth stating because it is the obvious shortcut for
 * an empty avatar and it is wrong in a way that only shows up on other people's
 * phones. An emoji is drawn by the operating system: the same profile would be a
 * flat grey bust on one Android, a blue-and-white one on an iPhone, and on a
 * device with no font covering that codepoint a hollow rectangle. It arrives at
 * whatever size and colour the vendor chose, so it cannot be made to match the
 * neutral it sits in, and next to a real photograph in the same 28px circle the
 * mismatch is the loudest thing in the bar.
 *
 * The initial is none of that. It is the app's own typeface at the app's own
 * weight in the app's own grey, it is identifying rather than decorative — a C
 * for Corina says more than a generic silhouette does — and it is exactly what
 * the full-size avatar above already falls back to, so the two agree instead of
 * the bar inventing a second answer to the same question.
 */
function PinnedAvatar({ name, url }: { name: string; url: string | null }) {
  return (
    <span
      aria-hidden
      className="block h-7 w-7 shrink-0 overflow-hidden rounded-full bg-neutral-100 ring-1 ring-neutral-200/80"
    >
      {/* Twenty-eight pixels. The bar re-renders on every scroll frame, so
          this is the last place in the app that should be holding a
          full-resolution decode in memory. The letter below is unchanged — see
          the note above for why it is a letter and not an emoji. */}
      <AvatarPhoto url={url} size={28} className="h-full w-full object-cover">
        <span className="flex h-full w-full items-center justify-center text-[12px] font-semibold text-neutral-400">
          {name.trim().charAt(0).toUpperCase()}
        </span>
      </AvatarPhoto>
    </span>
  )
}

/**
 * A link when it goes somewhere and a button when it does something — the
 * difference is what a screen reader announces and whether a long-press offers
 * "open in new tab".
 *
 * No press-scale. These sit in a bar that is itself sliding, and a control that
 * shrinks under the finger while its container moves is two motions arguing.
 */
function PinnedButton({
  label,
  href,
  onClick,
  children,
}: {
  label: string
  href?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const cls =
    "flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 transition-colors duration-200 ease-out active:duration-0 active:bg-neutral-100 active:text-neutral-900 md:hover:bg-neutral-100"

  if (href) {
    return (
      <Link
        href={href}
        prefetch
        aria-label={label}
        className={cls}
        onClick={() => {
          void triggerHaptic("light")
          beginTabLeave()
        }}
      >
        {children}
      </Link>
    )
  }
  return (
    <button type="button" aria-label={label} className={cls} onClick={onClick}>
      {children}
    </button>
  )
}
