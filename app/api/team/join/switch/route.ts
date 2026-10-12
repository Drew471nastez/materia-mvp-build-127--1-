import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { TEAM_STORE_COOKIE, joinPath, readInvite } from "@/lib/team/server"
import { inviteSignInPath } from "@/lib/team/invite-links"

/**
 * ===========================================================================
 *  "USE ANOTHER ACCOUNT" ON AN INVITE
 * ===========================================================================
 * WHY IT USED TO DO NOTHING. The button was a link to /login?next=<invite>.
 * The login page sends anybody already signed in straight on to `next`, so
 * the press went to /login, back to the invite, and drew the same "You're
 * signed in with another account" again: a round trip that looked like a
 * dead button.
 *
 * Now it signs this browser out first, here on the server (the session's
 * cookies expire on this response, and Supabase forgets the session), then
 * opens sign in with the invited email filled in and kept, or Create
 * account when no Storelib account has that email, and `next` back to the
 * invite. The page's button also signs out in the browser before it posts
 * (components/team/use-another-account.tsx): the iOS and Android apps keep
 * the session in the device's own storage as well as the cookie, and only
 * the browser side can clear that one.
 *
 * POST only, from Storelib's own page: a link or another site's form cannot
 * sign anybody out.
 */
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const origin = req.headers.get("origin")
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Open the invite from your email." }, { status: 403 })
  const form = await req.formData().catch(() => null)
  const token = String(form?.get("token") ?? "")

  /* Where to after: sign in or create the account as the invited email, then back to the invite. */
  const read = await readInvite(createAdminClient(), token, null).catch(() => null)
  const state = read && read.ok ? read.state : null
  const target = state && state.kind === "signed_out" ? inviteSignInPath({ token, email: state.email, hasAccount: state.hasAccount }) : token ? joinPath(token) : "/login"

  try {
    const supabase = await createClient()
    await supabase.auth.signOut({ scope: "local" })
  } catch {
    /* Already signed out, or Supabase is away: the cookies still go below. */
  }
  const res = NextResponse.redirect(new URL(target, req.url), 303)
  /* Every cookie of the session, chunks and the PKCE verifier included, whatever signOut managed. */
  const jar = await cookies()
  for (const c of jar.getAll()) {
    if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { path: "/", maxAge: 0 })
  }
  res.cookies.set(TEAM_STORE_COOKIE, "", { path: "/", maxAge: 0 })
  res.headers.set("Cache-Control", "private, no-store")
  return res
}
