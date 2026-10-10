/**
 * ===========================================================================
 *  WHAT AN INDEX BUYS THE PUBLIC PAGES' HOTTEST LOOKUPS, ON A REAL PLANNER
 * ===========================================================================
 * Makes a throwaway database with the tables the public pages look up on
 * every visit, shaped as the repository's SQL makes them (the columns those
 * lookups read, and every index the repository's SQL creates on them), fills
 * them at the size of a platform with a few thousand creators, and times
 * each lookup as PostgREST asks it, with EXPLAIN ANALYZE, before and after
 * supabase/sql/run-now/127_public_lookup_indexes.sql. It prints the plan
 * each one used, so "after" is seen to be the index and not a warm cache.
 *
 *   SPEED18_PG="-h /tmp/pgs18 -U storelib" node scripts/measure-speed18-indexes.mjs
 *   PROFILES=300000 SPEED18_PG=... node scripts/measure-speed18-indexes.mjs
 *
 * Without SPEED18_PG it says so and stops.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const PG = process.env.SPEED18_PG || ""
if (!PG) {
  console.log("\n  (set SPEED18_PG to psql connection arguments, e.g. -h /tmp/pgs18 -U storelib)\n")
  process.exit(0)
}
const PROFILES = Number(process.env.PROFILES || 100_000)
const CREATORS = Number(process.env.CREATORS || 3_000)
const DB = "storelib_speed18_indexes"
const PART = join(process.cwd(), "supabase/sql/run-now/127_public_lookup_indexes.sql")
const args = PG.split(" ").filter(Boolean)
const psql = (sql, db = DB) => execFileSync("psql", [...args, "-d", db, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", maxBuffer: 1 << 28 }).trim()
const psqlFile = (file) => execFileSync("psql", [...args, "-d", DB, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], { encoding: "utf8" })

psql(`drop database if exists ${DB}`, "postgres")
psql(`create database ${DB}`, "postgres")

/* The tables and the indexes the repository's SQL gives them (scripts/0*.sql, supabase/sql/run-now). */
psql(`
create extension if not exists pg_trgm;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end $$;
create table public.profiles (id uuid primary key, username text, display_name text, avatar_url text, email text, created_at timestamptz default now());
create index idx_profiles_username on public.profiles(username) where username is not null;
create index idx_profiles_username_trgm on public.profiles using gin (username gin_trgm_ops) where username is not null;
create view public.profiles_public with (security_invoker = true) as select id, username, display_name, avatar_url, created_at from public.profiles;
create table public.creators (id uuid primary key, user_id uuid unique, slug text unique, display_name text);
create table public.onepages (id uuid primary key, slug text, status text, owner_id uuid, seller_id uuid, creator_id uuid, published_blocks jsonb default '[]');
create unique index onepages_slug_lower_unique on public.onepages (lower(slug));
create index idx_onepages_slug on public.onepages (slug) where slug is not null;
create index idx_onepages_owner on public.onepages (owner_id);
create table public.username_history (id uuid primary key default gen_random_uuid(), old_username text, new_username text, changed_at timestamptz default now());
create index idx_username_history_old_username on public.username_history (old_username);
`)

/* A few thousand creators among many more accounts (buyers, members), some names in mixed case as the old sign up kept them. */
psql(`
insert into public.profiles (id, username, display_name, email)
select gen_random_uuid(), case when g % 7 = 0 then initcap(n) else n end, 'Person ' || g, 'p' || g || '@example.com'
from (
  /* Names as people pick them: a word or two and sometimes digits, not one pattern with a counter. */
  select g, (array['maya','leo','studio','art','dj','the','shop','lab','nova','kai','zara','noah','luna','prints','coach','fit','design','sound','andre','mila'])[1 + (hashtext(g::text || 'a') & 1023) % 20]
    || (array['','_','.',''])[1 + (hashtext(g::text || 'b') & 1023) % 4]
    || substr(md5(g::text), 1, 2 + (hashtext(g::text || 'c') & 1023) % 4) || to_hex(g) as n
  from generate_series(1, ${PROFILES}) g
) names;
insert into public.creators (id, user_id, slug, display_name)
select gen_random_uuid(), p.id, lower(p.username), p.display_name from (select id, username, display_name from public.profiles order by random() limit ${CREATORS}) p;
insert into public.onepages (id, slug, status, owner_id, seller_id, creator_id)
select gen_random_uuid(), c.slug, 'published', c.user_id, c.id, c.id from public.creators c;
insert into public.username_history (old_username, new_username) select 'old' || g, 'user' || g from generate_series(1, ${Math.round(CREATORS / 3)}) g;
analyze;
`)

const someone = psql(`select username from public.profiles p join public.creators c on c.user_id = p.id where p.username <> lower(p.username) limit 1`)
/* A creator whose name starts with a common word (the trigram index cannot narrow it), and one whose name is rare. */
const common = psql(`select p.username from public.profiles p join public.creators c on c.user_id = p.id where p.username like 'the%' and p.username = lower(p.username) limit 1`)
const rare = psql(`select p.username from public.profiles p join public.creators c on c.user_id = p.id where p.username like 'coach%' and p.username = lower(p.username) limit 1`)
const creator = psql(`select c.id || ' ' || c.user_id from public.creators c offset ${Math.floor(CREATORS / 2)} limit 1`).split(" ")

/* As PostgREST asks them (the filter, the columns, the limit a maybeSingle brings). */
const LOOKUPS = [
  {
    name: "creator page: profile by its name in any case (loadProfileByUsername, every visit), as it was",
    sql: `select * from public.profiles_public where username ilike '${common}'`,
  },
  {
    name: "  the same, now: the exact name first (lib/profile/profile-by-name.ts), found",
    sql: `select * from public.profiles_public where username = '${common}'`,
  },
  {
    name: "  a name in another case than stored: the exact miss, then any case as before",
    sql: `select * from public.profiles_public where username = '${someone.toLowerCase()}'`,
    then: `select * from public.profiles_public where username ilike '${someone.toLowerCase()}'`,
  },
  {
    name: "member profile: the same lookup (/member/<handle>, loadMemberProfile)",
    sql: `select * from public.profiles_public where username ilike '${rare}'`,
  },
  {
    name: "OnePage: the account a name belongs to (storelib.me/<name> without a page of that name)",
    sql: `select id, username from public.profiles where username ilike '${someone.toLowerCase()}' limit 1`,
  },
  {
    name: "a renamed creator page or OnePage (username_history by the old name, any case)",
    sql: `select new_username from public.username_history where old_username ilike 'OLD12' order by changed_at desc limit 1`,
  },
  {
    name: "/app layout and Home: the owner's OnePage (every full load of /app)",
    sql: `select id, status from public.onepages where owner_id = '${creator[1]}' limit 2`,
  },
  {
    name: "OnePage of an account, by its creator (pageOfAccount)",
    sql: `select * from public.onepages where status = 'published' and seller_id = '${creator[0]}' limit 1`,
  },
]

function timeAll(label) {
  const out = []
  for (const q of LOOKUPS) {
    const runs = []
    let plan = ""
    for (let i = 0; i < 15; i++) {
      const json = JSON.parse(psql(`explain (analyze, format json) ${q.sql}`))[0]
      let ms = json["Execution Time"]
      if (i === 0) plan = summarize(json.Plan)
      if (q.then) {
        const second = JSON.parse(psql(`explain (analyze, format json) ${q.then}`))[0]
        ms += second["Execution Time"]
        if (i === 0) plan += `, then ${summarize(second.Plan)}`
      }
      runs.push(ms)
    }
    runs.sort((a, b) => a - b)
    out.push({ name: q.name, ms: runs[Math.floor(runs.length / 2)], plan })
  }
  return { label, out }
}

function summarize(node) {
  const bits = []
  const walk = (n) => {
    const kind = n["Node Type"]
    if (/Scan/.test(kind)) bits.push(`${kind}${n["Index Name"] ? ` ${n["Index Name"]}` : ""}${n["Relation Name"] ? ` on ${n["Relation Name"]}` : ""}`)
    for (const c of n.Plans ?? []) walk(c)
  }
  walk(node)
  return bits.join(" + ")
}

const before = timeAll("before")
let after = null
if (existsSync(PART)) {
  /* The part as the SQL editor runs it: one transaction, then again to show a second run changes nothing. */
  psqlFile(PART)
  psqlFile(PART)
  psql("analyze")
  after = timeAll("after part 127")
} else {
  console.log(`\n  (no ${PART} yet: before only)`)
}

console.log(`\n${PROFILES.toLocaleString()} profiles, ${CREATORS.toLocaleString()} creators, median of 15 runs (EXPLAIN ANALYZE execution time)\n`)
for (let i = 0; i < LOOKUPS.length; i++) {
  console.log(LOOKUPS[i].name)
  console.log(`  before  ${before.out[i].ms.toFixed(3).padStart(8)}ms   ${before.out[i].plan}`)
  if (after) console.log(`  after   ${after.out[i].ms.toFixed(3).padStart(8)}ms   ${after.out[i].plan}`)
}
if (!process.env.KEEP) psql(`drop database if exists ${DB}`, "postgres")
