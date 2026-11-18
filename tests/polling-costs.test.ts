/**
 * ===========================================================================
 *  WHAT THE BACKGROUND READS AND THE CRONS COST
 * ===========================================================================
 * Changed on purpose (the owner: lower Vercel costs). Every check here pins a
 * cadence or a guard that keeps a recurring function call from happening when
 * nothing would come of it, while the person at the screen still sees the
 * same thing: focus, visibility, the pointer and actions still read at once.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  POLL_ACTIVE_MS,
  POLL_BASE_MS,
  POLL_IDLE_AFTER_MS,
  POLL_IDLE_MS,
  POLL_MAX_MS,
  nextPollDelay,
  visiblePollDelay,
} from "@/lib/agent-access/connection-mark"
import { KEEP_FRESH_MAX } from "@/components/nav/keep-fresh"
import { SWEEP_HOUR_UTC, isPayoutSweepHour } from "@/lib/notify/payout-weekly"
import { CURSOR_OVERLAP_MIN, MAX_WINDOW_MIN, answeredComplete, windowFromCursor } from "@/lib/storage/metadata-sweep"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nPayouts page")
{
  const payouts = read("app/(storelib)/app/payouts/payouts-client.tsx")
  check("the revenue chart reads once a minute in the background", /setInterval\(tick, 60000\)/.test(payouts) && !/setInterval\(tick, 15000\)/.test(payouts))
  check("Stripe balances every two minutes in the background", /setInterval\(tick, 120000\)/.test(payouts) && !/setInterval\(tick, 30000\)/.test(payouts))
  check("both still read when the tab comes back or gains focus", (payouts.match(/addEventListener\("visibilitychange", onVisible\)/g) ?? []).length >= 2 && (payouts.match(/addEventListener\("focus", onVisible\)/g) ?? []).length >= 2)
  /* Changed on purpose (rel-commerce MEDIUM-4): a user action asks the server for a fresh read past its half minute cache. */
  check("a payout request still reads the balances again at once", /refreshBalances\(\{ fresh: true \}\);\s*setTimeout\(\(\) => refreshBalances\(\{ fresh: true \}\), 3000\)/.test(payouts))
}

console.log("\nBuilder activity")
{
  check("while changes arrive the editor asks about once a second; idle stays slow", POLL_ACTIVE_MS === 1_000 && POLL_BASE_MS === 5_000 && POLL_MAX_MS === 10_000)
  check("changes arriving read on that quick cadence", nextPollDelay(POLL_IDLE_MS, true, 10 * 60_000) === POLL_ACTIVE_MS)
  check("a minute quiet is still the quick end", nextPollDelay(POLL_MAX_MS, false, 60_000) === POLL_MAX_MS)
  check("two quiet minutes: every thirty seconds", POLL_IDLE_AFTER_MS === 120_000 && nextPollDelay(POLL_MAX_MS, false, POLL_IDLE_AFTER_MS) === POLL_IDLE_MS && POLL_IDLE_MS === 30_000)
  const reads = (quietMinutes: number) => Math.ceil((POLL_IDLE_AFTER_MS / POLL_MAX_MS)) + Math.ceil((quietMinutes * 60_000 - POLL_IDLE_AFTER_MS) / POLL_IDLE_MS)
  check("an hour left alone is about 130 reads, where it was 360", reads(60) <= 130, reads(60))
  const hook = read("components/website-builder/site-connections.tsx")
  check("the quiet clock starts again on a change, a wake, a press or a key", /if \(arrived\) lively = Date\.now\(\)/.test(hook) && /woke = Date\.now\(\)\s*lively = Date\.now\(\)/.test(hook) && /addEventListener\("pointerdown", stir, true\)/.test(hook) && /addEventListener\("keydown", stir, true\)/.test(hook))
  /* Changed on purpose (round 54): once a second while in use, slower when the editor is left alone, quick again on a press or a return. */
  check("a visible editor asks once a second while in use, so a push is not left until a refresh", /document\.visibilityState === "visible" \? \(arrived && eventsFull \? 200 : visiblePollDelay\(quiet\)\)/.test(hook))
  check("in use (two minutes) once a second, then every five seconds, every fifteen after ten quiet minutes", visiblePollDelay(0) === 1_000 && visiblePollDelay(119_000) === 1_000 && visiblePollDelay(120_000) === 5_000 && visiblePollDelay(9 * 60_000) === 5_000 && visiblePollDelay(10 * 60_000) === 15_000)
  check("a press after being left alone reads within a second, without a reschedule per key", /if \(delay > POLL_BASE_MS && !busy && !stopped\) \{\s*delay = POLL_ACTIVE_MS\s*schedule\(delay\)/.test(hook))
  check("nothing connected and left alone: every thirty seconds", /schedule\(connected \|\| holding \? delay : quiet < POLL_IDLE_AFTER_MS \? POLL_BASE_MS : POLL_IDLE_MS\)/.test(hook))
  check("and the wakes on focus, visibility and the pointer are kept", /addEventListener\("visibilitychange", wake\)/.test(hook) && /addEventListener\("focus", wake\)/.test(hook) && /addEventListener\("pointerenter", wake\)/.test(hook))
  check("every listener is taken off again", /removeEventListener\("pointerdown", stir, true\)/.test(hook) && /removeEventListener\("keydown", stir, true\)/.test(hook))
}

console.log("\nCrons")
{
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }
  const at = (p: string) => vercel.crons.find((c) => c.path === p)?.schedule
  check("translation jobs every five minutes, the net under the run that asks for the next one", at("/api/cron/translation-jobs") === "*/5 * * * *" && /askNextRun\(/.test(read("app/api/cron/translation-jobs/route.ts")))
  check("and /admin's list says the same", /\{ path: "\/api\/cron\/translation-jobs", schedule: "\*\/5 \* \* \* \*"/.test(read("lib/admin/schema-expectations.ts")))
  for (const job of ["community", "notify", "memberships", "physical"]) {
    const route = read(`app/api/cron/${job}/route.ts`)
    check(`${job}: a log line only when the run did something, errors always`, /if \(didWork\) console\.log\(/.test(route) && !/^\s*console\.log\(/m.test(route) && /console\.error\(/.test(route))
  }
  const notifications = read("app/api/cron/notifications/route.ts")
  check("payout reminders swept once a day, in one hour's run", /if \(isPayoutSweepHour\(started\)\) \{\s*const weekly = await sweepPayoutReminders\(/.test(notifications))
  check("still before the worker sends", notifications.indexOf("sweepPayoutReminders(") > 0 && notifications.indexOf("sweepPayoutReminders(") < notifications.indexOf("runNotificationWork("))
  const day = Date.UTC(2026, 9, 15)
  const hours = Array.from({ length: 24 }, (_, h) => isPayoutSweepHour(day + h * 3_600_000 + 25 * 60_000))
  check("exactly one of the day's 24 runs sweeps", hours.filter(Boolean).length === 1 && hours[SWEEP_HOUR_UTC])
}

console.log("\nImage metadata sweep")
{
  const now = Date.UTC(2026, 9, 15, 12, 10)
  check("no record of a complete run: the old 150 minutes", windowFromCursor(null, now) === MAX_WINDOW_MIN && MAX_WINDOW_MIN === 150)
  check("an hour after a complete run: 70 minutes, ten of them overlap", windowFromCursor(now - 60 * 60_000, now) === 60 + CURSOR_OVERLAP_MIN && CURSOR_OVERLAP_MIN === 10)
  check("a missed hour is read again", windowFromCursor(now - 120 * 60_000, now) === 130)
  check("never more than the old window", windowFromCursor(now - 24 * 3_600_000, now) === MAX_WINDOW_MIN)
  check("a start in the future is not trusted", windowFromCursor(now + 60_000, now) === MAX_WINDOW_MIN)
  check("a complete answer is told by its first characters", answeredComplete(JSON.stringify({ complete: true, window: 70, checked: 3 })) && !answeredComplete(JSON.stringify({ complete: false })) && !answeredComplete(null))
  const sweep = read("lib/storage/metadata-sweep.ts")
  check("a run left short by its limit, a download or the budget is not complete", /let complete = rows\.length < limit/.test(sweep) && /if \(downloadError \|\| !blob\) \{\s*complete = false/.test(sweep) && /if \(Date\.now\(\) > stopAt\) \{\s*complete = false/.test(sweep))
  check("the cursor is the job's own run records, no new column", /\.from\("cron_runs"\)/.test(sweep) && /\.eq\("ok", true\)/.test(sweep))
  const route = read("app/api/cron/strip-image-metadata/route.ts")
  check("the answer starts with complete, and a narrower look by hand never is", /NextResponse\.json\(\{ complete, window: since,/.test(route) && /since >= lookBack/.test(route))
  check("a picture is still rewritten only when it had metadata, at the same path", /if \(clean === bytes\) continue/.test(sweep) && /upsert: true/.test(sweep))
}

console.log("\nCaches and read aheads")
{
  for (const f of ["lib/platform/buyer-header-theme.ts", "lib/platform/explore-marketplace.ts", "lib/platform/explore-discover-mode-switcher.ts", "lib/platform/physical-commerce.ts"]) {
    const src = read(f)
    check(`${f}: five minutes, cleared by its tag`, /revalidate: 300\b/.test(src) && !/revalidate: 30\b/.test(src))
  }
  const flags = read("app/api/admin/marketplace-flags/route.ts")
  check("the admin switch immediately expires all four tags using Next 16's explicit profile", ["EXPLORE_MARKETPLACE_CACHE_TAG", "EXPLORE_DISCOVER_MODE_SWITCHER_CACHE_TAG", "PHYSICAL_COMMERCE_CACHE_TAG", "BUYER_HEADER_LIGHT_CACHE_TAG"].every((t) => flags.includes(`revalidateTag(${t}, { expire: 0 })`)))
  const pills = read("components/profile/profile-owner-pills.tsx")
  check("the profile keeps two pages read, not six", KEEP_FRESH_MAX === 2 && /\.slice\(0, KEEP_FRESH_MAX\)/.test(pills))
  check("Settings first, then the first panel; Edit profile's copy of Settings takes no place", /href !== EDIT_PROFILE_HREF/.test(pills) && /const order: OwnerPillKey\[\] = \["settings", "posts"/.test(pills))
  check("every pill is still read on idle and on the press", /prefetchOnIdle\(router, ahead\.split\(" "\)\)/.test(pills) && /prefetchHref\(router, p\.href, "press"\)/.test(pills))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
