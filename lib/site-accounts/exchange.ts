import "server-only"

/**
 * The last step of signing in to a creator's website, as a decision: given
 * the code the browser brought, the host it brought it to and the state
 * cookie it carries, either a session for this website or the reason there
 * is none. The route (app/api/site-account/exchange) turns the answer into
 * cookies and a redirect; tests/site-accounts.test.ts drives this directly
 * against a database that keeps Postgres's promises.
 *
 * The checks, in order, each one cheap before the next:
 *
 *   signed here, unexpired       readCode (two minutes)
 *   made for this host           a code copied to another website is nothing
 *   this browser's state         sameState, constant time
 *   this host's creator, now     looked up again, not taken from the code
 *   never exchanged before       claimCode, a primary key in Postgres
 */

import { readCode, mintSession, sameState } from "./token"
import { siteOwnerOfHost, type HostRules } from "./hosts"
import { claimCode } from "./codes"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type ExchangeRefusal = "expired" | "used" | "unavailable" | "mismatch"

export type ExchangeResult =
  | { ok: true; session: string; returnPath: string; userId: string; creatorId: string }
  | { ok: false; why: ExchangeRefusal }

export async function exchangeCode(
  db: Db,
  input: { code: unknown; host: string; state: string | null },
  now = Date.now(),
  rules?: HostRules,
): Promise<ExchangeResult> {
  const code = readCode(input.code, now)
  if (!code) return { ok: false, why: "expired" }
  const host = input.host.trim().toLowerCase()
  if (code.h !== host) return { ok: false, why: "mismatch" }
  if (!sameState(input.state, code.s)) return { ok: false, why: "mismatch" }

  const owner = await siteOwnerOfHost(db, host, rules)
  if (!owner || owner.creatorId !== code.c) return { ok: false, why: "mismatch" }

  const claim = await claimCode(db, code)
  if (claim === "used") return { ok: false, why: "used" }
  if (claim !== "claimed") return { ok: false, why: "unavailable" }

  const session = mintSession({ userId: code.u, creatorId: code.c, host }, now)
  if (!session) return { ok: false, why: "unavailable" }
  return { ok: true, session, returnPath: code.r, userId: code.u, creatorId: code.c }
}
