import "server-only"

/**
 * ===========================================================================
 *  SIGNING IN TO A CREATOR'S WEBSITE, THE WAY A SHOPIFY STORE DOES IT
 * ===========================================================================
 * Two steps, both on the website's own host, both plain form posts that work
 * without a line of script:
 *
 *   1. EMAIL   /api/site-account/code
 *      The address is checked for shape, the host is looked up as a
 *      creator's published website (lib/site-accounts/hosts.ts, from the
 *      database, never from the page), the three limits are asked, a code
 *      is made (ending any live one for that address, ./codes.ts) and
 *      emailed from the store. The browser keeps a signed note of which
 *      code it is waiting on. The answer is the same whether the address
 *      has an account here or not: nothing is looked up about the address
 *      at this step at all.
 *
 *   2. CODE    /api/site-account/verify
 *      The note is read back (signed here, this host, this creator, not
 *      expired), the code is checked and counted in one conditional update
 *      (./codes.ts), and the customer for that address on this website is
 *      found or made (./customers.ts). A new address is a new account, made
 *      now, with no form to fill in and no password. The answer is a
 *      session for this website only.
 *
 * WHAT IS NEVER MADE. No Supabase user, no profile, no creator row, no
 * storelib.com session: the customer is a row in site_customers and nothing
 * else, so signing in on a website can never make somebody a creator or open
 * /app to them. tests/site-accounts.test.ts runs both steps against a
 * database with every other table in it and checks which tables were
 * written.
 *
 * The routes are thin: they read the form and the cookies, call these, and
 * turn the answer into cookies and a redirect. Everything that decides is
 * here, with its collaborators passed in, so the tests drive the real thing.
 */

import { cleanEmail, CODE_TTL_MS, mintPending, mintSession, readPending } from "./token"
import { checkCode, issueCode } from "./codes"
import { cleanName, findOrCreateCustomer, renameCustomer } from "./customers"
import { codeEmail } from "./code-email"
import type { Db } from "./db"

export interface VerifyDeps {
  db: Db
  /** The creator whose published website answers at this host, or null (./hosts.ts siteOwnerOfHost). */
  owner: (host: string) => Promise<{ creatorId: string } | null>
  now?: number
}

export interface SignInDeps extends VerifyDeps {
  /** True when this request is over a limit (lib/api/rate-limit.ts). */
  limited: (input: { creatorId: string; email: string }) => Promise<boolean>
  send: (mail: { to: string; subject: string; html: string; text: string; fromName: string }) => Promise<{ success: boolean }>
  /** The store's name, for the email (./brand.ts). */
  brand: (creatorId: string) => Promise<string>
}

/** Why a step stopped, as the sign in page's `?error=` (lib/website-builder/account-pages signInNotice). */
export type SignInRefusal = "email" | "site" | "limit" | "unavailable" | "send" | "code" | "expired" | "tries" | "failed"

export type RequestResult = { ok: true; pending: string; email: string } | { ok: false; why: SignInRefusal }

/**
 * `name` is what a theme's Create account form asked for (first and last
 * name). It rides in the signed note, never in the database, until the code
 * proves the email; then it becomes the new account's name. An account that
 * already has a name keeps it: nobody renames an account by asking for a code.
 */
export async function requestCode(input: { host: string; email: unknown; returnPath: string; name?: unknown }, deps: SignInDeps): Promise<RequestResult> {
  const now = deps.now ?? Date.now()
  const email = cleanEmail(input.email)
  if (!email) return { ok: false, why: "email" }
  const owner = await deps.owner(input.host)
  if (!owner) return { ok: false, why: "site" }
  if (await deps.limited({ creatorId: owner.creatorId, email })) return { ok: false, why: "limit" }

  const issued = await issueCode(deps.db, { creatorId: owner.creatorId, email, host: input.host }, now)
  if (issued.ok === false) return { ok: false, why: issued.why }

  const store = await deps.brand(owner.creatorId).catch(() => "this store")
  const mail = codeEmail({ store, code: issued.code, host: input.host, minutes: Math.round(CODE_TTL_MS / 60_000) })
  const sent = await deps.send({ to: email, ...mail }).catch(() => ({ success: false }))
  if (!sent.success) return { ok: false, why: "send" }

  const name = cleanName(input.name) || null
  const pending = mintPending({ codeId: issued.codeId, email, creatorId: owner.creatorId, host: input.host, returnPath: input.returnPath, name }, now)
  if (!pending) return { ok: false, why: "unavailable" }
  return { ok: true, pending, email }
}

export type VerifyResult =
  | { ok: true; session: string; returnPath: string; customerId: string; creatorId: string; created: boolean }
  | { ok: false; why: SignInRefusal }

export async function verifyCode(input: { host: string; pending: string | null; code: unknown }, deps: VerifyDeps): Promise<VerifyResult> {
  const now = deps.now ?? Date.now()
  const note = readPending(input.pending, now)
  if (!note || note.h !== input.host) return { ok: false, why: "expired" }
  /* The host's creator now, looked up again: a website whose address moved to somebody else signs nobody in. */
  const owner = await deps.owner(input.host)
  if (!owner || owner.creatorId !== note.c) return { ok: false, why: "expired" }

  const checked = await checkCode(deps.db, { codeId: note.k, creatorId: owner.creatorId, host: input.host, code: input.code }, now)
  if (checked.ok === false) return { ok: false, why: checked.why }

  const found = await findOrCreateCustomer(deps.db, { creatorId: owner.creatorId, email: checked.email }, now)
  if (found.ok === false) return { ok: false, why: found.why }

  /* The name from a Create account form, for an account that has none yet. */
  const named = note.n ? cleanName(note.n) : null
  if (named && !(found.customer.name ?? "").trim()) await renameCustomer(deps.db, { customerId: found.customer.id, creatorId: owner.creatorId }, named).catch(() => false)

  const session = mintSession({ customerId: found.customer.id, creatorId: owner.creatorId, host: input.host }, now)
  if (!session) return { ok: false, why: "unavailable" }
  return { ok: true, session, returnPath: note.r, customerId: found.customer.id, creatorId: owner.creatorId, created: found.created }
}
