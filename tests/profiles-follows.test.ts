/**
 * ===========================================================================
 *  PROFILES FOR EVERYBODY, AND FOLLOWS
 * ===========================================================================
 * Held from their inputs:
 *
 *   PERSON HREF   a live store is /<handle>, everybody else /@handle, no
 *                 handle goes home
 *   USERNAMES     made from the name, else the email, never reserved, never
 *                 taken (any case, a store slug, a renamed handle), never
 *                 overwriting one somebody already has
 *   ACTIVITY      only public things: published public communities, open
 *                 spaces, published posts; a paid community's post shows
 *                 where and not what; reviews and products; keyset pages
 *                 that cover everything once, with tampered cursors refused
 *   FOLLOWS       counts, the keyset list, the notice written once per pair
 *                 and silently skipped without its table
 *   PRIVACY       only the two switches, defaults while part 85 is missing
 *   ROUTES        follower from the session, no self follow, rate limited;
 *                 the username save refuses a store's handle; privacy and
 *                 activity are the session's own business
 *   PAGES         the profile reads the switches, owner pills only for the
 *                 owner, no selling UI for a buyer, the creator page gets
 *                 the same follow block and the back bar
 *   BOUNDARY      no client module reaches server code
 *   COPY          no em dash and no banned word in anything here
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import { personHref } from "@/lib/profile/person-href"
import { baseHandleFrom, emailLocalPart, handleCandidates, normalizeHandle, slugifyHandle } from "@/lib/profile/username-rules"
import { ensureUsername, ensureUsernames, handleAvailable } from "@/lib/profile/ensure-username"
import { activityKey, afterFilter, decodeCursor, encodeCursor, mergePages, newerThan, sortableTime, type Position } from "@/lib/profile/activity-cursor"
import { readProfileActivity, type ProfileActivityItem } from "@/lib/profile/activity"
import { decodeFollowCursor, encodeFollowCursor, followCounts, isFollowing, listFollows } from "@/lib/profile/follows"
import { followDedupeKey, notifyNewFollower } from "@/lib/profile/notify-follow"
import { privacyPatch, readPrivacy } from "@/lib/profile/privacy"
import { cameFromBrowsing, refererPath } from "@/lib/profile/back"
import { isValidUsername } from "@/lib/reserved-words"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`)
  }
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* ── A small PostgREST stand in: enough of the builder for these readers ─── */

type Row = Record<string, any>
type Filter = (r: Row) => boolean

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  const sa = String(a ?? "")
  const sb = String(b ?? "")
  if (/^\d{4}-\d{2}-\d{2}T/.test(sa) && /^\d{4}-\d{2}-\d{2}T/.test(sb)) return sortableTime(sa) < sortableTime(sb) ? -1 : sortableTime(sa) > sortableTime(sb) ? 1 : 0
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) return Number(sa) - Number(sb)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

function unquote(v: string): string {
  return v.startsWith('"') ? JSON.parse(v) : v
}

/** The one shape of or() these readers send: col.op.value,and(col.op.value,col.op.value). */
function orFilter(expr: string): Filter {
  const parts: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of expr) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      parts.push(cur)
      cur = ""
    } else cur += ch
  }
  parts.push(cur)
  const atom = (s: string): Filter => {
    const m = /^(\w+)\.(eq|lt|lte|gt|gte)\.(.+)$/.exec(s)
    if (!m) throw new Error(`fake db: cannot read ${s}`)
    const [, col, op, raw] = m
    const v = unquote(raw)
    return (r) => {
      const c = cmp(r[col], v)
      return op === "eq" ? c === 0 : op === "lt" ? c < 0 : op === "lte" ? c <= 0 : op === "gt" ? c > 0 : c >= 0
    }
  }
  const fs = parts.map((p) => {
    const m = /^and\((.*)\)$/.exec(p)
    if (!m) return atom(p)
    /* and(): every atom must hold. */
    const atoms = m[1].split(",").map(atom)
    return (r: Row) => atoms.every((f) => f(r))
  })
  return (r) => fs.some((f) => f(r))
}

function makeDb(tables: Record<string, Row[]>, opts: { missing?: string[]; unique?: Record<string, string> } = {}) {
  const writes: { table: string; op: string; payload: unknown }[] = []
  let serial = 1000
  function from(table: string) {
    const filters: Filter[] = []
    const orders: { col: string; asc: boolean }[] = []
    let limit: number | null = null
    let single: "maybe" | "one" | null = null
    let op: "select" | "update" | "insert" | "delete" = "select"
    let payload: any = null
    let head = false
    let count = false
    let returning = false
    const b: any = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        if (op === "select") {
          head = !!o?.head
          count = !!o?.count
        } else returning = true
        return b
      },
      insert(p: any) {
        op = "insert"
        payload = p
        return b
      },
      update(p: any) {
        op = "update"
        payload = p
        return b
      },
      delete() {
        op = "delete"
        return b
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
      is: (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)), b),
      lt: (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) < 0), b),
      lte: (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) <= 0), b),
      gte: (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) >= 0), b),
      ilike: (c: string, v: string) => (filters.push((r) => typeof r[c] === "string" && r[c].toLowerCase() === String(v).toLowerCase()), b),
      or: (expr: string) => (filters.push(orFilter(expr)), b),
      order: (col: string, o?: { ascending?: boolean }) => (orders.push({ col, asc: o?.ascending !== false }), b),
      limit: (n: number) => ((limit = n), b),
      maybeSingle: () => ((single = "maybe"), b),
      single: () => ((single = "one"), b),
      then(resolve: (v: any) => unknown) {
        return Promise.resolve(run()).then(resolve)
      },
    }
    function run(): any {
      if (opts.missing?.includes(table)) return { data: null, error: { code: "42P01", message: `relation "${table}" does not exist` } }
      const rows = (tables[table] ??= [])
      const hit = () => rows.filter((r) => filters.every((f) => f(r)))
      if (op === "insert") {
        writes.push({ table, op, payload })
        const list: Row[] = (Array.isArray(payload) ? payload : [payload]).map((r: Row): Row => ({ id: r.id ?? `gen-${serial++}`, created_at: new Date().toISOString(), ...r }))
        const key = opts.unique?.[table]
        for (const r of list) {
          if (key && rows.some((x) => x[key] === r[key])) return { data: null, error: { code: "23505", message: "duplicate key" } }
          rows.push(r)
        }
        return { data: returning ? list : null, error: null }
      }
      if (op === "update") {
        writes.push({ table, op, payload })
        const key = opts.unique?.[table]
        const targets = hit()
        if (key && key in payload && rows.some((x) => !targets.includes(x) && x[key] === payload[key])) return { data: null, error: { code: "23505", message: "duplicate key" } }
        for (const r of targets) Object.assign(r, payload)
        if (!returning) return { data: null, error: null }
        return { data: single ? targets[0] ?? null : targets, error: null }
      }
      if (op === "delete") {
        const keep = rows.filter((r) => !filters.every((f) => f(r)))
        rows.splice(0, rows.length, ...keep)
        return { data: null, error: null }
      }
      let out = hit()
      if (head && count) return { data: null, count: out.length, error: null }
      for (const o of [...orders].reverse()) out = [...out].sort((a, b2) => (o.asc ? cmp(a[o.col], b2[o.col]) : cmp(b2[o.col], a[o.col])))
      if (limit !== null) out = out.slice(0, limit)
      if (single === "maybe") return { data: out[0] ?? null, error: null }
      if (single === "one") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: "PGRST116" } }
      return { data: out.map((r) => ({ ...r })), error: null, count: count ? out.length : null }
    }
    return b
  }
  return { from, tables, writes, rpc: async () => ({ data: null, error: null }) }
}

const U = "00000000-0000-4000-8000-0000000000a1"
const V = "00000000-0000-4000-8000-0000000000b2"
const W = "00000000-0000-4000-8000-0000000000c3"

async function main() {
  console.log("\nWhere a person's name takes you")
  {
    check("a live store: /<handle>", personHref({ username: "Ana", hasStorefront: true }) === "/ana")
    check("everybody else: /@handle", personHref({ username: "ana-r", hasStorefront: false }) === "/@ana-r")
    check("no handle: home, not a broken address", personHref({ username: null, hasStorefront: false }) === "/" && personHref({ username: "", hasStorefront: true }) === "/")
    check("something that is not a handle is not linked", personHref({ username: "../admin", hasStorefront: false }) === "/")
  }

  console.log("\nA handle from what they already gave us")
  {
    check("accents fold, spaces become dashes", slugifyHandle("Ana Lucía Pérez") === "ana-lucia-perez")
    check("punctuation collapses, ends trimmed", slugifyHandle("  --Mr. O'Neil!! ") === "mr-o-neil")
    check("long names are cut to leave room for a number", slugifyHandle("a".repeat(60)).length === 24)
    check("the email's local part, without a +tag", emailLocalPart("jo.smith+shop@example.com") === "jo.smith")
    check("the name first", baseHandleFrom({ displayName: "Jo Smith", email: "x@y.z" }) === "jo-smith")
    check("a reserved name falls back to the email", baseHandleFrom({ displayName: "Admin", email: "maria.k@example.com" }) === "maria-k")
    check("a two letter name still makes a start", baseHandleFrom({ displayName: "Al", email: null }) === "al-member")
    check("nothing usable: member", baseHandleFrom({ displayName: "", email: "" }) === "member")
    let n = 0
    const fixed = () => [0.12, 0.34, 0.56, 0.78][n++ % 4]
    const cands = handleCandidates("jo-smith", fixed)
    check("the base first, then numbered ones", cands[0] === "jo-smith" && /^jo-smith-\d{2}$/.test(cands[1]), cands)
    check("every candidate passes the rule a typed handle must", cands.every((c) => isValidUsername(c).valid), cands)
    check("candidates are distinct", new Set(cands).size === cands.length)
    check("a typed handle is trimmed, lowercased, @ dropped", normalizeHandle("  @Ana_X ") === "ana_x")
  }

  console.log("\nensureUsername: on first need, never over somebody's own")
  {
    const db = makeDb(
      {
        profiles: [
          { id: U, username: null, display_name: "Jo Smith", email: "jo@example.com" },
          { id: V, username: "jo-smith", display_name: "Another Jo", email: "j2@example.com" },
          { id: W, username: "Keeper", display_name: "Kay", email: "k@example.com" },
        ],
        creators: [{ user_id: "someone", slug: "jo-smith-12" }],
        username_history: [{ user_id: "someone-else", old_username: "jo-smith-34" }],
      },
      { unique: { profiles: "username" } },
    )
    let n = 0
    const seq = [0.12, 0.34, 0.56, 0.78]
    const made = await ensureUsername(db, U, () => seq[n++ % seq.length])
    check("taken by a profile, a store slug and a renamed handle: the next free one", made === "jo-smith-56", made)
    check("written to the profile", db.tables.profiles[0].username === "jo-smith-56")
    check("a second call returns it and writes nothing", (await ensureUsername(db, U)) === "jo-smith-56" && db.writes.filter((w) => w.op === "update").length === 1)
    check("an existing handle is returned as it is", (await ensureUsername(db, W)) === "Keeper")
    check("not a uuid: null, nothing read", (await ensureUsername(db, "nope")) === null)
    check("taken in any case", (await handleAvailable(db, "KEEPER", U)) === false)
    check("your own handle is free for you", (await handleAvailable(db, "keeper", W)) === true)
    check("a reserved word is never available", (await handleAvailable(db, "admin", U)) === false)

    const write = read("lib/profile/ensure-username.ts")
    check("the write only fills an empty username", /\.is\("username", null\)/.test(stripComments(write)))
    check("a lost race tries the next candidate", /23505[\s\S]{0,80}continue/.test(write))

    const many = makeDb({ profiles: [{ id: U, username: null, display_name: "Zed Q", email: "z@q.io" }, { id: V, username: "vee", display_name: "V" }] }, { unique: { profiles: "username" } })
    const handles = await ensureUsernames(many, [U, V, "bad"])
    check("a list gets a handle for everybody in it", handles.get(U) === "zed-q" && handles.get(V) === "vee" && handles.size === 2, [...handles])
  }

  console.log("\nThe activity cursor")
  {
    const p: Position = { at: "2026-10-01T12:00:00.5+00:00", key: activityKey(42) }
    check("round trip", JSON.stringify(decodeCursor(encodeCursor(p))) === JSON.stringify(p))
    check("a tampered cursor is refused", decodeCursor("bm90IGEgY3Vyc29y") === null && decodeCursor(Buffer.from("2026-01-01|xx:1").toString("base64url")) === null && decodeCursor(42) === null)
    check("microseconds compare as Postgres orders them", sortableTime("2026-01-01T00:00:00.12+00:00") < sortableTime("2026-01-01T00:00:00.123+00:00") && sortableTime("2026-01-01T00:00:00+00:00") < sortableTime("2026-01-01T00:00:00.5+00:00"))
    check("activity keys sort as numbers do", activityKey(9) < activityKey(10))
    check("same instant: the key decides", newerThan({ at: "2026-01-01T00:00:00Z", key: "rv:b" }, { at: "2026-01-01T00:00:00Z", key: "pr:a" }) > 0)
    const after: Position = { at: "2026-01-01T00:00:00+00:00", key: "pr:5" }
    check("a table that sorts first at that instant: strictly older", afterFilter("rv", after, (k) => k.slice(3)).op === "lt")
    check("a table that sorts after: the same instant is still to come", afterFilter("ca", after, (k) => k.slice(3)).op === "lte")
    const same = afterFilter("pr", after, (k) => k.slice(3))
    check("the cursor's own table: (created_at, id) strictly after", same.op === "or" && /created_at\.lt\."2026[^"]+",and\(created_at\.eq\."2026[^"]+",id\.lt\.5\)/.test((same as { expr: string }).expr), same)

    const item = (at: string, key: string) => ({ at, key })
    const merged = mergePages(
      [
        { items: [item("2026-01-05T00:00:00Z", "ca:1"), item("2026-01-03T00:00:00Z", "ca:2")], horizon: { at: "2026-01-03T00:00:00Z", key: "ca:2" } },
        { items: [item("2026-01-04T00:00:00Z", "rv:1"), item("2026-01-01T00:00:00Z", "rv:2")], horizon: null },
      ],
      10,
    )
    check("past a full table's horizon nothing is shown yet", merged.items.map((i) => i.key).join() === "ca:1,rv:1,ca:2", merged.items)
    check("and the next page starts at that horizon", merged.next?.key === "ca:2")
    const capped = mergePages([{ items: [item("2026-01-05T00:00:00Z", "ca:1"), item("2026-01-04T00:00:00Z", "ca:2"), item("2026-01-03T00:00:00Z", "ca:3")], horizon: null }], 2)
    check("a page is at most the limit, the cursor at its last item", capped.items.length === 2 && capped.next?.key === "ca:2")
    const done = mergePages([{ items: [item("2026-01-05T00:00:00Z", "ca:1")], horizon: null }], 5)
    check("everything shown: no next page", done.next === null)
  }

  console.log("\nActivity: only what is public")
  {
    const t = (d: number) => `2026-09-${String(d).padStart(2, "0")}T10:00:00.${String(d).padStart(3, "0")}+00:00`
    const community = (id: string, over: Row = {}) => ({ id, slug: id, name: `${id} club`, logo_url: null, access: "free", status: "published", visibility: "public", platform_hidden: false, deleted_at: null, suspended_at: null, owner_user_id: null, ...over })
    const tables: Record<string, Row[]> = {
      communities: [
        community("free"),
        community("paid", { access: "paid" }),
        community("private", { visibility: "private" }),
        community("unlisted", { visibility: "unlisted" }),
        community("draft", { status: "draft" }),
        community("suspended", { suspended_at: t(1) }),
        community("hidden", { platform_hidden: true }),
      ],
      community_members: ["free", "paid", "private", "unlisted", "draft", "suspended", "hidden"].map((c) => ({ community_id: c, user_id: U })),
      community_spaces: [
        { id: "s-open", name: "General", view_access: {}, archived_at: null },
        { id: "s-tier", name: "Inner circle", view_access: { tierIds: ["t1"] }, archived_at: null },
        { id: "s-arch", name: "Old", view_access: {}, archived_at: t(2) },
        { id: "s-paid", name: "Lounge", view_access: {}, archived_at: null },
      ],
      community_feed_posts: [
        { id: "p-open", community_id: "free", space_id: "s-open", title: "Hello world", status: "published", deleted_at: null },
        { id: "p-tier", community_id: "free", space_id: "s-tier", title: "Members only", status: "published", deleted_at: null },
        { id: "p-arch", community_id: "free", space_id: "s-arch", title: "Archived", status: "published", deleted_at: null },
        { id: "p-removed", community_id: "free", space_id: "s-open", title: "Removed", status: "removed", deleted_at: null },
        { id: "p-paid", community_id: "paid", space_id: "s-paid", title: "Secret paid post", status: "published", deleted_at: null },
        { id: "p-private", community_id: "private", space_id: null, title: "Private post", status: "published", deleted_at: null },
      ],
      community_activity: [
        { id: 1, community_id: "free", user_id: U, kind: "joined", target_type: null, target_id: null, created_at: t(3) },
        { id: 2, community_id: "private", user_id: U, kind: "joined", target_type: null, target_id: null, created_at: t(4) },
        { id: 3, community_id: "unlisted", user_id: U, kind: "joined", target_type: null, target_id: null, created_at: t(5) },
        { id: 4, community_id: "free", user_id: U, kind: "post", target_type: "post", target_id: "p-open", created_at: t(6) },
        { id: 5, community_id: "free", user_id: U, kind: "post", target_type: "post", target_id: "p-tier", created_at: t(7) },
        { id: 6, community_id: "free", user_id: U, kind: "post", target_type: "post", target_id: "p-arch", created_at: t(8) },
        { id: 7, community_id: "free", user_id: U, kind: "post", target_type: "post", target_id: "p-removed", created_at: t(9) },
        { id: 8, community_id: "paid", user_id: U, kind: "post", target_type: "post", target_id: "p-paid", created_at: t(10) },
        { id: 9, community_id: "private", user_id: U, kind: "post", target_type: "post", target_id: "p-private", created_at: t(11) },
        { id: 10, community_id: "free", user_id: U, kind: "comment", target_type: "comment", target_id: "c1", created_at: t(12) },
        { id: 11, community_id: "free", user_id: U, kind: "reaction", target_type: "post", target_id: "p-open", created_at: t(13) },
        { id: 12, community_id: "free", user_id: U, kind: "course_completed", target_type: "course", target_id: "course-1", created_at: t(14) },
        { id: 13, community_id: "draft", user_id: U, kind: "joined", target_type: null, target_id: null, created_at: t(15) },
        { id: 14, community_id: "suspended", user_id: U, kind: "joined", target_type: null, target_id: null, created_at: t(16) },
        { id: 15, community_id: "hidden", user_id: U, kind: "joined", target_type: null, target_id: null, created_at: t(17) },
        { id: 16, community_id: "free", user_id: V, kind: "joined", target_type: null, target_id: null, created_at: t(18) },
      ],
      reviews: [
        { id: "r-1", buyer_id: U, status: "published", rating: 4, content: "Clear and useful.", product_id: "bought-1", created_at: t(19) },
        { id: "r-2", buyer_id: U, status: "hidden", rating: 1, content: "Hidden", product_id: "bought-1", created_at: t(20) },
      ],
      products: [
        { id: "course-1", title: "Intro course", slug: "intro", thumbnail_url: null, status: "published", creator_id: "other", community_id: null, created_at: t(1) },
        { id: "bought-1", title: "Brush pack", slug: "brushes", thumbnail_url: null, status: "published", creator_id: "other", community_id: null, created_at: t(1) },
        { id: "mine-1", title: "My template", slug: "tpl", thumbnail_url: null, status: "published", creator_id: "cr-u", community_id: null, created_at: t(21) },
        { id: "mine-2", title: "Draft thing", slug: "draft", thumbnail_url: null, status: "draft", creator_id: "cr-u", community_id: null, created_at: t(22) },
        { id: "mine-3", title: "Tier seller", slug: "tier", thumbnail_url: null, status: "published", creator_id: "cr-u", community_id: "free", created_at: t(23) },
      ],
    }
    const db = makeDb(tables)
    const page = await readProfileActivity(db, { userId: U, creatorId: "cr-u", storeHandle: "jo", communities: true, limit: 30 })
    const keys = page.items.map((i) => `${i.kind}:${i.title}`)
    check(
      "joined, a post in an open space, a course, a review, a product: nothing else",
      keys.join("|") === "published:My template|reviewed:Brush pack|completed_course:Intro course|posted_in:Lounge|posted:Hello world|joined:free club",
      keys,
    )
    check("no private, unlisted, draft, suspended or hidden community", !page.items.some((i) => /private|unlisted|draft|suspended|hidden/.test(`${i.title} ${i.context} ${i.href}`)))
    check("no restricted, archived or removed post", !keys.some((k) => /Members only|Archived|Removed/.test(k)))
    const paid = page.items.find((i) => i.kind === "posted_in")!
    check("a paid community's post says where, never what", paid.title === "Lounge" && paid.context === "paid club" && !JSON.stringify(paid).includes("Secret"))
    const open = page.items.find((i) => i.kind === "posted")!
    check("a free community's post shows its title and place", open.context === "General · free club" && open.href === "/community/free/post/p-open")
    check("a review carries its stars and words", page.items.some((i) => i.kind === "reviewed" && i.rating === 4 && i.excerpt === "Clear and useful."))
    check("someone else's activity is not theirs", !page.items.some((i) => i.at === t(18)))
    check("without a live store, no products", !(await readProfileActivity(db, { userId: U, creatorId: null, communities: true })).items.some((i) => i.kind === "published"))
    check("communities off: no community activity", !(await readProfileActivity(db, { userId: U, creatorId: null, communities: false })).items.some((i) => ["joined", "posted", "posted_in", "completed_course"].includes(i.kind)))

    /* Paged two at a time, the pages cover exactly the one long page. */
    const seen: ProfileActivityItem[] = []
    let after: Position | null = null
    for (let i = 0; i < 20; i++) {
      const pg = await readProfileActivity(db, { userId: U, creatorId: "cr-u", storeHandle: "jo", communities: true, limit: 2, after })
      seen.push(...pg.items)
      if (!pg.next) break
      after = decodeCursor(encodeCursor(pg.next))
    }
    check("keyset pages: every item once, in order", seen.map((i) => i.key).join() === page.items.map((i) => i.key).join(), seen.map((i) => i.key))

    const missing = makeDb({ reviews: [] }, { missing: ["community_activity", "community_members", "communities"] })
    const quiet = await readProfileActivity(missing, { userId: U, creatorId: null, communities: true })
    check("before the community tables exist: an empty page, not an error", quiet.items.length === 0 && quiet.next === null)
  }

  console.log("\nFollows: counts, the list, the notice")
  {
    const at = (m: number) => `2026-09-10T10:${String(m).padStart(2, "0")}:00+00:00`
    const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`)
    const db = makeDb({
      follows: [
        ...ids.map((id, i) => ({ id: `00000000-0000-4000-8000-00000000f0${String(i).padStart(2, "0")}`, follower_id: id, following_id: U, created_at: at(i) })),
        { id: "00000000-0000-4000-8000-00000000f099", follower_id: U, following_id: V, created_at: at(30) },
        { id: "00000000-0000-4000-8000-00000000f098", follower_id: V, following_id: ids[0], created_at: at(31) },
      ],
      profiles: [...ids.map((id, i) => ({ id, display_name: `Person ${i}`, username: i === 2 ? null : `p${i}`, avatar_url: null, email: `p${i}@x.io` })), { id: U, display_name: "U", username: "u" }, { id: V, display_name: "V", username: "v" }],
      creators: [{ user_id: ids[1], onboarding_completed: true }],
    })
    const counts = await followCounts(db, U)
    check("counts on both ends", counts.followers === 5 && counts.following === 1, counts)
    check("is following", (await isFollowing(db, U, V)) && !(await isFollowing(db, V, U)) && !(await isFollowing(db, U, U)))
    const first = await listFollows(db, { userId: U, list: "followers", viewerId: V, limit: 2 })
    check("newest follow first, two a page", first.people.map((p) => p.id).join() === [ids[4], ids[3]].join() && !!first.next, first.people.map((p) => p.id))
    const second = await listFollows(db, { userId: U, list: "followers", viewerId: V, limit: 2, cursor: first.next })
    const third = await listFollows(db, { userId: U, list: "followers", viewerId: V, limit: 2, cursor: second.next })
    const all = [...first.people, ...second.people, ...third.people].map((p) => p.id)
    check("pages cover everybody once", all.length === 5 && new Set(all).size === 5 && third.next === null, all)
    const p1 = [...second.people, ...third.people].find((p) => p.id === ids[1])!
    check("a live store links to /<handle>, others to /@handle", p1.href === "/p1" && first.people[0].href === "/@p4")
    const p2 = second.people.find((p) => p.id === ids[2])!
    check("somebody with no handle gets one on the way into the list", !!p2.username && p2.href === `/@${p2.username}`, p2)
    check("whether the viewer follows each", third.people.find((p) => p.id === ids[0])?.followedByViewer === true && p1.followedByViewer === false)
    check("a tampered follow cursor is ignored", decodeFollowCursor("x") === null && decodeFollowCursor(encodeFollowCursor(at(1), ids[0]))?.id === ids[0])
    const following = await listFollows(db, { userId: U, list: "following", viewerId: null })
    check("following lists who they follow", following.people.length === 1 && following.people[0].id === V)

    const inbox = makeDb({ profiles: [{ id: V, display_name: "Vera", username: "vera", avatar_url: "https://x/v.png" }], creators: [], user_notifications: [] }, { unique: { user_notifications: "dedupe_key" } })
    check("a new follower is told once", (await notifyNewFollower(inbox, { followerId: V, targetId: U })) === "sent")
    const row = inbox.tables.user_notifications[0]
    check("as new_follower, from following, linked to the follower", row.kind === "new_follower" && row.source === "following" && row.user_id === U && row.actor_id === V && row.url === "/@vera" && row.title === "Vera followed you" && row.dedupe_key === followDedupeKey(V, U), row)
    check("following again does not knock twice", (await notifyNewFollower(inbox, { followerId: V, targetId: U })) === "skipped" && inbox.tables.user_notifications.length === 1)
    check("nobody notifies themselves", (await notifyNewFollower(inbox, { followerId: U, targetId: U })) === "skipped")
    const errors: unknown[] = []
    const origError = console.error
    console.error = (...a: unknown[]) => void errors.push(a)
    const noTable = makeDb({ profiles: [], creators: [] }, { missing: ["user_notifications"] })
    const skipped = await notifyNewFollower(noTable, { followerId: V, targetId: U })
    console.error = origError
    check("before part 85: skipped silently", skipped === "skipped" && errors.length === 0, errors)
  }

  console.log("\nPrivacy")
  {
    check("only the two switches", JSON.stringify(privacyPatch({ showActivity: false, showCommunities: true, role: "admin" })) === JSON.stringify({ show_activity: false, show_communities: true }))
    check("nothing to change: null", privacyPatch({ showActivity: "no" }) === null && privacyPatch(null) === null)
    const missing = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42703" } }) }) }) }) }
    const p = await readPrivacy(missing, U)
    check("before part 85: both on, nowhere to save", p.showActivity && p.showCommunities && !p.supported)
    const off = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { show_activity: false, show_communities: null }, error: null }) }) }) }) }
    const q = await readPrivacy(off, U)
    check("a switch turned off is off; unset is on", !q.showActivity && q.showCommunities && q.supported)
  }

  console.log("\nThe way back")
  {
    check("from a community, Explore or search", cameFromBrowsing("/community/design") && cameFromBrowsing("/explore") && cameFromBrowsing("/explore/communities") && cameFromBrowsing("/search"))
    check("not from anywhere else", !cameFromBrowsing("/library") && !cameFromBrowsing("/communityx") && !cameFromBrowsing(null))
    check("the referer counts only on our own host", refererPath("https://storelib.com/community/x", "storelib.com") === "/community/x" && refererPath("https://evil.example/community/x", "storelib.com") === null)
    const bar = read("components/profile/profile-back-bar.tsx")
    check("history back with Explore as the fallback", /backThen\(\(\) => router\.push\(fallback\)\)/.test(bar) && /fallback = "\/explore"/.test(bar))
  }

  console.log("\nRoutes")
  {
    const follow = stripComments(read("app/api/follow/route.ts"))
    check("follow: the follower is the session's", /follower_id: user\.id/.test(follow) && !/follower_id: body/.test(follow))
    check("follow: no self follow", /target === user\.id/.test(follow))
    check("follow: rate limited before any write", follow.indexOf("rateLimit(") > 0 && follow.indexOf("rateLimit(") < follow.indexOf(".upsert("))
    check("follow: the notice after a follow, never after an unfollow", /afterFollow\(user\.id, target\)/.test(follow) && follow.indexOf("afterFollow(") < follow.indexOf(".delete()"))
    const list = stripComments(read("app/api/follow/list/route.ts"))
    check("list: validated, keyset paged", /isUuid\(userId\)/.test(list) && /listFollows\(/.test(list) && /followers.*following/.test(list))
    const uname = stripComments(read("app/api/profile/username/route.ts"))
    check("username: the session's own row, the shared rule, the shared meaning of taken", /currentUserForRequest/.test(uname) && /isValidUsername/.test(uname) && /handleAvailable/.test(uname) && /\.eq\("id", user\.id\)/.test(uname))
    check("username: a store's handle moves from /app Settings", /creator \|\| page/.test(uname) && /409/.test(uname))
    check("username: the old one still finds them", /username_history/.test(uname))
    check("username: rate limited", /rateLimit\(/.test(uname))
    const privacy = stripComments(read("app/api/profile/privacy/route.ts"))
    check("privacy: only the patch, only their row", /privacyPatch\(body\)/.test(privacy) && /\.eq\("id", user\.id\)/.test(privacy) && /rateLimit\(/.test(privacy))
    const act = stripComments(read("app/api/profile/activity/route.ts"))
    check("activity: through the one gate that reads the switch", /activityFor\(/.test(act))
    const gate = stripComments(read("lib/profile/activity-page.ts"))
    check("activity: hidden from everybody but themselves", /!show && !self/.test(gate))
    check("no route or reader selects every column", ![follow, list, uname, privacy, act].some((s) => /select\("\*"\)/.test(s)))
  }

  console.log("\nThe pages")
  {
    const page = read("components/profile/member-profile-page.tsx")
    const route = read("app/(marketing)/member/[username]/page.tsx")
    check("the member profile reads follows, not the old table", !/profile_follows/.test(read("lib/profile/member-profile-data.ts")) && !/profile_follows/.test(route))
    check("owner pills only on your own profile", /isSelf \? <ProfileOwnerPills/.test(page))
    const pills = read("components/profile/profile-owner-pills.tsx")
    check("the pills: Library, Courses, Communities, Edit profile, Settings", ["Library", "Courses", "Communities", "Edit profile", "Settings"].every((w) => pills.includes(`label: "${w}"`)))
    check("no selling UI on a buyer's profile", !/Start selling|Become a seller|Sell on Storelib|\/app\/onboarding/.test(page + pills))
    check("Products only with a live store", /profile\.hasStorefront && profile\.products\.length > 0/.test(page))
    check("memberships only when shown, or to themselves", /showCommunities \|\| isSelf/.test(page) && /showCommunities \|\| isSelf/.test(route))
    check("Message only where the server found a shared community", /messageTarget\(/.test(route) && /messageHref \?/.test(read("components/profile/profile-social.tsx")))
    const shared = stripComments(read("lib/profile/profile-communities.ts"))
    check("Message needs chat on, the directory open, both active and not banned", /chat_enabled", true/.test(shared) && /directory_enabled", true/.test(shared) && (shared.match(/is\("banned_at", null\)/g) ?? []).length === 2)
    check("listed communities are published, public, open, not hidden", /eq\("visibility", "public"\)/.test(shared) && /platform_hidden", false/.test(shared) && /is\("suspended_at", null\)/.test(shared))
    const creator = read("app/(marketing)/u/[username]/page.tsx")
    check("the creator page has the same follow block", /<ProfileSocial[\s\S]{0,80}tone="storefront"/.test(creator) && (creator.match(/followRow=\{buildFollowRow\(/g) ?? []).length === 2)
    check("the creator page has the back bar on both of its headers", (creator.match(/<ProfileBackBar /g) ?? []).length === 2)
    const header = read("components/store-builder/unified-section-renderer.tsx")
    check("the header does not print the follower count twice", /!followRow && \(settings\.showFollowers/.test(header))
    const settings = read("components/account/account-settings.tsx")
    check("settings: a username field with a live check", /data-account-username-field/.test(settings) && /\/api\/profile\/username\?handle=/.test(settings))
    check("settings: the two privacy switches", /Show my activity/.test(settings) && /Show communities I am in/.test(settings) && /\/api\/profile\/privacy/.test(settings))
    check("the account page makes a handle when there is none", /ensureUsername\(/.test(read("app/account/layout.tsx")) && /ensureUsername\(/.test(read("app/account/settings/page.tsx")))
  }

  console.log("\nNo client module reaches server code")
  {
    const clientFiles = [
      "components/profile/follow-button.tsx",
      "components/profile/follow-list-sheet.tsx",
      "components/profile/profile-social.tsx",
      "components/profile/profile-activity.tsx",
      "components/profile/profile-back-bar.tsx",
      "components/account/account-settings.tsx",
    ]
    const serverOnly = /from "(next\/headers|server-only|@\/lib\/supabase\/admin|@\/lib\/profile\/(ensure-username|follows|activity|activity-page|privacy|notify-follow|follow-effects|profile-communities|member-profile-data)|@\/lib\/communities\/server\/[^"]*|@\/lib\/admin-blog-auth)"/
    for (const f of clientFiles) {
      const src = read(f)
      check(`${f} is a client module that imports nothing server only`, /^"use client"/.test(src) && !serverOnly.test(src))
    }
    for (const f of ["lib/profile/ensure-username.ts", "lib/profile/follows.ts", "lib/profile/activity.ts", "lib/profile/privacy.ts", "lib/profile/notify-follow.ts", "lib/profile/follow-effects.ts", "lib/profile/profile-communities.ts", "lib/profile/activity-page.ts"]) {
      check(`${f} is server only`, /^import "server-only"/.test(read(f)))
    }
  }

  console.log("\nCopy")
  {
    const files = [
      "lib/profile/person-href.ts",
      "lib/profile/username-rules.ts",
      "lib/profile/ensure-username.ts",
      "lib/profile/activity-cursor.ts",
      "lib/profile/activity.ts",
      "lib/profile/activity-page.ts",
      "lib/profile/follows.ts",
      "lib/profile/notify-follow.ts",
      "lib/profile/follow-effects.ts",
      "lib/profile/privacy.ts",
      "lib/profile/profile-communities.ts",
      "lib/profile/back.ts",
      "components/profile/follow-button.tsx",
      "components/profile/follow-list-sheet.tsx",
      "components/profile/profile-social.tsx",
      "components/profile/profile-activity.tsx",
      "components/profile/profile-back-bar.tsx",
      "components/profile/profile-owner-pills.tsx",
      "components/profile/member-profile-page.tsx",
      "app/(marketing)/member/[username]/page.tsx",
      "app/api/follow/list/route.ts",
      "app/api/profile/username/route.ts",
      "app/api/profile/privacy/route.ts",
      "app/api/profile/activity/route.ts",
      "scripts/check-profile.mjs",
      "scripts/render-profile.tsx",
    ].filter((f) => existsSync(join(root, f)))
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
    for (const f of files) {
      const src = read(f)
      check(`${f}: no em dash, no banned word`, !src.includes("—") && !banned.test(src), src.match(banned)?.[0])
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
