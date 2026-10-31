/**
 * ===========================================================================
 *  WHICH ADDRESS WAS PROVEN, NOT ONLY THAT ONE WAS
 * ===========================================================================
 * `profiles.email_verified` says an account proved AN address once. Guest
 * orders join an account by its CURRENT address (lib/orders/attach-guest-
 * orders.ts), and the two were never compared. An account could prove its own
 * mailbox and then point its sign in email at somebody else's (Supabase lets
 * a signed in user change it, and with email confirmation off the change is
 * immediate), and every guest order bought with that other address joined it.
 *
 * So the address that was proven is written where only the server can write
 * it, the auth user's app_metadata (`verified_email`), at each place that
 * proves one:
 *
 *   /api/auth/confirm-email        the code we mailed to the account's address
 *   /auth/callback                 Google or Apple, for the address they vouch for
 *   /api/auth/verify-email-change  both codes of an email change
 *   lib/businesses/server.ts       a business account the owner created
 *
 * and an address counts as proven only when it is the account's current one.
 *
 * ACCOUNTS FROM BEFORE THE STAMP have none, and their guest orders must still
 * join. For them the proof is read from what already exists: a provider
 * identity (Google, Apple) carrying the current address, or a used code from
 * verification_codes that was sent to the current address. Codes were always
 * mailed to the address stored on their row, so a used one shows that
 * mailbox was read. An older account that changed its address in Settings
 * has neither until it signs in with a provider or verifies again; its orders
 * still join through Add to library on the receipt.
 */

export type VerifiedEmailDb = { from: (table: string) => any }

export interface AuthUserLike {
  id: string
  email?: string | null
  app_metadata?: Record<string, unknown> | null
  identities?: { provider?: string | null; identity_data?: Record<string, unknown> | null }[] | null
}

export const VERIFIED_EMAIL_KEY = "verified_email"

export function normalisedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const e = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

/** The address the server last recorded as proven for this account, if any. */
export function stampedVerifiedEmail(user: AuthUserLike): string | null {
  return normalisedEmail(user.app_metadata?.[VERIFIED_EMAIL_KEY])
}

/** Addresses an OAuth provider (not the email/password identity) vouches for on this account. */
export function providerVerifiedEmails(user: AuthUserLike): string[] {
  const out: string[] = []
  for (const identity of user.identities ?? []) {
    const provider = String(identity?.provider ?? "")
    if (!provider || provider === "email" || provider === "phone") continue
    /* A provider that says it did NOT verify the address vouches for nothing. */
    if (identity?.identity_data?.email_verified === false) continue
    const e = normalisedEmail(identity?.identity_data?.email)
    if (e) out.push(e)
  }
  return out
}

/**
 * True when the account's CURRENT sign in email is the one it proved.
 * Never throws; any doubt is false, which only means a guest order is not
 * joined automatically.
 */
export async function currentEmailIsVerified(db: VerifiedEmailDb, user: AuthUserLike): Promise<boolean> {
  const current = normalisedEmail(user.email)
  if (!current || !user.id) return false
  const stamp = stampedVerifiedEmail(user)
  if (stamp) return stamp === current
  if (providerVerifiedEmails(user).includes(current)) return true
  try {
    const { data, error } = await db
      .from("verification_codes")
      .select("id, email, used_at")
      .eq("user_id", user.id)
      .eq("email", current)
      .not("used_at", "is", null)
      .limit(1)
    if (error || !Array.isArray(data)) return false
    return data.some((row: { email?: unknown; used_at?: unknown }) => normalisedEmail(row.email) === current && !!row.used_at)
  } catch {
    return false
  }
}

type AdminAuth = {
  auth: {
    admin: {
      getUserById: (id: string) => Promise<{ data: { user: AuthUserLike | null } | null; error: unknown }>
      updateUserById: (id: string, attrs: Record<string, unknown>) => Promise<{ error: unknown }>
    }
  }
}

/** The auth user as Supabase Auth has it now, or null (not found, or Auth did not answer). */
export async function authUserById(admin: AdminAuth, id: string): Promise<AuthUserLike | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(id)
    if (error || !data?.user) return null
    return data.user
  } catch {
    return null
  }
}

/** Record `email` as the account's proven address. app_metadata is merged by Supabase Auth, so other keys stay. */
export async function stampVerifiedEmail(admin: AdminAuth, userId: string, email: string, extra: Record<string, unknown> = {}): Promise<boolean> {
  const e = normalisedEmail(email)
  if (!e) return false
  try {
    const { error } = await admin.auth.admin.updateUserById(userId, { ...extra, app_metadata: { [VERIFIED_EMAIL_KEY]: e } })
    return !error
  } catch {
    return false
  }
}
