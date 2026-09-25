/**
 * ===========================================================================
 *  ASK STORELIB: DELETING CONVERSATIONS, AND REPORTING AN ANSWER
 * ===========================================================================
 * "I can delete the chat history." "I can report the prompt."
 *
 * deleteThemeChat and reportThemeExchange (lib/website-builder/agent/chat.ts)
 * run against a fake database here. It keeps its rows in memory and its
 * USER client applies the rule the real policies apply: a row on a
 * theme_chat_* table is visible only when its install belongs to the signed
 * in creator. The admin client sees everything, as the service role does.
 *
 * What is held:
 *   SCOPING    another creator's conversation, or one on another website, is
 *              not found and nothing is deleted, even when the install check
 *              in the route is imagined away
 *   DELETE     one conversation takes its messages and their pictures (the
 *              bytes before the rows); "earlier" takes only the messages from
 *              before conversations; all takes every one on this website and
 *              nothing on another
 *   BEFORE SQL a database without the conversations table still deletes its
 *              one thread, and says not_set_up for a single conversation
 *   PICTURES   bytes that cannot be removed now are handed to the collector
 *   REPORT     stores the question and reply ids and words, once per
 *              question, never for somebody else's message, and says
 *              not_set_up before its table exists
 *   ROUTES     each proves ownership before it reads or deletes anything
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  CHAT_PICTURES_BUCKET,
  deleteThemeChat,
  reportThemeExchange,
  type ChatClients,
  type ChatDb,
} from "../lib/website-builder/agent/chat"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const section = (name: string) => console.log(`\n${name}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── the fake database ───────────────────────────────────────────────── */

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

const MISSING = { code: "42P01", message: 'relation "x" does not exist' }

class Store {
  tables: Tables
  missing = new Set<string>()
  removed: string[] = []
  storageFails = false
  private next = 0
  constructor(tables: Tables) {
    this.tables = tables
  }
  id() {
    this.next++
    return `00000000-0000-4000-8000-${String(this.next).padStart(12, "0")}`
  }
  /** The service role: every row. */
  admin(): ChatDb {
    return this.client(() => true)
  }
  /** A creator's own client: theme_chat_* rows on the installs they own, as RLS allows. */
  user(owned: string[]): ChatDb {
    return this.client((table, row) => !table.startsWith("theme_chat_") || owned.includes(String(row.install_id)))
  }
  private client(visible: (table: string, row: Row) => boolean): ChatDb {
    return {
      from: (table: string) => new Query(this, table, visible),
      storage: {
        from: (bucket: string) => ({
          remove: async (paths: string[]) => {
            if (this.storageFails || bucket !== CHAT_PICTURES_BUCKET) return { data: null, error: { message: "storage down" } }
            this.removed.push(...paths)
            return { data: paths.map((name) => ({ name })), error: null }
          },
        }),
      },
    }
  }
}

class Query {
  private op: "select" | "delete" | "update" | "upsert" = "select"
  private filters: ((row: Row) => boolean)[] = []
  private sort: { column: string; ascending: boolean } | null = null
  private max: number | null = null
  private one = false
  private patch: Row = {}
  private conflict = ""
  constructor(
    private store: Store,
    private table: string,
    private visible: (table: string, row: Row) => boolean,
  ) {}
  select() { return this }
  eq(column: string, value: unknown) { this.filters.push((r) => r[column] === value); return this }
  is(column: string, value: unknown) { this.filters.push((r) => (r[column] ?? null) === value); return this }
  in(column: string, values: unknown[]) { this.filters.push((r) => values.includes(r[column])); return this }
  gt(column: string, value: string) { this.filters.push((r) => String(r[column]) > value); return this }
  lt(column: string, value: string) { this.filters.push((r) => String(r[column]) < value); return this }
  order(column: string, options: { ascending: boolean }) { this.sort = { column, ascending: options.ascending }; return this }
  limit(n: number) { this.max = n; return this }
  maybeSingle() { this.one = true; return this }
  delete() { this.op = "delete"; return this }
  update(patch: Row) { this.op = "update"; this.patch = patch; return this }
  upsert(row: Row, options: { onConflict: string }) { this.op = "upsert"; this.patch = row; this.conflict = options.onConflict; return this }
  then(resolve: (value: { data: unknown; error: unknown }) => void) {
    resolve(this.run())
  }
  private run(): { data: unknown; error: unknown } {
    if (this.store.missing.has(this.table)) return { data: null, error: MISSING }
    const rows = (this.store.tables[this.table] ??= [])
    if (this.op === "upsert") {
      const at = rows.findIndex((r) => r[this.conflict] === this.patch[this.conflict])
      if (at >= 0) rows[at] = { ...rows[at], ...this.patch }
      else rows.push({ id: this.store.id(), ...this.patch })
      return { data: null, error: null }
    }
    const hit = rows.filter((r) => this.visible(this.table, r) && this.filters.every((f) => f(r)))
    if (this.op === "delete") {
      this.store.tables[this.table] = rows.filter((r) => !hit.includes(r))
      return { data: null, error: null }
    }
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.patch)
      return { data: null, error: null }
    }
    let out = [...hit]
    if (this.sort) {
      const { column, ascending } = this.sort
      out.sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1))
    }
    if (this.max !== null) out = out.slice(0, this.max)
    return this.one ? { data: out[0] ?? null, error: null } : { data: out, error: null }
  }
}

/* ── two creators, two websites ──────────────────────────────────────── */

const IA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const IB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const CA1 = "a1a1a1a1-0000-4000-8000-000000000001"
const CA2 = "a2a2a2a2-0000-4000-8000-000000000002"
const CB1 = "b1b1b1b1-0000-4000-8000-000000000003"
const M = (n: number) => `33333333-0000-4000-8000-${String(n).padStart(12, "0")}`
const CREATOR_A = "ca000000-0000-4000-8000-00000000000a"

function world() {
  return new Store({
    theme_chat_conversations: [
      { id: CA1, install_id: IA, title: "Make the header black" },
      { id: CA2, install_id: IA, title: "Add a newsletter" },
      { id: CB1, install_id: IB, title: "Somebody else's" },
    ],
    theme_chat_messages: [
      { id: M(1), install_id: IA, conversation_id: CA1, role: "user", content: "Make the header black", created_at: "2026-09-25T10:00:00Z" },
      { id: M(2), install_id: IA, conversation_id: CA1, role: "assistant", content: "Changed the header to black.", created_at: "2026-09-25T10:00:09Z" },
      { id: M(3), install_id: IA, conversation_id: CA2, role: "user", content: "Add a newsletter", created_at: "2026-09-25T11:00:00Z" },
      { id: M(4), install_id: IA, conversation_id: null, role: "user", content: "From before conversations", created_at: "2026-09-01T09:00:00Z" },
      { id: M(5), install_id: IB, conversation_id: CB1, role: "user", content: "B's question", created_at: "2026-09-25T12:00:00Z" },
    ],
    theme_chat_attachments: [
      { id: "att-1", install_id: IA, message_id: M(1), storage_path: `${IA}/one.jpg`, expires_at: "2026-10-25T00:00:00Z" },
      { id: "att-4", install_id: IA, message_id: M(4), storage_path: `${IA}/four.jpg`, expires_at: "2026-10-01T00:00:00Z" },
      { id: "att-5", install_id: IB, message_id: M(5), storage_path: `${IB}/five.jpg`, expires_at: "2026-10-25T00:00:00Z" },
    ],
    theme_chat_reports: [],
  })
}
const clientsFor = (db: Store, owned: string[]): ChatClients => ({ user: db.user(owned), admin: db.admin() })
const ids = (db: Store, table: string) => (db.tables[table] ?? []).map((r) => String(r.id))

// ---------------------------------------------------------------------------
section("Deleting one conversation")
// ---------------------------------------------------------------------------
{
  const db = world()
  const result = await deleteThemeChat(IA, { kind: "one", id: CA1 }, clientsFor(db, [IA]))
  check("it is deleted, with the two messages in it", result.ok === true && result.conversations === 1 && result.messages === 2, JSON.stringify(result))
  check("the conversation row is gone and the other one on the website stays", !ids(db, "theme_chat_conversations").includes(CA1) && ids(db, "theme_chat_conversations").includes(CA2))
  check("its messages are gone and nothing else is", ids(db, "theme_chat_messages").join() === [M(3), M(4), M(5)].join(), ids(db, "theme_chat_messages").join())
  check("its picture's bytes are removed from the private bucket, then the row", db.removed.join() === `${IA}/one.jpg` && !ids(db, "theme_chat_attachments").includes("att-1"))
  check("and another website's picture is untouched", ids(db, "theme_chat_attachments").includes("att-5") && ids(db, "theme_chat_attachments").includes("att-4"))
}

// ---------------------------------------------------------------------------
section("Only the creator's own, on this website")
// ---------------------------------------------------------------------------
{
  const db = world()
  const before = JSON.stringify(db.tables)
  const other = await deleteThemeChat(IA, { kind: "one", id: CB1 }, clientsFor(db, [IA]))
  check("another website's conversation, asked for on this one, is not found", other.ok === false && other.status === 404, JSON.stringify(other))
  check("and nothing at all was deleted", JSON.stringify(db.tables) === before && db.removed.length === 0)

  /* The route's ownership check imagined away: A's client, B's website. RLS alone still refuses. */
  const bypass = await deleteThemeChat(IB, { kind: "one", id: CB1 }, clientsFor(db, [IA]))
  check("with the route's install check imagined away, RLS still hides it: 404", bypass.ok === false && bypass.status === 404)
  check("and still nothing was deleted", JSON.stringify(db.tables) === before)

  const junk = await deleteThemeChat(IA, { kind: "one", id: "not-a-uuid" }, clientsFor(db, [IA]))
  check("an id that is not an id never reaches a query", junk.ok === false && junk.status === 404 && JSON.stringify(db.tables) === before)

  const allOfB = await deleteThemeChat(IB, { kind: "all" }, clientsFor(db, [IA]))
  check("deleting all on a website that is not theirs deletes none of it", allOfB.ok === true && allOfB.conversations === 0 && allOfB.messages === 0 && ids(db, "theme_chat_messages").includes(M(5)))
}

// ---------------------------------------------------------------------------
section("The earlier messages, and all of them")
// ---------------------------------------------------------------------------
{
  const db = world()
  const earlier = await deleteThemeChat(IA, { kind: "earlier" }, clientsFor(db, [IA]))
  check("'earlier' deletes only the messages from before conversations", earlier.ok === true && ids(db, "theme_chat_messages").join() === [M(1), M(2), M(3), M(5)].join(), ids(db, "theme_chat_messages").join())
  check("and their picture", db.removed.join() === `${IA}/four.jpg`)
  const again = await deleteThemeChat(IA, { kind: "earlier" }, clientsFor(db, [IA]))
  check("asked again, there is nothing earlier left: 404", again.ok === false && again.status === 404)

  const all = await deleteThemeChat(IA, { kind: "all" }, clientsFor(db, [IA]))
  check("'all' deletes every conversation on this website", all.ok === true && all.conversations === 2 && ids(db, "theme_chat_conversations").join() === CB1)
  check("and every message on it, and no other website's", ids(db, "theme_chat_messages").join() === M(5))
  check("and every picture on it", ids(db, "theme_chat_attachments").join() === "att-5" && db.removed.includes(`${IA}/one.jpg`))
}

// ---------------------------------------------------------------------------
section("Before the conversations SQL has run")
// ---------------------------------------------------------------------------
{
  const db = world()
  db.missing.add("theme_chat_conversations")
  const one = await deleteThemeChat(IA, { kind: "one", id: CA1 }, clientsFor(db, [IA]))
  check("one conversation: says not_set_up, 503, and deletes nothing", one.ok === false && one.status === 503 && one.reason === "not_set_up" && ids(db, "theme_chat_messages").length === 5)
  const all = await deleteThemeChat(IA, { kind: "all" }, clientsFor(db, [IA]))
  check("all: the one thread the website has is still deleted", all.ok === true && ids(db, "theme_chat_messages").join() === M(5), JSON.stringify(all))

  const bare = world()
  bare.missing.add("theme_chat_messages")
  const none = await deleteThemeChat(IA, { kind: "all" }, clientsFor(bare, [IA]))
  check("with no chat table at all: not_set_up, never a crash", none.ok === false && none.reason === "not_set_up")
}

// ---------------------------------------------------------------------------
section("Pictures that cannot be removed right now")
// ---------------------------------------------------------------------------
{
  const db = world()
  db.storageFails = true
  const result = await deleteThemeChat(IA, { kind: "one", id: CA1 }, clientsFor(db, [IA]))
  const row = db.tables.theme_chat_attachments.find((r) => r.id === "att-1")
  check("the conversation is still deleted", result.ok === true && !ids(db, "theme_chat_messages").includes(M(1)))
  check("and the picture's row is let go of its message and marked due, for the collector", !!row && row.message_id === null && String(row.expires_at) <= new Date().toISOString())
}

// ---------------------------------------------------------------------------
section("Reporting an answer")
// ---------------------------------------------------------------------------
{
  const db = world()
  const first = await reportThemeExchange({ installId: IA, creatorId: CREATOR_A, messageId: M(1), reason: "  Wrong colours  ", engine: "claude-opus" }, clientsFor(db, [IA]))
  const report = db.tables.theme_chat_reports[0]
  check("a report is stored", first.ok === true && db.tables.theme_chat_reports.length === 1)
  check(
    "with the conversation, the question's and the reply's ids, the reason, and the model",
    report?.conversation_id === CA1 && report?.message_id === M(1) && report?.reply_message_id === M(2) && report?.reason === "Wrong colours" && report?.engine === "claude-opus",
    JSON.stringify(report),
  )
  check("and the words of both, so it reads after the chat is deleted", report?.prompt === "Make the header black" && report?.reply === "Changed the header to black.")

  const second = await reportThemeExchange({ installId: IA, creatorId: CREATOR_A, messageId: M(2), reason: "Actually it was fine", engine: "gpt-9" }, clientsFor(db, [IA]))
  check("reporting the reply of the same exchange is the same report, its reason replaced", second.ok === true && db.tables.theme_chat_reports.length === 1 && db.tables.theme_chat_reports[0].reason === "Actually it was fine")
  check("a model name that is not one of the switch's is not stored", db.tables.theme_chat_reports[0].engine === null)

  const theirs = await reportThemeExchange({ installId: IA, creatorId: CREATOR_A, messageId: M(5) }, clientsFor(db, [IA]))
  check("somebody else's message is not found, and nothing is stored", theirs.ok === false && theirs.status === 404 && db.tables.theme_chat_reports.length === 1)
  const bypass = await reportThemeExchange({ installId: IB, creatorId: CREATOR_A, messageId: M(5) }, clientsFor(db, [IA]))
  check("even with the install check imagined away", bypass.ok === false && bypass.status === 404)

  const long = await reportThemeExchange({ installId: IA, creatorId: CREATOR_A, messageId: M(3), reason: "x".repeat(900) }, clientsFor(db, [IA]))
  check("a question with no reply yet can be reported, and a long reason is cut to 500", long.ok === true && db.tables.theme_chat_reports.some((r) => r.message_id === M(3) && r.reply_message_id === null && String(r.reason).length === 500))

  const early = await reportThemeExchange({ installId: IA, creatorId: CREATOR_A, messageId: M(4) }, clientsFor(db, [IA]))
  check("a message from before conversations can be reported too", early.ok === true && db.tables.theme_chat_reports.some((r) => r.message_id === M(4) && r.conversation_id === null))

  const fresh = world()
  fresh.missing.add("theme_chat_reports")
  const unset = await reportThemeExchange({ installId: IA, creatorId: CREATOR_A, messageId: M(1) }, clientsFor(fresh, [IA]))
  check("before the reports SQL has run: not_set_up, 503, and no crash", unset.ok === false && unset.status === 503 && unset.reason === "not_set_up")
}

// ---------------------------------------------------------------------------
section("The routes")
// ---------------------------------------------------------------------------
{
  const all = read("app/api/website-builder/themes/[installId]/chat/conversations/route.ts")
  const one = read("app/api/website-builder/themes/[installId]/chat/conversations/[conversationId]/route.ts")
  const report = read("app/api/website-builder/themes/[installId]/chat/report/route.ts")
  const lib = read("lib/website-builder/agent/chat.ts")
  const store = read("lib/website-builder/agent/attachment-store.ts")
  const agent = read("app/api/website-builder/themes/[installId]/agent/route.ts")

  const ownedFirst = (source: string, from: string, call: string) => {
    const body = source.slice(source.indexOf(from))
    const own = body.indexOf("await ownThemeInstall(installId)")
    const refuse = body.indexOf("if (!owned.ok)")
    const act = body.indexOf(call)
    return own > 0 && refuse > own && act > refuse
  }
  check("Delete all proves ownership before it deletes", ownedFirst(all, "export async function DELETE", "deleteThemeChat(installId, { kind: \"all\" })"))
  check("Delete one proves ownership before it deletes, and 'earlier' is the only other name", ownedFirst(one, "export async function DELETE", "deleteThemeChat(") && /conversationId === "earlier" \? \{ kind: "earlier" \} : \{ kind: "one", id: conversationId \}/.test(one))
  check("Report proves ownership before it reads the body or writes", ownedFirst(report, "export async function POST", "reportThemeExchange("))
  check("Report takes JSON only, and is rate limited per creator in Postgres", /includes\("application\/json"\)/.test(report) && /bucket: "ask-report"/.test(report) && /creator:\$\{owned\.creatorId\}/.test(report))
  check("nothing in the three routes logs", ![all, one, report].some((s) => /console\./.test(s)))
  check("the deletes read through the user's client before the service role touches a row", /\/\* 1\. WHAT THIS CREATOR CAN SEE, through their own client\. \*\//.test(lib) && /const \{ user, admin \} = clients \?\? \(await realClients\(\)\)/.test(lib))
  check("the pictures bucket is the one the store writes to", store.includes(`const BUCKET = "${CHAT_PICTURES_BUCKET}"`))
  check("the agent route tells the panel which message the question was kept as", /if \(messageId\) send\(\{ type: "recorded", messageId \}\)/.test(agent))
}

// ---------------------------------------------------------------------------
section("The database")
// ---------------------------------------------------------------------------
{
  const migration = read("supabase/migrations/20261003_theme_chat_reports.sql")
  const { readdirSync } = await import("node:fs")
  const partName = readdirSync(join(process.cwd(), "supabase/sql/run-now")).find((f) => /_theme_chat_reports\.sql$/.test(f)) ?? ""
  const part = partName ? read(`supabase/sql/run-now/${partName}`) : ""
  const lines = part.trim().split("\n")
  check("there is a run-now part for it, listed in the README, with a column in 99", !!partName && read("supabase/sql/run-now/README.md").includes(partName) && /_theme_chat_reports;?\s*$/.test(read("supabase/sql/run-now/99_check_after.sql").trim()))
  check("the part is a one line note and then one whole statement per line", /^\/\* .* \*\/$/.test(lines[0]) && lines.slice(1).every((l) => /;\s*$/.test(l)))
  const statements = (sql: string) => sql.split("\n").filter((l) => l.trim() && !l.startsWith("/*"))
  check("the migration holds the same statements", statements(migration).join("\n") === statements(part).join("\n"))
  check("no -- comments", !/^\s*--/m.test(migration) && !/^\s*--/m.test(part))
  check(
    "every statement can run twice",
    statements(part).every((l) => /IF NOT EXISTS|IF EXISTS|ENABLE ROW LEVEL SECURITY|ADD CONSTRAINT .* NOT VALID;$/.test(l)) &&
      /DROP CONSTRAINT IF EXISTS theme_chat_reports_reason_length;\nALTER TABLE public\.theme_chat_reports ADD CONSTRAINT theme_chat_reports_reason_length/.test(part),
  )
  check("row level security is on and no client policy exists: server only", /ENABLE ROW LEVEL SECURITY/.test(part) && !/CREATE POLICY/i.test(part))
  check("one report per question, which the route's upsert names", /CREATE UNIQUE INDEX IF NOT EXISTS theme_chat_reports_message ON public\.theme_chat_reports \(message_id\)/.test(part) && /\{ onConflict: "message_id" \}/.test(read("lib/website-builder/agent/chat.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
