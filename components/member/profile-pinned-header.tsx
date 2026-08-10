"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Bookmark, Settings, Share2 } from "lucide-react"

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
  name,
  avatarUrl,
  visible,
  isOwner,
  onShare,
}: {
  name: string
  /** The same picture the header above uses. `null` for a member who has not
   *  uploaded one — see the fallback in `PinnedAvatar`. */
  avatarUrl: string | null
  visible: boolean
  isOwner: boolean
  onShare: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <div className="profile-pinned" data-shown={visible ? "true" : "false"} aria-hidden={!visible}>
      <div className="mx-auto flex h-[52px] w-full max-w-[1100px] items-center gap-3 px-4 md:px-8">
        {/* The name, at the size a title bar uses rather than the size the
            header uses — this is a label saying where you are, not the heading
            again. It takes the whole measure it can and truncates, because the
            controls have a fixed width and a long display name must never push
            them off the edge. */}
        {/* THE NAME AND THE FACE ARE ONE OBJECT.

            The avatar was pushed to the far end of the bar, against the
            controls — so the two halves of "whose profile is this" sat at
            opposite edges with a void between them, and the picture read as a
            fourth button rather than as part of the identity. Beside the name
            it is what it is: a face with a name next to it.

            To the RIGHT of the name rather than in front of it. The name takes
            whatever measure is left and truncates; putting a fixed 28px ahead
            of it would take that width from the one element here that already
            has too little. `min-w-0` on the group is what lets the name shorten
            instead of shoving the controls off the edge. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-[16px] font-bold tracking-[-0.01em] text-neutral-900">
            {name}
          </span>
          <PinnedAvatar name={name} url={avatarUrl} />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <PinnedButton label="Distribuie" onClick={onShare}>
            <Share2 className="h-[18px] w-[18px]" />
          </PinnedButton>
          {isOwner && (
            <>
              <PinnedButton label="Salvate" href="/wishlist">
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
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[12px] font-semibold text-neutral-400">
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
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
