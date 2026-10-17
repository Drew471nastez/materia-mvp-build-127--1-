/**
 * ===========================================================================
 *  ROUND 34: WHAT EVERY COMMUNITY DOOR DEMANDS, AND WHO GETS THROUGH IT
 * ===========================================================================
 * The owner: "Enforce these roles on the server. Do not rely on hiding
 * buttons in the interface. Audit all existing API routes, server actions,
 * database policies, and sensitive operations. Ensure a moderator cannot
 * bypass restrictions by manually calling an admin endpoint."
 *
 * lib/communities/permissions.ts is the one place that says what each role
 * may do. lib/communities/route-permissions.ts is the audit of what each
 * door asks for. This walks the branch and holds the two together:
 *
 *   EVERY DOOR    every exported handler of every route under
 *                 app/api/community and app/api/app/community, and every
 *                 section page of /app/community/<id>, has a row; a row
 *                 whose handler is gone fails too. A route added without
 *                 saying what it demands fails here the day it lands.
 *   THE ACTION    a row's actions are the ones the source hands its gate,
 *                 read out of the source, not trusted.
 *   THE ROLES     who gets through, from the same can() the route calls,
 *                 and the owner only actions reaching nobody but the owner.
 *   A MODERATOR   every creator door, called by a moderator through the
 *                 real gate rule (creatorRefusal in
 *                 lib/communities/server/context.ts): refused unless
 *                 MODERATOR_DOORS lists it. So "a moderator manually calling
 *                 an admin endpoint" is measured rather than assumed.
 *   NO DRIFT      every can() in the community code hands it the owner's
 *                 own choices for that community (the third argument),
 *                 unless the action is one the choices cannot move (an owner
 *                 only action, or one every member has anyway).
 *   RANKS         nobody acts on an equal or a better: canActOn and
 *                 assignableRoles, and the member actions' own rule.
 *
 * Each checker is run against fixtures first, so a checker that waves
 * everything through fails here rather than passing quietly.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import {
  COMMUNITY_ACTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  OWNER_ONLY_ACTIONS,
  PERMISSION_KEYS,
  ROLE_RANK,
  assignableRoles,
  can,
  canActOn,
  meetsRole,
  roleGroups,
  type CommunityAction,
} from "@/lib/communities/permissions"
import {
  COMMUNITY_ROUTE_RULES,
  MODERATOR_DOORS,
  rolesThrough,
  routeKey,
  type CommunityRouteRule,
  type RouteGate,
  type RouteMethod,
} from "@/lib/communities/route-permissions"
import { creatorRefusal, memberRefusal } from "@/lib/communities/server/context"
import { MEMBER_ACTIONS, UNDO_ACTIONS, memberActionNeeds } from "@/lib/communities/server/moderation"
import { ROLES, type CommunityRow, type Role } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

/* ── Reading a route's own source ───────────────────────────────────────── */

function walk(dir: string, file: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, file, out)
    else if (e === file) out.push(p)
  }
  return out
}

/** The text from `open` (the index of its bracket) to the one that closes it. */
function balanced(src: string, open: number, o = "{", c = "}"): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === o) depth++
    else if (src[i] === c) {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return src.slice(open)
}

/** The top level arguments of the call whose "(" is at `open`. */
function callArgs(src: string, open: number): string[] {
  const inner = balanced(src, open, "(", ")").slice(1, -1)
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of inner) {
    if ("([{".includes(ch)) depth++
    if (")]}".includes(ch)) depth--
    if (ch === "," && depth === 0) {
      out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

export interface ReadDoor {
  method: RouteMethod
  gate: RouteGate
  /** The action literals handed to the gate. */
  literals: string[]
  /** The expressions handed to the gate that are not a literal (the body decides). */
  computed: string[]
}

const LITERAL = /^"([a-z_]+)"$/

/** Every door a route file opens, read out of its source. */
export function doorsOf(source: string): ReadDoor[] {
  const src = stripComments(source)
  const out: ReadDoor[] = []
  for (const h of src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)[^{]*\{/g)) {
    const body = balanced(src, h.index! + h[0].length - 1)
    const literals = new Set<string>()
    const computed = new Set<string>()
    let gate: RouteGate | null = null
    for (const g of body.matchAll(/\brequireCreatorCommunity\s*\(/g)) {
      gate = "creator"
      const a = callArgs(body, g.index! + g[0].length - 1).at(-1) ?? ""
      const m = LITERAL.exec(a)
      if (m) literals.add(m[1])
      else computed.add(a)
    }
    for (const g of body.matchAll(/\brequireMember\s*\(/g)) {
      gate = gate ?? "member"
      const a = callArgs(body, g.index! + g[0].length - 1).at(-1) ?? ""
      const m = LITERAL.exec(a)
      if (m) literals.add(m[1])
      else computed.add(a)
    }
    if (!gate && /\bviewerContext\s*\(/.test(body)) gate = "viewer"
    if (!gate && /\brequireCreator\s*\(\s*\)/.test(body)) gate = "creator_account"
    out.push({ method: h[1] as RouteMethod, gate: gate ?? "open", literals: [...literals].sort(), computed: [...computed] })
  }
  return out
}

/** The action a section page of /app/community/<id> demands, or null when it is not one. */
export function sectionDoorOf(source: string): string | null {
  const m = /sectionPage\(\s*id\s*,\s*"([a-z_]+)"\s*\)/.exec(stripComments(source))
  return m ? m[1] : null
}

/* ── can() hands the owner's own choices on ─────────────────────────────── */

/**
 * An action the owner's choices cannot move either way: an owner only action
 * (never handed to anybody) or one every member has anyway. A can() about
 * one of those answers the same with the choices and without them.
 */
const CHOICELESS: readonly CommunityAction[] = COMMUNITY_ACTIONS.filter(
  (a) => OWNER_ONLY_ACTIONS.includes(a) || (can("member", a) && can("moderator", a) && can("admin", a)),
)

/** Every can() in a file that decides from an action literal the owner's choices CAN move, with no third argument. */
export function permlessCalls(source: string): string[] {
  const src = stripComments(source)
  const out: string[] = []
  for (const m of src.matchAll(/(^|[^\w.$])can\s*\(/g)) {
    const open = m.index! + m[0].length - 1
    const args = callArgs(src, open)
    if (args.length !== 2) continue
    const lit = LITERAL.exec(args[1])
    if (!lit) continue
    if (CHOICELESS.includes(lit[1] as CommunityAction)) continue
    out.push(`can(${args[0]}, ${args[1]})`)
  }
  return out
}

/* ── The fixtures each checker is proved on ─────────────────────────────── */

function fixtures() {
  console.log("\nThe checkers themselves, on fixtures\n")

  const route = `
    export async function GET(request: Request, { params }: Ctx) {
      const off = await requireCommunitiesOn()
      if (off) return off
      const gate = await requireMember(db, communityId, await sessionUserId(), "view")
      if (gate instanceof NextResponse) return gate
      return NextResponse.json({})
    }
    export async function POST(request: Request) {
      const off = await requireCommunitiesOn()
      if (off) return off
      const gate = await requireCreatorCommunity(id, memberActionNeeds(body.action))
      if (gate instanceof NextResponse) return gate
      return NextResponse.json({})
    }`
  const read = doorsOf(route)
  check("a route's doors are read with their gate and their action", read.length === 2 && read[0].gate === "member" && read[0].literals.join() === "view" && read[1].gate === "creator" && read[1].computed.join() === "memberActionNeeds(body.action)", JSON.stringify(read))
  check("a gate in a comment is not a door", doorsOf(`/* requireMember(db, id, u, "ban") */\nexport async function GET() { const off = await requireCommunitiesOn(); if (off) return off; const g = await requireMember(db, id, u, "view"); return x }`)[0].literals.join() === "view")
  check("a section page's action is read", sectionDoorOf(`const ctx = await sectionPage(id, "remove_member")`) === "remove_member" && sectionDoorOf(`export default async function Page() { return null }`) === null)

  check("a can() with no choices is caught", permlessCalls(`if (can(viewer.role, "manage_members")) return x`).length === 1)
  check("a can() with the choices is passed", permlessCalls(`if (can(viewer.role, "manage_members", viewer.perms)) return x`).length === 0)
  check("a can() about an action the choices cannot move is passed", permlessCalls(`if (can(role, "delete") || can(role, "post")) return x`).length === 0)
  check("a can() in a comment is not counted", permlessCalls(`/* can(role, "manage_members") */\nif (can(role, "manage_members", perms)) return x`).length === 0)
  check("scan( and other words ending in can are not counted", permlessCalls(`scan(role, "manage_members"); american(role, "manage_members")`).length === 0)
}

/* ── Every door on the branch ───────────────────────────────────────────── */

const ROUTE_ROOTS = ["app/api/community", "app/api/app/community"]
const EXTRA_ROUTES = ["app/api/store-builder/communities/route.ts"]

function routeFiles(): string[] {
  return [...ROUTE_ROOTS.flatMap((d) => walk(d, "route.ts")), ...EXTRA_ROUTES.filter((f) => existsSync(f))].sort()
}

function sectionPages(): string[] {
  return walk("app/app/community", "page.tsx")
    .filter((p) => sectionDoorOf(readFileSync(p, "utf8")) !== null)
    .sort()
}

function everyDoor() {
  console.log(`\nEvery community door on this branch\n`)
  const byKey = new Map<string, CommunityRouteRule>()
  for (const r of COMMUNITY_ROUTE_RULES) {
    if (byKey.has(routeKey(r))) check(`${routeKey(r)} is written once`, false, "two rows for the same handler")
    byKey.set(routeKey(r), r)
  }

  const seen = new Set<string>()
  let wrong = 0
  for (const file of routeFiles()) {
    for (const door of doorsOf(readFileSync(file, "utf8"))) {
      const key = `${file} ${door.method}`
      seen.add(key)
      const rule = byKey.get(key)
      if (!rule) {
        check(`${key} is in lib/communities/route-permissions.ts`, false, "a door with no row: add one saying what it demands")
        wrong++
        continue
      }
      if (rule.gate !== door.gate) {
        check(`${key} passes the gate its row names`, false, `the row says ${rule.gate}, the source passes ${door.gate}`)
        wrong++
      }
      /* Every literal the source hands the gate is in the row. Where the body decides, the row says so and lists them all. */
      const missing = door.literals.filter((a) => !(rule.demands as readonly string[]).includes(a))
      if (missing.length) {
        check(`${key} demands what its row says`, false, `the source also demands ${missing.join(", ")}`)
        wrong++
      }
      if (door.computed.length && !rule.via) {
        check(`${key} says what picks its action`, false, `the source computes it (${door.computed.join(", ")}) and the row has no via`)
        wrong++
      }
      if (!door.computed.length && !door.literals.length && rule.demands.length) {
        check(`${key} demands nothing, as its row says`, false, "the row lists actions the source never hands a gate")
        wrong++
      }
    }
  }
  for (const page of sectionPages()) {
    const key = `${page} PAGE`
    seen.add(key)
    const rule = byKey.get(key)
    const action = sectionDoorOf(readFileSync(page, "utf8"))
    if (!rule) {
      check(`${key} is in lib/communities/route-permissions.ts`, false, "a section page with no row")
      wrong++
    } else if (rule.demands.join() !== action) {
      check(`${key} demands what its row says`, false, `the row says ${rule.demands.join(", ")}, the page asks sectionPage for ${action}`)
      wrong++
    }
  }
  const stale = [...byKey.keys()].filter((k) => !seen.has(k))
  check("no row names a handler that is gone", stale.length === 0, stale.join("\n        "))
  check(`every door on the branch has a row (${seen.size} doors)`, wrong === 0)
  check("the walk found the routes and the pages", seen.size > 100 && sectionPages().length >= 10, `${seen.size} doors, ${sectionPages().length} pages`)
}

/* ── Who gets through ───────────────────────────────────────────────────── */

const open = (over: Partial<CommunityRow> = {}) => ({ status: "published", suspended_at: null, archived_at: null, ...over }) as CommunityRow

function whoGetsThrough() {
  console.log("\nWho gets through each door\n")

  const ownerOnly = COMMUNITY_ROUTE_RULES.filter((r) => r.demands.length === 1 && OWNER_ONLY_ACTIONS.includes(r.demands[0]))
  check(`the owner only doors reach nobody else (${ownerOnly.length})`, ownerOnly.every((r) => rolesThrough(r).join() === "owner"), ownerOnly.filter((r) => rolesThrough(r).join() !== "owner").map((r) => `${routeKey(r)}: ${rolesThrough(r).join(", ")}`).join("\n        "))
  check("a plain member never reaches a creator door", COMMUNITY_ROUTE_RULES.filter((r) => r.gate === "creator").every((r) => !rolesThrough(r).includes("member")))
  check("the owner reaches every door", COMMUNITY_ROUTE_RULES.every((r) => rolesThrough(r).includes("owner")), COMMUNITY_ROUTE_RULES.filter((r) => !rolesThrough(r).includes("owner")).map(routeKey).join(", "))
  check("every action a row demands is a real one", COMMUNITY_ROUTE_RULES.every((r) => r.demands.every((a) => COMMUNITY_ACTIONS.includes(a))))

  /*
    A MODERATOR CALLING AN ADMIN ENDPOINT HIMSELF. Every creator door, run
    through the rule requireCreatorCommunity itself applies once it knows the
    role (creatorRefusal), as a moderator of the community with the defaults.
    Refused unless MODERATOR_DOORS lists the door.
  */
  const creatorDoors = COMMUNITY_ROUTE_RULES.filter((r) => r.gate === "creator")
  const reached: string[] = []
  for (const rule of creatorDoors) {
    const through = rule.demands.filter((a) => creatorRefusal("moderator", a, null, open()) === null)
    if (through.length) reached.push(routeKey(rule))
  }
  const declared = [...MODERATOR_DOORS].sort()
  check(`a moderator reaches exactly the doors MODERATOR_DOORS names (${declared.length})`, reached.sort().join("\n") === declared.join("\n"), `reached but not declared: ${reached.filter((k) => !declared.includes(k)).join(", ") || "none"}; declared but not reached: ${declared.filter((k) => !reached.includes(k)).join(", ") || "none"}`)

  /* And the refusal is the one the browser sees: 403 forbidden on a door they may not, never a quiet pass. */
  const admin = COMMUNITY_ROUTE_RULES.find((r) => routeKey(r) === "app/api/app/community/[id]/tiers/route.ts POST")
  check("the pricing door answers a moderator 403 forbidden", !!admin && admin.demands.every((a) => creatorRefusal("moderator", a, null, open())?.status === 403 && creatorRefusal("moderator", a, null, open())?.error === "forbidden"))
  check("the delete door answers an admin 403 forbidden", creatorRefusal("admin", "delete", null, open())?.error === "forbidden")
  check("a creator door answers a plain member 404, not 403", creatorRefusal("member", "view", null, open())?.status === 404 && creatorRefusal(null, "view", null, open())?.status === 404)
  check("the owner is refused nothing on an open community", COMMUNITY_ACTIONS.every((a) => creatorRefusal("owner", a, null, open()) === null))

  /* The owner's own choices move the answer, both ways, through the same rule. */
  const noMembers = { moderator: { ...roleGroups("moderator"), members: false } }
  check("a moderator the members group was taken from is refused the member door", creatorRefusal("moderator", "remove_member", noMembers, open())?.error === "forbidden" && creatorRefusal("moderator", "remove_member", null, open()) === null)
  const modEvents = { moderator: { ...roleGroups("moderator"), events: true } }
  check("a moderator given the calendar reaches the events door", creatorRefusal("moderator", "manage_events", modEvents, open()) === null && creatorRefusal("moderator", "manage_events", null, open())?.error === "forbidden")
  const adminNoPeople = { admin: { ...roleGroups("admin"), people: false } }
  check("an admin the people group was taken from cannot change a role", creatorRefusal("admin", "change_role", adminNoPeople, open())?.error === "forbidden" && assignableRoles("admin", adminNoPeople).length === 0)
  check("the choices never reach an owner only action", (["admin", "moderator"] as const).every((r) => OWNER_ONLY_ACTIONS.every((a) => creatorRefusal(r, a, { [r]: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) }, open())?.error === "forbidden")))

  /*
    STORELIB'S OWN ADMINISTRATORS ARE NOT A COMMUNITY'S. The owner: "Keep
    platform-wide Storelib administrators distinct from the administrators of
    one community." They are two gates that never meet: lib/admin/gate
    requireAdmin for Storelib's console, requireCreatorCommunity for a
    community's own side. Neither file reaches for the other's.
  */
  const platform = readFileSync("app/api/admin/communities/route.ts", "utf8")
  check("Storelib's own console decides with requireAdmin and never with a community role", /requireAdmin\(/.test(platform) && !/requireCreatorCommunity|requireMember/.test(platform))
  const communityFiles = [...routeFiles(), ...sectionPages()]
  const borrowed = communityFiles.filter((f) => /\brequireAdmin\b/.test(stripComments(readFileSync(f, "utf8"))))
  check(`no community route lets a Storelib administrator in through the side (${communityFiles.length} files)`, borrowed.length === 0, borrowed.join(", "))
  check("and a community knows four roles, with no Storelib one among them", [...ROLES].sort().join() === "admin,member,moderator,owner")

  /* A suspended community reaches nobody new, whatever the role. */
  check("a suspended community refuses its owner the doors that reach people", creatorRefusal("owner", "invite", null, open({ suspended_at: "2026-01-01T00:00:00Z" }))?.error === "suspended" && creatorRefusal("owner", "view", null, open({ suspended_at: "2026-01-01T00:00:00Z" })) === null)
}

/* ── The member gate ───────────────────────────────────────────────────── */

type Who = Parameters<typeof memberRefusal>[0]
const member = (over: Partial<Who> = {}): Who => ({ active: true, banned: false, status: "active", mutedUntil: null, role: "member", perms: null, ...over })

function theMemberGate() {
  console.log("\nThe member gate\n")
  check("an active member reads and posts", memberRefusal(member(), open(), "view") === null && memberRefusal(member(), open(), "post") === null)
  check("a member never moderates, bans or invites", (["moderate_content", "ban", "invite", "manage_members", "view_analytics"] as const).every((a) => memberRefusal(member(), open(), a)?.error === "forbidden"))
  check("somebody who is not a member is told so", memberRefusal(member({ active: false, status: null }), open(), "view")?.error === "not_member")
  check("a banned member is told banned, a pending one pending", memberRefusal(member({ active: false, banned: true, status: "banned" }), open(), "view")?.error === "banned" && memberRefusal(member({ active: false, status: "pending" }), open(), "view")?.error === "pending")
  check("a muted member reads but does not write", memberRefusal(member({ mutedUntil: "2099-01-01T00:00:00Z" }), open(), "view") === null && memberRefusal(member({ mutedUntil: "2099-01-01T00:00:00Z" }), open(), "post")?.error === "muted" && memberRefusal(member({ mutedUntil: "2099-01-01T00:00:00Z" }), open(), "post")?.until === "2099-01-01T00:00:00Z")
  check("an archived community is read only", memberRefusal(member(), open({ archived_at: "2026-01-01T00:00:00Z" }), "post")?.error === "archived" && memberRefusal(member(), open({ archived_at: "2026-01-01T00:00:00Z" }), "view") === null)
  check("a moderator moderates through the member gate, an admin prices events", memberRefusal(member({ role: "moderator" }), open(), "moderate_content") === null && memberRefusal(member({ role: "admin" }), open(), "price_events") === null)
  check("the member gate reads the owner's choices too", memberRefusal(member({ role: "moderator", perms: noContent }), open(), "moderate_content")?.error === "forbidden")
}
const noContent = { moderator: { ...roleGroups("moderator"), content: false } }

/* ── Nobody acts on an equal or a better ───────────────────────────────── */

function ranks() {
  console.log("\nRanks\n")
  const roles: Role[] = ["owner", "admin", "moderator", "member"]
  check("the ranks run member, moderator, admin, owner", ROLE_RANK.member < ROLE_RANK.moderator && ROLE_RANK.moderator < ROLE_RANK.admin && ROLE_RANK.admin < ROLE_RANK.owner)
  check("nobody acts on an equal", roles.every((r) => !canActOn(r, r)))
  check("a moderator never acts on an admin or the owner", !canActOn("moderator", "admin") && !canActOn("moderator", "owner"))
  check("an admin never acts on the owner", !canActOn("admin", "owner") && canActOn("admin", "moderator") && canActOn("admin", "member"))
  check("a member acts on nobody", roles.every((r) => !canActOn("member", r)))
  check("the roles somebody may hand out are below their own", assignableRoles("owner").join() === "admin,moderator,member" && assignableRoles("admin").join() === "moderator,member" && assignableRoles("moderator").join() === "" && assignableRoles("member").join() === "")
  check("meetsRole reads up, not down", meetsRole("admin", "moderator") && meetsRole("moderator", "moderator") && !meetsRole("moderator", "admin") && !meetsRole(null, "member"))

  /* Every member action's permission, so a new one cannot land without one. */
  check("every member action names the permission it needs", MEMBER_ACTIONS.every((a) => COMMUNITY_ACTIONS.includes(memberActionNeeds(a))))
  check("putting something back needs what took it away", (Object.entries(UNDO_ACTIONS) as [keyof typeof UNDO_ACTIONS, string][]).every(([undo, took]) => memberActionNeeds(undo) === memberActionNeeds(took as never)))
  check("a moderator may restrict and approve, never change a role", memberActionNeeds("ban") === "ban" && can("moderator", "ban") && can("moderator", "approve_member") && !can("moderator", "change_role") && !can("moderator", "manage_members"))
  check("the defaults are the roles as they were", DEFAULT_ROLE_PERMISSIONS.admin.settings && !DEFAULT_ROLE_PERMISSIONS.moderator.settings && DEFAULT_ROLE_PERMISSIONS.moderator.reports && !DEFAULT_ROLE_PERMISSIONS.moderator.people)
}

/* ── No drift between the server and the interface ─────────────────────── */

const PERMS_ROOTS = ["lib/communities", "app/api/community", "app/api/app/community", "app/app/community", "components/community"]

function noDrift() {
  console.log("\nEvery can() reads the owner's own choices\n")
  const files: string[] = []
  for (const root of PERMS_ROOTS) {
    if (!existsSync(root)) continue
    const stack = [root]
    while (stack.length) {
      const dir = stack.pop() as string
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) stack.push(p)
        else if (/\.tsx?$/.test(e)) files.push(p)
      }
    }
  }
  let bad = 0
  for (const f of files.sort()) {
    /* permissions.ts is where can() is written; its own calls are the rule, not a reading of it. */
    if (f === "lib/communities/permissions.ts") continue
    const calls = permlessCalls(readFileSync(f, "utf8"))
    if (calls.length) {
      check(`${f} hands can() the owner's choices`, false, calls.join("\n        "))
      bad++
    }
  }
  check(`every can() in the community code hands on the owner's choices (${files.length} files)`, bad === 0)
  check("the walk read the community code", files.length > 150, String(files.length))
}

function main() {
  fixtures()
  everyDoor()
  whoGetsThrough()
  theMemberGate()
  ranks()
  noDrift()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main()
