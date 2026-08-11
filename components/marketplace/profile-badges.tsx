"use client"

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
      {verified && <VerifiedSeal size={size} />}
      {staff && <StaffMark size={size} />}
    </span>
  )
}

/**
 * THE SEAL IS FILLED, and it is drawn here rather than taken from the icon set.
 *
 * lucide's `BadgeCheck` is an OUTLINE: a stroked scalloped edge with a stroked
 * tick inside it. At sixteen pixels beside a name that reads as a faint ring,
 * not as a badge — and the thing everybody recognises, on every platform that
 * has one, is a SOLID coloured seal with a white tick knocked out of it. That
 * recognition is the entire value of using the convention instead of inventing
 * a mark, so half-using it is the one option with no upside.
 *
 * Filling the lucide icon does not get there either: it is one `<svg>` whose
 * paths include the tick, so a `fill` floods the tick into a solid wedge. Two
 * paths, drawn deliberately — the scallop filled, the tick stroked in white
 * over it — is a dozen lines and is exactly right at every size.
 *
 * `vectorEffect` is not used and the stroke width is in the icon's own 24-unit
 * space, so the tick thickens and thins WITH the badge as `size` changes rather
 * than staying 2px and turning into a slab on a 20px seal.
 */
function VerifiedSeal({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label="Cont verificat"
      className="shrink-0"
      style={{ width: size, height: size }}
    >
      {/* The scalloped seal, as ONE filled path, and the tick as a second one —
          also filled rather than stroked. A stroked tick has to have its width
          chosen for a size, and this is drawn at 15, 16 and 20 in three
          different places; a filled outline scales exactly. */}
      <path
        fill="#1d9bf0"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81S5.48 7.27 5.94 8.66C4.63 9.33 3.75 10.57 3.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34Z"
      />
      <path
        fill="#ffffff"
        d="M10.68 16.35 6.68 12.35l1.5-1.5 2.5 2.5 5.14-5.14 1.5 1.5-6.64 6.64Z"
      />
    </svg>
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
