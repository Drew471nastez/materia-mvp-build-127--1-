"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, Flag, MoreHorizontal, Share2 } from "lucide-react"

/**
 * ===========================================================================
 *  THE LISTING'S BAR, WHEN THE PHOTOGRAPH HAS SCROLLED AWAY
 * ===========================================================================
 *
 * The twin of components/member/profile-pinned-header.tsx, and deliberately
 * built from the same pieces: the same `.profile-pinned` class, so it is the
 * same 52px of white with the same arrival curve and the same dead band, and
 * the same `PinnedButton` shape for its controls.
 *
 * That class is named for the screen it was written on and now serves two. The
 * alternative was a second rule that starts identical and drifts — one of them
 * 4px taller, one of them on a different easing — on the two screens people move
 * between most in the whole app. A slightly inaccurate class name is the cheaper
 * of those two problems, and this comment is the fix for it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CARRIES
 * ---------------------------------------------------------------------------
 * Exactly what was on the photograph and is now gone: the way back, the title of
 * the thing you are reading about, and the two controls from the top-right.
 * Nothing new is introduced — a bar that grows a control the screen did not have
 * is a bar that has to be learned.
 *
 * THE TITLE TRUNCATES, and that is not a detail. Listing titles are written by
 * sellers, they are frequently a paragraph, and the controls beside them have a
 * fixed width — so without `min-w-0` and `truncate` a long one pushes back,
 * manage and share straight off the right-hand edge of the screen. It takes
 * whatever measure is left and ends in an ellipsis.
 *
 * Portalled to the body because the listing column carries a transform during
 * its arrival animation, and `position: fixed` inside a transformed ancestor is
 * fixed to THAT — which would park this bar somewhere down the page.
 */
export function ListingPinnedHeader({
  instant,
  title,
  visible,
  isOwn,
  onBack,
  onManage,
  onShare,
}: {
  /**
   * True when this bar is hidden because the SCREEN went, not because the
   * scroll did. See `left` in lib/marketplace/use-pinned-bar — it makes the
   * disappearance instant, so the bar does not slide out of the top of the
   * screen while a sheet climbs in from the bottom of it.
   */
  instant?: boolean
  title: string
  visible: boolean
  isOwn: boolean
  onBack: () => void
  onManage: () => void
  onShare: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <div
      className="profile-pinned md:hidden"
      data-shown={visible ? "true" : "false"}
      data-instant={instant ? "true" : undefined}
      aria-hidden={!visible}
    >
      <div className="relative mx-auto flex h-[52px] w-full max-w-[1100px] items-center px-2">
        <PinnedButton label="Înapoi" onClick={onBack}>
          <ArrowLeft className="h-[21px] w-[21px]" strokeWidth={2.2} />
        </PinnedButton>

        {/* CENTRED IN THE BAR, NOT IN WHAT IS LEFT OF IT.

            It was a flex child between the back arrow and the controls, which
            centres it in the leftover space — and the two sides are not the same
            width (one button on the left, two on the right), so the title sat
            visibly left of centre and read as hanging off the back arrow rather
            than titling the screen.

            Absolutely positioned across the full bar and centred there, which is
            the only way a title is centred against the SCREEN while the things
            beside it are different widths. `max-w` reserves the wider of the two
            sides at both ends — two 36px controls, their gap and the bar's
            padding — so a long title truncates before it can reach either, and
            the centring never has to fight them.

            `pointer-events-none` because it now overlays the controls' row: a
            transparent strip across the middle of a bar is otherwise a strip
            that swallows taps aimed at the buttons underneath it. */}
        <span className="pointer-events-none absolute inset-x-0 mx-auto max-w-[calc(100%-180px)] truncate text-center text-[16px] font-semibold tracking-[-0.01em] text-neutral-900">
          {title}
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {isOwn ? (
            <PinnedButton label="Gestionează anunțul" onClick={onManage}>
              <MoreHorizontal className="h-[20px] w-[20px]" strokeWidth={2.2} />
            </PinnedButton>
          ) : (
            <PinnedButton label="Raportează" onClick={() => undefined}>
              <Flag className="h-[18px] w-[18px]" />
            </PinnedButton>
          )}
          <PinnedButton label="Distribuie" onClick={onShare}>
            <Share2 className="h-[18px] w-[18px]" />
          </PinnedButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * No press-scale, for the reason the profile's bar states: these sit in a bar
 * that is itself sliding, and a control that shrinks under the finger while its
 * container moves is two motions arguing.
 */
function PinnedButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-700 [-webkit-tap-highlight-color:transparent] touch-manipulation transition-colors duration-200 ease-out active:duration-0 active:bg-neutral-100 active:text-neutral-900 md:hover:bg-neutral-100"
    >
      {children}
    </button>
  )
}
