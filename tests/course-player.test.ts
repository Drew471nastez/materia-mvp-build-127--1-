/**
 * COURSES: WHO MAY WATCH, HOW FAR THROUGH, AND WHEN AN EMAIL GOES
 *
 * The owner asked for courses that play well, keep each buyer's place, show
 * progress, email a calm reminder from the creator, and never hand a lesson
 * to somebody who did not buy it. This drives the pure rules behind that
 * (lib/courses/*) and reads the routes and the SQL part for the checks that
 * must sit in front of every signed address.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isLessonMediaPath, keepsProgress, lessonAccess, lessonMediaPrefix, productLevel } from "../lib/courses/access"
import { toWebVtt, looksLikeCaptions, isCaptionName } from "../lib/courses/captions"
import { externalVideo } from "../lib/courses/external"
import { courseEmail, finishedDue, reminderDue, type EnrollmentState } from "../lib/courses/nudge"
import { bufferedEnd, clampTime, refreshDelay, REFRESH_BEFORE_MS, stepSpeed, swapNow } from "../lib/courses/playback"
import {
  lengthInWords,
  lessonNumber,
  nextLesson,
  percentOf,
  progressMap,
  resumeAt,
  resumeLesson,
  shouldAutoComplete,
  summarize,
  type LessonProgress,
  type OutlineModule,
} from "../lib/courses/progress"
import { automationEmail } from "../lib/email-automation"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n          ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const L = (id: string, moduleId: string, extra: Partial<OutlineModule["lessons"][number]> = {}) => ({ id, moduleId, title: `Lesson ${id}`, durationSeconds: 600, isPreview: false, kind: "video" as const, ...extra })
const course: OutlineModule[] = [
  { id: "m1", title: "Start", lessons: [L("a", "m1", { isPreview: true }), L("b", "m1"), L("c", "m1")] },
  { id: "m2", title: "Then", lessons: [L("d", "m2"), L("e", "m2", { durationSeconds: null })] },
]
const P = (lessonId: string, done: boolean, at = 0): LessonProgress => ({ lessonId, completedAt: done ? "2026-09-01T00:00:00Z" : null, positionSeconds: at, durationSeconds: 600, updatedAt: null })

console.log("\nProgress math")
{
  check("nothing done is 0% and not started", summarize(course, progressMap([])).percent === 0 && summarize(course, progressMap([])).status === "not_started")
  const two = summarize(course, progressMap([P("a", true), P("b", true)]))
  check("2 of 5 is 40%", two.percent === 40 && two.completed === 2 && two.total === 5 && two.status === "in_progress", two)
  check("all done is 100% and completed", summarize(course, progressMap(["a", "b", "c", "d", "e"].map((id) => P(id, true)))).status === "completed")
  check("199 of 200 reads 99, never a false 100", percentOf(199, 200) === 99)
  check("1 of 200 reads 1, not 0", percentOf(1, 200) === 1)
  check("a place in a lesson with none finished is in progress", summarize(course, progressMap([P("a", false, 42)])).status === "in_progress")
  check("progress of a deleted lesson is not counted", summarize(course, progressMap([P("gone", true), P("a", true)])).completed === 1)
  check("the length counts known durations", summarize(course, progressMap([])).totalSeconds === 2400 && lengthInWords(2400) === "40 min" && lengthInWords(7800) === "2 h 10 min")

  /* Two courses at once, from two creators: each counted from its own lessons only. */
  const other: OutlineModule[] = [{ id: "x1", title: "Other", lessons: [L("p", "x1"), L("q", "x1")] }]
  const both = progressMap([P("a", true), P("p", true), P("q", true)])
  check("two courses open at once never mix", summarize(course, both).percent === 20 && summarize(other, both).percent === 100)
}

console.log("\nContinue goes to the right lesson")
{
  check("unfinished last lesson: back to it", resumeLesson(course, progressMap([P("a", true), P("b", false, 90)]), "b")?.id === "b")
  check("finished last lesson: the next unfinished after it", resumeLesson(course, progressMap([P("a", true), P("b", true)]), "b")?.id === "c")
  check("skipped ahead and finished the end: the first unfinished anywhere", resumeLesson(course, progressMap(["c", "d", "e"].map((id) => P(id, true))), "e")?.id === "a")
  check("never opened: the first lesson", resumeLesson(course, progressMap([]), null)?.id === "a")
  check("all done: the first lesson again", resumeLesson(course, progressMap(["a", "b", "c", "d", "e"].map((id) => P(id, true))), "c")?.id === "a")
  check("next crosses into the next module", nextLesson(course, "c")?.id === "d" && nextLesson(course, "e") === null)
  check("lesson numbers run through the course", lessonNumber(course, "d") === 4)
  check("resumes at the saved second", resumeAt(P("b", false, 125.7), 600) === 125)
  check("but from the top near either end", resumeAt(P("b", false, 3), 600) === 0 && resumeAt(P("b", false, 598), 600) === 0)
  check("90% watched finishes a lesson, 89% does not", shouldAutoComplete(540, 600) && !shouldAutoComplete(534, 600) && !shouldAutoComplete(10, 0))
}

console.log("\nWho may watch")
{
  const buyer = productLevel({ userId: "u1", creatorUserId: "c1", productStatus: "archived", owns: true })
  check("a buyer of an archived course still owns it", buyer === "owner" && lessonAccess(buyer, false) === "owner")
  const visitor = productLevel({ userId: null, creatorUserId: "c1", productStatus: "published", owns: false })
  check("a visitor may watch a free preview of a published course", lessonAccess(visitor, true) === "preview")
  check("a visitor may not watch a paid lesson", lessonAccess(visitor, false) === "none")
  const refunded = productLevel({ userId: "u2", creatorUserId: "c1", productStatus: "published", owns: false })
  check("a refunded buyer is a visitor again", refunded === "public" && lessonAccess(refunded, false) === "none")
  check("nobody may preview an unpublished course", lessonAccess(productLevel({ userId: "u3", creatorUserId: "c1", productStatus: "draft", owns: false }), true) === "none")
  check("the creator watches everything", lessonAccess(productLevel({ userId: "c1", creatorUserId: "c1", productStatus: "draft", owns: false }), false) === "creator")
  check("a preview's place is not kept", !keepsProgress("preview") && keepsProgress("owner") && keepsProgress("creator"))

  const creator = "0b7c5a52-9f59-4f7a-9d63-6a6f1d0f5c11"
  const lesson = "5f1f8a1e-4b8e-4c55-9b3b-2d6e0c1a9f22"
  const good = `${lessonMediaPrefix(creator, lesson)}1727500000000-abc123.mp4`
  check("a path in the creator's own lesson folder is theirs", isLessonMediaPath(good, creator, lesson))
  check("another creator's file is not", !isLessonMediaPath(good.replace(creator, "6c0d7e7b-1111-4222-8333-944455556666"), creator, lesson))
  check("a product file of theirs is not a lesson file", !isLessonMediaPath(`${creator}/digital-products/1-a.pdf`, creator))
  check("nothing climbs out", !isLessonMediaPath(`${creator}/course-media/${lesson}/../x.mp4`, creator) && !isLessonMediaPath(`${creator}/course-media/../../x/y.mp4`, creator))
  check("another lesson's file is not this lesson's", !isLessonMediaPath(good, creator, "7a7a7a7a-1111-4222-8333-944455556666"))
}

console.log("\nLinks, captions and the player's arithmetic")
{
  check("a YouTube watch link embeds without cookies", externalVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42")?.embedUrl.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?") === true)
  check("youtu.be and shorts too", externalVideo("https://youtu.be/dQw4w9WgXcQ")?.id === "dQw4w9WgXcQ" && externalVideo("https://youtube.com/shorts/dQw4w9WgXcQ")?.id === "dQw4w9WgXcQ")
  check("an unlisted Vimeo keeps its key", externalVideo("https://vimeo.com/123456789/abcdef1234")?.embedUrl === "https://player.vimeo.com/video/123456789?dnt=1&playsinline=1&h=abcdef1234")
  check("anything else is not a video", externalVideo("https://example.com/v.mp4") === null && externalVideo("javascript:alert(1)") === null)
  check("SubRip becomes WebVTT", toWebVtt("1\n00:00:01,000 --> 00:00:02,500\nHi") === "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nHi\n")
  check("WebVTT is left alone", toWebVtt("WEBVTT\n\nx") === "WEBVTT\n\nx")
  check("caption names and contents are recognised", isCaptionName("a.SRT") && !isCaptionName("a.txt") && looksLikeCaptions("1\n00:00:01,000 --> 00:00:02,000\nx") && !looksLikeCaptions("%PDF-1.7"))
  check("speed steps stay between 0.75x and 2x", stepSpeed(2, 1) === 2 && stepSpeed(0.75, -1) === 0.75 && stepSpeed(1, 1) === 1.25)
  check("a skip never passes either end", clampTime(-4, 100) === 0 && clampTime(140, 100) === 100)
  check("the buffered bar follows the range the playhead is in", bufferedEnd([[0, 30], [60, 90]], 70) === 90 && bufferedEnd([[0, 30]], 45) === 45)
  const now = 1_000_000
  check("a new address is asked for five minutes before the old ends", refreshDelay(now + 3_600_000, now) === 3_600_000 - REFRESH_BEFORE_MS)
  check("it waits while the video plays on a good address", !swapNow({ hasFresh: true, paused: false, failed: false, expiresAt: now + 600_000, now }))
  check("it goes in while paused, near the end, or after a failure", swapNow({ hasFresh: true, paused: true, failed: false, expiresAt: now + 600_000, now }) && swapNow({ hasFresh: true, paused: false, failed: false, expiresAt: now + 30_000, now }) && swapNow({ hasFresh: true, paused: false, failed: true, expiresAt: now + 600_000, now }))
}

console.log("\nWhen a course email goes")
{
  const day = 86_400_000
  const now = new Date("2026-09-28T12:00:00Z")
  const ago = (d: number) => new Date(now.getTime() - d * day).toISOString()
  const base: EnrollmentState = { percent: 40, completedAt: null, lastActivityAt: ago(4), lastNudgeAt: null, completionEmailedAt: null, emailsOff: false }
  check("quiet for four days, 40% through: a reminder", reminderDue(base, now))
  check("quiet for two days: not yet", !reminderDue({ ...base, lastActivityAt: ago(2) }, now))
  check("not started at all: nothing", !reminderDue({ ...base, percent: 0 }, now))
  check("finished: never a reminder", !reminderDue({ ...base, percent: 100, completedAt: ago(1) }, now))
  check("turned off: nothing", !reminderDue({ ...base, emailsOff: true }, now))
  check("already reminded this quiet spell: nothing more", !reminderDue({ ...base, lastActivityAt: ago(20), lastNudgeAt: ago(10) }, now))
  check("came back and went quiet again, a week after the last: one more", reminderDue({ ...base, lastActivityAt: ago(4), lastNudgeAt: ago(9) }, now))
  check("came back, but the last reminder was under a week ago: wait", !reminderDue({ ...base, lastActivityAt: ago(3.5), lastNudgeAt: ago(5) }, now))
  const done: EnrollmentState = { ...base, percent: 100, completedAt: ago(1) }
  check("finished yesterday: the finished email", finishedDue(done, now))
  check("finished email goes once", !finishedDue({ ...done, completionEmailedAt: ago(0.5) }, now))
  check("finished months ago: no late congratulations", !finishedDue({ ...done, completedAt: ago(40) }, now))

  const input = {
    kind: "reminder" as const,
    courseTitle: "Watercolour <basics>",
    creatorName: "Ana Ruiz",
    buyerFirstName: "Sam",
    percent: 40,
    completed: 4,
    total: 10,
    next: { number: 5, title: "Wet on wet" },
    continueUrl: "https://storelib.com/library/courses/p1?lesson=l5",
    stopUrl: "https://storelib.com/api/courses/reminders?e=x&s=y",
    storeUrl: "https://storelib.com/ana",
  }
  const r = courseEmail(input)
  check("the reminder says how far and what is next", r.subject === "You're 40% through Watercolour <basics>" && r.body.includes("Next up is Lesson 5: Wet on wet."), r.subject)
  check("the course title is escaped in the body", r.body.includes("Watercolour &lt;basics&gt;"))
  const f = courseEmail({ ...input, kind: "finished" })
  check("the finished email says so, and points at more from the creator", f.subject === "You finished Watercolour <basics>" && f.body.includes("https://storelib.com/ana"))
  const mail = automationEmail({ body: r.body, subject: r.subject, fromName: "Ana Ruiz", unsubscribeToken: "tok123", avatarUrl: "https://example.supabase.co/storage/v1/object/public/avatars/a.png", because: "customer" })
  check("drawn in the creator's layout, with a real button", /<table role="presentation"[^>]*>.*Continue: Lesson 5/s.test(mail.html))
  check("the creator's unsubscribe is in the email and its headers", mail.html.includes("tok123") && !!mail.headers?.["List-Unsubscribe"])
  check("and the one-course stop link", mail.html.includes("/api/courses/reminders?e=x&amp;s=y") || mail.html.includes("/api/courses/reminders?e=x&s=y"))
  for (const [name, text] of [["reminder", r.subject + r.body + r.previewText], ["finished", f.subject + f.body + f.previewText]] as const) {
    check(`the ${name} email has no em dash and none of the banned words`, !/—|unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(text))
  }
}

console.log("\nEvery lesson address is decided on the server")
{
  const play = read("app/api/courses/lessons/[id]/play/route.ts")
  check("play: access decided before anything is signed", play.indexOf('ctx.access === "none"') > 0 && play.indexOf('ctx.access === "none"') < play.indexOf("signLessonFile("))
  check("play: the answer is the signed address, never the storage path", /url: signed\.url/.test(play) && !/[a-z]+: ctx\.lesson\.(video_path|captions_path)\s*[,}\n]/.test(play))
  const att = read("app/api/courses/attachments/[id]/route.ts")
  check("downloads: the creator and buyers only, never a preview visitor", /ctx\.access !== "creator" && ctx\.access !== "owner"/.test(att))
  const progress = read("app/api/courses/progress/route.ts")
  check("progress: kept for owners and the creator only", /if \(!keepsProgress\(ctx\.access\)\)/.test(progress))
  const server = read("lib/courses/server.ts")
  check("signing checks the path is the creator's own lesson file", /if \(!isLessonMediaPath\(path, ctx\.creatorId, ctx\.lesson\.id\)\) return null/.test(server))
  check("ownership is an entitlement or a completed order", /from\("entitlements"\)/.test(server) && /\.eq\("status", "completed"\)/.test(server))

  const sql = read("supabase/sql/run-now/74_course_player.sql")
  check("part 74: no browser writes to progress or enrollments", !/CREATE POLICY [a-z_]+ ON public\.course_progress FOR (INSERT|UPDATE|ALL)/.test(sql) && /REVOKE INSERT, UPDATE, DELETE ON public\.lesson_attachments, public\.course_progress, public\.course_enrollments FROM anon, authenticated;/.test(sql))
  check("part 74: a visitor reads only preview lessons of a published course", /is_preview AND public\.storelib_module_access\(module_id\) = 'public'/.test(sql))
  check("part 74: the video columns are the server's", /storelib_keep_server_columns\('video_path', 'video_size', 'video_mime', 'video_name', 'captions_path'\)/.test(sql))
  check("part 74: one statement per line", sql.split("\n").slice(1).every((l) => !l.trim() || l.trim().endsWith(";")))
  check("part 74 has its byte-identical migration", read("supabase/migrations/20261019_course_player.sql") === sql)
  check("the check after has a column for it", /as p74_course_player/.test(read("supabase/sql/run-now/99_check_after.sql")))

  const cron = read("app/api/cron/process-scheduled-emails/route.ts")
  check("course emails ride the hourly creator email cron, no new cron", /await runCourseEmails\(supabaseAdmin,/.test(cron) && !/course/.test(read("vercel.json")))
  const emails = read("lib/courses/emails.ts")
  check("each email is claimed before it is sent", emails.indexOf("await claim(db, kind, row, now)") > 0 && emails.indexOf("await claim(db, kind, row, now)") < emails.indexOf("await sendEmail("))
  check("an unsubscribed buyer is skipped", /if \(standing\.suppressed\) return "skipped"/.test(emails))
  check("the creator is never reminded about their own course", /=== row\.buyer_id\) return "skipped"/.test(emails))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
