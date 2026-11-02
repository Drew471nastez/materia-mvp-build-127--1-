/**
 * ===========================================================================
 *  PRIVATE COLUMNS OF ACCOUNTS AND CREATORS STAY PRIVATE
 * ===========================================================================
 * Anyone with the public key could read every column of `profiles` and
 * `creators`: every account's email, role, home address and spam flags, and
 * every creator's Stripe ids, plan and payout settings. And a signed in
 * person could write their own plan, ban and role.
 *
 * Run-now part 63 grants the public key only the columns not on the private
 * lists, and a trigger keeps server owned columns the server's. That holds
 * only while the app never asks for a private column, or for `*`, through a
 * visitor's client: the database now refuses such a read outright, and the
 * page behind it would break. This suite checks the lists agree, and that
 * every read through a visitor's client names public columns only.
 *
 * Static, like tests/money-rows-server-only.test.ts: a client is a visitor's
 * unless it is called one of the names this codebase gives the service role.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { PRIVATE_CREATOR_COLUMNS, PRIVATE_PROFILE_COLUMNS, CREATOR_CARD, PROFILE_CARD, publicCreator, publicProfile } from "../lib/security/public-columns"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

const SERVER_CLIENTS = new Set(["admin", "adminSupabase", "supabaseAdmin", "adminClient", "db", "ctx.admin", "createAdminClient()", "svc", "service", "adminDb", "serviceClient", "dbClient", "deps.db"])
/* Files whose `supabase` is the service role, read here so a rename is noticed. */
const SUPABASE_IS_ADMIN = ["app/api/admin/blog/seo-metrics/route.ts", "lib/onepage/published-page.ts", "app/api/domains/resolve/route.ts", "lib/domains.ts"]

const sql = readFileSync("supabase/sql/run-now/63_private_columns.sql", "utf8")
const mirror = readFileSync("supabase/migrations/20261013_private_columns.sql", "utf8")
check("part 63 and its migration are the same text", sql === mirror)
/*
  THE PRIVATE LIST IS WHATEVER THE NEWEST PART SAYS IT IS. Part 63 wrote it
  first; parts 77 and 78 restate it in full with their own columns added
  (storelib_private_columns is CREATE OR REPLACE, so the last part run is the
  list the database holds). This compared the app's list with part 63's alone,
  so when part 77 made payments_status and last_stripe_sync_at private the app
  was never told and nothing here noticed. It reads the newest part now.
*/
const definesList = (f: string) => /FUNCTION public\.storelib_private_columns/.test(readFileSync(`supabase/sql/run-now/${f}`, "utf8"))
const newest = readdirSync("supabase/sql/run-now").filter((f) => /^\d+_.*\.sql$/.test(f) && definesList(f)).sort().pop()!
const latest = readFileSync(`supabase/sql/run-now/${newest}`, "utf8")
const listed = (table: string) => {
  const m = latest.match(new RegExp(`WHEN '${table}' THEN ARRAY\\[([^\\]]*)\\]`))
  return m ? m[1].split(",").map((s) => s.trim().replace(/'/g, "")) : []
}
check(`the newest part to write the list is the one read (${newest})`, newest >= "79_")
check("the creator list in the newest part is the app's list", JSON.stringify(listed("creators")) === JSON.stringify([...PRIVATE_CREATOR_COLUMNS]), listed("creators").join(","))
check("the profile list in the newest part is the app's list", JSON.stringify(listed("profiles")) === JSON.stringify([...PRIVATE_PROFILE_COLUMNS]), listed("profiles").join(","))
/* And a signed in creator cannot write the reset record either: the newest guard trigger names it. */
for (const c of ["stripe_previous_account_id", "stripe_account_reset_at", "stripe_account_reset_reason", "payments_status", "last_stripe_sync_at"]) {
  check(`a signed in creator cannot write ${c}`, new RegExp(`creators_keep_server_columns[^\\n]*'${c}'`).test(latest))
}
check("part 63 takes the whole table read away before granting column by column", sql.includes("REVOKE SELECT ON public.%I FROM anon, authenticated") && sql.includes("GRANT SELECT (%I) ON public.%I TO anon, authenticated"))
check("only the editor may re-run the granting", sql.includes("REVOKE ALL ON FUNCTION public.storelib_share_public_columns() FROM PUBLIC, anon, authenticated;"))
check("the sign in email helper answers for the caller only", /WHERE u\.id = p_user AND p_user = auth\.uid\(\)/.test(sql))
for (const c of ["subscription_plan_id", "stripe_account_id", "banned_at", "charges_enabled", "payouts_enabled", "reviews_count"]) {
  check(`a signed in creator cannot write ${c}`, new RegExp(`creators_keep_server_columns[^\\n]*'${c}'`).test(sql))
}
for (const c of ["role", "spam_state", "is_official", "is_verified", "is_staff"]) {
  check(`a signed in person cannot write their profile's ${c}`, new RegExp(`profiles_keep_server_columns[^\\n]*'${c}'`).test(sql))
}
check("profiles.email follows the sign in email", sql.includes("storelib_sign_in_email((newj ->> 'id')::uuid)"))
check("the check after says whether part 63 holds", readFileSync("supabase/sql/run-now/99_check_after.sql", "utf8").includes("as p63_private_columns"))
/*
  THE CHECK'S OWN LIST IS BOTH OF PART 63's LISTS. p63_private_columns reads
  false when any column the public key cannot read is missing from the list
  written into 99_check_after. Part 69 put stripe_requirements and its two
  dates on the creator list and the check was not told, so p63 read false
  on a database where part 63 held (found by scripts/sql-harness/run.sh).
*/
const p63 = readFileSync("supabase/sql/run-now/99_check_after.sql", "utf8").match(/not \(a\.attname::text = any \(ARRAY\[([^\]]*)\]\)\)\) as p63_private_columns/)
const p63List = p63 ? p63[1].split(",").map((s) => s.trim().replace(/'/g, "")) : []
const bothLists = [...listed("creators"), ...listed("profiles")]
check("the check after names every private column of both lists, and nothing else", p63List.length > 0 && JSON.stringify([...p63List].sort()) === JSON.stringify([...new Set(bothLists)].sort()), p63List.filter((c) => !bothLists.includes(c)).concat(bothLists.filter((c) => !p63List.includes(c))).join(","))

for (const c of CREATOR_CARD.split(",").map((s) => s.trim())) check(`the creator card names public ${c}`, !(PRIVATE_CREATOR_COLUMNS as readonly string[]).includes(c))
for (const c of PROFILE_CARD.split(",").map((s) => s.trim())) check(`the profile card names public ${c}`, !(PRIVATE_PROFILE_COLUMNS as readonly string[]).includes(c))
const cut = publicCreator({ id: "c", slug: "s", stripe_account_id: "acct_1", subscription_plan_id: "pro", support_email: "hi@x.com" }) as Record<string, unknown>
check("publicCreator keeps the public and drops the private", cut.slug === "s" && cut.support_email === "hi@x.com" && !("stripe_account_id" in cut) && !("subscription_plan_id" in cut))
const cutP = publicProfile({ id: "p", username: "u", email: "a@b.c", city: "Bucharest" }) as Record<string, unknown>
check("publicProfile drops email and address", cutP.username === "u" && !("email" in cutP) && !("city" in cutP))
check("publicCreator of nothing is nothing", publicCreator(null) === null)

/* ── Every read through a visitor's client ─────────────────────────────── */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** Columns a select names for a table, embedded selects included. `*` is a column here. */
function columnsFor(select: string, top: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (t: string, c: string) => { if (!out.has(t)) out.set(t, new Set()); out.get(t)!.add(c) }
  const walkSel = (s: string, table: string) => {
    const parts: string[] = []
    let depth = 0, buf = ""
    for (const ch of s) {
      if (ch === "(") depth++
      if (ch === ")") depth--
      if (ch === "," && depth === 0) { parts.push(buf); buf = "" } else buf += ch
    }
    parts.push(buf)
    for (let p of parts) {
      p = p.trim()
      const m = p.match(/^(?:\w+:)?(\w+)(?:!\w+)*\s*\(([\s\S]*)\)$/)
      if (m) { walkSel(m[2], m[1]); continue }
      p = p.replace(/^\w+:/, "").split("::")[0].trim()
      if (p) add(table, p)
    }
  }
  walkSel(select, top)
  return out
}

const PRIVATE: Record<string, Set<string>> = {
  creators: new Set(["*", ...PRIVATE_CREATOR_COLUMNS]),
  profiles: new Set(["*", ...PRIVATE_PROFILE_COLUMNS]),
}
const expand = (s: string) => s.replace(/\$\{CREATOR_WITH_PROFILE\}/g, "id, profile:profiles(id)").replace(/\$\{(PROFILE_CARD|CREATOR_CARD)\}/g, "id")
const selectRe = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?(?:\(\))?)\s*\.from\(\s*"(\w+)"\s*\)\s*\.select\(\s*(`[^`]*`|"[^"]*"|CREATOR_WITH_PROFILE|CREATOR_CARD|PROFILE_CARD)/g
const filterRe = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?(?:\(\))?)\s*\.from\(\s*"(creators|profiles)"\s*\)((?:\s*\.\w+\([^()]*(?:\([^()]*\))?[^()]*\))+)/g
const offenders: string[] = []
let reads = 0
for (const f of ["app", "lib", "components", "hooks"].flatMap((d) => walk(d))) {
  const src = readFileSync(f, "utf8")
  const adminNamedSupabase = SUPABASE_IS_ADMIN.includes(f)
  for (const m of src.matchAll(selectRe)) {
    const who = m[1]
    if (SERVER_CLIENTS.has(who) || (adminNamedSupabase && who === "supabase")) continue
    const raw = m[3].startsWith("`") || m[3].startsWith('"') ? m[3].slice(1, -1) : m[3] === "CREATOR_WITH_PROFILE" ? "id, profile:profiles(id)" : "id"
    const cols = columnsFor(expand(raw), m[2])
    for (const t of ["creators", "profiles"]) {
      for (const c of cols.get(t) ?? []) {
        reads++
        if (PRIVATE[t].has(c)) offenders.push(`${f}:${src.slice(0, m.index).split("\n").length} ${t}.${c} through ${who}`)
      }
    }
  }
  for (const m of src.matchAll(filterRe)) {
    const who = m[1]
    if (SERVER_CLIENTS.has(who) || (adminNamedSupabase && who === "supabase")) continue
    for (const fm of m[3].matchAll(/\.(eq|neq|is|in|ilike|like|not|order|gte|lte|gt|lt|match|filter|contains)\(\s*"([\w.]+)"/g)) {
      if (PRIVATE[m[2]].has(fm[2])) offenders.push(`${f}:${src.slice(0, m.index).split("\n").length} filters ${m[2]}.${fm[2]} through ${who}`)
    }
    if (/\.(update|upsert|insert)\([\s\S]*?\)\s*\.select\(\s*\)/.test(m[3])) offenders.push(`${f}: writes ${m[2]} and reads every column back through ${who}`)
  }
}
check(`visitor reads of creators and profiles were found (${reads})`, reads > 150, "the scan found almost nothing, so the pattern is broken")
check("no visitor client reads, filters on, or returns a private column or `*` of creators or profiles", offenders.length === 0, offenders.join("; "))

for (const f of SUPABASE_IS_ADMIN) check(`${f} still reads with the service role`, /const supabase = createAdminClient\(\)/.test(readFileSync(f, "utf8")))

const login = readFileSync("app/(auth)/login/page.tsx", "utf8")
check("the login page no longer looks an account up by email from the browser", !/from\("profiles"\)[\s\S]{0,80}\.eq\("email"/.test(login) && login.includes("/api/auth/unconfirmed-account"))
const unconfirmed = readFileSync("app/api/auth/unconfirmed-account/route.ts", "utf8")
check("  and the server answers only after the password is right", unconfirmed.includes("signInWithPassword") && unconfirmed.includes("email not confirmed") && unconfirmed.includes("rateLimit("))
const page = readFileSync("app/(marketing)/u/[username]/page.tsx", "utf8")
/* Changed on purpose (round 49): the creator page reads no address at all; /api/creator-contact reads the sign in email on the server for a buyer. */
check("a creator page reads the sign in email on the server, never from the public profile row", !page.includes("profile.email") && !page.includes("loadAccountEmail") && readFileSync("app/api/creator-contact/route.ts", "utf8").includes("loadAccountEmail(userId)"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
