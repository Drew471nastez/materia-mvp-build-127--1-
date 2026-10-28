/**
 * ===========================================================================
 *  WHO ON THE TEAM DID IT (round 41)
 * ===========================================================================
 * A team member acts as the store: the order's timeline says "creator", the
 * community's log names the store's owner. So the member is written on the
 * line too, in its JSON column, under one key, wherever such a line is
 * written through the client a team route hands out (lib/physical/auth
 * shopCaller, lib/team/server requireTeamPermission). Library code that is
 * handed that client stamps its lines without knowing about the team.
 *
 * Only inserts into the tables below change, and only by adding the key;
 * every other table, call and property is the client's own. The owner's
 * client is never wrapped.
 */

/** The key the member's account id is written under. The community's log uses the same (lib/communities/server/team TEAM_AUDIT_KEY). */
export const TEAM_ACTOR_KEY = "team_member_user_id"

/** The record tables a member's work writes lines into, and the JSON column each keeps its detail in. */
export const TEAM_STAMPED: Readonly<Record<string, string>> = {
  commerce_order_events: "detail",
  security_events: "metadata",
  community_audit_log: "detail",
}

function stampRow(row: unknown, column: string, memberUserId: string): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row
  const r = row as Record<string, unknown>
  const inner = r[column] && typeof r[column] === "object" && !Array.isArray(r[column]) ? (r[column] as Record<string, unknown>) : {}
  return { ...r, [column]: { ...inner, [TEAM_ACTOR_KEY]: memberUserId } }
}

/** Pure: a row (or rows) for this table with the member written on it; anything else as it was. Exported for the suite. */
export function stampTeamRow<T>(table: string, values: T, memberUserId: string): T {
  const column = TEAM_STAMPED[table]
  if (!column) return values
  return (Array.isArray(values) ? values.map((v) => stampRow(v, column, memberUserId)) : stampRow(values, column, memberUserId)) as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** The same client, except that a line written into a record table names the member. */
export function teamStampDb(db: Db, memberUserId: string): Db {
  const bound = (target: object, key: PropertyKey) => {
    const v = Reflect.get(target, key)
    return typeof v === "function" ? v.bind(target) : v
  }
  return new Proxy(db, {
    get(target, key) {
      if (key !== "from") return bound(target, key)
      return (table: string, ...rest: unknown[]) => {
        const q = target.from(table, ...rest)
        if (!Object.hasOwn(TEAM_STAMPED, table) || !q || typeof q !== "object") return q
        return new Proxy(q, {
          get(t, k) {
            if (k !== "insert" && k !== "upsert") return bound(t, k)
            return (values: unknown, ...more: unknown[]) => (t as Record<string, (...a: unknown[]) => unknown>)[k as string](stampTeamRow(table, values, memberUserId), ...more)
          },
        })
      }
    },
  })
}
