import { NextResponse } from "next/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { AUTH_CHECK_HEADER, authCheckHeader } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/auth/state: can the server see this person's session right now?
 *
 * Asked by the "Cannot reach the server" screen (components/native-auth-gate)
 * while it waits, so it can put the page back by itself the moment the
 * server can tell again, instead of waiting for somebody to press Try again.
 *
 * The answer is one word: "authenticated", "anonymous" or "indeterminate".
 * Never the user, never a token: nothing here is worth more than the cookie
 * that was sent with it. Same read as the pages (lib/auth/current-user.ts,
 * the token's signature when Supabase Auth does not answer). Never cached.
 */
export async function GET() {
  let state: "authenticated" | "anonymous" | "indeterminate" = "indeterminate"
  let check = "none"
  try {
    const current = await currentUserForRequest()
    state = current.state
    /* Round 49: how it was checked, and which local check this server has (lib/auth/auth-check-header). */
    check = await authCheckHeader(current)
  } catch {
    /* no cookie store or a client that would not build: could not tell */
  }
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store", [AUTH_CHECK_HEADER]: check } })
}
