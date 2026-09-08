import "server-only"

/**
 * The conversation, kept.
 *
 * It used to live in React state and die on reload: reopen a site the next day
 * and the chat was empty, with no record of what you had asked for or what it
 * had done. `site_agent_runs` knows what a run COST; this knows what was SAID,
 * which is the question somebody actually has when they come back.
 *
 * Written server-side, from the agent route, as each exchange completes — not
 * posted by the client. A client that writes its own transcript can write a
 * transcript that never happened.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { AgentQuestion } from "./agent/questions"

export interface ChatStep {
  name: string
  detail: string
}

export interface StoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
  steps: ChatStep[]
  /** What the agent asked the creator during this run. Usually empty. */
  questions: AgentQuestion[]
  filesChanged: string[]
  versionId: string | null
  error: string | null
  createdAt: string
}

/** Thrown when the transcript could not be read, as opposed to being empty. */
export class ChatUnavailableError extends Error {}

/** The whole conversation for a site, oldest first. RLS decides visibility. */
export async function readChat(siteId: string): Promise<StoredMessage[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("site_chat_messages")
    .select("id, role, content, steps, questions, files_changed, version_id, error, created_at")
    .eq("site_id", siteId)
    /**
     * NEWEST first, then reversed below.
     *
     * This was `ascending: true` with a limit, which keeps the OLDEST 200 and
     * silently drops everything recent — reopen a busy site and you would see
     * your first few conversations and never the one you had five minutes ago.
     * The comment even claimed the opposite, which is how it survived review.
     */
    .order("created_at", { ascending: false })
    .limit(200)

  type Row = {
    id: string
    role: "user" | "assistant"
    content: string
    steps: ChatStep[] | null
    questions: AgentQuestion[] | null
    files_changed: string[] | null
    version_id: string | null
    error: string | null
    created_at: string
  }

  /**
   * A FAILED READ IS NOT AN EMPTY CONVERSATION.
   *
   * `const { data } = ...` with `?? []` made a broken query indistinguishable
   * from a site nobody has talked to — the transcript would be sitting in the
   * table, unreadable, while the editor showed a blank pane and the creator
   * concluded their history had been thrown away. Throwing sends it to the
   * route, which answers with a status instead of a lie.
   */
  if (error) {
    console.error("[readChat] query failed:", error.message)
    throw new ChatUnavailableError(error.message)
  }

  // Back into reading order: the query asked for the newest, the transcript
  // is read oldest-first.
  return ((data as Row[] | null) ?? []).reverse().map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    steps: Array.isArray(row.steps) ? row.steps : [],
    /**
     * Read from JSONB that predates the column, so a row written before this
     * existed comes back null rather than absent. Defaulted here rather than
     * relying on the column default, which only applies to new rows.
     */
    questions: Array.isArray(row.questions) ? row.questions : [],
    filesChanged: row.files_changed ?? [],
    versionId: row.version_id,
    error: row.error,
    createdAt: row.created_at,
  }))
}

/**
 * The question, recorded before anything is attempted.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS IS SEPARATE FROM THE ANSWER
 * ---------------------------------------------------------------------------
 * Both rows used to be written together, once, at the very END of a run. For
 * the thirty to ninety seconds a run takes, the creator's prompt existed only
 * in React state — and it was lost outright on every path that never reached
 * that final write. There were seven: the monthly quota being spent, a project
 * with no files, the run row failing to open, the loop throwing, the process
 * being replaced mid-run by a deploy, a refresh during the run, and the
 * one-run-per-site guard refusing a second send.
 *
 * On all of them the creator watched their sentence vanish, which is why the
 * chat felt like it was not saving anything: it genuinely was not, until the
 * very last moment, and only if nothing went wrong.
 *
 * The prompt is now durable the instant it is accepted. Whatever happens next
 * — including nothing at all — it is still there on reload.
 */
export async function startExchange(input: {
  siteId: string
  prompt: string
}): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("site_chat_messages")
    .insert({ site_id: input.siteId, role: "user", content: input.prompt })
    .select("id")
    .maybeSingle()

  if (error) {
    // Not fatal. Losing the transcript is bad; refusing to do the work the
    // creator asked for because we could not write a log line is worse.
    console.error("[startExchange] could not record the prompt:", error.message)
    return null
  }
  return (data as { id: string } | null)?.id ?? null
}

/**
 * What happened, recorded against the question that was already saved.
 *
 * Written on EVERY path out, including failures. A conversation that silently
 * drops its failed exchanges is one where nobody can see the model got the
 * same thing wrong three times.
 *
 * The admin client, because the agent route already proved ownership by
 * reading the site through the user's client.
 */
export async function completeExchange(input: {
  siteId: string
  userMessageId: string | null
  runId: string | null
  reply: string
  steps: ChatStep[]
  questions: AgentQuestion[]
  filesChanged: string[]
  versionId: string | null
  error: string | null
}): Promise<void> {
  const admin = createAdminClient()

  await admin.from("site_chat_messages").insert({
    site_id: input.siteId,
    run_id: input.runId,
    role: "assistant",
    content: input.reply,
    steps: input.steps,
    questions: input.questions,
    files_changed: input.filesChanged,
    version_id: input.versionId,
    error: input.error,
  })

  /**
   * The question was saved before the run existed, so it has no run_id yet.
   * Backfilling keeps the pair addressable as one exchange — and a failure
   * here costs a foreign key, not the transcript.
   */
  if (input.userMessageId && input.runId) {
    await admin
      .from("site_chat_messages")
      .update({ run_id: input.runId })
      .eq("id", input.userMessageId)
  }
}
