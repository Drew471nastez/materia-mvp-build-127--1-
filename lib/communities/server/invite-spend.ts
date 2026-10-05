import "server-only"

/**
 * ===========================================================================
 *  AN INVITE IS SPENT WHEN SOMEBODY IS ACTUALLY IN
 * ===========================================================================
 * A free invite is accepted and the person is in, so accepting it spends it.
 * An invite to a paid tier is different: accepting it only says "you may
 * pay", and the payment may never come. Counting the use at that moment
 * would burn a one use link on somebody who closed the checkout, so the use
 * is counted here instead, when their row actually becomes active
 * (lib/communities/server/membership.ts grantMembership).
 *
 * public.community_redeem_invite is the one place a use is counted, and it
 * counts at most one per person (community_invite_uses is unique on the
 * invite and the user), so calling it again for somebody who is already
 * counted changes nothing. That is what makes this safe to run on every
 * activation of a row that carries an invite_id, whichever way the person
 * got in.
 *
 * Never throws: a counter that could not be moved must not undo a join that
 * has been paid for.
 */
import { missing, reasonOf, type Db } from "./db"

/**
 * Counts this person's use of the invite their row carries, once. Answers
 * true when the use was counted now, false when there was nothing to count
 * (no invite, already counted, or the tables are not there yet).
 */
export async function spendInvite(db: Db, a: { communityId: string; userId: string; inviteId: string | null | undefined }): Promise<boolean> {
  if (!a.inviteId) return false
  try {
    const { data: invite, error } = await db.from("community_invites").select("id, community_id, token_hash").eq("id", a.inviteId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] invite read for spend: ${reasonOf(error)}`)
      return false
    }
    const row = invite as { id: string; community_id: string; token_hash: string | null } | null
    /* The invite must be this community's, and still have the hash the link was made from. */
    if (!row || row.community_id !== a.communityId || !row.token_hash) return false
    const { data, error: rpcError } = await db.rpc("community_redeem_invite", { p_token_hash: row.token_hash, p_user: a.userId })
    if (rpcError) {
      if (!missing(rpcError)) console.error(`[communities] invite spend: ${reasonOf(rpcError)}`)
      return false
    }
    const r = (data ?? {}) as { ok?: boolean; new?: boolean }
    return r.ok === true && r.new === true
  } catch (e) {
    console.error(`[communities] invite spend: ${reasonOf(e)}`)
    return false
  }
}
