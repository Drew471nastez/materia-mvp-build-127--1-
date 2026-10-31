import "server-only"

import { randomBytes } from "node:crypto"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { mediaFetch } from "@/lib/storage/media-url"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { profileAvatar } from "@/lib/account/avatar"
import { businessAlias } from "./email-alias"
import {
  LIMIT_REACHED,
  MAX_BUSINESSES,
  UUID_PATTERN,
  canAddBusiness,
  groupIds,
  linkRefusal,
  maySwitch,
  ownerOf,
  type BusinessGroup,
} from "./rules"

export { canAddBusiness, maySwitch, MAX_BUSINESSES, type BusinessGroup }

/**
 * ===========================================================================
 *  UP TO THREE BUSINESSES, ONE LOGIN: THE SERVER HALF
 * ===========================================================================
 * Every business after the first is an account of its own, linked to the
 * first (the owner) in public.business_links (supabase/migrations/
 * 20261001_business_accounts.sql). Everything a business owns is keyed by
 * its account, so they are kept apart by the same row level security that
 * keeps strangers apart, and none of the app's queries had to learn which
 * business is "active". How many a login can have is MAX_BUSINESSES
 * (./rules), and the database holds the same number (run-now part 38).
 *
 * Switching is signing the browser into the other account. The server checks
 * the group first, then makes a session for the other account the way
 * Supabase's own sign in link would (generateLink, then verifyOtp on its
 * token hash) without sending anything. The browser puts that session where
 * it keeps its own (cookies on the web, the device store in the app) and
 * reloads.
 *
 * A business account's password is 32 random bytes that are never kept or
 * shown, so the only way into it is from a session of the same login.
 */


export interface BusinessSummary {
  userId: string
  /** The name the account menu shows: the display name, else the handle, else "New business". */
  name: string
  handle: string | null
  avatarUrl: string | null
  /** Finished onboarding: its creator row is complete. A business being set up is switched to all the same. */
  ready: boolean
  current: boolean
  role: "owner" | "member"
}

export interface MintedSession {
  access_token: string
  refresh_token: string
  expires_at: number | null
  /* The rest of the session as Supabase stores it, so the switch route can put it in this browser's cookies whole (lib/supabase/session-jar storedSessionJson). */
  expires_in: number | null
  token_type: string
  user: unknown
}

/** The signed in user, from the cookie on the web or the bearer token the app sends. */
export async function requestUser(request: Request): Promise<{ id: string; email: string | null } | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (data.user) return { id: data.user.id, email: data.user.email ?? null }
  } catch {
    /* no cookie session: the bearer token below */
  }
  const header = request.headers.get("authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!token) return null
  const { data } = await createAdminClient().auth.getUser(token)
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
}

type LinkRow = { owner_id: string; member_id: string }

/**
 * The group this account is part of, as its owner or as one of its
 * businesses, or null for an account on its own. Two reads at most: the
 * rows naming this account, and, for a business, its owner's rows.
 */
export async function businessGroup(userId: string): Promise<BusinessGroup | null> {
  /* The id goes into a filter string below: only ever a UUID, so nothing can reshape the filter. */
  if (!UUID_PATTERN.test(userId)) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("business_links")
    .select("owner_id, member_id")
    .or(`owner_id.eq.${userId},member_id.eq.${userId}`)
    .order("created_at", { ascending: true })
    .order("member_id", { ascending: true })
  /* The table not being there yet (SQL part 26 not run) reads as "no group", so every account works exactly as before. */
  if (error || !data || data.length === 0) return null
  const rows = data as LinkRow[]
  const asMember = rows.find((r) => r.member_id === userId)
  if (!asMember) return { ownerId: userId, memberIds: rows.map((r) => r.member_id) }

  const ownerId = asMember.owner_id
  const { data: siblings, error: siblingsError } = await admin
    .from("business_links")
    .select("owner_id, member_id")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .order("member_id", { ascending: true })
  /* The owner's rows could not be read: this business and its owner, which is always true. */
  if (siblingsError || !siblings) return { ownerId, memberIds: [userId] }
  const memberIds = (siblings as LinkRow[]).map((r) => r.member_id)
  return { ownerId, memberIds: memberIds.includes(userId) ? memberIds : [...memberIds, userId] }
}

/**
 * Every business of the login for the account menu, the first account's
 * first, then the others in the order they were made. An account on its own
 * gets its own row alone, so the menu can show it with "New business" under it.
 */
export async function listBusinesses(userId: string): Promise<BusinessSummary[]> {
  const group = await businessGroup(userId)
  const ids = groupIds(group, userId)
  const admin = createAdminClient()
  const [{ data: profiles }, { data: creators }] = await Promise.all([
    admin.from("profiles").select("id, username, display_name, avatar_url").in("id", ids),
    admin.from("creators").select("user_id, slug, display_name, onboarding_completed").in("user_id", ids),
  ])
  return ids.map((id) => {
    const p = (profiles ?? []).find((x: { id: string }) => x.id === id) as
      | { username: string | null; display_name: string | null; avatar_url: string | null }
      | undefined
    const c = (creators ?? []).find((x: { user_id: string }) => x.user_id === id) as
      | { slug: string | null; display_name: string | null; onboarding_completed: boolean | null }
      | undefined
    const handle = p?.username || c?.slug || null
    return {
      userId: id,
      name: (p?.display_name || c?.display_name || handle || "").trim() || "New business",
      handle,
      /* The profile's photo and nothing else (lib/account/avatar): a removed photo is no photo here too, never an older copy on the creator row. */
      avatarUrl: profileAvatar(p?.avatar_url),
      ready: c?.onboarding_completed === true,
      current: id === userId,
      role: group && id !== group.ownerId ? "member" : "owner",
    }
  })
}

export type CreateBusinessResult = { memberId: string } | { error: string; status: number }

/**
 * Another business: an account with the owner's address and a tag
 * (./email-alias), confirmed, with a password nobody holds, linked to the
 * login's first business (the owner). From any business of the login, and
 * only while it has fewer than MAX_BUSINESSES. Asked from a business that is
 * not the first, the new one is linked to the first all the same and its
 * address is made from the first's, so the group stays one owner and its
 * members, never a chain. If the link cannot be written the account is
 * removed again, so a failure never leaves an orphan behind.
 *
 * `caller` is the signed in account the request came from (requestUser).
 * The group is read here, on the server, with the service key, so nobody can
 * link a business to a login that is not theirs.
 *
 * The database has the last word on the count (a trigger: run-now part 38,
 * or the complete businesses part), so two presses at once cannot both get
 * past it. Until that runs the database still holds the old one per login
 * rule: the link is refused with 23505 on business_links_one_per_owner, and
 * the person reads LIMIT_NOT_OPEN_YET in the menu instead of an error page.
 */
export async function createBusinessAccount(caller: { id: string; email: string | null }): Promise<CreateBusinessResult> {
  const admin = createAdminClient()
  const group = await businessGroup(caller.id)
  if (!canAddBusiness(groupIds(group, caller.id).length)) return { error: LIMIT_REACHED, status: 409 }
  const ownerId = ownerOf(group, caller.id)

  /* The table must exist: without it the new account could never be reached again. */
  const probe = await admin.from("business_links").select("member_id", { head: true, count: "exact" }).limit(1)
  if (probe.error) return { error: "Businesses are not set up on this database yet.", status: 503 }

  /* The first business's address, which every business of the login is tagged from and reads back to (ownerAddress). */
  let ownerEmail = caller.email
  if (ownerId !== caller.id) {
    const { data: owner, error: ownerError } = await admin.auth.admin.getUserById(ownerId)
    if (ownerError || !owner?.user) {
      console.error("[businesses] could not read the first business:", ownerError?.message)
      return { error: "The business could not be created. Try again in a moment.", status: 500 }
    }
    ownerEmail = owner.user.email ?? null
  }

  const email = businessAlias(ownerEmail, randomBytes(4).toString("hex"))
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { display_name: "" },
    app_metadata: { business_owner: ownerId },
  })
  if (createError || !created.user) {
    console.error("[businesses] create account failed:", createError?.message)
    return { error: "The business could not be created. Try again in a moment.", status: 500 }
  }
  const memberId = created.user.id

  const { error: linkError } = await admin.from("business_links").insert({ owner_id: ownerId, member_id: memberId })
  if (linkError) {
    console.error("[businesses] link failed, removing the new account:", linkError.code, linkError.message)
    await admin.auth.admin.deleteUser(memberId)
    return { error: linkRefusal(linkError), status: linkError.code === "23505" || linkError.code === "23514" ? 409 : 500 }
  }

  /* The owner proved this address is theirs; the new business does not ask again. */
  await admin.from("profiles").upsert({ id: memberId, email, display_name: "", email_verified: true }, { onConflict: "id" })
  return { memberId }
}

/**
 * A session for an account, made on the server. Only ever called after the
 * caller has proved the link (see the switch route); nothing is emailed.
 */
export async function sessionFor(userId: string): Promise<MintedSession | null> {
  const admin = createAdminClient()
  const { data: target } = await admin.auth.admin.getUserById(userId)
  const email = target.user?.email
  if (!email) return null
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    console.error("[businesses] could not prepare a session:", linkError?.message)
    return null
  }
  /* A client of its own that keeps nothing: the session is handed to the browser, not stored here. */
  const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    /* The shared clients' fetch: an auth call that never answers ends at its deadline (lib/net/deadline.ts). */
    global: { fetch: mediaFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  let { data, error } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" })
  /* Newer Auth servers name this verification "email"; "magiclink" is its older alias. */
  if (error || !data.session) ({ data, error } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "email" }))
  if (error || !data.session) {
    console.error("[businesses] could not open a session:", error?.message)
    return null
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at ?? null,
    expires_in: data.session.expires_in ?? null,
    token_type: data.session.token_type || "bearer",
    user: data.session.user ?? null,
  }
}

/** Kept for support; never read by the app. A failed write never stops a switch. */
export async function recordSwitch(from: string, to: string, request: Request): Promise<void> {
  try {
    await createAdminClient()
      .from("business_switches")
      .insert({
        from_user: from,
        to_user: to,
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        user_agent: request.headers.get("user-agent")?.slice(0, 300) || null,
      })
  } catch {
    /* the log is not the switch */
  }
}
