/**
 * ===========================================================================
 *  WHO MAY WATCH A LESSON
 * ===========================================================================
 * The same rule the database keeps (supabase/sql/run-now/74_course_player.sql,
 * public.storelib_product_access and storelib_lesson_access), written once
 * more here because every lesson address is made by the server with the
 * service role, which row level security does not stop. Every route that
 * hands out a video, a caption file or a download asks this first.
 *
 *   creator   the product's own creator: every lesson, always
 *   owner     somebody who bought it (an entitlement, or a completed order):
 *             every lesson, even after the creator archived the product
 *   preview   anybody, a lesson the creator marked as a free preview, while
 *             the product is published
 *   none      everything else, including a refunded buyer
 *
 * Pure and browser safe.
 */

export type ProductLevel = "creator" | "owner" | "public" | "none"
export type LessonAccess = "creator" | "owner" | "preview" | "none"

export function productLevel(input: {
  userId: string | null | undefined
  creatorUserId: string | null | undefined
  productStatus: string | null | undefined
  owns: boolean
}): ProductLevel {
  if (input.userId && input.creatorUserId && input.userId === input.creatorUserId) return "creator"
  if (input.userId && input.owns) return "owner"
  if (input.productStatus === "published") return "public"
  return "none"
}

export function lessonAccess(level: ProductLevel, isPreview: boolean): LessonAccess {
  if (level === "creator" || level === "owner") return level
  if (level === "public" && isPreview) return "preview"
  return "none"
}

/** Progress is kept for the people the course belongs to, not for a visitor's preview. */
export function keepsProgress(access: LessonAccess): boolean {
  return access === "creator" || access === "owner"
}

/** The folder under the creator's own id that every course file lives in. */
export const COURSE_MEDIA_FOLDER = "course-media"

/** Where one lesson's files go: `<creator id>/course-media/<lesson id>/`. */
export function lessonMediaPrefix(creatorId: string, lessonId: string): string {
  return `${creatorId}/${COURSE_MEDIA_FOLDER}/${lessonId}/`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

/**
 * A stored path this creator's lesson may use: under their own id, in the
 * course folder, in this lesson's folder when one is given, nothing climbing
 * out. The server made the path, but a lesson row is also writable by the
 * creator's own session, so the path is checked again every time it is
 * signed: a lesson can never be pointed at another creator's paid file.
 */
export function isLessonMediaPath(path: unknown, creatorId: string, lessonId?: string): path is string {
  if (typeof path !== "string" || !path || path.length > 400) return false
  if (!isUuid(creatorId)) return false
  const parts = path.split("/")
  if (parts.some((p) => p === "" || p === "." || p === ".." || p.includes("\\"))) return false
  if (parts.length !== 4) return false
  if (parts[0] !== creatorId || parts[1] !== COURSE_MEDIA_FOLDER) return false
  if (!isUuid(parts[2])) return false
  if (lessonId && parts[2] !== lessonId) return false
  return /^[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,10}$/.test(parts[3])
}
