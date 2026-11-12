/**
 * Where an invite sends somebody who has to sign in first: Log in, or Create
 * account when no Storelib account has the invited email, with that email
 * filled in and kept (the login and signup pages lock it while `next` is an
 * invite, inviteEmailFrom below), and the invite as `next`, so signing in
 * comes straight back to Accept. Pure, shared by the page and the routes.
 */
export const JOIN_PATH = "/team/join"

export function inviteSignInPath(v: { token: string; email: string; hasAccount: boolean }): string {
  const params = new URLSearchParams()
  params.set("email", v.email)
  params.set("next", invitePath(v.token))
  return `${v.hasAccount ? "/login" : "/signup"}?${params.toString()}`
}

/** Where a business handover's link opens (lib/handoff/rules CLAIM_PREFIX): its email is kept the same way, since only that email can accept it. */
const CLAIM_PATH = "/team/claim/"

/** The invited email a login or signup page keeps, or null: only while it is on its way back to a team invite or a business handover sent to that email. */
export function inviteEmailFrom(params: { get(name: string): string | null }): string | null {
  const next = params.get("next") ?? ""
  const email = (params.get("email") ?? "").trim().toLowerCase()
  if (!(next.startsWith(`${JOIN_PATH}?`) || next.startsWith(CLAIM_PATH)) || !email) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null
}

/**
 * ===========================================================================
 *  THE INVITE, KEPT ACROSS SIGN IN
 * ===========================================================================
 * The invite rides on `next` through every way in (the login page's query,
 * the OAuth carry cookie /auth/start writes, the native app's storage). As a
 * second hold, Log in to accept and Create account to accept pass through
 * /api/team/join/sign-in, which keeps the link's token in a short lived
 * httpOnly cookie on the platform. A sign in that arrives at /auth/callback
 * or /auth/continue with nowhere to go (a `next` lost on the way: an email
 * code typed in another tab, a verify step, a provider error and retry)
 * goes back to the invite instead of the dashboard. The cookie only says
 * which invite to open; the invite page and the accept check the token
 * against its hash, its expiry and its single use as always.
 */
export const INVITE_COOKIE = "sl_team_invite"
export const INVITE_COOKIE_MAX_AGE_SECONDS = 30 * 60

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,100}$/

export function invitePath(token: string): string {
  return `${JOIN_PATH}?token=${encodeURIComponent(token)}`
}

/** The invite to go back to after sign in, from the cookie, when nothing else said where to go. */
export function inviteFallbackNext(next: string | null, cookieValue: string | null | undefined): string | null {
  if (next) return next
  const token = (cookieValue ?? "").trim()
  return TOKEN_SHAPE.test(token) ? invitePath(token) : null
}
