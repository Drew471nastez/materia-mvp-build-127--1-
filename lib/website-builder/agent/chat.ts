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
import { attachmentsFor, type PictureProblem } from "./attachment-store"
import { createClient } from "@/lib/supabase/server"
import { readPictureNote } from "@/lib/website-builder/ask-attach"
import { isMissingTable } from "./db-errors"

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

/* A missing table is told apart from a failed read in ./db-errors, shared with the pictures. */

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
  const words = readPictureNote(prompt).text.replace(/\s+/g, " ").trim()
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
export interface ThemeChatRead {
  messages: ThemeMessage[]
  /**
   * Whether the pictures could be read back. "not_set_up" before the
   * database update that keeps them (run-now part 33): the chat says so, and
   * the pictures its messages mention show as no longer available.
   */
  pictures: "ready" | PictureProblem
}

export async function readThemeChat(
  installId: string,
  scope: ConversationScope = { kind: "all" },
): Promise<ThemeChatRead> {
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
  const asked = rows.filter((row) => row.role === "user" && readPictureNote(row.content).count > 0).map((row) => row.id)
  const pictures = await attachmentsFor(installId, asked)

  return {
    messages: rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      images: pictures.byMessage.get(row.id) ?? [],
      ops: Array.isArray(row.ops) ? row.ops : [],
      error: row.error,
      createdAt: row.created_at,
    })),
    pictures: pictures.problem ?? "ready",
  }
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
}): Promise<{ id: string | null; problem: "not_set_up" | "failed" | null }> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
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
    /*
      NOT KEPT IS SAID, NOT SWALLOWED. Before the database update there is
      no table to write the question into, and the chat tells the creator
      this conversation is not being saved rather than letting them find
      out after a reload.
    */
    if (error || !data) return { id: null, problem: isMissingTable(error) ? "not_set_up" : "failed" }
    await touchConversation(admin, input.conversationId)
    return { id: (data as { id: string }).id, problem: null }
  } catch {
    /**
     * The transcript is evidence, not enforcement. Failing to record a
     * question must never be the reason somebody cannot make a change.
     */
    return { id: null, problem: "failed" }
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

/*
  ═══════════════════════════════════════════════════════════════════════════
   DELETING A CONVERSATION, AND REPORTING AN ANSWER
  ═══════════════════════════════════════════════════════════════════════════
  "I can delete the chat history." Both are writes, so both go the way every
  write in this module goes: the route proves the signed in creator owns the
  install (ownThemeInstall), and then what may be touched is read through the
  creator's OWN client, where RLS decides. Only what that read returned is
  deleted, with the service role, and every delete is also filtered to the
  install. No client can write these tables directly; the policies stay read
  only (tests/ask-storelib.test.ts holds them to it).

  The clients are injected so tests/ask-conversations.test.ts can hand in a
  fake database that applies the same ownership rule RLS does. The routes
  pass nothing and get the real ones.
*/

/** As much of a supabase-js client as these functions use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatDb = { from: (table: string) => any; storage?: { from: (bucket: string) => any } }

export interface ChatClients {
  /** The signed in creator's own client. RLS applies. */
  user: ChatDb
  /** The service role. Used only on rows the user's client already returned. */
  admin: ChatDb
}

async function realClients(): Promise<ChatClients> {
  return {
    user: (await createClient()) as unknown as ChatDb,
    admin: createAdminClient() as unknown as ChatDb,
  }
}

/**
 * The private bucket a conversation's pictures are kept in: the same name as
 * lib/website-builder/agent/attachment-store.ts, and a test holds the two
 * together.
 */
export const CHAT_PICTURES_BUCKET = "theme-chat-attachments"

/** What a delete is for: one conversation, the messages from before conversations, or every one. */
export type DeleteTarget = { kind: "one"; id: string } | { kind: "earlier" } | { kind: "all" }

export type DeleteResult =
  | { ok: true; conversations: number; messages: number }
  | { ok: false; status: 404 | 503; reason: "not_found" | "not_set_up" | "failed" }

type DbError = { code?: string; message?: string } | null

function unavailable(error: DbError): { ok: false; status: 503; reason: "not_set_up" | "failed" } {
  return { ok: false, status: 503, reason: isMissingTable(error) ? "not_set_up" : "failed" }
}

/**
 * THE PICTURES GO FIRST. A message's pictures are rows pointing at bytes in a
 * private bucket, and a row goes with its message (on delete cascade). A
 * message deleted first would leave bytes no row names, which the nightly
 * collector can never find because it reads rows. So: the bytes, then the
 * rows. When the bytes cannot be removed right now, the rows are let go of
 * their messages and marked due, and the collector takes both next run.
 */
async function forgetPictures(admin: ChatDb, installId: string, messageIds: string[] | "all"): Promise<void> {
  if (messageIds !== "all" && messageIds.length === 0) return
  /* A long list goes in parts: every id is in the request's address. */
  const groups: (string[] | "all")[] = messageIds === "all" ? ["all"] : chunks(messageIds, 150)
  for (const group of groups) {
    try {
      let query = admin.from("theme_chat_attachments").select("id, storage_path").eq("install_id", installId)
      if (group !== "all") query = query.in("message_id", group)
      const { data, error } = await query.limit(2000)
      if (error || !data) continue
      const rows = data as { id: string; storage_path: string }[]
      if (rows.length === 0) continue
      const ids = rows.map((row) => row.id)
      const removed = admin.storage
        ? await admin.storage.from(CHAT_PICTURES_BUCKET).remove(rows.map((row) => row.storage_path))
        : { error: { message: "no storage" } }
      if (!removed?.error) {
        await admin.from("theme_chat_attachments").delete().in("id", ids).eq("install_id", installId)
        continue
      }
      await admin
        .from("theme_chat_attachments")
        .update({ message_id: null, expires_at: new Date().toISOString() })
        .in("id", ids)
        .eq("install_id", installId)
    } catch {
      /* The words are what was asked to go; a picture left for the collector is no reason to refuse. */
    }
  }
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let at = 0; at < list.length; at += size) out.push(list.slice(at, at + size))
  return out
}

/**
 * Deletes one conversation, the earlier messages, or all of them, on one
 * install. Call only after ownThemeInstall(installId) has said yes.
 *
 * `not_set_up` for one conversation means the conversations table is not
 * there yet. Deleting ALL still works then: a database without
 * conversations has one thread per website, and that thread is deleted.
 */
export async function deleteThemeChat(installId: string, target: DeleteTarget, clients?: ChatClients): Promise<DeleteResult> {
  if (target.kind === "one" && !isConversationId(target.id)) return { ok: false, status: 404, reason: "not_found" }
  const { user, admin } = clients ?? (await realClients())

  /* 1. WHAT THIS CREATOR CAN SEE, through their own client. */
  let conversationIds: string[] = []
  let conversationsTable = true
  if (target.kind === "one") {
    const { data, error } = await user
      .from("theme_chat_conversations")
      .select("id")
      .eq("id", target.id)
      .eq("install_id", installId)
      .maybeSingle()
    if (error) return unavailable(error)
    /* Not on this website, or not this creator's: the same answer. */
    if (!data) return { ok: false, status: 404, reason: "not_found" }
    conversationIds = [(data as { id: string }).id]
  } else if (target.kind === "all") {
    const { data, error } = await user.from("theme_chat_conversations").select("id").eq("install_id", installId).limit(1000)
    if (error) {
      if (!isMissingTable(error)) return unavailable(error)
      conversationsTable = false
    } else {
      conversationIds = ((data as { id: string }[] | null) ?? []).map((row) => row.id)
    }
  }

  /* 2. The messages that go with it, read the same way. */
  let messages = user.from("theme_chat_messages").select("id").eq("install_id", installId)
  if (target.kind === "one") messages = messages.eq("conversation_id", target.id)
  else if (target.kind === "earlier") messages = messages.is("conversation_id", null)
  const { data: found, error: readError } = await messages.limit(5000)
  if (readError) return unavailable(readError)
  const messageIds = ((found as { id: string }[] | null) ?? []).map((row) => row.id)
  if (target.kind === "earlier" && messageIds.length === 0) return { ok: false, status: 404, reason: "not_found" }
  /*
    NOTHING SEEN, NOTHING TOUCHED. The service role below deletes by the
    install, so it acts only once the creator's own client has shown a row
    on it: the policy is the install's ownership chain, so one visible row
    is the database agreeing the install is theirs. A website that is not
    theirs shows none, and "delete all" there is a no-op, whatever the
    route above did or did not check.
  */
  if (target.kind === "all" && conversationIds.length === 0 && messageIds.length === 0) {
    return { ok: true, conversations: 0, messages: 0 }
  }

  /* 3. The pictures, bytes before rows. */
  await forgetPictures(admin, installId, target.kind === "all" ? "all" : messageIds)

  /* 4. The rows, each delete filtered to this install whatever else it names. */
  let drop = admin.from("theme_chat_messages").delete().eq("install_id", installId)
  if (target.kind === "one") drop = drop.eq("conversation_id", target.id)
  else if (target.kind === "earlier") drop = drop.is("conversation_id", null)
  const { error: dropError } = await drop
  if (dropError) return unavailable(dropError)

  if (target.kind !== "earlier" && conversationsTable && conversationIds.length > 0) {
    let gone = admin.from("theme_chat_conversations").delete().eq("install_id", installId)
    if (target.kind === "one") gone = gone.eq("id", target.id)
    const { error: goneError } = await gone
    if (goneError) return unavailable(goneError)
  }
  return { ok: true, conversations: conversationIds.length, messages: messageIds.length }
}

/**
 * The model names a report may carry: the switch's own ids
 * (lib/website-builder/ask-engines.ts), nothing else. The Claude ids stay so
 * an answer given before Storelib AI moved to ChatGPT can still be reported.
 */
export const REPORTABLE_ENGINES = ["openai", "openai-strong", "claude", "claude-opus"] as const

export type ReportResult =
  | { ok: true }
  | { ok: false; status: 404 | 503; reason: "not_found" | "not_set_up" | "failed" }

export const REPORT_REASON_MAX = 500
const REPORT_PROMPT_MAX = 2000
const REPORT_REPLY_MAX = 4000

function clip(text: unknown, max: number): string {
  return typeof text === "string" ? text.trim().slice(0, max) : ""
}

/**
 * "I can report the prompt." One exchange, flagged by the creator who had it.
 *
 * The message is found through the creator's own client, so an id from
 * somebody else's conversation is simply not found, and so is the other half
 * of the exchange (the reply to a question, or the question behind a reply).
 * Stored: both message ids, the conversation, the optional reason, and the
 * words of both halves, so a report can still be read after the creator
 * deletes the conversation it came from. One report per question; a second
 * replaces the reason. Nothing of it is logged.
 */
export async function reportThemeExchange(
  input: { installId: string; creatorId: string; messageId: string; reason?: string | null; engine?: string | null },
  clients?: ChatClients,
): Promise<ReportResult> {
  if (!isConversationId(input.messageId)) return { ok: false, status: 404, reason: "not_found" }
  const { user, admin } = clients ?? (await realClients())

  type Row = { id: string; role: "user" | "assistant"; content: string; conversation_id: string | null; created_at: string }
  const { data: found, error } = await user
    .from("theme_chat_messages")
    .select("id, role, content, conversation_id, created_at")
    .eq("id", input.messageId)
    .eq("install_id", input.installId)
    .maybeSingle()
  if (error) return unavailable(error)
  if (!found) return { ok: false, status: 404, reason: "not_found" }
  const message = found as Row

  let other = user
    .from("theme_chat_messages")
    .select("id, role, content, conversation_id, created_at")
    .eq("install_id", input.installId)
  other = message.conversation_id ? other.eq("conversation_id", message.conversation_id) : other.is("conversation_id", null)
  other =
    message.role === "user"
      ? other.eq("role", "assistant").gt("created_at", message.created_at).order("created_at", { ascending: true })
      : other.eq("role", "user").lt("created_at", message.created_at).order("created_at", { ascending: false })
  const { data: pair } = await other.limit(1)
  const partner = ((pair as Row[] | null) ?? [])[0] ?? null

  const prompt = message.role === "user" ? message : partner
  const reply = message.role === "user" ? partner : message
  const engine = (REPORTABLE_ENGINES as readonly string[]).includes(input.engine ?? "") || /^claude:claude-[a-z0-9-]{1,100}$/.test(input.engine ?? "") ? input.engine : null

  const { error: writeError } = await admin.from("theme_chat_reports").upsert(
    {
      install_id: input.installId,
      creator_id: input.creatorId,
      conversation_id: message.conversation_id,
      message_id: prompt?.id ?? message.id,
      reply_message_id: reply?.id ?? null,
      reason: clip(input.reason, REPORT_REASON_MAX) || null,
      prompt: clip(prompt?.content, REPORT_PROMPT_MAX),
      reply: clip(reply?.content, REPORT_REPLY_MAX),
      engine,
    },
    { onConflict: "message_id" },
  )
  if (writeError) return unavailable(writeError)
  return { ok: true }
}
