/**
 * ===========================================================================
 *  WRITE ME A SECTION
 * ===========================================================================
 * The page assistant edits a page: add this section, set that setting. Every
 * one of its operations names something that already exists. This writes a
 * new section TYPE, which produces a file, and a file either compiles or it
 * does not — a different act, so a different door.
 *
 * What comes back from the model is never trusted. It is compiled by the same
 * compiler the code editor saves through, checked against the names already
 * taken here, and saved into the file's DRAFT half like any other save, with
 * a version row beside it. Nothing reaches a visitor until the creator
 * publishes, and nothing reaches the account at all unless it compiles.
 */
import { describeMemory, memoriesForSite, type MemoryDb } from "@/lib/ai-memory/store"
import { readTwice, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { NextResponse, after, type NextRequest } from "next/server"
import { mirrorToGitHub } from "@/lib/github-sync/mirror"
import { z } from "zod"

import { cleanAgentBody, unreadablePart } from "@/lib/website-builder/agent/request-shape"
import { reviewImages } from "@/lib/sites/agent/attachments"
import { createClient } from "@/lib/supabase/server"
import { resolveForCreator } from "@/lib/sites/agent/provider"
import { plainRunError } from "@/lib/sites/agent/plain-errors"
import { writeSection, type WriteEvent, type WriteStage } from "@/lib/website-builder/agent/write-section"
import { EFFORT } from "@/lib/website-builder/ask-engines"
import { completeThemeExchange, openThemeConversation, startThemeExchange } from "@/lib/website-builder/agent/chat"
import { keepImages } from "@/lib/website-builder/agent/attachment-store"
import { withPictureNote } from "@/lib/website-builder/ask-attach"
import { editorContent, recordVersion, saveDraft, sourceMap } from "@/lib/website-builder/theme-file-drafts"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { LIMITS } from "@/lib/storelib-theme/types"
import { isCompatInstall } from "@/lib/website-builder/compat-site"
import { LIMITS as RATE_LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { loopDeadlineMs } from "@/lib/website-builder/agent/limits"
import { limitStatus, themeAgentLimit } from "@/lib/sites/rate-limit"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/**
 * THREE MODEL CALLS AND A COMPILE AFTER EACH, at up to 16,000 tokens a file.
 * Without a number here the platform's default decided, and a long section
 * was killed mid write with nothing said: a spinner, then nothing.
 */
export const maxDuration = 300

const BodySchema = z.object({
  /**
   * What the creator asked for, in their words — WHICH MAY BE NONE OF THEM.
   *
   * There used to be a `.min(3)` here. It meant that attaching a picture of
   * a section and typing nothing failed validation, and the panel reported
   * "the assistant could not produce a section that compiles": a true
   * sentence about the wrong thing. A picture is a request.
   */
  prompt: z.string().max(8000),
  /** Checked by reviewImages, never trusted as shaped. */
  images: z.array(z.unknown()).max(16).optional(),
  provider: z.enum(["anthropic", "openai"]).optional(),
  tier: z.enum(["fast", "strong"]).optional(),
  model: z.string().regex(/^claude-[a-z0-9-]{1,100}$/).optional(),
  /**
   * The theme the section is being written FOR, as the editor currently holds
   * it: its colour schemes, its fonts, its buttons. Optional, because an
   * older client does not send it and a section written without it is exactly
   * what this route produced before.
   */
  settings: z.record(z.unknown()).optional(),
  /** What the site is already built out of, for coherence. Names only. */
  sectionTypes: z.array(z.string().max(80)).max(60).optional(),
  /**
   * THE CONVERSATION ON SCREEN, so a section written here is part of the
   * same chat as the changes around it: in the history, and in what the
   * page assistant reads before its next answer. Honoured only when it is
   * a conversation on THIS install (openThemeConversation).
   */
  conversationId: z.string().uuid().nullable().optional(),
  /** The page it was asked on, for the transcript. */
  page: z.string().min(1).max(200).optional(),
})

export async function POST(request: NextRequest, context: { params: Promise<{ installId: string }> }) {
  /* The platform's 300 seconds count from here, so the writing's deadline does too. */
  const requestStartedAt = Date.now()
  const { installId } = await context.params

  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })

  const { data: creator, error: creatorReadErr } = await readTwice(() => supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle())
  if (creatorReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!creator) return NextResponse.json({ error: "Only creators can edit themes." }, { status: 403 })

  /** RLS decides: a theme somebody else owns reads as absent. */
  const { data: install, error: installReadErr } = await readTwice(() => supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
    .maybeSingle())
  if (installReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  /**
   * BEFORE the model is reached and before the stream opens, as on the page
   * assistant's route: a limit checked after the work starts bills for what
   * it refused. One to three model calls per request: RATE_LIMITS.siteAi.
   */
  const limited = await rateLimit({
    bucket: "site-section-write",
    subjects: [`user:${user.id}`],
    windows: RATE_LIMITS.siteAi,
    message: "That is a lot of sections asked for in a short time. Wait a moment and try again.",
  })
  if (limited) return limited
  /* And no more Storelib AI runs at once than lib/sites/rate-limit.ts THEME_AGENT_AT_ONCE, counted with the page assistant's. */
  const busy = await themeAgentLimit((creator as { id: string }).id)
  if (busy) return NextResponse.json({ error: busy }, { status: limitStatus(busy) })

  const parsed = BodySchema.safeParse(cleanAgentBody(await request.json().catch(() => null)))
  if (!parsed.success) return NextResponse.json({ error: unreadablePart(parsed.error.issues), issues: parsed.error.issues }, { status: 400 })

  /**
   * The pictures are checked at the edge, against the limits in one module:
   * type, size, count, and the total the platform will carry. They go to the
   * model with every call it makes, and to the conversation's private
   * picture store for thirty days, like a picture sent with a page change.
   */
  const { images, rejected } = reviewImages(parsed.data.images)
  if (!parsed.data.prompt.trim() && images.length === 0) {
    return NextResponse.json(
      { error: "Describe the section you want, or attach a picture of one." },
      { status: 400 },
    )
  }

  /**
   * EVERY NAME AND TYPE ALREADY HERE: the theme's, and this creator's own. The
   * model is told what it may not use, and the answer is checked against the
   * same list rather than trusted to have listened.
   */
  let sources: Record<string, string> = {}
  {
    const withDraft = await supabase
      .from("store_theme_custom_files")
      .select("path, content, draft_content")
      .eq("install_id", installId)
      .like("path", "%.storelib")
    const rows = withDraft.error
      ? ((await supabase.from("store_theme_custom_files").select("path, content").eq("install_id", installId).like("path", "%.storelib")).data ?? [])
      : (withDraft.data ?? [])
    Object.assign(sources, sourceMap(rows as { path: string; content: string; draft_content?: string | null }[]))
  }
  if (Object.keys(sources).length >= LIMITS.filesPerPackage) {
    return NextResponse.json({ error: `A theme holds ${LIMITS.filesPerPackage} files.` }, { status: 413 })
  }
  const mine = schemasFromSources(sources)
  const takenTypes = [...new Set([...Object.keys(SECTION_SCHEMAS), ...Object.keys(mine)])]
  const takenNames = [
    ...Object.values(SECTION_SCHEMAS).map((s) => s.name),
    ...Object.values(mine).map((s) => s.name),
  ].filter(Boolean)

  let resolved: Awaited<ReturnType<typeof resolveForCreator>>
  try {
    resolved = await resolveForCreator((creator as { id: string }).id, { requested: parsed.data.provider, tier: parsed.data.tier ?? "strong", model: parsed.data.model })
  } catch (error) {
    return NextResponse.json({ error: plainRunError(error, "section provider", "Choose an available model and try again.") }, { status: 503 })
  }

  /**
   * KEPT IN THE CONVERSATION, the way a change to the page is: the question
   * before anything is attempted, its pictures for thirty days, the answer
   * when it is in. A transcript that could not be written never stops the
   * section being written (lib/website-builder/agent/chat.ts).
   */
  const pageKey = parsed.data.page ?? "home"
  const noted = withPictureNote(parsed.data.prompt, images.length)
  const conversation = await openThemeConversation({ installId, requested: parsed.data.conversationId ?? null, prompt: noted })
  const conversationId = conversation?.id ?? null
  const recorded = await startThemeExchange({ installId, pageKey, prompt: noted, conversationId })
  await keepImages({ installId, messageId: recorded.id, images })
  const record = (reply: string, error: string | null) => completeThemeExchange({ installId, pageKey, reply, ops: [], error, conversationId })

  /**
   * The whole job, start to answer. `onStage` is how the panel is told what
   * is happening while it waits, when it asked to be (below).
   */
  /**
   * THE WRITING DOES NOT STOP WHEN THE TAB DOES. A section the creator asked
   * for is finished and saved even if they closed the window meanwhile: it
   * is in Add section under their own sections when they come back. What
   * stops it is the deadline, before the platform would, so it can still
   * save and say why: counted from the request's start, with room for the
   * save and the transcript after it (lib/website-builder/agent/limits.ts
   * loopDeadlineMs). It was fifteen seconds from here, after the reads and
   * the pictures' upload had already spent part of the 300.
   */
  const loopMs = loopDeadlineMs({ requestStartedAt, maxDurationS: maxDuration })
  const deadline = AbortSignal.timeout(loopMs)
  const deadlineAt = Date.now() + loopMs
  /* AI Memory, this website's notes and the everywhere ones, read through the creator's own client (lib/ai-memory/store.ts). */
  const memory = await memoriesForSite(supabase as unknown as MemoryDb, (creator as { id: string }).id, installId)
  /* Round AH: an imported theme draws a Storelib section without its script (lib/storelib-theme/compat/theme.ts renderNative). */
  const importedTheme = await isCompatInstall(installId).catch(() => false)
  const run = async (
    onStage?: (stage: WriteStage, attempt: number) => void,
    onEvent?: (event: WriteEvent) => void,
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    const written = await writeSection({
      provider: resolved.provider,
      model: resolved.model,
      prompt: parsed.data.prompt,
      images,
      /* Medium, always, with no switch (lib/website-builder/ask-engines.ts): planned, written, drawn, checked and refined once still. */
      effort: EFFORT,
      cacheKey: `theme:${installId}`,
      deadlineAt,
      onEvent,
      accountMemory: memory.ready ? memory.account.map((m) => m.content) : [],
      memoryText: memory.ready ? describeMemory(memory) : undefined,
      takenTypes,
      takenNames,
      importedTheme,
      theme: {
        settings: parsed.data.settings ?? null,
        /* The creator's own section files, read above: the brief lists them and is cached per theme version (lib/website-builder/agent/theme-brief.ts). */
        sources,
        neighbours: (parsed.data.sectionTypes ?? []).map((type) => ({
          type,
          name: SECTION_SCHEMAS[type]?.name ?? mine[type]?.name,
        })),
      },
      signal: deadline,
      onStage,
    })

    /* An answer rather than a file: the message was a question, or too
       unclear to build. Nothing was written, and nothing went wrong. */
    if (written.ok === false && written.reply) {
      await record(written.reply, null)
      return { status: 200, body: { reply: written.reply } }
    }

    if (written.ok === false) {
      if (deadline.aborted) {
        await record("", "Writing that section took too long.")
        return { status: 504, body: { error: "Writing that section took too long. Try again, or describe a smaller section." } }
      }
      await record("", written.error)
      return { status: 422, body: { error: written.error, errors: written.errors, source: written.source } }
    }

    /**
     * Saved the same way the code editor saves: into the draft half, with a
     * version row. The creator opens it, reads it, changes it and publishes it.
     * Nothing here puts it on a page or in front of a visitor.
     */
    const saved = await saveDraft(supabase, installId, written.value.path, written.value.source)
    if (saved.ok === false) {
      await record("", saved.error)
      return { status: 500, body: { error: saved.error } }
    }
    await recordVersion(supabase, installId, written.value.path, written.value.source, "save", { author: "ai" })
    /* Also reached from inside the streamed answer; if `after` is not
       available there, the commit is simply started without waiting. */
    const change = { kind: "save" as const, path: written.value.path, content: written.value.source }
    try {
      after(() => mirrorToGitHub(installId, change))
    } catch {
      void mirrorToGitHub(installId, change)
    }

    await record(`Added ${written.value.name} to the page.`, null)
    return {
      status: 200,
      body: {
        path: written.value.path,
        type: written.value.type,
        name: written.value.name,
        drafted: saved.drafts,
        /* Picture settings it left for the creator: the chat offers to upload them once it is on the page. */
        imageSlots: written.value.imageSlots ?? [],
        /* What the self check did. */
        reviewed: written.value.reviewed,
        /**
         * An attachment that was refused is named rather than dropped in
         * silence: otherwise the section comes back written from a picture the
         * creator thinks it saw and it never did.
         */
        ignored: rejected.length ? rejected.map((r) => r.reason) : undefined,
      },
    }
  }

  /**
   * ===========================================================================
   *  SAYING WHAT IS HAPPENING, WHILE IT HAPPENS
   * ===========================================================================
   * Writing a section is one to three model calls and a compile after each,
   * which is half a minute or more. The panel asks for a line per stage
   * (`Accept: application/x-ndjson`) so it can say "Thinking", "Checking it",
   * "Fixing a detail" as each one starts rather than one sentence for the
   * whole wait. The last line is the answer, with the status it would have
   * had. Anything that does not ask gets the plain JSON answer, as before.
   */
  if ((request.headers.get("accept") ?? "").includes("application/x-ndjson")) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const line = (value: unknown) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
          } catch {
            /* The reader went away; the work finishes and is saved anyway. */
          }
        }
        /* First, so the panel knows which conversation this is in before anything else arrives. */
        if (conversation) line({ type: "conversation", id: conversation.id, title: conversation.title })
        if (recorded.id) line({ type: "recorded", messageId: recorded.id })
        try {
          const done = await run(
            (stage, attempt) => line({ type: "stage", stage, attempt }),
            /* The steps, in the page assistant's line shapes: the chat draws both with one reader. */
            (event) => line(event),
          )
          /* The answer nested, not spread: a section has a `type` of its own,
             and spreading it here overwrote the event's. */
          line({ type: "result", status: done.status, answer: done.body })
        } catch (e) {
          line({ type: "result", status: 500, answer: { error: plainRunError(e, "section writer", "The section could not be written.") } })
        } finally {
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
      },
    })
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    })
  }

  const done = await run()
  return NextResponse.json(done.body, { status: done.status })
}
