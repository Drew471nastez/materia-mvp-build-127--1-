import "server-only"

/**
 * ===========================================================================
 *  THE TWO COURSE PAGES' DATA
 * ===========================================================================
 * /library/courses/[id] (the player) and /library/courses (every course the
 * buyer owns, from every creator). Both read with the service role after
 * deciding, from the buyer's own id, what they own (./server.ts), so a course
 * the creator has since archived still plays for the people who paid for it.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getProductInternalPath, getStoreInternalPath } from "@/lib/url-helpers"
import { isUuid, lessonAccess, type ProductLevel } from "./access"
import { lessonNumber, progressMap, resumeLesson, summarize } from "./progress"
import {
  outlineOf,
  productAccess,
  readCourseTree,
  readCreatorCard,
  readEnrollments,
  readProgress,
  toProgress,
  type AttachmentRow,
  type CourseTree,
  type EnrollmentRow,
  type LessonRow,
  type ModuleRow,
  type ProductRow,
} from "./server"
import type { MyCourse, PlayerData, PlayerModule } from "./types"

type Db = SupabaseClient

function storeHref(handle: string | null): string | null {
  return handle ? getStoreInternalPath(handle) : null
}

export type PlayerLoad =
  | { state: "ok"; data: PlayerData }
  | { state: "not-found" }
  /** Not theirs and nothing in it is a free preview: the product page is where to go. */
  | { state: "locked"; productHref: string | null }

export async function loadCoursePlayer(db: Db, userId: string | null, productId: string, askedLessonId?: string | null): Promise<PlayerLoad> {
  if (!isUuid(productId)) return { state: "not-found" }
  const { level, product } = await productAccess(db, userId, productId)
  if (!product || product.type !== "course" || level === "none") return { state: "not-found" }
  const [tree, creator] = await Promise.all([readCourseTree(db, productId), readCreatorCard(db, product.creator_id)])
  const productHref = product.slug ? getProductInternalPath(product.slug, creator?.handle ?? undefined) : null
  if (!tree) return level === "public" ? { state: "locked", productHref } : { state: "not-found" }

  const outline = outlineOf(tree)
  const hasPreview = outline.some((m) => m.lessons.some((l) => l.isPreview))
  if (level === "public" && !hasPreview) return { state: "locked", productHref }

  return {
    state: "ok",
    data: await playerFromTree(db, {
      userId,
      tree,
      level,
      askedLessonId,
      meta: {
        productId: product.id,
        title: product.title || "Course",
        thumbnailUrl: product.thumbnail_url,
        productHref,
        creator: { name: creator?.name ?? "The creator", avatarUrl: creator?.avatarUrl ?? null, storeHref: storeHref(creator?.handle ?? null) },
      },
    }),
  }
}

/**
 * THE PLAYER'S DATA FROM A COURSE'S TREE, once who is asking has been
 * decided: the lessons (a lesson a preview visitor may not open has no
 * notes and no files), their files, the person's own progress and where
 * they left off. The library's course page and a community's program
 * (lib/communities/server/learn.ts, a program has no product) both end here.
 */
export async function playerFromTree(
  db: Db,
  input: {
    userId: string | null
    tree: CourseTree
    level: ProductLevel
    askedLessonId?: string | null
    meta: Pick<PlayerData, "productId" | "title" | "thumbnailUrl" | "productHref" | "creator"> & { contact?: boolean }
  },
): Promise<PlayerData> {
  const { userId, tree, level, askedLessonId, meta } = input
  const outline = outlineOf(tree)
  const lessonIds = outline.flatMap((m) => m.lessons.map((l) => l.id))
  const owner = level === "creator" || level === "owner"
  const [attachments, progress, enrollment] = await Promise.all([
    readAttachments(db, lessonIds),
    owner && userId ? readProgress(db, userId, lessonIds) : Promise.resolve([]),
    owner && userId ? readEnrollments(db, userId, [tree.course.id]).then((r) => r[0] ?? null) : Promise.resolve(null),
  ])

  const rowOf = new Map(tree.modules.flatMap((m) => m.lessons).map((l) => [l.id, l] as const))
  const modules: PlayerModule[] = outline.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((l) => {
      const row = rowOf.get(l.id) as LessonRow
      const locked = lessonAccess(level, l.isPreview) === "none"
      return {
        ...l,
        locked,
        notes: locked ? null : (row.content_text ?? null),
        hasCaptions: !locked && !!row.captions_path,
        attachments: locked
          ? []
          : attachments.filter((a) => a.lesson_id === l.id).map((a) => ({ id: a.id, name: a.file_name, size: a.file_size ?? null })),
      }
    }),
  }))

  const map = progressMap(progress)
  const all = modules.flatMap((m) => m.lessons)
  const asked = askedLessonId ? all.find((l) => l.id === askedLessonId && !l.locked) : undefined
  const resume = owner ? resumeLesson(outline, map, enrollment?.last_lesson_id) : null
  const initial = asked ?? (resume ? all.find((l) => l.id === resume.id) : undefined) ?? all.find((l) => !l.locked) ?? null

  return {
    productId: meta.productId,
    courseId: tree.course.id,
    title: meta.title,
    thumbnailUrl: meta.thumbnailUrl,
    productHref: meta.productHref,
    creator: meta.creator,
    modules,
    progress,
    initialLessonId: initial?.id ?? null,
    access: level === "creator" ? "creator" : level === "owner" ? "owner" : "preview",
    emailsOff: !!enrollment?.emails_off,
    ...(meta.contact === false ? { contact: false } : {}),
  }
}

async function readAttachments(db: Db, lessonIds: string[]): Promise<AttachmentRow[]> {
  if (lessonIds.length === 0) return []
  const { data, error } = await db.from("lesson_attachments").select("*").in("lesson_id", lessonIds)
  if (error) return []
  return ((data ?? []) as AttachmentRow[]).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.file_name.localeCompare(b.file_name))
}

/**
 * EVERY COURSE THIS BUYER OWNS, FROM EVERY CREATOR. Newest activity first.
 * A handful of reads whatever the number of courses: the purchases, the
 * products, the courses, their modules, their lessons, the buyer's progress
 * and course rows, the creators. Each course's numbers come from its own
 * lessons and the buyer's own rows for them, so two courses never mix.
 */
export async function loadMyCourses(db: Db, userId: string): Promise<MyCourse[]> {
  const [ent, ord] = await Promise.all([
    db.from("entitlements").select("product_id, created_at").eq("buyer_id", userId),
    db.from("orders").select("product_id, created_at").eq("buyer_id", userId).eq("status", "completed"),
  ])
  const bought = new Map<string, string | null>()
  for (const r of [...((ent.data ?? []) as Array<{ product_id: string | null; created_at: string | null }>), ...((ord.data ?? []) as Array<{ product_id: string | null; created_at: string | null }>)]) {
    if (!r.product_id) continue
    const was = bought.get(r.product_id)
    if (was === undefined || (r.created_at && (!was || r.created_at < was))) bought.set(r.product_id, r.created_at ?? null)
  }
  if (bought.size === 0) return []

  const { data: productRows } = await db.from("products").select("id, title, slug, status, type, creator_id, thumbnail_url").in("id", [...bought.keys()]).eq("type", "course")
  const products = (productRows ?? []) as ProductRow[]
  if (products.length === 0) return []

  const { data: courseRows } = await db.from("courses").select("id, product_id").in("product_id", products.map((p) => p.id))
  const courses = (courseRows ?? []) as Array<{ id: string; product_id: string }>
  const courseIds = courses.map((c) => c.id)
  const { data: moduleRows } = courseIds.length ? await db.from("course_modules").select("*").in("course_id", courseIds) : { data: [] }
  const modules = (moduleRows ?? []) as ModuleRow[]
  const { data: lessonRows } = modules.length ? await db.from("course_lessons").select("*").in("module_id", modules.map((m) => m.id)) : { data: [] }
  const lessons = (lessonRows ?? []) as LessonRow[]
  const lessonIds = lessons.map((l) => l.id)

  const creatorIds = [...new Set(products.map((p) => p.creator_id).filter((id): id is string => !!id))]
  const [progressRes, enrollments, creators] = await Promise.all([
    lessonIds.length ? db.from("course_progress").select("*").eq("buyer_id", userId).in("lesson_id", lessonIds) : Promise.resolve({ data: [] }),
    readEnrollments(db, userId, courseIds),
    Promise.all(creatorIds.map((id) => readCreatorCard(db, id))),
  ])
  const progress = progressMap(((progressRes as { data: unknown[] | null }).data ?? []).map((r) => toProgress(r as Record<string, unknown>)))
  const creatorOf = new Map(creators.filter((c): c is NonNullable<typeof c> => !!c).map((c) => [c.id, c]))
  const enrollmentOf = new Map<string, EnrollmentRow>(enrollments.map((e) => [e.course_id, e]))

  const list: MyCourse[] = products.map((p) => {
    const course = courses.find((c) => c.product_id === p.id)
    const tree: CourseTree | null = course
      ? {
          course,
          modules: modules
            .filter((m) => m.course_id === course.id)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((m) => ({ ...m, lessons: lessons.filter((l) => l.module_id === m.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) })),
        }
      : null
    const outline = outlineOf(tree)
    const summary = summarize(outline, progress)
    const enrollment = course ? enrollmentOf.get(course.id) : undefined
    const next = resumeLesson(outline, progress, enrollment?.last_lesson_id)
    const creator = p.creator_id ? creatorOf.get(p.creator_id) : undefined
    return {
      productId: p.id,
      title: p.title || "Course",
      thumbnailUrl: p.thumbnail_url,
      creator: { id: p.creator_id ?? "", name: creator?.name ?? "The creator", avatarUrl: creator?.avatarUrl ?? null, storeHref: storeHref(creator?.handle ?? null) },
      total: summary.total,
      completed: summary.completed,
      percent: summary.percent,
      status: summary.status,
      totalSeconds: summary.totalSeconds,
      lastOpenedAt: enrollment?.last_opened_at ?? null,
      purchasedAt: bought.get(p.id) ?? null,
      resume: next ? { lessonId: next.id, title: next.title, number: lessonNumber(outline, next.id) } : null,
    }
  })
  return list.sort((a, b) => String(b.lastOpenedAt ?? b.purchasedAt ?? "").localeCompare(String(a.lastOpenedAt ?? a.purchasedAt ?? "")))
}
