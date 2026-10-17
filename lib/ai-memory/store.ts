/**
 * ===========================================================================
 *  WHAT STORELIB AI REMEMBERS FOR A CREATOR
 * ===========================================================================
 * Short notes kept between conversations: the brand voice, design decisions,
 * what the creator said they like and dislike, facts about the business,
 * standing preferences ("never use gradients"). Two scopes, one table
 * (`ai_memories`, run-now parts 106 and 215):
 *
 *   Everywhere    true of the creator, so every website and every
 *                 conversation sees it: install_id empty.
 *   One website   true of one site: install_id is that website.
 *
 * Each note says who kept it (the creator, Storelib AI, or an agent connected
 * from outside, by its name), what kind of note it is, and when. Notes are
 * written only from what the creator said or confirmed: Storelib AI and
 * connected agents keep one through a `remember` tool whose description says
 * so, and the creator sees each one in the chat ("Remembered: ...", with
 * Undo) and in Website settings, where they can change or delete it.
 *
 * NEVER A SECRET. A note that reads like a key, a password or a card number
 * is refused (`looksSecret`), whoever sends it.
 *
 * SIZE. A note is one line of at most MEMORY_MAX_CHARS; a scope holds at
 * most MEMORY_MAX_ITEMS; what a turn is shown is cut at MEMORY_TURN_CHARS,
 * newest first, so it never crowds out the page.
 *
 * From the builder everything goes through the creator's own Supabase client,
 * so row level security decides. The MCP connection has no user session and
 * passes the service role scoped by hand to its token's creator and website
 * (lib/agent-access/bind.ts); every query here names the creator, and a
 * website's notes are read and deleted only with that website's id.
 *
 * Nothing throws. Until part 106 has run the reads are empty and a write says
 * memory is not set up; until part 215 has run, a note keeps its words and
 * scope without its kind or the connected agent's name.
 */

export const MEMORY_MAX_CHARS = 500
/** What one turn is shown, at most, by count. A long list is the newest first. */
export const MEMORY_IN_TURN = 30
/** And by size: about 600 tokens for every note a turn carries. */
export const MEMORY_TURN_CHARS = 2_400
/** Notes in one scope (everywhere, or one website). */
export const MEMORY_MAX_ITEMS = 200
/** A note an agent keeps is one sentence. */
export const MEMORY_AGENT_MAX_CHARS = 240

export type MemorySource = "creator" | "assistant" | "agent"
export const MEMORY_KINDS = ["voice", "design", "like", "dislike", "fact", "preference"] as const
export type MemoryKind = (typeof MEMORY_KINDS)[number]

export interface AiMemory {
  id: string
  content: string
  installId: string | null
  source: MemorySource
  /** The connected agent's name ("Claude Code"), for a note an outside agent kept. */
  sourceName: string | null
  kind: MemoryKind | null
  createdAt: string
}

type Row = { id: string; content: string; install_id: string | null; source: string; source_name?: string | null; kind?: string | null; created_at: string }
type DbError = { code?: string; message?: string } | null

/* Only the shape used here, so a test can pass a small fake. */
type Q = PromiseLike<{ data: unknown; error: DbError }> & {
  eq: (c: string, v: string) => Q
  is: (c: string, v: null) => Q
  order: (c: string, o: { ascending: boolean }) => Q
  limit: (n: number) => Q
  select: (c: string) => Q
  single: () => Q
}
export type MemoryDb = {
  from: (table: string) => {
    select: (cols: string) => Q
    insert: (row: Record<string, unknown>) => Q
    delete: () => Q
  }
}

const FULL = "id, content, install_id, source, source_name, kind, created_at"
const BASE = "id, content, install_id, source, created_at"
const NOT_READY = "AI Memory is not set up on this Storelib yet."

/** The table is not there yet (part 106 not run), in either way PostgREST says it. */
export function isMissingTable(err: DbError | undefined): boolean {
  if (!err) return false
  return err.code === "42P01" || err.code === "PGRST205" || (/ai_memories/.test(err.message ?? "") && /does not exist|schema cache/.test(err.message ?? ""))
}

/** A column part 215 adds is not there yet. */
export function isMissingColumn(err: DbError | undefined): boolean {
  if (!err) return false
  return err.code === "42703" || err.code === "PGRST204" || /(source_name|kind)/.test(err.message ?? "") && /column|schema cache/.test(err.message ?? "")
}

/** One memory as it is kept: one line, no runs of spaces, at most MEMORY_MAX_CHARS. */
export function cleanMemory(text: unknown, max = MEMORY_MAX_CHARS): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

/**
 * A key, a token, a password or a card number. Memory is read into every
 * model's context, so none of those may be kept, whoever asks.
 */
export function looksSecret(text: string): boolean {
  return (
    /\b(?:sk-(?:ant-|proj-|live_|test_)?[A-Za-z0-9_-]{16,}|rk_(?:live|test)_[A-Za-z0-9]{12,}|pk_(?:live|test)_[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|re_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{16,})/.test(text) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) ||
    /\b(?:password|passcode|passwd|pwd|api[ _-]?key|secret|token|private key|access key)\b\s*(?:is|:|=)\s*\S{4,}/i.test(text) ||
    /\b(?:\d[ -]?){13,19}\b/.test(text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")) ||
    /\b[A-Fa-f0-9]{40,}\b/.test(text) ||
    /\b[A-Za-z0-9+/_-]{48,}={0,2}(?=\s|$)/.test(text)
  )
}

/** What kind of note it is, read from its words. Cheap and only a label: nothing depends on it being right. */
export function kindOf(text: string): MemoryKind {
  const t = text.toLowerCase()
  if (/\b(voice|tone|wording|write like|sound(?:s)? like|formal|casual|friendly|playful|we say|address (?:people|customers))\b/.test(t)) return "voice"
  if (/\b(never|don'?t|do not|no more|avoid|hate|dislike|not a fan|stop using|without)\b/.test(t) || /^no\s/.test(t)) return "dislike"
  if (/\b(always|prefer|should|must|keep|only use|use)\b/.test(t)) return "preference"
  if (/\b(love|like|likes|liked|enjoy|happy with|favourite|favorite)\b/.test(t)) return "like"
  if (/\b(colou?rs?|palette|font|fonts|typeface|layout|spacing|rounded|corners|gradient|shadow|dark|light|minimal|style|look|logo|button|photo|image)\b/.test(t)) return "design"
  return "fact"
}

function asKind(value: unknown): MemoryKind | null {
  return (MEMORY_KINDS as readonly string[]).includes(String(value)) ? (value as MemoryKind) : null
}

function toMemory(r: Row): AiMemory {
  const source: MemorySource = r.source === "assistant" ? "assistant" : r.source === "agent" ? "agent" : "creator"
  return {
    id: r.id,
    content: r.content,
    installId: r.install_id,
    source,
    sourceName: typeof r.source_name === "string" && r.source_name ? r.source_name : null,
    kind: asKind(r.kind),
    createdAt: r.created_at,
  }
}

/** Where a list or a write applies: one website, or null for every website of theirs. */
export interface MemoryScope {
  installId?: string | null
}

function scoped(q: Q, installId: string | null | undefined): Q {
  return installId ? q.eq("install_id", installId) : q.is("install_id", null)
}

/** One scope's memories, newest first. */
export async function listMemories(db: MemoryDb, creatorId: string, limit = MEMORY_MAX_ITEMS, scope: MemoryScope = {}): Promise<{ memories: AiMemory[]; ready: boolean }> {
  const read = (cols: string) =>
    scoped(db.from("ai_memories").select(cols).eq("creator_id", creatorId), scope.installId)
      .order("created_at", { ascending: false })
      .limit(limit)
  try {
    let { data, error } = await read(FULL)
    if (error && isMissingColumn(error)) ({ data, error } = await read(BASE))
    if (error) return { memories: [], ready: !isMissingTable(error) }
    return { memories: ((data as Row[] | null) ?? []).map(toMemory), ready: true }
  } catch {
    return { memories: [], ready: false }
  }
}

/** Both scopes a website's run is shown: its own notes and the creator's everywhere ones. */
export async function memoriesForSite(db: MemoryDb, creatorId: string, installId: string): Promise<{ site: AiMemory[]; account: AiMemory[]; ready: boolean }> {
  const [site, account] = await Promise.all([
    listMemories(db, creatorId, MEMORY_IN_TURN, { installId }),
    listMemories(db, creatorId, MEMORY_IN_TURN, { installId: null }),
  ])
  return { site: site.memories, account: account.memories, ready: site.ready && account.ready }
}

export type AddResult = { ok: true; memory: AiMemory; duplicate?: boolean } | { ok: false; error: string; notReady?: boolean }

export interface AddOptions extends MemoryScope {
  kind?: MemoryKind | null
  /** The connected agent's name, for source "agent". */
  sourceName?: string | null
}

/** Keep one more. The same sentence twice in one scope is kept once. */
export async function addMemory(db: MemoryDb, creatorId: string, text: unknown, source: MemorySource = "creator", opts: AddOptions = {}): Promise<AddResult> {
  const content = cleanMemory(text, source === "creator" ? MEMORY_MAX_CHARS : MEMORY_AGENT_MAX_CHARS)
  if (!content) return { ok: false, error: "Write what Storelib AI should remember." }
  if (looksSecret(content)) return { ok: false, error: "That looks like a password, key or card number. AI Memory does not keep those." }
  const installId = opts.installId ?? null
  const { memories, ready } = await listMemories(db, creatorId, MEMORY_MAX_ITEMS, { installId })
  if (!ready) return { ok: false, error: NOT_READY, notReady: true }
  const same = memories.find((m) => sameMemory(m.content, content))
  if (same) return { ok: true, memory: same, duplicate: true }
  if (memories.length >= MEMORY_MAX_ITEMS) return { ok: false, error: "AI Memory is full here. Delete a note you no longer need first." }
  return insert(db, { creator_id: creatorId, install_id: installId, content, source, kind: opts.kind ?? kindOf(content), source_name: source === "agent" ? cleanMemory(opts.sourceName, 80) || null : null })
}

/**
 * Written with every column, then, before part 215 has run, without its two
 * new ones: a note from a connected agent is kept as Storelib AI's rather than
 * lost, since part 106 allows only the creator and the assistant.
 */
async function insert(db: MemoryDb, row: Record<string, unknown>): Promise<AddResult> {
  const write = (r: Record<string, unknown>, cols: string) => db.from("ai_memories").insert(r).select(cols).single()
  try {
    let { data, error } = await write(row, FULL)
    if (error && (isMissingColumn(error) || error.code === "23514")) {
      const { kind: _kind, source_name: _name, ...base } = row
      void _kind
      void _name
      ;({ data, error } = await write({ ...base, source: base.source === "agent" ? "assistant" : base.source }, BASE))
    }
    if (error || !data) return isMissingTable(error) ? { ok: false, error: NOT_READY, notReady: true } : { ok: false, error: "That could not be kept. Try again." }
    return { ok: true, memory: toMemory(data as Row) }
  } catch {
    return { ok: false, error: "That could not be kept. Try again." }
  }
}

/**
 * The same note written twice is one note: case, punctuation and spacing do
 * not make a second one ("No gradients." and "no gradients").
 */
export function sameMemory(a: string, b: string): boolean {
  const key = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  return key(a) === key(b)
}

/**
 * Correct one. Rows are never changed in place (row level security has no
 * update), so the corrected note is kept first and the old one forgotten
 * after: a failure half way leaves both, never neither. The corrected note
 * is the creator's, in the same scope as the one it replaces.
 */
export async function replaceMemory(db: MemoryDb, creatorId: string, id: string, text: unknown, scope: MemoryScope = {}): Promise<AddResult> {
  const content = cleanMemory(text)
  if (!content) return { ok: false, error: "Write what Storelib AI should remember." }
  if (looksSecret(content)) return { ok: false, error: "That looks like a password, key or card number. AI Memory does not keep those." }
  const installId = scope.installId ?? null
  const { memories, ready } = await listMemories(db, creatorId, MEMORY_MAX_ITEMS, { installId })
  if (!ready) return { ok: false, error: NOT_READY, notReady: true }
  const old = memories.find((m) => m.id === id)
  if (!old) return { ok: false, error: "That memory is gone. Refresh and try again." }
  if (old.content === content) return { ok: true, memory: old }
  const other = memories.find((m) => m.id !== id && sameMemory(m.content, content))
  if (other) {
    await deleteMemory(db, creatorId, id, { installId })
    return { ok: true, memory: other, duplicate: true }
  }
  const kept = await insert(db, { creator_id: creatorId, install_id: installId, content, source: "creator", kind: kindOf(content), source_name: null })
  if (kept.ok === false) return kept
  await deleteMemory(db, creatorId, id, { installId })
  return kept
}

/**
 * Forget one. Always by the creator, so another creator's id does nothing;
 * with a scope, only a note of that scope (how a connected agent, bound to
 * one website, is kept to that website's notes).
 */
export async function deleteMemory(db: MemoryDb, creatorId: string, id: string, scope?: MemoryScope): Promise<boolean> {
  try {
    let q = db.from("ai_memories").delete().eq("id", id).eq("creator_id", creatorId)
    if (scope) q = scoped(q, scope.installId)
    const { error } = await q
    return !error
  } catch {
    return false
  }
}

/** The short id a turn shows beside a note, which the forget tool names. */
export function shortId(id: string): string {
  return id.replace(/[^0-9a-f]/gi, "").slice(0, 8).toLowerCase()
}

/** The note a short id names, among those the turn was shown. */
export function byShortId(memories: AiMemory[], short: unknown): AiMemory | null {
  const want = String(short ?? "").replace(/[^0-9a-f]/gi, "").toLowerCase()
  if (want.length < 6) return null
  /* Two notes behind one short id is no answer: neither is forgotten on a guess. */
  const found = memories.filter((m) => shortId(m.id) === want.slice(0, 8))
  return found.length === 1 ? found[0] : null
}

const KIND_WORD: Record<MemoryKind, string> = { voice: "voice", design: "design", like: "likes", dislike: "dislikes", fact: "fact", preference: "preference" }

/**
 * THE BLOCK EVERY AGENT IS SHOWN: Storelib AI's page assistant and section
 * writer, and an agent connected over MCP. This website's notes first, then
 * the creator's everywhere ones, newest first in each, cut at `maxChars`.
 * With `ids`, each note carries the short id the forget tool takes.
 */
export function describeMemory(memory: { site?: AiMemory[]; account?: AiMemory[] }, opts: { maxChars?: number; ids?: boolean } = {}): string {
  const max = opts.maxChars ?? MEMORY_TURN_CHARS
  const head = "AI MEMORY: what this creator told you or confirmed before. Follow it unless this message says otherwise; the message wins."
  const lines: string[] = [head]
  let size = head.length
  let shown = 0
  const add = (title: string, list: AiMemory[] | undefined) => {
    const notes = (list ?? []).filter((m) => cleanMemory(m.content)).slice(0, MEMORY_IN_TURN)
    if (!notes.length) return
    let titled = false
    for (const m of notes) {
      const line = `- ${opts.ids ? `[${shortId(m.id)}] ` : ""}${m.kind ? `(${KIND_WORD[m.kind]}) ` : ""}${cleanMemory(m.content)}`
      const cost = line.length + 1 + (titled ? 0 : title.length + 1)
      if (size + cost > max) return
      if (!titled) {
        lines.push(title)
        titled = true
      }
      lines.push(line)
      size += cost
      shown++
    }
  }
  add("On this website:", memory.site)
  add("On every website of theirs:", memory.account)
  return shown ? lines.join("\n") : ""
}

/** The everywhere notes alone, as words: what the section writer and older callers are shown. */
export function describeAccountMemory(memories: string[]): string {
  const now = new Date(0).toISOString()
  const list = memories.map((content, i) => ({ id: String(i), content, installId: null, source: "creator" as const, sourceName: null, kind: null, createdAt: now }))
  const block = describeMemory({ account: list })
  if (!block) return ""
  return block.replace(/^AI MEMORY: [^\n]*/, "WHAT THIS CREATOR ASKED YOU TO REMEMBER, ON EVERY WEBSITE OF THEIRS. Follow these unless this message says otherwise; the message wins.").replace("\nOn every website of theirs:", "")
}
