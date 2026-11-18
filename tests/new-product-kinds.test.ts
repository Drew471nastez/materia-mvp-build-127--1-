/**
 * WHAT ARE YOU SELLING? THE QUESTION BEFORE A NEW PRODUCT, AND A COURSE END TO END
 *
 * The owner asked: "Add some questions before starting to add a new
 * product: is it a membership, a digital product, or a video course, in
 * /app. Implement it fully so that it can be taken and built there." And
 * for courses, whatever was still missing to build and sell one.
 *
 * This drives the pure parts (the kinds and their addresses, a course's
 * own default lines, the curriculum's counts, the upload's sentences) and
 * reads the pages for the wiring: every New product in /app asks first,
 * each answer opens the right editor, and a free preview plays through the
 * same guarded route buyers use.
 *
 * CHANGED ON PURPOSE (round 5): the owner said memberships are communities,
 * so Membership is no longer an answer. While communities are switched on
 * the last answer is Paid community, which opens /app/community/new; with
 * them off there is no such answer at all. tests/memberships-folded.test.ts
 * holds the rest of that change. scripts/check-new-product.mjs measures the chooser at 390 and
 * 1280 and drives it by keyboard.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { KIND_OPTIONS, NEW_COMMUNITY_HREF, NEW_PRODUCT_HREF, editorHref, kindFromParam, kindHref, kindOptions } from "../app/(storelib)/app/products/new/product-kinds"
import { COURSE_FAQS, COURSE_WHATS_INCLUDED, DEFAULT_FAQS, DEFAULT_WHATS_INCLUDED, initialForm, snapshotOfForm, swapDefaults } from "../app/(storelib)/app/products/new/editor-form"
import { countLine, courseSeconds, lengthLabel, lessonClock, lessonsIn, previewLessons, secondsIn } from "../lib/courses/outline"
import { PUT_RETRY_DELAYS_MS, putFailure } from "../lib/courses/upload-client"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => stripComments(read(p))

console.log("\nThe kinds and where each opens")
check("two answers always, in the order asked: a digital product, a video course; no membership", KIND_OPTIONS.map((o) => o.kind).join(",") === "digital,course")
check("the physical switch adds its answer at the end", kindOptions(false).map((o) => o.kind).join() === "digital,course" && kindOptions(true).map((o) => o.kind).join() === "digital,course,physical")
check("no switch offers a membership or a paid community (communities are made on the Community page)", [false, true].every((a) => !kindOptions(a).some((o) => /membership|community/i.test(`${o.kind} ${o.title} ${o.line}`))))
check("each says what the buyer gets in one short line", kindOptions(true).every((o) => o.line.length > 20 && o.line.length < 80) && /templates, presets, sample packs, ebooks/.test(KIND_OPTIONS[0].line) && /player/.test(KIND_OPTIONS[1].line))
check("a digital product and a course open the product editor at an address of their own", editorHref("digital") === "/app/products/new?type=digital" && editorHref("course") === "/app/products/new?type=course" && NEW_PRODUCT_HREF === "/app/products/new")
check("an old ?type=community link still opens the community setup", kindHref("community") === "/app/community/new" && NEW_COMMUNITY_HREF === "/app/community/new" && kindHref("course") === editorHref("course"))
check("?type= is read strictly: anything else, the old membership included, is no answer yet", kindFromParam("course") === "course" && kindFromParam("community") === "community" && kindFromParam("membership") === null && kindFromParam("Course") === null && kindFromParam(undefined) === null && kindFromParam(["course"]) === null)

console.log("\nThe new product page")
{
  const page = code("app/(storelib)/app/products/new/page.tsx")
  check("no kind: the question as a page, before anything else is read", /if \(!kind\) return ask\(\)/.test(page) && /const ask = \(\) => <NewProductKindPage \/>/.test(page) && page.indexOf("<NewProductKindPage") < page.indexOf("loadProductEditor(null)"))
  check("?type=community goes to the community setup only while the switch is on, otherwise the question", /if \(kind === "community"\) \{\s*if \(await communitiesEnabled\(\)\.catch\(\(\) => false\)\) redirect\(NEW_COMMUNITY_HREF\)\s*return ask\(\)/.test(page))
  check("nothing about a membership is made by opening an address", !/api\/app\/memberships|createMembershipProduct/.test(page))
  check("a kind opens the editor as that kind on its first frame", /<ProductEditor key=\{kind\} creator=\{load\.creator\} loaded=\{null\} startAs=\{kind\} \/>/.test(page))
  check("the old ?edit= address still goes to the product", /if \(edit\) redirect\(`\/app\/products\/\$\{encodeURIComponent\(edit\)\}`\)/.test(page))
  check("a course's tab says New course", /kind === "course" \? "New course" : "New product"/.test(page))
  const editor = code("app/(storelib)/app/products/new/product-editor.tsx")
  check("the editor no longer reads the address after mounting to become a course", !/URLSearchParams\(window\.location\.search\)\.get\("type"\)/.test(editor) && /initialForm\(loaded, startAs\)/.test(editor))
  check("the switch to a course is a quiet line now, not the violet link", /Video lessons instead of files\?/.test(editor) && /Make it a course/.test(editor) && !/Add video lessons instead/.test(editor) && !/text-\[#6d28d9\]/.test(editor))
  check("switching kind goes through one place that brings the kind's default lines", (editor.match(/switchKind\("(digital|course)"\)/g) ?? []).length === 2 && /swapDefaults\(kind, whatsIncluded, faqs\)/.test(editor))
}

console.log("\nEvery New product in /app asks first")
{
  const chooser = code("app/(storelib)/app/products/new/kind-chooser.tsx")
  check("in place: the shared sheet on a phone, a dialog from 768px", /<SheetDialog/.test(chooser) && /setPhone\(window\.matchMedia\(LAYER_PHONE\)\.matches\)/.test(chooser))
  check("no pick makes anything: no membership draft, every answer's address is known", !/api\/app\/memberships|makeMembership|membershipHref/.test(chooser) && /target\.current = kindHref\(kind\)/.test(chooser) && /const href = kindHref\(kind\)/.test(chooser))
  check("the chooser offers no paid community: it reads no communities switch, and both places draw the same list", !/useCommunitiesEnabled|communities/.test(chooser) && (chooser.match(/<KindList onChoose=\{choose\} onImport=/g) ?? []).length === 2 && /kindOptions\(physical\)/.test(chooser))
  check("on a phone the editor rises after the sheet has left; on a computer at once", /onClosed: go/.test(chooser) && /if \(!phone\) go\(\)/.test(chooser))
  check("both editors are fetched ahead in full", /prefetchAppPage\(router, editorHref\("digital"\)\)/.test(chooser) && /prefetchAppPage\(router, editorHref\("course"\)\)/.test(chooser))
  check("the keyboard: first answer focused, arrows, Home and End move, the answers are buttons", /querySelector<HTMLButtonElement>\("\[data-kind\]"\)\?\.focus\(\{ preventScroll: true \}\)/.test(chooser) && /"ArrowDown"/.test(chooser) && /"ArrowUp"/.test(chooser) && /"Home"/.test(chooser) && /"End"/.test(chooser) && /<button\s+type="button"\s+data-kind=/.test(chooser))
  check("nothing about a pick is remembered", !/localStorage|sessionStorage|document\.cookie/.test(chooser))
  check("the page version gives its place in the history to the answer", /router\.replace\(href\)/.test(chooser))
  const list = code("app/(storelib)/app/products/products-client.tsx")
  check("Products: New product in the bar and Create product in the empty list", (list.match(/onClick=\{askNew\}/g) ?? []).length === 2 && /\{newProduct\.chooser\}/.test(list))
  const home = code("components/app/home/quick-actions.tsx")
  check("Home: the Create product card", /useNewProductChooser\(\)/.test(home) && /a\.href === NEW_PRODUCT_HREF/.test(home) && /newProduct\.open\(\)/.test(home) && /\{newProduct\.chooser\}/.test(home))
  const search = code("components/app/app-search.tsx")
  check("the header search: New product asks, New course opens the course editor", /if \(href === NEW_PRODUCT_HREF\) \{\s*askNew\(\)/.test(search) && /\{newProduct\.chooser\}/.test(search) && /\{ label: "New course", href: "\/app\/products\/new\?type=course"/.test(read("lib/search/app-pages.ts")))
  const onepage = code("components/onepage/tabs/products-tab.tsx")
  const course = onepage.slice(onepage.indexOf('id: "course"'), onepage.indexOf('id: "email_capture"'))
  check("OnePage's Add product offers the video course, no longer coming soon", /title: "Video course"/.test(course) && !/comingSoon/.test(course))
}

console.log("\nA course starts as a course")
{
  const form = initialForm(null, "course")
  check("its type, its own What's included and questions", form.productType === "course" && form.whatsIncluded === COURSE_WHATS_INCLUDED && form.faqs === COURSE_FAQS)
  check("nothing about lessons says download", !/download/i.test(COURSE_WHATS_INCLUDED.join(" ") + COURSE_FAQS.map((f) => f.question + f.answer).join(" ")))
  check("a digital product is unchanged", initialForm(null).productType === "digital" && initialForm(null).whatsIncluded === DEFAULT_WHATS_INCLUDED)
  check("a new course opens clean, not unsaved", snapshotOfForm(form) === snapshotOfForm(initialForm(null, "course")))
  const swapped = swapDefaults("course", DEFAULT_WHATS_INCLUDED, DEFAULT_FAQS)
  check("switching to a course swaps untouched defaults", swapped.whatsIncluded === COURSE_WHATS_INCLUDED && swapped.faqs === COURSE_FAQS)
  const mine = ["My own line"]
  check("and keeps anything the creator wrote", swapDefaults("course", mine, DEFAULT_FAQS).whatsIncluded === mine)
  check("and back again", swapDefaults("digital", COURSE_WHATS_INCLUDED, COURSE_FAQS).whatsIncluded === DEFAULT_WHATS_INCLUDED)
}

console.log("\nThe curriculum on the product page")
{
  const modules = [
    { id: "m1", title: "Start", lessons: [{ id: "a", title: "Hello", duration_seconds: 245, is_preview: true }, { id: "b", title: "Read me", duration_seconds: null }] },
    { id: "m2", title: "Deep", lessons: [{ id: "c", title: "Long", duration_seconds: 7815 }] },
    { id: "m3", title: "Soon", lessons: [] },
  ]
  check("lessons counted across modules", lessonsIn(modules) === 3)
  check("a lesson with no length counts none", secondsIn(modules[0].lessons) === 245)
  check("the whole course's length", courseSeconds(modules) === 8060 && lengthLabel(8060) === "2 h 14 min")
  check("short and exact lengths read naturally", lengthLabel(30) === "1 min" && lengthLabel(3600) === "1 h" && lengthLabel(0) === "" && lengthLabel(2700) === "45 min")
  check("the count line", countLine(3, 8060) === "3 lessons · 2 h 14 min" && countLine(1, 0) === "1 lesson")
  check("a lesson's own clock", lessonClock(245) === "4:05" && lessonClock(7815) === "2:10:15" && lessonClock(null) === "")
  check("the free previews", previewLessons(modules).map((l) => l.id).join() === "a")
  const page = code("app/(storelib)/(marketing)/p/[slug]/page.tsx")
  const outline = code("components/courses/course-outline.tsx")
  /* Changed on purpose (round 31): the theme's colours are painted, so on Storelib's own product page they follow the person's dark look (lib/appearance/site-paint); the light look is the same colours. */
  check("the product page draws it, with the theme's colours", /<CourseOutline\s+modules=\{courseModules\}/.test(page) && /heading: paint\(themeColors\.textColor, "ink"\)/.test(page))
  check("a preview plays through the lesson route that decides who may watch, in the buyers' player", /\/api\/courses\/lessons\/\$\{encodeURIComponent\(lessonId\)\}\/play/.test(outline) && /<LessonVideo /.test(outline) && !/video_path|storage\.from/.test(outline))
  check("only a lesson marked as a preview is a button", /lesson\.is_preview \? \(\s*<button/.test(outline))
  check("a preview that is no longer one says so", /This preview is not available any more\./.test(outline))
}

console.log("\nA large video goes up and says how")
{
  check("a file storage refuses as too large says so", /larger than storage takes/.test(putFailure(413, "")) && /larger than storage takes/.test(putFailure(400, '{"statusCode":"413","error":"Payload too large"}')))
  check("an address that ran out says to try again", /took too long to start/.test(putFailure(400, '{"message":"jwt expired"}')))
  check("anything else is the plain sentence", putFailure(500, "") === "The upload did not finish. Try again.")
  check("a dropped connection is tried again three times, after it comes back", PUT_RETRY_DELAYS_MS.length === 3)
  const client = code("lib/courses/upload-client.ts")
  check("the file still goes through the server's prepare and complete checks", /action: "upload-prepare"/.test(client) && /action: "upload-complete"/.test(client))
  const ce = code("app/(storelib)/app/products/new/course-editor.tsx")
  check("the row says how much of how much, and when it is reconnecting", /Connection lost, trying again/.test(ce) && /of \$\{bytes\(up\.total\)\}/.test(ce) && /"Reconnecting"/.test(ce))
  check("closing the tab mid upload asks first", /addEventListener\("beforeunload", hold\)/.test(ce))
}

console.log("\nCopy")
for (const p of ["app/(storelib)/app/products/new/kind-chooser.tsx", "app/(storelib)/app/products/new/product-kinds.ts", "components/courses/course-outline.tsx", "lib/courses/outline.ts", "lib/courses/upload-client.ts"]) {
  check(`${p}: no em dash and none of the banned words`, !/—|unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(read(p)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
