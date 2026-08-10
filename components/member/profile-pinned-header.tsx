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
  visible,
  isOwner,
  onShare,
}: {
  name: string
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
        <span className="min-w-0 flex-1 truncate text-[16px] font-bold tracking-[-0.01em] text-neutral-900">
          {name}
        </span>

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
