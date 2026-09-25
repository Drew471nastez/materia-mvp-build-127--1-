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
import { attachmentsFor } from "./attachment-store"
import { createClient } from "@/lib/supabase/server"

import type { ThemeOp } from "./operations"

export interface ThemeMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /**
   * What was attached to this message, as signed URLs good for the hour.
   * Empty once the pictures have passed their thirty days and been
   * collected — the words stay, which is the trade the expiry buys.
   */
  images: { id: string; name: string; mediaType: string; url: string }[]
  /** The changes this exchange made, so the transcript shows them. */
  ops: ThemeOp[]
  error: string | null
  createdAt: string
}

/** Thrown when the transcript could not be read, as opposed to being empty. */
export class ThemeChatUnavailableError extends Error {
  /**
   * TRUE WHEN THE TABLE IS NOT THERE YET.
   *
   * "We could not load this conversation" is the right thing to say about a
   * read that failed and the wrong thing to say about a feature whose
   * migration has not been run — one is a fault to report and the other is a
   * step somebody has to take, and the panel cannot tell them apart from a
   * 503. Postgres says 42P01 for a missing relation; PostgREST reports the
   * same thing as PGRST205 when its schema cache has never seen the table.
   */
  readonly notSetUp: boolean

  constructor(message: string, notSetUp = false) {
    super(message)
    this.notSetUp = notSetUp
  }
}

/** A missing table, however the layer in front of Postgres chose to say it. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code ?? ""
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202") return true
  const message = (error?.message ?? "").toLowerCase()
  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  )
}

/**
 * WHICH MESSAGES A READ IS FOR.
 *
 * `one` is a conversation by id. `earlier` is every message written before
 * conversations were kept apart (their conversation_id is null), shown in the
 * history as one thread of its own. `all` ignores conversations, which is
 * what a database without the conversations table can answer.
 */
export type ConversationScope = { kind: "all" } | { kind: "earlier" } | { kind: "one"; id: string }

/** One conversation in the history list. */
export interface ThemeConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/** The messages from before conversations existed, when there are any. */
export interface EarlierMessages {
  /** The last question asked in them, as the line the history shows. */
  preview: string
  updatedAt: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for a string shaped like a row id, before it reaches a query. */
export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

/**
 * THE SIGNED IN CREATOR OWNS THIS WEBSITE, proved against their own client.
 *
 * RLS already hides another creator's rows, so a read without this would
 * come back empty rather than leak. This says so out loud instead: 401 for
 * nobody signed in, 404 for a website that is not theirs, before any
 * conversation is looked at.
 */
export async function ownThemeInstall(
  installId: string,
): Promise<{ ok: true; creatorId: string } | { ok: false; status: 401 | 404 }> {
  if (!isConversationId(installId)) return { ok: false, status: 404 }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return { ok: false, status: 404 }
  const creatorId = (creator as { id: string }).id
  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", creatorId)
    .maybeSingle()
  if (!install) return { ok: false, status: 404 }
  return { ok: true, creatorId }
}

/**
 * EVERY CONVERSATION ON ONE WEBSITE, newest first, through the user's client.
 *
 * The policy on theme_chat_conversations is the same ownership chain every
 * theme table uses, so another creator's conversations are not in the answer
 * whatever id is asked for. Throws ThemeChatUnavailableError with `notSetUp`
 * when the table or the column is not there yet.
 */
export async function listThemeConversations(
  installId: string,
): Promise<{ conversations: ThemeConversation[]; earlier: EarlierMessages | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("theme_chat_conversations")
    .select("id, title, created_at, updated_at")
    .eq("install_id", installId)
    .order("updated_at", { ascending: false })
    .limit(60)
  if (error) throw new ThemeChatUnavailableError(error.message, isMissingTable(error))

  const { data: early, error: earlyError } = await supabase
    .from("theme_chat_messages")
    .select("content, created_at")
    .eq("install_id", installId)
    .is("conversation_id", null)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
  if (earlyError) throw new ThemeChatUnavailableError(earlyError.message, isMissingTable(earlyError))

  type Row = { id: string; title: string | null; created_at: string; updated_at: string }
  const last = ((early as { content: string; created_at: string }[] | null) ?? [])[0]
  return {
    conversations: ((data as Row[] | null) ?? []).map((row) => ({
      id: row.id,
      title: row.title?.trim() || "Untitled",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    earlier: last ? { preview: titleFrom(last.content), updatedAt: last.created_at } : null,
  }
}

/**
 * A conversation's name: the first thing asked in it, on one line, cut at a
 * word. The note the route adds for a picture is not part of the question.
 */
export function titleFrom(prompt: string): string {
  const words = prompt
    .replace(/\n*\[(?:an image|\d+ images) attached\]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!words) return "A picture"
  if (words.length <= 72) return words
  const cut = words.slice(0, 72)
  const space = cut.lastIndexOf(" ")
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`
}

/**
 * THE CONVERSATION A RUN IS WRITTEN INTO, opened or started.
 *
 * Called only after the route has proved ownership of the install against
 * the user's own client. An id is used only when it names a conversation ON
 * THIS INSTALL: one from another website, or one that has been removed, is
 * never written into, and a new conversation starts instead.
 *
 * `adoptEarlier` is continuing the thread from before conversations existed:
 * those messages move into the new conversation, so it reads as one.
 *
 * Null when the table is not there yet, and the messages are then written as
 * they always were, with no conversation.
 */
export async function openThemeConversation(input: {
  installId: string
  requested: string | null
  prompt: string
  adoptEarlier?: boolean
}): Promise<{ id: string; title: string } | null> {
  try {
    const admin = createAdminClient()
    if (input.requested && isConversationId(input.requested)) {
      const { data } = await admin
        .from("theme_chat_conversations")
        .select("id, title")
        .eq("id", input.requested)
        .eq("install_id", input.installId)
        .maybeSingle()
      if (data) return data as { id: string; title: string }
    }

    let title = titleFrom(input.prompt)
    if (input.adoptEarlier) {
      const { data: first } = await admin
        .from("theme_chat_messages")
        .select("content")
        .eq("install_id", input.installId)
        .is("conversation_id", null)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .limit(1)
      const oldest = ((first as { content: string }[] | null) ?? [])[0]
      if (oldest) title = titleFrom(oldest.content)
    }

    const { data, error } = await admin
      .from("theme_chat_conversations")
      .insert({ install_id: input.installId, title })
      .select("id, title")
      .single()
    if (error || !data) return null
    const opened = data as { id: string; title: string }

    if (input.adoptEarlier) {
      await admin
        .from("theme_chat_messages")
        .update({ conversation_id: opened.id })
        .eq("install_id", input.installId)
        .is("conversation_id", null)
    }
    return opened
  } catch {
    /* The transcript is evidence, not enforcement; the edit still runs. */
    return null
  }
}

/** Moves a conversation to the top of the history. */
async function touchConversation(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string | null | undefined,
): Promise<void> {
  if (!conversationId) return
  await admin
    .from("theme_chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
}

/**
 * The conversation for one theme, oldest first. RLS decides visibility.
 *
 * Read through the USER's client rather than the admin one, so a creator can
 * only ever see their own — the policy is the check, and there is no second
 * authorisation path here to disagree with it.
 */
export async function readThemeChat(
  installId: string,
  scope: ConversationScope = { kind: "all" },
): Promise<ThemeMessage[]> {
  const supabase = await createClient()
  let query = supabase
    .from("theme_chat_messages")
    .select("id, role, content, ops, error, created_at")
    .eq("install_id", installId)
  /*
    One conversation, or the messages from before conversations were kept
    apart. "all" is what a database without the conversations table gets:
    the one thread it has always had.
  */
  if (scope.kind === "one") query = query.eq("conversation_id", scope.id)
  else if (scope.kind === "earlier") query = query.is("conversation_id", null)
  const { data, error } = await query
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
  if (error) throw new ThemeChatUnavailableError(error.message, isMissingTable(error))

  type Row = {
    id: string
    role: "user" | "assistant"
    content: string
    ops: ThemeOp[] | null
    error: string | null
    created_at: string
  }

  const rows = ((data as Row[] | null) ?? []).reverse()

  /**
   * ONE QUERY FOR THE LOT, not one per message. A hundred messages would
   * otherwise be a hundred round trips and a hundred signing calls to open a
   * panel.
   */
  const pictures = await attachmentsFor(rows.map((row) => row.id))

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    images: pictures.get(row.id) ?? [],
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
  /** Null on a database without conversations, and the row is written as before. */
  conversationId?: string | null
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
        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
      })
      .select("id")
      .single()
    await touchConversation(admin, input.conversationId)
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
  conversationId?: string | null
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
      ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
    })
    await touchConversation(admin, input.conversationId)
  } catch {
    // Same reason: the edit already happened and is on the creator's screen.
  }
}
