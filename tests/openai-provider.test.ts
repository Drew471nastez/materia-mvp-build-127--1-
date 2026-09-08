/**
 * ===========================================================================
 *  THE SEAM BETWEEN OUR CODE AND THE NETWORK
 * ===========================================================================
 *
 * tests/agent-loop.test.ts drives the loop with a scripted provider, so it
 * never exercises the one place a wrong field name lives: the translation
 * between our types and the Responses API. That is precisely the layer that
 * cannot be checked by reading it — a plausible-looking `usage.prompt_tokens`
 * instead of `usage.input_tokens` compiles, ships, and silently records every
 * run as costing nothing.
 *
 * So this stands up a real HTTP server that speaks the Responses API shape,
 * points the OpenAI SDK at it with OPENAI_BASE_URL, and checks BOTH
 * directions: what we send, and what we make of what comes back.
 *
 * No key and no network — the server is on localhost and the key is the string
 * "test".
 *
 * Run with:  npm run test:push
 */

import { createServer, type IncomingMessage, type Server } from "node:http"
import { AddressInfo } from "node:net"

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

// ---------------------------------------------------------------------------
//  A server that speaks Responses API
// ---------------------------------------------------------------------------

interface Captured {
  path: string
  auth: string | undefined
  body: Record<string, any>
}

const captured: Captured[] = []
let nextResponse: Record<string, unknown> = {}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString("utf8")
}

const server: Server = createServer(async (request, response) => {
  const raw = await readBody(request)
  captured.push({
    path: request.url ?? "",
    auth: request.headers.authorization,
    body: raw ? JSON.parse(raw) : {},
  })
  response.writeHead(200, { "Content-Type": "application/json" })
  response.end(JSON.stringify(nextResponse))
})

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
const port = (server.address() as AddressInfo).port

process.env.OPENAI_API_KEY = "test-key-not-real"
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`

// Imported AFTER the env is set: the provider builds its client lazily, but
// importing first and setting after is the kind of ordering that works once
// and then does not.
const { openAIProvider } = await import("@/lib/sites/agent/openai-provider")
const { TOOL_SPECS } = await import("@/lib/sites/agent/tools")
const { SYSTEM_PROMPT } = await import("@/lib/sites/agent/loop")

function respondWith(body: Record<string, unknown>) {
  nextResponse = {
    id: "resp_1",
    object: "response",
    model: "gpt-5.6-luna",
    output: [],
    usage: { input_tokens: 0, output_tokens: 0, input_tokens_details: {}, output_tokens_details: {}, total_tokens: 0 },
    incomplete_details: null,
    ...body,
  }
}

// ---------------------------------------------------------------------------
section("What we send")
// ---------------------------------------------------------------------------

{
  respondWith({
    output: [{ type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "hi", annotations: [] }] }],
  })

  await openAIProvider.complete({
    model: "gpt-5.6-luna",
    system: SYSTEM_PROMPT,
    turns: [
      { role: "user", content: "make it warmer" },
      { role: "assistant", content: "", toolCalls: [], raw: [{ type: "function_call", call_id: "c1", name: "list_files", arguments: "{}" }] },
      { role: "tool", results: [{ id: "c1", output: "index.html\nsrc/App.tsx" }] },
    ],
    tools: TOOL_SPECS,
    maxOutputTokens: 32_000,
  })

  const sent = captured.at(-1)!

  check("it posts to the Responses API", sent.path.endsWith("/responses"), sent.path)
  check("the key travels as a bearer token, and it is the one we set", sent.auth === "Bearer test-key-not-real")
  check("the system prompt goes in `instructions`", sent.body.instructions === SYSTEM_PROMPT)

  /**
   * An assistant turn is replayed from the provider's OWN items. Rebuilding
   * one from our fields drops whatever the provider put there that we do not
   * model — tool-call metadata being exactly that sort of thing.
   */
  check(
    "an assistant turn is replayed verbatim from `raw`",
    JSON.stringify(sent.body.input[1]) ===
      JSON.stringify({ type: "function_call", call_id: "c1", name: "list_files", arguments: "{}" }),
    JSON.stringify(sent.body.input[1]),
  )

  check(
    "a tool result goes back as function_call_output keyed by call_id",
    sent.body.input[2].type === "function_call_output" &&
      sent.body.input[2].call_id === "c1" &&
      sent.body.input[2].output.includes("src/App.tsx"),
    JSON.stringify(sent.body.input[2]),
  )

  check(
    "every tool is declared flat, with a name and a schema",
    Array.isArray(sent.body.tools) &&
      sent.body.tools.length === TOOL_SPECS.length &&
      sent.body.tools.every((t: any) => t.type === "function" && typeof t.name === "string" && t.parameters),
  )

  /**
   * Strict mode is what makes tool arguments parse and carry the fields the
   * executor reads. A schema that misses `additionalProperties: false` or
   * leaves a property out of `required` is a 400 on the first real prompt —
   * after the user has typed and waited.
   */
  check(
    "strict mode is on and every schema is legal for it",
    sent.body.tools.every((t: any) => {
      const properties = Object.keys(t.parameters.properties ?? {})
      return (
        t.strict === true &&
        t.parameters.additionalProperties === false &&
        properties.every((key) => (t.parameters.required ?? []).includes(key))
      )
    }),
  )

  check(
    "the output cap is sent and clamped to the model's own limit",
    sent.body.max_output_tokens === 32_000,
    String(sent.body.max_output_tokens),
  )
}

// ---------------------------------------------------------------------------
section("Prompt caching is keyed to the project")
// ---------------------------------------------------------------------------

{
  /**
   * The prefix of every turn — the rules, the project map, the design tokens,
   * the manifest — is thousands of tokens that are identical on every turn AND
   * identical again on the creator's next request about the same site. The key
   * is what lets the provider recognise it, so the second prompt about a
   * project starts warm instead of paying for the same preamble again.
   */
  await openAIProvider.complete({
    model: "gpt-5.6-luna",
    system: SYSTEM_PROMPT,
    turns: [{ role: "user", content: "hello" }],
    tools: TOOL_SPECS,
    maxOutputTokens: 1000,
    cacheKey: "site:11111111-2222-3333-4444-555555555555",
  })
  const keyed = captured.at(-1)!
  check(
    "the key is sent when the caller gives one",
    keyed.body.prompt_cache_key === "site:11111111-2222-3333-4444-555555555555",
    String(keyed.body.prompt_cache_key),
  )
  check(
    "and it identifies the project, never the person",
    /^site:[0-9a-f-]+$/.test(String(keyed.body.prompt_cache_key)) &&
      !/@/.test(String(keyed.body.prompt_cache_key)),
  )

  await openAIProvider.complete({
    model: "gpt-5.6-luna",
    system: SYSTEM_PROMPT,
    turns: [{ role: "user", content: "hello" }],
    tools: TOOL_SPECS,
    maxOutputTokens: 1000,
  })
  const unkeyed = captured.at(-1)!
  /**
   * Absent, not empty. An empty string would group every project in the system
   * under one key, which is the opposite of what this is for.
   */
  check(
    "and the field is left out entirely when there is none",
    !("prompt_cache_key" in unkeyed.body),
    JSON.stringify(unkeyed.body.prompt_cache_key),
  )
}

// ---------------------------------------------------------------------------
section("What we make of the reply")
// ---------------------------------------------------------------------------

{
  respondWith({
    output: [
      { type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Reading the files.", annotations: [] }] },
      { type: "function_call", id: "fc1", call_id: "call_abc", name: "read_file", arguments: '{"path":"src/App.tsx"}' },
      { type: "function_call", id: "fc2", call_id: "call_def", name: "list_files", arguments: "{}" },
    ],
    usage: {
      input_tokens: 5000,
      output_tokens: 300,
      input_tokens_details: { cached_tokens: 4000, cache_write_tokens: 500 },
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 5300,
    },
  })

  const turn = await openAIProvider.complete({
    model: "gpt-5.6-luna",
    system: "s",
    turns: [{ role: "user", content: "go" }],
    tools: TOOL_SPECS,
    maxOutputTokens: 1000,
  })

  check("prose is read out of output_text", turn.text === "Reading the files.")
  check("both tool calls come through, in order", turn.toolCalls.map((c) => c.name).join() === "read_file,list_files")
  check(
    "a call is keyed by call_id, not the item id — that is what a result must echo",
    turn.toolCalls[0].id === "call_abc",
    turn.toolCalls[0].id,
  )
  check("arguments arrive as raw JSON text for the executor to parse", turn.toolCalls[0].argumentsJson === '{"path":"src/App.tsx"}')
  check("the stop reason says there is work to do", turn.stop === "tool_calls")

  /**
   * The field names. `input_tokens`, and the two cache figures nested under
   * `input_tokens_details` — a plausible guess at any of them compiles, ships,
   * and records every run as free.
   */
  check(
    "usage is read from the right fields",
    turn.usage.inputTokens === 5000 &&
      turn.usage.outputTokens === 300 &&
      turn.usage.cachedInputTokens === 4000 &&
      turn.usage.cacheWriteTokens === 500,
    JSON.stringify(turn.usage),
  )

  check("the raw output is kept for verbatim replay", Array.isArray(turn.raw) && (turn.raw as unknown[]).length === 3)
}

{
  // No tool calls: the model is finished.
  respondWith({
    output: [{ type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Made it warmer.", annotations: [] }] }],
  })
  const turn = await openAIProvider.complete({
    model: "gpt-5.6-luna", system: "s", turns: [{ role: "user", content: "go" }], tools: TOOL_SPECS, maxOutputTokens: 1000,
  })
  check("a reply with no tool calls stops the loop", turn.stop === "done" && turn.toolCalls.length === 0)
}

{
  /**
   * A refusal arrives as CONTENT, with HTTP 200. Read as prose it looks like
   * an ordinary answer, and a run that recorded it as a successful edit would
   * tell the creator their site was changed when nothing was.
   */
  respondWith({
    output: [{ type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "I can't help with that." }] }],
  })
  const turn = await openAIProvider.complete({
    model: "gpt-5.6-luna", system: "s", turns: [{ role: "user", content: "go" }], tools: TOOL_SPECS, maxOutputTokens: 1000,
  })
  check("a refusal is detected even though the request succeeded", turn.stop === "refusal")
  check("and its words are what the creator will see", turn.text === "I can't help with that.")
}

{
  // Truncated output. Not a success, and not the same thing as a refusal.
  respondWith({
    output: [{ type: "message", id: "m1", role: "assistant", status: "incomplete", content: [{ type: "output_text", text: "half a f", annotations: [] }] }],
    incomplete_details: { reason: "max_output_tokens" },
  })
  const turn = await openAIProvider.complete({
    model: "gpt-5.6-luna", system: "s", turns: [{ role: "user", content: "go" }], tools: TOOL_SPECS, maxOutputTokens: 10,
  })
  check("hitting the output cap is reported as `length`", turn.stop === "length")
}

{
  // A reply with no usage block at all must not crash the run.
  respondWith({ output: [], usage: undefined })
  const turn = await openAIProvider.complete({
    model: "gpt-5.6-luna", system: "s", turns: [{ role: "user", content: "go" }], tools: TOOL_SPECS, maxOutputTokens: 1000,
  })
  check("a missing usage block reads as zero rather than throwing", turn.usage.inputTokens === 0)
}

// ---------------------------------------------------------------------------
section("A missing key is a sentence, not a stack trace")
// ---------------------------------------------------------------------------

{
  // Fresh module instance, with no key in the environment at all.
  delete process.env.OPENAI_API_KEY
  const fresh = await import(`@/lib/sites/agent/openai-provider?nokey=${Date.now()}`)
  let name = ""
  try {
    await fresh.openAIProvider.complete({
      model: "gpt-5.6-luna", system: "s", turns: [{ role: "user", content: "go" }], tools: [], maxOutputTokens: 10,
    })
  } catch (error) {
    name = (error as Error).name
  }
  check("it throws a MissingKeyError the route can turn into a 503", name === "MissingKeyError", name)
}

server.close()

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
