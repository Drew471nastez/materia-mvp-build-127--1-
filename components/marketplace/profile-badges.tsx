"use client"

import { BadgeCheck } from "lucide-react"

import { InfoTip } from "@/components/ui/info-tip"
import { STORELIB_MARK_URL } from "@/lib/marketplace/storelib-mark"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE MARKS THAT SIT AFTER A NAME
 * ===========================================================================
 *
 * Two of them, and they answer different questions:
 *
 *   VERIFIED — a blue check. This account is who it says it is. It is the
 *   convention every social product uses and it is recognised without being
 *   explained, which is the whole reason to use the convention rather than
 *   invent a mark.
 *
 *   STAFF — the Storelib mark. This person works here. Pressing or hovering it
 *   says "Storelib Admin", because a logo beside a stranger's name is otherwise
 *   ambiguous in the worst direction: it reads as an advertisement, or as a
 *   badge you could buy, rather than as a statement about who is talking to
 *   you.
 *
 * They are independent — see the columns in RUN_MESSAGING_ALL.sql — so a
 * verified seller who does not work here gets the first and not the second.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STAFF MARK IS DELIBERATELY AWKWARD TO TAKE
 * ---------------------------------------------------------------------------
 * A badge that claims a person speaks for the platform is exactly the thing
 * somebody impersonating the platform wants a copy of. It cannot be made
 * impossible to obtain — anything on screen can be screenshotted — but it can
 * be made to not fall into a drag or a long-press by accident, which is how
 * most of these actually get lifted: `draggable={false}` kills the drag-to-copy
 * on a desktop, `user-select: none` and the touch-callout suppression kill the
 * hold-to-save sheet on iOS, and the context menu is refused.
 *
 * None of that is security. It is the difference between "you have to mean it"
 * and "it happens by accident", and the mark is granted by a column in the
 * database rather than by markup, so a copied PNG is a picture and not a badge.
 */

export type ProfileBadgeFlags = {
  /** profiles.is_verified */
  verified?: boolean | null
  /** profiles.is_staff */
  staff?: boolean | null
}

export function ProfileBadges({
  verified,
  staff,
  size = 16,
  className,
}: ProfileBadgeFlags & {
  /** Matched to the text it follows. 16 beside a 17px name, 14 in a list. */
  size?: number
  className?: string
}) {
  if (!verified && !staff) return null

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 align-middle", className)}>
      {verified && (
        <BadgeCheck
          aria-label="Cont verificat"
          role="img"
          className="shrink-0 text-[#1d9bf0]"
          style={{ width: size, height: size }}
          strokeWidth={2.2}
        />
      )}
      {staff && <StaffMark size={size} />}
    </span>
  )
}

/**
 * The Storelib mark, and the sentence behind it.
 *
 * InfoTip does the measuring, the flip, the clamp and the portal — see the note
 * on its `trigger` prop. This supplies the thing you press and the words; none
 * of the positioning is worth a second implementation.
 */
function StaffMark({ size }: { size: number }) {
  return (
    <InfoTip
      label="Storelib Admin"
      markClassName="rounded-[5px] overflow-hidden"
      trigger={
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={STORELIB_MARK_URL}
          alt=""
          width={size}
          height={size}
          /**
           * NOT THROUGH next/image, and the reason is the same one
           * components/ui/initial-avatar.tsx records: the optimizer refuses a
           * vector source unless `dangerouslyAllowSVG` is on, and that flag
           * would apply to every remote host in remotePatterns — including the
           * OAuth avatar providers, where an SVG from a host we do not control
           * is a script-execution surface.
           *
           * There is nothing to optimise anyway. It is vector, a few hundred
           * bytes, and `decoding="sync"` with `loading="eager"` means it paints
           * with the name rather than a frame after it — which for a mark
           * sixteen pixels wide beside a heading is the difference between part
           * of the name and something that arrives late.
           */
          loading="eager"
          decoding="sync"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          className="block h-full w-full select-none object-contain [-webkit-touch-callout:none] [-webkit-user-drag:none]"
          style={{ width: size, height: size }}
        />
      }
    >
      Storelib Admin
    </InfoTip>
  )
}
