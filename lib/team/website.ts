import "server-only"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { editorUser, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { areaStore, storeInstall } from "./areas"
import type { ActingStore } from "./server"
import { NO_ACCESS } from "./server"

/**
 * ===========================================================================
 *  THE WEBSITE BUILDER FOR A TEAM MEMBER (round 42)
 * ===========================================================================
 * Every website route used to find the creator by the signed in account
 * (`creators.user_id = user.id`) and read the site under row level security,
 * which answers only for the owner. Now they ask here:
 *
 *   the owner          their own client and creator row, exactly as before
 *   a member with Website, working in the store
 *                      the store's row, and the service role client, with
 *                      every read and write after it filtered by the
 *                      store's id or by an install checked to be the store's
 *   a member without   403, never their own account's site in its place
 *
 * What stays the owner's whatever is given, and so keeps asking by account
 * (a member there reaches only their own account): connecting GitHub or a
 * Supabase project, agent access tokens, Ask Storelib's AI (it spends the
 * owner's plan), adding, importing, duplicating, exporting and deleting a
 * website. Website is editing and publishing the store's sites.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
/** What a route is handed: the owner's own client, or the service role (named on the record lines) for a member. */
type StoreDb = SupabaseClient

export type WebsiteCaller =
  | { error: null; status: 200; supabase: StoreDb; user: User; userId: string; creatorId: string; creator: { id: string }; isOwner: boolean; ownerUserId: string; acting: ActingStore | null }
  | { error: string; status: number; supabase: null; user: null; userId: null; creatorId: null; creator: null; isOwner: false; ownerUserId: null; acting: null }

function refused(error: string, status: number): WebsiteCaller {
  return { error, status, supabase: null, user: null, userId: null, creatorId: null, creator: null, isOwner: false, ownerUserId: null, acting: null }
}

/** The signed in person's store for the website builder. */
export async function websiteCaller(opts: { read?: boolean } = {}): Promise<WebsiteCaller> {
  const own = await createClient()
  const { user, status, error } = await editorUser(own, opts)
  if (!user) return refused(error, status)
  const found = await areaStore(own, user.id, "website")
  if (found.kind === "denied") return refused(NO_ACCESS, 403)
  if (found.kind === "unreachable") return refused(UNREACHABLE, 503)
  if (found.kind === "none") return refused("Creator not found", 404)
  return { error: null, status: 200, supabase: found.db, user, userId: user.id, creatorId: found.creatorId, creator: { id: found.creatorId }, isOwner: found.isOwner, ownerUserId: found.ownerUserId, acting: found.acting }
}

export type WebsiteInstallCaller<T> = (WebsiteCaller & { error: null; install: T }) | (Exclude<WebsiteCaller, { error: null }> & { install: null })

/** The same, and the site in the URL checked to be the store's. */
export async function websiteInstallCaller<T = { id: string; creator_id: string }>(installId: string, columns = "id, creator_id", opts: { read?: boolean } = {}): Promise<WebsiteInstallCaller<T>> {
  const c = await websiteCaller(opts)
  if (c.error !== null) return { ...c, install: null }
  const found = await storeInstall<T>(c.supabase, c.creatorId, installId, columns)
  if (!found.ok) return { ...refused(found.status === 503 ? UNREACHABLE : "Theme not found", found.status), install: null } as WebsiteInstallCaller<T>
  return { ...c, install: found.install }
}

/**
 * For a website page (/app/website-builder and the pages under it): the
 * store and the client to read it with. The owner reads with their own
 * client, as before; a member with Website reads with the service role, by
 * the store's id. "closed" is signed out or a member without Website (the
 * team bar over the page says so); "none" is the page's own no-store path.
 */
export type WebsitePage =
  | { kind: "store"; db: StoreDb; creatorId: string; userId: string; ownerUserId: string; isOwner: boolean; viewer: string }
  | { kind: "closed" }
  | { kind: "none" }

export async function websitePage(): Promise<WebsitePage> {
  const { teamPageStore } = await import("./server")
  const access = await teamPageStore("website")
  if (access.kind === "signed_out" || access.kind === "denied") return { kind: "closed" }
  if (access.kind === "none") return { kind: "none" }
  if (access.isOwner) return { kind: "store", db: await createClient(), creatorId: access.creatorId, userId: access.userId, ownerUserId: access.userId, isOwner: true, viewer: access.viewer }
  if (!access.ownerUserId) return { kind: "closed" }
  const { createAdminClient } = await import("@/lib/supabase/admin")
  return { kind: "store", db: createAdminClient(), creatorId: access.creatorId, userId: access.userId, ownerUserId: access.ownerUserId, isOwner: false, viewer: access.viewer }
}
