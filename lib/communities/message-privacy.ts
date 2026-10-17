/**
 * ===========================================================================
 *  WHO MAY SEND ME A MESSAGE IN THIS COMMUNITY
 * ===========================================================================
 * Round 34, the owner, on a member's profile: "restrict incoming messages"
 * and "profile privacy controls". So a member says, per community, who may
 * start a conversation with them: everyone here, or only the people who run
 * it. It is their own choice, on their own row
 * (community_members.dm_from, run-now part 223), and nobody else sets it.
 *
 * THERE IS NO "NOBODY". A community is run by people who sometimes have to
 * reach a member: a warning before a ban, a question about a payment. Shut
 * that door and the member is left with a community that cannot talk to
 * them, which is worse for them than for anybody else. So the narrow choice
 * is "only the people who run it", and it says exactly that.
 *
 * The server applies it: lib/communities/server/message-privacy.ts is read
 * by lib/communities/server/direct.ts before a conversation is opened AND
 * before each message is written, so a conversation opened before the
 * setting changed does not stay open. Hiding the Message button is not the
 * rule; this is.
 *
 * Pure and browser safe.
 */
import { meetsRole } from "./permissions"
import type { Role } from "./types"

/** Who a member lets message them here. Nothing stored means everyone, as it was before the choice existed. */
export const DM_FROM = ["everyone", "staff"] as const
export type DmFrom = (typeof DM_FROM)[number]

export const DEFAULT_DM_FROM: DmFrom = "everyone"

/** Whatever is stored (or sent) as a choice; anything else is the default. */
export function parseDmFrom(raw: unknown): DmFrom {
  return typeof raw === "string" && (DM_FROM as readonly string[]).includes(raw) ? (raw as DmFrom) : DEFAULT_DM_FROM
}

/**
 * Whether `sender` may start or continue a conversation with somebody whose
 * choice is `theirs`. The sender's role is their role IN THIS COMMUNITY.
 */
export function mayMessage(theirs: DmFrom, senderRole: Role | null | undefined): boolean {
  if (theirs === "everyone") return true
  return meetsRole(senderRole, "moderator")
}

/** The two choices as the member's own settings draw them. */
export const DM_CHOICES: { key: DmFrom; label: string; help: string }[] = [
  { key: "everyone", label: "Anyone here", help: "Any member of this community can message you." },
  { key: "staff", label: "Only the people who run it", help: "The owner, admins and moderators. A message from any other member is turned down by the server, whatever they press." },
]

/** What a sender is told when the other person is not taking messages from members. */
export const DM_REFUSED = "That member only takes messages from the people who run this community."
