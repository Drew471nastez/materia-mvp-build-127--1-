/**
 * ===========================================================================
 *  WHAT WAS JUST SAID, FOR A MESSAGE THAT IS ABOUT IT
 * ===========================================================================
 * "I meant the animation", "only the spacing", "Film Presets Vol. 1": the
 * second message in a conversation is usually about the first, and the
 * assistant's rules say so (lib/storelib-ai/intent.ts, FOLLOW_UP_RULES). But
 * each request used to reach the model on its own, so "what you just did" was
 * something it was told to consider and never shown. A tapped answer to its
 * own question arrived as three words with nothing to answer.
 *
 * So the last few exchanges of THIS conversation go in the turn, short:
 * what was asked, what it said back, and what it changed. Not the whole
 * history (the page is the state, and it is shown in full), and not every
 * word (a long reply is cut): a few hundred tokens that make a follow-up
 * mean what the creator meant.
 *
 * Read through the creator's own client, so row-level security decides which
 * conversation can be read, the same as the history panel. Never throws:
 * without it the run is the run it always was.
 */

export interface RecentMessage {
  role: "user" | "assistant"
  content: string
  /** For an assistant message, what it changed, as the transcript labels it. */
  changed?: string[]
}

/**
 * Messages kept, oldest first. Twelve is six exchanges: enough for "do what I said earlier", for a long task carried on
 * in parts (theme-chat CONTINUE_PROMPT) to see its own plan, and for a correction three messages back to still hold.
 * Each is cut to MAX_CHARS, so the block stays under about 3,500 tokens however long the conversation is.
 */
export const MEMORY_MESSAGES = 12
const MAX_CHARS = 1200

type Db = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: unknown[] | null; error?: unknown }> }
        }
      }
    }
  }
}

function clip(text: string): string {
  const t = text.replace(/\s+\n/g, "\n").trim()
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS - 1).trimEnd()}…` : t
}

/** What each operation did, in the words the chat shows. Only the kind, not the values. */
function changedBy(ops: unknown): string[] {
  if (!Array.isArray(ops)) return []
  const kinds = ops
    .map((op) => (op && typeof op === "object" ? String((op as { kind?: unknown }).kind ?? "") : ""))
    .filter(Boolean)
  const counts = new Map<string, number>()
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1)
  return [...counts].map(([k, n]) => `${k.replace(/_/g, " ")}${n > 1 ? ` x${n}` : ""}`)
}

/**
 * The last messages of one conversation on one install, oldest first. Called
 * before the new request is recorded, so it is never among them.
 */
export async function recentMessages(db: Db, installId: string, conversationId: string | null): Promise<RecentMessage[]> {
  if (!conversationId) return []
  try {
    const { data, error } = await db
      .from("theme_chat_messages")
      .select("role, content, ops")
      .eq("install_id", installId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MEMORY_MESSAGES)
    if (error || !data) return []
    return (data as { role: string; content: string | null; ops?: unknown }[])
      .reverse()
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: clip(m.content as string),
        ...(m.role === "assistant" ? { changed: changedBy(m.ops) } : {}),
      }))
  } catch {
    return []
  }
}

/** The block the turn carries, or "" when there is nothing before this message. */
export function describeRecent(messages: RecentMessage[]): string {
  if (messages.length === 0) return ""
  const lines = messages.map((m) =>
    m.role === "user"
      ? `CREATOR: ${m.content}`
      : `YOU: ${m.content}${m.changed?.length ? `\n  (changed: ${m.changed.join(", ")})` : ""}`,
  )
  return [
    "EARLIER IN THIS CONVERSATION, oldest first. The request below may be a follow-up to it or an answer to your question; the page as it is now is above.",
    ...lines,
  ].join("\n")
}

/** The last thing the assistant asked, when its last message was a question. */
export function lastQuestion(messages: RecentMessage[]): string | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "assistant") return null
  const first = last.content.split("\n")[0]
  return /\?\s*$/.test(first) ? first : null
}
