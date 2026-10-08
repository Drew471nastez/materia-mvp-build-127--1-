/**
 * A website's own Supabase: only a project URL and a PUBLIC key, refused
 * when it is a secret one, and handed only to a section that declares the
 * database capability.
 *
 *   npx tsx tests/own-database.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { OWN_DB_KEY, OWN_DB_URL, checkDatabaseUrl, checkPublicKey, ownDatabase } from "@/lib/website-builder/own-database"
import { GUEST_SOURCE } from "@/lib/storelib-theme/sandbox/guest-source"
import { CAPABILITIES } from "@/lib/storelib-theme/storelib/script"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = (role: string) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", ref: "abcd", role })}.signature`

console.log("\nThe address\n")
{
  check("a project URL is kept as its origin", (checkDatabaseUrl("https://abcd.supabase.co/rest/v1/") as { value: string }).value === "https://abcd.supabase.co")
  check("  http is refused", !checkDatabaseUrl("http://abcd.supabase.co").ok)
  check("  so is an address with a password in it", !checkDatabaseUrl("https://u:p@abcd.supabase.co").ok)
  check("  and words that are not an address", !checkDatabaseUrl("my project").ok)
}

console.log("\nThe key: public only\n")
{
  check("the anon key is taken", checkPublicKey(jwt("anon")).ok)
  check("  a publishable key is taken", checkPublicKey("sb_publishable_abcDEF123456").ok)
  const service = checkPublicKey(jwt("service_role"))
  check("  the service role key is refused, and the reason says why", !service.ok && /secret key/.test((service as { error: string }).error))
  check("  an sb_secret_ key is refused", !checkPublicKey("sb_secret_abcDEF123456").ok)
  check("  so is anything that is not a key", !checkPublicKey("hello").ok)
}

console.log("\nWho gets it\n")
{
  const settings = { [OWN_DB_URL]: "https://abcd.supabase.co", [OWN_DB_KEY]: jwt("anon") }
  check("a site with both gets a connection", ownDatabase(settings)?.url === "https://abcd.supabase.co")
  check("  a secret key stored some other way is still never handed out", ownDatabase({ ...settings, [OWN_DB_KEY]: jwt("service_role") }) === null)
  check("  half a connection is none", ownDatabase({ [OWN_DB_URL]: "https://abcd.supabase.co" }) === null)
  check("database is a capability a section declares", (CAPABILITIES as readonly string[]).includes("database"))
  const host = read("components/website-builder/sections/section-sandbox.tsx")
  check("  the page decides, not the section: declared and public, or nothing", /database: section\.capabilities\.includes\("database"\) \? ownDatabase\(section\.theme\) : null/.test(host))
}

console.log("\nInside the sandbox\n")
{
  check("the guest still parses", (() => { try { new Function(GUEST_SOURCE); return true } catch { return false } })())
  check("  storelib.database exists only when declared and connected", /capabilities\.indexOf\("database"\) !== -1 && database/.test(GUEST_SOURCE))
  check("  it reaches only that project's REST and RPC, by name", /db\.url \+ path/.test(GUEST_SOURCE) && /"\/rest\/v1\/" \+ name\(table, "table"\)/.test(GUEST_SOURCE) && /"\/rest\/v1\/rpc\/" \+ name\(fn, "function"\)/.test(GUEST_SOURCE))
  check("  a table name is a name, never a path or a host", /var NAME = \/\^\[A-Za-z_\]\[A-Za-z0-9_\]\{0,62\}\$\//.test(GUEST_SOURCE))
  check("  and a script still cannot say fetch itself", /"fetch"/.test(read("lib/storelib-theme/storelib/script.ts")))
}

console.log("\nThe setting\n")
{
  const ui = read("components/website-builder/website-settings/own-database.tsx")
  check("Connections has the row, after Code", /<OwnDatabaseSettings ctx=\{ctx\} \/>/.test(read("components/website-builder/website-settings/connections.tsx")))
  // Changed on purpose: Connect Supabase signs in and picks a project, and its
  // key is checked on the server (lib/website-builder/supabase-connect.ts,
  // checkPublicKey). The typed form, kept for a Storelib with no OAuth app,
  // still checks both before saving.
  const typed = ui.slice(ui.indexOf("const save = () =>"))
  check("  it checks both before saving anything", typed.indexOf("checkDatabaseUrl(url)") < typed.indexOf("ctx.onSettingChange(OWN_DB_URL") && typed.indexOf("checkPublicKey(") < typed.indexOf("ctx.onSettingChange(OWN_DB_KEY"))
  const server = read("lib/website-builder/supabase-connect.ts")
  check("  a picked project's key goes through checkPublicKey on the server", /const checked = checkPublicKey\(k\.api_key\)/.test(server))
  check("  and the Supabase token never reaches the browser", /httpOnly: true/.test(read("app/api/website-builder/supabase/callback/route.ts")) && !/token/.test(ui.replace(/csrf/g, "")))
  check("  and the saved key is never shown back", /placeholder=\{connected \? "Leave empty to keep the current key"/.test(ui) && /useState\(""\)/.test(ui))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
