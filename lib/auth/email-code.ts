/**
 * ===========================================================================
 *  THE SIGN UP CODE GOES TO THE ACCOUNT'S OWN ADDRESS, AND ONLY PROVES THAT
 * ===========================================================================
 * /api/auth/verify-email mailed a code to whatever `email` the request named,
 * for whatever `userId` it named, and /api/auth/confirm-email marked that
 * userId verified for any matching code. So an account made with somebody
 * else's address could have the code sent to the maker's own mailbox, be
 * marked verified, and collect every guest order bought with that address at
 * the next sign in (lib/orders/attach-guest-orders.ts).
 *
 * Now:
 *
 *   SEND      the address is read from Supabase Auth for the account, never
 *             from the request. A different `email` in the request is ignored
 *             (logged), so a stale link still mails the right person. Limited
 *             per caller address and per destination address.
 *   CONFIRM   the code must be one of this account's codes AND have been sent
 *             to the account's current address. Five wrong codes burn every
 *             live one (lib/auth/code-guard.ts). The proven address is then
 *             recorded where only the server writes (lib/auth/verified-email).
 *
 * WHY NO SESSION IS REQUIRED. Three ways in reach these routes without one:
 * the code email's "copy" link (/signup/verify?userId=&email=&code=), often
 * opened in a mail app's browser; the VERIFY_EMAIL notification email; and
 * the login page's "Email not confirmed" path, which by definition has no
 * session. Each of them only works for the person who reads the account's
 * mailbox, which is exactly what is being proven. When a session is there and
 * the request names no account, the session's account is used.
 *
 * The functions take their database, mailer and limiter as arguments, so the
 * suite (tests/auth-email-code.test.ts) runs them against fakes.
 */
import { codeMatches, newCode, wrongCodeMessage } from "@/lib/account/codes"
import { burnCodes, claimCode, countFrom, recentCodes, recordWrongCode, wrongCodeCount, WRONG_CODE_LIMIT } from "@/lib/auth/code-guard"
import { authUserById, normalisedEmail, stampVerifiedEmail } from "@/lib/auth/verified-email"

export const CODE_EXPIRY_MINUTES = 15
export const CONFIRM_WRONG_BUCKET = "confirm-email-wrong"

/** Per caller address and per destination address. Far above a person pressing Resend, far below a relay. */
export const SEND_LIMITS = {
  address: [{ limit: 10, seconds: 900 }, { limit: 50, seconds: 86_400 }],
  email: [{ limit: 8, seconds: 900 }, { limit: 20, seconds: 86_400 }],
} as const
/** Every confirm from one caller address, right or wrong. */
export const CONFIRM_ADDRESS_LIMIT = [{ limit: 30, seconds: 900 }, { limit: 200, seconds: 86_400 }] as const

export type Limiter = (bucket: string, subjects: (string | null | undefined)[], windows: readonly { limit: number; seconds: number }[]) => Promise<boolean>

export interface CodeDb {
  from: (table: string) => any
  auth: { admin: { getUserById: (id: string) => Promise<any>; updateUserById: (id: string, attrs: Record<string, unknown>) => Promise<any> } }
}

export interface Answer {
  status: number
  body: Record<string, unknown>
}

const say = (status: number, body: Record<string, unknown>): Answer => ({ status, body })

function targetAccount(bodyUserId: unknown, sessionUserId: string | null): string {
  const fromBody = typeof bodyUserId === "string" ? bodyUserId.trim() : ""
  return fromBody || sessionUserId || ""
}

export interface SendInput {
  userId: unknown
  email: unknown
  sessionUserId: string | null
  addressSubject: string | null
}

export interface SendDeps {
  db: CodeDb
  limit: Limiter
  /** Mails the code; `href` is the copy link. */
  send: (to: string, code: string, href: string) => Promise<{ success: boolean; messageId?: string; error?: unknown }>
  origin: string
  /** Same-moment duplicate guard (React running an effect twice). */
  claimSend?: (key: string) => boolean
  now?: number
}

export async function sendAccountCode(input: SendInput, deps: SendDeps): Promise<Answer> {
  const userId = targetAccount(input.userId, input.sessionUserId)
  if (!userId) return say(400, { error: "User ID and email are required" })

  const account = await authUserById(deps.db, userId)
  const to = normalisedEmail(account?.email)
  if (!account || !to) {
    /* Not found and Auth not answering look the same from here; neither sends anything. */
    return say(400, { error: "Could not send the code. Try again in a moment." })
  }
  const posted = normalisedEmail(input.email)
  if (posted && posted !== to) {
    console.warn("[verify-email] the request named a different address than the account's; sending to the account's own")
  }

  if (await deps.limit("verify-email-address", [input.addressSubject], SEND_LIMITS.address)) {
    return say(429, { error: "Too many codes asked for just now. Wait a few minutes and try again." })
  }

  if (deps.claimSend && !deps.claimSend(`${userId}:${to}`)) {
    return say(200, { success: true, alreadySent: true, message: "Verification code already sent" })
  }

  const now = deps.now ?? Date.now()
  const { data: justSent } = await deps.db
    .from("verification_codes")
    .select("id")
    .eq("user_id", userId)
    .eq("email", to)
    /* A code burned by wrong guesses is not "already sent": Resend must mail a new one. */
    .is("used_at", null)
    .gte("created_at", new Date(now - 120_000).toISOString())
    .limit(1)
  if (Array.isArray(justSent) && justSent.length > 0) {
    return say(200, { success: true, alreadySent: true, message: "Verification code already sent" })
  }

  if (await deps.limit("verify-email-to", [`email:${to}`], SEND_LIMITS.email)) {
    return say(429, { error: "Too many codes asked for just now. Wait a few minutes and try again." })
  }

  const code = newCode()
  const { data: inserted, error: insertError } = await deps.db
    .from("verification_codes")
    .insert({ user_id: userId, code, email: to, expires_at: new Date(now + CODE_EXPIRY_MINUTES * 60_000).toISOString() })
    .select("id")
    .maybeSingle()
  if (insertError) return say(500, { error: "Failed to generate verification code" })

  /* The copy link opens /signup/verify with the code filled in; the address in it is the account's own. */
  const href = `${deps.origin}/signup/verify?userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(to)}&code=${encodeURIComponent(code)}`
  const result = await deps.send(to, code, href)
  if (!result.success) {
    if (inserted?.id) await deps.db.from("verification_codes").delete().eq("id", inserted.id)
    return say(500, { error: "Could not send the code. Try again in a moment." })
  }
  return say(200, { success: true, message: "Verification code sent to your email", emailId: result.messageId })
}

export interface ConfirmInput {
  userId: unknown
  code: unknown
  sessionUserId: string | null
  addressSubject: string | null
}

export interface ConfirmDeps {
  db: CodeDb
  limit: Limiter
  now?: number
}

export async function confirmAccountCode(input: ConfirmInput, deps: ConfirmDeps): Promise<Answer> {
  const userId = targetAccount(input.userId, input.sessionUserId)
  const code = typeof input.code === "string" ? input.code.trim() : ""
  if (!userId || !code) return say(400, { error: "User ID and code are required" })
  if (!/^\d{6}$/.test(code)) return say(400, { error: "Please enter a valid 6-digit code" })

  if (await deps.limit("confirm-email-address", [input.addressSubject], CONFIRM_ADDRESS_LIMIT)) {
    return say(429, { error: "Too many tries just now. Wait a few minutes and try again." })
  }

  const now = deps.now ?? Date.now()
  const nowIso = new Date(now).toISOString()
  const subject = `user:${userId}`
  const codes = await recentCodes(deps.db, "user_id", userId)
  const since = countFrom(codes, CODE_EXPIRY_MINUTES, now)
  const wrong = await wrongCodeCount(deps.db, CONFIRM_WRONG_BUCKET, subject, since)
  if (wrong >= WRONG_CODE_LIMIT) {
    await burnCodes(deps.db, "user_id", userId, nowIso)
    return say(429, { error: wrongCodeMessage(wrong) })
  }

  const match = codes.find((row) => codeMatches(row.code, code))
  if (!match) {
    await recordWrongCode(deps.db, CONFIRM_WRONG_BUCKET, subject)
    const after = wrong + 1
    if (after >= WRONG_CODE_LIMIT) await burnCodes(deps.db, "user_id", userId, nowIso)
    return say(400, { error: after >= WRONG_CODE_LIMIT ? wrongCodeMessage(after) : "Incorrect verification code. Please check and try again." })
  }
  if (match.used_at) return say(400, { error: "This code has already been used. Please request a new code." })
  if (!match.expires_at || Date.parse(match.expires_at) < now) return say(400, { error: "This code has expired. Please request a new code." })

  /* The code must have gone to the address the account has NOW. */
  const account = await authUserById(deps.db, userId)
  const current = normalisedEmail(account?.email)
  if (!account || !current) return say(503, { error: "We could not check your account just now. Try again in a moment.", retry: true })
  if (normalisedEmail(match.email) !== current) {
    await burnCodes(deps.db, "user_id", userId, nowIso)
    return say(400, { error: "This code was sent to a different address. Please request a new code." })
  }

  if (!(await claimCode(deps.db, match.id, nowIso))) {
    return say(400, { error: "This code has already been used. Please request a new code." })
  }

  const { error: updateError } = await deps.db.from("profiles").update({ email_verified: true, email_verified_at: nowIso }).eq("id", userId)
  if (updateError) return say(500, { error: "Failed to verify email" })

  /* Confirmed in Supabase Auth too (signInWithPassword never says "Email not confirmed"), with the proven address recorded. */
  const stamped = await stampVerifiedEmail(deps.db, userId, current, { email_confirm: true, user_metadata: { email_verified: true } })
  if (!stamped) console.error("[confirm-email] could not record the verified address on the auth user")

  return say(200, { success: true, message: "Email verified successfully" })
}
