/**
 * ===========================================================================
 *  NOTIFICATIONS FOR EVERYBODY: THE BELL, ITS INBOX, THE FAN OUTS, THE START
 * ===========================================================================
 * Held from their inputs:
 *
 *   THE SQL        part 85: run-now's rules, the inbox each person reads
 *                  alone, the job kinds kept and added, the private column.
 *   THE INBOX      one row once per key, never about your own action, only a
 *                  path on storelib.com; the bell's list merged over two
 *                  tables and paged exactly on one cursor; marking read only
 *                  ever touches your own rows.
 *   THE FAN OUTS   followers then past buyers, one row per person per
 *                  product; members with access now; nothing for a product
 *                  taken off sale; a page at a time with a cursor.
 *   THE QUEUE      with communities off only the platform kinds are claimed,
 *                  and only once each (compare and set).
 *   THE ROUTES     the session decides who, everything rate limited.
 *   THE BELL       in the platform header for signed in people, a popover
 *                  and a phone sheet, realtime joined after setAuth.
 *   THE START      a buyer in a community opens on it; sellers do not ask.
 *   COPY           no em dash and no banned word.
 *
 * The SQL itself was also run on Postgres 16 (scripts/sql-harness and the
 * functional checks in the round's scratchpad); this suite holds its text.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"

import { stripComments } from "./_source"
import {
  INBOX_FILTERS,
  USER_NOTIFICATION_KINDS,
  USER_NOTIFICATION_SOURCES,
  badgeLabel,
  compareNewestFirst,
  isInboxFilter,
  safeInboxUrl,
  splitTitle,
  timeKey,
} from "@/lib/notifications/user-inbox-shared"
import { decodeInboxCursor, encodeInboxCursor, inboxPlan, listInbox, markRead, notifyUser, notifyUsers, unreadCount, userNotificationRow } from "@/lib/notifications/user-inbox"
import { fanoutFollowers, followerRows, FOLLOWERS_PAGE } from "@/lib/communities/server/jobs/fanout_followers"
import { fanoutMembershipPost, membershipPostRows, postPreview } from "@/lib/communities/server/jobs/fanout_membership_post"
import { runCommunityJobs } from "@/lib/communities/server/notify"
import { lastUsedOrder } from "@/lib/communities/server/native-start"
import { JOB_KINDS, PLATFORM_JOB_KINDS, type JobRow } from "@/lib/communities/types"
import { accessTokenOf, isCommunityStart, sanitizeNativeHome } from "@/lib/native-bridge"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`)
  }
}
const read = (f: string) => readFileSync(f, "utf8")
const code = (f: string) => stripComments(read(f))

/* ── A small PostgREST stand in: what the inbox, the fan outs and the queue call ── */

type Row = Record<string, any>
interface Call {
  table: string
  op: string
  filters: string[]
}

function pg(tables: Record<string, Row[]>, opts: { unique?: Record<string, string>; missing?: string[]; rpc?: (name: string) => unknown } = {}) {
  const calls: Call[] = []
  let serial = 0
  const id = () => `00000000-0000-4000-9000-${String(++serial).padStart(12, "0")}`
  function from(table: string) {
    const st: { op: string; preds: ((r: Row) => boolean)[]; tags: string[]; order: [string, boolean][]; limit: number | null; head: boolean; count: boolean; payload: any; single: boolean; conflict: string | null; returning: boolean } = {
      op: "select",
      preds: [],
      tags: [],
      order: [],
      limit: null,
      head: false,
      count: false,
      payload: null,
      single: false,
      conflict: null,
      returning: false,
    }
    const cmp = (a: unknown, b: unknown) => (String(a ?? "") < String(b ?? "") ? -1 : String(a ?? "") > String(b ?? "") ? 1 : 0)
    const cell = (v: string) => v.replace(/^"|"$/g, "")
    const atom = (expr: string): ((r: Row) => boolean) => {
      const [col, op, ...rest] = expr.split(".")
      const v = cell(rest.join("."))
      if (op === "lt") return (r) => cmp(r[col], v) < 0
      if (op === "gt") return (r) => cmp(r[col], v) > 0
      if (op === "eq") return (r) => String(r[col]) === v
      throw new Error(`or: ${expr}`)
    }
    /* Only the cursor shape the code writes: a.lt."x",and(a.eq."x",id.lt.y) */
    const orFilter = (f: string): ((r: Row) => boolean) => {
      const m = /^(.+?),and\((.+?),(.+)\)$/.exec(f)
      if (!m) throw new Error(`or: ${f}`)
      const a = atom(m[1])
      const b = atom(m[2])
      const c = atom(m[3])
      return (r) => a(r) || (b(r) && c(r))
    }
    const rows = () => (tables[table] ??= [])
    const run = () => {
      calls.push({ table, op: st.op, filters: st.tags })
      if (opts.missing?.includes(table)) return { data: null, error: { code: "42P01", message: `relation "${table}" does not exist` }, count: null }
      const hit = rows().filter((r) => st.preds.every((p) => p(r)))
      if (st.op === "select") {
        let out = [...hit]
        if (st.order.length) out.sort((x, y) => { for (const [c, asc] of st.order) { const d = cmp(x[c], y[c]); if (d) return asc ? d : -d } return 0 })
        if (st.limit !== null) out = out.slice(0, st.limit)
        if (st.head) return { data: null, error: null, count: hit.length }
        if (st.single) return { data: out[0] ? { ...out[0] } : null, error: null }
        return { data: out.map((r) => ({ ...r })), error: null, count: st.count ? hit.length : null }
      }
      if (st.op === "update") {
        for (const r of hit) Object.assign(r, st.payload)
        return { data: st.returning ? hit.map((r) => ({ ...r })) : null, error: null }
      }
      if (st.op === "upsert") {
        const list = Array.isArray(st.payload) ? st.payload : [st.payload]
        const key = st.conflict!
        const made: Row[] = []
        for (const p of list) {
          if (rows().some((r) => r[key] === p[key])) continue
          const row = { id: id(), created_at: new Date(Date.now() + serial).toISOString(), read_at: null, ...p }
          rows().push(row)
          made.push(row)
        }
        return { data: made.map((r) => ({ id: r.id })), error: null }
      }
      throw new Error(st.op)
    }
    const q: any = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        if (st.op === "select") {
          st.head = !!o?.head
          st.count = !!o?.count
        } else st.returning = true
        return q
      },
      eq(c: string, v: unknown) { st.tags.push(`eq:${c}=${v}`); st.preds.push((r) => r[c] === v); return q },
      neq(c: string, v: unknown) { st.tags.push(`neq:${c}=${v}`); st.preds.push((r) => r[c] !== v); return q },
      in(c: string, v: unknown[]) { st.tags.push(`in:${c}`); st.preds.push((r) => v.includes(r[c])); return q },
      is(c: string, v: unknown) { st.tags.push(`is:${c}`); st.preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return q },
      not(c: string, op: string, v: unknown) { st.tags.push(`not:${c}`); if (op === "is" && v === null) st.preds.push((r) => r[c] != null); return q },
      lt(c: string, v: unknown) { st.preds.push((r) => cmp(r[c], v) < 0); return q },
      lte(c: string, v: unknown) { st.preds.push((r) => cmp(r[c], v) <= 0); return q },
      gt(c: string, v: unknown) { st.tags.push(`gt:${c}`); st.preds.push((r) => cmp(r[c], v) > 0); return q },
      or(f: string) { st.tags.push(`or:${f}`); st.preds.push(orFilter(f)); return q },
      order(c: string, o?: { ascending?: boolean }) { st.order.push([c, o?.ascending !== false]); return q },
      limit(n: number) { st.limit = n; return q },
      maybeSingle() { st.single = true; return q },
      update(p: Row) { st.op = "update"; st.payload = p; return q },
      upsert(p: Row | Row[], o: { onConflict: string }) {
        st.op = "upsert"
        st.payload = p
        st.conflict = o.onConflict
        return q
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try { resolve(run()) } catch (e) { reject(e) }
      },
    }
    return q
  }
  const rpc = async (name: string) => {
    calls.push({ table: `rpc:${name}`, op: "rpc", filters: [] })
    return { data: opts.rpc ? opts.rpc(name) : [], error: null }
  }
  return { from, rpc, calls, tables }
}

const U = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`
const MARA = U(1)
const BEN = U(2)
const IOANA = U(3)

async function main() {
  /* ── The SQL ─────────────────────────────────────────────────────────── */
  console.log("\nPart 85, as run-now wants a part")
  const P = "supabase/sql/run-now/85_profiles_follows_notifications.sql"
  const sql = read(P)
  const lines = sql.split("\n").filter(Boolean)
  check("it exists, and its migration is a byte for byte copy", read("supabase/migrations/20261105_profiles_follows_notifications.sql") === sql)
  check("line 1 is a plain summary that says it is safe to run again", /^\/\* .*Safe to run again\. \*\/$/.test(lines[0]))
  check("one statement per line, no -- comments", lines.slice(1).every((l) => l.trim().endsWith(";")) && !/^\s*--/m.test(sql))
  check("the last line reloads the schema", lines[lines.length - 1] === "notify pgrst, 'reload schema';")
  check("safe twice: every create checks first", !/CREATE TABLE (?!IF NOT EXISTS)/.test(sql) && !/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(sql) && !/CREATE FUNCTION/.test(sql) && !/ADD COLUMN (?!IF NOT EXISTS)/.test(sql))
  check("a constraint is dropped before it is added again, in one statement", [...sql.matchAll(/ADD CONSTRAINT (\w+)/g)].every((m) => sql.includes(`DROP CONSTRAINT IF EXISTS ${m[1]}, ADD CONSTRAINT ${m[1]}`)))
  const readme = read("supabase/sql/run-now/README.md")
  const row = readme.split("\n").find((l) => l.startsWith("| `85_profiles_follows_notifications.sql` |")) ?? ""
  check("the README names it, with its lines and bytes", row.endsWith(`| ${sql.split("\n").length - 1} | ${Buffer.byteLength(sql).toLocaleString("en-US")} |`), row.slice(-30))
  const after = read("supabase/sql/run-now/99_check_after.sql")
  check("the check after has its column", /as p85_profiles_follows_notifications[,;]/.test(after))
  check("and the private columns check knows notifications_seen_at is private", /'notifications_seen_at'\]\)\)\) as p63_private_columns/.test(after))
  check("the built files carry it", read("supabase/sql/all-in-two/1_of_2_everything.sql").includes("-- part 85_profiles_follows_notifications.sql") && read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 85_profiles_follows_notifications.sql"))
  check("the admin's list of parts has it", /part: "85", file: "85_profiles_follows_notifications\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))

  console.log("\nuser_notifications: each person's own inbox")
  const table = sql.match(/^CREATE TABLE IF NOT EXISTS public\.user_notifications \(([^\n]+)\);$/m)?.[1] ?? ""
  check("the columns the architecture names", ["id uuid PRIMARY KEY", "user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE", "kind text NOT NULL", "source text NOT NULL", "actor_id uuid", "creator_id uuid", "title text NOT NULL", "body text", "url text NOT NULL", "image_url text", "read_at timestamptz", "dedupe_key text NOT NULL", "created_at timestamptz NOT NULL DEFAULT now()"].every((c) => table.includes(c)))
  check("once per dedupe key", table.includes("CONSTRAINT user_notifications_dedupe_key UNIQUE (dedupe_key)"))
  check("its kinds are the TypeScript list, exactly", table.includes(`CHECK (kind IN (${USER_NOTIFICATION_KINDS.map((k) => `'${k}'`).join(", ")}))`))
  check("its sources are the TypeScript list, exactly", table.includes(`CHECK (source IN (${USER_NOTIFICATION_SOURCES.map((k) => `'${k}'`).join(", ")}))`))
  check("title 1 to 200, body 500, the same as the community inbox", table.includes("char_length(title) BETWEEN 1 AND 200") && table.includes("char_length(body) <= 500"))
  check("only a path on storelib.com as its link", table.includes("CHECK (url LIKE '/%' AND url NOT LIKE '//%'"))
  check("read newest first per person, and unread on a partial index", /CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON public\.user_notifications \(user_id, created_at DESC, id DESC\);/.test(sql) && /CREATE INDEX IF NOT EXISTS user_notifications_unread_idx ON public\.user_notifications \(user_id\) WHERE read_at IS NULL;/.test(sql))
  check("row level security on, nothing for visitors", sql.includes("ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;") && sql.includes("REVOKE ALL ON public.user_notifications FROM PUBLIC, anon, authenticated;"))
  check("signed in people may only read, and only their own", sql.includes("GRANT SELECT ON public.user_notifications TO authenticated;") && /CREATE POLICY "storelib user reads own notifications" ON public\.user_notifications FOR SELECT TO authenticated USING \(user_id = \(SELECT auth\.uid\(\)\)\)/.test(sql) && !/GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*ON public\.user_notifications[^;]*TO (anon|authenticated)/.test(sql))
  check("joins realtime only when the publication is there and ours", /FROM pg_publication WHERE pubname = 'supabase_realtime'[\s\S]*pg_has_role\(current_user, v_owner, 'MEMBER'\)[\s\S]*ALTER PUBLICATION supabase_realtime ADD TABLE public\.user_notifications/.test(sql))

  console.log("\nThe job queue keeps every kind and takes two more")
  const kinds = sql.match(/ALTER TABLE public\.community_jobs DROP CONSTRAINT IF EXISTS community_jobs_kind_check, ADD CONSTRAINT community_jobs_kind_check CHECK \(kind IN \(([^)]+)\)\);/)?.[1] ?? ""
  const p81 = read("supabase/sql/run-now/81_communities.sql").match(/CONSTRAINT community_jobs_kind_check CHECK \(kind IN \(([^)]+)\)\)/)?.[1] ?? ""
  check("every kind part 81 allowed is still allowed", p81.length > 0 && p81.split(", ").every((k) => kinds.split(", ").includes(k)), p81)
  /* Part 86 (push_digest, tests/push-bridge.test.ts) is the newest CHECK; this one is every kind JOB_KINDS had then. */
  check("the CHECK and JOB_KINDS are the same list, push_digest apart (part 86 adds it)", kinds === JOB_KINDS.filter((k) => k !== "push_digest").map((k) => `'${k}'`).join(", "), kinds)
  check("fanout_followers and fanout_membership_post are platform kinds (and push_digest, part 86)", PLATFORM_JOB_KINDS.join() === "fanout_followers,fanout_membership_post,push_digest" && PLATFORM_JOB_KINDS.every((k) => (JOB_KINDS as readonly string[]).includes(k)))

  console.log("\nProfiles, follows, communities")
  check("two privacy switches, on unless changed, and when the bell was opened", ["show_activity boolean NOT NULL DEFAULT true", "show_communities boolean NOT NULL DEFAULT true", "notifications_seen_at timestamptz"].every((c) => sql.includes(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ${c};`)))
  const priv = sql.match(/^CREATE OR REPLACE FUNCTION public\.storelib_private_columns[^\n]+$/m)?.[0] ?? ""
  const p84 = read("supabase/sql/run-now/84_seller_payment_state.sql").match(/^CREATE OR REPLACE FUNCTION public\.storelib_private_columns[^\n]+$/m)?.[0] ?? ""
  check("notifications_seen_at joins the private list, and nothing part 84 kept private leaves it", priv.includes("'tax_id', 'notifications_seen_at'] ELSE") && [...p84.matchAll(/'(\w+)'/g)].every((m) => priv.includes(`'${m[1]}'`)) && !priv.includes("'show_activity'") && !priv.includes("'show_communities'"))
  check("the grants are shared again last, where the function is there", /DO \$do\$ BEGIN IF to_regprocedure\('public\.storelib_share_public_columns\(\)'\) IS NOT NULL THEN PERFORM public\.storelib_share_public_columns\(\); END IF; END \$do\$;\nnotify pgrst/.test(sql))
  check("follows in the shape the follow button writes, and its created_at", /CREATE TABLE IF NOT EXISTS public\.follows \(id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\), follower_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE, following_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now\(\), CONSTRAINT follows_no_self CHECK \(follower_id <> following_id\), CONSTRAINT follows_unique UNIQUE \(follower_id, following_id\)\);/.test(sql) && sql.includes("ALTER TABLE public.follows ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();"))
  check("followers read newest first", sql.includes("CREATE INDEX IF NOT EXISTS follows_following_created_idx ON public.follows (following_id, created_at DESC);"))
  check("a community's gallery: an array of at most 12, readable where the community is", sql.includes("ADD COLUMN IF NOT EXISTS gallery jsonb NOT NULL DEFAULT '[]'::jsonb;") && sql.includes("CHECK (jsonb_typeof(gallery) = 'array' AND jsonb_array_length(gallery) <= 12)") && sql.includes("GRANT SELECT (gallery) ON public.communities TO anon, authenticated;"))
  check("a member's heartbeat, read by community", sql.includes("ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;") && sql.includes("CREATE INDEX IF NOT EXISTS community_members_last_seen_idx ON public.community_members (community_id, last_seen_at DESC);"))

  /* ── The pure parts ──────────────────────────────────────────────────── */
  console.log("\nWhat a row is")
  check("the badge: nothing at 0, the number, 99+ past 99", badgeLabel(0) === null && badgeLabel(-3) === null && badgeLabel(7) === "7" && badgeLabel(99) === "99" && badgeLabel(100) === "99+" && badgeLabel(4321) === "99+")
  check("the filters in order: All, Communities, Following, Purchases", INBOX_FILTERS.map((f) => f.label).join() === "All,Communities,Following,Purchases" && isInboxFilter("purchases") && !isInboxFilter("everything") && !isInboxFilter(null))
  const s1 = splitTitle("Mara Pop published a new product", "Mara Pop")
  check("the actor's name is the bold lead, the rest plain", s1.lead === "Mara Pop" && s1.rest === " published a new product")
  check("a title that does not start with the name is one plain line", splitTitle("A spot opened for you", "Mara").lead === null && splitTitle("Mara", "Mara").lead === null)
  check("only a path on storelib.com is followed", safeInboxUrl("/mara/presets") === "/mara/presets" && safeInboxUrl("https://evil.example") === null && safeInboxUrl("//evil.example") === null && safeInboxUrl("/\\evil.example") === null && safeInboxUrl("javascript:alert(1)") === null && safeInboxUrl(42) === null)
  check("times sort to the microsecond, in any zone", timeKey("2026-10-03T10:00:00.000002+00:00") > timeKey("2026-10-03T10:00:00.000001+00:00") && timeKey("2026-10-03T12:00:00+02:00") === timeKey("2026-10-03T10:00:00Z") && timeKey("2026-10-03 10:00:00.5+00") > timeKey("2026-10-03T10:00:00.49+00:00"))
  check("newest first, the id breaking a tie the way Postgres does", [{ createdAt: "2026-10-03T10:00:00+00:00", id: "a" }, { createdAt: "2026-10-03T10:00:00+00:00", id: "b" }, { createdAt: "2026-10-03T11:00:00+00:00", id: "c" }].sort(compareNewestFirst).map((r) => r.id).join("") === "cba")
  const cur = encodeInboxCursor({ createdAt: "2026-10-03T10:00:00.123456+00:00", id: BEN })
  check("the cursor keeps its microseconds", decodeInboxCursor(cur)?.c === "2026-10-03T10:00:00.123456+00:00" && decodeInboxCursor(cur)?.i === BEN)
  check("and a cursor that is not ours reads as none", decodeInboxCursor("garbage") === null && decodeInboxCursor(Buffer.from(JSON.stringify({ c: "now(); drop", i: BEN })).toString("base64url")) === null && decodeInboxCursor(Buffer.from(JSON.stringify({ c: "2026-10-03T10:00:00Z", i: "x' or 1=1" })).toString("base64url")) === null)
  check("all reads both tables; Following and Purchases the inbox alone; Communities its own", JSON.stringify(inboxPlan("all", true)) === '{"community":true,"user":true,"source":null}' && JSON.stringify(inboxPlan("following", true)) === '{"community":false,"user":true,"source":"following"}' && JSON.stringify(inboxPlan("communities", true)) === '{"community":true,"user":true,"source":"communities"}')
  check("with communities off, no community rows at all", inboxPlan("all", false).community === false && inboxPlan("communities", false).community === false && inboxPlan("communities", false).user === false)

  console.log("\nnotifyUser")
  const base = { userId: BEN, kind: "followed_new_product" as const, source: "following" as const, actorId: MARA, title: "Mara Pop published a new product", url: "/mara/presets", dedupeKey: `product:p1:${BEN}` }
  check("never about your own action", userNotificationRow({ ...base, actorId: BEN }) === null)
  check("never a link off storelib.com", userNotificationRow({ ...base, url: "https://evil.example" }) === null && userNotificationRow({ ...base, url: "//evil.example" }) === null)
  check("never a kind or source the table refuses", userNotificationRow({ ...base, kind: "bogus" as never }) === null && userNotificationRow({ ...base, source: "bogus" as never }) === null)
  check("never without a dedupe key or a real person", userNotificationRow({ ...base, dedupeKey: " " }) === null && userNotificationRow({ ...base, userId: "not-a-uuid" }) === null)
  const long = userNotificationRow({ ...base, title: "x".repeat(400), body: "y".repeat(900), imageUrl: "javascript:x" })
  check("title and body cut to what the table takes; a picture only over https or a path", (long?.title as string).length === 200 && (long?.body as string).length === 500 && long?.image_url === null)
  const db1 = pg({ user_notifications: [] })
  const first = await notifyUser(db1 as never, base)
  const again = await notifyUser(db1 as never, { ...base, title: "Told twice" })
  check("once per key: sent, then duplicate, one row", first === "sent" && again === "duplicate" && db1.tables.user_notifications.length === 1)
  check("before part 85: unavailable, never thrown", (await notifyUser(pg({}, { missing: ["user_notifications"] }) as never, base)) === "unavailable")
  const many = await notifyUsers(db1 as never, [base, { ...base, userId: IOANA, dedupeKey: `product:p1:${IOANA}` }, { ...base, userId: IOANA, dedupeKey: `product:p1:${IOANA}` }])
  check("a batch writes each new key once", many === 1 && db1.tables.user_notifications.length === 2)

  /* ── The merged list ─────────────────────────────────────────────────── */
  console.log("\nThe bell's list: two tables, one cursor")
  const community = [{ id: U(900), name: "Mara club", slug: "mara-club", logo_url: "https://x.example/logo.png" }]
  const cn: Row[] = []
  const un: Row[] = []
  /* 23 community rows and 22 inbox rows, many on the same microsecond, interleaved. */
  for (let i = 0; i < 45; i++) {
    const at = `2026-10-03T10:00:${String(Math.floor(i / 3)).padStart(2, "0")}.000007+00:00`
    if (i % 2 === 0) cn.push({ id: U(100 + i), user_id: BEN, community_id: U(900), kind: "comment", actor_id: MARA, title: "Mara Pop commented on your post", body: "Nice", url: "/community/mara-club/post/1", read_at: i < 10 ? "2026-10-03T11:00:00Z" : null, created_at: at })
    else un.push({ id: U(100 + i), user_id: BEN, kind: i % 3 === 0 ? "membership_post" : "followed_new_product", source: i % 3 === 0 ? "purchases" : "following", actor_id: MARA, title: "Mara Pop published a new product", body: "Presets", url: "/mara/presets", image_url: null, read_at: null, created_at: at })
  }
  cn.push({ id: U(400), user_id: IOANA, community_id: U(900), kind: "comment", actor_id: MARA, title: "Somebody else's", body: null, url: "/community/mara-club", read_at: null, created_at: "2026-10-03T12:00:00Z" })
  un.push({ id: U(401), user_id: IOANA, kind: "new_follower", source: "following", actor_id: MARA, title: "Not Ben's", body: null, url: "/@mara", image_url: null, read_at: null, created_at: "2026-10-03T12:00:00Z" })
  un.push({ id: U(402), user_id: BEN, kind: "followed_new_community", source: "following", actor_id: MARA, title: "Mara Pop started a community", body: "Mara club", url: "/community/mara-club", image_url: null, read_at: null, created_at: "2026-10-02T09:00:00Z" })
  const db2 = pg({ community_notifications: cn, user_notifications: un, communities: community, profiles: [{ id: MARA, username: "mara", display_name: "Mara Pop", avatar_url: "https://x.example/m.png" }] })
  const seen: string[] = []
  let cursor: string | null = null
  let pages = 0
  do {
    const page = await listInbox(db2 as never, { userId: BEN, filter: "all", cursor, communitiesOn: true, limit: 10 })
    seen.push(...page.items.map((i) => i.id))
    cursor = page.nextCursor
    pages++
    if (pages === 1) {
      check("a page carries the actor's name and photo, and the community", page.items[0].actor?.name === "Mara Pop" && !!page.items[0].actor?.avatarUrl && page.items.some((i) => i.community?.slug === "mara-club"))
      const unreadBen = [...cn, ...un].filter((r) => r.user_id === BEN && !r.read_at).length
      check("the unread count is both tables together", page.unread === unreadBen && unreadBen === 41, page.unread)
    }
  } while (cursor && pages < 20)
  const all = [...cn, ...un].filter((r) => r.user_id === BEN).map((r) => ({ id: r.id as string, createdAt: r.created_at as string })).sort(compareNewestFirst).map((r) => r.id)
  check("paged ten at a time, every one of Ben's 46 rows exactly once, newest first", seen.join() === all.join() && pages === 5, { pages, seen: seen.length })
  check("nobody else's rows", !seen.includes(U(400)) && !seen.includes(U(401)))
  check("every read named Ben", db2.calls.filter((c) => c.op === "select" && (c.table === "user_notifications" || c.table === "community_notifications")).every((c) => c.filters.includes(`eq:user_id=${BEN}`)))
  const following = await listInbox(db2 as never, { userId: BEN, filter: "following", communitiesOn: true, limit: 50 })
  check("Following: the inbox's following rows only", following.items.length > 0 && following.items.every((i) => i.from === "user" && i.source === "following"))
  const purchases = await listInbox(db2 as never, { userId: BEN, filter: "purchases", communitiesOn: true, limit: 50 })
  check("Purchases: a membership's posts", purchases.items.length > 0 && purchases.items.every((i) => i.source === "purchases" && i.kind === "membership_post"))
  const comm = await listInbox(db2 as never, { userId: BEN, filter: "communities", communitiesOn: true, limit: 50 })
  check("Communities: community rows", comm.items.length === 23 && comm.items.every((i) => i.from === "community"))
  const off = await listInbox(db2 as never, { userId: BEN, filter: "all", communitiesOn: false, limit: 50 })
  check("communities off: no community row, no new community, and the count leaves them out", off.items.every((i) => i.from === "user" && i.kind !== "followed_new_community") && off.items.length === 22 && off.unread === 22, { n: off.items.length, unread: off.unread })
  const evil = pg({ community_notifications: [{ id: U(500), user_id: BEN, community_id: U(900), kind: "comment", actor_id: null, title: "x", body: null, url: "/somewhere-else", read_at: null, created_at: "2026-10-03T10:00:00Z" }], user_notifications: [], communities: community, profiles: [] })
  check("a community row's link must stay inside its community", (await listInbox(evil as never, { userId: BEN, filter: "all", communitiesOn: true })).items[0]?.url === null)
  const before85 = pg({ community_notifications: cn.slice(0, 3), communities: community, profiles: [] }, { missing: ["user_notifications"] })
  const p = await listInbox(before85 as never, { userId: BEN, filter: "all", communitiesOn: true })
  check("before part 85 the bell shows community rows and says so", p.items.length === 3 && p.available === false)

  console.log("\nMarking read")
  const strangers = un.find((r) => r.id === U(401))!
  const n0 = await unreadCount(db2 as never, BEN, true)
  const n1 = await markRead(db2 as never, { userId: BEN, ids: [U(110), U(111), U(401), "not-an-id"], communitiesOn: true })
  check("by id, in either table, only your own", n1 === n0 - 2 && strangers.read_at === null && cn.find((r) => r.id === U(110))!.read_at && un.find((r) => r.id === U(111))!.read_at)
  check("every write named the person", db2.calls.filter((c) => c.op === "update").every((c) => c.filters.includes(`eq:user_id=${BEN}`)))
  const n2 = await markRead(db2 as never, { userId: BEN, all: true, communitiesOn: true })
  check("all: nothing unread left, nobody else's touched", n2 === 0 && strangers.read_at === null && cn.find((r) => r.id === U(400))!.read_at === null)

  /* ── The fan outs ────────────────────────────────────────────────────── */
  console.log("\nFollowers and past buyers")
  const subject = { type: "product" as const, id: U(700), creatorId: U(800), creatorUserId: MARA, actorName: "Mara Pop", name: "Film presets", url: "/mara/film-presets", image: null }
  const fr = followerRows([BEN, BEN, MARA, IOANA, "nope"], subject, "followers")
  check("one row per person, never the creator", fr.length === 2 && fr.every((r) => r.userId !== MARA))
  check("a follower's row: Following, keyed per product and person", fr[0].kind === "followed_new_product" && fr[0].source === "following" && fr[0].dedupeKey === `product:${U(700)}:${BEN}` && fr[0].title === "Mara Pop published a new product" && fr[0].body === "Film presets")
  const br = followerRows([IOANA], subject, "buyers")
  check("a past buyer's row: Purchases, the same key", br[0].kind === "purchased_creator_new_product" && br[0].source === "purchases" && br[0].dedupeKey === `product:${U(700)}:${IOANA}`)
  check("a community's row: a followed creator's new community", followerRows([BEN], { ...subject, type: "community" }, "followers")[0].kind === "followed_new_community")

  const follows: Row[] = []
  for (let i = 0; i < 1203; i++) follows.push({ id: U(10_000 + i), follower_id: U(20_000 + i), following_id: MARA, created_at: `2026-09-01T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(6, "0")}+00:00` })
  follows.push({ id: U(9_999), follower_id: BEN, following_id: MARA, created_at: "2026-09-02T00:00:00+00:00" })
  follows.push({ id: U(9_998), follower_id: IOANA, following_id: U(77), created_at: "2026-09-02T00:00:00+00:00" })
  const orders: Row[] = [
    { id: U(30_001), buyer_id: BEN, creator_id: U(800), status: "completed", created_at: "2026-08-01T00:00:00+00:00" },
    { id: U(30_002), buyer_id: IOANA, creator_id: U(800), status: "completed", created_at: "2026-08-02T00:00:00+00:00" },
    { id: U(30_003), buyer_id: IOANA, creator_id: U(800), status: "completed", created_at: "2026-08-03T00:00:00+00:00" },
    { id: U(30_004), buyer_id: U(55), creator_id: U(800), status: "refunded", created_at: "2026-08-04T00:00:00+00:00" },
    { id: U(30_005), buyer_id: U(56), creator_id: U(801), status: "completed", created_at: "2026-08-05T00:00:00+00:00" },
  ]
  const shop = () => ({
    profiles: [{ id: MARA, display_name: "Mara Pop", username: "mara" }],
    creators: [{ id: U(800), user_id: MARA, username: "mara", slug: "mara" }],
    products: [{ id: U(700), title: "Film presets", slug: "film-presets", status: "published", archived: false, creator_id: U(800), community_id: null as string | null, thumbnail_url: "https://x.example/p.png" }],
    follows: follows.map((f) => ({ ...f })),
    orders: orders.map((o) => ({ ...o })),
    user_notifications: [] as Row[],
  })
  const job = (payload: Record<string, unknown>): JobRow => ({ id: 1, kind: "fanout_followers", payload, run_at: "", state: "running", attempts: 1, last_error: null, lease_until: null, idempotency_key: "k", created_at: "", finished_at: null }) as JobRow
  const db3 = pg(shop())
  const start0 = { type: "product", productId: U(700), creatorUserId: MARA, phase: "followers", after: null }
  /* No time left in the run: nothing done, the same place handed back for the next run. */
  const later = (await fanoutFollowers(db3 as never, job(start0), { deadline: Date.now() + 2_000, now: Date.now() })) || null
  check("out of time: handed back to carry on, nothing written", !!later?.again && JSON.stringify(later.again.payload) === JSON.stringify({ ...start0, told: 0 }) && db3.tables.user_notifications.length === 0)
  await fanoutFollowers(db3 as never, job(start0), { deadline: Date.now() + 60_000, now: Date.now() })
  const inbox = db3.tables.user_notifications
  const people = new Set(inbox.map((r) => r.user_id))
  check(`all ${follows.length - 1} followers and the past buyers, each once`, inbox.length === 1204 + 1 && people.size === inbox.length, { rows: inbox.length })
  check("Ben follows and bought: he gets the follower's row only", inbox.filter((r) => r.user_id === BEN).length === 1 && inbox.find((r) => r.user_id === BEN)?.kind === "followed_new_product")
  check("Ioana bought twice and does not follow: one Purchases row", inbox.filter((r) => r.user_id === IOANA).length === 1 && inbox.find((r) => r.user_id === IOANA)?.source === "purchases")
  check("a refund or another creator's buyer hears nothing", !people.has(U(55)) && !people.has(U(56)))
  check("the link is the product's page under the creator's handle", inbox.every((r) => r.url === "/mara/film-presets" && r.actor_id === MARA))
  check("the followers are read a page at a time on the date index", db3.calls.filter((c) => c.table === "follows").every((c) => c.filters.includes(`eq:following_id=${MARA}`)) && db3.calls.filter((c) => c.table === "follows").length >= Math.ceil(1204 / FOLLOWERS_PAGE))
  const db3b = pg({ ...shop(), user_notifications: db3.tables.user_notifications.map((r) => ({ ...r })) })
  await fanoutFollowers(db3b as never, job({ type: "product", productId: U(700), creatorUserId: MARA, phase: "followers", after: null }), { deadline: Date.now() + 60_000, now: Date.now() })
  check("run again from the start: nothing new", db3b.tables.user_notifications.length === inbox.length)
  /* Carried on from a cursor: the newest follower (Ben, 2 September) was done in an earlier run, so here he hears only as a past buyer. */
  const db3c = pg(shop())
  await fanoutFollowers(db3c as never, job({ ...start0, after: { c: "2026-09-02T00:00:00+00:00", i: U(9_999) } }), { deadline: Date.now() + 60_000, now: Date.now() })
  check("carried on from its cursor: nothing before it again", db3c.tables.user_notifications.length === 1205 && db3c.tables.user_notifications.find((r) => r.user_id === BEN)?.kind === "purchased_creator_new_product")
  const gone = shop()
  gone.products[0].status = "draft"
  const db4 = pg(gone)
  await fanoutFollowers(db4 as never, job({ type: "product", productId: U(700), creatorUserId: MARA }), { deadline: Date.now() + 60_000, now: Date.now() })
  check("a product taken off sale before the job runs tells nobody", db4.tables.user_notifications.length === 0)
  const tier = shop()
  tier.products[0].community_id = U(900)
  const db5 = pg(tier)
  await fanoutFollowers(db5 as never, job({ type: "product", productId: U(700), creatorUserId: MARA }), { deadline: Date.now() + 60_000, now: Date.now() })
  check("a product that sells a community tier is not announced as a product", db5.tables.user_notifications.length === 0)
  const stranger = pg(shop())
  await fanoutFollowers(stranger as never, job({ type: "product", productId: U(700), creatorUserId: IOANA }), { deadline: Date.now() + 60_000, now: Date.now() })
  check("a job naming somebody else as the creator tells nobody", stranger.tables.user_notifications.length === 0)

  console.log("\nA membership's new post")
  const now = Date.parse("2026-10-03T12:00:00Z")
  const members = [
    { id: U(601), buyer_id: BEN, status: "active", current_period_end: null, past_due_since: null },
    { id: U(602), buyer_id: IOANA, status: "canceled", current_period_end: "2026-10-20T00:00:00Z", past_due_since: null },
    { id: U(603), buyer_id: U(57), status: "canceled", current_period_end: "2026-09-20T00:00:00Z", past_due_since: null },
    { id: U(604), buyer_id: U(58), status: "past_due", current_period_end: null, past_due_since: "2026-08-01T00:00:00Z" },
    { id: U(605), buyer_id: null, status: "active", current_period_end: null, past_due_since: null },
    { id: U(606), buyer_id: MARA, status: "active", current_period_end: null, past_due_since: null },
  ]
  const mr = membershipPostRows(members, { postId: U(650), creatorUserId: MARA, creatorId: U(800), creatorName: "Mara Pop", productTitle: "Inner circle", preview: "March notes", image: null }, now)
  check("members with access now, with an account, never the creator", mr.map((r) => r.userId).join() === [BEN, IOANA].join())
  check("each to their own membership page, Purchases, once per post", mr[0].url === `/account/library/memberships/${U(601)}` && mr[0].source === "purchases" && mr[0].kind === "membership_post" && mr[0].dedupeKey === `mpost:${U(650)}:${BEN}` && mr[0].title === "Mara Pop posted in Inner circle")
  check("the preview is the title, or the text without markup", postPreview("  March notes ", "<p>x</p>") === "March notes" && postPreview("", "<p>Hello <b>all</b> &amp; welcome</p>") === "Hello all & welcome" && postPreview(null, "z".repeat(300)).length === 140)
  const db6 = pg({
    membership_posts: [{ id: U(650), product_id: U(660), creator_id: U(800), title: "March notes", body: "", deleted_at: null }],
    products: [{ id: U(660), title: "Inner circle", status: "published", creator_id: U(800), thumbnail_url: null }],
    creators: [{ id: U(800), user_id: MARA, display_name: "Mara", username: "mara" }],
    profiles: [{ id: MARA, display_name: "Mara Pop", username: "mara" }],
    memberships: members.filter((m) => m.status === "active" || m.buyer_id === IOANA).map((m) => ({ ...m, product_id: U(660), current_period_end: m.buyer_id === IOANA ? new Date(Date.now() + 86_400_000).toISOString() : m.current_period_end })),
    user_notifications: [],
  })
  await fanoutMembershipPost(db6 as never, { ...job({ postId: U(650), productId: U(660) }), kind: "fanout_membership_post" } as JobRow, { deadline: Date.now() + 60_000, now: Date.now() })
  check("the job tells Ben and Ioana, in app", db6.tables.user_notifications.map((r) => r.user_id).sort().join() === [BEN, IOANA].sort().join())
  const removed = pg({ ...db6.tables, membership_posts: [{ id: U(650), product_id: U(660), creator_id: U(800), title: "x", body: "", deleted_at: "2026-10-03T00:00:00Z" }], user_notifications: [] })
  await fanoutMembershipPost(removed as never, { ...job({ postId: U(650), productId: U(660) }), kind: "fanout_membership_post" } as JobRow, { deadline: Date.now() + 60_000, now: Date.now() })
  check("a post removed before the job runs tells nobody", removed.tables.user_notifications.length === 0)

  /* ── The queue with communities off ──────────────────────────────────── */
  console.log("\nThe cron with communities off")
  const jobs: Row[] = [
    { id: 1, kind: "fanout_followers", payload: { type: "product", productId: U(700), creatorUserId: MARA }, run_at: "2026-01-01T00:00:00Z", state: "pending", attempts: 0, last_error: null, lease_until: null, idempotency_key: "a", created_at: "", finished_at: null },
    { id: 2, kind: "fanout_announcement", payload: {}, run_at: "2026-01-01T00:00:00Z", state: "pending", attempts: 0, last_error: null, lease_until: null, idempotency_key: "b", created_at: "", finished_at: null },
    { id: 3, kind: "recount", payload: {}, run_at: "2026-01-01T00:00:00Z", state: "pending", attempts: 0, last_error: null, lease_until: null, idempotency_key: "c", created_at: "", finished_at: null },
  ]
  const db7 = pg({ ...shop(), community_jobs: jobs })
  const summary = await runCommunityJobs(db7 as never, { budgetMs: 8_000, kinds: PLATFORM_JOB_KINDS })
  check("the platform job ran; the community jobs were left as they were", jobs[0].state === "done" && jobs[1].state === "pending" && jobs[2].state === "pending" && jobs[1].attempts === 0, { s: summary, states: jobs.map((j) => j.state) })
  check("no rollup or trending queued while off, and the any kind claim never asked", !db7.tables.community_jobs.some((j) => j.kind === "rollup" || j.kind === "trending") && !db7.calls.some((c) => c.table === "rpc:community_claim_jobs"))
  check("the followers were told", db7.tables.user_notifications.length > 1000)
  const claimed = db7.calls.filter((c) => c.table === "community_jobs" && c.op === "update" && c.filters.includes("eq:state=pending"))
  check("taken by compare and set: id, state and attempts it read", claimed.length >= 1 && claimed.every((c) => c.filters.some((f) => f.startsWith("eq:id=")) && c.filters.some((f) => f.startsWith("eq:attempts="))))
  const race = pg({ community_jobs: [{ ...jobs[0], id: 9, state: "pending", attempts: 0 }] })
  /* The same job read by two runs at once: the second's write names attempts 0, which is gone. */
  const q1 = race.from("community_jobs").update({ state: "running", attempts: 1 }).eq("id", 9).eq("state", "pending").eq("attempts", 0).select("id")
  const q2 = race.from("community_jobs").update({ state: "running", attempts: 1 }).eq("id", 9).eq("state", "pending").eq("attempts", 0).select("id")
  const [r1, r2] = [await q1, await q2] as { data: Row[] }[]
  check("of two runs at once only one gets the job", r1.data.length === 1 && r2.data.length === 0)

  /* ── The routes ──────────────────────────────────────────────────────── */
  console.log("\nRoutes")
  const inboxRoute = code("app/api/notifications/inbox/route.ts")
  const readRoute = code("app/api/notifications/read/route.ts")
  check("the inbox: the session's person, rate limited, the filter checked", /const userId = await sessionUserId\(\)\s*if \(!userId\) return NextResponse\.json\(\{ error: "sign_in" \}, \{ status: 401/.test(inboxRoute) && /rateLimit\(\{ bucket: "notifications-inbox", subjects: \[`user:\$\{userId\}`\]/.test(inboxRoute) && /isInboxFilter\(filter\) \? filter : "all"/.test(inboxRoute) && /communitiesOn: await communitiesEnabled\(\)/.test(inboxRoute))
  check("read: the session's person, rate limited, ids or all", /const userId = await sessionUserId\(\)\s*if \(!userId\)/.test(readRoute) && /rateLimit\(\{ bucket: "notifications-read", subjects: \[`user:\$\{userId\}`\]/.test(readRoute) && /markRead\(db, \{ userId, ids, all, communitiesOn \}\)/.test(readRoute))
  check("neither takes a person from the request", !/body\.userId|searchParams\.get\("user/.test(inboxRoute + readRoute))
  check("the creator's /app bell route is left as it was", /seller_notifications/.test(code("app/api/notifications/route.ts")) && !/user_notifications/.test(code("app/api/notifications/route.ts")))
  const cron = code("app/api/cron/community/route.ts")
  check("the cron runs the platform kinds alone while communities are off", /const on = await communitiesEnabled\(\)/.test(cron) && /on \? \{ budgetMs: RUN_BUDGET_MS \} : \{ budgetMs: RUN_BUDGET_MS, kinds: PLATFORM_JOB_KINDS \}/.test(cron) && /on \? summary : \{ \.\.\.summary, skipped: "communities_off" \}/.test(cron))
  const index = code("lib/communities/server/jobs/index.ts")
  check("one line each in the job index", /fanout_followers: \(db, job, ctx\) => import\("\.\/fanout_followers"\)/.test(index) && /fanout_membership_post: \(db, job, ctx\) => import\("\.\/fanout_membership_post"\)/.test(index))

  console.log("\nWhere the fan outs are queued")
  const hooks: [string, RegExp][] = [
    ["app/api/revalidate/route.ts", /try \{\s*await queueProductFanout\(createAdminClient\(\), \{ productId: owned\.id, creatorId: owned\.creator_id \}\)\s*\} catch/],
    ["app/api/products/forget/route.ts", /try \{\s*await queueProductFanout\(admin, \{ productId: row\.id, creatorId \}\)\s*\} catch/],
    ["app/api/app/memberships/[productId]/route.ts", /if \(saved\.status === "published"\) \{\s*try \{\s*await queueProductFanout\(ctx\.admin, \{ productId, creatorId: ctx\.creatorId \}\)/],
    ["app/api/app/memberships/[productId]/posts/route.ts", /try \{\s*await queueMembershipPostFanout\(ctx\.admin, \{ postId: saved\.id, productId \}\)\s*\} catch/],
    ["lib/communities/server/creator.ts", /if \(a\.publish\) await queueCommunityFanout\(db, \{ communityId: c\.id,/],
  ]
  for (const [f, re] of hooks) check(`${f}: queued after its own work, never failing it`, re.test(code(f)))
  const fan = code("lib/notifications/fanout.ts")
  check("each queue helper catches everything and is keyed once per thing", (fan.match(/\} catch \(e\) \{/g) ?? []).length === 3 && /idempotencyKey: `fanout_followers:product:\$\{p\.productId\}`/.test(fan) && /idempotencyKey: `fanout_followers:community:\$\{c\.communityId\}`/.test(fan) && /idempotencyKey: `fanout_membership_post:\$\{m\.postId\}`/.test(fan))
  check("the membership's update email is untouched: still the creator's choice", /if \(post\.sendEmail && product\.status === "published"\)/.test(code("app/api/app/memberships/[productId]/posts/route.ts")))

  /* ── The bell ────────────────────────────────────────────────────────── */
  console.log("\nThe bell")
  const B = "components/notifications/notification-bell.tsx"
  const bell = code(B)
  check("a client component exporting NotificationBell({ className })", read(B).startsWith('"use client"') && /export function NotificationBell\(\{ className \}: \{ className\?: string \}\)/.test(bell))
  check("it imports nothing from the server", !/server-only|next\/headers|lib\/communities\/server|lib\/notifications\/user-inbox"|lib\/supabase\/(server|admin)|lib\/admin-blog-auth/.test(bell))
  check("it reads the inbox and marks read through the two routes", /"\/api\/notifications\/inbox"/.test(bell) && /"\/api\/notifications\/read"/.test(bell))
  check("realtime on both tables, joined after setAuth", /await realtimeAuth\(supabase\)\s*if \(gone\) return\s*for \(const table of \["user_notifications", "community_notifications"\]\)/.test(bell) && /filter: `user_id=eq\.\$\{userId\}`/.test(bell))
  check("a popover on a computer and a full screen sheet on a phone", /data-notification-panel="popover"/.test(bell) && /data-notification-panel="sheet"/.test(bell) && /aria-modal="true"/.test(bell))
  check("Notifications, Mark all as read, the filter, and Nothing new", />\s*Notifications\s*</.test(bell) && />\s*Mark all as read\s*</.test(bell) && /INBOX_FILTERS\.map/.test(bell) && />Nothing new</.test(bell))
  check("tapping a row marks it read on the way, and the mark outlives the page", /void postRead\(\{ ids: \[n\.id\] \}\)/.test(bell) && /keepalive: true/.test(bell))
  const header = code("components/platform/platform-header-client.tsx")
  check("in the platform header: both computer rows and the phone row, signed in only", (header.match(/<NotificationBell className=\{chrome\.iconBtn\} \/>\s*\{sellerDashboardButton\}\s*\{desktopAccountMenu\}/g) ?? []).length === 2 && /\{user \? <NotificationBell className=\{chrome\.iconBtn\} \/> : null\}/.test(header))

  /* ── The native start ────────────────────────────────────────────────── */
  console.log("\nThe phone app's start")
  check("the community they used last first, never seen last, then the newest join", lastUsedOrder([{ community_id: "a", last_seen_at: null, joined_at: "2026-10-01T00:00:00Z" }, { community_id: "b", last_seen_at: "2026-09-01T00:00:00Z", joined_at: "2026-01-01T00:00:00Z" }, { community_id: "c", last_seen_at: "2026-09-05T00:00:00Z", joined_at: "2026-01-01T00:00:00Z" }, { community_id: "d", last_seen_at: null, joined_at: "2026-10-02T00:00:00Z" }]).map((m) => m.community_id).join("") === "cbda")
  check("only a plain /community/<slug> passes", isCommunityStart("/community/mara-club") && !isCommunityStart("/community/mara-club/post/1") && !isCommunityStart("//evil.example") && !isCommunityStart("/community/-x") && !isCommunityStart("/community/Mara"))
  check("and it is never cached as a home", sanitizeNativeHome("/community/mara-club") === "/app")
  const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abcdefghijklmnop"
  check("the stored session's token, plain or base64", accessTokenOf(JSON.stringify({ access_token: token })) === token && accessTokenOf(`base64-${Buffer.from(JSON.stringify({ access_token: token })).toString("base64url")}`) === token && accessTokenOf("{bad") === null && accessTokenOf(null) === null)
  const start = code("app/native-start/page.tsx")
  check("a seller's cached home goes straight there; a buyer's asks for a community first", /if \(isLibraryHome\(cachedHome\)\) \{\s*safeRedirect\(\(await communityStart\(accessTokenOf\(sessionRaw\)\)\) \|\| cachedHome\)/.test(start) && /safeRedirect\(cachedHome\)/.test(start))
  check("a new device: the library is cached, the community asked for", /await cacheNativeHome\(home\)[\s\S]{0,200}safeRedirect\(\(home === "\/library" && \(await communityStart\(session\.access_token\)\)\) \|\| home\)/.test(start))
  check("the redirect lets a community through without making it a home", /const target = isHandoff \|\| isCommunityStart\(url\) \? url : sanitizeNativeHome\(url\)/.test(start))
  check("the ask has a time limit", /setTimeout\(\(\) => ctl\.abort\(\), 2500\)/.test(start))
  const nativeRoute = code("app/api/native/start/route.ts")
  const nativeLib = code("lib/communities/server/native-start.ts")
  check("the server: the session or a checked bearer, never a parameter", /let userId = await sessionUserId\(\)/.test(nativeRoute) && /db\.auth\.getUser\(bearer\)/.test(nativeRoute) && !/searchParams/.test(nativeRoute))
  check("only with communities on, never for a seller, only an open community", /if \(!\(await communitiesEnabled\(\)\)\) return null/.test(nativeLib) && /if \(hasSellerAccess\(await readSellerAccess\(db, userId\)\)\) return null/.test(nativeLib) && /c\.status === "published" && !c\.deleted_at && !c\.suspended_at/.test(nativeLib) && /\.eq\("status", "active"\)/.test(nativeLib))

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\nCopy")
  /* app/native-start/page.tsx is older than this round (its CSS says transform, its old notes have dashes); what this round added there is checked above. */
  const mine = [P, B, "lib/notifications/user-inbox.ts", "lib/notifications/user-inbox-shared.ts", "lib/notifications/fanout.ts", "lib/communities/server/jobs/fanout_followers.ts", "lib/communities/server/jobs/fanout_membership_post.ts", "lib/communities/server/native-start.ts", "app/api/notifications/inbox/route.ts", "app/api/notifications/read/route.ts", "app/api/native/start/route.ts"]
  check("every file is there", mine.every((f) => existsSync(f)))
  const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
  check("no em dash and no banned word, in copy, comments or names", offenders.length === 0, offenders.join(", "))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
