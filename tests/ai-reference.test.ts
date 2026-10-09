/**
 * ===========================================================================
 *  ASK STORELIB KNOWS THE FRAMEWORK, AND WHAT A GOOD SECTION LOOKS LIKE
 * ===========================================================================
 * lib/storelib-ai/reference.ts: the section framework written out exactly,
 * a quality checklist, and three of Storelib's own sections, composed into
 * the stable system prompt of both builder AIs: the page assistant
 * (lib/website-builder/agent/loop.ts) and Code section
 * (lib/website-builder/agent/write-section.ts).
 *
 *   REACHES        both models are sent it, read from what they were sent
 *   TRUE           every variable and scheme key it names is one the
 *                  built-in sections use; every example compiles and passes
 *                  the checks an agent's own section is held to
 *   CACHED         the system prompt is the same text for every request and
 *                  every website; what is per website is in the turn
 *   SIZED          under a budget, because the prefix is read every turn
 *   WORDS          no em dash, none of the banned words
 *
 * Run with:  npm run test:push
 */
import {
  FRAMEWORK_REFERENCE,
  QUALITY_CHECKLIST,
  REFERENCE_SECTION_TYPES,
  pageAgentReference,
  promptCopy,
  writerReference,
} from "@/lib/storelib-ai/reference"
import { CORE_FORMAT, INTEGRATION_CONTRACT, validateSection } from "@/lib/storelib-ai"
import { SCHEME_COLOR_KEYS } from "@/lib/storelib-theme/color-schemes"
import { compileSection } from "@/lib/storelib-theme"
import { themeAgent } from "@/lib/website-builder/agent/loop"
import { buildSection, type ThemeState } from "@/lib/website-builder/agent/operations"
import { takenNote, writeSection, writeSectionSystem } from "@/lib/website-builder/agent/write-section"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "@/lib/sites/agent/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const section = (t: string) => console.log(`\n${t}`)
const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i

/* A model that answers with what it is told to, and keeps every request it was sent. */
function recording(answers: string[], sent: ProviderRequest[]): AgentProvider {
  let turn = 0
  return {
    id: "recording",
    async complete(request): Promise<ProviderTurn> {
      sent.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })) as ProviderRequest)
      const text = answers[turn++] ?? "Done."
      return { text, toolCalls: [], raw: [{ type: "text", text }], usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, stop: "done" }
    },
  }
}

function page(): ThemeState {
  const types = ["header", "hero_centered", "faq_accordion", "footer"]
  return { sections: types.map((t, i) => buildSection(`${t}-${i}`, t)!).filter(Boolean), settings: { brand_name: "Northlight Presets" } }
}

async function pageAgentSystem(prompt: string): Promise<string> {
  const sent: ProviderRequest[] = []
  const loop = themeAgent({ provider: recording(["What would you like changed?"], sent), model: "test", prompt, state: page(), page: "home", addable: ADDABLE_SECTIONS })
  for (let step = await loop.next(); !step.done; step = await loop.next()) {
    /* the events are not what is under test */
  }
  return sent[0]?.system ?? ""
}

async function main() {
  /* Each example as the prompt carries it: comments out, and the reduced motion rule added where the built-in lacks it. */
  const examples = REFERENCE_SECTION_TYPES.map(({ type }) => ({ type, compact: promptCopy(DEFAULT_THEME_SOURCES[`sections/${type}.storelib`] ?? "") }))

  // ═══════════════════════════════════════════════════════════════════════
  section("Both builder AIs are sent it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const system = await pageAgentSystem("make the FAQ answers shorter")
    check("the page assistant's system prompt carries the framework reference", system.includes(FRAMEWORK_REFERENCE))
    check("and the quality checklist", system.includes(QUALITY_CHECKLIST))
    check("and the file format and the integration contract, which it did not have before", system.includes(CORE_FORMAT) && system.includes(INTEGRATION_CONTRACT))
    check(
      "and two whole built-in sections: the native shape and content in blocks",
      system.includes(examples[0].compact) && system.includes(examples[1].compact) && /sections\/cta_simple\.storelib, for/.test(system) && /sections\/faq_accordion\.storelib, for/.test(system),
    )
    check("in the system prompt, where it is cached, and after the rulebook", system.indexOf(FRAMEWORK_REFERENCE) > system.indexOf("THE SAME RULES AS EVERY AGENT ON STORELIB"))

    const writer = writeSectionSystem()
    check("Code section's system prompt carries the framework reference and the checklist", writer.includes(FRAMEWORK_REFERENCE) && writer.includes(QUALITY_CHECKLIST))
    check("and all three sections, the product one included", examples.every((e) => writer.includes(e.compact)) && /sections\/product_featured\.storelib, for/.test(writer))
    check("and still ends on how to answer: the file only, or REPLY:", writer.trimEnd().endsWith('"A pricing section with three plans and a monthly or yearly switch").') && writer.lastIndexOf("Answer with the file ONLY") > writer.indexOf(FRAMEWORK_REFERENCE))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What it says is true of the engine")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const builtIns = Object.entries(DEFAULT_THEME_SOURCES)
      .filter(([path]) => path.startsWith("sections/"))
      .map(([, source]) => source)
      .join("\n")
    const variables = [...new Set(FRAMEWORK_REFERENCE.match(/--[a-z][a-z0-9-]+/g) ?? [])]
    const unknownVars = variables.filter((v) => !builtIns.includes(v))
    check(`every CSS variable it names (${variables.length}) is one the built-in sections use`, variables.length >= 20 && unknownVars.length === 0, unknownVars.join(", "))
    const keys = [...new Set((FRAMEWORK_REFERENCE.match(/scheme\.([a-z_]+)/g) ?? []).map((k) => k.slice(7)))]
    const unknownKeys = keys.filter((k) => !builtIns.includes(`scheme.${k}`) && !(SCHEME_COLOR_KEYS as readonly string[]).includes(k))
    check(`every scheme key it names (${keys.length}) exists`, keys.length >= 10 && unknownKeys.length === 0, unknownKeys.join(", "))
    check("the scheme's semantic keys are the engine's own list", SCHEME_COLOR_KEYS.every((k) => FRAMEWORK_REFERENCE.includes(k)))
    for (const topic of ["SCHEMA", "BLOCKS", "PRESETS", "COLOUR SCHEME", "TYPE TOKENS", "SPACING", "BUTTONS", "LINKS", "IMAGES", "PRODUCTS", "RESPONSIVE"]) {
      check(`it covers ${topic.toLowerCase()}`, new RegExp(`(^|\\n)${topic}[ :(]`).test(FRAMEWORK_REFERENCE))
    }
    for (const { type, compact } of examples) {
      const compiled = compileSection(compact, { file: `sections/${type}.storelib` })
      check(`${type}, as the prompt shows it, compiles`, compiled.ok === true, compiled.ok ? "" : JSON.stringify((compiled as { errors: unknown }).errors).slice(0, 300))
      const checked = validateSection(compact, { path: `sections/${type}.storelib`, expectType: type, strict: true })
      check(`and passes the checks an agent's own section is held to`, checked.ok === true, checked.ok ? "" : (checked as { feedback?: string }).feedback?.slice(0, 300))
      check(`and has no comments left to pay for`, !/\{#|<!--|\/\*/.test(compact))
      check(`and turns its motion off for a visitor who asked for less`, !/transition|animation/.test(compact) || /prefers-reduced-motion/.test(compact))
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The checklist names what a good section is")
  // ═══════════════════════════════════════════════════════════════════════
  {
    for (const [point, words] of [
      ["hierarchy", /Hierarchy:/],
      ["spacing rhythm", /Spacing rhythm:/],
      ["one clear action", /One clear action:/],
      ["mobile first", /Mobile first:/],
      ["colours that may follow the scheme", /Colours may follow the scheme/],
      ["real content from the creator's products", /Real content: the creator's products/],
    ] as const) {
      check(`it names ${point}`, words.test(QUALITY_CHECKLIST))
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Cached: one prefix for every request and every website")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const a = await pageAgentSystem("add a pricing section")
    const b = await pageAgentSystem("hello")
    check("the page assistant's system prompt is the same text whatever is asked", a === b && a.length > 0)
    check("Code section's system prompt takes no arguments: it cannot vary by website", writeSectionSystem.length === 0 && writeSectionSystem() === writeSectionSystem())

    const sentA: ProviderRequest[] = []
    const sentB: ProviderRequest[] = []
    await writeSection({ provider: recording(["REPLY: Which plans?"], sentA), model: "test", prompt: "a pricing table", takenTypes: ["northlight_plans"], takenNames: ["Northlight Plans"] })
    await writeSection({ provider: recording(["REPLY: Which plans?"], sentB), model: "test", prompt: "a pricing table", takenTypes: ["mine_one"], takenNames: ["Mine"] })
    check("two websites with different sections send Code section the same system prompt", sentA[0].system === sentB[0].system)
    const turnA = (sentA[0].turns[0] as { content: string }).content
    check(
      "and each website's taken names go in its own request",
      turnA.includes(takenNote(["Northlight Plans"], ["northlight_plans"])) && !sentA[0].system.includes("Northlight Plans") && !sentA[0].system.includes("northlight_plans"),
    )
    check("before the request itself", turnA.indexOf("Types already taken") < turnA.indexOf("REQUEST\na pricing table"))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Sized, because it is read on every turn")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* Four characters a token, the estimate scripts/measure-agent-tokens.ts reports. */
    const page = pageAgentReference().length
    const writer = writerReference().length
    /* 23,000 until the framework said how to type a picture, a menu and a colour per element, and that the header is configured: 600 characters. */
    /* 23,600 until the control list gained collection_picker and collection_list (about 10 tokens). */
    /* 23,650 until the built-in section it quotes read the theme's heading font, button size and caption (round 25): about 90 tokens. */
    check(`the page assistant's reference stays under ~6k tokens (${Math.round(page / 4)})`, page <= 24_100, `${page} chars`)
    /* 33,000 until the product reference drew a collection and products chosen in the sidebar, the way a shop theme does, beside the shop: two more card loops, about 300 tokens. */
    /* 34,000 until the same round 25 change to the built-in sections it quotes: about 150 tokens. */
    check(`Code section's reference stays under ~8.7k tokens (${Math.round(writer / 4)})`, writer <= 34_700, `${writer} chars`)
    check("the framework itself stays short", FRAMEWORK_REFERENCE.length <= 6_600 && QUALITY_CHECKLIST.length <= 1_400, `${FRAMEWORK_REFERENCE.length} / ${QUALITY_CHECKLIST.length}`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Words")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* CSS names its own properties: text-transform is a property, not a word anybody reads. */
    const written = [FRAMEWORK_REFERENCE, QUALITY_CHECKLIST, ...REFERENCE_SECTION_TYPES.map((s) => s.teaches)].join("\n").replace(/[\w-]*-transform\b|\btransform\s*:/g, "")
    check("no em dash in what it says", !/—/.test(written))
    check("and none of the banned words", !BANNED.test(written), (written.match(BANNED) ?? [""])[0])
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
