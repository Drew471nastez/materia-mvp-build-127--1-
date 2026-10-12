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
  params.set("next", `${JOIN_PATH}?token=${encodeURIComponent(v.token)}`)
  return `${v.hasAccount ? "/login" : "/signup"}?${params.toString()}`
}

/** The invited email a login or signup page keeps, or null: only while it is on its way back to an invite. */
export function inviteEmailFrom(params: { get(name: string): string | null }): string | null {
  const next = params.get("next") ?? ""
  const email = (params.get("email") ?? "").trim().toLowerCase()
  if (!next.startsWith(`${JOIN_PATH}?`) || !email) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null
}
