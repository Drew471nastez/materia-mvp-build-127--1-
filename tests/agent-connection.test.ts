/**
 * ===========================================================================
 *  CLAUDE CODE, CODEX OR ANY AGENT, CONNECTED TO ONE STORELIB SITE
 * ===========================================================================
 * A creator makes a connection under Website settings › Connections and gets
 * a token, once. With it an agent can list, read, compile and write that
 * site's section files, over MCP (app/api/mcp) or plain HTTP
 * (app/api/agent/v1), and nothing else.
 *
 * What this pins:
 *   the token      shown once, stored as a hash, checked in constant time
 *   the scope      one site; section files only; every write a draft, held
 *                  to exactly the code editor's rules; no delete, no publish
 *   the protocol   MCP's JSON-RPC answered correctly, including the parts a
 *                  client depends on without saying so: version
 *                  negotiation, silence for notifications
 *   the canvas     a new section an agent writes is put on the open page
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { hashToken, looksLikeToken, mintToken, TOKEN_PREFIX } from "@/lib/agent-access/token-format"
import { WRITABLE, canWrite, compileOnly } from "@/lib/agent-access/operations"
import { PROTOCOL_VERSIONS, TOOLS, formatErrors, handleMcp, type BoundOps } from "@/lib/agent-access/mcp"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** Operations that record what they were asked, standing in for a site. */
function fakeOps() {
  const calls: string[] = []
  const ops: BoundOps = {
    siteName: "Astrid Studio",
    agentName: "Claude Code",
    list: async () => ({ ok: true, value: { framework: { engine: 1, schema: 1 }, docs: "d", writable: "sections/<type>.storelib", files: [{ path: "sections/hero.storelib", origin: "theme", unpublished: false }] } }),
    read: async (path) => {
      calls.push(`read ${path}`)
      return path === "sections/missing.storelib"
        ? { ok: false, status: 404, error: "There is no sections/missing.storelib in this theme" }
        : { ok: true, value: { path, source: "<template></template>", origin: "yours", updated_at: "2026-09-23T10:00:00Z" } }
    },
    compile: (path) =>
      path.includes("broken")
        ? { ok: false, status: 422, error: `${path} did not compile`, errors: [{ stage: "template", file: path, line: 4, message: "Unclosed {% if %}" }] }
        : { ok: true, value: { path, warnings: [] } },
    write: async (path, _source, base) => {
      calls.push(`write ${path} ${base ?? "-"}`)
      return { ok: true, value: { path, type: "pricing", created: true, drafted: true, updated_at: "2026-09-23T10:01:00Z" } }
    },
    guide: () => "THE GUIDE",
  }
  return { ops, calls }
}

const textOf = (r: unknown) =>
  ((r as { result?: { content?: { text?: string }[] } })?.result?.content?.[0]?.text) ?? ""

async function main() {
  console.log("\nThe token")

  const a = mintToken()
  const b = mintToken()
  check("it looks like what it is", a.token.startsWith(TOKEN_PREFIX) && looksLikeToken(a.token))
  check("two are never the same", a.token !== b.token && a.hash !== b.hash)
  check("what is stored is its SHA-256, not it", a.hash === hashToken(a.token) && /^[0-9a-f]{64}$/.test(a.hash) && !a.hash.includes(a.token))
  check("the prefix shown in the list is not enough to use it", a.prefix.length === 10 && a.token.startsWith(a.prefix) && !looksLikeToken(a.prefix))
  check("anything else is refused before the database is asked",
    !looksLikeToken("slb_short") && !looksLikeToken("Bearer x") && !looksLikeToken(`slb_${"a".repeat(42)}!`))

  const tokens = read("lib/agent-access/tokens.ts")
  check("it is looked up by hash and compared in constant time",
    /\.eq\("token_hash", hash\)/.test(tokens) && /timingSafeEqual\(/.test(tokens))
  check("a disconnected token stops working", /row\.revoked_at/.test(tokens))
  check("each connection is rate limited", /bucket: "agent"/.test(tokens) && /token:\$\{row\.id\}/.test(tokens))
  check("the token never reaches a log", !/console\.(log|warn|error)\([^)]*token\b/.test(tokens))

  const sql = read("supabase/sql/RUN_AGENT_CONNECTIONS.sql")
  check("the database keeps the hash, not the token", /token_hash\s+TEXT NOT NULL UNIQUE/.test(sql) && !/\btoken\s+TEXT/.test(sql))
  check("and no browser can read the hash, its owner included",
    /REVOKE ALL ON theme_agent_tokens FROM anon, authenticated;/.test(sql)
      && /GRANT SELECT \(id, install_id, creator_id, name, prefix, created_at, last_used_at, revoked_at\)/.test(sql)
      && !/GRANT SELECT \([^)]*token_hash/.test(sql))
  check("a creator reads only their own connections and activity",
    (sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 2 && /auth\.uid\(\)/.test(sql))
  check("the activity table exists before anything is revoked on it",
    sql.indexOf("CREATE TABLE IF NOT EXISTS theme_agent_activity") < sql.indexOf("ON theme_agent_activity FROM anon"))
  check("the migration and the file to paste are the same",
    sql === read("supabase/migrations/20260923_agent_connections.sql"))
  check("it changes nothing that already exists", !/ALTER TABLE (?!theme_agent_)/i.test(sql) && !/DROP TABLE/i.test(sql))

  console.log("\nWhat an agent may write")

  for (const ok of ["sections/pricing.storelib", "sections/faq_v2.storelib", "sections/hero-split.storelib"]) {
    check(`may write ${ok}`, canWrite(ok))
  }
  for (const no of [
    "templates/index.json", "config/settings_data.json", "layout/theme.storelib", "snippets/x.storelib",
    "sections/../config/x.storelib", "/sections/x.storelib", "sections/Pricing.storelib", "sections/x.liquid",
    "sections/a/b.storelib", "sections/.storelib", "sections\\x.storelib",
  ]) {
    check(`may not write ${no}`, !canWrite(no))
  }
  check("the rule is one expression, the same for MCP and HTTP", WRITABLE.source === "^sections\\/[a-z0-9_-]{1,64}\\.storelib$")

  const good = read("content/developers/examples/signup_card.storelib")
  const compiled = compileOnly("sections/signup_card.storelib", good)
  check("compiling a good file says so and stores nothing", compiled.ok === true)
  const bad = compileOnly("sections/signup_card.storelib", good.replace("{% endif %}", ""))
  check("a broken one comes back with file, line and message",
    bad.ok === false && bad.status === 422 && (bad.errors?.length ?? 0) > 0 && /signup_card\.storelib:\d+ /.test(formatErrors(bad.errors)))
  check("compile will not take a path that is not a section file", compileOnly("config/x.json", "{}").ok === false)

  const ops = read("lib/agent-access/operations.ts")
  check("a write is saved by the code editor's own save", /await saveThemeFile\(db, who\.installId, path, source, \{ baseUpdatedAt \}\)/.test(ops))
  check("which is a draft, and never publishes", /saveDraft\(db, installId, path, content\)/.test(read("lib/website-builder/save-theme-file.ts")) && !/promoteFileDrafts|publish\(/.test(ops))
  check("there is no delete and no rename", !/\.delete\(\)|DELETE|rename/i.test(ops.replace(/\/\*[\s\S]*?\*\//g, "")))
  check("every operation is scoped to the connection's own site",
    /listFiles\(db, who\.installId\)|list: \(\) => listFiles\(db, who\.installId\)/.test(read("lib/agent-access/bind.ts"))
      && /readFile\(db, who\.installId, path\)/.test(read("lib/agent-access/bind.ts")))
  check("a write is logged for the open builder, and the log can never fail it",
    /from\("theme_agent_activity"\)\.insert\(/.test(ops) && /catch \{\s*\/\* the table may not exist yet; the save stands \*\/\s*\}/.test(ops))

  console.log("\nThe code editor saves through the same function")

  const route = read("app/api/website-builder/themes/[installId]/files/route.ts")
  check("its PUT delegates to saveThemeFile", /await saveThemeFile\(supabase, installId, path, content, \{/.test(route))
  check("and holds no second copy of the rules", !/async function sectionNamesInUse/.test(route) && !/const saved = await saveDraft\(/.test(route))

  console.log("\nMCP, as a client expects it")

  const { ops: fake, calls } = fakeOps()
  const init = await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, fake)
  const initResult = (init as { result?: Record<string, unknown> })?.result ?? {}
  check("it answers initialize in the version the client asked for", initResult.protocolVersion === "2025-03-26")
  const newer = await handleMcp({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } }, fake)
  check("and in its newest when it does not know the client's",
    (newer as { result?: { protocolVersion?: string } })?.result?.protocolVersion === PROTOCOL_VERSIONS[0])
  check("it says it has tools, and who it is", JSON.stringify(initResult.capabilities) === JSON.stringify({ tools: { listChanged: false } })
    && (initResult.serverInfo as { name?: string })?.name === "storelib")
  check("and tells the agent where it is and what to read first",
    /Astrid Studio/.test(String(initResult.instructions)) && /storelib_guide/.test(String(initResult.instructions)))
  check("a notification gets no answer at all",
    (await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, fake)) === null)
  check("ping is answered", JSON.stringify((await handleMcp({ jsonrpc: "2.0", id: 3, method: "ping" }, fake)) as object).includes('"result":{}'))
  const unknown = await handleMcp({ jsonrpc: "2.0", id: 4, method: "resources/list" }, fake)
  check("an unknown method is -32601", (unknown as { error?: { code: number } })?.error?.code === -32601)
  check("a malformed message is -32600", ((await handleMcp({ id: 5, method: "ping" }, fake)) as { error?: { code: number } })?.error?.code === -32600)

  const list = await handleMcp({ jsonrpc: "2.0", id: 6, method: "tools/list" }, fake)
  const names = ((list as { result?: { tools?: { name: string }[] } })?.result?.tools ?? []).map((t) => t.name)
  check("it offers exactly five tools", JSON.stringify(names) === JSON.stringify(["storelib_guide", "storelib_list_files", "storelib_read_file", "storelib_compile", "storelib_write_section"]))
  check("each with a JSON schema that allows nothing extra",
    TOOLS.every((t) => t.inputSchema.type === "object" && t.inputSchema.additionalProperties === false))
  check("and nothing named delete, publish or rename", !names.some((n) => /delete|publish|rename|remove/.test(n)))

  const call = (name: string, args: Record<string, unknown> = {}) =>
    handleMcp({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } }, fake)
  check("the guide is the framework's own text", textOf(await call("storelib_guide")) === "THE GUIDE")
  check("reading gives the source and when it was saved", /updated_at 2026-09-23T10:00:00Z/.test(textOf(await call("storelib_read_file", { path: "sections/hero.storelib" }))))
  const missing = await call("storelib_read_file", { path: "sections/missing.storelib" })
  check("a failure is a tool result with isError, which the agent reads, not a protocol error",
    (missing as { result?: { isError?: boolean } })?.result?.isError === true && /There is no/.test(textOf(missing)))
  const broken = await call("storelib_compile", { path: "sections/broken.storelib", source: "x" })
  check("compile errors come back as file:line message, ready to fix",
    /sections\/broken\.storelib:4 Unclosed \{% if %\}/.test(textOf(broken)))
  const wrote = await call("storelib_write_section", { path: "sections/pricing.storelib", source: "x", base_updated_at: "T" })
  check("a write passes the version it was based on", calls.includes("write sections/pricing.storelib T"))
  check("and says it is a draft, where it will appear, and that the creator publishes",
    /saved as a draft, a new section/.test(textOf(wrote)) && /on their page now/.test(textOf(wrote)) && /when they publish/.test(textOf(wrote)))
  check("an unknown tool is -32602", ((await call("storelib_delete_file")) as { error?: { code: number } })?.error?.code === -32602)

  const mcpRoute = read("app/api/mcp/route.ts")
  check("the MCP route authenticates before it reads the body",
    mcpRoute.indexOf("await authenticateAgent(request)") < mcpRoute.indexOf("await request.text()"))
  check("caps the body and the batch", /MAX_BODY/.test(mcpRoute) && /\.slice\(0, 20\)/.test(mcpRoute))
  check("answers a batch of notifications with 202 and nothing", /status: 202/.test(mcpRoute))
  check("and says it has no stream on GET", /status: 405/.test(mcpRoute))
  for (const file of ["app/api/agent/v1/files/route.ts", "app/api/agent/v1/compile/route.ts"]) {
    const src = read(file)
    check(`${file.replace("app/api/", "")} authenticates first in every handler`,
      (src.match(/export async function (GET|PUT|POST)/g) ?? []).length === (src.match(/const who = await authenticateAgent\(request\)\n\s*if \(who instanceof NextResponse\) return who/g) ?? []).length)
  }

  console.log("\nThe creator's side")

  const manage = read("app/api/website-builder/themes/[installId]/agent-connections/route.ts")
  check("only the site's owner can make, list or disconnect one",
    /\.eq\("creator_id", creator\.id\)/.test(manage) && (manage.match(/const own = await ownInstall\(installId\)/g) ?? []).length === 3)
  check("the token is returned once, at creation, and the list never has it",
    /return NextResponse\.json\(\{ connection: data, token: minted\.token \}\)/.test(manage)
      && /\.select\("id, name, prefix, created_at, last_used_at"\)/.test(manage) && !/select\([^)]*token_hash/.test(manage))
  check("disconnecting is scoped to the site too", /\.eq\("id", id\)\s*\.eq\("install_id", own\.installId\)/.test(manage))
  check("a site holds a bounded number", /MAX_CONNECTIONS = 10/.test(manage))

  const panel = read("components/website-builder/agent-connections-panel.tsx")
  check("Website settings has a Connections page", /id: "agents", label: "Connections"/.test(read("components/website-builder/project-settings.tsx")))
  check("which shows the token once, with the lines that use it",
    /It is not shown again/.test(panel) && /claude mcp add --transport http storelib/.test(panel) && /bearer_token_env_var = "STORELIB_TOKEN"/.test(panel))
  check("the token lives in memory only", !/localStorage|sessionStorage/.test(panel))
  check("disconnecting asks first", /confirmingId === c\.id/.test(panel))

  console.log("\nA section an agent writes appears on the open page")

  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the builder asks what agents wrote, only while it is showing",
    /agent-activity\$\{after\}/.test(editor) && /document\.visibilityState === "visible"/.test(editor))
  check("the first answer is a cursor, so nothing old is replayed",
    /if \(after === null\)/.test(read("app/api/website-builder/themes/[installId]/agent-activity/route.ts")))
  check("a new section is placed above the footer, undoably, with the arrival animation, and named",
    /placeWrittenSection\(previous, writingAnchor\(previous\), instanceFromSchema\(id, type, schema\)\)/.test(editor)
      && /setArrivedId\(id\)/.test(editor) && /\$\{ev\.agent_name\} added \$\{label\}/.test(editor))
  check("never twice", /!sectionsRef\.current\.some\(\(sec\) => sec\.type === type\)/.test(editor))
  check("and it stops asking on a database without the tables", /d\.ready === false\) return/.test(editor))

  console.log("\nThe docs say how")

  const ai = read("content/developers/ai.md")
  check("the AI agents page explains connecting", /## Connect an agent directly/.test(ai) && /claude mcp add --transport http storelib/.test(ai) && /storelib_write_section/.test(ai))
  check("and no longer says it is not available", !/is not available yet/.test(ai))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
void main()
