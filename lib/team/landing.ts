/**
 * ===========================================================================
 *  WHERE A TEAM MEMBER LANDS (round Y2)
 * ===========================================================================
 * The owner: "I joined a team by invite, and every time I open my dashboard
 * I'm sent to /sell to start onboarding." A member works in a store through
 * a cookie that names it (lib/team/server TEAM_STORE_COOKIE). Without that
 * cookie (another device, the app, a cleared browser, Back to my account) the
 * dashboard read only the signed in account's own store, found none, and
 * sent them to seller onboarding; and Not now there went to Discover, never
 * back to the store they were working in.
 *
 * Now, in order, for anyone signed in who opens /app:
 *
 *   working in a team store (a valid cookie)   that store's dashboard
 *   their own store with seller access         their own dashboard (owners: as before)
 *   on a team, no store of their own           the team store again, through
 *                                              /api/team/home, which sets the
 *                                              cookie and comes back
 *   none of these                              /sell, seller onboarding
 *
 * Only a person with no store of their own and no team is offered onboarding.
 * Pure, so the whole table is a unit test (tests/team-landing.test.ts). The
 * cookie still only names a store: every page asks the database again whether
 * this account may work in it, and as what (actingStore, creatorFor).
 */

/** The route that puts a member back in a team store and opens the page they wanted (app/api/team/home). */
export const TEAM_HOME_PATH = "/api/team/home"

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AppLanding = { kind: "own" } | { kind: "team" } | { kind: "adopt"; to: string } | { kind: "sell" }

export function appLanding(input: { acting: boolean; ownAccess: boolean; memberships: number; path: string }): AppLanding {
  if (input.acting) return { kind: "team" }
  if (input.ownAccess) return { kind: "own" }
  if (input.memberships > 0) return { kind: "adopt", to: teamHomeHref(input.path) }
  return { kind: "sell" }
}

/** A dashboard address to come back to, and only that: anything else is the dashboard's home. */
export function safeAppNext(raw: unknown): string {
  if (typeof raw !== "string") return "/app"
  const v = raw.trim()
  if (v.length > 512 || /[\\\s]/.test(v) || v.startsWith("//")) return "/app"
  const path = v.split(/[?#]/)[0]
  if (path !== "/app" && !path.startsWith("/app/")) return "/app"
  if (path.split("/").some((part) => part === ".." || part === ".")) return "/app"
  return v
}

/** /api/team/home with where to go after, and the store to go back to when it is known. */
export function teamHomeHref(next: string, store?: string | null): string {
  const q = new URLSearchParams()
  const to = safeAppNext(next)
  if (to !== "/app") q.set("next", to)
  if (store && UUID.test(store)) q.set("store", store)
  const s = q.toString()
  return `${TEAM_HOME_PATH}${s ? `?${s}` : ""}`
}

/**
 * Which store to open: the one asked for when this account is really on its
 * team, else the one joined most recently. null: on no team.
 */
export function pickTeamStore(rows: { creatorId: string; acceptedAt: string | null }[], wanted?: string | null): string | null {
  if (rows.length === 0) return null
  if (wanted && rows.some((r) => r.creatorId === wanted)) return wanted
  const at = (r: { acceptedAt: string | null }) => (r.acceptedAt ? Date.parse(r.acceptedAt) || 0 : 0)
  return [...rows].sort((a, b) => at(b) - at(a))[0].creatorId
}

/**
 * /api/team/home, decided. `cookie` is the store the browser already names:
 * asked to set the very store it already names means the dashboard did not
 * take it (the store is gone, or the read failed), so it ends on /sell as it
 * always did rather than going round again.
 */
export function teamHomeDecision(input: {
  signedIn: boolean
  ownAccess: boolean
  rows: { creatorId: string; acceptedAt: string | null }[]
  wanted: string | null
  cookie: string | null
  next: string
}): { kind: "login" } | { kind: "go"; to: string } | { kind: "set"; store: string; to: string } | { kind: "sell" } {
  const to = safeAppNext(input.next)
  if (!input.signedIn) return { kind: "login" }
  if (input.ownAccess) return { kind: "go", to }
  const store = pickTeamStore(input.rows, input.wanted)
  if (!store) return { kind: "sell" }
  if (input.cookie === store && !input.wanted) return { kind: "sell" }
  return { kind: "set", store, to }
}

/**
 * Where /sell's Not now goes. A member goes back to the team store they were
 * in (the one /sell was opened from when it said so); anyone else where they
 * came from, as before.
 */
export function sellLeaveHref(input: { memberships: number; team: string | null; fallback: string }): string {
  if (input.memberships > 0) return teamHomeHref("/app", input.team)
  return input.fallback
}

/**
 * Where "my own account" opens for a member working in a team store: their
 * dashboard when they have one, else their own setup on /sell, carrying the
 * store they were in so Not now there comes straight back to it.
 */
export function ownAccountHref(input: { ownAccess: boolean; actingIn: string | null }): string {
  if (input.ownAccess) return "/app"
  return input.actingIn && UUID.test(input.actingIn) ? `/sell?team=${input.actingIn}` : "/sell"
}
