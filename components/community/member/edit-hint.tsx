/**
 * ===========================================================================
 *  WHERE TO CHANGE THIS, FOR THE PEOPLE WHO RUN THE COMMUNITY (round 33)
 * ===========================================================================
 * The owner: an admin or moderator looking at their own community should
 * find, right where a block is, the way to change it, without it getting in
 * anybody's way. So a block an admin can change carries one small pencil
 * that goes to the right place in /app/community/<slug>:
 *
 *   ON A COMPUTER   nothing until the pointer is on the block (or the
 *                   keyboard reaches the pencil); then a quiet white chip,
 *                   "Edit spaces", fades in over 120ms. Nothing moves.
 *   ON A PHONE      no hover there, so only where it matters (the spaces
 *                   row, Learn, the calendar) a 28px pencil chip sits at the
 *                   end of the block's title line, in the page's own grey.
 *                   Elsewhere it is not drawn on a phone at all.
 *
 * Only for somebody who may open /app for this community and may change that
 * block (adminHref): the owner, or staff with a creator account, with the
 * block's own permission. Members never see one. Server safe.
 */
import Link from "next/link"
import { PenLine } from "lucide-react"
import type { CommunityAction } from "@/lib/communities/permissions"
import type { ViewerView } from "@/lib/communities/types"

/** The admin's place for this block, for a viewer who may open it and change it; null for everybody else. */
export function adminHref(slug: string, viewer: Pick<ViewerView, "isOwner" | "isCreatorAccount" | "active" | "can"> | null | undefined, action: CommunityAction, tab: string): string | null {
  if (!viewer || !viewer.active || !(viewer.isOwner || viewer.isCreatorAccount) || !viewer.can?.[action]) return null
  return `/app/community/${slug}/${tab}`
}

/** The class the block carries so its pencil shows while the pointer is on it. */
export const EDIT_GROUP = "group/edit"

/**
 * The pencil. `phone`: drawn on a phone too, as a small chip (the blocks where it matters); otherwise it is there only
 * where a pointer can rest on the block.
 */
export function EditHint({ href, label, phone = false, className = "" }: { href: string; label: string; phone?: boolean; className?: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      title={label}
      data-edit-hint=""
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white/95 px-2 text-[12.5px] font-medium text-[#4b5563] shadow-[0_1px_2px_rgba(16,24,40,0.06)] outline-none transition-[opacity,background-color,color] duration-[120ms] ease-out hover:bg-[#f6f7f8] hover:text-[#1a1a2e] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/edit:opacity-100 [@media(hover:hover)]:group-focus-within/edit:opacity-100 ${phone ? "max-[639px]:w-7 max-[639px]:justify-center max-[639px]:px-0" : "[@media(hover:none)]:hidden"} ${className}`}
    >
      <PenLine aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
      <span className={phone ? "max-[639px]:sr-only" : ""}>{label}</span>
    </Link>
  )
}
