/**
 * ===========================================================================
 *  WHO GETS THE AGENT ENGINE (round M, M1)
 * ===========================================================================
 * ROUND N: ON FOR EVERY ACCOUNT BY DEFAULT (Andrew: "it should be for all
 * accounts"). Two switches, read on the server only:
 *
 *   AI_BUILDER_AGENT              unset or "1": everybody. "0" (or "off",
 *                                 "false"): the emergency off switch, every
 *                                 account back on the classic builder except
 *                                 the allowlist below.
 *   AI_BUILDER_AGENT_ACCOUNTS     a comma separated allowlist, used when the
 *                                 switch is off. Each entry is
 *                                 a store's owner user id or creator id (a
 *                                 uuid), or a creator username (with or
 *                                 without "@" in front, any case). Emails are
 *                                 NOT accepted: an entry that looks like one
 *                                 is ignored, and the log says only that one
 *                                 was ignored, never which.
 *
 * Applied in the same way everywhere the engine is chosen: Start with AI
 * (themes/create, the job's engine), Edit with AI (themes/[id]/ai-edit),
 * Redesign with AI (themes/[id]/redesign), and the editor learns it from the
 * redesign route's GET (`agent`), never from an env variable of its own.
 *
 * The account is the STORE's owner (a team member acting in a store is the
 * owner's AI and is refused by those routes anyway).
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

type Env = Record<string, string | undefined>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const USERNAME = /^[a-z0-9][a-z0-9._-]{0,63}$/

export interface AgentAccess {
  /** On for every account: AI_BUILDER_AGENT unset or anything but the off words (round N). */
  everyone: boolean
  /** Owner user ids and creator ids, lowercase. */
  ids: Set<string>
  /** Creator usernames (or slugs), lowercase, without "@". */
  usernames: Set<string>
  /** Entries that were neither (an email, junk). Counted, never kept. */
  ignored: number
}

/** The global switch: on unless set to "0", "off" or "false" (round N: the default is on). Pure. */
export function agentOnForEveryone(env: Env = process.env): boolean {
  const v = String(env.AI_BUILDER_AGENT ?? "").trim().toLowerCase()
  return !(v === "0" || v === "off" || v === "false")
}

/** The two switches, parsed. Pure. */
export function agentAccessFrom(env: Env = process.env): AgentAccess {
  const out: AgentAccess = { everyone: agentOnForEveryone(env), ids: new Set(), usernames: new Set(), ignored: 0 }
  for (const raw of String(env.AI_BUILDER_AGENT_ACCOUNTS ?? "").split(",")) {
    const v = raw.trim().toLowerCase()
    if (!v) continue
    if (UUID.test(v)) out.ids.add(v)
    else if (USERNAME.test(v.replace(/^@/, ""))) out.usernames.add(v.replace(/^@/, ""))
    else out.ignored++
  }
  return out
}

export interface AgentAccount {
  ownerUserId: string | null
  creatorId: string
  /** The creator's username and slug, when known. */
  names?: (string | null | undefined)[]
}

/** Whether this account may use the agent engine, given what is known of it. Pure. */
export function agentAllowed(access: AgentAccess, account: AgentAccount): boolean {
  if (access.everyone) return true
  if (account.ownerUserId && access.ids.has(account.ownerUserId.toLowerCase())) return true
  if (access.ids.has(account.creatorId.toLowerCase())) return true
  for (const n of account.names ?? []) if (n && access.usernames.has(String(n).toLowerCase().replace(/^@/, ""))) return true
  return false
}

let warned = false

/**
 * The agent engine for this store's owner? Reads the creator's username and
 * slug only when the allowlist has usernames and the ids did not match.
 */
export async function agentEnabledFor(db: Db, account: { ownerUserId: string | null; creatorId: string }, env: Env = process.env): Promise<boolean> {
  const access = agentAccessFrom(env)
  if (access.ignored && !warned) {
    warned = true
    console.warn("[ai-builder] AI_BUILDER_AGENT_ACCOUNTS has entries that are not a user id, creator id or username; they are ignored", { count: access.ignored })
  }
  if (agentAllowed(access, account)) return true
  if (!access.usernames.size) return false
  try {
    const { data } = await db.from("creators").select("username, slug").eq("id", account.creatorId).maybeSingle()
    const row = (data ?? {}) as { username?: string | null; slug?: string | null }
    return agentAllowed(access, { ...account, names: [row.username, row.slug] })
  } catch {
    return false
  }
}
