import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isUuid, keepsProgress } from "@/lib/courses/access"
import { shouldAutoComplete } from "@/lib/courses/progress"
import { PRIVATE, sessionUserId } from "@/lib/courses/route-auth"
import { lessonContext, outlineOf, readCourseTree, syncEnrollment, toProgress } from "@/lib/courses/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/courses/progress
 *   { lessonId, position?, duration?, complete?: true | false, opened?: true }
 *
 * One buyer's place in one lesson. The player sends it when a lesson opens,
 * every fifteen seconds while it plays, on pause, when the page is hidden
 * (as a beacon), and when a lesson is marked finished or not.
 *
 * Written by the server only (part 74 gives the browser no write on
 * course_progress), after the same check as the video: the course's buyer
 * or its creator. A preview visitor's place is not kept.
 *
 *   position   seconds into the video; past 90% of its length the lesson is
 *              finished, whatever the page thought (AUTO_COMPLETE_RATIO)
 *   complete   true marks it finished (the time it was first finished is
 *              kept), false marks it not finished
 *   opened     this is now the lesson they are in: "Continue" comes back here
 *
 * The answer is the course's numbers when they may have changed.
 */
export async function POST(request: Request) {
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "Sign in to keep your place." }, { status: 401, headers: PRIVATE })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: PRIVATE })
  }
  const lessonId = body.lessonId
  if (!isUuid(lessonId)) return NextResponse.json({ error: "Lesson not found" }, { status: 404, headers: PRIVATE })

  const position = seconds(body.position)
  const duration = seconds(body.duration)
  const asked = body.complete === true ? true : body.complete === false ? false : undefined
  const opened = body.opened === true

  try {
    const admin = createAdminClient()
    const ctx = await lessonContext(admin, userId, lessonId)
    if (!ctx || ctx.access === "none") return NextResponse.json({ error: "Lesson not found" }, { status: 404, headers: PRIVATE })
    if (!keepsProgress(ctx.access)) return NextResponse.json({ kept: false }, { headers: PRIVATE })

    const { data: existingRow } = await admin.from("course_progress").select("*").eq("buyer_id", userId).eq("lesson_id", lessonId).maybeSingle()
    const existing = existingRow ? toProgress(existingRow as Record<string, unknown>) : null
    const now = new Date().toISOString()
    const length = duration ?? existing?.durationSeconds ?? ctx.lesson.duration_seconds ?? null

    let complete = asked
    if (complete === undefined && !existing?.completedAt && position !== null && shouldAutoComplete(position, length)) complete = true

    const row: Record<string, unknown> = { course_id: ctx.course.id, updated_at: now }
    if (position !== null) row.last_position_seconds = position
    if (duration !== null) row.duration_seconds = duration
    if (complete === true && !existing?.completedAt) Object.assign(row, { completed: true, completed_at: now })
    if (complete === false) Object.assign(row, { completed: false, completed_at: null })

    const write = existingRow
      ? await admin.from("course_progress").update(row).eq("id", (existingRow as { id: string }).id)
      : await admin.from("course_progress").insert({ buyer_id: userId, lesson_id: lessonId, ...row })
    if (write.error) {
      console.error("[courses/progress] write failed:", write.error.code || "unknown")
      return NextResponse.json({ error: "Your place was not saved. It will try again." }, { status: 500, headers: PRIVATE })
    }

    /* The video's real length, the first time anybody plays it, for the curriculum's times. */
    if (duration !== null && duration >= 1 && !ctx.lesson.duration_seconds && ctx.lesson.video_path) {
      await admin.from("course_lessons").update({ duration_seconds: Math.round(duration) }).eq("id", lessonId).is("duration_seconds", null)
    }

    const changed = opened || complete !== undefined
    if (ctx.access !== "owner") return NextResponse.json({ kept: true, completedAt: complete === true ? (existing?.completedAt ?? now) : complete === false ? null : (existing?.completedAt ?? null) }, { headers: PRIVATE })
    if (!changed) {
      /* Watching is activity: it holds back the "continue" email. One small update, not a recount. */
      await admin.from("course_enrollments").update({ last_activity_at: now, last_lesson_id: lessonId }).eq("buyer_id", userId).eq("course_id", ctx.course.id)
      return NextResponse.json({ kept: true }, { headers: PRIVATE })
    }
    const tree = await readCourseTree(admin, ctx.product.id)
    const summary = await syncEnrollment(admin, { userId, courseId: ctx.course.id, productId: ctx.product.id, outline: outlineOf(tree), lastLessonId: lessonId, activity: true })
    return NextResponse.json(
      { kept: true, completedAt: complete === true ? (existing?.completedAt ?? now) : complete === false ? null : (existing?.completedAt ?? null), summary },
      { headers: PRIVATE },
    )
  } catch (error) {
    console.error("[courses/progress] failed:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Your place was not saved. It will try again." }, { status: 500, headers: PRIVATE })
  }
}

/** Seconds as the page sent them, inside a day, or null. */
function seconds(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number.NaN
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, 24 * 60 * 60)
}
