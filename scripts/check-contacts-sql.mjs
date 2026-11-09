#!/usr/bin/env node
/**
 * ===========================================================================
 *  CONTACTS: THE SQL AND THE APP JOIN PEOPLE THE SAME WAY (round 51)
 * ===========================================================================
 * SQL part 378's creator_people() and lib/contacts/identity.ts are the same
 * rule written twice (the app's is what answers before the part has run).
 * This builds a throwaway database on a real Postgres (16 checked), with the
 * columns those reads use, runs the part twice (it must be safe to run
 * again), fills it with random people across every source (accounts with
 * and without a confirmed address, addresses in mixed case, two accounts
 * giving one address, another store's rows) and compares every filter, sort,
 * search and advanced filter, row by row, with the app's answer. Part 406
 * runs after it, and the people include a second business's tagged
 * addresses and ones with no inbox (lib/businesses/email-alias).
 *
 *   PGHOST=/tmp PGPORT=55432 PGUSER=postgres node scripts/check-contacts-sql.mjs
 *
 * Not in the push suite: it needs a Postgres. Exit 1 on any difference.
 */
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const conn = ["-h", process.env.PGHOST || "/tmp", "-p", process.env.PGPORT || "5432", "-U", process.env.PGUSER || "postgres"]
const psql = (args, input) => execFileSync("psql", [...conn, "-v", "ON_ERROR_STOP=1", "-q", ...args], { input, stdio: ["pipe", "pipe", "pipe"] }).toString()
const db = `contacts_check_${process.pid}`
const dir = mkdtempSync(join(tmpdir(), "contacts-sql-"))
/* Bundled, so identity.ts's own imports (lib/businesses/email-alias, part 406) come with it. */
execFileSync("node_modules/.bin/esbuild", ["lib/contacts/identity.ts", "--bundle", "--platform=node", "--format=esm", `--alias:@=${process.cwd()}`, `--outfile=${join(dir, "identity.mjs")}`, "--log-level=warning"])
const { mergePeople, pagePeople, normalizeEmail } = await import(join(dir, "identity.mjs"))
const SCHEMA = `create schema auth; create table auth.users (id uuid primary key);
create table public.creators (id uuid primary key, user_id uuid);
create table public.profiles (id uuid primary key, email text, email_verified boolean default false, display_name text, username text);
create table public.subscribers (id uuid primary key default gen_random_uuid(), creator_id uuid, email text, name text, source text, source_detail jsonb, status text default 'subscribed', is_active boolean default true, tags text[] default '{}', subscribed_at timestamptz default now(), created_at timestamptz default now());
create table public.customers (id uuid primary key default gen_random_uuid(), creator_id uuid, email text, first_name text, last_name text, created_at timestamptz default now());
create table public.orders (id uuid primary key default gen_random_uuid(), creator_id uuid, buyer_id uuid, buyer_email text, buyer_first_name text, buyer_last_name text, status text, created_at timestamptz default now());
create table public.memberships (id uuid primary key default gen_random_uuid(), creator_id uuid, buyer_id uuid, buyer_email text, buyer_name text, status text, created_at timestamptz default now());
create table public.communities (id uuid primary key default gen_random_uuid(), creator_id uuid, name text);
create table public.community_members (id uuid primary key default gen_random_uuid(), community_id uuid, user_id uuid, status text, role text default 'member', tier_id uuid, joined_at timestamptz, created_at timestamptz default now());
create table public.products (id uuid primary key default gen_random_uuid(), creator_id uuid, title text);
create table public.course_enrollments (id uuid primary key default gen_random_uuid(), buyer_id uuid, product_id uuid, started_at timestamptz default now());
create table public.form_submissions (id uuid primary key default gen_random_uuid(), owner_id uuid, form_id uuid, contact_name text, contact_email text, status text default 'new', submitted_at timestamptz default now());
create table public.onepages (id uuid primary key default gen_random_uuid(), seller_id uuid, creator_id uuid);
create table public.onepage_leads (id uuid primary key default gen_random_uuid(), onepage_id uuid, email text, name text, created_at timestamptz default now());
create table public.site_contact_messages (id uuid primary key default gen_random_uuid(), creator_id uuid, email text, name text, page text, created_at timestamptz default now());
create table public.email_flow_sends (id uuid primary key default gen_random_uuid(), creator_id uuid, email text);
create table public.campaign_recipients (id uuid primary key default gen_random_uuid(), creator_id uuid, email text);
`
psql(["-d", "postgres", "-c", `create database ${db}`])
let total = 0
try {
  psql(["-d", db, "-c", "do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if; end $$;"])
  psql(["-d", db], SCHEMA)
  const part = readFileSync("supabase/sql/run-now/378_creator_contacts.sql", "utf8")
  psql(["-d", db], part)
  psql(["-d", db], part)
  console.log("part 378 ran twice")
  /* Part 406 replaces creator_people with the rule for a second business's tagged address (lib/businesses/email-alias). */
  const alias = readFileSync("supabase/sql/run-now/406_creator_people_alias_merge.sql", "utf8")
  psql(["-d", db], alias)
  psql(["-d", db], alias)
  console.log("part 406 ran twice")
  for (const s of [3, 8, 13, 21, 34, 55]) total += run(s)
} finally {
  psql(["-d", "postgres", "-c", `drop database if exists ${db}`])
}
console.log(total ? `${total} differences` : "the SQL and the app agree")
process.exit(total ? 1 : 0)

function run(start) {
let seed = start

const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const uuid = () => randomUUID()
const C = uuid(), OWNER = uuid(), OTHER = uuid()
const users = Array.from({ length: 25 }, () => uuid())
/* With a second business's tagged addresses (the owner's with +slb-<8 hex>, part 406) and one with no inbox among them. */
const emails = [...Array.from({ length: 40 }, (_, i) => `p${i}@ex.com`), "p1+slb-0a0b0c0d@ex.com", "p2+slb-1a2b3c4d@ex.com", "P3+SLB-DEADBEEF@ex.com", "slb-0f0f0f0f@businesses.invalid", "slb-0e0e0e0e@businesses.invalid"]
const names = ["Ana", "Bo", "Cy", null, "Dee", "  ", "Ed Ward"]
const t = () => new Date(Date.UTC(2026, Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 27), Math.floor(rnd() * 23), Math.floor(rnd() * 59), 0, Math.floor(rnd() * 999))).toISOString()
const sql = []
const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`)
const arr = (a) => `array[${a.map(q).join(",")}]::text[]`
sql.push(`insert into creators values (${q(C)}, ${q(OWNER)}), (${q(OTHER)}, ${q(uuid())});`)
const profiles = users.map((u, i) => ({ id: u, email: i < 20 ? (i % 3 === 0 ? emails[i].toUpperCase() : emails[i]) : i < 24 ? emails[40 + (i - 20)] : null, ver: i % 2 === 0, dn: pick(names) }))
for (const p of profiles) sql.push(`insert into auth.users values (${q(p.id)});`)
for (const p of profiles) sql.push(`insert into profiles values (${q(p.id)}, ${q(p.email)}, ${p.ver}, ${q(p.dn)}, ${q("user" + p.id.slice(0, 4))});`)
const comm = [uuid(), uuid()], tiers = [uuid(), uuid()]
sql.push(`insert into communities values (${q(comm[0])}, ${q(C)}, 'A'), (${q(comm[1])}, ${q(C)}, 'B'), (${q(uuid())}, ${q(OTHER)}, 'X');`)
const prod = uuid(); sql.push(`insert into products values (${q(prod)}, ${q(C)}, 'Course');`)
const page = uuid(); sql.push(`insert into onepages values (${q(page)}, ${q(C)}, null);`)
const recs = []
const tagsOf = () => (rnd() < 0.3 ? [pick(["vip", "Coach", "beta"])] : [])
for (let i = 0; i < 400; i++) {
  const kind = pick(["s", "k", "o", "b", "g", "e", "f", "l", "m", "c", "o", "s"])
  const id = uuid(), at = rnd() < 0.05 ? null : t(), em = rnd() < 0.1 ? null : pick(emails), nm = pick(names), u = pick(users)
  const E = rnd() < 0.3 && em ? "  " + em.toUpperCase() : em
  if (kind === "s") { const st = pick(["subscribed", "subscribed", "unsubscribed", "customer", "bounced"]); const act = rnd() < 0.9; const tg = tagsOf(); const det = pick([null, { surface: "onepage" }, { site: "x.com" }]); const src = pick([null, "creator_page", "checkout"])
    if (!em) continue
    if (recs.some((r) => r.kind === "subscriber" && r.email === normalizeEmail(em))) continue
    sql.push(`insert into subscribers (id, creator_id, email, name, source, source_detail, status, is_active, tags, subscribed_at, created_at) values (${q(id)}, ${q(C)}, ${q(em)}, ${q(nm)}, ${q(src)}, ${det ? q(JSON.stringify(det)) : "null"}, ${q(st)}, ${act}, ${arr(tg)}, ${q(at)}, ${q(at ?? "2025-01-01T00:00:00.000Z")});`)
    recs.push({ kind: "subscriber", id, userId: null, email: normalizeEmail(em), name: nm?.trim() || null, at: at ?? "2025-01-01T00:00:00.000Z", status: st, active: act, tags: tg, origin: det?.surface ?? (det?.site ? "website" : src === "creator_page" ? "profile" : src === "checkout" ? "checkout" : "unknown") }) }
  if (kind === "k") { if (!em) continue; sql.push(`insert into customers values (${q(id)}, ${q(C)}, ${q(em)}, ${q(nm)}, null, ${q(at ?? "2025-02-01T00:00:00.000Z")});`); recs.push({ kind: "customer", id, userId: null, email: normalizeEmail(em), name: nm?.trim() || null, at: at ?? "2025-02-01T00:00:00.000Z" }) }
  if (kind === "o") { const st = pick(["completed", "refunded", "pending"]); const uid = rnd() < 0.5 ? u : null; sql.push(`insert into orders values (${q(id)}, ${q(C)}, ${q(uid)}, ${q(E)}, ${q(nm)}, null, ${q(st)}, ${q(at)});`); if (st !== "pending") recs.push({ kind: "order", id, userId: uid, email: normalizeEmail(E), name: nm?.trim() || null, at, paid: true }) }
  if (kind === "b") { const st = pick(["active", "canceled"]); sql.push(`insert into memberships values (${q(id)}, ${q(C)}, ${q(u)}, ${q(em ?? "z@z.zz")}, ${q(nm)}, ${q(st)}, ${q(at)});`); recs.push({ kind: "membership", id, userId: u, email: normalizeEmail(em ?? "z@z.zz"), name: nm?.trim() || null, at, live: st === "active" }) }
  if (kind === "g") { const st = pick(["active", "pending", "banned"]); const cm = pick(comm), ti = rnd() < 0.5 ? pick(tiers) : null; sql.push(`insert into community_members values (${q(id)}, ${q(cm)}, ${q(u)}, ${q(st)}, 'member', ${q(ti)}, ${q(at)}, ${q(at ?? "2025-03-01T00:00:00.000Z")});`); recs.push({ kind: "community_member", id, userId: u, email: null, name: null, at: at ?? "2025-03-01T00:00:00.000Z", live: st === "active", communityId: cm, tierId: ti, memberStatus: st }) }
  if (kind === "e") { sql.push(`insert into course_enrollments values (${q(id)}, ${q(u)}, ${q(prod)}, ${q(at ?? "2025-04-01T00:00:00.000Z")});`); recs.push({ kind: "enrollment", id, userId: u, email: null, name: null, at: at ?? "2025-04-01T00:00:00.000Z" }) }
  if (kind === "f") { const st = pick(["new", "qualified"]); sql.push(`insert into form_submissions values (${q(id)}, ${q(OWNER)}, ${q(uuid())}, ${q(nm)}, ${q(em)}, ${q(st)}, ${q(at ?? "2025-05-01T00:00:00.000Z")});`); recs.push({ kind: "form_submission", id, userId: null, email: normalizeEmail(em), name: nm?.trim() || null, at: at ?? "2025-05-01T00:00:00.000Z", leadStatus: st }) }
  if (kind === "l") { if (!em) continue; sql.push(`insert into onepage_leads values (${q(id)}, ${q(page)}, ${q(em)}, ${q(nm)}, ${q(at ?? "2025-06-01T00:00:00.000Z")});`); recs.push({ kind: "lead", id, userId: null, email: normalizeEmail(em), name: nm?.trim() || null, at: at ?? "2025-06-01T00:00:00.000Z" }) }
  if (kind === "m") { if (!em) continue; sql.push(`insert into site_contact_messages values (${q(id)}, ${q(C)}, ${q(em)}, ${q(nm)}, null, ${q(at ?? "2025-07-01T00:00:00.000Z")});`); recs.push({ kind: "message", id, userId: null, email: normalizeEmail(em), name: nm?.trim() || null, at: at ?? "2025-07-01T00:00:00.000Z" }) }
  if (kind === "c") { const byUser = rnd() < 0.5; const uid = byUser ? u : null; const e2 = byUser ? null : normalizeEmail(em); if (!uid && !e2) continue; if (recs.some((r) => r.kind === "contact" && ((uid && r.userId === uid) || (e2 && r.email === e2)))) continue; const tg = tagsOf(); const src = pick(["manual", "import"]); sql.push(`insert into creator_contacts (id, creator_id, user_id, email_normalized, name, tags, source, created_at) values (${q(id)}, ${q(C)}, ${q(uid)}, ${q(e2)}, ${q(nm?.trim() || null)}, ${arr(tg)}, ${q(src)}, ${q(at ?? "2025-08-01T00:00:00.000Z")});`); recs.push({ kind: "contact", id, userId: uid, email: e2, name: nm?.trim() || null, at: at ?? "2025-08-01T00:00:00.000Z", tags: tg, origin: src }) }
}
/* noise from another creator that must never show */
sql.push(`insert into subscribers (creator_id, email, name) values (${q(OTHER)}, 'other@ex.com', 'Other');`)
try { execFileSync("psql", [...conn, "-d", db, "-q", "-v", "ON_ERROR_STOP=1", "-c", "truncate auth.users cascade; truncate creators, profiles, subscribers, customers, orders, memberships, communities, community_members, products, course_enrollments, form_submissions, onepages, onepage_leads, site_contact_messages, creator_contacts;" + sql.join("\n")], { stdio: ["ignore", "ignore", "pipe"] }) } catch (e) { console.log(String(e.stderr).slice(0, 500)); return 1 }
const accounts = new Map(profiles.map((p) => [p.id, { email: p.email, verified: p.ver, name: p.dn?.trim() || ("user" + p.id.slice(0, 4)) }]))
const people = mergePeople(recs, accounts)
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
const norm = (r) => sortKeys({ ...r, firstSeen: r.firstSeen ? Date.parse(r.firstSeen) : null, lastSeen: r.lastSeen ? Date.parse(r.lastSeen) : null, userId: r.userId ?? null })
const queries = []
for (const filter of ["all", "leads", "customers", "subscribers", "members"]) for (const sort of ["recent", "newest", "oldest", "name"]) queries.push({ filter, sort, q: "", page: 1, adv: {} })
queries.push({ filter: "all", sort: "recent", q: "p1@ex.com", page: 1, adv: {} }, { filter: "all", sort: "name", q: "p2@ex", page: 1, adv: {} }, { filter: "all", sort: "recent", q: "slb", page: 1, adv: {} }, { filter: "all", sort: "recent", q: "p2+slb-1a2b3c4d@ex.com", page: 1, adv: {} }, { filter: "all", sort: "recent", q: "businesses.invalid", page: 1, adv: {} })
queries.push({ filter: "all", sort: "recent", q: "p1", page: 1, adv: {} }, { filter: "all", sort: "name", q: "ana", page: 1, adv: {} }, { filter: "all", sort: "recent", q: "", page: 1, adv: { tag: "VIP" } }, { filter: "all", sort: "recent", q: "", page: 1, adv: { subscription: "unsubscribed" } }, { filter: "all", sort: "recent", q: "", page: 1, adv: { community: comm[0] } }, { filter: "all", sort: "recent", q: "", page: 1, adv: { access: "banned" } }, { filter: "all", sort: "recent", q: "", page: 1, adv: { bought: "no", forms: "yes" } }, { filter: "all", sort: "recent", q: "", page: 1, adv: { course: "yes" } }, { filter: "all", sort: "recent", q: "", page: 1, adv: { from: "2026-03-01", to: "2026-06-30" } }, { filter: "all", sort: "recent", q: "", page: 1, adv: { origin: "onepage" } }, { filter: "all", sort: "recent", q: "", page: 1, adv: { leadStatus: "qualified" } }, { filter: "all", sort: "recent", q: "", page: 1, adv: { tier: tiers[0] } })
let bad = 0
for (const qq of queries) {
  const adv = {}; for (const [k, v] of Object.entries({ origin: qq.adv.origin, tag: qq.adv.tag, sub: qq.adv.subscription, community: qq.adv.community, tier: qq.adv.tier, access: qq.adv.access, bought: qq.adv.bought, forms: qq.adv.forms, course: qq.adv.course, from: qq.adv.from, to: qq.adv.to, lead: qq.adv.leadStatus })) if (v) adv[k] = v
  const out = execFileSync("psql", [...conn, "-d", db, "-At", "-c", `select creator_people('${C}', '${qq.filter}', ${qq.q ? `'${qq.q}'` : "null"}, '${qq.sort}', 1000, 0, '${JSON.stringify(adv)}'::jsonb, null)`]).toString()
  const sqlRes = JSON.parse(out)
  const ts = pagePeople(people, { ...qq })
  const tsAll = (() => { const r = []; for (let p = 1; ; p++) { const pg = pagePeople(people, { ...qq, page: p }); r.push(...pg.rows); if (pg.rows.length < 50) break } return r })()
  const a = JSON.stringify(sqlRes.rows.map(norm)), b = JSON.stringify(tsAll.map(norm))
  const ok = a === b && sqlRes.total === ts.total && JSON.stringify(sortKeys(sqlRes.counts)) === JSON.stringify(sortKeys(ts.counts))
  if (!ok) { bad++; console.log("MISMATCH", JSON.stringify(qq), sqlRes.total, ts.total, JSON.stringify(sqlRes.counts), JSON.stringify(ts.counts)); const A = sqlRes.rows.map(norm), B = tsAll.map(norm); for (let i = 0; i < Math.max(A.length, B.length); i++) if (JSON.stringify(A[i]) !== JSON.stringify(B[i])) { console.log(" sql", JSON.stringify(A[i])); console.log(" ts ", JSON.stringify(B[i])); break } }
}
console.log(`people ${people.length}, records ${recs.length}, queries ${queries.length}, mismatches ${bad}`)
return bad
}
