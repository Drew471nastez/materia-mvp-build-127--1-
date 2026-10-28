import type { SupabaseClient } from "@supabase/supabase-js"
import "server-only"
import { areaStore, areaStoreFor, type AreaStore } from "./areas"
import type { ActingStore } from "./server"

/**
 * ===========================================================================
 *  THE CREATOR PAGE FOR A TEAM MEMBER (round 42)
 * ===========================================================================
 * The creator page is the store owner's public page: their name and photo
 * (profiles, by the owner's account), the store's bio, cover and links
 * (creators, store_builder_configs, by the store). The owner edits it in
 * place, signed in, on the page itself (/creator-page, the owner controls of
 * app/(marketing)/u/[username]), and every save goes through a route.
 *
 * A member with Creator page, working in the store, gets the same controls on
 * that store's page, and the routes write the store owner's rows with the
 * service role, by the owner's account and the store's id, never the
 * member's own. A member without it is refused, never handed their own
 * account's page in its place. The member's own account, email and password
 * are never touched here.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
/** What a route is handed: the owner's own client, or the service role (named on the record lines) for a member. */
type StoreDb = SupabaseClient

export type CreatorPageStore =
  | { kind: "page"; db: StoreDb; profileId: string; creatorId: string | null; isOwner: boolean; acting: ActingStore | null }
  | { kind: "denied" }
  | { kind: "unreachable" }

/** Pure on the answer areaStore gave: whose profile and store a creator page route writes. */
export function creatorPageOf(found: AreaStore, own: Db, userId: string): CreatorPageStore {
  if (found.kind === "denied") return { kind: "denied" }
  if (found.kind === "unreachable") return { kind: "unreachable" }
  /* An account with no store yet still has a name to change: their own, as before. */
  if (found.kind === "none") return { kind: "page", db: own, profileId: userId, creatorId: null, isOwner: true, acting: null }
  return { kind: "page", db: found.db, profileId: found.ownerUserId, creatorId: found.creatorId, isOwner: found.isOwner, acting: found.acting }
}

/** For a route: the creator page this request edits. */
export async function creatorPageStore(own: Db, userId: string): Promise<CreatorPageStore> {
  return creatorPageOf(await areaStore(own, userId, "creator_pages"), own, userId)
}

/** The database half, for the suite. */
export async function creatorPageStoreFor(own: Db, admin: Db, userId: string, acting: ActingStore | null): Promise<CreatorPageStore> {
  return creatorPageOf(await areaStoreFor(own, admin, userId, "creator_pages", acting), own, userId)
}

/**
 * For the creator page's own screens (/creator-page and its sections): the
 * store and the client to read it with. The owner reads with their own
 * client, as before; a member with Creator page with the service role, by
 * the store's id and the owner's account. "closed": a member without it,
 * shown the "You don't have access" card (these screens are outside /app,
 * so no team bar is over them). "none": no store, the page's own path.
 */
export type CreatorPagePage =
  | { kind: "page"; db: StoreDb; creatorId: string; profileId: string; userId: string; isOwner: boolean }
  | { kind: "closed"; store: string; permissions: ActingStore["permissions"] }
  | { kind: "signed_out" }
  | { kind: "none" }

export async function creatorPagePage(): Promise<CreatorPagePage> {
  const { teamPageStore } = await import("./server")
  const access = await teamPageStore("creator_pages")
  if (access.kind === "signed_out") return { kind: "signed_out" }
  if (access.kind === "denied") return { kind: "closed", store: access.acting.name, permissions: access.acting.permissions }
  if (access.kind === "none") return { kind: "none" }
  if (access.isOwner) {
    const { createClient } = await import("@/lib/supabase/server")
    return { kind: "page", db: await createClient(), creatorId: access.creatorId, profileId: access.userId, userId: access.userId, isOwner: true }
  }
  if (!access.ownerUserId) return { kind: "none" }
  const { createAdminClient } = await import("@/lib/supabase/admin")
  return { kind: "page", db: createAdminClient(), creatorId: access.creatorId, profileId: access.ownerUserId, userId: access.userId, isOwner: false }
}
