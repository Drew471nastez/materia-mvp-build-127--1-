/**
 * ===========================================================================
 *  mcp.storelib.com: THE PROJECT TOOLS, THE RULES AND THE SKILLS
 * ===========================================================================
 * What is held here:
 *
 *   the rules reach every agent without being asked for: MCP's initialize
 *   instructions, a prompt, a resource, the rules tool, Storelib AI's system
 *   prompt and the repository's AGENTS.md; and they are written the way
 *   CLAUDE.md asks (no banned words, no em dashes);
 *
 *   skills are chosen for the request, not dumped, and each names its checks;
 *
 *   a page change is checked whole before anything is written: an unknown
 *   setting, an unknown section, a header moved, and one bad operation in a
 *   batch all write nothing;
 *
 *   the checks storelib_run_tests runs fail the things they say they fail;
 *
 *   the project tools cannot be pointed at another site: no argument names
 *   an install, and every query in lib/agent-access/project.ts is keyed on
 *   the connection's;
 *
 *   mcp.storelib.com reaches the MCP route and nothing else.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AGENT_RULE_GROUPS, AGENT_WORKFLOW, agentRulesBrief, agentRulesText, builderAgentRules } from "@/lib/agent-rules"
import { SKILLS, checksFor, selectSkills, skillContext, skillText, skillsForRequest } from "@/lib/agent-skills"
import { checkOps } from "@/lib/agent-access/page-ops"
import { searchComponents } from "@/lib/agent-access/components"
import { checkPageState, checkSectionFile, describeResults } from "@/lib/agent-access/checks"
import { handleMcp, PROJECT_TOOLS, TOOLS, type BoundOps, type ProjectOps } from "@/lib/agent-access/mcp"
import { mcpHostRoute } from "@/lib/agent-access/mcp-host"
import { pageEventPlan, describeChange, type ActivityEvent } from "@/lib/agent-access/connection-mark"
import { agentsGuide } from "@/lib/github-sync/core"
import { schemaMapFor } from "@/lib/website-builder/agent/schemas"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i

function section(id: string, type: string, settings: Record<string, unknown> = {}): SectionInstance {
  return { id, type, name: type, settings, blocks: [], hidden: false }
}

async function main() {
  const schemas = schemaMapFor()

  console.log("\nThe rules")
  const full = agentRulesText()
  check("the workflow is inspect, plan, implement, test, repair, in that order", AGENT_WORKFLOW.map((w) => w.step).join(",") === "Inspect,Plan,Implement,Test,Repair")
  for (const id of ["architecture", "boundaries", "reuse", "coding", "design", "responsive", "security", "testing"]) {
    check(`they cover ${id}`, AGENT_RULE_GROUPS.some((g) => g.id === id && g.rules.length > 0))
  }
  const skillsAll = SKILLS.map((s) => skillText(s, { withTopics: false })).join("\n")
  /* The design rule has to NAME the banned words to ban them; everything else must not use them. */
  /* "transform" is also a CSS property, and "opacity and transform" is that. */
  const withoutTheList = full.replace(/Never write unlock[^.]*\./, "").replace(/opacity and transform/g, "")
  check("no banned words in the rules (besides the list of them) or the skills", !BANNED.test(withoutTheList) && !BANNED.test(skillsAll.replace(/opacity and transform/g, "")), (withoutTheList.match(BANNED) ?? skillsAll.match(BANNED) ?? [""])[0])
  check("no em dashes in the rules or the skills", !/—/.test(full + skillsAll + builderAgentRules()))
  const brief = agentRulesBrief({ siteName: "Astrid", agentName: "Claude Code" })
  check("the brief names the site and the connection", brief.includes('"Astrid"') && brief.includes('"Claude Code"'))
  check("and stays short enough for a client to keep whole", brief.length < 2_200, `${brief.length}`)
  check("Storelib AI's version names its own tools, not the MCP ones", !/storelib_[a-z_]+/.test(builderAgentRules()) && /Inspect/.test(builderAgentRules()))

  console.log("\nThe rules reach every agent")
  const loop = read("lib/website-builder/agent/loop.ts")
  /* Then the section framework and two built-in sections, stable text in the same cached prefix (lib/storelib-ai/reference.ts). */
  check("Storelib AI's system prompt carries them", /\$\{pageAgentRules\(\)\}\n\n\$\{builderAgentRules\(\)\}\n\n\$\{pageAgentReference\(\)\}`/.test(loop))
  /* With the picture as a signal too: an attached image selects the image skill. */
  check("and its turn carries the skills for the request", /skillContext\(prompt, \{ images: images\.length > 0 \}\)/.test(loop) && !/knowledgeBlock\(prompt\)/.test(loop))
  const agents = agentsGuide({ siteName: "Astrid", branch: "main", root: "" })
  check("a linked repository's AGENTS.md has the workflow", /## How to work/.test(agents) && /\*\*Inspect\.\*\*/.test(agents) && /\*\*Repair\.\*\*/.test(agents))

  console.log("\nSkills are chosen for the request")
  const darker = selectSkills("make the FAQ buttons darker on phones").map((s) => s.id)
  check("\"make the FAQ buttons darker on phones\" gets restyle and layout", darker.includes("restyle") && darker.includes("layout"), darker.join(","))
  check("at most three unless asked", darker.length <= 3)
  const page = selectSkills("create an about us page with our team").map((s) => s.id)
  check("\"create an about us page\" gets compose-page", page.includes("compose-page"), page.join(","))
  const bug = selectSkills("the section did not compile, line 12 says undeclared").map((s) => s.id)
  check("a compile error gets debug", bug[0] === "debug", bug.join(","))
  check("a request that matches nothing still gets a skill", selectSkills("hello there").length === 1)
  check("the checks come from the skills chosen, each once", checksFor(selectSkills("make the FAQ buttons darker")).join(",") === [...new Set(checksFor(selectSkills("make the FAQ buttons darker")))].join(","))
  const forAgent = skillsForRequest("change the colour of the hero button")
  check("an MCP agent gets the steps, the tools and the framework facts once", /Steps:/.test(forAgent) && /storelib_update_styles/.test(forAgent) && /COLOUR COMES FROM THE SCHEME/.test(forAgent) && forAgent.split("COLOUR COMES FROM THE SCHEME").length === 2)
  const forBuilder = skillContext("change the colour of the hero button")
  check("Storelib AI gets the short form, with the reference", /TASK NOTES/.test(forBuilder) && /STORELIB REFERENCE/.test(forBuilder) && forBuilder.length < forAgent.length)
  check("every skill's tools are real MCP tools", SKILLS.every((s) => s.tools.every((t) => [...TOOLS, ...PROJECT_TOOLS].some((x) => x.name === t))), SKILLS.flatMap((s) => s.tools).filter((t) => ![...TOOLS, ...PROJECT_TOOLS].some((x) => x.name === t)).join(","))

  console.log("\nA page change is checked whole before anything is written")
  const start = { sections: [section("h1", "header"), section("f1", "faq", { heading: "Questions" }), section("ft", "footer")], settings: {} }
  let n = 0
  const mint = (p: string) => `${p}-${++n}`
  const good = checkOps(start, [{ op: "update_section", section_id: "f1", settings: { heading: "Asked often", padding_top: "40" } }, { op: "add_section", section_type: "cta", index: 1 }], schemas, mint)
  check("a good batch applies, in order, with ids minted here", good.ok === true && good.state.sections[1].type === "cta" && good.state.sections[1].id === "cta-1" && good.created[0] === "cta-1")
  check("a slider value sent as text is read as a number, and said so", good.ok === true && good.state.sections.find((s) => s.id === "f1")?.settings.padding_top === 40 && good.notes.some((x) => /padding_top/.test(x)))
  const unknownField = checkOps(start, [{ op: "update_section", section_id: "f1", settings: { headline: "x" } }], schemas)
  check("a setting the section does not declare is refused, with the list", unknownField.ok === false && /no field called "headline"/.test(unknownField.error) && /heading/.test(unknownField.error))
  const badChoice = checkOps(start, [{ op: "update_section", section_id: "f1", settings: { style: "sparkly" } }], schemas)
  check("a value a select cannot take is refused", badChoice.ok === false && /not one of that control's choices/.test(badChoice.error))
  const atomic = checkOps(start, [{ op: "update_section", section_id: "f1", settings: { heading: "Fine" } }, { op: "update_section", section_id: "nope", settings: { heading: "x" } }], schemas)
  check("one refused operation refuses the batch, and says which", atomic.ok === false && atomic.at === 1 && /Nothing was changed/.test(atomic.error))
  check("the header stays first", checkOps(start, [{ op: "move_section", section_id: "h1", index: 2 }], schemas).ok === false)
  check("no second header", checkOps(start, [{ op: "add_section", section_type: "header" }], schemas).ok === false)
  check("an unknown section type is refused", checkOps(start, [{ op: "add_section", section_type: "made_up" }], schemas).ok === false)
  check("an unknown op is refused", checkOps(start, [{ op: "drop_table" }], schemas).ok === false)
  check("an empty batch is refused", checkOps(start, [], schemas).ok === false)
  check("more than sixty operations is refused", checkOps(start, Array.from({ length: 61 }, () => ({ op: "update_section", section_id: "f1", settings: { heading: "x" } })), schemas).ok === false)
  const theme = checkOps(start, [{ op: "update_theme", settings: { not_a_theme_setting: 1 } }], schemas)
  check("a theme setting that does not exist is refused", theme.ok === false)
  const added = checkOps(start, [{ op: "add_block", section_id: "f1", block_type: (schemas.faq.blocks ?? [])[0]?.type ?? "", settings: {} }], schemas, mint)
  check("a block is added with a minted id", added.ok === true && (added.state.sections[1].blocks?.length ?? 0) === 1)

  console.log("\nComponent search")
  const t = searchComponents(schemas, "testimonials slider").map((h) => h.type)
  check("\"testimonials slider\" finds a testimonials section first", /testimonial/.test(t[0] ?? ""), t.slice(0, 3).join(","))
  const faq = searchComponents(schemas, "frequently asked questions faq").map((h) => h.type)
  check("\"faq\" finds the FAQ sections", faq.slice(0, 4).every((x) => /faq/.test(x)), faq.slice(0, 4).join(","))
  check("headers and footers are not addable", searchComponents(schemas, "header").find((h) => h.type === "header")?.addable === false)
  check("a creator's own section is marked theirs", searchComponents(schemas, "faq", { custom: new Set(["faq"]) }).find((h) => h.type === "faq")?.origin === "yours")

  console.log("\nThe checks fail what they say they fail")
  const broken = checkSectionFile("sections/broken.storelib", "<template>\n<p>{{ settings.missing }}</p>\n</template>\n<schema>\n{\"name\":\"Broken\",\"settings\":[]}\n</schema>")
  check("an undeclared name fails compile, with its line", broken[0]?.check === "compile" && broken[0].ok === false && /broken\.storelib:\d+/.test(broken[0].problems[0] ?? ""), broken[0]?.problems.join(" | "))
  const unknownType = checkPageState("home", { sections: [section("x", "made_up")], settings: {} }, schemas, ["page-types"])
  check("an unknown section on a page fails page-types", unknownType[0].ok === false)
  const outOfRange = checkPageState("home", { sections: [section("f1", "faq", { padding_top: 9999 })], settings: {} }, schemas, ["page-settings"])
  check("a slider value out of its range fails page-settings", outOfRange[0].ok === false, outOfRange[0].problems.join(" | "))
  const stale = checkPageState("home", { sections: [section("f1", "faq", { retired_setting: "x" })], settings: {} }, schemas, ["page-settings"])
  check("a setting the file no longer declares is a note, not a failure", stale[0].ok === true && stale[0].warnings.length === 1)
  const unreadable = checkPageState("home", { sections: [section("f1", "faq", { bg_color: "#ffffff", text_color: "#f5f5f5" })], settings: {} }, schemas, ["contrast"])
  check("light grey text on white fails contrast", unreadable[0].ok === false, unreadable[0].problems.join(" | "))
  const readable = checkPageState("home", { sections: [section("f1", "faq", { bg_color: "#ffffff", text_color: "#111111" })], settings: {} }, schemas, ["contrast"])
  check("near-black on white passes", readable[0].ok === true, readable[0].problems.join(" | "))
  check("the verdict comes first", /^FAILED: 1 of 1/.test(describeResults(unreadable)) && /^PASSED/.test(describeResults(readable)))

  console.log("\nThe MCP server")
  const calls: string[] = []
  const answer = (name: string) => async (args: Record<string, unknown>) => { calls.push(`${name}:${JSON.stringify(args)}`); return { ok: true as const, value: `did ${name}` } }
  const project: ProjectOps = {
    readProject: () => answer("readProject")({}),
    readPage: answer("readPage"),
    readSelectedSection: answer("readSelectedSection"),
    searchComponents: answer("searchComponents"),
    createSection: answer("createSection"),
    editSection: answer("editSection"),
    updateStyles: answer("updateStyles"),
    createPage: answer("createPage"),
    createSafePatch: answer("createSafePatch"),
    runTests: answer("runTests"),
    runPreview: async () => ({ ok: false as const, status: 503, error: "not switched on yet" }),
  }
  const fake: BoundOps = {
    siteName: "Astrid",
    agentName: "Claude Code",
    list: async () => ({ ok: false, status: 500, error: "" }),
    read: async () => ({ ok: false, status: 404, error: "" }),
    compile: () => ({ ok: false, status: 422, error: "" }),
    write: async () => ({ ok: false, status: 403, error: "" }),
    guide: () => "GUIDE",
    rules: () => "THE RULES",
    project,
  }
  const rpc = async (method: string, params?: Record<string, unknown>) => (await handleMcp({ jsonrpc: "2.0", id: 1, method, params }, fake)) as { result?: any; error?: { message: string } } // eslint-disable-line @typescript-eslint/no-explicit-any
  const init = await rpc("initialize", { protocolVersion: "2025-06-18" })
  check("initialize offers tools, prompts and resources", !!init.result?.capabilities?.tools && !!init.result?.capabilities?.prompts && !!init.result?.capabilities?.resources)
  const names = ((await rpc("tools/list")).result?.tools ?? []).map((x: { name: string }) => x.name)
  const diagram = ["storelib_read_project", "storelib_read_page", "storelib_read_selected_section", "storelib_search_components", "storelib_create_section", "storelib_edit_section", "storelib_update_styles", "storelib_create_page", "storelib_run_preview", "storelib_run_tests", "storelib_create_safe_patch"]
  check("every tool on the diagram is listed", diagram.every((d) => names.includes(d)), diagram.filter((d) => !names.includes(d)).join(","))
  check("and the file tools are still there", ["storelib_rules", "storelib_guide", "storelib_site", "storelib_write_section"].every((d) => names.includes(d)))
  check("tool names are unique", new Set(names).size === names.length)
  const noArgNamesASite = [...TOOLS, ...PROJECT_TOOLS].every((tool) => !Object.keys((tool.inputSchema as { properties?: object }).properties ?? {}).some((k) => /install|creator|site_id|user|token/i.test(k)))
  check("no tool takes an argument that names a site, a creator or a token", noArgNamesASite)
  const call = async (name: string, args: Record<string, unknown> = {}) => (await rpc("tools/call", { name, arguments: args })).result?.content?.[0]?.text as string | undefined
  check("a project tool reaches its bound operation with its arguments", (await call("storelib_update_styles", { scope: "section", section_id: "f1", settings: { heading: "x" } })) === "did updateStyles" && calls.some((c) => c.startsWith("updateStyles:") && c.includes('"section_id":"f1"')))
  const refusedCall = await rpc("tools/call", { name: "storelib_run_preview", arguments: {} })
  check("a refusal comes back as a tool error the agent can read", refusedCall.result?.isError === true && /not switched on yet/.test(refusedCall.result?.content?.[0]?.text ?? ""))
  const skillsCall = await call("storelib_skills", { task: "add a newsletter sign up" })
  check("storelib_skills with a task returns that task's skills", /forms/.test(skillsCall ?? "") && /Steps:/.test(skillsCall ?? ""))
  check("storelib_skills with an unknown id says so and lists them", /There is no skill/.test((await call("storelib_skills", { id: "nope" })) ?? ""))
  const prompts = (await rpc("prompts/list")).result?.prompts?.map((p: { name: string }) => p.name) ?? []
  check("the rules and a task prompt are offered as prompts", prompts.includes("storelib-rules") && prompts.includes("storelib-task"))
  const taskPrompt = (await rpc("prompts/get", { name: "storelib-task", arguments: { task: "make the hero darker" } })).result?.messages?.[0]?.content?.text ?? ""
  check("the task prompt carries the rules, the skills and the task", /# Storelib agent rules/.test(taskPrompt) && /Skills for this task/.test(taskPrompt) && /TASK\nmake the hero darker/.test(taskPrompt))
  const res = (await rpc("resources/read", { uri: "storelib://rules" })).result?.contents?.[0]?.text ?? ""
  check("the rules are a resource", res.startsWith("# Storelib agent rules"))
  check("an unknown resource is an error", !!(await rpc("resources/read", { uri: "file:///etc/passwd" })).error)
  const noProject = { ...fake, project: undefined }
  const legacy = ((await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, noProject)) as { result?: { tools: { name: string }[] } }).result?.tools.map((x) => x.name) ?? []
  check("a connection without the project tools does not list them", !legacy.includes("storelib_create_page") && legacy.includes("storelib_skills"))

  console.log("\nThe project tools stay on the connection's site")
  const projectSrc = read("lib/agent-access/project.ts")
  check("no argument is read as an install or creator id", !/args\.(install|creator)/i.test(projectSrc) && !/a\.(install|creator)/i.test(read("lib/agent-access/bind.ts")))
  const froms = projectSrc.match(/db\.from\("[a-z_]+"\)[^\n]*(\n\s+[a-z_]+: [^\n]*){0,2}/g) ?? []
  const unkeyed = froms.filter((q) => !/who\.installId|installId\)|who\.creatorId|"theme_agent_activity"\)\.select\("id, detail"\)/.test(q))
  check("every query in project.ts is keyed on the connection's install or creator", unkeyed.length === 0, unkeyed.join("\n        "))
  check("page and theme writes land in the draft columns only", !/update\(\{ sections:|update\(\{ settings:/.test(projectSrc))
  check("a backup is taken before any page write, and a failed backup stops it", projectSrc.indexOf("takeBackup(") < projectSrc.indexOf('from("store_theme_pages").update') && /if \(backup\.error\) return bad/.test(projectSrc))
  check("every page write is sanitised", /const sections = sanitizeSections\(checked\.state\.sections\)/.test(projectSrc))
  check("page tools refuse until the builder can hear them", /if \(!\(await logReady\(db\)\)\) return bad\(NOT_READY, 503\)/.test(projectSrc))
  const focusRoute = read("app/api/website-builder/themes/[installId]/focus/route.ts")
  check("the builder's focus is written only for the creator's own install", /\.eq\("creator_id", \(creator as \{ id: string \}\)\.id\)/.test(focusRoute) && focusRoute.indexOf("creator_id") < focusRoute.indexOf("theme_editor_focus\")"))
  const sql = read("supabase/sql/RUN_AGENT_MCP.sql")
  check("creators only read the focus table", /enable row level security/.test(sql) && /revoke insert, update, delete on public\.theme_editor_focus from anon, authenticated/.test(sql))

  console.log("\nAn open builder follows an agent's page change")
  const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({ id: 1, agent_name: "Claude Code", path: "pages/about", action: "page", ...over })
  const ops = [{ kind: "update_section" as const, id: "f1", settings: { heading: "x" } }, { kind: "update_theme" as const, settings: { radius: 4 } }]
  const here = pageEventPlan(ev({ detail: { page: "about", ops } }), "about")
  check("on the page it shows, every operation is replayed", here.pageOps.length === 1 && here.themeOps.length === 1)
  const elsewhere = pageEventPlan(ev({ detail: { page: "about", ops } }), "home")
  check("on another page, only the theme's", elsewhere.pageOps.length === 0 && elsewhere.themeOps.length === 1)
  check("a new page is added to the list", pageEventPlan(ev({ action: "page_created", path: "pages/size-guide", detail: { page: "size-guide", ops: [] } }), "home").newPage === "size-guide")
  check("a file event plans nothing", pageEventPlan(ev({ action: "created", path: "sections/x.storelib" }), "home").pageOps.length === 0)
  check("the notice names the page", describeChange(ev({ detail: { ops } }), () => undefined) === "About changed, 2 edits" && describeChange(ev({ action: "page_created", path: "pages/size-guide" }), () => undefined) === "New page: Size guide")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the builder replays through the assistant's applier", /const plan = pageEventPlan\(ev, currentPageRef\.current\)/.test(editor) && /applyAiOp\(op\)/.test(editor))
  check("and does not place a file the agent already placed", /!ev\.detail\?\.placed/.test(editor))

  console.log("\nmcp.storelib.com")
  check("its root is the MCP route", JSON.stringify(mcpHostRoute("mcp.storelib.com", "/", "storelib.com")) === JSON.stringify({ kind: "rewrite", path: "/api/mcp" }))
  check("with a port too", mcpHostRoute("MCP.storelib.com:443", "/mcp", "storelib.com")?.kind === "rewrite")
  check("anything else on it is a 404, never a website", mcpHostRoute("mcp.storelib.com", "/about", "storelib.com")?.kind === "not-found" && mcpHostRoute("mcp.storelib.com", "/api/website-address", "storelib.com")?.kind === "not-found")
  check("other hosts are not its business", mcpHostRoute("astrid.storelib.com", "/", "storelib.com") === null && mcpHostRoute("storelib.com", "/api/mcp", "storelib.com") === null)
  const proxy = read("proxy.ts")
  check("the proxy asks before any other rule", proxy.indexOf("mcpHostRoute(bareHost") > 0 && proxy.indexOf("mcpHostRoute(bareHost") < proxy.indexOf("indexNowKey"))
  check("and mcp is never read as a creator's site", /EXCLUDED_SUBDOMAINS = \[[^\]]*MCP_HOST_LABEL\]/.test(proxy))
  check("and the connect commands use it", /MCP_URL = "https:\/\/mcp\.storelib\.com"/.test(read("lib/agent-access/setup-commands.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
