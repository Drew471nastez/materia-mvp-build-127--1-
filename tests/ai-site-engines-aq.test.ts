/**
 * Round AQ (track 3): the two AI website engines after the merge of round AP
 * (free design in the classic job) and round L (the agent engine).
 *
 *   WHICH ENGINE   a new Start with AI job is classic unless the platform
 *                  sets AI_BUILDER_AGENT=1, and the create route asks
 *                  startEngine() for every job
 *   ONE GATE       a file the classic job codes (acceptCoded) and a file the
 *                  agent writes (validateFile) are refused for the same
 *                  reasons, in the same words: a secret or env read, no
 *                  settings, a header without the menu, a picture default
 *                  that is not https, a placeholder, a banned word, an em dash
 *   SAME CRAFT     the agent's system prompt carries the studio's rules
 *                  (STUDIO_CRAFT) and its own header and footer, and no
 *                  longer tells the model to leave "goes here" slots
 *   INLINE BUILD   without the jobs table, a reload carries the build on
 *                  from the last checkpoint this tab kept
 *   PROGRESS       both engines' progress panels are drawn by the editor
 *
 * Run with:  node scripts/run-push-tests.mjs
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { startEngine } from "@/lib/website-builder/ai-site/start"
import { acceptCoded } from "@/lib/website-builder/ai-site/code"
import { STUDIO_CRAFT, placeholderIn } from "@/lib/website-builder/ai-site/craft"
import { schemaProblem, sourceProblem } from "@/lib/website-builder/ai-site/gate"
import { validateFile } from "@/lib/ai-builder/agent/validate"
import { AGENT_SYSTEM, briefMessage } from "@/lib/ai-builder/agent/prompts"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { clearInlineBuild, INLINE_MAX_CHARS, INLINE_TTL_MS, inlineKey, readInlineBuild, saveInlineBuild, type StartStorage } from "@/lib/website-builder/start-handoff"
import { ABOUT, FOOTER, HEADER, HERO, PROGRAMS } from "./ai-builder-agent-fixtures"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

section("Which engine a new Describe your website start runs on")
{
  check("classic when the platform sets nothing", startEngine({}) === "classic")
  check("classic for any value but 1", startEngine({ AI_BUILDER_AGENT: "true" }) === "classic" && startEngine({ AI_BUILDER_AGENT: "0" }) === "classic")
  check("the agent only with AI_BUILDER_AGENT=1", startEngine({ AI_BUILDER_AGENT: "1" }) === "agent")
  const route = code("app/api/website-builder/themes/create/route.ts")
  check("the create route asks startEngine() for every job it starts", /startJobRow\([^)]*engine:\s*startEngine\(\)/.test(route))
  const runner = code("lib/website-builder/ai-site/runner.ts")
  check("a classic job is given the coder, so it codes its own header, footer and sections (free design)", /code:\s*writerCoder\(/.test(runner))
  check("an agent job is driven by the agent runner", /jobEngine\(job\) === "agent"[\s\S]{0,80}driveAgentJob/.test(runner))
}

section("One gate for both engines")
{
  const rename = (src: string, from: string, to: string) => src.replace(`"type": "${from}"`, `"type": "${to}"`)
  const hero = rename(HERO, "ai_coach_hero", "ai_gate_hero")
  const agentIssues = (src: string, type = "ai_gate_hero") => validateFile(`sections/${type}.storelib`, src).filter((i) => i.severity === "error")
  const classic = (src: string, role: "section" | "header" | "footer" = "section") => acceptCoded(src, { role, takenTypes: [] })

  const good = classic(hero)
  check("the agent's hero is accepted by the classic gate", good.ok === true, good)
  check("and by the agent's own", agentIssues(hero).length === 0, agentIssues(hero))

  for (const [name, src] of [
    ["the coach header", HEADER],
    ["the hero", HERO],
    ["the program list", PROGRAMS],
    ["the footer", FOOTER],
    ["the story", ABOUT],
  ] as const) {
    const type = /"type": "(ai_[a-z_]+)"/.exec(src)![1]
    const gate = validateFile(`sections/${type}.storelib`, src).filter((i) => i.code.startsWith("gate."))
    check(`round L's ${name} passes the shared gate`, gate.length === 0, gate)
  }

  const cases: { name: string; src: string; code: string; role?: "section" | "header" }[] = [
    { name: "an env read", src: hero.replace(".hx__photo {", "/* process.env.ANTHROPIC_API_KEY */ .hx__photo {"), code: "gate.secret" },
    { name: "a placeholder slot", src: hero.replace('"default": "Lift with a plan"', '"default": "Your class times go here"'), code: "gate.placeholder" },
    { name: "a banned word", src: hero.replace('"default": "Lift with a plan"', '"default": "Unlock your strength"'), code: "gate.banned_copy" },
    { name: "an em dash", src: hero.replace('"default": "Lift with a plan"', '"default": "Lift — with a plan"'), code: "gate.banned_copy" },
    /* The compiler refuses this one before the gate in both engines (an image_picker default must be an asset): refused either way. */
    { name: "a picture default that is not https", src: hero.replace('{ "type": "image_picker", "id": "photo", "label": "Photo" }', '{ "type": "image_picker", "id": "photo", "label": "Photo", "default": "gym.jpg" }'), code: "" },
  ]
  for (const c of cases) {
    const a = classic(c.src)
    const issues = agentIssues(c.src)
    const hit = c.code ? issues.find((i) => i.code === c.code) : issues[0]
    check(`${c.name}: refused by the classic job`, a.ok === false, a)
    check(`${c.name}: refused by the agent${c.code ? ` with ${c.code}` : ""}`, !!hit, issues.map((i) => i.code))
    if (c.code) check(`${c.name}: in the same words`, a.ok === false && !!hit && a.reason === hit.message, { classic: a.ok === false ? a.reason : null, agent: hit?.message })
  }

  const noSettings = `<template>\n<section class="ns"><p>Strength, twice a week.</p></section>\n</template>\n\n<style scoped>\n.ns { padding: 24px; }\n</style>\n\n<schema>\n{ "schema_version": 1, "type": "ai_gate_bare", "name": "Bare", "settings": [] }\n</schema>\n`
  const bare = schemasFromSources({ "sections/ai_gate_bare.storelib": noSettings }).ai_gate_bare
  check("a section with no settings is the gate's no_settings", !!bare && schemaProblem(bare, { role: "section" })?.code === "no_settings")
  check("and the agent refuses it", agentIssues(noSettings, "ai_gate_bare").some((i) => i.code === "gate.no_settings"), agentIssues(noSettings, "ai_gate_bare").map((i) => i.code))

  const menuless = rename(HEADER, "ai_coach_header", "ai_gate_header").replace(/\s*\{ "type": "link_list"[^\n]*\n/, "\n").replace(/\{% for link in settings\.menu\.links %\}[\s\S]*?\{% endfor %\}\s*\{% endfor %\}/, "").replace('data-storelib-menu="{{ settings.menu.handle }}"', "data-storelib-menu")
  const mh = agentIssues(menuless, "ai_gate_header")
  /* The strict quality pass may name it first (compile.quality); either way the file is not saved and the reason is the menu. */
  check("a header that does not read the site's menu is refused by the agent", mh.length > 0 && mh.some((i) => i.code === "gate.chrome_menu" || /menu|link_list/i.test(i.message)), mh.map((i) => `${i.code}: ${i.message.slice(0, 300)}`))
  check("a footer may go without a menu in the agent (a person might design one)", !validateFile("sections/ai_coach_footer.storelib", FOOTER).some((i) => i.code === "gate.chrome_menu"))

  check("the shared source check names a key and an env read", sourceProblem("x sk-ant-abc123 y")?.code === "secret" && sourceProblem("import.meta.env.X")?.code === "secret" && sourceProblem("<p>hi</p>") === null)
  for (const slot of ["Your class times go here", "Your studio address goes here", "Write your qualifications here.", "Write the story of the collection here", "Lorem ipsum"]) check(`"${slot}" is a placeholder`, placeholderIn(slot) !== null)
  for (const fine of ["Book a free first call", "Two evenings a week", "Small groups, a written plan", "Here is how a first week goes"]) check(`"${fine}" is not`, placeholderIn(fine) === null)
}

section("The agent is told what the classic job is told")
{
  check("STUDIO_CRAFT is in the agent's system prompt, whole", AGENT_SYSTEM.includes(STUDIO_CRAFT))
  check("it writes its own header and footer in place of the theme's", /write its header and footer as your own components/.test(AGENT_SYSTEM) &&/in place of any theme header or footer/.test(AGENT_SYSTEM))
  check("it is told a section with no settings is refused", /refuses a section with no settings/.test(AGENT_SYSTEM))
  check("it is no longer told to leave a slot for the creator", !/\("Your class times go here"\), never invented facts/.test(AGENT_SYSTEM) && /Never a slot/.test(AGENT_SYSTEM))
  const brief = briefMessage({ job: { jobId: "j", creatorId: "c", installId: "i", prompt: "A fitness coach", mode: "theme", budget: {} as never, startedAt: 0, spentUsd: 0, lastEventSeq: 0 }, caps: null, pages: [], files: [], knowledge: [] })
  check("inside a theme too, the new website's frame is its own", /Write the site's own header and footer and put them in place of the theme's/.test(brief))
}

section("The inline build carries on after a reload (no jobs table)")
{
  const map = new Map<string, string>()
  const storage: StartStorage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) }
  const now = 1_000_000
  const cp = { step: "code", plan: { brand: { name: "Northside" } }, state: { seq: 12, ops: [] } }
  check("nothing kept, nothing read", readInlineBuild(storage, "site-1", now) === null)
  check("the description is kept before the first checkpoint", saveInlineBuild(storage, "site-1", { prompt: "A fitness coach in Leeds", checkpoint: null }, now) && readInlineBuild(storage, "site-1", now)?.checkpoint === null)
  saveInlineBuild(storage, "site-1", { prompt: "A fitness coach in Leeds", checkpoint: cp }, now + 1000)
  const back = readInlineBuild(storage, "site-1", now + 2000)
  check("the latest checkpoint comes back with its description", back?.prompt === "A fitness coach in Leeds" && JSON.stringify(back?.checkpoint) === JSON.stringify(cp), back)
  check("another website never reads it", readInlineBuild(storage, "site-2", now + 2000) === null)
  check("it is kept under the website's own key", map.has(inlineKey("site-1")) && !map.has(inlineKey("site-2")))
  check("too old: removed", readInlineBuild(storage, "site-1", now + 1000 + INLINE_TTL_MS + 1) === null && !map.has(inlineKey("site-1")))
  saveInlineBuild(storage, "site-1", { prompt: "A fitness coach", checkpoint: cp }, now)
  clearInlineBuild(storage, "site-1")
  check("done: cleared", readInlineBuild(storage, "site-1", now) === null)
  check("a checkpoint too large for the tab is not kept", saveInlineBuild(storage, "site-1", { prompt: "x", checkpoint: { big: "a".repeat(INLINE_MAX_CHARS) } }, now) === false)
  map.set(inlineKey("site-1"), "{not json")
  check("an unreadable entry is removed", readInlineBuild(storage, "site-1", now) === null && !map.has(inlineKey("site-1")))
  const throwing: StartStorage = { getItem: () => { throw new Error("denied") }, setItem: () => { throw new Error("denied") }, removeItem: () => { throw new Error("denied") } }
  check("a tab that keeps nothing: no throw", saveInlineBuild(throwing, "s", { prompt: "p", checkpoint: null }) === false && readInlineBuild(throwing, "s") === null)

  const route = code("app/api/website-builder/themes/[installId]/generate/route.ts")
  check("the route sends a checkpoint with every saved state, null once done", /type: "job", job: view, checkpoint: j\.step === "done" \? null : checkpointOf\(j\)/.test(route))
  check("and still checks the caller owns the website before it trusts one", /if \(!site\.isOwner\) return/.test(route) && /withStoredCode\(fromCheckpoint\(job, body\.checkpoint\), installId\)/.test(route))
  const hook = code("lib/website-builder/ai-site/use-generation.ts")
  check("the editor's follower keeps each checkpoint as it comes", /"checkpoint" in line[\s\S]{0,200}onCheckpoint\?\.\(line\.checkpoint \?\? null\)/.test(hook))
  check("and starts a cut short build from the kept one", /checkpoint\.current === null && source\.checkpoint\) checkpoint\.current = source\.checkpoint/.test(hook))
  const editor = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the editor looks for a kept build before anything else without a job", /const carried = readInlineBuild\(stored, installId\)[\s\S]{0,200}kind: "inline", prompt: carried\.prompt, checkpoint: carried\.checkpoint/.test(editor))
  check("a new build keeps its description beyond the first section", /saveInlineBuild\(stored, installId, \{ prompt: waiting\.prompt, checkpoint: null \}\)/.test(editor))
  check("each checkpoint is kept, and the record cleared once the build is done", /onCheckpoint: \(checkpoint\) =>[\s\S]{0,300}saveInlineBuild\([\s\S]{0,120}clearInlineBuild\(/.test(editor))
}

section("The progress view follows both engines")
{
  const hook = code("lib/website-builder/ai-site/use-generation.ts")
  check("a job that answers as an agent job hands over to the agent follower", /\.engine === "agent"[\s\S]{0,60}setAgentJob\(source\.jobId\)/.test(hook))
  const editor = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the editor draws the agent's panel for an agent job", /generation\.agent\.view && !genDismissed[\s\S]{0,200}<AgentProgressPanel/.test(editor))
  check("and the classic panel for a classic or inline build", /generation\.view && !genDismissed[\s\S]{0,200}<GenerationPanel[\s\S]{0,80}mode=\{genSource\?\.kind === "inline" \? "inline" : "job"\}/.test(editor))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
