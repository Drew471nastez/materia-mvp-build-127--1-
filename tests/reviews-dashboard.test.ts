/**
 * ===========================================================================
 *  REVIEWS IN ONE PLACE (app/app/reviews: Overview, Reviews, Requests,
 *  Widgets, Analytics, Settings)
 * ===========================================================================
 *   IMPORT       columns found or chosen, products matched by id, handle,
 *                link, SKU and title, every row that cannot be used said
 *                why, the same review never twice
 *   MODERATION   what approve, reject, publish, unpublish, feature, delete
 *                and the media actions do to each kind of review, alone and
 *                in bulk, through the real routes
 *   REQUESTS     one ask an address and product, what a store can do with
 *                one request and when, the store's own words in the email
 *   ANALYTICS    periods, buckets, averages with gaps, distribution, the
 *                request funnel, the comparison
 *   THE LIST     tabs, filters, the address, pages, through the real reads
 *   SPAM         the hidden field, the time it took, links and the store's
 *                own words
 *   THE AREA     the tabs, the old addresses, one place for the settings,
 *                the database part
 *
 * Run with:  npm run test:push
 */
import { register } from "node:module"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import { untt } from "./i18n-source"
import { MAX_SPAM_WORDS, checkAppReviewInput, looksAutomated, mergeReviewsApp, readPhotos, readReviewsApp, readSpamWords, shownPhotos, shownVideos, spamHold } from "../lib/reviews/app-settings"
import { guessMapping, importKey, parseCsv, planImport, planMappedImport, productMatcher, readImportDate, readMapping, readRating, sniffDelimiter, IMPORT_TEMPLATE_CSV } from "../lib/reviews/import-csv"
import { NO_FILTERS, applyChange, bucketOf, filtersToQuery, inTab, matchesFilters, optimisticRow, pageOf, planModeration, readFilters, recentActivity, responseRate, tabCounts } from "../lib/reviews/dashboard"
import { DAY_MS, bucketsFor, change, distribution, granularityFor, niceMax, periodFor, previousPeriod, requestFunnel, reviewSeries, summarize } from "../lib/reviews/analytics"
import { RESEND_GAP_MS, dedupeAsks, emailCopyFor, fillCopy, requestActionBlock, requestActions, requestState } from "../lib/reviews/request-copy"
import { REVIEWS_NAV, reviewsTabFor } from "../components/app/reviews/reviews-nav"
import { renderEmail } from "../lib/notify/templates"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 700)}`}`)
  }
}
const realLog = console.log
console.warn = () => undefined
console.error = () => undefined
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const CREATOR = "33333333-3333-4333-8333-333333333333"
const OTHER_CREATOR = "55555555-5555-4555-8555-555555555555"
const P1 = "22222222-2222-4222-8222-222222222222"
const P2 = "22222222-2222-4222-8222-222222222223"
const P3 = "22222222-2222-4222-8222-222222222224"
const ORDER = "11111111-1111-4111-8111-111111111111"

/* ── Import ─────────────────────────────────────────────────────────── */

function importing() {
  realLog("\nImport: columns")
  const judge = ["product_handle", "product_title", "rating", "title", "body", "reviewer_name", "reviewer_email", "review_date", "reply"]
  const m = guessMapping(judge)
  check("a Judge.me export: every field found, the handle before the title", m.product === 0 && m.rating === 2 && m.title === 3 && m.body === 4 && m.name === 5 && m.email === 6 && m.date === 7 && m.reply === 8, m)
  const yotpo = guessMapping(["Product SKU", "Review Score", "Review Content", "Display Name", "Date"])
  check("  Yotpo's names (spaces, capitals) read the same", yotpo.product === 0 && yotpo.rating === 1 && yotpo.body === 2 && yotpo.name === 3 && yotpo.date === 4, yotpo)
  check("a chosen mapping: only real columns, each column once", JSON.stringify(readMapping({ product: 0, rating: "1", body: 1, title: 9, name: -1, date: "x" }, 3)) === JSON.stringify({ product: 0, rating: 1 }))
  check("a semicolon file (Excel where the comma is the decimal mark) and a tab file", sniffDelimiter("product;rating;body\nx;5;y") === ";" && parseCsv("a;b\n1;2")[1][1] === "2" && sniffDelimiter("a\tb\tc\n1\t2\t3") === "\t" && sniffDelimiter("a,b\n1,2") === ",")
  check("the template has every column the import reads, and reads back as two rows", (() => {
    const rows = parseCsv(IMPORT_TEMPLATE_CSV)
    const g = guessMapping(rows[0])
    return rows.length === 3 && ["product", "rating", "body", "title", "name", "email", "date", "reply"].every((f) => g[f as keyof typeof g] !== undefined)
  })())

  realLog("\nImport: matching products")
  const products = [
    { id: P1, slug: "linen-apron", title: "Linen apron", skus: ["LA-NAT-M", "LA-NAT-L"] },
    { id: P2, slug: "oak-board", title: "Board", skus: ["SHARED"] },
    { id: P3, slug: "oak-board-xl", title: "Board", skus: ["SHARED"] },
  ]
  const match = productMatcher(products)
  const id = (v: string) => {
    const r = match(v)
    return "id" in r ? r.id : r.problem
  }
  check("by id, by handle, by a link to it (also under a collection)", id(P1.toUpperCase()) === P1 && id("linen-apron") === P1 && id("https://shop.example/products/linen-apron?variant=1") === P1 && id("/collections/kitchen/products/oak-board") === P2)
  check("by a variant's SKU, any case", id("la-nat-l") === P1)
  check("by the exact title, any case", id("LINEN APRON") === P1)
  check("a title or SKU two products share matches neither, and says so", id("Board") === "ambiguous_product" && id("shared") === "ambiguous_product")
  check("nothing, or a near miss: no product", id("") === "no_product" && id("linen apron large") === "no_product")

  realLog("\nImport: rows")
  check("ratings as files write them", readRating("4") === 4 && readRating("4.0") === 4 && readRating("4,0") === 4 && readRating("4/5") === 4 && readRating("5 stars") === 5 && readRating("★★★☆☆") === 3)
  check("  and what is not a whole star from one to five", [readRating("4.5"), readRating("0"), readRating("6"), readRating("ten"), readRating("")].every((r) => r === null))
  const now = Date.UTC(2026, 9, 16)
  check("dates: ISO, day first, and none in the future or before 2000", readImportDate("2026-03-14", now)?.startsWith("2026-03-14") === true && readImportDate("31/12/2025", now)?.startsWith("2025-12-31") === true && readImportDate("2027-01-01", now) === null && readImportDate("1999-01-01", now) === null && readImportDate("soon", now) === null)
  const csv = [
    "product_handle,rating,title,body,reviewer_name,reviewer_email,review_date,reply",
    `linen-apron,5,Great,"Loved it, truly",Jane Doe,JANE@Example.com,2026-05-01,Thank you`,
    "nope,5,,Fine,Ann,,,",
    "linen-apron,9,,Fine,Ann,,,",
    "linen-apron,3,,,Ann,,,",
    `linen-apron,5,Great,"Loved it,   truly!",jane doe,,2026-05-01,`,
    "Board,4,,Solid,Bo,,,",
    "LA-NAT-M,4,,Good apron,Kim,,someday,",
    `linen-apron,2,,${"x".repeat(2100)},Lee,,,`,
  ].join("\n")
  const rows = parseCsv(csv)
  const plan = planMappedImport(rows, guessMapping(rows[0]), products, new Set(), now)
  const problems = plan.rows.filter((r) => !r.ok).map((r) => `${r.row}:${r.problem}`)
  check("every row that cannot be used says which row and why", JSON.stringify(problems) === JSON.stringify(["3:no_product", "4:bad_rating", "5:no_words", "6:duplicate_in_file", "7:ambiguous_product"]), problems)
  check("  and keeps what it said, for the report", plan.rows.find((r) => r.row === 3)?.product === "nope" && plan.rows.find((r) => r.row === 4)?.rating === "9")
  check("the same review written again (case, spaces, punctuation) is one review", plan.reviews.filter((r) => r.productId === P1 && r.rating === 5).length === 1)
  const jane = plan.reviews[0]
  check("an imported review: public name, the address kept apart and lower case, the reply, the date", jane.name === "Jane D." && jane.email === "jane@example.com" && jane.reply === "Thank you" && jane.createdAt?.startsWith("2026-05-01") === true && jane.key === importKey({ productId: P1, content: "Loved it, truly", name: "Jane D." }))
  const kim = plan.rows.find((r) => r.row === 8)
  const lee = plan.rows.find((r) => r.row === 9)
  check("imported with a note: a date not read, words cut to 2,000", kim?.ok === true && kim.notes?.includes("bad_date") === true && lee?.ok === true && lee.notes?.includes("cut") === true && plan.reviews.find((r) => r.name === "Lee")?.content.length === 2000)
  const again = planMappedImport(rows, guessMapping(rows[0]), products, new Set(plan.reviews.map((r) => r.key as string)), now)
  check("the same file a second time: nothing new, every row already in the store", again.reviews.length === 0 && again.rows.filter((r) => r.problem === "already_imported").length === plan.reviews.length + 1)
  check("a file without product, rating or review says which", JSON.stringify(planMappedImport(parseCsv("name,stars\nx,5"), guessMapping(["name", "stars"]), products).missingFields) === JSON.stringify(["product", "body"]))
  check("the import before the mapping step still reads the same (planImport)", planImport(csv, products).reviews.length === plan.reviews.length && planImport(csv, products).skipped.map((s) => s.why).join() === "no_product,bad_rating,no_words,duplicate_in_file,ambiguous_product")
}

/* ── Moderation ─────────────────────────────────────────────────────── */

const review = (over: Record<string, unknown> = {}) => ({ id: "r1", product_id: P1, creator_id: CREATOR, status: "published", site_status: "shown", hidden_by: null, verified: false, featured: false, photos: [], seller_reply: null, ...over })

function moderation() {
  realLog("\nModeration: where a review is")
  check("published, pending (two ways), rejected (two ways), reported", [
    bucketOf(review()) === "published",
    bucketOf(review({ status: "pending" })) === "pending",
    bucketOf(review({ verified: true, site_status: "pending" })) === "pending",
    bucketOf(review({ status: "hidden", hidden_by: "seller" })) === "rejected",
    bucketOf(review({ verified: true, site_status: "hidden" })) === "rejected",
    bucketOf(review({ status: "hidden", hidden_by: "report" })) === "reported",
    bucketOf(review({ status: "hidden", hidden_by: null })) === "reported",
  ].every(Boolean))
  check("No reply: shown and unanswered only", inTab(review(), "unanswered") && !inTab(review({ seller_reply: "Thanks" }), "unanswered") && !inTab(review({ status: "pending" }), "unanswered"))

  realLog("\nModeration: what each action does")
  const now = "2026-10-16T10:00:00.000Z"
  const approveU = planModeration(review({ status: "pending" }), "approve", { now })
  check("approve a visitor's pending review: published everywhere", approveU.kind === "change" && approveU.change.status === "published" && approveU.change.published_at === now)
  const approveV = planModeration(review({ verified: true, site_status: "pending" }), "approve", { now })
  check("approve a verified buyer's: shown on the website, Storelib's status untouched", approveV.kind === "change" && approveV.change.site_status === "shown" && !("status" in approveV.change))
  const rejectU = planModeration(review({ status: "pending" }), "reject", { now })
  check("reject a visitor's: hidden by the store, kept", rejectU.kind === "change" && rejectU.change.status === "hidden" && rejectU.change.hidden_by === "seller")
  const rejectV = planModeration(review({ verified: true, site_status: "pending" }), "reject", { now })
  check("reject a verified buyer's: off the website only", rejectV.kind === "change" && rejectV.change.site_status === "hidden" && !("status" in rejectV.change))
  check("approve or reject a review that is not waiting: nothing to do", planModeration(review(), "approve").kind === "noop" && planModeration(review(), "reject").kind === "noop")
  check("unpublish a shown review; one already off: nothing to do", planModeration(review(), "unpublish").kind === "change" && planModeration(review({ status: "hidden", hidden_by: "seller" }), "unpublish").kind === "noop")
  check("publish a rejected one back; a shown one: nothing to do", planModeration(review({ status: "hidden", hidden_by: "seller" }), "publish").kind === "change" && planModeration(review(), "publish").kind === "noop")
  const reported = planModeration(review({ status: "hidden", hidden_by: "report" }), "publish")
  check("a review a report hid: publishing is refused (409), hiding again does nothing", reported.kind === "refuse" && reported.status === 409 && planModeration(review({ status: "hidden", hidden_by: "report" }), "hide").kind === "noop")
  check("feature only what is published", planModeration(review(), "feature").kind === "change" && planModeration(review({ status: "pending" }), "feature").kind === "noop")
  const delV = planModeration(review({ verified: true }), "delete")
  check("delete: a verified buyer's never (403), a reported one not by the store", delV.kind === "refuse" && delV.status === 403 && planModeration(review({ status: "hidden", hidden_by: "report" }), "delete").kind === "refuse")
  const pic = `${CREATOR}/${"a".repeat(32)}.jpg`
  const vid = `${CREATOR}/${"b".repeat(32)}.mp4`
  const withMedia = review({ photos: [{ path: pic, url: "https://x/a.jpg", status: "approved" }, { path: vid, url: "https://x/b.mp4", status: "held", kind: "video" }] })
  const del = planModeration(withMedia, "delete")
  check("  a visitor's: deleted with every file it has", del.kind === "change" && JSON.stringify(del.removeFiles) === JSON.stringify([pic, vid]))
  const hidePic = planModeration(withMedia, "remove_photo", { photo: pic })
  const showVid = planModeration(withMedia, "restore_photo", { photo: vid })
  const dropVid = planModeration(withMedia, "delete_photo", { photo: vid })
  check("media: a photo hidden (kept), the held video let through, the video removed for good", hidePic.kind === "change" && (hidePic.change.photos as any[])[0].status === "removed" && showVid.kind === "change" && (showVid.change.photos as any[])[1].status === "approved" && dropVid.kind === "change" && (dropVid.change.photos as any[]).length === 1 && JSON.stringify(dropVid.removeFiles) === JSON.stringify([vid]))
  check("  a path that is not on the review: 404", (() => { const p = planModeration(withMedia, "remove_photo", { photo: "x" }); return p.kind === "refuse" && p.status === 404 })())
  const after = applyChange(review({ status: "pending" }), (approveU as { change: Record<string, unknown> }).change)
  check("the list draws a change at once: the row moves tab", bucketOf(after) === "published" && after.status === "published" && optimisticRow(review({ status: "pending" }) as any, "approve")?.status === "published" && optimisticRow(review() as any, "approve") === null)
}

/* ── Requests ───────────────────────────────────────────────────────── */

function requests() {
  realLog("\nRequests: one ask an address and product")
  const orders = [
    { id: "o3", product_id: P1, buyer_email: "Ana@Example.com" },
    { id: "o2", product_id: P2, buyer_email: "ana@example.com" },
    { id: "o1", product_id: P1, buyer_email: "ana@example.com" },
    { id: "o0", product_id: P1, buyer_email: "bo@example.com" },
  ]
  const d = dedupeAsks(orders, [{ email: "BO@example.com", product_id: P1 }])
  check("the first purchase is asked; a second order of the same product by the same address is a duplicate, in any case", JSON.stringify(d.fresh.map((o) => o.id)) === JSON.stringify(["o2", "o1"]) && d.duplicates.map((o) => o.id).sort().join() === "o0,o3", d)
  check("  an address already asked about the product is not asked again", d.duplicates.some((o) => o.id === "o0"))

  realLog("\nRequests: what a store can do with one")
  const now = Date.UTC(2026, 9, 16, 12)
  const ago = (ms: number) => new Date(now - ms).toISOString()
  check("scheduled: send now or cancel", requestActions({ status: "scheduled" }, now).join() === "send_now,cancel")
  check("sent: cancel (its reminder); send again only a day after it went", requestActions({ status: "sent", sent_at: ago(3_600_000) }, now).join() === "cancel" && requestActions({ status: "sent", sent_at: ago(RESEND_GAP_MS + 1) }, now).join() === "resend,cancel")
  check("  a copy sent again counts: another day before the next", requestActions({ status: "sent", sent_at: ago(5 * RESEND_GAP_MS), last_sent_at: ago(1000) }, now).join() === "cancel")
  check("reminded: send again after a day, never a second reminder", requestActions({ status: "reminded", sent_at: ago(9 * DAY_MS), reminded_at: ago(2 * DAY_MS) }, now).join() === "resend")
  check("failed: try again. reviewed, cancelled, skipped: nothing", requestActions({ status: "failed" }, now).join() === "retry" && [{ status: "reviewed" }, { status: "skipped", skip_reason: "cancelled" }, { status: "skipped", skip_reason: "duplicate" }].every((r) => requestActions(r, now).length === 0))
  check("a cancelled request reads as cancelled, a duplicate as skipped", requestState({ status: "skipped", skip_reason: "cancelled" }) === "cancelled" && requestState({ status: "skipped", skip_reason: "duplicate" }) === "skipped")
  check("why an action cannot run, in words", /less than a day/.test(requestActionBlock({ status: "sent", sent_at: ago(60_000) }, "resend", now) ?? "") && /already wrote/.test(requestActionBlock({ status: "reviewed" }, "resend", now) ?? "") && requestActionBlock({ status: "scheduled" }, "cancel", now) === null)

  realLog("\nRequests: the store's own words")
  check("three words fill themselves in; an empty first name leaves no stray comma", fillCopy("Hi {first_name}, how is {product} from {store}?", { firstName: "Ana", product: "Linen apron", store: "Drew" }) === "Hi Ana, how is Linen apron from Drew?" && fillCopy("Hi {first_name}, thanks!", {}) === "Hi, thanks!")
  const s = readReviewsApp({ email: { subject: "How is {product}?", body: "Hi {first_name}.\n\nTell us.", button: "Rate it", fromName: "Drew at {store}", reminderSubject: "", showProduct: false } })
  const first = emailCopyFor(s, { firstName: "Ana", product: "Apron", store: "Drew" }, false)
  const second = emailCopyFor(s, { firstName: "Ana", product: "Apron", store: "Drew" }, true)
  check("the first email: subject, paragraphs, button, sender, no picture", first.subject === "How is Apron?" && JSON.stringify(first.paragraphs) === JSON.stringify(["Hi Ana.", "Tell us."]) && first.button === "Rate it" && first.fromName === "Drew at Drew" && first.showProduct === false)
  check("  the reminder: Storelib's subject and words where the store wrote none", second.subject === null && second.paragraphs === null && second.button === "Rate it")
  const data = { productTitle: "Linen apron", productId: P1, creatorName: "Drew Studio", reviewToken: "AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA", reminderOn: true }
  const ctx = { baseUrl: "https://storelib.com", recipientName: "Ana", unsubscribeUrl: null, preferencesUrl: null, when: null } as never
  const plain = renderEmail("REVIEW_REQUEST", data, ctx)
  const own = renderEmail("REVIEW_REQUEST", { ...data, copySubject: "Quick favour?", copyHeading: "Tell us", copyParagraphs: ["One line is plenty."], copyButton: "Rate it", copyFromName: "Drew", hideProduct: true }, ctx)
  check("the email with no words of the store's: Storelib's", plain.subject === "How is Linen apron?" && /Write a review/.test(plain.text) && plain.fromName === "Drew Studio")
  check("  with them: its subject, heading, words, button and sender, and no product picture", own.subject === "Quick favour?" && /Tell us/.test(own.html) && /One line is plenty\./.test(own.text) && /Rate it/.test(own.html) && own.fromName === "Drew" && !/by Drew Studio/.test(own.text), { subject: own.subject, from: own.fromName })
  check("  the stars to tap and the unsubscribe line are the template's whatever the words", /\?rate=5/.test(own.html) && /\?rate=5/.test(plain.html))
}

/* ── Analytics ──────────────────────────────────────────────────────── */

function analytics() {
  realLog("\nAnalytics: periods")
  const now = Date.UTC(2026, 9, 16, 15, 30)
  const p = periodFor("30d", now)
  check("the last 30 days end with today", p.to === Date.UTC(2026, 9, 17) && p.to - p.from === 30 * DAY_MS)
  const before = previousPeriod(p)
  check("compared with the 30 days before, end to end", before.to === p.from && before.to - before.from === 30 * DAY_MS)
  const custom = periodFor("custom", now, { from: "2026-03-31", to: "2026-01-01" })
  check("two dates in any order, the last day included", custom.from === Date.UTC(2026, 0, 1) && custom.to === Date.UTC(2026, 3, 1))
  check("never past today, never more than two years", periodFor("custom", now, { from: "2026-10-01", to: "2027-05-01" }).to === Date.UTC(2026, 9, 17) && periodFor("custom", now, { from: "2010-01-01", to: "2026-10-01" }).to - periodFor("custom", now, { from: "2010-01-01", to: "2026-10-01" }).from === 731 * DAY_MS)
  check("days up to a month, weeks up to 120 days, months beyond", granularityFor(periodFor("7d", now)) === "day" && granularityFor(p) === "day" && granularityFor(periodFor("90d", now)) === "week" && granularityFor(periodFor("12m", now)) === "month")
  const year = bucketsFor(periodFor("12m", now), "month")
  check("months are calendar months, the first and last cut to the period", year.length === 13 && year[0].start === periodFor("12m", now).from && year[1].start === Date.UTC(2025, 10, 1) && year[year.length - 1].end === Date.UTC(2026, 9, 17))
  check("weeks are seven days from the first day", bucketsFor(periodFor("90d", now), "week").length === 13 && bucketsFor(periodFor("90d", now), "week")[1].start - bucketsFor(periodFor("90d", now), "week")[0].start === 7 * DAY_MS)

  realLog("\nAnalytics: the numbers")
  const at = (d: number, h = 10) => new Date(Date.UTC(2026, 9, d, h)).toISOString()
  const week = periodFor("7d", now)
  const reviews = [
    { created_at: at(10), rating: 5, verified: true, media: true },
    { created_at: at(10, 23), rating: 4, verified: false, media: false },
    { created_at: at(12), rating: 1, verified: true, media: false },
    { created_at: at(16, 23), rating: 5, verified: true, media: false },
    { created_at: at(2), rating: 2, verified: true, media: false },
    { created_at: at(17, 1), rating: 3, verified: true, media: false },
  ]
  const series = reviewSeries(reviews, week, "day")
  check("reviews by day, by when they were written", series.length === 7 && series.map((s) => s.count).join() === "2,0,1,0,0,0,1", series.map((s) => s.count))
  check("the mean rating of each day, one decimal; a day with none has a gap, not a zero", series[0].average === 4.5 && series[1].average === null && series[2].average === 1)
  const sum = summarize(reviews, [], week)
  check("the period: how many, the mean, the verified share, the share with media", sum.count === 4 && sum.average === 3.8 && sum.verifiedShare === 0.75 && sum.mediaShare === 0.25, sum)
  check("an empty period has no average and no shares (never 0%)", summarize([], [], week).average === null && summarize([], [], week).verifiedShare === null)
  const dist = distribution([5, 5, 4, 1, 3, 7])
  check("the distribution, five first, shares of the ratings that are ratings", dist.map((d) => d.count).join() === "2,1,1,0,1" && Math.abs(dist[0].share - 0.4) < 1e-9)
  const funnel = requestFunnel([
    { status: "sent", sent_at: at(10) },
    { status: "reminded", sent_at: at(10), reminded_at: at(12) },
    { status: "reviewed", sent_at: at(11) },
    { status: "reviewed", sent_at: null },
    { status: "failed" },
    { status: "skipped", skip_reason: "cancelled" },
  ])
  check("request emails: went, failed, reminders, reviews from an email, stopped", funnel.sent === 3 && funnel.failed === 1 && funnel.reminders === 1 && funnel.reviewed === 1 && funnel.stopped === 1, funnel)
  check("  delivery = went / (went + failed); submission = reviewed / went", funnel.deliveryRate === 0.75 && Math.abs((funnel.submissionRate ?? 0) - 1 / 3) < 1e-9)
  check("  none went: no rate at all", requestFunnel([]).submissionRate === null && requestFunnel([{ status: "failed" }]).deliveryRate === 0)
  check("the comparison: the difference and its share of before; nothing to compare with nothing", change(12, 8).delta === 4 && change(12, 8).relative === 0.5 && change(3, 0).relative === null && change(null, 4).delta === null)
  check("the chart's top line is a round number with headroom", niceMax(0) === 3 && niceMax(4) === 6 && niceMax(13) === 15 && niceMax(31) === 45 && niceMax(1201) === 1500)
}

/* ── The list, the overview, spam, settings ─────────────────────────── */

function rules() {
  realLog("\nThe list: the address")
  const f = readFilters(new URLSearchParams("tab=pending&q=strap,(x)&rating=1&product=" + P1 + "&verified=yes&media=yes&page=3"))
  check("every filter read from the address, checked", f.tab === "pending" && f.q === "strap x" && f.rating === 1 && f.product === P1 && f.verified === "yes" && f.media === "yes" && f.page === 3, f)
  check("old addresses: ?status=pending and ?status=hidden", readFilters({ status: "pending" }).tab === "pending" && readFilters({ status: "hidden" }).tab === "rejected")
  check("nonsense reads as the default", JSON.stringify(readFilters({ tab: "x", rating: "9", product: "nope", verified: "maybe", page: "-2" })) === JSON.stringify(NO_FILTERS))
  check("the plain list is the plain address, and back again", filtersToQuery(NO_FILTERS) === "" && JSON.stringify(readFilters(new URLSearchParams(filtersToQuery(f).slice(1)))) === JSON.stringify(f))
  const rows = [
    { ...review({ id: "a", rating: 5, content: "Lovely strap", verified: true, photos: [{ path: "p", url: "https://x/p.jpg" }] }), product_id: P1 },
    { ...review({ id: "b", rating: 1, content: "Broke", status: "pending" }), product_id: P2 },
    { ...review({ id: "c", rating: 1, content: "Meh", status: "hidden", hidden_by: "seller", reviewer_name: "Strapper" }), product_id: P1 },
  ]
  const title = (id: string) => (id === P2 ? "Oak board" : "Linen apron")
  check("filters: rating, product, verified, media, and words in the text, the name or the product", [
    rows.filter((r) => matchesFilters(r as never, { ...NO_FILTERS, rating: 1 })).length === 2,
    rows.filter((r) => matchesFilters(r as never, { ...NO_FILTERS, product: P2 })).length === 1,
    rows.filter((r) => matchesFilters(r as never, { ...NO_FILTERS, verified: "yes" })).map((r) => r.id).join() === "a",
    rows.filter((r) => matchesFilters(r as never, { ...NO_FILTERS, media: "yes" })).map((r) => r.id).join() === "a",
    rows.filter((r) => matchesFilters(r as never, { ...NO_FILTERS, q: "strap" }, title)).map((r) => r.id).join() === "a,c",
    rows.filter((r) => matchesFilters(r as never, { ...NO_FILTERS, q: "oak" }, title)).map((r) => r.id).join() === "b",
  ].every(Boolean))
  const counts = tabCounts(rows)
  check("each tab's count", counts.all === 3 && counts.published === 1 && counts.pending === 1 && counts.rejected === 1 && counts.reported === 0 && counts.unanswered === 1, counts)
  const pg = pageOf(Array.from({ length: 45 }, (_, i) => i), 9, 20)
  check("pages: a page past the end reads as the last", pg.page === 3 && pg.pages === 3 && pg.rows.length === 5 && pg.total === 45)

  realLog("\nThe overview")
  check("response rate: reviews from emails of emails sent; none sent is no rate", responseRate(40, 10) === 0.25 && responseRate(0, 0) === null && responseRate(3, 5) === 1)
  const act = recentActivity(
    [{ ...review({ id: "r9", created_at: "2026-10-10T10:00:00Z", rating: 5, reviewer_name: "Maya", seller_reply_at: "2026-10-12T10:00:00Z" }), product_id: P1 } as never],
    [{ id: "q1", product_id: P1, sent_at: "2026-10-11T10:00:00Z", reminded_at: "2026-10-13T10:00:00Z", first_name: "Ana" }],
  )
  check("lately: reviews in, replies, emails and reminders out, newest first", act.map((a) => a.kind).join() === "reminder,reply,request,review", act)

  realLog("\nSpam")
  check("the hidden field filled in: a script", looksAutomated({ website: "http://x" }) === "honeypot" && looksAutomated({ website: "" }) === null)
  const t = 1_000_000
  check("sent faster than a person types: held; a form with no time is not judged by it", looksAutomated({ openedAt: t - 800 }, t) === "too_fast" && looksAutomated({ openedAt: t - 9000 }, t) === null && looksAutomated({}, t) === null)
  const s = readReviewsApp({ spam: { holdLinks: true, words: ["Promo Code", "casino", "casino", "x", "<b>"] } })
  check("the store's words: lower case, each once, too short dropped", JSON.stringify(s.spam.words) === JSON.stringify(["promo code", "casino"]) && readSpamWords("a\nbb,cc").join() === "bb,cc" && readSpamWords(Array.from({ length: 50 }, (_, i) => `w${i}`)).length === MAX_SPAM_WORDS)
  check("a link holds a review: http, www, a bare domain", spamHold(s, { content: "see https://x.io" }) === "link" && spamHold(s, { content: "go to www.example" }) === "link" && spamHold(s, { title: "cheap-bags.shop rocks" }) === "link")
  check("  a word holds it whole, never inside another word", spamHold(s, { content: "Use PROMO CODE now" }) === "word" && spamHold(s, { content: "Casinos are fun" }) === null && spamHold(s, { content: "occasino" }) === null)
  check("  a plain review, or links allowed, is not held", spamHold(s, { content: "Lovely. Version 2.0 is better." }) === null && spamHold(readReviewsApp({ spam: { holdLinks: false } }), { content: "https://x.io" }) === null)
  const merged = mergeReviewsApp({ email: { subject: "A" }, spam: { holdLinks: false } }, { email: { body: "B" } })
  check("settings: a change keeps the rest of the email and spam", merged.email.subject === "A" && merged.email.body === "B" && merged.spam.holdLinks === false && merged.videos === false)
  check("  every word cut to its limit, control characters gone", readReviewsApp({ email: { subject: "x".repeat(500) + "\u0000", body: "y".repeat(5000) } }).email.subject.length === 120 && readReviewsApp({ email: { body: "y".repeat(5000) } }).email.body.length === 800)
  const vid = `${CREATOR}/${"b".repeat(32)}.mp4`
  const pics = readPhotos([{ path: `${CREATOR}/${"a".repeat(32)}.jpg`, url: "https://x/a.jpg", status: "approved" }, { path: vid, url: "https://x/b.mp4", status: "held" }, { path: "c.webm", url: "https://x/c.webm", status: "approved", kind: "video" }])
  check("media: a video is read as one, held until the store lets it through", pics[1].kind === "video" && pics[1].status === "held" && pics[2].kind === "video")
  check("  photos and the video are shown apart, never a video as a picture", shownPhotos(pics).join() === "https://x/a.jpg" && shownVideos(pics).join() === "https://x/c.webm")
  const input = checkAppReviewInput({ rating: 5, content: "Good", photos: [vid, `${CREATOR}/${"c".repeat(32)}.mp4`] }, { creatorId: CREATOR, photos: true, videos: true })
  check("a review takes one video at most, and only when the store takes videos", !input.ok && /one video/.test((input as { error: string }).error) && (checkAppReviewInput({ rating: 5, content: "Good", photos: [vid] }, { creatorId: CREATOR, photos: true, videos: false }) as { photoPaths: string[] }).photoPaths.length === 0)
}

/* ── Routes ─────────────────────────────────────────────────────────── */

const S: any = ((globalThis as any).__rdStubs = { admin: null, creator: CREATOR, signedIn: true, sent: [] as any[] })
/* Under the run's own folder when there is one, where `next` resolves (the runner links node_modules there), so a stub answers with the same NextResponse the routes check for. */
const dir = process.env.PUSH_TEST_OUT ? mkdtempSync(join(process.env.PUSH_TEST_OUT, "rd-stubs-")) : mkdtempSync(join(tmpdir(), "rd-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs: Record<string, string> = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__rdStubs.admin\n`),
  "@/lib/supabase/server": stub("server", `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__rdStubs.signedIn ? { id: "seller" } : null }, error: null }) } })\n`),
  "@/lib/physical/auth": stub(
    "auth",
    `import { NextResponse } from "next/server"
const json = (body, status = 200) => NextResponse.json(body, { status })
export const physicalJson = json
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v) => typeof v === "string" && UUID.test(v)
export async function readBody(r) { try { const b = await r.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : null } catch { return null } }
export async function shopCaller() { const s = globalThis.__rdStubs; if (!s.signedIn) return json({ error: "Sign in to continue." }, 401); return { creatorId: s.creator, userId: "seller", db: s.admin } }
`,
  ),
  "@/lib/api/rate-limit": stub("rl", `export const rateLimit = async () => null\nexport const addressSubject = () => "ip:x"\nexport const emailSubject = (e) => "email:" + e\nexport const callerAddress = () => "203.0.113.9"\n`),
  "@/lib/email": stub("email", `export const sendReviewNotificationEmail = async () => ({ success: true })\nexport const resolveSellerEmail = async () => "seller@example.com"\n`),
  "@/lib/notify/providers/mailgun": stub("mail", `export const emailProvider = () => ({ send: async (m) => { globalThis.__rdStubs.sent.push({ to: m.to, subject: m.subject, messageId: m.messageId }); return { status: "sent" } } })\nexport const mailgunDomain = () => "mg.test"\n`),
  "@/lib/activity/log-server": stub("act", `export const recordActivity = async () => undefined\n`),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundle(entry: string): Promise<string> {
  const out = join(process.env.PUSH_TEST_OUT || join(process.cwd(), "node_modules/.cache/reviews-dashboard-test"), "__rd__", entry.replace(/[^\w]+/g, "_") + ".mjs")
  await build({
    entryPoints: [join(process.cwd(), entry)],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    logLevel: "error",
    alias: { "@": process.cwd() },
    packages: "external",
    plugins: [{ name: "stand-ins", setup(b) { const names = new Set(Object.keys(stubs)); b.onResolve({ filter: /.*/ }, (a) => (names.has(a.path) ? { path: a.path, external: true } : undefined)) } }],
    external: ["next/*", "server-only"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

function storage() {
  const buckets: Record<string, Set<string>> = { "review-photos": new Set(), "review-uploads": new Set() }
  return {
    buckets,
    from: (b: string) => ({
      remove: async (paths: string[]) => (paths.forEach((x) => buckets[b].delete(x)), { error: null }),
      move: async (from: string, to: string, o?: { destinationBucket?: string }) => {
        if (!buckets[b].has(from)) return { error: { message: "Object not found" } }
        buckets[b].delete(from)
        buckets[o?.destinationBucket ?? b].add(to)
        return { error: null }
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${b}/${path}` } }),
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://cdn.test/signed/${path}` } }),
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://cdn.test/signed/${path}` })) }),
    }),
  }
}

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY_MS).toISOString()

function db(reviews: any[], extra: Record<string, any[]> = {}) {
  const d: any = fakeDb({
    reviews,
    products: [
      { id: P1, title: "Linen apron", slug: "linen-apron", status: "published", creator_id: CREATOR, thumbnail_url: null, reviews_count: 0, reviews_average: 0 },
      { id: P2, title: "Oak board", slug: "oak-board", status: "published", creator_id: CREATOR, thumbnail_url: null, reviews_count: 0, reviews_average: 0 },
    ],
    product_variants: [{ product_id: P2, sku: "OAK-1" }],
    creators: [{ id: CREATOR, user_id: "seller", support_email: "help@shop.example", display_name: "Drew Studio", slug: "drew", reviews_count: 0, reviews_average: 0 }],
    store_settings: [{ creator_id: CREATOR, reviews: { enabled: true, request: { enabled: true } } }],
    review_requests: [],
    review_authors: [],
    review_import_batches: [],
    orders: [],
    email_suppressions: [],
    profiles: [],
    ...extra,
  })
  d.storage = storage()
  return d
}

const req = (url: string, method = "GET", body?: unknown) => new Request(`https://storelib.test${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const json = async (r: Response) => r.json().catch(() => ({}))
const R = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`

async function routes() {
  const server = (await import(await bundle("lib/reviews/dashboard-server.ts"))) as any
  const list = (await import(await bundle("app/api/app/reviews/route.ts"))) as any
  const bulkRoute = (await import(await bundle("app/api/app/reviews/bulk/route.ts"))) as any
  const importRoute = (await import(await bundle("app/api/app/reviews/import/route.ts"))) as any
  const requestRoute = (await import(await bundle("app/api/app/reviews/requests/[id]/route.ts"))) as any
  const writeRoute = (await import(await bundle("app/api/reviews/request/route.ts"))) as any

  const rows = [
    { id: R(1), product_id: P1, creator_id: CREATOR, rating: 5, content: "Lovely strap", created_at: iso(1), status: "published", site_status: "shown", verified: true, order_id: ORDER, photos: [], seller_reply: null, hidden_by: null },
    { id: R(2), product_id: P1, creator_id: CREATOR, rating: 2, content: "Meh", created_at: iso(2), status: "pending", site_status: "shown", verified: false, source: "site", photos: [], hidden_by: null },
    { id: R(3), product_id: P2, creator_id: CREATOR, rating: 1, content: "Broke", created_at: iso(3), status: "published", site_status: "pending", verified: true, order_id: null, photos: [{ path: `${CREATOR}/${"a".repeat(32)}.jpg`, url: "https://cdn.test/review-photos/a.jpg", status: "approved" }], hidden_by: null },
    { id: R(4), product_id: P2, creator_id: CREATOR, rating: 4, content: "Fine", created_at: iso(4), status: "hidden", site_status: "shown", verified: false, source: "import", photos: [], hidden_by: "seller" },
    { id: R(5), product_id: P2, creator_id: CREATOR, rating: 1, content: "Abuse", created_at: iso(5), status: "hidden", site_status: "shown", verified: false, source: "site", photos: [], hidden_by: "report" },
    { id: R(6), product_id: P3, creator_id: OTHER_CREATOR, rating: 5, content: "Someone else's", created_at: iso(1), status: "published", site_status: "shown", verified: true, photos: [], hidden_by: null },
  ]

  realLog("\nThe list, through the real read")
  {
    const d = db(rows.map((r) => ({ ...r })))
    S.admin = d
    const all = await server.listReviews(d, CREATOR, NO_FILTERS)
    check("the store's own reviews only, newest first, every tab counted", all.rows.map((r: any) => r.id).join() === [R(1), R(2), R(3), R(4), R(5)].join() && all.counts.all === 5 && all.counts.published === 1 && all.counts.pending === 2 && all.counts.rejected === 1 && all.counts.reported === 1 && all.counts.unanswered === 1, all.counts)
    const pending = await server.listReviews(d, CREATOR, { ...NO_FILTERS, tab: "pending" })
    check("Pending: a visitor's waiting review and a verified buyer's waiting on the website", pending.rows.map((r: any) => r.id).join() === [R(2), R(3)].join())
    const words = await server.listReviews(d, CREATOR, { ...NO_FILTERS, tab: "pending", q: "oak" })
    check("words and a tab together: both apply (the product's title matches)", words.rows.map((r: any) => r.id).join() === R(3) && words.counts.all === 3, words.counts)
    const oneStar = await server.listReviews(d, CREATOR, { ...NO_FILTERS, rating: 1, verified: "no" })
    check("rating and not verified", oneStar.rows.map((r: any) => r.id).join() === R(5))
    check("a photo waiting with its review is shown to the store by a signed address", pending.rows.find((r: any) => r.id === R(3))?.photos[0].view.includes("/signed/"))
    const api = await list.GET(req("/api/app/reviews?tab=rejected"))
    const body = await json(api)
    check("the route reads the address the same way", api.status === 200 && body.rows.map((r: any) => r.id).join() === R(4))
  }

  realLog("\nBulk actions, through the route")
  {
    const d = db(rows.map((r) => ({ ...r })))
    const pic = `${CREATOR}/${"a".repeat(32)}.jpg`
    d.storage.buckets["review-uploads"].add(pic)
    S.admin = d
    S.signedIn = false
    check("signed out: 401", (await bulkRoute.POST(req("/api/app/reviews/bulk", "POST", { ids: [R(2)], action: "approve" }))).status === 401)
    S.signedIn = true
    check("an action that is not one, or no ids: 400", (await bulkRoute.POST(req("/api/app/reviews/bulk", "POST", { ids: [R(2)], action: "explode" }))).status === 400 && (await bulkRoute.POST(req("/api/app/reviews/bulk", "POST", { ids: [], action: "approve" }))).status === 400)
    const approve = await json(await bulkRoute.POST(req("/api/app/reviews/bulk", "POST", { ids: [R(1), R(2), R(3), R(6)], action: "approve" })))
    const row = (id: string) => d.tables.reviews.find((r: any) => r.id === id)
    check("approve: the two waiting ones; the shown one already was; another store's is not found", approve.changed?.sort().join() === [R(2), R(3)].join() && approve.skipped?.find((s: any) => s.id === R(1))?.reason === "not_pending" && approve.skipped?.find((s: any) => s.id === R(6))?.reason === "not_found", approve)
    check("  the visitor's is published; the verified buyer's is shown on the website, Storelib's status untouched", row(R(2)).status === "published" && row(R(3)).site_status === "shown" && row(R(3)).status === "published" && row(R(6)).status === "published")
    check("  its photo is public now that the website shows it", d.storage.buckets["review-photos"].has(pic) && !d.storage.buckets["review-uploads"].has(pic))
    const del = await json(await bulkRoute.POST(req("/api/app/reviews/bulk", "POST", { ids: [R(1), R(4), R(5)], action: "delete" })))
    check("delete: the store's own unverified one goes; a verified buyer's and a reported one stay, with why", JSON.stringify(del.deleted) === JSON.stringify([R(4)]) && del.skipped.find((s: any) => s.id === R(1))?.reason === "verified" && del.skipped.find((s: any) => s.id === R(5))?.reason === "reported" && !row(R(4)) && !!row(R(1)) && !!row(R(5)), del)
    const unpub = await json(await bulkRoute.POST(req("/api/app/reviews/bulk", "POST", { ids: [R(1), R(2)], action: "unpublish" })))
    check("unpublish: the verified one off the website only, the visitor's hidden by the store", unpub.changed.length === 2 && row(R(1)).site_status === "hidden" && row(R(1)).status === "published" && row(R(2)).status === "hidden" && row(R(2)).hidden_by === "seller")
    check("  the product's rating counts verified published reviews only", d.tables.products.find((p: any) => p.id === P1).reviews_count === 1)
  }

  realLog("\nImport, through the route")
  {
    const d = db([])
    S.admin = d
    const csv = "product_handle,rating,body,reviewer_name,reviewer_email,reply\nlinen-apron,5,Lovely,Maya Rivers,maya@example.com,Thanks Maya\nOAK-1,4,Solid board,Jo,,\nnope,3,Hm,Al,,\n"
    const preview = await json(await importRoute.POST(req("/api/app/reviews/import", "POST", { csv })))
    check("a check first: the plan, nothing written", preview.ready === 2 && preview.total === 3 && preview.rows.find((r: any) => r.row === 4)?.problem === "no_product" && d.tables.reviews.length === 0, preview)
    const remapped = await json(await importRoute.POST(req("/api/app/reviews/import", "POST", { csv, mapping: { product: 0, rating: 1, body: 3 } })))
    check("  a chosen mapping is read as chosen", remapped.mapping.body === 3 && remapped.rows.length === 3)
    const done = await json(await importRoute.POST(req("/api/app/reviews/import", "POST", { csv, commit: true, fileName: "judge.csv" })))
    const made = d.tables.reviews
    check("imported: published, unverified, from an import, named in public form, matched by SKU too", done.imported === 2 && made.length === 2 && made.every((r: any) => r.verified === false && r.source === "import" && r.status === "published") && made.some((r: any) => r.product_id === P2) && made.some((r: any) => r.reviewer_name === "Maya R."), made)
    check("  the reply is the store's, the address kept apart", made.find((r: any) => r.reviewer_name === "Maya R.")?.seller_reply === "Thanks Maya" && d.tables.review_authors.some((a: any) => a.email === "maya@example.com") && !made.some((r: any) => "email" in r))
    check("  kept with its report (part 204), each review naming it", !!done.batchId && d.tables.review_import_batches[0]?.imported === 2 && d.tables.review_import_batches[0]?.skipped === 1 && made.every((r: any) => r.import_batch_id === done.batchId))
    const twice = await json(await importRoute.POST(req("/api/app/reviews/import", "POST", { csv, commit: true })))
    check("the same file again: nothing new, every row said to be in the store already", twice.imported === 0 && d.tables.reviews.length === 2 && twice.rows.filter((r: any) => r.problem === "already_imported").length === 2)
    const undo = await importRoute.DELETE(req(`/api/app/reviews/import?batch=${done.batchId}`, "DELETE"))
    check("the whole import taken back", undo.status === 200 && d.tables.reviews.length === 0 && !!d.tables.review_import_batches[0].undone_at)
  }

  realLog("\nA request, through the route")
  {
    const order = { id: ORDER, product_id: P1, creator_id: CREATOR, buyer_email: "ana@example.com", buyer_first_name: "Ana", buyer_id: null, status: "completed", amount_cents: 1200, created_at: iso(20) }
    const rq = (over: Record<string, unknown>) => ({ id: R(50), creator_id: CREATOR, order_id: ORDER, product_id: P1, email: "ana@example.com", first_name: "Ana", origin: null, status: "sent", due_at: iso(10), sent_at: iso(10), reminded_at: null, last_sent_at: null, attempts: 1, ...over })
    process.env.REVIEW_LINK_SECRET = "a-long-enough-test-secret-for-review-links"
    let d = db([], { orders: [order], review_requests: [rq({})] })
    S.admin = d
    S.sent = []
    const resend = await requestRoute.POST(req(`/api/app/reviews/requests/${R(50)}`, "POST", { action: "resend" }), { params: Promise.resolve({ id: R(50) }) })
    check("send again: the first email, to the buyer, with its own message id", resend.status === 200 && S.sent.length === 1 && S.sent[0].to === "ana@example.com" && /^<review\.[^.]+\.1\.[a-z0-9]+@storelib\.com>$/.test(S.sent[0].messageId) && !!d.tables.review_requests[0].last_sent_at, { status: resend.status, sent: S.sent })
    const soon = await requestRoute.POST(req(`/api/app/reviews/requests/${R(50)}`, "POST", { action: "resend" }), { params: Promise.resolve({ id: R(50) }) })
    check("  again the same day: refused, nothing sent", soon.status === 409 && S.sent.length === 1)
    const cancel = await requestRoute.POST(req(`/api/app/reviews/requests/${R(50)}`, "POST", { action: "cancel" }), { params: Promise.resolve({ id: R(50) }) })
    check("cancel: kept as skipped, cancelled, so the hourly run never takes it", cancel.status === 200 && d.tables.review_requests[0].status === "skipped" && d.tables.review_requests[0].skip_reason === "cancelled")
    d = db([], { orders: [order], review_requests: [rq({ status: "scheduled", sent_at: null })], email_suppressions: [{ email: "ana@example.com", scope: "review_requests", lifted_at: null }] })
    S.admin = d
    S.sent = []
    const blocked = await requestRoute.POST(req(`/api/app/reviews/requests/${R(50)}`, "POST", { action: "send_now" }), { params: Promise.resolve({ id: R(50) }) })
    check("send now to an address that turned review emails off: refused, in words, nothing sent", blocked.status === 409 && /turned review emails off/.test((await json(blocked)).error ?? "") && S.sent.length === 0)
    const theirs = await requestRoute.POST(req(`/api/app/reviews/requests/${R(51)}`, "POST", { action: "cancel" }), { params: Promise.resolve({ id: R(51) }) })
    check("another store's request, or none: 404", theirs.status === 404)
  }

  realLog("\nThe review page's spam check")
  {
    const { signRequestWith } = await import("../lib/reviews/request-token")
    const order = { id: ORDER, product_id: P1, creator_id: CREATOR, buyer_email: "ana@example.com", buyer_first_name: "Ana", buyer_id: null, status: "completed", amount_cents: 1200, created_at: iso(20), receipt_token: "tok" }
    const d = db([], { orders: [order], review_requests: [{ id: R(60), creator_id: CREATOR, order_id: ORDER, product_id: P1, email: "ana@example.com", status: "sent", due_at: iso(1), sent_at: iso(1), attempts: 1, review_id: null }], review_uploads: [], seller_notifications: [], entitlements: [] })
    d.tables.store_settings[0].reviews = { enabled: true, publish: "auto", minStars: 1, spam: { holdLinks: true } }
    S.admin = d
    const token = signRequestWith("a-long-enough-test-secret-for-review-links", R(60))
    const bot = await writeRoute.POST(req("/api/reviews/request", "POST", { token, rating: 5, content: "Great", website: "spam.example" }))
    check("the hidden field filled in: the usual answer, nothing kept", bot.status === 200 && d.tables.reviews.length === 0)
    const fast = await writeRoute.POST(req("/api/reviews/request", "POST", { token, rating: 5, content: "Great", openedAt: Date.now() - 300 }))
    check("sent faster than a person types: asked to wait, nothing kept", fast.status === 429 && d.tables.reviews.length === 0)
    const link = await writeRoute.POST(req("/api/reviews/request", "POST", { token, rating: 5, content: "Buy at cheap-bags.shop", openedAt: Date.now() - 60_000 }))
    check("a review with a link: kept, and waits for the store on its website (a verified buyer's stays on Storelib)", link.status === 200 && (await json(link)).status === "pending" && d.tables.reviews[0]?.site_status === "pending" && d.tables.reviews[0]?.status === "published", d.tables.reviews[0])
  }
}

/* ── The area ───────────────────────────────────────────────────────── */

function area() {
  realLog("\nThe area")
  check("six tabs, in order, each its own address", REVIEWS_NAV.map((t) => t.id).join() === "overview,reviews,requests,widgets,analytics,settings" && new Set(REVIEWS_NAV.map((t) => t.href)).size === 6)
  check("a path finds its tab; Import is under Reviews; Overview only for /app/reviews", reviewsTabFor("/app/reviews") === "overview" && reviewsTabFor("/app/reviews/") === "overview" && reviewsTabFor("/app/reviews/list") === "reviews" && reviewsTabFor("/app/reviews/import") === "reviews" && reviewsTabFor("/app/reviews/widgets/carousel") === "widgets" && reviewsTabFor("/app/reviews/settings") === "settings")
  const overview = raw("app/app/reviews/page.tsx")
  check("old addresses keep working: ?review=<id> and ?status=pending open the Reviews tab", /if \(one\("review"\) \|\| one\("status"\)\)/.test(overview) && /redirect\(`\/app\/reviews\/list\?\$\{q\.toString\(\)\}`\)/.test(overview))
  check("every page of the area has its route", ["list", "import", "requests", "widgets", "analytics", "settings"].every((p) => /export default async function/.test(raw(`app/app/reviews/${p}/page.tsx`))) && /<ReviewsShell pending=/.test(raw("app/app/reviews/layout.tsx")))
  const panel = read("components/app/settings/reviews-app-panel.tsx")
  check("Settings › Integrations › Storelib Reviews links here and keeps no second copy of a setting", /reviewsHref\("settings"\)/.test(panel) && !/SelectInput|Toggle /.test(panel) && !/api<\{ settings: ReviewsAppSettings \}>\("\/api\/store\/reviews-app", \{ method: "PUT"/.test(panel))
  const settings = read("components/app/reviews/settings-form.tsx")
  check("Reviews › Settings: the switch, moderation three ways, spam, the website", /Storelib Reviews is on/.test(settings) && /"Publish right away"/.test(settings) && /"Publish from a rating"/.test(settings) && /"Approve each one"/.test(settings) && /Hold reviews with a link/.test(settings) && /label="Add to product pages"/.test(settings))
  const list = read("app/app/reviews/reviews-client.tsx")
  check("Verified purchase only for a review tied to a real order", /const purchase = review\.verified && !!review\.order_id/.test(list))
  check("a change is drawn at once and put back when the server says no", /patchRow\(review\.id, \(\) => before\)/.test(list) && /optimisticRow\(row, action\)/.test(list))
  const part = raw("supabase/sql/run-now/204_reviews_dashboard.sql")
  check("SQL part 204: one statement a line, guarded, safe to run again, schema reloaded last", part.trim().split("\n").length === 6 && /CREATE TABLE IF NOT EXISTS public\.review_import_batches/.test(part) && /ADD COLUMN IF NOT EXISTS import_batch_id/.test(part) && /REVOKE ALL ON public\.review_import_batches FROM PUBLIC, anon, authenticated/.test(part) && /ENABLE ROW LEVEL SECURITY/.test(part) && /'video\/mp4'/.test(part) && /pg_column_size\(reviews\) < 16384/.test(part) && /notify pgrst, 'reload schema';$/.test(part.trim()))
  check("  the same as its migration, checked after, listed, and in the bundles", part === raw("supabase/migrations/20270128_reviews_dashboard.sql") && /as p204_reviews_dashboard;/.test(raw("supabase/sql/run-now/99_check_after.sql")) && /204_reviews_dashboard\.sql/.test(raw("supabase/sql/run-now/README.md")) && raw("supabase/sql/run-four/3_of_4_latest.sql").includes(part.split("\n")[1]) && /part: "204", file: "204_reviews_dashboard\.sql"/.test(raw("lib/admin/sql-parts.generated.ts")))
}

async function main() {
  importing()
  moderation()
  requests()
  analytics()
  rules()
  area()
  await routes()
  realLog(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    realLog(`  failing:\n    ${failures.join("\n    ")}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  realLog(e)
  process.exit(1)
})
