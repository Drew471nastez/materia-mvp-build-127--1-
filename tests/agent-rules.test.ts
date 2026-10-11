/**
 * ===========================================================================
 *  WHAT AN AGENT MAY CHANGE, AND THE RULES IT READS FIRST
 * ===========================================================================
 * Claude Code, Codex, ChatGPT through GitHub and the builder's own AI all
 * write code into creators' websites. Two things are held here:
 *
 *   they cannot rewrite what every Storelib site stands on: the theme's core
 *   files and the built-in sections, by any of the four paths;
 *
 *   before they write anything they are handed the rules, first, on every
 *   path: MCP's instructions and tools, the guide, the repository's
 *   AGENTS.md and CLAUDE.md, and llms.txt.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { agentMayWrite, BUILT_IN_SECTION_TYPES } from "@/lib/agent-access/protected"
import { writeSection } from "@/lib/agent-access/operations"
import { TOOLS, handleMcp, type BoundOps } from "@/lib/agent-access/mcp"
import { agentsGuide, CLAUDE_MD } from "@/lib/github-sync/core"
import { agentGuideText, pageText } from "@/lib/developers/render-text"
import { devPage } from "@/lib/developers/pages"
import { compileSection } from "@/lib/storelib-theme"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  console.log("\nWhat an agent may write")
  for (const ok of ["sections/price_table.storelib", "sections/hero_custom.storelib", "sections/page_links.storelib"]) {
    check(`may write a new section, ${ok}`, agentMayWrite(ok).ok)
  }
  for (const no of ["templates/home.json", "config/settings_schema.json", "layout/theme.storelib", "snippets/button.json", "assets/styles.css", "theme.json", "sections/../config/x.storelib"]) {
    check(`may not write the theme's core, ${no}`, !agentMayWrite(no).ok)
  }
  const shipped = Object.keys(DEFAULT_THEME_SOURCES).filter((p) => /^sections\/.*\.storelib$/.test(p))
  check(`none of the ${shipped.length} built-in .storelib sections can be written`, shipped.length > 20 && shipped.every((p) => !agentMayWrite(p).ok))
  for (const t of ["header", "footer", "hero"]) {
    check(`nor a file that would stand in for the built-in ${t}`, BUILT_IN_SECTION_TYPES.has(t) && !agentMayWrite(`sections/${t}.storelib`).ok)
  }
  const refusal = agentMayWrite("sections/hero.storelib")
  check("and the refusal says what to do instead", refusal.ok === false && /write your version as a new section/i.test(refusal.error) && refusal.error.includes("sections/hero_custom.storelib"))

  console.log("\nEvery path an agent writes by is held to it")
  let touched = 0
  const db = { from: () => { touched++; throw new Error("the database was reached") } }
  const r = await writeSection(db, { installId: "i", tokenId: "t", name: "Claude Code" } as never, "sections/footer.storelib", "<template></template>")
  check("MCP and the agent API refuse a built-in with 403, before the database", r.ok === false && r.status === 403 && touched === 0)
  /* Round Z: a push's files are applied in lib/github-sync/apply.ts now, the whole theme and not only sections. */
  const sync = read("lib/github-sync/apply.ts")
  check("a GitHub push to a built-in is refused, and said so on the commit",
    /const allowed = agentMayWrite\(path\)\s*\n\s*if \(allowed\.ok === false\) \{\s*\n\s*out\.failed\.push\(\{ path, error: allowed\.error \}\)/.test(sync)
      && sync.indexOf("agentMayWrite(path)") < sync.indexOf("await saveThemeFile(db, installId, path, source)"))
  const chat = read("app/api/website-builder/themes/[installId]/agent/route.ts")
  check("the builder's AI is held to the same rule", /const allowed = agentMayWrite\(path\)\s*\n\s*if \(allowed\.ok === false\) return \{ ok: false, error: allowed\.error \}/.test(chat))
  check("and saves what it rewrites as a draft with a version, not onto the live site",
    /await saveThemeFile\(supabase, installId, path, source\)/.test(chat) && !/update\(\{ content: source, draft_content: null/.test(chat))
  const ops = read("lib/agent-access/operations.ts")
  check("the file list tells an agent which files it may write", /writable: agentMayWrite\(row\.path\)\.ok/.test(ops) && /origin: "theme", writable: false/.test(ops))
  check("the AI's own editing rules say the built-in sections are not its to rewrite", /BUILT-IN SECTIONS ARE READ-ONLY/.test(read("lib/storelib-ai/source-editing.ts")))

  console.log("\nThe rules come first, on every path")
  const rules = pageText("rules")
  check("the rules are a page of the developer hub", !!devPage("rules") && /# Rules before you ship/.test(rules))
  for (const [what, re] of [
    ["what may change", /Never a built-in section/],
    ["links, buttons and menus as settings and blocks", /\*\*A menu\*\* is one `link_list` setting/],
    ["a screenshot split into sections", /Split it into sections/],
    ["menus, sheets and dialogs", /popovertarget/],
    ["motion that stops for reduced motion", /prefers-reduced-motion/],
    ["phones and iOS", /Inputs are 16px/],
    ["no AI styling or copy", /No generic AI styling/],
    ["the checks before done", /Before you say it is done/],
  ] as const) check(`they cover ${what}`, re.test(rules))
  check("with no em dash in them", !rules.includes("—"))
  check("the guide an agent is given starts with them", agentGuideText().startsWith("<!-- https://storelib.com/developers/rules -->"))
  check("and has them once", (agentGuideText().match(/# Rules before you ship/g) ?? []).length === 1)
  check("MCP lists storelib_rules first", TOOLS[0].name === "storelib_rules")
  const fake: BoundOps = {
    siteName: "Astrid", agentName: "Codex",
    list: async () => ({ ok: true, value: { framework: { engine: 1, schema: 1 }, docs: "", writable: "", files: [] } }),
    read: async () => ({ ok: false, status: 404, error: "" }),
    compile: () => ({ ok: false, status: 400, error: "" }),
    write: async () => ({ ok: false, status: 403, error: "" }),
    guide: () => "GUIDE",
    rules: () => "THE RULES",
  }
  const init = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, fake)) as { result?: { instructions?: string } }
  const instructions = init?.result?.instructions ?? ""
  check("and its instructions carry the workflow and the edges, without being asked", /WORKFLOW/.test(instructions) && /Inspect/.test(instructions) && /Repair/.test(instructions) && /one website only/i.test(instructions) && /storelib_rules/.test(instructions))
  const called = (await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "storelib_rules", arguments: {} } }, fake)) as { result?: { content?: { text: string }[] } }
  const rulesText = called?.result?.content?.[0]?.text ?? ""
  check("storelib_rules answers with the universal rules, then the page", rulesText.startsWith("# Storelib agent rules") && rulesText.endsWith("THE RULES"))
  const agents = agentsGuide({ siteName: "Astrid", branch: "main", root: "" })
  check("a linked repository's AGENTS.md sends an agent to them before anything else", /## Read the rules before you write anything/.test(agents) && agents.indexOf("developers/rules") < agents.indexOf("## Writing a section"))
  check("and CLAUDE.md does too", /developers\/rules/.test(CLAUDE_MD))
  check("and llms.txt", /developers\/rules/.test(read("lib/developers/llms.ts")))

  console.log("\nThe example the rules point to is real, and it is not a header")
  const links = compileSection(read("content/developers/examples/page_links.storelib"), { file: "sections/page_links.storelib" })
  check("the page links example compiles", links.ok === true)
  if (links.ok === true) {
    const s = links.value.schema
    check("its links are blocks with a label and a url", !!s.blocks?.find((b) => b.type === "link" && b.settings?.some((x) => x.type === "url") && b.settings?.some((x) => x.id === "label")))
    check("and it is not a built-in, so an agent could have written it", agentMayWrite("sections/page_links.storelib").ok)
  }
  check("the rules let an agent design a header and still require the live values", /Design the header and footer however/.test(read("content/developers/rules.md")) && /link_list/.test(read("content/developers/rules.md")) && !/Do not build the header or footer/.test(read("content/developers/rules.md")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
