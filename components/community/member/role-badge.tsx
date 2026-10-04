/**
 * ===========================================================================
 *  THE ROLE BESIDE A NAME: OWNER, ADMIN, MODERATOR
 * ===========================================================================
 * Round 8: not a pill. It was a grey rounded tag, the same weight as a
 * button, beside every staff name; now it is small words with a tiny glyph
 * in front, no fill and no outline, so it reads as a fact about the person
 * rather than something to press. One glyph per role from the Solar set the
 * community already draws with (a crown for the owner, a shield with a tick
 * for an admin, a plain shield for a moderator), each in a muted tint of its
 * own; the words stay grey. A member gets nothing.
 *
 * Everywhere a name carries a role in the member area: the members list,
 * search, a person's card, posts and comments, chat and messages. Browser
 * safe and hook free, so a server component can draw it too.
 */
import { CrownMinimalisticIcon } from "@solar-icons/react/bold/crown-minimalistic"
import { ShieldCheckIcon } from "@solar-icons/react/bold/shield-check"
import { ShieldMinimalisticIcon } from "@solar-icons/react/bold/shield-minimalistic"
import type { Role } from "@/lib/communities/types"
import { cn } from "@/lib/utils"
import { roleTag } from "./view-types"

type Glyph = React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>

const LOOK: Record<"owner" | "admin" | "moderator", { glyph: Glyph; tint: string }> = {
  owner: { glyph: CrownMinimalisticIcon, tint: "text-[#b7791f]" },
  admin: { glyph: ShieldCheckIcon, tint: "text-[#3b6aa8]" },
  moderator: { glyph: ShieldMinimalisticIcon, tint: "text-[#3a8a62]" },
}

export function RoleBadge({ role, className, size = "sm" }: { role: Role | null | undefined; className?: string; size?: "sm" | "xs" }) {
  const label = roleTag(role)
  if (!label || !role || role === "member") return null
  const { glyph: Glyph, tint } = LOOK[role]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center gap-[3px] whitespace-nowrap font-medium text-[#6b7280]",
        size === "xs" ? "text-[11px] leading-4" : "text-[12px] leading-4",
        className,
      )}
      data-role-badge={role}
    >
      <Glyph size={size === "xs" ? 11 : 12} className={cn("shrink-0", tint)} aria-hidden />
      {label}
    </span>
  )
}
