import "server-only"
/*
  The page gate's team half (./team.ts), apart from creator.ts so a suite can
  import it without the page modules creator.ts brings with it.
*/
import { loadCommunity, type Viewer } from "./context"
import { rolePermissionsOf } from "./creator-roles"
import { TEAM_COMMUNITY_ROLE, teamAuditDb, teamCommunityIdentity } from "./team"
import type { Db } from "./db"
import type { CreatorPageContext } from "./creator"

/** The creator row as lib/auth/request-scope.ts reads it: the columns the gate needs. */
type PageCreator = { id: string; display_name?: string | null; username?: string | null; slug?: string | null; stripe_account_id?: string | null; stripe_onboarding_status?: string | null; charges_enabled?: boolean | null }

/**
 * A STORE'S TEAM MEMBER WITH COMMUNITY (./team.ts): a community of the store
 * they work in, as an admin with what the owner lets admins do there, acting
 * as the store (the community owner's account, so the pages' "me" is the
 * store, as every post they write will be). Any other community: null.
 */
export async function teamStaffContext(db: Db, key: { id: string } | { slug: string }, memberUserId: string, acting: { creatorId: string; ownerUserId: string | null }, store: PageCreator): Promise<CreatorPageContext | null> {
  const community = await loadCommunity(db, key)
  if (!community) return null
  const identity = teamCommunityIdentity(community, acting)
  if (!identity) return null
  const role = TEAM_COMMUNITY_ROLE
  const perms = (await rolePermissionsOf(db, community.id)).perms
  const viewer: Viewer = {
    userId: identity,
    member: null,
    role,
    active: true,
    status: "active",
    tierId: null,
    ownedProductIds: [],
    level: 1,
    points: 0,
    isOwner: false,
    isCreatorAccount: false,
    banned: false,
    mutedUntil: null,
    perms,
  }
  return {
    userId: identity,
    creatorId: store.id,
    creatorName: store.display_name || store.username || store.slug || "A creator",
    community,
    viewer,
    role,
    db: teamAuditDb(db, memberUserId),
    paymentsReady: Boolean(store.stripe_account_id) && store.stripe_onboarding_status === "connected" && store.charges_enabled !== false,
  }
}
