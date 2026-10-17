/**
 * ===========================================================================
 *  THE MARK BESIDE A FEATURED MEMBER'S NAME
 * ===========================================================================
 * Round 34, the owner: "Keep this optional and visually subtle. The feature
 * should recognize contributors without turning the community into an
 * unnecessarily competitive environment."
 *
 * So it is drawn the way the role beside a name is drawn (./role-badge.tsx):
 * small grey words with a tiny glyph in front, no fill, no outline, nothing
 * to press. No number, no place in a list, no board to climb. A community
 * features at most FEATURED_MAX members (lib/communities/featured-members.ts)
 * and nothing orders them.
 *
 * Browser safe and hook free, so a server component draws it too.
 */
import { StarAngleIcon } from "@solar-icons/react/bold/star-angle"
import { cn } from "@/lib/utils"
import { FEATURED_WORD } from "@/lib/communities/featured-members"

export function FeaturedMark({ on, className, size = "sm" }: { on: boolean | undefined; className?: string; size?: "sm" | "xs" }) {
  if (!on) return null
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center gap-[3px] whitespace-nowrap font-medium text-[#6b7280]",
        size === "xs" ? "text-[11px] leading-4" : "text-[12px] leading-4",
        className,
      )}
      data-featured-mark=""
    >
      <StarAngleIcon size={size === "xs" ? 11 : 12} className="shrink-0 text-[#b7791f]" aria-hidden />
      {FEATURED_WORD}
    </span>
  )
}
