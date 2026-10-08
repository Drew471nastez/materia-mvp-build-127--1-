/**
 * AI Memory: what Storelib AI keeps for a creator on every website
 * (lib/ai-memory/store.ts), the remember tool's two scopes in the agent loop,
 * the route that loads and keeps them, the settings panel, the SQL part, and
 * the long task carried on in parts.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { addMemory, cleanMemory, deleteMemory, describeAccountMemory, isMissingTable, listMemories, MEMORY_MAX_CHARS, type MemoryDb } from "@/lib/ai-memory/store"
import { themeAgent, type ThemeAgentEvent, type ThemeAgentInput, type ThemeAgentResult } from "@/lib/website-builder/agent/loop"
import { buildSection, type ThemeState } from "@/lib/website-builder/agent/operations"
import { BRIEF_KEY, readBrief } from "@/lib/website-builder/agent/project-state"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── A fake of the few PostgREST calls the store makes, with row level security's effect ── */
type Row = { id: string; creator_id: string; install_id: string | null; content: string; source: string; created_at: string }
function fakeDb(rows: Row[], opts: { missing?: boolean } = {}): MemoryDb {
  let n = rows.length
  const missing = { code: "PGRST205", message: "Could not find the table 'public.ai_memories' in the schema cache" }
  return {
    from: () => {
      const make = (kind: "select" | "insert" | "delete", payload?: Record<string, unknown>) => {
        const filters: [string, unknown][] = []
        let lim = Infinity
        let single = false
        const run = async () => {
          if (opts.missing) return { data: null, error: missing }
          if (kind === "insert") {
            const row: Row = { id: `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`, created_at: new Date(Date.UTC(2026, 9, n)).toISOString(), ...(payload as Omit<Row, "id" | "created_at">) }
            rows.push(row)
            return { data: single ? row : [row], error: null }
          }
          const match = (r: Row) => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v)
          if (kind === "delete") {
            for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1)
            return { data: null, error: null }
          }
          const out = rows.filter(match).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, lim)
          return { data: out, error: null }
        }
        const q: Record<string, unknown> = {
          eq: (c: string, v: unknown) => (filters.push([c, v]), q),
          is: (c: string, v: unknown) => (filters.push([c, v]), q),
          order: () => q,
          limit: (x: number) => ((lim = x), q),
          select: () => q,
          single: () => ((single = true), q),
          then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
        }
        return q
      }
      return { select: () => make("select"), insert: (row: Record<string, unknown>) => make("insert", row), delete: () => make("delete") } as never
    },
  }
}

const ME = "creator-a"
const OTHER = "creator-b"

async function storeChecks() {
  console.log("\nThe store\n")
  const rows: Row[] = [
    { id: "11111111-1111-1111-1111-111111111111", creator_id: OTHER, install_id: null, content: "Someone else's", source: "creator", created_at: "2026-09-01T00:00:00.000Z" },
    { id: "22222222-2222-2222-2222-222222222222", creator_id: ME, install_id: "site-1", content: "Only for one website", source: "assistant", created_at: "2026-09-02T00:00:00.000Z" },
  ]
  const db = fakeDb(rows)

  const empty = await listMemories(db, ME)
  check("a creator sees none of another creator's, and no website's own", empty.ready && empty.memories.length === 0, empty)

  const first = await addMemory(db, ME, "  Prices   in euros.  ")
  check("a memory is kept in one tidy line", first.ok && first.memory.content === "Prices in euros.", first)
  const again = await addMemory(db, ME, "prices in EUROS.")
  check("the same sentence twice is kept once", again.ok && again.duplicate === true && rows.filter((r) => r.creator_id === ME && r.install_id === null).length === 1)
  await addMemory(db, ME, "No gradients, ever.", "assistant")
  const list = await listMemories(db, ME)
  check("the newest comes first, with who kept it", list.memories[0]?.content === "No gradients, ever." && list.memories[0]?.source === "assistant", list.memories)

  const blank = await addMemory(db, ME, "   ")
  check("an empty one is refused with a reason", blank.ok === false && /Write what/.test((blank as { error: string }).error))
  check("a long one is cut to the column's limit", cleanMemory("x".repeat(900)).length === MEMORY_MAX_CHARS)

  const othersId = rows[0].id
  await deleteMemory(db, ME, othersId)
  check("deleting another creator's id does nothing", rows.some((r) => r.id === othersId))
  const mine = list.memories[1]!.id
  check("deleting one's own forgets it", (await deleteMemory(db, ME, mine)) && !rows.some((r) => r.id === mine))

  const notRun = fakeDb([], { missing: true })
  const before = await listMemories(notRun, ME)
  check("before part 106 has run, the list is empty and says it is not ready", before.ready === false && before.memories.length === 0)
  const write = await addMemory(notRun, ME, "Something")
  check("and a write says memory is not set up, rather than failing silently", write.ok === false && (write as { notReady?: boolean }).notReady === true)
  check("both ways PostgREST says a table is missing are recognised", isMissingTable({ code: "42P01" }) && isMissingTable({ code: "PGRST205" }) && !isMissingTable({ code: "23505" }))

  const block = describeAccountMemory(["Prices in euros.", "No gradients."])
  check("the turn is told these hold on every website, and that the message wins", /EVERY WEBSITE/.test(block) && /the message wins/.test(block) && /- Prices in euros\./.test(block))
  check("no memory, no block", describeAccountMemory([]) === "")
}

/* ── The agent ─────────────────────────────────────────────────────────── */
type Step = { text?: string; calls?: Array<[string, Record<string, unknown>]> }
function scripted(script: Step[], sent: ProviderRequest[]): AgentProvider {
  let n = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })))
      const step = script[n++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `c${n}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return { text: step.text ?? "", toolCalls, raw: [], usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 }, stop: toolCalls.length ? "tool_calls" : "done" }
    },
  } as AgentProvider
}
const page = (): ThemeState => ({
  sections: ["header", "hero_centered", "faq_accordion", "footer"].map((t, i) => buildSection(`${t}-${i}`, t)!),
  settings: { brand_name: "Lumen" },
})
async function drive(input: Partial<ThemeAgentInput> & { script: Step[] }) {
  const sent: ProviderRequest[] = []
  const events: ThemeAgentEvent[] = []
  const gen = themeAgent({ provider: scripted(input.script, sent), model: "test", page: "home", addable: ADDABLE_SECTIONS, prompt: "x", state: page(), ...input } as ThemeAgentInput)
  for (;;) {
    const step = await gen.next()
    if (step.done === true) return { result: step.value as ThemeAgentResult, events, sent }
    events.push(step.value as ThemeAgentEvent)
  }
}
const userText = (sent: ProviderRequest[]) => sent.flatMap((r) => r.turns.filter((t) => t.role === "user").map((t) => (t as { content: string }).content)).join("\n")

async function agentChecks() {
  console.log("\nThe remember tool, in two scopes\n")
  const run = await drive({
    prompt: "Remember that I always sell in euros, and on this site the FAQ matters most",
    memory: true,
    accountMemory: ["Never use gradients."],
    script: [
      {
        calls: [
          ["remember", { note: "Sells in euros.", scope: "everywhere" }],
          ["remember", { note: "The FAQ matters most on this site." }],
        ],
      },
      { text: "Noted both." },
    ],
  })
  const tool = run.sent[0].tools.find((t) => t.name === "remember")
  check("remember offers a scope when account memory is on", !!tool && JSON.stringify(tool.parameters).includes("everywhere"))
  check("the turn shows what the creator asked to keep on every website", /WHAT THIS CREATOR ASKED YOU TO REMEMBER/.test(userText(run.sent)) && /Never use gradients\./.test(userText(run.sent)))
  check("an everywhere note comes back for the route to keep", JSON.stringify(run.result.remembered) === JSON.stringify(["Sells in euros."]), run.result.remembered)
  const briefOp = run.events.find((e): e is Extract<ThemeAgentEvent, { type: "op" }> => e.type === "op" && e.op.kind === "update_theme" && BRIEF_KEY in (e.op as { settings: Record<string, unknown> }).settings)
  const notes = readBrief(briefOp ? (briefOp.op as { settings: Record<string, unknown> }).settings : {}).decisions ?? []
  check("a website note stays in that website's own notes", notes.some((n) => /FAQ matters most/.test(n)) && !notes.some((n) => /euros/.test(n)), notes)

  const without = await drive({ memory: true, script: [{ calls: [["remember", { note: "Sells in euros.", scope: "everywhere" }]] }, { text: "Ok." }] })
  const tool2 = without.sent[0].tools.find((t) => t.name === "remember")
  check("without account memory (part 106 not run) there is no scope", !!tool2 && !JSON.stringify(tool2.parameters).includes("everywhere"))
  check("  and an everywhere note asked for anyway stays with the website", (without.result.remembered ?? []).length === 0)
}

function wiringChecks() {
  console.log("\nWired through\n")
  const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
  check("the agent route reads the creator's memory through their own client", /listMemories\(supabase as unknown as MemoryDb, creatorId, MEMORY_IN_TURN\)/.test(route))
  check("  passes it to the run only when the table is there", /account\.ready \? account\.memories\.map/.test(route) && /accountMemory,/.test(route))
  check("  and keeps what the run asked to remember, marked as the assistant's", /result\.remembered/.test(route) && /addMemory\([^)]*"assistant"\)/.test(route))
  const api = read("app/api/ai-memory/route.ts")
  check("the memory API never uses the service role", !/createAdminClient/.test(api) && !/createAdminClient/.test(read("app/api/ai-memory/[id]/route.ts")))
  const form = read("components/app/settings-form-new.tsx")
  check("Settings has AI Memory under Store", /\{ id: "ai_memory", label: "AI Memory", icon: Brain, group: "store" \}/.test(form) && /panelTab === "ai_memory" && <AiMemoryPanel \/>/.test(form))
  const panel = read("components/app/settings/ai-memory-panel.tsx")
  check("each memory can be deleted, and says who kept it", /aria-label=\{`Delete: \$\{m\.content\}`\}/.test(panel) && /Kept by Storelib AI/.test(panel))
  const sql = read("supabase/sql/run-now/106_ai_memory.sql")
  check("the SQL part has row level security for read, add and delete, and no update", /ENABLE ROW LEVEL SECURITY/.test(sql) && /FOR SELECT/.test(sql) && /FOR INSERT/.test(sql) && /FOR DELETE/.test(sql) && /REVOKE UPDATE/.test(sql))
  check("  and its migration is the same file", sql === read("supabase/migrations/20261126_ai_memory.sql"))
  check("  and the check after reports it", /as p106_ai_memory/.test(read("supabase/sql/run-now/99_check_after.sql")))

  const chat = read("components/website-builder/theme-chat.tsx")
  check("a long task is carried on in parts: the route says when time ran out", /send\(\{ type: "continue", reason: "time" \}\)/.test(route))
  check("  and the chat sends the next part on its own, a few times at most", /CONTINUE_PROMPT/.test(chat) && /MAX_CONTINUES = 3/.test(chat))
  const loop = read("lib/website-builder/agent/loop.ts")
  const code = read("app/api/website-builder/themes/[installId]/sections/code/route.ts")
  check("Code a section reads the same memory, through the creator's own client", /listMemories\(supabase as unknown as MemoryDb/.test(code) && /accountMemory: accountMemory\.ready/.test(code))
  check("  and the writer shows it before the request", /describeAccountMemory\(opts\.accountMemory \?\? \[\]\)/.test(read("lib/website-builder/agent/write-section.ts")))
  check("delete means every match, not hiding", /DELETE MEANS DELETE/.test(loop) && !/PREFER HIDING TO DELETING/.test(loop))
}

await storeChecks()
await agentChecks()
wiringChecks()
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
