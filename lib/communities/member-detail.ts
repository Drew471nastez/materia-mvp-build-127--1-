/**
 * ===========================================================================
 *  ONE MEMBER, OPENED: WHAT THE SHEET IS HANDED
 * ===========================================================================
 * Round 34, the owner on the Members area: "see relevant activity and
 * engagement, review subscription status, ... review basic member access and
 * purchase information", and "Clicking a member should open a clear, useful
 * detail view without navigating through multiple unnecessary screens".
 *
 * So the sheet that already opens on a row (components/community/creator/
 * member-sheet.tsx) asks for this once it is open, and shows it under the
 * facts it already had. One request, read by
 * lib/communities/server/member-detail.ts, which decides from the asking
 * person's role what goes in it.
 *
 * WHAT IS IN IT, AND WHO SEES IT
 *   engagement  their posts, comments and likes here, and when they last
 *               posted. Everybody who may open Members (remove_member).
 *   access      how they got in, their plan's name, when their access ends,
 *               who invited or approved them. Everybody who may open
 *               Members: it is what the list's own columns already say,
 *               with the end date added.
 *   learning    the programs of THIS community they have access to, by name,
 *               and whether each was bought or given. Only somebody the
 *               manage_members permission reaches, because an enrolment is
 *               private; a moderator never sees it.
 *   No amount, no card, no Stripe id, no invoice, and nothing from any other
 *   community: lib/communities/DATA-SAFETY.md section 3b.
 *
 * A FIGURE THAT CANNOT BE READ IS NULL, and the sheet then says so rather
 * than drawing a zero (before SQL part 125 the comments cannot be counted).
 *
 * Pure types and pure rules only, so the sheet and a test both read them.
 */

export interface MemberEngagement {
  /** Their published posts here, all time. Null when it could not be read. */
  posts: number | null
  /** Their published comments here. Null before SQL part 125, which indexes them. */
  comments: number | null
  /** Likes they gave here. Null before part 125. */
  likes: number | null
  /** When they last posted here; null when they never have. */
  lastPostAt: string | null
}

export interface MemberAccess {
  /** How they got in, as the member row says ("subscription", "invite", "manual"...). */
  source: string
  /** Their plan's name here, or null on no plan. */
  tierName: string | null
  joinedAt: string | null
  /** When their access runs out, for a membership that has an end; null for one that does not. */
  expiresAt: string | null
  /** They are here without paying, because a creator or an admin let them in. */
  complimentary: boolean
  /** Who invited them, by name, when the invite says. */
  invitedBy: string | null
  /** Who approved their request, by name. */
  approvedBy: string | null
}

export interface MemberProgramAccess {
  title: string
  /** "bought" when they paid for it, "given" when a creator or a level opened it. */
  how: "bought" | "given"
}

export interface MemberDetail {
  userId: string
  engagement: MemberEngagement
  access: MemberAccess
  /**
   * The programs of this community they have access to. Null for somebody
   * who may not see an enrolment (a moderator), and an empty list for
   * somebody who may and has none.
   */
  learning: MemberProgramAccess[] | null
}

/**
 * The one line the sheet puts under "Access": what their membership is doing
 * now, in words, from the member row alone. `now` so a test is not about
 * today.
 */
export function subscriptionLine(a: Pick<MemberAccess, "source" | "expiresAt" | "complimentary">, status: string, now: number = Date.now()): string {
  if (status === "pending") return "Waiting to be let in"
  if (status === "banned") return "Banned"
  if (status === "removed") return "Removed"
  if (status === "left") return "Left"
  if (status === "expired" || status === "cancelled") return "Access has ended"
  if (status === "paused") return "Suspended"
  if (a.complimentary) return "Complimentary, until it is ended"
  const ends = a.expiresAt ? Date.parse(a.expiresAt) : NaN
  if (Number.isFinite(ends)) return ends > now ? "Paid, with an end date" : "Access has ended"
  if (a.source === "subscription") return "Paying, renews on its own"
  if (a.source === "purchase" || a.source === "product") return "Bought, does not end"
  if (a.source === "owner") return "Theirs"
  return "Free"
}

/** "4 posts, 12 comments, 30 likes", leaving out what is not there, and saying so when nothing can be read. */
export function engagementLine(e: MemberEngagement): string {
  const parts: string[] = []
  const say = (n: number | null, one: string, many: string) => {
    if (n === null) return
    parts.push(`${n.toLocaleString("en-US")} ${n === 1 ? one : many}`)
  }
  say(e.posts, "post", "posts")
  say(e.comments, "comment", "comments")
  say(e.likes, "like", "likes")
  if (!parts.length) return "Not counted yet"
  if (e.posts === 0 && (e.comments ?? 0) === 0 && (e.likes ?? 0) === 0) return "Nothing here yet"
  return parts.join(" · ")
}
