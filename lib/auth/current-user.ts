import type { SupabaseClient } from "@supabase/supabase-js"

// Two ways to answer "who is calling", and the choice between them is the
// difference between a route that costs a network round trip and one that costs
// nothing.
//
// supabase.auth.getUser() issues a GET to the Supabase Auth server on every
// single call — it re-validates the JWT against the auth database and returns a
// user the server itself vouches for. supabase.auth.getSession() reads the same
// JWT out of the request cookies locally and only touches the network when the
// token is actually close to expiry and has to be refreshed. On a route that
// runs on every page view, that difference is the whole cost of the route.
//
// The reason the cheap read is safe on most of them is that our route handlers
// are not the thing enforcing identity. A query made through the CALLER's
// client carries their JWT to PostgREST, which verifies the signature and
// applies row level security in Postgres. A forged cookie survives getSession()
// — it is only shape-checked here — but it dies at the database, which returns
// nothing for a signature it cannot verify. So on an RLS-scoped read the id is
// a filter, not a credential, and reading it locally gives an attacker nothing.
//
// That argument collapses the moment the id is handed to the ADMIN client. The
// service role bypasses RLS entirely, so there the id IS the credential and
// nothing downstream will second-guess it. Those routes must keep paying for
// getUser(). Use requireVerifiedUser() there and getSessionUserId() everywhere
// else.

/**
 * What the local session read was able to establish.
 *
 * "anonymous" and "indeterminate" both mean "no id to work with", but they are
 * not the same answer and callers that sign people out must not conflate them:
 * one is the absence of a session, the other is our failure to read one.
 */
export type SessionAuth =
  | { status: "authenticated"; userId: string }
  | { status: "anonymous"; userId: null }
  | { status: "indeterminate"; userId: null }

/**
 * Read the caller's id from the session cookie without contacting the auth
 * server, distinguishing "signed out" from "could not tell".
 *
 * A transient failure — a refresh that hit a rate limit, a network blip — comes
 * back as "indeterminate" so the caller can degrade instead of declaring the
 * visitor signed out.
 */
export async function readSessionAuth(supabase: SupabaseClient): Promise<SessionAuth> {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) return { status: "indeterminate", userId: null }
    const userId = data.session?.user?.id
    if (!userId) return { status: "anonymous", userId: null }
    return { status: "authenticated", userId }
  } catch {
    // getSession() only throws on a storage or refresh fault, never to say
    // "signed out" — so this is something we could not read, not an absence.
    return { status: "indeterminate", userId: null }
  }
}

/**
 * The caller's id from the session cookie, or null if there isn't one.
 *
 * For RLS-scoped reads that degrade gracefully to an empty answer — a badge
 * count, a list — where "signed out" and "we could not tell" both correctly
 * render as nothing.
 */
export async function getSessionUserId(supabase: SupabaseClient): Promise<string | null> {
  return (await readSessionAuth(supabase)).userId
}

/**
 * The caller's id, re-validated against the Supabase Auth server.
 *
 * Costs a network round trip, and is what every path that hands the id to the
 * admin client or performs a privileged write must use: past that point RLS is
 * switched off, so this call is the only thing standing between a forged cookie
 * and someone else's data.
 */
export async function requireVerifiedUser(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}
