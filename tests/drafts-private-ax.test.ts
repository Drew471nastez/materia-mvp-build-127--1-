/**
 * Round AX (track AX-2): a website's drafts and preview link are not public.
 *
 * The website builder's public read policies let the anon key (in every page
 * Storelib serves) and any signed in account read, for every published
 * website, store_theme_installs.preview_token (it opens the unpublished
 * preview), store_theme_settings.draft_settings and
 * store_theme_pages.draft_sections; the same shape on onepages gave the anon
 * key draft_blocks. SQL parts 463 and 464 close that with grants and a
 * narrower policy. Proven on the production shaped harness
 * (scripts/sql-harness): before, anon and a signed in stranger read all
 * three; after, anon is refused the private columns and still reads the
 * published ones, the stranger reads nothing, the owner reads and writes
 * their own.
 *
 * The SQL is safe only while no reader in the app needs those columns from
 * the anon key, or reads another creator's website on a signed in session.
 * The checks below pin both, so a later change that starts doing either
 * fails here instead of breaking a live site after the SQL has run.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (f === "node_modules" || f.startsWith(".")) return []
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.generated\.ts$/.test(f) ? [p] : []
  })
}
const sources = ["app", "lib", "components", "hooks"].flatMap(walk)
const codeOf = new Map<string, string>()
const code = (p: string) => {
  let c = codeOf.get(p)
  if (c === undefined) { c = readCode(p); codeOf.set(p, c) }
  return c
}

const THEME_TABLE = /from\(\s*["']store_theme_(installs|settings|pages)["']\s*\)/
const PRIVATE = /preview_token|draft_settings|draft_sections|draft_blocks|archived_blocks/

console.log("\nSQL part 463: the website builder's drafts and preview token")
const p463 = "supabase/sql/run-now/463_website_drafts_private.sql"
check("part 463 exists", existsSync(p463))
const s463 = existsSync(p463) ? read(p463) : ""
const lines463 = s463.split("\n").filter(Boolean)
check("  a first line comment, then one statement per line, then the schema reload", /^\/\*[\s\S]*\*\/$/.test(lines463[0] ?? "") && lines463.length === 5 && lines463[4] === "notify pgrst, 'reload schema';")
check("  same text as its migration", existsSync("supabase/migrations/20271463_website_drafts_private.sql") && read("supabase/migrations/20271463_website_drafts_private.sql") === s463)
const body463 = lines463.slice(1).join("\n")
check("  covers the three tables and their private columns", /store_theme_installs:preview_token/.test(body463) && /store_theme_settings:draft_settings/.test(body463) && /store_theme_pages:draft_sections/.test(body463))
check("  a missing table or column is skipped with a notice", /to_regclass\('public\.' \|\| t\) IS NULL THEN RAISE NOTICE/.test(body463) && /does not exist here, skipped', t, secret/.test(body463))
check("  takes SELECT from anon and gives back every column but the private one", /REVOKE SELECT ON public\.%I FROM anon/.test(body463) && /GRANT SELECT \(%s\) ON public\.%I TO anon/.test(body463) && /a\.attname <> secret/.test(body463))
check("  only when the anon key can read it today (never widens a table already closed)", /IF NOT has_column_privilege\('anon', format\('public\.%I', t\), secret, 'SELECT'\) THEN RAISE NOTICE/.test(body463))
check("  the public read policies become anon only, published reads only, never an owner or team policy", /ALTER POLICY %I ON public\.%I TO anon/.test(body463) && /!~ '\(auth\\\.\|team_\)'/.test(body463) && /~ 'published' THEN EXECUTE format\('ALTER POLICY/.test(body463))
check("  the owner keeps a read policy (made only when none reads auth.uid())", /_owner_select/.test(body463) && /qual, ''\) ~ 'auth\\\.uid\\\(\\\)'\) THEN CONTINUE/.test(body463))
check("  nothing destructive: no DROP, DELETE, UPDATE or TRUNCATE, no change to authenticated's grants", !/\bDROP\b|\bDELETE\s+FROM\b|\bUPDATE\s+public\.|\bTRUNCATE\b/i.test(body463) && !/(REVOKE|GRANT)[^;']*\b(authenticated|service_role)\b/.test(body463))

console.log("\nSQL part 464: a OnePage's unpublished blocks")
const p464 = "supabase/sql/run-now/464_onepage_drafts_private.sql"
check("part 464 exists", existsSync(p464))
const s464 = existsSync(p464) ? read(p464) : ""
const lines464 = s464.split("\n").filter(Boolean)
check("  a first line comment, one statement, the schema reload", /^\/\*[\s\S]*\*\/$/.test(lines464[0] ?? "") && lines464.length === 3 && lines464[2] === "notify pgrst, 'reload schema';")
check("  same text as its migration", existsSync("supabase/migrations/20271464_onepage_drafts_private.sql") && read("supabase/migrations/20271464_onepage_drafts_private.sql") === s464)
check("  draft_blocks and archived_blocks, only the ones that exist", /column_name IN \('draft_blocks', 'archived_blocks'\)/.test(s464) && /IF private IS NULL THEN RAISE NOTICE/.test(s464))
check("  SELECT given back to anon on every other column, only when anon can read them today", /REVOKE SELECT ON public\.onepages FROM anon/.test(s464) && /GRANT SELECT \(%s\) ON public\.onepages TO anon/.test(s464) && /IF NOT EXISTS \(SELECT 1 FROM unnest\(private\) s WHERE has_column_privilege\('anon'/.test(s464))
check("  no policy, no row and no signed in grant changed", !/POLICY|\bDROP\b|\bDELETE\s+FROM\b|\bUPDATE\s+public\.|\bTRUNCATE\b/i.test(lines464[1] ?? "") && !/authenticated/.test(lines464[1] ?? ""))

console.log("\nThe parts are listed and checked")
const readme = read("supabase/sql/run-now/README.md")
check("README rows for both, after part 461", readme.indexOf("| `463_website_drafts_private.sql`") > readme.indexOf("| `461_") && readme.indexOf("| `464_onepage_drafts_private.sql`") > readme.indexOf("| `463_"))
const after = read("supabase/sql/run-now/99_check_after.sql")
check("99_check_after reads both", /as p463_website_drafts_private/.test(after) && /as p464_onepage_drafts_private/.test(after))
check("  and its check is about the anon key's column privilege", /has_column_privilege\('anon', format\('public\.%I', c\.table_name\), c\.column_name, 'SELECT'\)\) and not exists/.test(after))
check("the bundle the owner pastes carries both", /part 463: the anon key no longer reads/.test(read("supabase/sql/all-in-two/1_of_2_everything.sql")) && /part 464: the anon key no longer reads/.test(read("supabase/sql/all-in-two/1_of_2_everything.sql")))

console.log("\nNo reader needs the private columns from the anon key")
const publicReaders = sources.filter((p) => /createPublicReadClient\(\)/.test(code(p)) && !/lib\/supabase\/public-read\.ts$/.test(p))
check("there are public (anon key) readers to look at", publicReaders.length >= 3)
const publicTheme = publicReaders.filter((p) => THEME_TABLE.test(code(p)) || PRIVATE.test(code(p)))
check("none of them reads a website builder table or a private column", publicTheme.length === 0)
if (publicTheme.length) console.log("    " + publicTheme.join("\n    "))
const browser = sources.filter((p) => /^\s*["']use client["']/.test(read(p)))
check("there are browser files to look at", browser.length > 50)
const browserTheme = browser.filter((p) => THEME_TABLE.test(code(p)) || /select\([^)]*preview_token/.test(code(p)))
check("no browser file reads a website builder table or the preview token straight from the database", browserTheme.length === 0)
if (browserTheme.length) console.log("    " + browserTheme.join("\n    "))
const facts = code("lib/website-builder/route-facts.ts")
check("the proxy's route facts (anon key when the server key is missing) read no private column", THEME_TABLE.test(facts) && !PRIVATE.test(facts))
const proxy = code("proxy.ts")
check("  and its OnePage lookup reads only id and slug", /supabaseOnePageLookup\(supabase, "id, slug"\)/.test(proxy) && !THEME_TABLE.test(proxy))

console.log("\nThe live site, previews and sitemaps read on the server key")
const render = code("app/(site)/w/[username]/render-site.tsx")
const preview = render.slice(render.indexOf("export async function previewInstall"))
check("a preview with its token is checked and drawn on the server key", /export async function previewInstall/.test(render) && /const admin = createAdminClient\(\)/.test(preview.slice(0, 200)) && /preview_token/.test(preview))
for (const p of ["app/(site)/w/[username]/preview/[token]/products/page.tsx", "app/(site)/w/[username]/preview/[token]/collections/page.tsx", "app/(site)/w/[username]/preview/[token]/collections/[handle]/page.tsx"]) {
  check(`  ${p.replace("app/(site)/w/[username]/preview/[token]/", "preview ")} reads through previewInstall's client`, /await previewInstall\(/.test(code(p)) && !/createClient\(\)|createPublicReadClient/.test(code(p)))
}
check("the published site reads on the server key", /createAdminClient\(\)/.test(code("lib/website-builder/published-site.ts")) && !/createPublicReadClient|await createClient\(\)/.test(code("lib/website-builder/published-site.ts")))
check("the sitemaps read on the server key", /createAdminClient\(\)/.test(code("lib/seo/sitemaps.ts")) && !/createPublicReadClient/.test(code("lib/seo/sitemaps.ts")))
check("the product page theme reads on the server key", /createAdminClient\(\)/.test(code("components/website-builder/theme/render-product.tsx")))

console.log("\nA signed in session reads only its own website")
const team = code("lib/team/website.ts")
check("a team member works on the server key, after the store check (never another account's session)", /const \{ createAdminClient \} = await import\("@\/lib\/supabase\/admin"\)/.test(team) && /db: createAdminClient\(\), creatorId: access\.creatorId/.test(team))
check("  the owner on their own session (the owner policies answer it)", /if \(access\.isOwner\) return \{ kind: "store", db: await createClient\(\)/.test(team))
const sessionReaders = sources.filter((p) => /from ["']@\/lib\/supabase\/server["']/.test(code(p)) && THEME_TABLE.test(code(p)))
check("there are session readers of the website tables to look at", sessionReaders.length >= 8)
const unscoped = sessionReaders.filter((p) => {
  const c = code(p)
  if (/\.eq\(\s*["']creator_id["']/.test(c)) return false
  /* Every read of the table on something other than the server key. */
  const reads = [...c.matchAll(/(\w+)\s*\.from\(\s*["']store_theme_(installs|settings|pages)["']\s*\)/g)]
  return reads.some((m) => !/^admin$/i.test(m[1]))
})
check("each one filters by the signed in creator or reads on the server key", unscoped.length === 0)
if (unscoped.length) console.log("    " + unscoped.join("\n    "))
const previewRoute = code("app/api/website-builder/themes/[installId]/preview/route.ts")
check("the preview link route reads the token for the store's own install only", /select\("id, preview_token"\)\.eq\("id", installId\)\.eq\("creator_id", site\.creatorId\)/.test(previewRoute))

console.log("\nSecurity notes record it, with what is still open")
const sec = read("docs/reliability/SECURITY.md")
check("finding AX-2 is listed with both parts and the open authenticated OnePage read", /\| AX-2 \|/.test(sec) && /part 463/.test(sec) && /Part 464/.test(sec) && /Still open: a signed in stranger reads another published OnePage's `draft_blocks`/.test(sec))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
