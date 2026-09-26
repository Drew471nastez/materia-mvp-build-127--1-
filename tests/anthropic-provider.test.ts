/**
 * ===========================================================================
 *  CLAUDE, THROUGH THE PROVIDER LAYER THAT WAS ALREADY THERE
 * ===========================================================================
 * `types.ts` claimed a second provider would be one file implementing
 * `AgentProvider` rather than a search-and-replace through the feature. These
 * checks are what makes that claim true rather than aspirational: the loops,
 * the tools, the review pass, the transcript and the cost record are untouched
 * and the tests for all of them still pass.
 *
 * What is checked here is the part that has no compiler and no network: the
 * translation between our turn shape and Anthropic's, and the arithmetic that
 * decides what a run cost.
 *
 * Run with:  npm run test:push
 */

import { readUsage, toMessages } from "@/lib/sites/agent/anthropic-provider"
import { DEFAULT_PROVIDER, modelFor } from "@/lib/sites/agent/provider"
import { costOf, chooseTier } from "@/lib/sites/agent/models"
import type { AgentTurn } from "@/lib/sites/agent/types"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

// ===========================================================================
section("The two vendors count cached tokens differently")
// ===========================================================================

/**
 * THE ARITHMETIC BUG THIS EXISTS TO PREVENT.
 *
 * `TokenUsage.inputTokens` is documented as the TOTAL, with the cache figures
 * as SUBSETS — `costOf` subtracts them to find what pays full price. OpenAI
 * reports it that way. Anthropic does not: its `input_tokens` is the uncached
 * remainder, with cache reads and writes counted separately alongside it.
 *
 * Passed straight through, `costOf` would subtract the cache figures a second
 * time, clamp at zero, and bill a long cached run as very nearly free. Nothing
 * would fail — the number would just be wrong, in the direction nobody checks.
 */
{
  const usage = readUsage({
    input_tokens: 1_000,
    cache_read_input_tokens: 8_000,
    cache_creation_input_tokens: 1_000,
    output_tokens: 500,
  } as never)

  check(
    "the three disjoint counts are summed into the total this interface documents",
    usage.inputTokens === 10_000,
    JSON.stringify(usage),
  )
  check("and the subsets are carried through unchanged", usage.cachedInputTokens === 8_000 && usage.cacheWriteTokens === 1_000)

  /**
   * The consequence, priced. Sum it correctly and the uncached remainder is
   * 1,000 tokens; pass `input_tokens` through raw and the same run computes a
   * NEGATIVE remainder, clamps to zero, and under-reports.
   */
  const right = costOf("claude-sonnet-5", usage)
  const wrong = costOf("claude-sonnet-5", {
    inputTokens: 1_000,
    cachedInputTokens: 8_000,
    cacheWriteTokens: 1_000,
    outputTokens: 500,
  })
  check(
    "which is the difference between a right cost and a cheap-looking wrong one",
    right.priced && wrong.priced && right.usd > wrong.usd,
    `right ${right.usd} vs wrong ${wrong.usd}`,
  )
}

check(
  "the Claude models are priced, so a run's cost is recorded rather than unknown",
  costOf("claude-sonnet-5", { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 })
    .priced &&
    costOf("claude-opus-5", { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 })
      .priced,
)

// ===========================================================================
section("Turns, translated")
// ===========================================================================

{
  const turns: AgentTurn[] = [
    { role: "user", content: "add a pricing section" },
    {
      role: "assistant",
      content: "",
      toolCalls: [
        { id: "a", name: "add_section", argumentsJson: "{}" },
        { id: "b", name: "read_section", argumentsJson: "{}" },
      ],
      raw: [
        { type: "thinking", thinking: "…", signature: "sig" },
        { type: "tool_use", id: "a", name: "add_section", input: {} },
        { type: "tool_use", id: "b", name: "read_section", input: {} },
      ],
    },
    {
      role: "tool",
      results: [
        { id: "a", output: "added" },
        { id: "b", output: "read" },
      ],
    },
  ]

  const messages = toMessages(turns)

  /**
   * ONE user message for BOTH results. Splitting them is accepted by the API
   * and quietly teaches the model to stop making parallel calls — a slowdown
   * with no error attached to it, which is the kind that lives for months.
   */
  check(
    "both tool results come back in a single user message",
    messages.length === 3,
    JSON.stringify(messages.map((m) => m.role)),
  )
  /**
   * Found, not indexed. `messages[2]` on a two-element array is undefined and
   * reading `.content` off it throws — which aborts the whole suite file and
   * takes every check below it with it. A break-test proved that: the run
   * reported one failure and a stack trace where it should have reported
   * several failures.
   */
  const results = messages.filter((m) => Array.isArray(m.content))
  const last = results[results.length - 1]
  check(
    "and that message carries both",
    Array.isArray(last?.content) && (last.content as unknown[]).length === 2,
    JSON.stringify(last?.content),
  )

  /**
   * The assistant turn is replayed from `raw`, which for Anthropic carries
   * `thinking` blocks. Rebuilt from our own `content` string they would be
   * dropped on every round trip of a tool loop.
   */
  const assistant = messages.find((m) => m.role === "assistant")
  check(
    "the assistant turn is replayed verbatim, thinking blocks and all",
    Array.isArray(assistant?.content) &&
      (assistant.content as Array<{ type: string }>).some((b) => b.type === "thinking"),
    JSON.stringify(assistant?.content),
  )
}

{
  /** No `raw` — an assistant turn we built ourselves still has to survive. */
  const messages = toMessages([
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi", toolCalls: [] },
  ])
  check("an assistant turn with no raw falls back to its text", messages.length === 2)

  const empty = toMessages([{ role: "assistant", content: "", toolCalls: [] }])
  check(
    "and one with neither is dropped rather than sent as an empty message",
    empty.length === 0,
  )
}

// ===========================================================================
section("Which model answers")
// ===========================================================================

{
  const provider = readFileSync(join(root, "lib/sites/agent/provider.ts"), "utf8")

  /**
   * The VALUE, not a regex over the file. The first version of this check was
   * `/: "anthropic"/`, which matches half a dozen other lines in the same
   * module — flipping the actual fallback to "openai" left it green.
   */
  check("Claude is the default", DEFAULT_PROVIDER === "anthropic", DEFAULT_PROVIDER)
  check(
    "Sonnet for everyday work, Opus for the hard change",
    modelFor("anthropic", "fast") === "claude-sonnet-5" &&
      modelFor("anthropic", "strong") === "claude-opus-5",
    `${modelFor("anthropic", "fast")} / ${modelFor("anthropic", "strong")}`,
  )

  /**
   * A key can be missing on a preview deployment or revoked, and the failure
   * that produces — a run that starts, streams nothing, and dies on the first
   * call — is expensive and confusing.
   */
  check(
    "a provider this deployment cannot reach is checked BEFORE the run starts",
    /export function isConfigured/.test(provider) && /ANTHROPIC_API_KEY/.test(provider),
  )
  check(
    "and a substitution is said out loud rather than made silently",
    /substitutionNotice/.test(provider) && /is not configured on this deployment/.test(provider),
  )
  check(
    "the switch's value is untrusted — anything else falls back to the default",
    /isProviderId\(input\.requested\) \? input\.requested : DEFAULT_PROVIDER/.test(provider),
  )
}

{
  const anthropic = readFileSync(join(root, "lib/sites/agent/anthropic-provider.ts"), "utf8")

  /**
   * The mechanism, not a note: this import makes the BUILD FAIL if a client
   * component ever pulls the module in, which is the only reliable way a key
   * stays out of a JavaScript bundle.
   */
  check("the key cannot reach the browser", anthropic.startsWith('import "server-only"'))
  check(
    "and there is no public variant of it anywhere",
    !/NEXT_PUBLIC_ANTHROPIC/.test(
      readFileSync(join(root, "lib/sites/agent/provider.ts"), "utf8") + anthropic,
    ),
  )

  /**
   * `budget_tokens` is rejected with a 400 on Sonnet 5 and Opus 5 — the fixed
   * thinking budget is the previous generation's API.
   */
  /**
   * Comments stripped first. The first version of this check searched the
   * whole file for `budget_tokens` and failed on the COMMENT that explains why
   * the parameter is not used — a check that reads prose is a check that
   * argues with documentation.
   */
  const code = anthropic
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join("\n")
  check(
    "thinking is adaptive, which is the only on-mode these models have",
    /thinking: \{ type: "adaptive" as const \}/.test(code) && !/budget_tokens/.test(code),
    code.split("\n").filter((l) => /budget_tokens/.test(l)).join(" | "),
  )
  check(
    "a refusal is an outcome, not a failure",
    /stop_reason === "refusal"/.test(anthropic) && /stop: "refusal"/.test(anthropic),
  )
  check(
    "errors are the SDK's typed classes, most specific first, never string matching",
    /instanceof Anthropic\.RateLimitError/.test(anthropic) &&
      /instanceof Anthropic\.APIConnectionError/.test(anthropic) &&
      /instanceof Anthropic\.APIError/.test(anthropic),
  )
}

{
  const route = readFileSync(
    join(root, "app/api/website-builder/themes/[installId]/agent/route.ts"),
    "utf8",
  )
  check(
    "the theme editor resolves the creator's choice instead of hard-coding a vendor",
    /* On the creator's own AI when they have one (tests/own-ai.test.ts), their switch honoured either way. */
    /resolveForCreator\(\(creator as \{ id: string \}\)\.id, \{ requested: body\.provider, tier: body\.tier \}\)/.test(route) &&
      !/provider: openAIProvider/.test(route),
  )
  /**
   * Checking only OPENAI_API_KEY here would refuse every request on a
   * deployment that has moved to Claude — the exact migration this enables.
   */
  check(
    "and either key, or one of the creator's own, is enough for the endpoint to be considered configured",
    /!\(await canAnswer\(/.test(route) && /isConfigured\("anthropic"\) \|\| isConfigured\("openai"\)/.test(readFileSync(join(root, "lib/sites/agent/provider.ts"), "utf8")),
  )
  check("Claude's failures are reported in words", /describeAnthropicError\(thrown\)/.test(route))
}

{
  const sites = readFileSync(join(root, "app/api/sites/[siteId]/agent/route.ts"), "utf8")
  const run = readFileSync(join(root, "lib/sites/agent/run.ts"), "utf8")

  check(
    "the coding agent goes to Claude too",
    /resolveForCreator\(creatorId, \{ requested: undefined \}\)/.test(sites) && /provider: resolved\.provider/.test(sites),
  )

  /**
   * A FUNCTION, not a string. Which vendor answers is the route's business;
   * how big the project is, is only known inside the run — the files are
   * loaded there. Passing a plain id meant calling `chooseTier(prompt, 0)` and
   * silently dropping the rule that a change in a thirty-file project is
   * unlikely to stay in one file.
   */
  check(
    "and the model still knows how big the project is",
    /pickModel: \(fileCount\) =>/.test(sites) &&
      /input\.pickModel\?\.\(Object\.keys\(files\)\.length\)/.test(run),
  )
  check(
    "while run.ts stays free of any vendor import",
    !/anthropic|openai/i.test(
      run
        .split("\n")
        .filter((line) => line.startsWith("import"))
        .join("\n"),
    ),
  )
  check(
    "a big project still promotes a small request",
    chooseTier("tweak it", 40) === "strong" && chooseTier("tweak it", 2) === "fast",
  )
}

// ===========================================================================
section("The switch, where somebody can reach it")
// ===========================================================================

{
  const chat = readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8")

  check("there are three choices and Claude is first", /id: "claude",[\s\S]{0,120}Claude Sonnet/.test(chat))
  check("Opus is offered for a change somebody knows is hard", /id: "claude-opus"/.test(chat))
  check("ChatGPT is still there", /id: "openai"/.test(chat))
  check(
    "the default is Claude, not whatever came first alphabetically",
    /React\.useState<EngineId>\("claude"\)/.test(chat),
  )
  check(
    "the choice is remembered per browser",
    /localStorage\.setItem\(ENGINE_KEY/.test(chat) && /localStorage\.getItem\(ENGINE_KEY\)/.test(chat),
  )
  check(
    "and it is actually sent, read at send time like everything else",
    /provider: live\.current\.engine\.provider/.test(chat) &&
      /tier: live\.current\.engine\.tier/.test(chat),
  )
  /**
   * A menu you can only close by choosing something is a menu people close by
   * choosing the wrong thing.
   */
  /* A press anywhere outside it, listened for on the document: a fixed
     click-away layer cannot cover the window from inside the frosted dock,
     whose backdrop filter makes it the layer's containing block. */
  check(
    "the menu can be dismissed without picking",
    /if \(!engineRef\.current\?\.contains\(event\.target as Node\)\) setEngineOpen\(false\)/.test(chat) &&
      /document\.addEventListener\("pointerdown", away, true\)/.test(chat),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
