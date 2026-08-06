/**
 * Social activity push — the decision table.
 *
 * Same discipline as tests/push-notifications.test.ts: these drive the REAL
 * module. Nothing here reimplements a rule, so a change that breaks one breaks
 * a test. Nothing here touches a database, a device or Firebase, because
 * lib/push/activity-notification.ts takes every dependency as an argument —
 * including `now`, which is why quiet hours and the four-hour floor are tested
 * rather than merely hoped for.
 *
 * Run with:  npm run test:push
 */

import {
  planDigest,
  buildDigest,
  summarize,
  roCount,
  dedupeKeyFor,
  dayKey,
  hourIn,
  isQuietHour,
  activityThreadIdFor,
  SETTLE_MS,
  MIN_GAP_MS,
  MAX_AGE_MS,
  MAX_EVENTS_PER_DIGEST,
  type PendingActivity,
} from "../lib/push/activity-notification"
import { tapTargetFor } from "../lib/push/tap-target"

// ── harness ─────────────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`)
  }
}
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  check(name, a === b, `got ${a}\n          want ${b}`)
}
function section(title: string) {
  console.log(`\n${title}`)
}

// ── fixtures ────────────────────────────────────────────────────────────────
const ME = "11111111-1111-4111-8111-111111111111"
const ANA = "22222222-2222-4222-8222-222222222222"
const BOB = "33333333-3333-4333-8333-333333333333"
const LISTING_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LISTING_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

/** Noon UTC, mid-January — no DST ambiguity anywhere in these tests. */
const NOW = new Date("2026-01-15T12:00:00Z")

let seq = 0
function ev(
  kind: "like" | "follow" | "trending",
  o: { actorId?: string; actorName?: string; listingId?: string; ageMs?: number } = {},
): PendingActivity {
  return {
    id: `e${++seq}`,
    kind,
    actorId: o.actorId ?? null,
    actorName: o.actorName ?? null,
    listingId: o.listingId ?? null,
    // Old enough to be eligible unless a test says otherwise.
    createdAt: NOW.getTime() - (o.ageMs ?? SETTLE_MS + 1000),
  }
}

/** Everything permissive, in a timezone with no quiet hour at noon. */
function ctx(over: Partial<Parameters<typeof planDigest>[1]> = {}) {
  return { now: NOW, enabled: true, preview: true, lastPushAt: null, timeZone: "UTC", ...over }
}

function run() {
  // ────────────────────────────────────────────────────────────────────────
  section("Romanian counting — '20 DE persoane', not '20 persoane'")
  eq("one is singular", roCount(1, "persoană", "persoane"), "1 persoană")
  eq("two takes the bare plural", roCount(2, "persoană", "persoane"), "2 persoane")
  eq("eight takes the bare plural", roCount(8, "apreciere", "aprecieri"), "8 aprecieri")
  eq("nineteen is the last bare one", roCount(19, "persoană", "persoane"), "19 persoane")
  eq("twenty takes 'de'", roCount(20, "persoană", "persoane"), "20 de persoane")
  eq("ninety-nine takes 'de'", roCount(99, "persoană", "persoane"), "99 de persoane")
  eq("one hundred takes 'de'", roCount(100, "persoană", "persoane"), "100 de persoane")
  eq("one hundred and one does not", roCount(101, "persoană", "persoane"), "101 persoane")
  eq("one hundred and twenty does", roCount(120, "persoană", "persoane"), "120 de persoane")

  // ────────────────────────────────────────────────────────────────────────
  section("dedupe keys — one notification per person per thing, for ever")
  eq(
    "a like is keyed on listing and actor only",
    dedupeKeyFor("like", { actorId: ANA, listingId: LISTING_A, recipientId: ME }),
    `like:${LISTING_A}:${ANA}`,
  )
  check(
    "a like key contains no time, so unlike-and-relike cannot re-notify",
    dedupeKeyFor("like", { actorId: ANA, listingId: LISTING_A, recipientId: ME, day: "2026-01-15" }) ===
      dedupeKeyFor("like", { actorId: ANA, listingId: LISTING_A, recipientId: ME, day: "2026-06-30" }),
  )
  check(
    "a follow key contains no time either",
    dedupeKeyFor("follow", { actorId: ANA, recipientId: ME, day: "2026-01-15" }) ===
      dedupeKeyFor("follow", { actorId: ANA, recipientId: ME, day: "2026-09-09" }),
  )
  check(
    "two different people liking the same listing are two events",
    dedupeKeyFor("like", { actorId: ANA, listingId: LISTING_A, recipientId: ME }) !==
      dedupeKeyFor("like", { actorId: BOB, listingId: LISTING_A, recipientId: ME }),
  )
  check(
    "one person liking two listings is two events",
    dedupeKeyFor("like", { actorId: ANA, listingId: LISTING_A, recipientId: ME }) !==
      dedupeKeyFor("like", { actorId: ANA, listingId: LISTING_B, recipientId: ME }),
  )
  check(
    "trending DOES carry a day, so a listing may trend again next week",
    dedupeKeyFor("trending", { listingId: LISTING_A, recipientId: ME, day: "2026-01-15" }) !==
      dedupeKeyFor("trending", { listingId: LISTING_A, recipientId: ME, day: "2026-01-22" }),
  )
  eq("the day key is calendar-shaped", dayKey(NOW, "UTC"), "2026-01-15")

  // ────────────────────────────────────────────────────────────────────────
  section("quiet hours")
  eq("Bucharest is two hours ahead of UTC in January", hourIn(NOW, "Europe/Bucharest"), 14)
  eq("an unknown zone falls back rather than throwing", hourIn(NOW, "Not/AZone"), 12)
  check("midday is not quiet", !isQuietHour(new Date("2026-01-15T12:00:00Z"), "UTC"))
  check("22:00 is quiet", isQuietHour(new Date("2026-01-15T22:00:00Z"), "UTC"))
  check("03:00 is quiet — the window wraps midnight", isQuietHour(new Date("2026-01-15T03:00:00Z"), "UTC"))
  check("07:59 is still quiet", isQuietHour(new Date("2026-01-15T07:59:00Z"), "UTC"))
  check("08:00 is not", !isQuietHour(new Date("2026-01-15T08:00:00Z"), "UTC"))
  check("21:59 is not", !isQuietHour(new Date("2026-01-15T21:59:00Z"), "UTC"))

  // ────────────────────────────────────────────────────────────────────────
  section("the copy")
  eq(
    "one like, previews on, no name known",
    summarize([ev("like", { actorId: ANA, listingId: LISTING_A })], true).body,
    "Cineva ți-a apreciat anunțul",
  )
  eq(
    "one like, previews on, name known",
    summarize([ev("like", { actorId: ANA, actorName: "Ana", listingId: LISTING_A })], true).body,
    "Ana ți-a apreciat anunțul",
  )
  eq(
    "one like, previews OFF, the name is withheld",
    summarize([ev("like", { actorId: ANA, actorName: "Ana", listingId: LISTING_A })], false).body,
    "Cineva ți-a apreciat anunțul",
  )
  eq(
    "eight likes on one listing — the headline example",
    summarize(
      Array.from({ length: 8 }, (_, i) => ev("like", { actorId: `a${i}`, listingId: LISTING_A })),
      true,
    ).body,
    "8 persoane ți-au apreciat anunțul",
  )
  eq(
    "likes spread over two listings say so",
    summarize(
      [
        ...Array.from({ length: 5 }, (_, i) => ev("like", { actorId: `a${i}`, listingId: LISTING_A })),
        ...Array.from({ length: 3 }, (_, i) => ev("like", { actorId: `b${i}`, listingId: LISTING_B })),
      ],
      true,
    ).body,
    "8 aprecieri pe 2 anunțuri ale tale",
  )
  eq(
    "one follow, previews on",
    summarize([ev("follow", { actorId: ANA, actorName: "Ana" })], true).body,
    "Ana te urmărește acum",
  )
  eq(
    "one follow, previews off",
    summarize([ev("follow", { actorId: ANA, actorName: "Ana" })], false).body,
    "Cineva te urmărește acum",
  )
  eq(
    "three follows",
    summarize([ev("follow", { actorId: "a" }), ev("follow", { actorId: "b" }), ev("follow", { actorId: "c" })], true)
      .body,
    "3 persoane noi te urmăresc",
  )
  eq(
    "one trending listing never names it",
    summarize([ev("trending", { listingId: LISTING_A })], true).body,
    "Unul dintre anunțurile tale atrage multă atenție azi",
  )
  {
    const mixed = summarize(
      [
        ...Array.from({ length: 8 }, (_, i) => ev("like", { actorId: `a${i}`, listingId: LISTING_A })),
        ev("follow", { actorId: BOB, actorName: "Bob" }),
        ev("follow", { actorId: ANA, actorName: "Ana" }),
      ],
      true,
    )
    eq("mixed activity gets a neutral headline", mixed.title, "Activitate nouă")
    eq("mixed activity tallies each kind", mixed.body, "8 aprecieri · 2 urmăritori noi")
    check("a mixed digest names nobody, even with previews on", !mixed.body.includes("Bob") && !mixed.body.includes("Ana"))
  }

  // ────────────────────────────────────────────────────────────────────────
  section("the plan — every gate that stops a push")
  eq(
    "muted sends nothing",
    planDigest([ev("like", { actorId: ANA, listingId: LISTING_A })], ctx({ enabled: false }), ME).reason,
    "muted",
  )
  eq("an empty queue sends nothing", planDigest([], ctx(), ME).reason, "nothing-pending")
  eq(
    "an event younger than the settle window waits",
    planDigest([ev("like", { actorId: ANA, listingId: LISTING_A, ageMs: SETTLE_MS - 1000 })], ctx(), ME).reason,
    "nothing-pending",
  )
  eq(
    "an event past the settle window goes",
    planDigest([ev("like", { actorId: ANA, listingId: LISTING_A, ageMs: SETTLE_MS + 1000 })], ctx(), ME).send,
    true,
  )
  eq(
    "an event older than MAX_AGE is not sent late",
    planDigest([ev("like", { actorId: ANA, listingId: LISTING_A, ageMs: MAX_AGE_MS + 60_000 })], ctx(), ME).reason,
    "nothing-pending",
  )
  eq(
    "inside the four-hour floor, nothing goes out",
    planDigest(
      [ev("like", { actorId: ANA, listingId: LISTING_A })],
      ctx({ lastPushAt: NOW.getTime() - (MIN_GAP_MS - 60_000) }),
      ME,
    ).reason,
    "too-soon",
  )
  eq(
    "past the floor it goes",
    planDigest(
      [ev("like", { actorId: ANA, listingId: LISTING_A })],
      ctx({ lastPushAt: NOW.getTime() - (MIN_GAP_MS + 60_000) }),
      ME,
    ).send,
    true,
  )
  eq(
    "the rate limit leaves the events pending rather than consuming them",
    planDigest(
      [ev("like", { actorId: ANA, listingId: LISTING_A })],
      ctx({ lastPushAt: NOW.getTime() - 60_000 }),
      ME,
    ).eventIds,
    [],
  )
  eq(
    "quiet hours hold everything",
    planDigest(
      [ev("like", { actorId: ANA, listingId: LISTING_A })],
      ctx({ now: new Date("2026-01-15T23:30:00Z") }),
      ME,
    ).reason,
    "quiet-hours",
  )
  {
    // A night's worth of likes, all eligible, at 08:05 — one push, not thirty.
    // Spread across the small hours, so each is hours old by the time the first
    // non-quiet tick runs.
    const morning = new Date("2026-01-15T08:05:00Z")
    const night: PendingActivity[] = Array.from({ length: 30 }, (_, i) => ({
      id: `n${i}`,
      kind: "like",
      actorId: `a${i}`,
      actorName: null,
      listingId: LISTING_A,
      createdAt: morning.getTime() - (30 - i) * 10 * 60_000,
    }))
    const plan = planDigest(night, ctx({ now: morning }), ME)
    eq("the night flushes as exactly one digest", plan.send, true)
    eq("and it consumes all thirty events", plan.eventIds.length, 30)
    eq("and says so once", plan.text?.body, "30 de persoane ți-au apreciat anunțul")
  }
  {
    const many = Array.from({ length: MAX_EVENTS_PER_DIGEST + 25 }, (_, i) =>
      ev("like", { actorId: `a${i}`, listingId: LISTING_A }),
    )
    eq("a digest is capped", planDigest(many, ctx(), ME).eventIds.length, MAX_EVENTS_PER_DIGEST)
  }

  // ────────────────────────────────────────────────────────────────────────
  section("the payload — counts, and nothing else")
  {
    const built = buildDigest(
      [
        ev("like", { actorId: ANA, actorName: "Ana", listingId: LISTING_A }),
        ev("like", { actorId: BOB, actorName: "Bob", listingId: LISTING_B }),
        ev("follow", { actorId: ANA, actorName: "Ana" }),
        ev("trending", { listingId: LISTING_A }),
      ],
      true,
      ME,
    )
    eq("the fields are the agreed set", Object.keys(built.data).sort(), [
      "follows",
      "likes",
      "trending",
      "type",
    ])
    eq("counts are right", [built.data.likes, built.data.follows, built.data.trending], ["2", "1", "1"])
    const blob = JSON.stringify(built.data)
    check("no actor ids travel", !blob.includes(ANA) && !blob.includes(BOB))
    check("no listing ids travel", !blob.includes(LISTING_A) && !blob.includes(LISTING_B))
    check("no names travel", !blob.includes("Ana") && !blob.includes("Bob"))
    eq("one stack per person", built.threadId, activityThreadIdFor(ME))
    eq("and the digest replaces its predecessor", built.collapseId, activityThreadIdFor(ME))
    check("the collapse id is inside the 64-byte APNs limit", Buffer.byteLength(built.collapseId) <= 64)
  }

  // ────────────────────────────────────────────────────────────────────────
  section("tap navigation")
  eq("an activity digest opens the notifications tab", tapTargetFor({ type: "activity" }), "/messages?tab=notificari")
  eq("a test push opens the app", tapTargetFor({ type: "test" }), "/")
  check(
    "an activity payload cannot steer navigation",
    tapTargetFor({ type: "activity", conversationId: "https://evil.example" }) === "/messages?tab=notificari",
  )
  eq("chat taps are unchanged", tapTargetFor({ type: "message" }), "/messages")

  // ────────────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nfailing: ${failures.join(", ")}`)
    process.exit(1)
  }
}

run()
