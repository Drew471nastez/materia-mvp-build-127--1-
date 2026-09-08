import "server-only"

/**
 * The theme editor's conversation, kept.
 *
 * It lived in React state and died on reload: ask for three changes, refresh,
 * and there was no record of what you had asked for or what it had done. The
 * sections survived — they are the site — but the reasoning behind them did
 * not, which is the question somebody actually has when they come back.
 *
 * WRITTEN SERVER-SIDE, from the agent route, as each exchange happens. Never
 * posted by the client: a client that writes its own transcript can write a
 * transcript that never happened, and this is the record somebody consults
 * when they want to know why their page looks like it does.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

import type { ThemeOp } from "./operations"

export interface ThemeMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /** The changes this exchange made, so the transcript shows them. */
  ops: ThemeOp[]
  error: string | null
  createdAt: string
}

/** Thrown when the transcript could not be read, as opposed to being empty. */
export class ThemeChatUnavailableError extends Error {}

/**
 * The conversation for one theme, oldest first. RLS decides visibility.
 *
 * Read through the USER's client rather than the admin one, so a creator can
 * only ever see their own — the policy is the check, and there is no second
 * authorisation path here to disagree with it.
 */
export async function readThemeChat(installId: string): Promise<ThemeMessage[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("theme_chat_messages")
    .select("id, role, content, ops, error, created_at")
    .eq("install_id", installId)
    /**
     * NEWEST first, then reversed below. Ascending with a limit keeps the
     * OLDEST hundred and silently drops everything recent — reopen a busy
     * theme and you would see your first conversations and never the one from
     * five minutes ago.
     */
    .order("created_at", { ascending: false })
    .limit(100)

  /**
   * A FAILED READ IS NOT AN EMPTY CONVERSATION. Swallowing the error would
   * show somebody a blank panel and let them believe their history was gone.
   */
  if (error) throw new ThemeChatUnavailableError(error.message)

  type Row = {
    id: string
    role: "user" | "assistant"
    content: string
    ops: ThemeOp[] | null
    error: string | null
    created_at: string
  }

  return ((data as Row[] | null) ?? []).reverse().map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    ops: Array.isArray(row.ops) ? row.ops : [],
    error: row.error,
    createdAt: row.created_at,
  }))
}

/**
 * The question, recorded BEFORE anything is attempted.
 *
 * So a run that dies — a crash, a timeout, a closed tab — still leaves the
 * request in the transcript. A transcript that only records what succeeded is
 * one where nobody can see the model was asked the same thing three times.
 */
export async function startThemeExchange(input: {
  installId: string
  pageKey: string
  prompt: string
}): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("theme_chat_messages")
      .insert({
        install_id: input.installId,
        page_key: input.pageKey,
        role: "user",
        content: input.prompt,
      })
      .select("id")
      .single()
    return (data as { id: string } | null)?.id ?? null
  } catch {
    /**
     * The transcript is evidence, not enforcement. Failing to record a
     * question must never be the reason somebody cannot make a change.
     */
    return null
  }
}

/** The reply and what it changed, recorded when the run is over. */
export async function completeThemeExchange(input: {
  installId: string
  pageKey: string
  reply: string
  ops: ThemeOp[]
  error: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("theme_chat_messages").insert({
      install_id: input.installId,
      page_key: input.pageKey,
      role: "assistant",
      content: input.reply,
      ops: input.ops,
      error: input.error,
    })
  } catch {
    // Same reason: the edit already happened and is on the creator's screen.
  }
}
