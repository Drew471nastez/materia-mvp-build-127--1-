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
import { WRITABLE, canWrite, compileOnly, publicError } from "@/lib/agent-access/operations"
import { PROTOCOL_VERSIONS, TOOLS, formatErrors, handleMcp, type BoundOps } from "@/lib/agent-access/mcp"
import { briefFrom } from "@/lib/agent-access/site-brief"
import { readBodyCapped } from "@/lib/agent-access/body"
import { FIRST_ASK, afterSetup, detectOs, openTerminalGuide, setupCommands } from "@/lib/agent-access/setup-commands"
import { agentStatus, toolForName } from "@/components/website-builder/agent-connections-panel"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

/** Operations that record what they were asked, standing in for a site. */
function fakeOps() {
  const calls: string[] = []
  const ops: BoundOps = {
    siteName: "Astrid Studio",
    agentName: "Claude Code",
    list: async () => ({ ok: true, value: { framework: { engine: 1, schema: 1 }, docs: "d", writable: "sections/<type>.storelib", files: [{ path: "sections/hero.storelib", origin: "theme", writable: false, unpublished: false }] } }),
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
    site: async () => {
      calls.push("site")
      return { ok: true, value: briefFrom({ name: "Astrid Studio", address: "https://astrid.storelib.com", live: true, settings: { brand_name: "Astrid" }, pages: [], products: [] }) }
    },
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

  /* The two theme settings files are Shopify's way of changing Theme settings, checked on save (lib/storelib-theme/theme-config.ts). */
  for (const ok of ["sections/price_table.storelib", "sections/faq_v2.storelib", "sections/hero-split.storelib", "config/settings_schema.json", "config/settings_data.json"]) {
    check(`may write ${ok}`, canWrite(ok))
  }
  for (const no of [
    "templates/index.json", "config/settings.json", "config/other.json", "layout/theme.storelib", "snippets/x.storelib",
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
  check("it says it has tools, prompts and resources, and who it is", JSON.stringify(initResult.capabilities) === JSON.stringify({ tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } })
    && (initResult.serverInfo as { name?: string })?.name === "storelib")
  check("and tells the agent where it is and what to read first",
    /Astrid Studio/.test(String(initResult.instructions)) && /storelib_rules/.test(String(initResult.instructions)))
  check("a notification gets no answer at all",
    (await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, fake)) === null)
  check("ping is answered", JSON.stringify((await handleMcp({ jsonrpc: "2.0", id: 3, method: "ping" }, fake)) as object).includes('"result":{}'))
  const unknown = await handleMcp({ jsonrpc: "2.0", id: 4, method: "sampling/createMessage" }, fake)
  check("an unknown method is -32601", (unknown as { error?: { code: number } })?.error?.code === -32601)
  check("a malformed message is -32600", ((await handleMcp({ id: 5, method: "ping" }, fake)) as { error?: { code: number } })?.error?.code === -32600)

  const list = await handleMcp({ jsonrpc: "2.0", id: 6, method: "tools/list" }, fake)
  const names = ((list as { result?: { tools?: { name: string }[] } })?.result?.tools ?? []).map((t) => t.name)
  check("it offers the seven file tools, the rules first, then the skills; the project tools only when bound", JSON.stringify(names) === JSON.stringify(["storelib_rules", "storelib_guide", "storelib_site", "storelib_list_files", "storelib_read_file", "storelib_compile", "storelib_write_section", "storelib_skills"]))
  check("each with a JSON schema that allows nothing extra",
    TOOLS.every((t) => t.inputSchema.type === "object" && t.inputSchema.additionalProperties === false))
  check("and nothing named delete, publish or rename", !names.some((n) => /delete|publish|rename|remove/.test(n)))

  const call = (name: string, args: Record<string, unknown> = {}) =>
    handleMcp({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } }, fake)
  check("the guide is the framework's own text", textOf(await call("storelib_guide")) === "THE GUIDE")
  check("the site is described, so a section fits it", /"Astrid"/.test(textOf(await call("storelib_site"))) && calls.includes("site"))
  check("and the agent is told to read the project first", /storelib_read_project/.test(String(initResult.instructions)))

  console.log("\nWhat the site brief holds, and what it never does")
  {
    const brief = briefFrom({
      name: "Astrid Studio",
      address: "https://astrid.storelib.com",
      live: true,
      settings: { brand_name: "Astrid", seo_description: "Film presets", site_language: "ro", font_heading: "Fraunces", email: "owner@example.com", stripe_account: "acct_x" },
      pages: [
        { page_key: "about", sections: [{ type: "text", name: "Story" }] },
        { page_key: "home", sections: [{ type: "hero", name: "Hero", settings: { heading: "x" } }, { type: "faq", hidden: true }, "junk"] },
      ],
      products: [{ id: "p1", type: "product", settings: { title: "Preset pack", price: "$12.00", compare_price: "", currency: "USD", free: false, pay_what_you_want: false, image: "", images: [], url: "/products/preset-pack", slug: "preset-pack", kind: "digital", available: false, tag: "Sold out", checkout_url: "", variants: [] } }],
    })
    check("home comes first, and each page lists its sections by type", brief.pages[0].key === "home" && brief.pages[0].sections.map((x) => x.type).join() === "hero,faq" && brief.pages[0].sections[1].hidden === true)
    check("a section's settings are not copied out, only what it is", !JSON.stringify(brief.pages).includes("heading"))
    check("products come as a visitor sees them, with the id checkout takes", brief.products[0].id === "p1" && brief.products[0].price === "$12.00" && brief.products[0].sold_out === true)
    check("the look is there: fonts, and every colour scheme with its colours", brief.look.fonts.heading === "Fraunces" && brief.look.color_schemes.length > 0 && typeof brief.look.color_schemes[0].background === "string")
    check("so are its words and its language", brief.seo.description === "Film presets" && brief.language === "ro")
    check("nothing that is not a design setting leaks, whatever the settings hold", !/owner@example\.com|acct_x/.test(JSON.stringify(brief)))
    check("and it says how to sell: the checkout link, and no payment forms", /\/checkout\?productId=\{\{ block\.id \}\}&src=website/.test(brief.selling) && /Never build a payment form/.test(brief.selling))
    const src = read("lib/agent-access/site-brief.ts")
    check("it reads only this connection's install and creator",
      /\.eq\("id", who\.installId\)\s*\.eq\("creator_id", who\.creatorId\)/.test(src) && /eq\("install_id", who\.installId\)/.test(src) && /shopProducts\(db, who\.creatorId\)/.test(src))
    check("and never orders, buyers or subscribers", !/from\("(orders|purchases|subscribers|customers|profiles)"\)/.test(src))
  }
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
    mcpRoute.indexOf("await authenticateAgent(request)") > 0 &&
      mcpRoute.indexOf("await authenticateAgent(request)") < mcpRoute.indexOf("await readBodyCapped(request, MAX_BODY)"))
  check("and never reads a body whole before measuring it", !/await request\.(text|json)\(\)/.test(mcpRoute))
  check("caps the body and the batch", /MAX_BODY/.test(mcpRoute) && /\.slice\(0, 20\)/.test(mcpRoute))
  check("answers a batch of notifications with 202 and nothing", /status: 202/.test(mcpRoute))
  check("and says it has no stream on GET", /status: 405/.test(mcpRoute))
  for (const file of ["app/api/agent/v1/files/route.ts", "app/api/agent/v1/compile/route.ts", "app/api/agent/v1/site/route.ts"]) {
    const src = read(file)
    check(`${file.replace("app/api/", "")} authenticates first in every handler`,
      (src.match(/export async function (GET|PUT|POST)/g) ?? []).length === (src.match(/const who = await authenticateAgent\(request\)\n\s*if \(who instanceof NextResponse\) return who/g) ?? []).length)
  }

  console.log("\nThe creator's side")

  const manage = read("app/api/website-builder/themes/[installId]/agent-connections/route.ts")
  check("only the site's owner can make, list or disconnect one",
    /\.eq\("creator_id", creator\.id\)/.test(manage) && (manage.match(/const own = await ownInstall\(installId\)/g) ?? []).length === 3)
  // Changed on purpose: the answer and the list now carry the key's expiry and access (part 132); never its hash.
  check("the token is returned once, at creation, and the list never has it",
    /token: minted\.token,\s*\}\)/.test(manage) && (manage.match(/minted\.token/g) ?? []).length === 1
      && /const BASE_COLUMNS = "id, name, prefix, created_at, last_used_at"/.test(manage) && /`\$\{BASE_COLUMNS\}, expires_at, scopes`/.test(manage) && !/select\([^)]*token_hash/.test(manage) && !/token_hash[^:]*,\s*expires_at/.test(manage))
  check("disconnecting is scoped to the site too", /\.eq\("id", id\)\s*\.eq\("install_id", own\.installId\)/.test(manage))
  check("a site holds a bounded number", /MAX_CONNECTIONS = 10/.test(manage))

  const panel = read("components/website-builder/agent-connections-panel.tsx")
  const advanced = read("components/website-builder/website-settings/connections.tsx")
  const row = read("components/website-builder/website-settings/connection-row.tsx")
  check("Website settings has a Connections page of its own, under Code",
    /id: "connections", label: "Connections", group: "code"/.test(read("components/website-builder/website-settings/types.ts")) &&
      /const agents = useAgentConnections\(ctx\.installId\)/.test(advanced))
  check("which is a list of the tools, Claude Code, Codex and GitHub, not a question to answer first",
    /<AgentConnectionRow tool="claude"/.test(advanced) && /<AgentConnectionRow tool="codex"/.test(advanced) &&
      // Changed on purpose: GitHub comes first now, recommended.
      advanced.indexOf("<GitHubSyncPanel") < advanced.indexOf('tool="claude"') && !/How to connect/.test(advanced))
  check("  and another tool that speaks MCP only once it is asked for, or has a key",
    /const showOther = open === "other" \|\| \(agents\.connections !== null && agents\.byTool\.other\.length > 0\)/.test(advanced))
  check("  one line open at a time", /useState<ConnectionId \| null>/.test(advanced) && /open=\{open === "claude"\}/.test(advanced) && /open=\{open === "github"\}/.test(advanced))
  check("each line has one button while closed: Connect, Manage, or none when it cannot be used",
    /\{open \? "Done" : action\}/.test(row) && (row.match(/<button/g) ?? []).length === 2 /* the row's, and a note's inline one */)
  {
    const now = Date.parse("2026-09-25T12:00:00Z")
    const said = (list: { last_used_at: string | null }[] | null, ready = true) => {
      const s = agentStatus(list, ready, now)
      return [s.status, s.detail, s.action].filter(Boolean).join(" | ")
    }
    check("its status in words: not connected, connected and when it was last used, not used yet",
      said([]) === "Not connected | Connect" &&
        said([{ last_used_at: null }, { last_used_at: "2026-09-25T10:00:00Z" }]) === "Connected | used 2 hours ago | Manage" &&
        said([{ last_used_at: null }]) === "Not used yet | Manage" && said([], false) === "Not available on this Storelib yet" &&
        agentStatus(null, true, now).loading === true)
    check("a key goes on the line its name belongs to",
      toolForName("Claude Code") === "claude" && toolForName("Codex") === "codex" && toolForName("ChatGPT Codex") === "codex" && toolForName("AI agent") === "other")
  }
  check("Connect makes the key as the line opens, and never a second one for the same line",
    /if \(\(list\?\.length \?\? 0\) === 0 && !fresh && agents\.making !== tool\) void agents\.make\(tool\)/.test(panel))
  check("which shows the token once, inside the lines that use it",
    /shown only this once/.test(panel) && /setupCommands\(tool, os, token\)/.test(panel) && /const token = fresh\?\.token \?\? NO_TOKEN_YET/.test(panel))
  check("every line has its own Copy button, and none can be copied before there is a token",
    /<CommandBlock key=\{line\.label\}[^\n]*disabled=\{!fresh\} \/>/.test(panel) && /if \(disabled\) return/.test(read("components/website-builder/setup-steps.tsx")))
  check("the token lives in memory only", !/localStorage|sessionStorage/.test(panel))
  check("disconnecting asks first", /confirmingId === c\.id/.test(panel))
  check("it says when the tool has used its key: looked at while waiting, and when the page comes back into view",
    /const waiting = open && fresh !== null && !freshUsed/.test(panel) && /window\.setInterval\(look, WAIT_POLL_MS\)/.test(panel) &&
      /addEventListener\("visibilitychange", look\)/.test(panel) && /document\.visibilityState === "visible"/.test(panel))
  check("  and a look that fails changes nothing on screen", /if \(quiet\) return/.test(panel) && /void load\(true\)/.test(panel))
  check("the tools that work on a repository are sent to GitHub where they are read",
    /web: "Claude Code on the web"/.test(panel) && /web: "Codex in ChatGPT"/.test(panel) && /<InlineButton onClick=\{onGitHub\}>Connect GitHub<\/InlineButton> instead/.test(panel))

  console.log("\nSetting it up on a computer")

  const T = "slb_TESTTOKEN"
  const claude = setupCommands("claude", "mac", T)
  check("Claude Code is added at user scope, so it works from every folder",
    claude.length === 1 && claude[0].value === `claude mcp add --transport http --scope user storelib https://mcp.storelib.com --header "Authorization: Bearer ${T}"`)
  check("  and the line is the same on Windows and Linux",
    setupCommands("claude", "windows", T)[0].value === claude[0].value && setupCommands("claude", "linux", T)[0].value === claude[0].value)
  const mac = setupCommands("codex", "mac", T).map((c) => c.value)
  check("Codex on a Mac: the config is written once, the token exported and kept in ~/.zshrc",
    /grep -qs "mcp_servers\.storelib" ~\/\.codex\/config\.toml \|\|/.test(mac[0]) && /bearer_token_env_var = "STORELIB_TOKEN"/.test(mac[0]) &&
      mac[1] === `echo 'export STORELIB_TOKEN=${T}' >> ~/.zshrc && export STORELIB_TOKEN=${T}`)
  check("Codex on Linux keeps it in ~/.bashrc", /~\/\.bashrc/.test(setupCommands("codex", "linux", T)[1].value))
  const win = setupCommands("codex", "windows", T).map((c) => c.value)
  check("Codex on Windows speaks PowerShell: $env: for this window, setx to keep it",
    win[1] === `setx STORELIB_TOKEN "${T}"; $env:STORELIB_TOKEN="${T}"` && !/\bexport\b|~\//.test(win.join("\n")) &&
      /\$HOME\\\.codex\\config\.toml/.test(win[0]) && /Select-String -Quiet/.test(win[0]))
  check("the token is in the lines and nowhere else", setupCommands("other", "mac", T).some((c) => c.value === `Authorization: Bearer ${T}`))
  check("the computer is read from Client Hints first, then platform, then the user agent",
    detectOs({ userAgentData: { platform: "Windows" }, platform: "MacIntel" }) === "windows" &&
      detectOs({ platform: "Win32" }) === "windows" && detectOs({ platform: "MacIntel" }) === "mac" &&
      detectOs({ platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }) === "linux" &&
      detectOs({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }) === "windows")
  check("  and a phone, or nothing at all, is a Mac",
    detectOs({ platform: "iPhone", userAgent: "iPhone" }) === "mac" &&
      detectOs({ platform: "Linux armv8l", userAgent: "Mozilla/5.0 (Linux; Android 14)" }) === "mac" && detectOs({}) === "mac")
  const keys = (os: "mac" | "windows" | "linux") => openTerminalGuide(os).parts.map((p) => ("key" in p ? p.key : "type" in p ? `type ${p.type}` : "then")).join(" ")
  check("opening a terminal is shown as keys: ⌘ Space, Win, Ctrl Alt T",
    keys("mac") === "⌘ Space then type Terminal then Return" && keys("windows") === "⊞ Win then type Terminal then Enter" &&
      keys("linux") === "Ctrl Alt T" && /PowerShell/.test(openTerminalGuide("windows").aside ?? ""))
  check("then what to ask, and how to see it worked",
    FIRST_ASK === "Add a pricing section to my Storelib site" && afterSetup("claude")?.check === "claude mcp list" && afterSetup("other") === null &&
      /Type \{command\}, press \$?\{enter\}, then ask:/.test(panel) && /command: <Code>\{next\.start\}<\/Code>/.test(panel) && /is connected\. What it writes shows up here as a draft\./.test(panel))

  console.log("\nHolding up at scale, and keeping to its own site")

  check("the token read joins the site and checks it is still the token maker's",
    /install:store_theme_installs!inner\(creator_id, name\)/.test(tokens) && /site\.creator_id === row\.creator_id/.test(tokens))
  check("  and survives a schema cache that has not learnt the join", /\/relationship\/i\.test/.test(tokens))
  check("wrong tokens are throttled per address, and only wrong ones",
    /bucket: "agent-auth-fail"/.test(tokens) && /subjects: \[addressSubject\(request\)\]/.test(tokens) && tokens.indexOf("return refused(request") > tokens.indexOf(".maybeSingle()"))
  check("last used is written after the answer, at most once a minute", /later\(async \(\) =>/.test(tokens) && /60_000/.test(tokens))
  check("MCP gets the site name from the token read, not another query", /let siteName = who\.siteName/.test(read("lib/agent-access/bind.ts")))
  {
    const big = await readBodyCapped(new Request("http://x/", { method: "POST", body: "a".repeat(2048) }), 1000)
    const lied = await readBodyCapped(new Request("http://x/", { method: "POST", body: "a".repeat(2048), headers: { "content-length": "10" } }), 1000)
    const fine = await readBodyCapped(new Request("http://x/", { method: "POST", body: "{\"a\":1}" }), 1000)
    check("a body over the limit is refused, whatever its header says", big.ok === false && big.status === 413 && lied.ok === false && lied.status === 413)
    check("  and one under it is read as it was sent", fine.ok === true && fine.text === "{\"a\":1}")
  }
  for (const file of ["app/api/agent/v1/files/route.ts", "app/api/agent/v1/compile/route.ts"]) {
    check(`${file.replace("app/api/", "")} caps its body`, /readJsonCapped/.test(read(file)) && !/await request\.json\(\)/.test(read(file)))
  }
  check("a database's own words never reach an agent",
    publicError(500, "duplicate key value violates unique constraint") === "Could not save the file just now. Try again." &&
      publicError(409, "This file was saved somewhere else") === "This file was saved somewhere else" &&
      /error: publicError\(saved\.status, saved\.error\)/.test(read("lib/agent-access/operations.ts")))
  check("making tokens is rate limited per person, and ids are checked before a query",
    /bucket: "agent-token-mint"/.test(manage) && /if \(!UUID\.test\(installId\)\) return null/.test(manage) && /!UUID\.test\(id\)/.test(manage))
  check("the list of connections is bounded", /\.limit\(MAX_CONNECTIONS\)/.test(manage))
  const idx = read("supabase/sql/RUN_AGENT_ACCESS_INDEXES.sql")
  check("the foreign keys a cascade walks are indexed, additively",
    idx === read("supabase/migrations/20260924_agent_access_indexes.sql") &&
      /CREATE INDEX IF NOT EXISTS idx_theme_agent_tokens_creator/.test(idx) && /CREATE INDEX IF NOT EXISTS idx_theme_agent_activity_token/.test(idx) &&
      /CREATE INDEX IF NOT EXISTS idx_theme_github_links_creator/.test(idx) &&
      !/ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE/i.test(idx.replace(/--.*$/gm, "")))

  console.log("\nA section an agent writes appears on the open page")

  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const follow = read("components/website-builder/site-connections.tsx")
  check("the builder asks what agents wrote, only while it is showing, and only while something is connected",
    /useSiteActivity\(\{/.test(editor) && /agent-activity\?after=\$\{cursor\.current\}/.test(follow) &&
      /document\.visibilityState !== "visible"/.test(follow) && /if \(!connected\) return/.test(follow))
  check("the first answer is a cursor, so nothing old is replayed",
    /if \(after === null\)/.test(read("app/api/website-builder/themes/[installId]/agent-activity/route.ts")))
  check("a new section is placed above the footer, undoably, with the arrival animation, and named",
    /placeWrittenSection\(previous, writingAnchor\(previous\), instanceFromSchema\(id, type, schema\)\)/.test(editor)
      && /setArrivedId\(id\)/.test(editor) && /describeChange\(ev,/.test(editor) && /addToBatch\(b, by, lines, Date\.now\(\)\)/.test(editor))
  check("and the canvas is not scrolled to it", (() => {
    const handler = editor.slice(editor.indexOf("const handleAgentEvents = async"), editor.indexOf("} = useSiteActivity({"))
    return handler.length > 0 && !/revealSection|scrollWithin|scrollToSection/.test(handler)
  })())
  check("never twice", /!sectionsRef\.current\.some\(\(sec\) => sec\.type === type\)/.test(editor))
  check("and it stops asking on a database without the tables", /if \(!res\.ok \|\| d\.ready === false\) \{\s*stopped = true/.test(follow))

  console.log("\nThe docs say how")

  const ai = read("content/developers/ai.md")
  check("the AI agents page explains connecting", /## Connect an agent directly/.test(ai) && /claude mcp add --transport http --scope user storelib/.test(ai) && /storelib_write_section/.test(ai))
  check("and no longer says it is not available", !/is not available yet/.test(ai))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
void main()
