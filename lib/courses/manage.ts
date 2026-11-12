import "server-only"

/**
 * ===========================================================================
 *  A CREATOR BUILDING THEIR COURSE
 * ===========================================================================
 * Every change the course card in the product editor makes goes through here
 * (app/api/courses/manage), with the service role, after one check: the
 * signed in person is the product's creator. Then:
 *
 *   modules and lessons   added, renamed, reordered, removed; a lesson's
 *                         notes, free preview switch, running time and
 *                         YouTube or Vimeo link
 *   a lesson's files      its video, its captions and its downloads, sent
 *                         from the browser straight to the PRIVATE
 *                         digital-products bucket by a signed upload address
 *                         for a path this file chose
 *                         (`<creator>/course-media/<lesson>/<time>-<key>.<ext>`),
 *                         then checked where they landed: the size storage
 *                         recorded, and the first bytes, by the same file
 *                         check every upload on Storelib gets
 *                         (lib/security/uploads). A file that fails is
 *                         removed. Only then does the lesson point at it.
 *   storage               counted against the plan's quota together with
 *                         the creator's product files; a replaced or removed
 *                         file is deleted from storage at once.
 *
 * Each change answers with the whole course again, so the editor never has
 * to reconcile two copies.
 *
 * ROUND 33: a new module or lesson may come with its id, made in the browser
 * (crypto.randomUUID), so the editor can show it, focus its name and send
 * the next change to it before this answers. An id that is taken anywhere
 * is refused by the primary key, never reused. A module and a lesson may
 * have a cover (part 200): a picture already in Storelib's storage.
 */

import { cleanStoredHtml, looksLikeHtml } from "@/lib/rich-text/html"
import type { SupabaseClient } from "@supabase/supabase-js"
import { STORAGE_BUCKET, getPlanLimits } from "@/lib/storage/plans"
import { getCreatorStorageUsage } from "@/lib/storage/quota"
import { readStoredHead, storedObjectSize } from "@/lib/storage/upload-guard"
import { inspectHead, precheckUpload } from "@/lib/security/uploads/inspect"
import { sanitizeDisplayName } from "@/lib/security/uploads/filename"
import { isLessonMediaPath, isUuid, lessonMediaPrefix } from "./access"
import { CAPTION_MAX_BYTES, isCaptionName, looksLikeCaptions } from "./captions"
import { externalVideo } from "./external"
import { isOwnMedia } from "@/lib/storage/media-url"
import { readCourseTree, type AttachmentRow, type LessonRow } from "./server"
import type { EditorTree } from "./types"

type Db = SupabaseClient

export const MAX_MODULES = 50
export const MAX_LESSONS_PER_MODULE = 100
export const MAX_ATTACHMENTS_PER_LESSON = 20
export const MAX_NOTES_CHARS = 20_000
/** The per-file ceiling every plan has for a product file (lib/storage/plans maxFileSizeBytes). */
export const VIDEO_MAX_BYTES = 10 * 1024 * 1024 * 1024

export type MediaKind = "video" | "captions" | "attachment"

export class ManageError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export interface Owner {
  userId: string
  creatorId: string
  planId: string | null
  /** The product, or for a community's own program (part 102) the program's id. */
  productId: string
  /** Set for a community's own program: it has no product, and its course hangs off its community_courses row. */
  programId?: string | null
}

/**
 * The product's creator, or a refusal. The same answer for "not yours" and
 * "not there". The builder of a community's Learn (components/community/
 * learn) sends a program's id where a product's would be: a program has no
 * product, so when no product has the id, a program is looked for, and the
 * person must be someone who runs Learn in that community. Its files count
 * against the community creator's storage, under their folder.
 */
/** `teamStore`: round 41, the store a team member with Products works in (lib/team/server teamStoreIdFor); its courses are theirs to edit. Playing a lesson stays the owner's and buyers' (lib/courses/access). */
export async function ownerOf(db: Db, userId: string, productId: unknown, teamStore: string | null = null): Promise<Owner> {
  if (!isUuid(productId)) throw new ManageError("Product not found", 404)
  const { data: product } = await db.from("products").select("id, creator_id").eq("id", productId).maybeSingle()
  if (!product) {
    const { programManager } = await import("@/lib/communities/server/learn")
    const program = await programManager(db, userId, productId)
    if (!program) throw new ManageError("Product not found", 404)
    return { userId, creatorId: program.creatorId, planId: program.planId, productId, programId: productId }
  }
  const creatorId = (product as { creator_id?: string | null } | null)?.creator_id
  if (!creatorId) throw new ManageError("Product not found", 404)
  const { data: creator, error: creatorError } = await db.from("creators").select("id, user_id, subscription_plan_id").eq("id", creatorId).maybeSingle()
  /* A read that failed is not "not found" and not Free (round rel2-auth). */
  if (creatorError) throw new ManageError("Storelib is not answering right now. Try again.", 503)
  const c = creator as { user_id?: string | null; subscription_plan_id?: string | null } | null
  if (!c || (c.user_id !== userId && creatorId !== teamStore)) throw new ManageError("Product not found", 404)
  return { userId, creatorId, planId: c.subscription_plan_id ?? null, productId }
}

export async function editorTree(db: Db, productId: string): Promise<EditorTree> {
  const tree = await readCourseTree(db, productId)
  if (!tree) return { courseId: null, modules: [] }
  const lessonIds = tree.modules.flatMap((m) => m.lessons.map((l) => l.id))
  const { data: atts } = lessonIds.length ? await db.from("lesson_attachments").select("*").in("lesson_id", lessonIds) : { data: [] }
  const attachments = ((atts ?? []) as AttachmentRow[]).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  return {
    courseId: tree.course.id,
    modules: tree.modules.map((m) => ({
      id: m.id,
      title: m.title,
      coverUrl: coverOf(m),
      priceCents: (m as { price_cents?: number | null }).price_cents ?? null,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        coverUrl: coverOf(l),
        notes: l.content_text ?? "",
        isPreview: !!l.is_preview,
        durationSeconds: l.duration_seconds ?? null,
        video: l.video_path ? { name: l.video_name || "Video", size: l.video_size ?? null } : null,
        externalUrl: l.video_url ?? "",
        captions: !!l.captions_path,
        attachments: attachments.filter((a) => a.lesson_id === l.id).map((a) => ({ id: a.id, name: a.file_name, size: a.file_size ?? null })),
      })),
    })),
  }
}

/* A cover as stored (part 200): an https address, or nothing. */
function coverOf(row: unknown): string | null {
  const url = (row as { cover_url?: unknown } | null)?.cover_url
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null
}

/** A cover the editor sends: empty clears it; otherwise only a picture Storelib holds. */
export function coverInput(raw: unknown): string | null {
  if (raw === null || raw === "") return null
  if (typeof raw !== "string" || raw.length > 1000 || !/^https:\/\//.test(raw) || !isOwnMedia(raw)) throw new ManageError("Upload the cover here.")
  return raw
}

/* An id the browser made for a new row, or none (the database makes one). */
function newId(raw: unknown): { id?: string } {
  return isUuid(raw) ? { id: raw.toLowerCase() } : {}
}

function title(raw: unknown, fallback: string): string {
  const t = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 160) : ""
  return t || fallback
}

async function ensureCourse(db: Db, o: Owner): Promise<string> {
  if (o.programId) return ensureProgramCourse(db, o.programId)
  const { data: existing } = await db.from("courses").select("id").eq("product_id", o.productId).maybeSingle()
  if (existing) return (existing as { id: string }).id
  /* A course is what makes the product a course: the product editor saves the type too. */
  await db.from("products").update({ type: "course" }).eq("id", o.productId).eq("creator_id", o.creatorId)
  const { data, error } = await db.from("courses").upsert({ product_id: o.productId }, { onConflict: "product_id" }).select("id").single()
  if (error || !data) throw new ManageError("The course could not be started. Try again.", 500)
  return (data as { id: string }).id
}

/*
  A PROGRAM'S COURSE: made the first time a module is added, with no
  product, and named on the program's row. Two first modules at once both
  make one; only the first is named (the row is only written while it has
  none), and the other is removed again.
*/
async function ensureProgramCourse(db: Db, programId: string): Promise<string> {
  const read = async () => ((await db.from("community_courses").select("course_id").eq("id", programId).maybeSingle()).data as { course_id?: string | null } | null)?.course_id ?? null
  const existing = await read()
  if (existing) return existing
  const { data, error } = await db.from("courses").insert({ product_id: null }).select("id").single()
  if (error || !data) throw new ManageError("The program could not be started. Try again.", 500)
  const made = (data as { id: string }).id
  await db.from("community_courses").update({ course_id: made }).eq("id", programId).is("course_id", null)
  const named = await read()
  if (named !== made) await db.from("courses").delete().eq("id", made)
  if (!named) throw new ManageError("The program could not be started. Try again.", 500)
  return named
}

/** A module of this creator's course, or a refusal. */
async function moduleOf(db: Db, o: Owner, moduleId: unknown): Promise<{ id: string; course_id: string }> {
  if (!isUuid(moduleId)) throw new ManageError("Module not found", 404)
  const courseId = await ensureCourse(db, o)
  const { data } = await db.from("course_modules").select("id, course_id").eq("id", moduleId).eq("course_id", courseId).maybeSingle()
  if (!data) throw new ManageError("Module not found", 404)
  return data as { id: string; course_id: string }
}

async function lessonOf(db: Db, o: Owner, lessonId: unknown): Promise<LessonRow> {
  if (!isUuid(lessonId)) throw new ManageError("Lesson not found", 404)
  const { data } = await db.from("course_lessons").select("*").eq("id", lessonId).maybeSingle()
  if (!data) throw new ManageError("Lesson not found", 404)
  await moduleOf(db, o, (data as LessonRow).module_id)
  return data as LessonRow
}

/** Files of this creator's lesson, gone from storage. Never throws: a row goes even if a file will not. */
async function removeFiles(db: Db, o: Owner, lessonId: string, paths: Array<string | null | undefined>): Promise<void> {
  const mine = paths.filter((p): p is string => isLessonMediaPath(p, o.creatorId, lessonId))
  if (mine.length) await db.storage.from(STORAGE_BUCKET).remove(mine).then(() => undefined, () => undefined)
}

async function lessonFiles(db: Db, lesson: LessonRow): Promise<string[]> {
  const { data } = await db.from("lesson_attachments").select("file_path").eq("lesson_id", lesson.id)
  return [lesson.video_path, lesson.captions_path, ...((data ?? []) as Array<{ file_path: string }>).map((a) => a.file_path)].filter((p): p is string => !!p)
}

/** Bytes this creator's courses hold, for the plan's quota beside their product files. Their communities' own programs count too. */
export async function courseMediaBytes(db: Db, creatorId: string): Promise<number> {
  const { data: products } = await db.from("products").select("id").eq("creator_id", creatorId).eq("type", "course")
  const productIds = ((products ?? []) as Array<{ id: string }>).map((p) => p.id)
  const { data: courses } = productIds.length ? await db.from("courses").select("id").in("product_id", productIds) : { data: [] }
  const courseIds = [...((courses ?? []) as Array<{ id: string }>).map((c) => c.id), ...(await programCourseIds(db, creatorId))]
  if (!courseIds.length) return 0
  const { data: modules } = await db.from("course_modules").select("id").in("course_id", courseIds)
  const moduleIds = ((modules ?? []) as Array<{ id: string }>).map((m) => m.id)
  if (!moduleIds.length) return 0
  const { data: lessons } = await db.from("course_lessons").select("*").in("module_id", moduleIds)
  const rows = (lessons ?? []) as LessonRow[]
  const { data: atts } = rows.length ? await db.from("lesson_attachments").select("*").in("lesson_id", rows.map((l) => l.id)) : { data: [] }
  return rows.reduce((s, l) => s + (Number(l.video_size) || 0), 0) + ((atts ?? []) as AttachmentRow[]).reduce((s, a) => s + (Number(a.file_size) || 0), 0)
}

function randomKey(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20)
}

function extensionOf(name: string, fallback: string): string {
  const dot = name.lastIndexOf(".")
  return ((dot === -1 ? "" : name.slice(dot + 1)).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)) || fallback
}

/** What a file of each kind may be, before a byte is sent. Throws the reason it may not. */
export function precheckMedia(kind: MediaKind, fileName: string, contentType: string, size: number): void {
  if (kind === "captions") {
    if (!isCaptionName(fileName)) throw new ManageError("Captions need to be a .vtt or .srt file.", 415)
    if (!(size > 0) || size > CAPTION_MAX_BYTES) throw new ManageError("That caption file is too large.", 413)
    return
  }
  const verdict = precheckUpload({
    fileName,
    size,
    declaredMime: contentType,
    context: kind === "video" ? "video" : "product_file",
    maxBytes: kind === "video" ? VIDEO_MAX_BYTES : undefined,
  })
  if (!verdict.ok) throw new ManageError(verdict.userMessage || "This file can't be uploaded.", verdict.code === "too_large" ? 413 : 415)
}

export async function prepareUpload(
  db: Db,
  o: Owner,
  input: { lessonId: unknown; kind: unknown; fileName: unknown; contentType: unknown; fileSize: unknown },
): Promise<{ signedUrl: string; token: string; path: string }> {
  const kind = input.kind === "video" || input.kind === "captions" || input.kind === "attachment" ? input.kind : null
  if (!kind) throw new ManageError("Bad request")
  const lesson = await lessonOf(db, o, input.lessonId)
  const fileName = typeof input.fileName === "string" ? input.fileName.slice(0, 255) : ""
  const contentType = typeof input.contentType === "string" ? input.contentType.slice(0, 120) : ""
  const size = Number(input.fileSize)
  if (!fileName || !Number.isFinite(size) || size <= 0) throw new ManageError("That file is empty.")
  precheckMedia(kind, fileName, contentType, size)

  if (kind === "attachment") {
    const { count } = await db.from("lesson_attachments").select("id", { count: "exact", head: true }).eq("lesson_id", lesson.id)
    if ((count ?? 0) >= MAX_ATTACHMENTS_PER_LESSON) throw new ManageError(`A lesson holds up to ${MAX_ATTACHMENTS_PER_LESSON} downloads.`)
  }
  const quota = getPlanLimits(o.planId).storageQuotaBytes
  const used = (await getCreatorStorageUsage(db, o.creatorId)) + (await courseMediaBytes(db, o.creatorId))
  if (used + size > quota) {
    throw new ManageError(`This would go over your plan's ${Math.round(quota / 1024 ** 3)} GB of storage. Remove something or change your plan.`, 403)
  }

  const path = `${lessonMediaPrefix(o.creatorId, lesson.id)}${Date.now()}-${randomKey()}.${extensionOf(fileName, kind === "video" ? "mp4" : kind === "captions" ? "vtt" : "bin")}`
  const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new ManageError("Could not start the upload. Try again.", 500)
  return { signedUrl: data.signedUrl, token: data.token, path }
}

export async function completeUpload(db: Db, o: Owner, input: { lessonId: unknown; kind: unknown; path: unknown; fileName: unknown; contentType: unknown }): Promise<void> {
  const kind = input.kind === "video" || input.kind === "captions" || input.kind === "attachment" ? input.kind : null
  if (!kind) throw new ManageError("Bad request")
  const lesson = await lessonOf(db, o, input.lessonId)
  if (!isLessonMediaPath(input.path, o.creatorId, lesson.id)) throw new ManageError("Upload not found", 404)
  const path = input.path
  const fileName = sanitizeDisplayName(typeof input.fileName === "string" && input.fileName ? input.fileName : "file")
  const contentType = typeof input.contentType === "string" ? input.contentType.slice(0, 120) : ""

  const size = await storedObjectSize(db, STORAGE_BUCKET, path)
  if (size === null) throw new ManageError("The upload did not arrive. Try again.")
  const refuse = async (message: string, status = 415): Promise<never> => {
    await db.storage.from(STORAGE_BUCKET).remove([path]).then(() => undefined, () => undefined)
    throw new ManageError(message, status)
  }

  const head = await readStoredHead(db, STORAGE_BUCKET, path)
  if (kind === "captions") {
    if (size > CAPTION_MAX_BYTES) await refuse("That caption file is too large.", 413)
    if (!looksLikeCaptions(new TextDecoder().decode(head ?? new Uint8Array()))) await refuse("That file does not look like captions. Use a .vtt or .srt file.")
  } else {
    const verdict = inspectHead({ fileName, declaredMime: contentType, size, head, context: kind === "video" ? "video" : "product_file", maxBytes: kind === "video" ? VIDEO_MAX_BYTES : undefined })
    if (!verdict.ok) await refuse(verdict.userMessage || "This file can't be uploaded.", verdict.code === "too_large" ? 413 : 415)
  }

  const now = new Date().toISOString()
  if (kind === "video") {
    const old = lesson.video_path
    const mime = contentType.startsWith("video/") ? contentType : null
    const { error } = await db.from("course_lessons").update({ video_path: path, video_size: size, video_mime: mime, video_name: fileName, duration_seconds: null, updated_at: now }).eq("id", lesson.id)
    if (error) await refuse("The video could not be saved. Try again.", 500)
    if (old && old !== path) await removeFiles(db, o, lesson.id, [old])
  } else if (kind === "captions") {
    const old = lesson.captions_path
    const { error } = await db.from("course_lessons").update({ captions_path: path, updated_at: now }).eq("id", lesson.id)
    if (error) await refuse("The captions could not be saved. Try again.", 500)
    if (old && old !== path) await removeFiles(db, o, lesson.id, [old])
  } else {
    const { count } = await db.from("lesson_attachments").select("id", { count: "exact", head: true }).eq("lesson_id", lesson.id)
    const { error } = await db.from("lesson_attachments").insert({ lesson_id: lesson.id, file_path: path, file_name: fileName, file_size: size, mime_type: contentType || null, position: count ?? 0 })
    if (error) await refuse("The file could not be saved. Try again.", 500)
  }
}

/** Everything else the editor does. */
export async function applyAction(db: Db, o: Owner, action: string, body: Record<string, unknown>): Promise<void> {
  switch (action) {
    case "add-module": {
      const courseId = await ensureCourse(db, o)
      const { data: mods } = await db.from("course_modules").select("position").eq("course_id", courseId)
      const list = (mods ?? []) as Array<{ position: number | null }>
      if (list.length >= MAX_MODULES) throw new ManageError(`A course holds up to ${MAX_MODULES} modules.`)
      const { data: mod, error } = await db
        .from("course_modules")
        .insert({ ...newId(body.moduleId), course_id: courseId, title: title(body.title, `Module ${list.length + 1}`), position: list.reduce((m, r) => Math.max(m, (r.position ?? 0) + 1), 0) })
        .select("id")
        .single()
      if (error?.code === "23505") throw new ManageError("That module is already there. Reload and try again.", 409)
      if (error || !mod) throw new ManageError("The module could not be added. Try again.", 500)
      /* A new module comes with its first lesson, which is what the creator is about to add anyway. */
      if (body.withLesson !== false) {
        await db.from("course_lessons").insert({ ...newId(body.lessonId), module_id: (mod as { id: string }).id, title: title(body.lessonTitle, "Lesson 1"), position: 0 })
      }
      return
    }
    case "update-module": {
      const mod = await moduleOf(db, o, body.moduleId)
      const patch: Record<string, unknown> = {}
      if (body.title !== undefined) patch.title = title(body.title, "Module")
      if (body.coverUrl !== undefined) patch.cover_url = coverInput(body.coverUrl)
      /* Round AG: a price sells this module on its own, only in a community's own program (a course with no product). */
      if (body.priceCents !== undefined) {
        const { modulePriceInput } = await import("@/lib/communities/server/module-sales")
        const cents = modulePriceInput(body.priceCents)
        if (Number.isNaN(cents)) throw new ManageError("A module's price is $1 to $10,000, or none.")
        const { data: course } = await db.from("courses").select("product_id").eq("id", mod.course_id).maybeSingle()
        if ((course as { product_id: string | null } | null)?.product_id) throw new ManageError("Modules are sold on their own only in a community's programs.")
        patch.price_cents = cents
      }
      if (Object.keys(patch).length === 0) return
      const { error } = await db.from("course_modules").update(patch).eq("id", mod.id)
      if (error) throw new ManageError(error.code === "42703" ? (patch.price_cents !== undefined ? "Module prices need the latest database update (part 217)." : "Covers need the latest database update (part 200).") : "The module could not be saved. Try again.", error.code === "42703" ? 409 : 500)
      return
    }
    case "rename-module": {
      const mod = await moduleOf(db, o, body.moduleId)
      await db.from("course_modules").update({ title: title(body.title, "Module") }).eq("id", mod.id)
      return
    }
    case "delete-module": {
      const mod = await moduleOf(db, o, body.moduleId)
      const { data: lessons } = await db.from("course_lessons").select("*").eq("module_id", mod.id)
      for (const l of (lessons ?? []) as LessonRow[]) await removeFiles(db, o, l.id, await lessonFiles(db, l))
      await db.from("course_modules").delete().eq("id", mod.id)
      return
    }
    case "order-modules": {
      const courseId = await ensureCourse(db, o)
      const ids = Array.isArray(body.ids) ? body.ids.filter(isUuid) : []
      const { data: mods } = await db.from("course_modules").select("id").eq("course_id", courseId)
      const mine = new Set(((mods ?? []) as Array<{ id: string }>).map((m) => m.id))
      if (ids.length !== mine.size || !ids.every((id) => mine.has(id))) throw new ManageError("The order changed in another tab. Reload and try again.", 409)
      await Promise.all(ids.map((id, i) => db.from("course_modules").update({ position: i }).eq("id", id)))
      return
    }
    case "add-lesson": {
      const mod = await moduleOf(db, o, body.moduleId)
      const { data: lessons } = await db.from("course_lessons").select("position").eq("module_id", mod.id)
      const list = (lessons ?? []) as Array<{ position: number | null }>
      if (list.length >= MAX_LESSONS_PER_MODULE) throw new ManageError(`A module holds up to ${MAX_LESSONS_PER_MODULE} lessons.`)
      const { error } = await db
        .from("course_lessons")
        .insert({ ...newId(body.lessonId), module_id: mod.id, title: title(body.title, `Lesson ${list.length + 1}`), position: list.reduce((m, r) => Math.max(m, (r.position ?? 0) + 1), 0) })
      if (error?.code === "23505") throw new ManageError("That lesson is already there. Reload and try again.", 409)
      if (error) throw new ManageError("The lesson could not be added. Try again.", 500)
      return
    }
    case "update-lesson": {
      const lesson = await lessonOf(db, o, body.lessonId)
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.title !== undefined) patch.title = title(body.title, lesson.title)
      /* Notes written in the rich text editor are kept as HTML, through the same allow list as a description (lib/rich-text/html); plain text as it was. */
      if (body.notes !== undefined) patch.content_text = typeof body.notes === "string" ? (looksLikeHtml(body.notes) ? cleanStoredHtml(body.notes) : body.notes).slice(0, MAX_NOTES_CHARS) : null
      if (typeof body.isPreview === "boolean") patch.is_preview = body.isPreview
      if (body.durationSeconds !== undefined) {
        const n = Number(body.durationSeconds)
        patch.duration_seconds = Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 24 * 3600) : null
      }
      if (body.externalUrl !== undefined) {
        const raw = typeof body.externalUrl === "string" ? body.externalUrl.trim() : ""
        if (raw && !externalVideo(raw)) throw new ManageError("Paste a YouTube or Vimeo link.")
        patch.video_url = raw || null
      }
      if (body.coverUrl !== undefined) patch.cover_url = coverInput(body.coverUrl)
      const { error } = await db.from("course_lessons").update(patch).eq("id", lesson.id)
      if (error?.code === "42703") throw new ManageError("Covers need the latest database update (part 200).", 409)
      if (error) throw new ManageError("The lesson could not be saved. Try again.", 500)
      return
    }
    case "delete-lesson": {
      const lesson = await lessonOf(db, o, body.lessonId)
      await removeFiles(db, o, lesson.id, await lessonFiles(db, lesson))
      await db.from("course_lessons").delete().eq("id", lesson.id)
      return
    }
    case "order-lessons": {
      /* The lessons of one module, in their new order; a lesson from another module of the same course moves into it. */
      const mod = await moduleOf(db, o, body.moduleId)
      const ids = Array.isArray(body.ids) ? body.ids.filter(isUuid) : []
      if (ids.length === 0) return
      const { data: mods } = await db.from("course_modules").select("id").eq("course_id", mod.course_id)
      const moduleIds = ((mods ?? []) as Array<{ id: string }>).map((m) => m.id)
      const { data: lessons } = await db.from("course_lessons").select("id").in("module_id", moduleIds).in("id", ids)
      if (((lessons ?? []) as unknown[]).length !== ids.length) throw new ManageError("The order changed in another tab. Reload and try again.", 409)
      await Promise.all(ids.map((id, i) => db.from("course_lessons").update({ module_id: mod.id, position: i }).eq("id", id)))
      return
    }
    case "remove-video":
    case "remove-captions": {
      const lesson = await lessonOf(db, o, body.lessonId)
      const video = action === "remove-video"
      await db
        .from("course_lessons")
        .update(video ? { video_path: null, video_size: null, video_mime: null, video_name: null, duration_seconds: null } : { captions_path: null })
        .eq("id", lesson.id)
      await removeFiles(db, o, lesson.id, [video ? lesson.video_path : lesson.captions_path])
      return
    }
    case "remove-attachment": {
      if (!isUuid(body.attachmentId)) throw new ManageError("File not found", 404)
      const { data } = await db.from("lesson_attachments").select("*").eq("id", body.attachmentId).maybeSingle()
      if (!data) throw new ManageError("File not found", 404)
      const att = data as AttachmentRow
      const lesson = await lessonOf(db, o, att.lesson_id)
      await db.from("lesson_attachments").delete().eq("id", att.id)
      await removeFiles(db, o, lesson.id, [att.file_path])
      return
    }
    default:
      throw new ManageError("Bad request")
  }
}

/* The courses of this creator's communities' own programs (part 102). None before it, or with no communities. */
async function programCourseIds(db: Db, creatorId: string): Promise<string[]> {
  try {
    const { data: communities } = await db.from("communities").select("id").eq("creator_id", creatorId).limit(50)
    const ids = ((communities ?? []) as Array<{ id: string }>).map((c) => c.id)
    if (!ids.length) return []
    const { data, error } = await db.from("community_courses").select("course_id").in("community_id", ids).is("product_id", null).limit(1000)
    if (error) return []
    return ((data ?? []) as Array<{ course_id: string | null }>).map((r) => r.course_id).filter((id): id is string => !!id)
  } catch {
    return []
  }
}
