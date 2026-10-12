/**
 * ===========================================================================
 *  WHAT AN INVITE LINK SAYS WHEN IT IS OPENED
 * ===========================================================================
 * One answer per way an invite can be, decided here from the rows the
 * server read (lib/team/server.ts readInvite), so the join page
 * (app/team/join) and the accept itself agree, and the whole table is a unit
 * test (tests/team.test.ts). Pure: no database, no clock but the one passed.
 *
 *   invalid        the link is cut short or made up in shape
 *   gone           no invite has this link: cancelled, replaced by a newer
 *                  one, or never sent. Said the same way for all three, so a
 *                  guessed link learns nothing.
 *   store_gone     the store was deleted
 *   accepted       already used. "You're in" for the person it was for
 *   expired        past its week
 *   own_store      the owner opened their own invite
 *   seats_full     the plan has fewer seats than the team now (a downgrade
 *                  after it was sent)
 *   signed_out     a way to sign in (or create the account) as the invited
 *                  email, which is kept on the way
 *   wrong_account  signed in as somebody else: sign out and come back
 *   ready          the one with Accept and Decline
 */
import { seatLimit, type MemberRole } from "./roles"

export interface InviteStore {
  id: string
  name: string
  avatarUrl: string | null
}

export interface InviteRow {
  id: string
  creator_id: string
  email: string
  role: MemberRole
  status: "invited" | "active"
  user_id: string | null
  expires_at: string | null
}

export type InviteState =
  | { kind: "invalid" }
  | { kind: "gone" }
  | { kind: "store_gone" }
  | { kind: "accepted"; store: InviteStore; role: MemberRole; mine: boolean }
  | { kind: "expired"; store: InviteStore; email: string }
  | { kind: "own_store"; store: InviteStore }
  | { kind: "seats_full"; store: InviteStore; role: MemberRole; limit: number }
  | { kind: "signed_out"; store: InviteStore; role: MemberRole; email: string; hasAccount: boolean }
  | { kind: "wrong_account"; store: InviteStore; role: MemberRole; email: string; signedInAs: string | null }
  | { kind: "ready"; store: InviteStore; role: MemberRole; email: string; inviteId: string }

export function tokenShapeOk(token: unknown): token is string {
  return typeof token === "string" && token.length >= 20 && token.length <= 100 && /^[A-Za-z0-9_-]+$/.test(token)
}

export function inviteStateOf(input: {
  token: unknown
  invite: InviteRow | null
  store: (InviteStore & { ownerUserId: string | null; pro: boolean }) | null
  /** Everyone on the store's team, invites included. */
  teamSize: number
  user: { id: string; email: string | null } | null
  /** Whether a Storelib account has the invited email (asked only when signed out). */
  hasAccount: boolean
  now: number
}): InviteState {
  const { invite, store, user } = input
  if (!tokenShapeOk(input.token)) return { kind: "invalid" }
  if (!invite) return { kind: "gone" }
  if (!store) return { kind: "store_gone" }
  const shown: InviteStore = { id: store.id, name: store.name, avatarUrl: store.avatarUrl }
  if (invite.status === "active") return { kind: "accepted", store: shown, role: invite.role, mine: !!user && invite.user_id === user.id }
  if (invite.expires_at && Date.parse(invite.expires_at) < input.now) return { kind: "expired", store: shown, email: invite.email }
  if (!user) return { kind: "signed_out", store: shown, role: invite.role, email: invite.email, hasAccount: input.hasAccount }
  if (!user.email || user.email.trim().toLowerCase() !== invite.email) {
    return { kind: "wrong_account", store: shown, role: invite.role, email: invite.email, signedInAs: user.email }
  }
  if (store.ownerUserId && store.ownerUserId === user.id) return { kind: "own_store", store: shown }
  const limit = seatLimit(store.pro)
  if (input.teamSize > limit) return { kind: "seats_full", store: shown, role: invite.role, limit }
  return { kind: "ready", store: shown, role: invite.role, email: invite.email, inviteId: invite.id }
}

/** The answer a refused accept gives, from the same states. */
export function refusalOf(state: InviteState): { status: number; error: string } | null {
  switch (state.kind) {
    case "ready":
      return null
    case "invalid":
      return { status: 400, error: "This invite link is not complete. Open it from the email again." }
    case "gone":
      return { status: 404, error: "This invite link doesn't work any more. It may have been cancelled or replaced by a newer one." }
    case "store_gone":
      return { status: 404, error: "This store isn't on Storelib any more." }
    case "accepted":
      return { status: 409, error: state.mine ? "You're already on this team." : "This invite has already been used." }
    case "expired":
      return { status: 410, error: "This invite has expired. Ask the store's owner to send a new one." }
    case "own_store":
      return { status: 400, error: "This is your own store." }
    case "seats_full":
      return { status: 403, error: "The team is full on this store's plan. Ask the owner to free a seat or upgrade." }
    case "signed_out":
      return { status: 401, error: "Sign in to accept the invite." }
    case "wrong_account":
      return { status: 403, error: `This invite was sent to ${state.email}. Sign in with that email to accept it.` }
  }
}
