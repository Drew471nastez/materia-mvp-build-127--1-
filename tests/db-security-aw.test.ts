/** Round AW (track C, database security): what anybody holding the public key or their own token could do straight through the REST API, past the app's routes. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { supabaseOnePageLookup } from "@/lib/onepage/address-lookup"
import { resolveOnePageAddress } from "@/lib/onepage/resolve-address"
import { readCode } from "./_source"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
/* A part is one header comment and then one whole statement per line: the statements, without the header. */
const statements = (p: string) => read(p).replace(/^\/\*[\s\S]*?\*\/\n/, "")
const header = (p: string) => (read(p).match(/^\/\*([\s\S]*?)\*\//) ?? ["", ""])[1]

const PARTS = {
  deletes: "452_deletes_through_the_server",
  onepage: "453_onepage_own_store_only",
  counters: "454_product_counters_server_owned",
} as const

console.log("\nEach part follows the run-now rules")
const checkAfter = read("supabase/sql/run-now/99_check_after.sql")
const readme = read("supabase/sql/run-now/README.md")
for (const name of Object.values(PARTS)) {
  const part = `supabase/sql/run-now/${name}.sql`
  const n = name.slice(0, 3)
  check(`${n}: the part is there`, existsSync(part))
  if (!existsSync(part)) continue
  const body = statements(part)
  const lines = body.split("\n").filter((l) => l.trim())
  check(`${n}: a first line comment, then one whole statement per line`, read(part).startsWith("/* ") && lines.every((l) => /;\s*$/.test(l)))
  check(`${n}: ends by reloading the API's schema`, lines[lines.length - 1] === "notify pgrst, 'reload schema';")
  check(`${n}: non destructive (no dropped table or column, no deleted, updated or truncated rows)`, !/\bDROP\s+(TABLE|COLUMN|SCHEMA|POLICY)\b|\bDELETE\s+FROM\b|\bUPDATE\s+(public\.)?[a-z_]+\s+SET\b|^\s*TRUNCATE\b|\bALTER\s+TABLE\b/im.test(body))
  check(`${n}: says it is safe to run again, and what it does not do`, /Safe to run again\./.test(header(part)) && /does NOT/.test(header(part)))
  check(`${n}: plain words (no em dash, none of the banned words)`, !/—/.test(read(part)) && !/\b(unlock|elevate|seamless|powerful|effortlessly|supercharge|transform)\b/i.test(read(part)))
  check(`${n}: the migration is the same file, byte for byte`, existsSync(`supabase/migrations/2027${n.padStart(4, "1")}_${name.slice(4)}.sql`) && read(`supabase/migrations/2027${n.padStart(4, "1")}_${name.slice(4)}.sql`) === read(part))
  check(`${n}: the README lists it`, readme.includes(`| \`${name}.sql\` |`))
  check(`${n}: the check after has its column`, new RegExp(`as p${name}[,;]`).test(checkAfter))
  check(`${n}: the bundles carry it`, read("supabase/sql/run-four/3_of_4_latest.sql").includes(`-- part ${name}.sql`) && read("supabase/sql/all-in-two/1_of_2_everything.sql").includes(`-- part ${name}.sql`))
}
check("the three columns are the last ones, in order", /as p451_explore_catalogue_index, [\s\S]* as p452_deletes_through_the_server, [\s\S]* as p453_onepage_own_store_only, [\s\S]* as p454_product_counters_server_owned;\s*$/.test(checkAfter))

/* ───────────────────────────────────────────────────────────────────────── */
console.log("\n452: a product, a store or a used AI site is not deleted with the browser key")
const p452 = statements(`supabase/sql/run-now/${PARTS.deletes}.sql`)
check("DELETE and TRUNCATE on products and creators are taken from anon and authenticated",
  /FOREACH t IN ARRAY ARRAY\['products', 'creators'\]/.test(p452) && /REVOKE DELETE, TRUNCATE ON public\.%I FROM PUBLIC, anon, authenticated/.test(p452))
check("  a table that is not there is skipped with a notice", /IF to_regclass\('public\.' \|\| t\) IS NULL THEN RAISE NOTICE 'part 452: public\.% does not exist here, skipped', t; CONTINUE; END IF;/.test(p452))
check("  nothing else is taken: reading, adding and editing stay", !/REVOKE[^;]*(SELECT|INSERT|UPDATE)/.test(p452))
check("a site with Storelib AI runs is refused on a browser key delete, before the rows go (BEFORE DELETE)",
  /CREATE TRIGGER sites_keep_ai_runs BEFORE DELETE ON public\.sites FOR EACH ROW EXECUTE FUNCTION public\.sites_keep_ai_runs\(\)/.test(p452) &&
    /IF current_user IN \('authenticated', 'anon'\) AND public\.storelib_site_has_ai_runs\(OLD\.id\) THEN RAISE EXCEPTION '[^']+' USING ERRCODE = '42501'; END IF; RETURN OLD;/.test(p452))
check("  the server (service role) and a cascade (the table's owner) are not in that list", !/service_role'/.test(p452.match(/sites_keep_ai_runs\(\) RETURNS trigger[^\n]*/)?.[0] ?? "service_role'"))
check("  the runs are read with the helper's own rights, whatever the caller may read",
  /FUNCTION public\.storelib_site_has_ai_runs\(p_site uuid\) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public/.test(p452) &&
    /EXISTS \(SELECT 1 FROM public\.site_agent_runs r WHERE r\.site_id = p_site\)/.test(p452))
check("  a database without the runs table answers no, never an error", /to_regclass\('public\.site_agent_runs'\) IS NULL THEN RETURN false/.test(p452))
check("  the helper is not the public key's to call; the trigger function is nobody's",
  /REVOKE ALL ON FUNCTION public\.storelib_site_has_ai_runs\(uuid\) FROM PUBLIC, anon;/.test(p452) &&
    /GRANT EXECUTE ON FUNCTION public\.storelib_site_has_ai_runs\(uuid\) TO authenticated, service_role;/.test(p452) &&
    /REVOKE ALL ON FUNCTION public\.sites_keep_ai_runs\(\) FROM PUBLIC, anon, authenticated;/.test(p452))
const check452 = checkAfter.slice(checkAfter.indexOf("as p451_explore_catalogue_index"), checkAfter.indexOf("as p452_deletes_through_the_server"))
check("  the check after reads the privileges and the trigger",
  /has_table_privilege\('anon', to_regclass\('public\.products'\), 'DELETE'\)/.test(check452) && /has_table_privilege\('authenticated', to_regclass\('public\.creators'\), 'DELETE'\)/.test(check452) && /tgname = 'sites_keep_ai_runs'/.test(check452))

/* What the app itself does, which the part must leave working. */
const CLIENT_DIRS = ["app", "components", "lib", "hooks"]
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name === "node_modules" || name.startsWith(".")) continue
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p)
  }
  return out
}
const all = CLIENT_DIRS.flatMap((d) => sources(d))
const browserFiles = all.filter((p) => {
  const src = read(p)
  return /^\s*["']use client["']/.test(src) || /from ["']@\/lib\/supabase\/(client|browser-lazy)["']/.test(src)
})
const browserDeletes = browserFiles.filter((p) => /\.from\(\s*["'`](products|creators|sites)["'`]\s*\)\s*\.delete\(/.test(readCode(p)))
check(`no page deletes a product, a store or a site with the browser key (${browserFiles.length} browser files read)`,
  browserFiles.length > 50 && browserDeletes.length === 1 && browserDeletes[0] === join("components", "app", "product-edit-form.tsx"))
check("  the one file that still would, the old product edit form, is used by no page",
  !all.some((p) => p !== join("components", "app", "product-edit-form.tsx") && /from ["']@\/components\/app\/product-edit-form["']|import\(["']@\/components\/app\/product-edit-form["']\)/.test(read(p))))
const deleteRoute = readCode("app/api/products/delete/route.ts")
check("the product delete the app uses is the server's, with the service role",
  /return \{ admin: createAdminClient\(\), creatorId: gate\.creatorId/.test(deleteRoute) && /deleteOwnProduct\(admin, \{ creatorId, productId \}\)/.test(deleteRoute))
check("  and it archives a product anybody bought instead of deleting it", /if \(hasSales\) return archive\("sales"\)/.test(readCode("lib/products/delete-product.ts")))
const account = readCode("lib/account/delete-account.ts")
const selfDelete = readCode("app/api/auth/delete-account/route.ts")
check("account deletion deletes a store with the service role, and only one with no money records",
  /const adminSupabase = createAdminClient\(\)/.test(selfDelete) && /deleteAccount\(adminSupabase, user\.id, "self"\)/.test(selfDelete) &&
    /if \(creatorId && \(await hasFinancialRecords\(admin, creatorId\)\)\) mode = "retired"/.test(account) && /await step\("creators", \(\) => admin\.from\("creators"\)\.delete\(\)\.eq\("id", creatorId\)\)/.test(account))
const projects = readCode("lib/sites/projects.ts")
const createSite = projects.slice(projects.indexOf("export async function createSite"), projects.indexOf("export async function", projects.indexOf("export async function createSite") + 10))
check("the one site delete with the creator's own key is the clean up of a site just made, before any AI run could exist",
  (projects.match(/\.from\("sites"\)\.delete\(\)/g) ?? []).length === 1 && /if \(filesError\) \{[\s\S]*await supabase\.from\("sites"\)\.delete\(\)\.eq\("id", site\.id\)/.test(createSite))
const quota = readCode("lib/sites/agent/run.ts")
check("the month's AI allowance is counted from site_agent_runs, which a site delete cascaded",
  /\.from\("site_agent_runs"\)\s*\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("creator_id", creatorId\)/.test(quota) && /site_id\s+UUID NOT NULL REFERENCES sites\(id\) ON DELETE CASCADE/.test(read("supabase/sql/RUN_CREATOR_PAGE_AND_SITES.sql")))

/* ───────────────────────────────────────────────────────────────────────── */
console.log("\n453: a OnePage names only its own owner's store")
const p453 = statements(`supabase/sql/run-now/${PARTS.onepage}.sql`)
check("the trigger runs on a new page and on any write naming a store or an owner",
  /CREATE TRIGGER onepages_own_store_only BEFORE INSERT OR UPDATE OF seller_id, creator_id, owner_id ON public\.onepages FOR EACH ROW EXECUTE FUNCTION public\.onepages_own_store_only\(\)/.test(p453))
check("  only for the browser key; the server writes as before", /IF current_user NOT IN \('authenticated', 'anon'\) THEN RETURN NEW; END IF;/.test(p453))
check("  a store the owner does not own keeps the old value on an update",
  /IF NEW\.seller_id IS DISTINCT FROM OLD\.seller_id AND NEW\.seller_id IS NOT NULL AND NOT public\.storelib_store_of_owner\(NEW\.seller_id, NEW\.owner_id\) THEN NEW\.seller_id := OLD\.seller_id; END IF;/.test(p453) &&
    /IF NEW\.creator_id IS DISTINCT FROM OLD\.creator_id AND NEW\.creator_id IS NOT NULL AND NOT public\.storelib_store_of_owner\(NEW\.creator_id, NEW\.owner_id\) THEN NEW\.creator_id := OLD\.creator_id; END IF;/.test(p453))
check("  and is left empty on a new page (the server fills an empty one with the owner's store)",
  /IF TG_OP = 'INSERT' THEN IF NEW\.seller_id IS NOT NULL AND NOT public\.storelib_store_of_owner\(NEW\.seller_id, NEW\.owner_id\) THEN NEW\.seller_id := NULL; END IF; IF NEW\.creator_id IS NOT NULL AND NOT public\.storelib_store_of_owner\(NEW\.creator_id, NEW\.owner_id\) THEN NEW\.creator_id := NULL; END IF;/.test(p453) &&
    /else if \(!onepage\.seller_id && creator\?\.id\) \{[\s\S]{0,200}\.update\(\{ seller_id: creator\.id, creator_id: creator\.id \}\)/.test(readCode("app/api/onepage/route.ts")))
check("  the owner's own store, or the owner's own account id (what the older onboarding wrote), is theirs",
  /SELECT p_store IS NOT NULL AND p_owner IS NOT NULL AND \(p_store = p_owner OR EXISTS \(SELECT 1 FROM public\.creators c WHERE c\.id = p_store AND c\.user_id = p_owner\)\)/.test(p453) &&
    /owner_id: user\.id,\s*creator_id: creator\.id,\s*seller_id: user\.id,/.test(read("components/app/creator-onboarding-modal.tsx")))
check("  the helper reads with its own rights and a fixed search path, and is not the public key's to call",
  /FUNCTION public\.storelib_store_of_owner\(p_store uuid, p_owner uuid\) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public/.test(p453) &&
    /REVOKE ALL ON FUNCTION public\.storelib_store_of_owner\(uuid, uuid\) FROM PUBLIC, anon;/.test(p453) &&
    /REVOKE ALL ON FUNCTION public\.onepages_own_store_only\(\) FROM PUBLIC, anon, authenticated;/.test(p453))
check("  skipped with a notice where a column it needs is missing (seller_id comes with part 165)",
  /column_name IN \('seller_id', 'creator_id', 'owner_id'\)\) < 3 THEN RAISE NOTICE 'part 453: [^']*part 165[^']*'; RETURN; END IF;/.test(p453))
check("  the header gives the query that lists pages already naming another login's store",
  /select o\.id, o\.slug, o\.owner_id, o\.seller_id, o\.creator_id from public\.onepages o where/.test(header(`supabase/sql/run-now/${PARTS.onepage}.sql`)))

/* The address, through the real lookup and resolver, on a stand in for the REST API. */
type Row = Record<string, unknown>
const DB: Record<string, Row[]> = {
  profiles: [
    { id: "u-mara", username: "mara" },
    { id: "u-ioan", username: "ioan" },
    { id: "u-eve", username: "eve" },
    { id: "u-solo", username: "solo" },
  ],
  creators: [
    { id: "c-mara", user_id: "u-mara" },
    { id: "c-ioan", user_id: "u-ioan" },
    { id: "c-eve", user_id: "u-eve" },
  ],
  onepages: [
    /* Eve's pages come first, as a table read may well return them: each names somebody else's store. */
    { id: "op-eve-1", slug: "free-gift", status: "published", seller_id: "c-mara", creator_id: "c-mara", owner_id: "u-eve" },
    { id: "op-eve-2", slug: "giveaway", status: "published", seller_id: null, creator_id: "c-ioan", owner_id: "u-eve" },
    /* Mara's own page, saved under an address that is not her username. */
    { id: "op-mara", slug: "mara-lind", status: "published", seller_id: "c-mara", creator_id: "c-mara", owner_id: "u-mara" },
    /* A page that names no store, found by the login that owns it. */
    { id: "op-solo", slug: "solo-page", status: "published", seller_id: null, creator_id: null, owner_id: "u-solo" },
  ],
  username_history: [],
  onepage_slug_history: [],
}
class StandIn {
  private filters: Array<(r: Row) => boolean> = []
  private max = Number.POSITIVE_INFINITY
  constructor(private rows: Row[]) {}
  eq(col: string, value: unknown) { this.filters.push((r) => r[col] !== null && r[col] !== undefined && String(r[col]) === String(value)); return this }
  ilike(col: string, pattern: string) {
    const re = new RegExp(`^${pattern.replace(/\\(.)/g, "$1").replace(/[.*+?^${}()|[\]]/g, "\\$&")}$`, "i")
    this.filters.push((r) => typeof r[col] === "string" && re.test(r[col] as string))
    return this
  }
  order() { return this }
  limit(n: number) { this.max = n; return this }
  maybeSingle() {
    const out = this.rows.filter((r) => this.filters.every((f) => f(r))).slice(0, this.max)
    return Promise.resolve(out.length > 1 ? { data: null, error: { code: "PGRST116", message: "more than one row" } } : { data: out[0] ?? null, error: null })
  }
}
const standIn = { from: (table: string) => ({ select: () => new StandIn(DB[table] ?? []) }) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lookup = supabaseOnePageLookup<Row>(standIn as any, "*")
const pageOf = async (name: string) => {
  const a = await resolveOnePageAddress<Row>(name, lookup)
  return a.kind === "page" ? String(a.page.id) : a.kind
}
async function addresses() {
  check("storelib.me/mara is Mara's own page, not a page somebody else pointed at her store", (await pageOf("mara")) === "op-mara")
  check("storelib.me/ioan (no OnePage of his own) is his creator page, not a page naming his store", (await pageOf("ioan")) === "creator")
  check("a page that names no store is still found by the login that owns it", (await pageOf("solo")) === "op-solo")
  check("Eve's own name still finds Eve's own page", (await pageOf("eve")) === "op-eve-1")
  check("a page's own address is unchanged", (await pageOf("mara-lind")) === "op-mara" && (await pageOf("free-gift")) === "op-eve-1")
  const found = readCode("lib/onepage/address-lookup.ts")
  check("  the lookup asks for the account's own pages by store, then by the login",
    /published\(\)\.eq\("seller_id", creator\.id\)\.eq\("owner_id", accountId\)\.limit\(1\)\.maybeSingle\(\)/.test(found) &&
      /published\(\)\.eq\("creator_id", creator\.id\)\.eq\("owner_id", accountId\)\.limit\(1\)\.maybeSingle\(\)/.test(found) &&
      /published\(\)\.eq\("owner_id", accountId\)\.limit\(1\)\.maybeSingle\(\)/.test(found))
}

/* ───────────────────────────────────────────────────────────────────────── */
function counters() {
  console.log("\n454: a product's sales, rating and views are Storelib's")
  const p454 = statements(`supabase/sql/run-now/${PARTS.counters}.sql`)
  check("a browser key write keeps the four counters on an update and starts a new product at 0",
    /IF current_user NOT IN \('authenticated', 'anon'\) THEN RETURN NEW; END IF; IF TG_OP = 'INSERT' THEN NEW\.sales_count := 0; NEW\.reviews_count := 0; NEW\.reviews_average := 0; NEW\.views := 0; ELSE NEW\.sales_count := OLD\.sales_count; NEW\.reviews_count := OLD\.reviews_count; NEW\.reviews_average := OLD\.reviews_average; NEW\.views := OLD\.views; END IF; RETURN NEW;/.test(p454))
  check("  it never refuses a save: every other column is written as sent", !/RAISE/.test(p454.match(/products_keep_counters\(\) RETURNS trigger[^\n]*/)?.[0] ?? "RAISE"))
  check("  on a new product, and on an update that names one of the four",
    /CREATE TRIGGER products_keep_counters BEFORE INSERT OR UPDATE OF sales_count, reviews_count, reviews_average, views ON public\.products FOR EACH ROW EXECUTE FUNCTION public\.products_keep_counters\(\)/.test(p454))
  check("  made only where all four columns are there", /column_name IN \('sales_count', 'reviews_count', 'reviews_average', 'views'\)\) < 4 THEN RAISE NOTICE/.test(p454))
  check("  the trigger function is nobody's to call", /REVOKE ALL ON FUNCTION public\.products_keep_counters\(\) FROM PUBLIC, anon, authenticated;/.test(p454))
  /* Storelib's own counting runs as the function's owner or the service role, which the trigger leaves alone. */
  check("Storelib's counting functions run with their owner's rights",
    /CREATE OR REPLACE FUNCTION increment_product_sales[\s\S]*?SECURITY DEFINER/i.test(read("scripts/021_complete_selling_flow.sql")) &&
      /FUNCTION increment_product_views[\s\S]*?SECURITY DEFINER/i.test(read("scripts/027_add_views_columns.sql")) &&
      /FUNCTION public\.update_product_review_stats\(\) RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER/i.test(read("supabase/sql/run-now/134_storelib_reviews.sql")))
  check("the same four were already kept from the browser on creators (part 63)", /storelib_keep_server_columns\([^)]*'reviews_average', 'reviews_count', 'views'/.test(read("supabase/sql/run-now/85_profiles_follows_notifications.sql")))
  check("Explore ranks by them, which is what made them worth faking", /\(a\.sales_count \|\| 0\) \* 5 \+ \(a\.reviews_count \|\| 0\) \* 3 \+ \(a\.reviews_average \|\| 0\) \* 2/.test(read("components/explore/explore-page-client.tsx")))
}

/* ───────────────────────────────────────────────────────────────────────── */
function minor() {
  console.log("\nLast round's audit: the AI job cancel route")
  const cancel = readCode("app/api/website-builder/ai-jobs/[jobId]/cancel/route.ts")
  check("both writes name the creator, not only the first", /\.update\(\{ cancel_requested_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", jobId\)\.eq\("creator_id", site\.creatorId\)/.test(cancel) && /\.update\(\{ lease_until: null \}\)\.eq\("id", jobId\)\.eq\("creator_id", site\.creatorId\)\.eq\("status", "queued"\)/.test(cancel))
}

async function main() {
  await addresses()
  counters()
  minor()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
