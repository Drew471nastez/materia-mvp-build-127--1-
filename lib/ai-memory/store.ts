/**
 * ===========================================================================
 *  WHAT A CREATOR ASKED STORELIB AI TO REMEMBER
 * ===========================================================================
 * Two kinds of memory, kept apart on purpose:
 *
 *   Everywhere    "I sell in euros", "never use gradients", "my brand is
 *                 Lumen": true of the creator, so every website and every
 *                 conversation sees it. A row of `ai_memories` with no
 *                 install_id (supabase/sql/run-now/106_ai_memory.sql).
 *   One website   "the events part is the main thing": true of one site.
 *                 Kept in that website's own notes (the brief,
 *                 lib/website-builder/agent/project-state.ts), so it travels
 *                 with the theme and its Save, as it always has.
 *
 * Everything here goes through the creator's own Supabase client, so row
 * level security decides: a person reads, adds and deletes only their own,
 * and nobody edits one in place. Nothing throws. Until part 106 has run, the
 * reads are empty and a write says the memory is not set up, and Storelib AI
 * keeps working on each website's own notes.
 */

export const MEMORY_MAX_CHARS = 500
/** What one turn is shown. A long list is the newest first, cut here, so it never crowds out the page. */
export const MEMORY_IN_TURN = 30

export interface AiMemory {
  id: string
  content: string
  installId: string | null
  source: "creator" | "assistant"
  createdAt: string
}

type Row = { id: string; content: string; install_id: string | null; source: string; created_at: string }

/* Only the shape used here, so a test can pass a small fake. */
type Q = PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> & {
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

/** The table is not there yet (part 106 not run), in either way PostgREST says it. */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === "42P01" || err.code === "PGRST205" || (/ai_memories/.test(err.message ?? "") && /does not exist|schema cache/.test(err.message ?? ""))
}

/** One memory as it is kept: one line, no runs of spaces, at most MEMORY_MAX_CHARS. */
export function cleanMemory(text: unknown): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MEMORY_MAX_CHARS)
}

function toMemory(r: Row): AiMemory {
  return { id: r.id, content: r.content, installId: r.install_id, source: r.source === "assistant" ? "assistant" : "creator", createdAt: r.created_at }
}

/** The creator's memories that apply everywhere, newest first. */
export async function listMemories(db: MemoryDb, creatorId: string, limit = 200): Promise<{ memories: AiMemory[]; ready: boolean }> {
  try {
    const { data, error } = await db
      .from("ai_memories")
      .select("id, content, install_id, source, created_at")
      .eq("creator_id", creatorId)
      .is("install_id", null)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) return { memories: [], ready: !isMissingTable(error) }
    return { memories: ((data as Row[] | null) ?? []).map(toMemory), ready: true }
  } catch {
    return { memories: [], ready: false }
  }
}

export type AddResult = { ok: true; memory: AiMemory; duplicate?: boolean } | { ok: false; error: string; notReady?: boolean }

/** Keep one more. The same sentence twice is kept once. */
export async function addMemory(db: MemoryDb, creatorId: string, text: unknown, source: "creator" | "assistant" = "creator"): Promise<AddResult> {
  const content = cleanMemory(text)
  if (!content) return { ok: false, error: "Write what Storelib AI should remember." }
  const { memories, ready } = await listMemories(db, creatorId)
  if (!ready) return { ok: false, error: "AI Memory is not set up on this Storelib yet.", notReady: true }
  const same = memories.find((m) => sameMemory(m.content, content))
  if (same) return { ok: true, memory: same, duplicate: true }
  try {
    const { data, error } = await db
      .from("ai_memories")
      .insert({ creator_id: creatorId, install_id: null, content, source })
      .select("id, content, install_id, source, created_at")
      .single()
    if (error || !data) return isMissingTable(error) ? { ok: false, error: "AI Memory is not set up on this Storelib yet.", notReady: true } : { ok: false, error: "That could not be kept. Try again." }
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
 * after: a failure half way leaves both, never neither.
 */
export async function replaceMemory(db: MemoryDb, creatorId: string, id: string, text: unknown): Promise<AddResult> {
  const content = cleanMemory(text)
  if (!content) return { ok: false, error: "Write what Storelib AI should remember." }
  const { memories, ready } = await listMemories(db, creatorId)
  if (!ready) return { ok: false, error: "AI Memory is not set up on this Storelib yet.", notReady: true }
  const old = memories.find((m) => m.id === id)
  if (!old) return { ok: false, error: "That memory is gone. Refresh and try again." }
  if (old.content === content) return { ok: true, memory: old }
  const other = memories.find((m) => m.id !== id && sameMemory(m.content, content))
  if (other) {
    await deleteMemory(db, creatorId, id)
    return { ok: true, memory: other, duplicate: true }
  }
  try {
    const { data, error } = await db
      .from("ai_memories")
      .insert({ creator_id: creatorId, install_id: null, content, source: "creator" })
      .select("id, content, install_id, source, created_at")
      .single()
    if (error || !data) return { ok: false, error: "That could not be kept. Try again." }
    await deleteMemory(db, creatorId, id)
    return { ok: true, memory: toMemory(data as Row) }
  } catch {
    return { ok: false, error: "That could not be kept. Try again." }
  }
}

/** Forget one. Row level security makes another creator's id a no-op. */
export async function deleteMemory(db: MemoryDb, creatorId: string, id: string): Promise<boolean> {
  try {
    const { error } = await db.from("ai_memories").delete().eq("id", id).eq("creator_id", creatorId)
    return !error
  } catch {
    return false
  }
}

/** The block a turn is shown, or "" when there is nothing to show. */
export function describeAccountMemory(memories: string[]): string {
  const list = memories.map(cleanMemory).filter(Boolean).slice(0, MEMORY_IN_TURN)
  if (list.length === 0) return ""
  return [
    "WHAT THIS CREATOR ASKED YOU TO REMEMBER, ON EVERY WEBSITE OF THEIRS. Follow these unless this message says otherwise; the message wins.",
    ...list.map((m) => `- ${m}`),
  ].join("\n")
}
