import "server-only"

import { randomBytes } from "node:crypto"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { profileAvatar } from "@/lib/account/avatar"
import { businessAlias } from "./email-alias"
import { UUID_PATTERN, maySwitch, type BusinessLink } from "./rules"

export { maySwitch, type BusinessLink }

/**
 * ===========================================================================
 *  TWO BUSINESSES, ONE LOGIN: THE SERVER HALF
 * ===========================================================================
 * A second business is a second account, linked to the first in
 * public.business_links (supabase/migrations/20261001_business_accounts.sql).
 * Everything a business owns is keyed by its account, so the two are kept
 * apart by the same row level security that keeps strangers apart, and none
 * of the app's queries had to learn which business is "active".
 *
 * Switching is signing the browser into the other account. The server checks
 * the link first, then makes a session for the other account the way
 * Supabase's own sign in link would (generateLink, then verifyOtp on its
 * token hash) without sending anything. The browser puts that session where
 * it keeps its own (cookies on the web, the device store in the app) and
 * reloads.
 *
 * The second account's password is 32 random bytes that are never kept or
 * shown, so the only way into it is from the first account's session.
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

/** The link this account is part of, as owner or as the second business, or null. */
export async function businessLink(userId: string): Promise<BusinessLink | null> {
  /* The id goes into a filter string below: only ever a UUID, so nothing can reshape the filter. */
  if (!UUID_PATTERN.test(userId)) return null
  const { data, error } = await createAdminClient()
    .from("business_links")
    .select("owner_id, member_id")
    .or(`owner_id.eq.${userId},member_id.eq.${userId}`)
    .maybeSingle()
  /* The table not being there yet (SQL part 26 not run) reads as "no link", so every account works exactly as before. */
  if (error || !data) return null
  return { ownerId: data.owner_id as string, memberId: data.member_id as string }
}

/**
 * Both businesses for the account menu, the first account's first. An account
 * with no second business gets its own row alone, so the menu can show it with
 * "New business" under it.
 */
export async function listBusinesses(userId: string): Promise<BusinessSummary[]> {
  const link = await businessLink(userId)
  const ids = link ? [link.ownerId, link.memberId] : [userId]
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
      role: link && id === link.memberId ? "member" : "owner",
    }
  })
}

export type CreateBusinessResult = { memberId: string } | { error: string; status: number }

/**
 * The second business: an account with the owner's address and a tag
 * (./email-alias), confirmed, with a password nobody holds, linked to the
 * owner. If the link cannot be written the account is removed again, so a
 * failure never leaves an orphan behind.
 */
export async function createSecondBusiness(owner: { id: string; email: string | null }): Promise<CreateBusinessResult> {
  const admin = createAdminClient()
  const link = await businessLink(owner.id)
  if (link?.memberId === owner.id) {
    return { error: "Switch to your first business to add another.", status: 409 }
  }
  if (link) return { error: "You already have two businesses, the most one login can have.", status: 409 }

  /* The table must exist: without it the new account could never be reached again. */
  const probe = await admin.from("business_links").select("member_id", { head: true, count: "exact" }).limit(1)
  if (probe.error) return { error: "Businesses are not set up on this database yet.", status: 503 }

  const email = businessAlias(owner.email, randomBytes(4).toString("hex"))
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { display_name: "" },
    app_metadata: { business_owner: owner.id },
  })
  if (createError || !created.user) {
    console.error("[businesses] create account failed:", createError?.message)
    return { error: "The business could not be created. Try again in a moment.", status: 500 }
  }
  const memberId = created.user.id

  const { error: linkError } = await admin.from("business_links").insert({ owner_id: owner.id, member_id: memberId })
  if (linkError) {
    console.error("[businesses] link failed, removing the new account:", linkError.message)
    await admin.auth.admin.deleteUser(memberId)
    return linkError.code === "23505"
      ? { error: "You already have two businesses, the most one login can have.", status: 409 }
      : { error: "The business could not be created. Try again in a moment.", status: 500 }
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
