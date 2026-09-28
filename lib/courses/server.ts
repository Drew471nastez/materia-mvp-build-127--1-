import "server-only"

/**
 * ===========================================================================
 *  COURSES, READ AND KEPT BY THE SERVER
 * ===========================================================================
 * Everything here runs with the service role, which row level security does
 * not stop, so every entry point decides access first (./access.ts) from
 * rows it read itself, never from what the page sent.
 *
 * A buyer owns a course by an entitlement or a completed order, the same two
 * ways My Library counts a purchase (lib/library/get-library-downloads.ts),
 * so a course is never in the library and locked in the player. A refund
 * deletes the entitlement and marks the order refunded, so a refunded buyer
 * is no longer an owner.
 *
 * Tolerant of a database that has not run part 74 yet: whole rows are read
 * (`*`), so a missing column is simply absent, and the course enrollment
 * table being missing leaves "Continue" on the first unfinished lesson.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { STORAGE_BUCKET } from "@/lib/storage/plans"
import { isLessonMediaPath, lessonAccess, productLevel, type LessonAccess, type ProductLevel } from "./access"
import { externalVideo } from "./external"
import {
  progressMap,
  summarize,
  type CourseProgressSummary,
  type LessonKind,
  type LessonProgress,
  type OutlineLesson,
  type OutlineModule,
} from "./progress"

type Db = SupabaseClient

/** How long a lesson's video address works. The player asks for a new one before it runs out. */
export const VIDEO_URL_SECONDS = 60 * 60

/** A download or a caption file is fetched at once, so its address is short. */
export const FILE_URL_SECONDS = 5 * 60

export interface ProductRow {
  id: string
  title: string | null
  slug: string | null
  status: string | null
  type: string | null
  creator_id: string | null
  thumbnail_url: string | null
}

export interface LessonRow {
  id: string
  module_id: string
  title: string
  position: number | null
  content_text?: string | null
  video_url?: string | null
  video_path?: string | null
  video_size?: number | null
  video_mime?: string | null
  video_name?: string | null
  captions_path?: string | null
  is_preview?: boolean | null
  duration_seconds?: number | null
  created_at?: string | null
}

export interface ModuleRow {
  id: string
  course_id: string
  title: string
  position: number | null
  created_at?: string | null
}

export interface AttachmentRow {
  id: string
  lesson_id: string
  file_name: string
  file_path: string
  file_size?: number | null
  mime_type?: string | null
  position?: number | null
}

export interface CreatorCard {
  id: string
  userId: string | null
  name: string
  avatarUrl: string | null
  handle: string | null
}

const PRODUCT_COLUMNS = "id, title, slug, status, type, creator_id, thumbnail_url"

export function kindOf(lesson: Pick<LessonRow, "video_path" | "video_url">): LessonKind {
  if (lesson.video_path) return "video"
  if (externalVideo(lesson.video_url)) return "external"
  return "text"
}

function byPosition<T extends { position?: number | null; created_at?: string | null }>(a: T, b: T): number {
  return (a.position ?? 0) - (b.position ?? 0) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
}

export async function readProduct(db: Db, productId: string): Promise<ProductRow | null> {
  const { data } = await db.from("products").select(PRODUCT_COLUMNS).eq("id", productId).maybeSingle()
  return (data as ProductRow | null) ?? null
}

/** An entitlement, or a completed order: what My Library counts as bought. */
export async function ownsProduct(db: Db, userId: string, productId: string): Promise<boolean> {
  const [ent, ord] = await Promise.all([
    db.from("entitlements").select("id").eq("buyer_id", userId).eq("product_id", productId).limit(1),
    db.from("orders").select("id").eq("buyer_id", userId).eq("product_id", productId).eq("status", "completed").limit(1),
  ])
  return ((ent.data as unknown[] | null)?.length ?? 0) > 0 || ((ord.data as unknown[] | null)?.length ?? 0) > 0
}

export async function readCreatorCard(db: Db, creatorId: string | null): Promise<CreatorCard | null> {
  if (!creatorId) return null
  const { data: creator } = await db.from("creators").select("id, user_id, slug, display_name").eq("id", creatorId).maybeSingle()
  if (!creator) return null
  const c = creator as { id: string; user_id: string | null; slug: string | null; display_name: string | null }
  type Profile = { display_name?: string | null; username?: string | null; avatar_url?: string | null }
  let profile: Profile | null = null
  if (c.user_id) {
    const { data } = await db.from("profiles").select("display_name, username, avatar_url").eq("id", c.user_id).maybeSingle()
    profile = (data as Profile | null) ?? null
  }
  const name = (profile?.display_name || c.display_name || profile?.username || c.slug || "").trim() || "The creator"
  return { id: c.id, userId: c.user_id, name, avatarUrl: profile?.avatar_url || null, handle: c.slug || profile?.username || null }
}

/** Who this person is to this product. */
export async function productAccess(db: Db, userId: string | null, productId: string): Promise<{ level: ProductLevel; product: ProductRow | null; creatorUserId: string | null }> {
  const product = await readProduct(db, productId)
  if (!product) return { level: "none", product: null, creatorUserId: null }
  const [creatorRes, owns] = await Promise.all([
    product.creator_id ? db.from("creators").select("user_id").eq("id", product.creator_id).maybeSingle() : Promise.resolve({ data: null }),
    userId ? ownsProduct(db, userId, productId) : Promise.resolve(false),
  ])
  const creatorUserId = ((creatorRes as { data: { user_id?: string | null } | null }).data?.user_id as string | undefined) ?? null
  return { level: productLevel({ userId, creatorUserId, productStatus: product.status, owns }), product, creatorUserId }
}

export interface CourseTree {
  course: { id: string; product_id: string }
  modules: Array<ModuleRow & { lessons: LessonRow[] }>
}

/** The course of a product, its modules and their lessons, in order. Null when it has no course. */
export async function readCourseTree(db: Db, productId: string): Promise<CourseTree | null> {
  const { data: course } = await db.from("courses").select("id, product_id").eq("product_id", productId).maybeSingle()
  if (!course) return null
  const { data: modules } = await db.from("course_modules").select("*").eq("course_id", (course as { id: string }).id)
  const mods = ((modules ?? []) as ModuleRow[]).slice().sort(byPosition)
  const ids = mods.map((m) => m.id)
  const { data: lessons } = ids.length ? await db.from("course_lessons").select("*").in("module_id", ids) : { data: [] }
  const all = ((lessons ?? []) as LessonRow[]).slice().sort(byPosition)
  return {
    course: course as { id: string; product_id: string },
    modules: mods.map((m) => ({ ...m, lessons: all.filter((l) => l.module_id === m.id) })),
  }
}

export function outlineOf(tree: CourseTree | null): OutlineModule[] {
  return (tree?.modules ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map(
      (l): OutlineLesson => ({
        id: l.id,
        moduleId: m.id,
        title: l.title,
        durationSeconds: typeof l.duration_seconds === "number" && l.duration_seconds > 0 ? l.duration_seconds : null,
        isPreview: !!l.is_preview,
        kind: kindOf(l),
      }),
    ),
  }))
}

export async function readProgress(db: Db, userId: string, lessonIds: string[]): Promise<LessonProgress[]> {
  if (lessonIds.length === 0) return []
  const { data } = await db.from("course_progress").select("*").eq("buyer_id", userId).in("lesson_id", lessonIds)
  return ((data ?? []) as Array<Record<string, unknown>>).map(toProgress)
}

export function toProgress(r: Record<string, unknown>): LessonProgress {
  /* A row from before part 74 has `completed` and no completed_at on some old writes. */
  const completedAt = (r.completed_at as string | null) ?? (r.completed ? ((r.created_at as string | null) ?? new Date(0).toISOString()) : null)
  return {
    lessonId: String(r.lesson_id),
    completedAt: completedAt || null,
    positionSeconds: Number(r.last_position_seconds) || 0,
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds) || null,
    updatedAt: (r.updated_at as string | null) ?? (r.created_at as string | null) ?? null,
  }
}

export interface EnrollmentRow {
  id: string
  buyer_id: string
  course_id: string
  product_id: string
  last_lesson_id: string | null
  last_opened_at: string | null
  last_activity_at: string | null
  started_at?: string | null
  percent: number
  completed_at: string | null
  emails_off?: boolean | null
  last_nudge_at?: string | null
  nudges_sent?: number | null
  completion_emailed_at?: string | null
}

export async function readEnrollments(db: Db, userId: string, courseIds: string[]): Promise<EnrollmentRow[]> {
  if (courseIds.length === 0) return []
  const { data, error } = await db.from("course_enrollments").select("*").eq("buyer_id", userId).in("course_id", courseIds)
  if (error) return []
  return (data ?? []) as EnrollmentRow[]
}

/**
 * THE COURSE-LEVEL ROW, WORKED OUT AGAIN FROM THE LESSONS. Written after every
 * change to a buyer's progress: which lesson they were last in, when, how far
 * through, and when they finished. The emails read it (./emails.ts); the
 * pages count from the lessons themselves. Never throws: a missing table
 * (part 74 not run) leaves the progress itself saved.
 */
export async function syncEnrollment(
  db: Db,
  input: { userId: string; courseId: string; productId: string; outline: OutlineModule[]; lastLessonId?: string | null; activity: boolean; now?: Date },
): Promise<CourseProgressSummary> {
  const now = (input.now ?? new Date()).toISOString()
  const lessonIds = input.outline.flatMap((m) => m.lessons.map((l) => l.id))
  const summary = summarize(input.outline, progressMap(await readProgress(db, input.userId, lessonIds)))
  try {
    const { data: existing } = await db
      .from("course_enrollments")
      .select("id, completed_at")
      .eq("buyer_id", input.userId)
      .eq("course_id", input.courseId)
      .maybeSingle()
    const finished = summary.status === "completed"
    const row: Record<string, unknown> = {
      completed_lessons: summary.completed,
      total_lessons: summary.total,
      percent: summary.percent,
      last_opened_at: now,
      updated_at: now,
      /* Finished once stays finished at the time it happened; a lesson added later reopens it. */
      completed_at: finished ? ((existing as { completed_at?: string | null } | null)?.completed_at ?? now) : null,
    }
    if (input.lastLessonId) row.last_lesson_id = input.lastLessonId
    if (input.activity) row.last_activity_at = now
    if (existing) {
      await db.from("course_enrollments").update(row).eq("id", (existing as { id: string }).id)
    } else {
      await db
        .from("course_enrollments")
        .upsert({ buyer_id: input.userId, course_id: input.courseId, product_id: input.productId, started_at: now, last_activity_at: now, ...row }, { onConflict: "buyer_id,course_id" })
    }
  } catch {
    /* Before part 74: nothing to keep it in. */
  }
  return summary
}

/** Everything about one lesson that decides who may watch it. */
export interface LessonContext {
  lesson: LessonRow
  module: ModuleRow
  course: { id: string; product_id: string }
  product: ProductRow
  creatorId: string
  access: LessonAccess
  level: ProductLevel
}

export async function lessonContext(db: Db, userId: string | null, lessonId: string): Promise<LessonContext | null> {
  const { data: lesson } = await db.from("course_lessons").select("*").eq("id", lessonId).maybeSingle()
  if (!lesson) return null
  const l = lesson as LessonRow
  const { data: mod } = await db.from("course_modules").select("*").eq("id", l.module_id).maybeSingle()
  if (!mod) return null
  const m = mod as ModuleRow
  const { data: course } = await db.from("courses").select("id, product_id").eq("id", m.course_id).maybeSingle()
  if (!course) return null
  const c = course as { id: string; product_id: string }
  const { level, product } = await productAccess(db, userId, c.product_id)
  if (!product || !product.creator_id) return null
  return { lesson: l, module: m, course: c, product, creatorId: product.creator_id, level, access: lessonAccess(level, !!l.is_preview) }
}

/** A short lived address for a file of this creator's lesson, or null when the path is not theirs. */
export async function signLessonFile(
  db: Db,
  ctx: Pick<LessonContext, "creatorId" | "lesson">,
  path: string | null | undefined,
  seconds: number,
  download?: string,
): Promise<{ url: string; expiresAt: number } | null> {
  if (!isLessonMediaPath(path, ctx.creatorId, ctx.lesson.id)) return null
  const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUrl(path, seconds, download ? { download } : undefined)
  if (error || !data?.signedUrl) return null
  return { url: data.signedUrl, expiresAt: Date.now() + seconds * 1000 }
}
