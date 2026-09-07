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

export interface ChatStep {
  name: string
  detail: string
}

export interface StoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
  steps: ChatStep[]
  filesChanged: string[]
  versionId: string | null
  error: string | null
  createdAt: string
}

/** The whole conversation for a site, oldest first. RLS decides visibility. */
export async function readChat(siteId: string): Promise<StoredMessage[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("site_chat_messages")
    .select("id, role, content, steps, files_changed, version_id, error, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: true })
    // A very long conversation is a scrolling problem, not a data problem, but
    // the editor should not have to load a thousand messages to show the last
    // ten. Oldest are dropped, not newest.
    .limit(200)

  type Row = {
    id: string
    role: "user" | "assistant"
    content: string
    steps: ChatStep[] | null
    files_changed: string[] | null
    version_id: string | null
    error: string | null
    created_at: string
  }

  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    steps: Array.isArray(row.steps) ? row.steps : [],
    filesChanged: row.files_changed ?? [],
    versionId: row.version_id,
    error: row.error,
    createdAt: row.created_at,
  }))
}

/**
 * One exchange: what was asked, and what happened.
 *
 * The admin client, because the agent route already proved ownership by
 * reading the site through the user's client, and because a failed run must
 * still be recorded — a conversation that silently drops its failures is one
 * where nobody can see the model kept getting the same thing wrong.
 */
export async function appendExchange(input: {
  siteId: string
  runId: string | null
  prompt: string
  reply: string
  steps: ChatStep[]
  filesChanged: string[]
  versionId: string | null
  error: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const now = Date.now()

  await admin.from("site_chat_messages").insert([
    {
      site_id: input.siteId,
      run_id: input.runId,
      role: "user",
      content: input.prompt,
      created_at: new Date(now).toISOString(),
    },
    {
      site_id: input.siteId,
      run_id: input.runId,
      role: "assistant",
      content: input.reply,
      steps: input.steps,
      files_changed: input.filesChanged,
      version_id: input.versionId,
      error: input.error,
      // A millisecond later, so `order by created_at` can never put the reply
      // before the question it answers.
      created_at: new Date(now + 1).toISOString(),
    },
  ])
}
