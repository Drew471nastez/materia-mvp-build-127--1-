/**
 * The glyph every Invite opener in a community shares (the card's button,
 * the end of the row of tabs): Solar's person with a plus, the line weight
 * the rest of the frame draws in. On its own so the wall does not pull in
 * the sheet. Server safe: no hooks.
 */
import { UserPlusRoundedIcon } from "@solar-icons/react/linear/user-plus-rounded"

export function InviteGlyph({ size = 18, className }: { size?: number; className?: string }) {
  return <UserPlusRoundedIcon size={size} className={className} aria-hidden />
}
