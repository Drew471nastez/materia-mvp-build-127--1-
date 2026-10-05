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
import { followCounts, isFollowing } from "@/lib/profile/follows"
import { followDedupeKey, notifyNewFollower } from "@/lib/profile/notify-follow"
import { privacyPatch, readPrivacy } from "@/lib/profile/privacy"
import { cameFromBrowsing, cameFromElsewhere, refererPath } from "@/lib/profile/back"
import { sharedPostView, SHARED_PAGE, SHARED_COMMUNITIES_MAX } from "@/lib/profile/shared-view"
import { ownCoverUrl } from "@/lib/profile/cover"
import { schemeVars } from "@/components/profile/follow-button"
import { ownerPillFor, ownerPillLinks } from "@/lib/profile/owner-pills"
import { resolveStorefrontChrome, ringIsChoice, schemeAction } from "@/lib/store-builder/storefront-chrome"
import { avatarSizeMap } from "@/lib/store-builder/defaults"
import { PROFILE_AVATAR_PX } from "@/components/profile/profile-hero"
import { isValidUsername } from "@/lib/reserved-words"
import { NEW_PRODUCT_HREF, sectionsWithoutProducts, tabsWithoutProducts } from "@/components/storefront/no-products"

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
    let ignore = false
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
      /* ON CONFLICT DO NOTHING, as notifyUser asks: a conflict is no row back, not an error. */
      upsert(p: any, o?: { ignoreDuplicates?: boolean }) {
        op = "insert"
        payload = p
        ignore = !!o?.ignoreDuplicates
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
          if (key && rows.some((x) => x[key] === r[key])) {
            if (ignore) return { data: [], error: null }
            return { data: null, error: { code: "23505", message: "duplicate key" } }
          }
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

  console.log("\nFollows: counts and the notice (no list any more)")
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
    /* The owner asked for the followers / following dialog to go; the list it paged went with it. */
    const lib = read("lib/profile/follows.ts")
    check("the follow graph library no longer pages a list of people", !/export async function listFollows/.test(lib) && !/FollowCursor/.test(lib) && !/peopleViews/.test(lib))

    const inbox = makeDb({ profiles: [{ id: V, display_name: "Vera", username: "vera", avatar_url: "https://x/v.png" }], creators: [], user_notifications: [] }, { unique: { user_notifications: "dedupe_key" } })
    check("a new follower is told once", (await notifyNewFollower(inbox, { followerId: V, targetId: U })) === "sent")
    const row = inbox.tables.user_notifications[0]
    check("through the inbox's notifyUser", /notifyUser\(db, \{/.test(read("lib/profile/notify-follow.ts")))
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
    const bar = read("components/profile/profile-top-bar.tsx")
    check("history back with Explore as the fallback", /backThen\(\(\) => router\.push\(fallback\)\)/.test(bar) && /fallback = "\/explore"/.test(bar))
    /* "The back control lives in the top bar next to the person's avatar ... not as a pill under it." */
    check("the way back is a chevron in a top bar, never a pill", /export function TopBarBack/.test(bar) && /export function ProfileTopBar/.test(bar) && /aria-label="Back"/.test(bar) && !/>\s*Back\s*</.test(bar))
    /* Round 12: the slim bar is a person's page's own top bar too, drawn always; the chevron goes in front only when they came from somewhere. */
    check("  the slim bar puts it right before the person's photo and name", /\{shown \? <BackChevron fallback=\{fallback\} \/> : null\}\s*<AppAvatar/.test(bar) && /data-profile-top-bar-name/.test(bar))
    check("  only when arrived from somewhere: another page of ours, not this one, not sign in", /if \(!shown && !always\) return null/.test(bar) && /cameFromElsewhere\(from, window\.location\.pathname\)/.test(bar))
    check("arrived from another page: shown", cameFromElsewhere("/library", "/maya") && cameFromElsewhere("/community/x", ["/maya", "/u/maya"]) && cameFromElsewhere("/p/glaze", "/maya"))
    check("a reload of the same page, a sign in, nothing or another site: not shown", !cameFromElsewhere("/maya/", ["/maya", "/u/maya"]) && !cameFromElsewhere("/U/Maya?x=1", ["/maya", "/u/maya"]) && !cameFromElsewhere("/login", "/maya") && !cameFromElsewhere(null, "/maya") && !cameFromElsewhere("//evil.example/x", "/maya"))
    const creatorPage = read("app/(marketing)/u/[username]/page.tsx")
    check("  the creator page asks the same rule of the Referer, with every address it answers to", /cameFromElsewhere\(refererPath\(requestHeaders\.get\("referer"\), requestHeaders\.get\("host"\)\), ownPaths\)/.test(creatorPage) && /ownPaths\.push\("\/"\)/.test(creatorPage))
    check("  and so does a profile", /cameFromElsewhere\(refererPath\(head\.get\("referer"\), head\.get\("host"\)\), ownPaths\)/.test(read("app/(marketing)/member/[username]/page.tsx")))
    /* Round 9: "the back icon next to the avatar in the profile top bar is smooth and works on the first tap". */
    check("the chevron answers the press at once, set on the element without a React render: a tint, no shrink", /onPointerDown=\{\(e\) => \{[\s\S]{0,80}e\.currentTarget\.dataset\.pressed = ""/.test(bar) && /data-\[pressed\]:duration-0/.test(bar) && !/setPressed|scale-\[/.test(stripComments(bar)) && /touch-manipulation/.test(bar))
    check("  a double tap goes back once: the press after the first is ignored until the page shows again", /if \(leaving\.current\) return\s*leaving\.current = true/.test(bar) && /addEventListener\("pageshow", again\)/.test(bar) && /const LEAVING_MS = 1500/.test(bar))
    const sub = read("components/store-builder/subscribe-bar.tsx")
    check("  on a creator's newsletter bar it is the row's first thing, before the photo, at both widths", /\{leading\}\s*\{mobileAvatar\}/.test(sub) && /\{leading\}\s*\{desktopAvatar\}/.test(sub))
    /* 42.webp: on a phone the bar is ONE row: back (when there is one), photo, email, Subscribe. */
    const phoneRow = sub.slice(sub.indexOf('data-subscribe-row="phone"'), sub.indexOf("{/* DESKTOP */}"))
    check("on a phone the newsletter bar is one row: back, photo, email, Subscribe, never wrapping", /className="sm:hidden flex min-w-0 flex-nowrap items-center gap-2" data-subscribe-row="phone"/.test(sub) && /\{leading\}\s*\{mobileAvatar\}\s*<Input/.test(phoneRow) && /min-w-0 flex-1/.test(phoneRow) && /type="submit"/.test(phoneRow) && !/flex-col/.test(phoneRow))
    check("  the field is 16px so iOS does not zoom the page on a tap, and labelled by the bar's sentence", /text-\[16px\]/.test(phoneRow) && /aria-label=\{displayText \|\| "Your email"\}/.test(phoneRow))
    check("  Subscribed holds the same cell as Subscribe, so the done state is the same row", /col-start-1 row-start-1/.test(sub) && /\{buttonFace\}/.test(phoneRow))
  }

  console.log("\nRoutes")
  {
    const follow = stripComments(read("app/api/follow/route.ts"))
    check("follow: the follower is the session's", /follower_id: user\.id/.test(follow) && !/follower_id: body/.test(follow))
    check("follow: no self follow", /target === user\.id/.test(follow))
    check("follow: rate limited before any write", follow.indexOf("rateLimit(") > 0 && follow.indexOf("rateLimit(") < follow.indexOf(".upsert("))
    check("follow: the notice after a follow, never after an unfollow", /afterFollow\(followerId, target\)/.test(follow) && /const followerId = user\.id/.test(follow) && follow.indexOf("afterFollow(") < follow.indexOf(".delete()"))
    /* Round 7: "clicking Follow then quickly clicking again blocks for about 3 seconds". The handle and the notice no longer hold the answer back. */
    check("  and it runs after the answer has gone (after()), with no await on it inside a request", /import \{ after, type NextRequest, NextResponse \} from "next\/server"/.test(follow) && /after\(\(\) => afterFollow\(followerId, target\)\)/.test(follow) && (follow.match(/await afterFollow\(/g) ?? []).length === 1 && /catch \{\s*await afterFollow\(followerId, target\)/.test(follow))
    check("  nothing on the follow path refreshes or revalidates a page", !/revalidatePath|revalidateTag|router\.refresh/.test(follow) && !/router\.refresh|useRouter|startTransition|useTransition/.test(stripComments(read("components/profile/follow-button.tsx"))) && !/router\.refresh|useRouter/.test(stripComments(read("components/profile/profile-social.tsx"))))
    check("the followers / following list route is gone, nothing asks for it", !existsSync(join(root, "app/api/follow/list/route.ts")) && !/\/api\/follow\/list/.test(read("components/profile/profile-social.tsx")))
    const uname = stripComments(read("app/api/profile/username/route.ts"))
    check("username: the session's own row, the shared rule, the shared meaning of taken", /auth\.getUser\(\)/.test(uname) && /isValidUsername/.test(uname) && /handleAvailable/.test(uname) && /\.eq\("id", user\.id\)/.test(uname))
    check("username: a store's handle moves from /app Settings", /creator \|\| page/.test(uname) && /409/.test(uname))
    check("username: the old one still finds them", /username_history/.test(uname))
    check("username: rate limited", /rateLimit\(/.test(uname))
    const privacy = stripComments(read("app/api/profile/privacy/route.ts"))
    check("privacy: only the patch, only their row", /auth\.getUser\(\)/.test(privacy) && /privacyPatch\(body\)/.test(privacy) && /\.eq\("id", user\.id\)/.test(privacy) && /rateLimit\(/.test(privacy))
    const act = stripComments(read("app/api/profile/activity/route.ts"))
    check("activity: through the one gate that reads the switch", /activityFor\(/.test(act))
    const gate = stripComments(read("lib/profile/activity-page.ts"))
    check("activity: hidden from everybody but themselves", /!show && !self/.test(gate))
    check("no route or reader selects every column", ![follow, uname, privacy, act].some((s) => /select\("\*"\)/.test(s)))
  }

  console.log("\nThe pages")
  {
    const page = read("components/profile/member-profile-page.tsx")
    const route = read("app/(marketing)/member/[username]/page.tsx")
    check("the member profile reads follows, not the old table", !/profile_follows/.test(read("lib/profile/member-profile-data.ts")) && !/profile_follows/.test(route))
    /* Round 12: /@handle is the creator page's template; your own is it too, with Edit profile on the cover where a creator's sits. The pills are /account's. */
    check("owner pills only on /account; your own /@handle has Edit profile on the cover", !/ProfileOwnerPills/.test(page) && /ownerActions=\{isSelf \? <PersonOwnerActions \/> : null\}/.test(page) && /<ProfileOwnerPills\b/.test(read("components/account/account-hub.tsx")))
    const pills = read("lib/profile/owner-pills.ts") + read("components/profile/profile-owner-pills.tsx")
    /* Round 5: Edit profile is a button on the cover (components/profile/profile-hero.tsx), not a pill. */
    check("the pills: Activity, Communities, Library, Settings; Edit profile on the cover instead", ["Activity", "Communities", "Library", "Settings"].every((w) => pills.includes(`label: "${w}"`)) && !pills.includes(`label: "Edit profile"`) && /Edit profile/.test(read("components/profile/profile-hero.tsx")))
    check("no selling UI on a buyer's profile", !/Start selling|Become a seller|Sell on Storelib|\/app\/onboarding/.test(page + pills))
    /* Round 12: a person without a store sells nothing; a creator's /@handle is their creator page (a 308), which has the products. */
    check("Products only with a live store: never on a person's page", !/label: "Products"|ProductGrid/.test(page) && /permanentRedirect\(target\)/.test(read("app/(marketing)/member/[username]/layout.tsx")))
    check("memberships only when shown, or to themselves", /showCommunities \|\| isSelf/.test(page) && /showCommunities \|\| isSelf/.test(route))
    /* Round 9: "Remove the Message button on profiles and creator pages for now: only Follow." */
    const socialSrc = read("components/profile/profile-social.tsx")
    check("no Message on a profile or a creator page, and nothing looks for one", !/messageTarget\(|messageHref/.test(route) && !/messageHref|>\s*Message\s*<|MessageCircle/.test(socialSrc) && !/messageHref/.test(read("components/profile/profile-hero.tsx") + read("components/profile/member-profile-page.tsx")) && !/messageTarget|messageHref=/.test(read("app/(marketing)/u/[username]/page.tsx")))
    const shared = stripComments(read("lib/profile/profile-communities.ts"))
    check("Message needs chat on, the directory open, both active and not banned", /chat_enabled", true/.test(shared) && /directory_enabled", true/.test(shared) && (shared.match(/is\("banned_at", null\)/g) ?? []).length === 2)
    check("listed communities are published, public, open, not hidden", /eq\("visibility", "public"\)/.test(shared) && /platform_hidden", false/.test(shared) && /is\("suspended_at", null\)/.test(shared))
    const creator = read("app/(marketing)/u/[username]/page.tsx")
    check("the creator page has the same follow block", /<ProfileSocial[\s\S]{0,80}tone="storefront"/.test(creator) && (creator.match(/followRow=\{buildFollowRow\(/g) ?? []).length === 2)
    check("the creator page has the way back on both of its headers: in the newsletter bar, else a slim top bar", (creator.match(/leading=\{!embedded \? <TopBarBack initiallyShown=\{backShown\} \/> : undefined\}/g) ?? []).length === 3 && (creator.match(/<ProfileTopBar\b/g) ?? []).length === 2 && !/ProfileBackBar/.test(creator))
    check("Follow on the creator page is drawn in the scheme's own button colours", /buildFollowRow\(headerSettings, chrome\.action\)/.test(creator) && /scheme=\{scheme \?\? null\}/.test(creator) && /action: schemeAction\(\{/.test(read("lib/store-builder/storefront-chrome.ts")))
    /* Round 5: "Creator pages (creators with a store): NO Activity tab; the Communities tab lists ONLY communities they created (not ones they joined); none -> the No communities yet panel as before." */
    const creatorCode = stripComments(creator)
    check("the creator page has no Activity tab, and reads no activity or joined communities for one", !/id: "activity"/.test(creatorCode) && !/personalActivityPanel|activityFor\(|profileCommunities\(|includeMemberships|<ProfileActivity|<SharedCommunityPosts/.test(creatorCode))
    check("  its Communities tab is the communities they made, on both of the page's branches", /* Round 9: without products the page asks tabsWithoutProducts, which takes the same panel. */ (creatorCode.match(/const communitiesPanel = (noProducts \? null : )?creatorCommunitiesPanel\(communityCards\)\s+if \(communitiesPanel\) \{\s+tabs\.push\(\{\s+id: "communities",\s+label: "Communities",\s+panel: communitiesPanel,/g) ?? []).length === 2 && (creatorCode.match(/communitiesPanel: creatorCommunitiesPanel\(communityCards\), communities: communityCards/g) ?? []).length === 2 && /on \? creatorCommunityCards\(creator\.id\) : null/.test(creatorCode))
    const tabSrc = stripComments(read("components/profile/creator-communities-tab.tsx"))
    check("  none made yet: the tab says No communities yet; switched off: no tab", /if \(cards === null\) return null/.test(tabSrc) && /if \(!cards\.length\) return <EmptyTabPanel icon="communities" title="No communities yet" detail="This creator hasn't opened any yet\." \/>/.test(tabSrc) && /<StorefrontCommunities cards=\{cards\}>/.test(tabSrc))
    check("  a plain profile (/@handle) keeps its Activity tab and the communities they are in", /id: "activity", label: "Activity"/.test(page) && /<ProfileCommunityList owned=\{communities\.owned\} member=\{memberCards\} \/>/.test(page))
    /* Round 6: "In creator pages or creator profiles there should be no activity." Their /@handle and their own /account too. */
    const pageCode = stripComments(page)
    /* Round 12: a creator's /@handle never draws this page (the layout's 308 to their creator page), so it holds no creator branch. */
    check("a creator's /@handle (a live store) is their creator page, so this page has no creator branch", !/hasStorefront/.test(pageCode) && /hasActiveStorefront\(creator\)/.test(read("app/(marketing)/member/[username]/layout.tsx")))
    check("  their own creator page has the owner's controls (Edit profile, the menu), not pills", /<EditProfileButton\b/.test(creator) && /<OwnerMenu embedded=\{embedded\} \/>/.test(creator))
    const routeCode = stripComments(route)
    check("  the route reads no activity, no shared posts and no memberships for them", /const creator = profile\.hasStorefront/.test(routeCode) && /creator\s*\?\s*Promise\.resolve\(\{ items: \[\], next: null, hidden: false \}\)\s*:\s*activityFor\(/.test(routeCode) && /includeMemberships: !creator && /.test(routeCode) && /* Round 13 (ask 30): the person's own profile lists their own contributions too. */ /viewerId && !creator \? sharedSections\(/.test(routeCode))
    check("  and the activity gate answers nothing for anybody with a store, so Show more or the API cannot bring it back", /if \(creator\) return \{ items: \[\], next: null, hidden: false \}/.test(stripComments(read("lib/profile/activity-page.ts"))))
    check("a creator's pills: Communities (which is /account), Library, Settings; no Activity", ownerPillLinks(true, true).map((p) => `${p.label} ${p.href}`).join() === "Communities /account,Library /account/library,Settings /account/settings?section=account" && ownerPillLinks(false, true).map((p) => p.key).join() === "library,settings" && ownerPillFor("/account", true) === "communities" && ownerPillFor("/account") === "activity" && ownerPillLinks(true).map((p) => p.key).join() === "activity,communities,library,settings")
    const account = stripComments(read("app/account/page.tsx"))
    check("  /account for a creator opens on their Communities, never their activity", /const creator = await accountIsCreator\(user\.id\)/.test(account) && /\{creator \? creatorBody\(user\) : activityBody\(user\)\}/.test(account) && /return accountCommunitiesBody\(user\.id\)/.test(account) && !/ProfileActivity/.test(account.slice(account.indexOf("async function creatorBody"), account.indexOf("export default"))))
    check("  the layout tells the pills who is a creator, by the creator page's own test", /accountIsCreator\(user\.id\)/.test(read("app/account/layout.tsx")) && /creator,\n/.test(read("app/account/layout.tsx")) && /creator=\{!!identity\.creator\}/.test(read("components/account/account-hub.tsx")) && /hasActiveStorefront\(await loadCreatorForUser\(userId\)\)/.test(read("lib/profile/account-creator.ts")) && /^import "server-only"/.test(read("lib/profile/account-creator.ts")))
    const header = read("components/store-builder/unified-section-renderer.tsx")
    check("the header does not print the follower count twice", /!followRow && \(settings\.showFollowers/.test(header))
    /* Round 4: sales only in About, beside Joined and Products, above the payment methods. */
    const headerFn = header.slice(header.indexOf("export function UnifiedShopHeader("), header.indexOf("// ====== PRODUCT PAGE CONTENT"))
    check("no sales count anywhere in the hero", !/sales<|\} sales|ShoppingBag|totalSales/.test(stripComments(headerFn)))
    const about = header.slice(header.indexOf("Stats - Sales and Joined"), header.indexOf("Accepted Payment Methods Section"))
    check("  sales sit in About with Joined and Products, above the payment methods", /Sales/.test(about) && /Joined/.test(about) && /Products/.test(about) && header.indexOf("Stats - Sales and Joined") < header.indexOf("Accepted payment methods"))
    check("  and the creator's Sales count switch decides the About figure", /sellerTotalSales=\{salesShown \? totalSales : 0\}/.test(creator) && /const salesShown = \(headerSettings\?\.showTotalSalesBadge \?\? true\) && \(creator\.show_total_sales_badge \?\? true\)/.test(creator))
    check("the creator photo is five percent bigger: 158 and 124", avatarSizeMap.medium === 158 && avatarSizeMap.large === 158 && avatarSizeMap.small === 124)
    check("  and so is every profile's (118 / 134 from 112 / 128, then 125 / 142 in round 11), /account sharing the same class", PROFILE_AVATAR_PX.phone === 125 && PROFILE_AVATAR_PX.wide === 142 && /className=\{PROFILE_AVATAR_CLASS\}/.test(read("components/account/account-hub.tsx")) && /className=\{PROFILE_AVATAR_CLASS\}/.test(read("components/profile/profile-hero.tsx")))
    for (const key of ["default", "sage", "astrid"] as const) {
      const c = resolveStorefrontChrome(key)
      check(`the ring is the page's own background (${key})`, c.avatarBorder === c.pageBackground)
    }
    check("  a ring written for the creator is not a choice; one they picked is kept", resolveStorefrontChrome("astrid", { avatarBorder: "#e5e7eb" }).avatarBorder === resolveStorefrontChrome("astrid").pageBackground && resolveStorefrontChrome("astrid", { avatarBorder: "#404040" }).avatarBorder === resolveStorefrontChrome("astrid").pageBackground && resolveStorefrontChrome("sage", { avatarBorder: "#ff0066" }).avatarBorder === "#ff0066" && !ringIsChoice("#FFFFFF") && ringIsChoice("#ff0066"))
    const social = read("components/profile/profile-social.tsx")
    check("followers and following are one quiet line of text, no buttons, no dialog", /data-profile-counts=""/.test(social) && !/onClick=\{\(\) => setOpen/.test(social) && !/FollowListSheet|SheetDialog|role="dialog"/.test(social) && !existsSync(join(root, "components/profile/follow-list-sheet.tsx")) && /·/.test(social))
    const settings = read("components/account/account-settings.tsx")
    check("settings: a username field with a live check", /data-account-username-field/.test(settings) && /\/api\/profile\/username\?handle=/.test(settings))
    check("settings: the two privacy switches", /Show my activity/.test(settings) && /Show communities I am in/.test(settings) && /\/api\/profile\/privacy/.test(settings))
    /* Round 6 follow up: a creator shows no activity anywhere, so has no switch for it; Show communities I am in still drives their card in a community (lib/communities/server/people.ts). */
    check("  a creator's Privacy has no activity switch, and keeps the communities one", /\{creator \? null : \(\s*<PrivacyRow\s+id="show-activity"/.test(settings) && /<PrivacyRow\s+id="show-communities"/.test(settings) && /creator=\{creator\}/.test(read("app/account/settings/page.tsx")) && /accountIsCreator\(user\.id\)/.test(read("app/account/settings/page.tsx")) && /communityFacts\(db, targetId, viewer\.userId, extras\.showCommunities\)/.test(read("lib/communities/server/people.ts")))
    check("  the scheme has no Unfollow red any more", !/danger/.test(stripComments(read("components/profile/follow-button.tsx"))) && !/danger:/.test(stripComments(read("lib/store-builder/storefront-chrome.ts"))))
    check("the account page makes a handle when there is none", /ensureUsername\(/.test(read("app/account/layout.tsx")) && /ensureUsername\(/.test(read("app/account/settings/page.tsx")))
  }

  console.log("\nNo client module reaches server code")
  {
    const clientFiles = [
      "components/profile/follow-button.tsx",
      "components/profile/profile-social.tsx",
      "components/profile/profile-activity.tsx",
      "components/profile/profile-top-bar.tsx",
      "components/profile/shared-community-posts.tsx",
      "components/profile/profile-owner-pills.tsx",
      "components/account/account-settings.tsx",
      "components/account/push-switch-row.tsx",
      "components/account/cover-field.tsx",
      "components/account/account-hub.tsx",
    ]
    const serverOnly = /from "(next\/headers|server-only|@\/lib\/supabase\/admin|@\/lib\/profile\/(ensure-username|follows|activity|activity-page|privacy|notify-follow|follow-effects|profile-communities|member-profile-data|shared-posts)|@\/lib\/communities\/server\/[^"]*|@\/lib\/admin-blog-auth)"/
    for (const f of clientFiles) {
      const src = read(f)
      check(`${f} is a client module that imports nothing server only`, /^"use client"/.test(src) && !serverOnly.test(src))
    }
    for (const f of ["lib/profile/shared-posts.ts", "lib/profile/ensure-username.ts", "lib/profile/follows.ts", "lib/profile/activity.ts", "lib/profile/privacy.ts", "lib/profile/notify-follow.ts", "lib/profile/follow-effects.ts", "lib/profile/profile-communities.ts", "lib/profile/activity-page.ts"]) {
      check(`${f} is server only`, /^import "server-only"/.test(read(f)))
    }
  }

  console.log("\nIn <community>: their posts where you both are")
  {
    check("six to a page, at most three communities", SHARED_PAGE === 6 && SHARED_COMMUNITIES_MAX === 3)
    const v = sharedPostView({ id: "p1", title: "  Cone 6  ", body_text: "Thinned  it\nwith water", space_id: "s1", created_at: "2026-10-01T00:00:00Z", reaction_count: 3, comment_count: null, media: [{ type: "link", url: "x" }, { type: "image", url: "https://a.supabase.co/i.png" }] }, { slug: "clay" }, (id) => (id === "s1" ? "General" : null))
    check("a titled post: its title, its words short, its space, its first picture, a link into the community", v.title === "Cone 6" && v.excerpt === "Thinned it with water" && v.space === "General" && v.imageUrl === "https://a.supabase.co/i.png" && v.href === "/community/clay/post/p1" && v.reactions === 3 && v.comments === 0, v)
    const u = sharedPostView({ id: "p2", title: null, body_text: "x".repeat(300), space_id: null, created_at: "2026-10-01T00:00:00Z", reaction_count: -2, comment_count: 4 }, { slug: "clay" }, () => null)
    check("an untitled post leads with its words, clipped, and no second copy of them", u.title.length === 140 && u.excerpt === null && u.space === null && u.reactions === 0, u)
    const src = stripComments(read("lib/profile/shared-posts.ts"))
    check("the viewer passes the community's own gate first", /requireMember\(db, input\.communityId, input\.viewerId, "view"\)/.test(src) && src.indexOf("requireMember(") < src.indexOf('from("community_feed_posts")'))
    check("only spaces the viewer may read, never chat, archived ones left out by listSpaces", /listSpaces\(db, community\.id\)/.test(src) && /s\.kind !== "chat" && canSeeSpace\(s, access\)/.test(src) && /space_id\.is\.null,space_id\.in\./.test(src))
    check("only their published, undeleted posts in that community, newest first, keyset paged", /\.eq\("author_id", input\.targetId\)/.test(src) && /\.eq\("status", "published"\)/.test(src) && /\.is\("deleted_at", null\)/.test(src) && /keysetCondition\("latest", cursor\)/.test(src) && /limit\(SHARED_PAGE \+ 1\)/.test(src))
    check("both must be active, unbanned members; the community published and open", (src.match(/is\("banned_at", null\)/g) ?? []).length === 2 && /status !== "active" \|\| theirs\[0\]\.banned_at/.test(src) && /eq\("status", "published"\)\.is\("deleted_at", null\)\.is\("suspended_at", null\)/.test(src))
    const route = stripComments(read("app/api/profile/shared-posts/route.ts"))
    check("the route: communities switch first, the session's viewer, 404 when they may not look", route.indexOf("requireCommunitiesOn()") < route.indexOf("auth.getUser()") && /status: 401/.test(route) && /not_found/.test(route))
    const page = read("components/profile/member-profile-page.tsx")
    check("the profile draws a section per shared community above the activity", /<SharedCommunityPosts key=\{s\.community\.id\}/.test(page) && /lead=\{/.test(page))
    const view = read("components/profile/shared-community-posts.tsx")
    check("Newer and Older, the pages already seen kept, the list holding its height while one comes", /data-shared-newer/.test(view) && /data-shared-older/.test(view) && /if \(pages\[at \+ 1\]\) return show\(at \+ 1\)/.test(view) && /minHeight: hold/.test(view))
    check("Message opens the conversation in place: the community's ?dm= link, never a member page", /\?dm=\$\{targetId\}/.test(read("lib/profile/profile-communities.ts")) && !/members\/\$\{targetId\}/.test(read("lib/profile/profile-communities.ts")))
  }

  console.log("\nFollow, drawn better and in the page's colours")
  {
    const btn = read("components/profile/follow-button.tsx")
    /* Round 6: "Remove the hover Unfollow state entirely ... Clicking Following switches straight back to Follow." */
    check("Following carries a check; both labels share one cell so the width holds", /data-follow-check=""/.test(btn) && /data-follow-label="follow"/.test(btn) && /data-follow-label="following"/.test(btn) && /col-start-1 row-start-1/.test(btn))
    check("no Unfollow anywhere: no label, no hover swap, no red", !/Unfollow/.test(stripComments(btn)) && !/data-follow-label="unfollow"/.test(btn) && !/group-hover\/follow:(visible|invisible)/.test(btn) && !/--sq-danger|#b42318|setFresh|unfollowable/.test(stripComments(btn)))
    check("a pointer over Following only shades it", /group-hover\/follow:bg-\[#f7f7f8\]/.test(btn) && /group-hover\/follow:bg-\[var\(--sq-hover/.test(btn))
    check("the press shows on pointerdown, set on the element without a React render, let go on up, cancel and leave", /onPointerDown=\{\(e\) => \{[\s\S]{0,160}e\.currentTarget\.dataset\.pressed = ""/.test(btn) && /onPointerUp=\{release\}/.test(btn) && /onPointerCancel=\{release\}/.test(btn) && /onPointerLeave=\{release\}/.test(btn) && /group-data-\[pressed\]\/follow:bg-/.test(btn))
    /* Round 9: "Follow/Following: no bump (no scale/bounce/size change, no width jump between the two words)". */
    check("no bump: nothing in the button scales, springs or changes size; the press is a shade", !/scale|cubic-bezier\(0\.34,1\.56/.test(stripComments(btn)) && /const FACE_BOX = "relative grid w-full place-items-center rounded-\[inherit\] px-5"/.test(btn))
    /* Round 11: "smoother, cleaner, more satisfying (keep instant and fixed size; a soft crossfade with a gentle colour settle, maybe a tiny check that draws itself on Following; no bump)". */
    check("the switch is a soft crossfade of opacity only (220ms), started a frame in, off under reduced motion", /const SWAP = "transition-opacity duration-\[220ms\] \[transition-delay:-24ms\]/.test(btn) && /transition-\[opacity,visibility\] duration-\[220ms\]/.test(btn) && /motion-reduce:transition-none/.test(btn))
    check("  the arriving face settles: a layer a shade off its colour eases away, opacity only, put back only once its face is gone", /data-follow-settle="follow"/.test(btn) && /data-follow-settle="following"/.test(btn) && /const SETTLING = "opacity-0 transition-opacity duration-\[420ms\]/.test(btn) && /const UNSETTLED = "opacity-100 transition-opacity duration-0 delay-\[240ms\]"/.test(btn) && /following \? SETTLING : UNSETTLED/.test(btn) && /following \? UNSETTLED : SETTLING/.test(btn))
    check("  the check draws itself on Following (one stroke, pathLength 1) and is rubbed out only after the label has faded", /pathLength=\{1\}/.test(btn) && /strokeDashoffset: following \? 0 : 1/.test(btn) && /stroke-dashoffset_300ms/.test(btn) && /stroke-dashoffset_0s_linear_240ms/.test(btn) && /motion-reduce:\[transition:none\]/.test(btn))
    check("a finger: no double tap zoom, 40px, the native shell's press dim kept off", /touch-manipulation/.test(btn) && /h-10 min-w-\[128px\]/.test(btn) && /opacity: 1 \}/.test(btn))
    check("optimistic, and put back to what the server has when it refuses", /setFollowing\(next\)[\s\S]{0,80}input\.onChange\?\.\(next\)/.test(btn) && /setFollowing\(server\.current\)/.test(btn) && /live\.current\.onChange\?\.\(server\.current\)/.test(btn))
    check("taps settle to the last one: debounced, one request in flight, nothing sent when it ends where it began", /export const DEBOUNCE_MS = 300/.test(btn) && /if \(flying\.current \|\| wanted\.current === server\.current\) return/.test(btn) && /if \(wanted\.current !== server\.current && !timer\.current\) void send\(\)/.test(btn) && /keepalive: leaving/.test(btn) && /addEventListener\("pagehide", flush\)/.test(btn) && /void send\(true\)/.test(btn))
    /* Round 7: "on mobile, clicking Follow then quickly clicking again blocks for about 3 seconds". */
    const hook = stripComments(btn.slice(btn.indexOf("export function useFollow"), btn.indexOf("export function schemeVars")))
    const press = hook.slice(hook.indexOf("const toggle = () => {"), hook.indexOf("return { following, busy, error, toggle }"))
    check("a press never waits on the network: no busy guard, no await, no disabled button", !/if \(busy\) return|if \(flying\.current\) return/.test(press) && !/await /.test(press) && /setFollowing\(next\)/.test(press) && !/disabled=/.test(stripComments(btn)))
    check("a request that fails on the way is tried once more; a no from the server, or the second failure, puts it back", /export const RETRY_MS = 600/.test(btn) && /for \(let attempt = 0; attempt < 2; attempt\+\+\)/.test(hook) && /refused = res\.status < 500/.test(hook) && /if \(refused \|\| attempt === 1 \|\| leaving\) break/.test(hook) && /if \(failure && wanted\.current !== server\.current\)/.test(hook))
    const card = stripComments(read("components/community/member/person-card.tsx"))
    check("the community's person card uses the same hook: no disabled Follow while a request is out, no hover Unfollow", /useFollow\(\{/.test(card) && !/disabled=\{busy\}/.test(card) && !/Unfollow/.test(card) && !/api<\{ following: boolean \}>\("\/api\/follow"/.test(card))
    const sage = resolveStorefrontChrome("sage").action
    const sageVars = schemeVars(sage) as Record<string, string>
    check("a scheme's Follow is its buy button colour and text, as variables the button reads", sage.background === "#2F5D46" && sageVars["--sf-bg"] === "#2F5D46" && sageVars["--sf-ink"] === sage.text && !!sageVars["--sf-hover"] && !!sageVars["--sf-press"])
    check("  in Storelib's primary shape: light on top, a darker foot, flat when pressed", /bg-\[var\(--sf-bg\)\]/.test(btn) && /inset_0_1px_0_rgba\(255,255,255,0\.16\),inset_0_-1px_0_rgba\(0,0,0,0\.3\)/.test(btn) && /group-data-\[pressed\]\/follow:bg-\[var\(--sf-press\)\]/.test(btn))
    check("  Following is the quiet secondary in the scheme's surface, hairline and ink", /bg-\[var\(--sq-bg/.test(btn) && /border-\[var\(--sq-line/.test(btn) && !!sageVars["--sq-bg"] && !!sageVars["--sq-line"] && !/schemeQuiet|schemePrimary/.test(btn))
    const astrid = resolveStorefrontChrome("astrid")
    check("  on a dark scheme the quiet surface is a step lighter than the page, never white", astrid.dark && astrid.action.dark && astrid.action.quiet.background.toLowerCase() !== "#ffffff" && astrid.action.quiet.background.toLowerCase() !== astrid.pageBackground.toLowerCase())
    const sunk = schemeAction({ background: "#111113", text: "#ffffff", radius: 8, page: "#111113", ink: "#fafafa" })
    check("  a buy colour that vanishes into the page gives way to the page's ink", sunk.background === "#fafafa" && sunk.text === "#111113")
    check("plain profiles keep Storelib's own pair (primaryDepth and secondaryDepth, as faces)", /bg-\[#1a1a2e\] shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.14\),inset_0_-1px_0_rgba\(0,0,0,0\.35\)/.test(btn) && /border-\[#d9dbe0\] bg-white shadow-\[inset_0_-1px_0_rgba\(0,0,0,0\.08\)/.test(btn))
  }

  /* Round 9: "Creator pages with no products: today an ugly empty space ... for the owner viewing their own page, a quiet prompt to add a first product", every scheme. */
  console.log("\nA creator page with no products")
  {
    const secs = [{ type: "featured-products" }, { type: "text-block" }, { type: "more-from-seller" }, { type: "community" }]
    check("without products the sections that only show products are left out; with them, nothing is", sectionsWithoutProducts(secs, 0).map((x) => x.type).join() === "text-block,community" && sectionsWithoutProducts(secs, 3).length === 4)
    const cards = [{ id: "c1" }] as never[]
    const withHome = tabsWithoutProducts({ home: "home", communitiesPanel: "panel", communities: cards })
    const bare = tabsWithoutProducts({ home: null, communitiesPanel: "panel", communities: cards })
    const none = tabsWithoutProducts({ home: null, communitiesPanel: "No communities yet", communities: [] })
    const off = tabsWithoutProducts({ home: null, communitiesPanel: null, communities: null })
    check("Home is a tab only when something is left in it", withHome.map((t) => t.id).join() === "home,communities" && bare.map((t) => t.id).join() === "communities")
    check("  nothing in Home: the communities stand alone (one panel, no strip); none made, or switched off: nothing at all", bare.length === 1 && none.length === 0 && off.length === 0)
    const np = read("components/storefront/no-products.tsx")
    check("the owner's line: what is true and the one button, to the new product page, in the scheme's tokens and buy colour", NEW_PRODUCT_HREF === "/app/products/new" && /No products on your page yet/.test(np) && />\s*Add a product\s*</.test(np) && /bg-card/.test(np) && /border-border/.test(np) && /bg-\[var\(--sf-bg,var\(--foreground\)\)\]/.test(np) && !/^"use client"/m.test(np) && !/^import \{[^}]*\} from "@\/components\/profile\/follow-button"/m.test(np))
    const creator = read("app/(marketing)/u/[username]/page.tsx")
    check("the creator page uses it on both branches, the line for the owner only, never in the editor's frame", (creator.match(/tabsWithoutProducts\(/g) ?? []).length === 2 && /noProducts && viewerIsOwner && !embedded \? <FirstProductPrompt scheme=\{chrome\.action\} \/>/.test(creator) && /viewerIsOwner && !embedded \? <FirstProductPrompt \/>/.test(creator) && /drawableSections\(/.test(creator))
    check("  no Home tab over nothing on a page never arranged", !/panel: productsData\.length > 0 \? \(/.test(creator))
  }

  /* Round 9: "Opening a user profile page and going back feels smooth (the page lands cleanly, no jump, the avatar/cover appear without popping)". */
  console.log("\nOpening a profile")
  {
    const skeleton = read("app/(marketing)/member/[username]/loading.tsx")
    /* Round 12: the top bar is always there now, so the skeleton holds it: 56px and its hairline. */
    check("the skeleton holds the top bar's 57px, so the profile lands where it stood", /border-b border-black\/\[0\.06\][^"]*"[\s\S]{0,80}<div className="h-14" \/>/.test(skeleton) && /"mx-auto flex h-14 w-full items-center/.test(read("components/profile/profile-top-bar.tsx")) && /border-b border-black\/\[0\.06\]/.test(read("components/profile/profile-top-bar.tsx")))
    const cover = read("components/profile/profile-cover-image.tsx")
    check("the cover fades in once loaded when opened in the app, is there at once when already loaded or drawn on the server", /"use client"/.test(cover) && /useSyncExternalStore\(never, \(\) => false, \(\) => true\)/.test(cover) && /img\.current\?\.complete/.test(cover) && /transition-opacity duration-200/.test(cover) && /<ProfileCoverImage /.test(read("components/profile/profile-hero.tsx")))
  }

  console.log("\nA cover of your own")
  {
    const host = "abc.supabase.co"
    const me = "00000000-0000-4000-8000-0000000000a1"
    check("your own upload in covers is accepted, its query dropped", ownCoverUrl(`https://${host}/storage/v1/object/public/covers/${me}/1.webp?x=1`, me, host) === `https://${host}/storage/v1/object/public/covers/${me}/1.webp`)
    check("somebody else's folder is refused", ownCoverUrl(`https://${host}/storage/v1/object/public/covers/someone/1.webp`, me, host) === null)
    check("another bucket, another host, http, credentials or a climb are refused", [
      `https://${host}/storage/v1/object/public/avatars/${me}/1.webp`,
      `https://evil.example/storage/v1/object/public/covers/${me}/1.webp`,
      `http://${host}/storage/v1/object/public/covers/${me}/1.webp`,
      `https://u:p@${host}/storage/v1/object/public/covers/${me}/1.webp`,
      `https://${host}/storage/v1/object/public/covers/${me}/../x/1.webp`,
      `https://${host}/storage/v1/object/public/covers/${me}/`,
      "javascript:alert(1)",
    ].every((u) => ownCoverUrl(u, me, host) === null))
    const route = stripComments(read("app/api/profile/cover/route.ts"))
    check("the route: the session's own row, checked address, rate limited, 503 before the column exists", /auth\.getUser\(\)/.test(route) && /\.eq\("id", user\.id\)/.test(route) && /ownCoverUrl\(body\.coverUrl, user\.id/.test(route) && /rateLimit\(/.test(route) && /status: 503/.test(route))
    /* Round 8: the creator editor's own control, its frame the repositioner (drag, pinch, Reset), not only its upload box. */
    check("Settings uses the creator cover's own control (bucket covers, the frame that repositions)", /<ImageUpload\s+bucket="covers"\s+aspectRatio="cover"/.test(read("components/account/cover-field.tsx")) && /reposition=\{reposition\}/.test(read("components/account/cover-field.tsx")))
    check("visitors see it: the page reads it with the service role", /select\("cover_url"\)/.test(read("lib/profile/member-profile-data.ts")) && /coverUrl: cover \|\| creatorRow\?\.cover_url/.test(read("lib/profile/member-profile-data.ts")))
    /* Round 8: "Remove the camera icon button next to Edit profile on the profile cover." Edit profile alone, only on your own band; the cover is changed in Settings. */
    check("the owner's band offers Edit profile alone, nobody else's does", /isSelf \? \(\s*<div className="absolute inset-x-0 top-3 sm:bottom-4 sm:top-auto" data-profile-cover-actions="">[\s\S]{0,200}<Link href=\{EDIT_PROFILE_HREF\}/.test(read("components/profile/profile-hero.tsx")) && !/<Camera|COVER_SETTINGS_HREF|data-profile-cover-edit/.test(read("components/profile/profile-hero.tsx")))
  }

  console.log("\nNever empty")
  {
    const act = read("components/profile/profile-activity.tsx")
    check("the activity always ends on the day they joined", /function JoinedRow/.test(act) && /\{joinedAt && !next \? <JoinedRow/.test(act))
    check("the profile and /account both hand it the join date", /joinedAt=\{profile\.joinedAt\}/.test(read("components/profile/member-profile-page.tsx")) && /joinedAt=\{user\.created_at/.test(read("app/account/page.tsx")))
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
      "components/profile/profile-social.tsx",
      "components/profile/profile-activity.tsx",
      "components/profile/profile-top-bar.tsx",
      "components/profile/profile-hero.tsx",
      "components/profile/profile-cover-image.tsx",
      "components/storefront/no-products.tsx",
      "scripts/check-creator-no-products.mjs",
      "scripts/check-profile-nav.mjs",
      "components/profile/shared-community-posts.tsx",
      "components/profile/profile-owner-pills.tsx",
      "lib/profile/owner-pills.ts",
      "lib/profile/shared-posts.ts",
      "lib/profile/shared-view.ts",
      "lib/profile/cover.ts",
      "app/api/profile/cover/route.ts",
      "app/api/profile/shared-posts/route.ts",
      "components/profile/member-profile-page.tsx",
      "app/(marketing)/member/[username]/page.tsx",
      "app/api/profile/username/route.ts",
      "app/api/profile/privacy/route.ts",
      "app/api/profile/activity/route.ts",
      "scripts/check-profile.mjs",
      "scripts/render-profile.tsx",
      "scripts/check-follow-button.mjs",
      "scripts/render-follow-button.tsx",
      "lib/profile/account-creator.ts",
      "components/account/account-communities-body.tsx",
      "app/account/page.tsx",
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
