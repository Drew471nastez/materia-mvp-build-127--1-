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
 *   wrong_account  signed in with an account whose email is not the invited
 *                  one (a Google alias, Apple's Hide My Email address, a
 *                  second account). The link is the proof of the inbox, the
 *                  way GitHub, Slack and Notion take a valid invite link: it
 *                  can be accepted by the account that is signed in, with the
 *                  invited email shown, or the person switches account.
 *   ready          the one with Accept and Decline
 */
import { seatLimit, type MemberRole } from "./roles"
import { permissionsOfRow, type TeamPermission } from "./permissions"

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
  /** What the invite gives (SQL part 320). A row from before it reads as its role (permissionsOfRow). */
  permissions?: TeamPermission[]
  status: "invited" | "active"
  user_id: string | null
  expires_at: string | null
}

export type InviteState =
  | { kind: "invalid" }
  | { kind: "gone" }
  | { kind: "store_gone" }
  | { kind: "accepted"; store: InviteStore; role: MemberRole; permissions: TeamPermission[]; mine: boolean }
  | { kind: "expired"; store: InviteStore; email: string }
  | { kind: "own_store"; store: InviteStore }
  | { kind: "seats_full"; store: InviteStore; role: MemberRole; permissions: TeamPermission[]; limit: number }
  | { kind: "signed_out"; store: InviteStore; role: MemberRole; permissions: TeamPermission[]; email: string; hasAccount: boolean }
  | { kind: "wrong_account"; store: InviteStore; role: MemberRole; permissions: TeamPermission[]; email: string; signedInAs: string | null; inviteId: string }
  | { kind: "ready"; store: InviteStore; role: MemberRole; permissions: TeamPermission[]; email: string; inviteId: string }

/** The same inbox, written either way: case and spaces never make two people. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase()
  const y = (b ?? "").trim().toLowerCase()
  return !!x && x === y
}

/**
 * Whether an accept may go ahead. Ready, and also wrong_account: holding an
 * unexpired, unused link is the proof that the invited inbox was opened, so
 * the account signed in now may take it (the page says which email it was
 * sent to first). The link is single use, so once taken nobody else can.
 */
export function acceptable(state: InviteState): state is Extract<InviteState, { kind: "ready" | "wrong_account" }> {
  return state.kind === "ready" || state.kind === "wrong_account"
}

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
  /** The signed in account is already on this store's team through another invite. */
  alreadyMember?: boolean
  now: number
}): InviteState {
  const { invite, store, user } = input
  if (!tokenShapeOk(input.token)) return { kind: "invalid" }
  if (!invite) return { kind: "gone" }
  if (!store) return { kind: "store_gone" }
  const shown: InviteStore = { id: store.id, name: store.name, avatarUrl: store.avatarUrl }
  const permissions = permissionsOfRow(invite)
  if (invite.status === "active") return { kind: "accepted", store: shown, role: invite.role, permissions, mine: !!user && invite.user_id === user.id }
  if (invite.expires_at && Date.parse(invite.expires_at) < input.now) return { kind: "expired", store: shown, email: invite.email }
  if (!user) return { kind: "signed_out", store: shown, role: invite.role, permissions, email: invite.email, hasAccount: input.hasAccount }
  if (store.ownerUserId && store.ownerUserId === user.id) return { kind: "own_store", store: shown }
  if (input.alreadyMember) return { kind: "accepted", store: shown, role: invite.role, permissions, mine: true }
  const limit = seatLimit(store.pro)
  if (input.teamSize > limit) return { kind: "seats_full", store: shown, role: invite.role, permissions, limit }
  if (!sameEmail(user.email, invite.email)) {
    return { kind: "wrong_account", store: shown, role: invite.role, permissions, email: invite.email, signedInAs: user.email, inviteId: invite.id }
  }
  return { kind: "ready", store: shown, role: invite.role, permissions, email: invite.email, inviteId: invite.id }
}

/** The answer a refused accept gives, from the same states. */
export function refusalOf(state: InviteState): { status: number; error: string } | null {
  switch (state.kind) {
    case "ready":
    case "wrong_account":
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
  }
}
