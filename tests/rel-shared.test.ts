/**
 * ===========================================================================
 *  COMMUNITIES AND SHARED JOBS THAT HOLD (rel-shared)
 * ===========================================================================
 * Each case is one reliability gap found in the communities and shared
 * systems audit, simulated with a fake and measured:
 *
 *   a community file posted without the complete step   still size and content checked
 *   "Payout available" after holds are released           to the user id, awaited
 *   the community and physical crons                      one clock from the request, under maxDuration
 *
 *   node scripts/run-push-tests.mjs (in the list as tests/rel-shared.test.ts)
 */
import { ownedMedia } from "@/lib/communities/server/feed"
import { communityFilesExist } from "@/lib/communities/server/post-files"
import { MEMBER_FILE_MAX_BYTES } from "@/lib/communities/post-media"
import type { CommunityRow, PostMedia } from "@/lib/communities/types"
import type { Viewer } from "@/lib/communities/server/context"
import { pushPayoutsAvailable } from "@/lib/payments/payout-push"
import { runBudgetMs, runDeadline } from "@/lib/observability/run-deadline"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))
const realFetch = globalThis.fetch
const keepAlive = setInterval(() => {}, 1_000)

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
function viewer(o: Partial<Viewer> = {}): Viewer {
  return { userId: U(1), member: null, role: "member", active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...o } as Viewer
}
const community = { id: U(900), creator_id: U(800), slug: "studio", name: "Studio", chat_enabled: true } as CommunityRow

/** Storage as the post's checks see it: a folder listing with sizes, signed reads, removals. Bytes are served by the fetch below. */
function storageFake(files: Record<string, { size: number; bytes: Uint8Array }>) {
  const removed: string[] = []
  const db = {
    from() {
      /* the security log: written, never read here */
      return { insert: async () => ({ error: null }) }
    },
    storage: {
      from(_bucket: string) {
        return {
          async list(folder: string, opts: { search: string }) {
            const found = Object.entries(files)
              .filter(([p]) => p === `${folder}/${opts.search}`)
              .map(([p, f]) => ({ name: p.split("/").pop(), metadata: { size: f.size } }))
            return { data: found, error: null }
          },
          async createSignedUrl(path: string) {
            return { data: { signedUrl: `https://fake.storage/${encodeURIComponent(path)}` }, error: null }
          },
          async remove(paths: string[]) {
            removed.push(...paths)
            return { data: null, error: null }
          },
        }
      },
    },
  }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = String(input)
    const path = decodeURIComponent(href.replace("https://fake.storage/", ""))
    const f = files[path]
    if (!f) return new Response(null, { status: 404 })
    const range = String((init?.headers as Record<string, string> | undefined)?.Range ?? "")
    const m = /bytes=(\d+)-(\d+)/.exec(range)
    const start = m ? Number(m[1]) : 0
    const end = m ? Number(m[2]) : f.bytes.length - 1
    return new Response(f.bytes.slice(start, end + 1), { status: 206 })
  }) as typeof fetch
  return { db, removed }
}

const pdfBytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n")
/** A Windows program: "MZ", then the PE header the sniffer looks for. */
const exeBytes = (() => {
  const b = new Uint8Array(512)
  b[0] = 0x4d
  b[1] = 0x5a
  b[0x3c] = 0x80
  b[0x80] = 0x50
  b[0x81] = 0x45
  return b
})()
const pathOf = (fileId: string, ext: string, uploader = U(1)) => `${U(800)}/community-files/${U(900)}/${uploader}/${fileId}.${ext}`
const fileMedia = (fileId: string, name: string, size: number): PostMedia => ({ type: "file", assetId: fileId, name, size, store: "community" }) as PostMedia

async function main() {
  // -------------------------------------------------------------------------
  console.log("\nA community file posted without the complete step is still checked (F1)")
  {
    /* The browser called prepare, PUT a program renamed .pdf, and never called complete. */
    const disguised = storageFake({ [pathOf(U(11), "pdf")]: { size: exeBytes.length, bytes: exeBytes } })
    const r = await ownedMedia(disguised.db as never, community, viewer(), [fileMedia(U(11), "Notes.pdf", exeBytes.length)])
    check("a program named .pdf is refused at posting", !r.ok, r)
    check("and it is removed from storage, as complete would have", disguised.removed.includes(pathOf(U(11), "pdf")), disguised.removed)

    /* Over the member's 50 MB limit (storage's own record of the size), never completed. */
    const huge = storageFake({ [pathOf(U(12), "pdf")]: { size: MEMBER_FILE_MAX_BYTES + 1, bytes: pdfBytes } })
    const big = await ownedMedia(huge.db as never, community, viewer(), [fileMedia(U(12), "Big.pdf", 1000)])
    check("a file over the member's limit is refused at posting, saying the limit", !big.ok && /50 MB/.test((big as { error: string }).error), big)
    check("and it is removed", huge.removed.includes(pathOf(U(12), "pdf")))

    /* Staff may send up to 500 MB: the same size from a moderator is taken. */
    const staffBig = storageFake({ [pathOf(U(13), "pdf")]: { size: MEMBER_FILE_MAX_BYTES + 1, bytes: pdfBytes } })
    const mod = await ownedMedia(staffBig.db as never, community, viewer({ role: "moderator" }), [fileMedia(U(13), "Big.pdf", 1000)])
    check("a moderator's file over the member limit is taken (staff limit)", mod.ok && staffBig.removed.length === 0, mod)

    /* The ordinary path: a real PDF, completed or not, posts as before with its checked name. */
    const fine = storageFake({ [pathOf(U(14), "pdf")]: { size: pdfBytes.length, bytes: pdfBytes } })
    const ok = await ownedMedia(fine.db as never, community, viewer(), [fileMedia(U(14), "Plan.pdf", pdfBytes.length)])
    check("a real PDF posts, keeping its name, nothing removed", ok.ok && (ok.value[0] as { name: string }).name === "Plan.pdf" && fine.removed.length === 0, ok)

    /* Existing posts: a file the post already had is not looked at again (not even listed), so old posts edit as before. */
    const empty = storageFake({})
    const kept = fileMedia(U(15), "Old.pdf", 10)
    const edit = await ownedMedia(empty.db as never, community, viewer(), [kept], [kept])
    check("a file a post already had is kept without a new check", edit.ok && empty.removed.length === 0, edit)

    /* Not there at all: the old sentence. */
    const none = await communityFilesExist(storageFake({}).db as never, community, U(1), [{ fileId: U(16), name: "x.pdf" }])
    check("a file that never arrived is still refused with the upload again sentence", !none.ok && /Upload it again/.test((none as { error: string }).error))
    globalThis.fetch = realFetch
  }

  // -------------------------------------------------------------------------
  console.log("\n\"Payout available\" goes to the seller's user id, and the run waits for it (F2)")
  {
    const creators: Record<string, string> = { [U(501)]: U(601), [U(502)]: U(602) }
    const asked: string[][] = []
    const db = {
      from(table: string) {
        return {
          select() {
            return {
              async in(_col: string, ids: string[]) {
                asked.push([table, ...ids])
                return { data: ids.filter((id) => creators[id]).map((id) => ({ id, user_id: creators[id] })), error: null }
              },
            }
          },
        }
      },
    }
    const sentTo: [string, number][] = []
    let inFlight = 0
    const send = async (userId: string, cents: number) => {
      inFlight++
      await new Promise((r) => setTimeout(r, 20))
      sentTo.push([userId, cents])
      inFlight--
    }
    const r = await pushPayoutsAvailable(db as never, [{ creatorId: U(501), cents: 1200 }, { creatorId: U(502), cents: 0 }, { creatorId: U(503), cents: 500 }], { send })
    check("the push goes to the creator's user id, read from creators", sentTo.length === 1 && sentTo[0][0] === U(601) && sentTo[0][1] === 1200, sentTo)
    check("nothing released, no push; a creator with no account is skipped", r.sent === 1 && r.skipped === 1, r)
    check("the creators are read once, by id", asked.length === 1 && asked[0][0] === "creators", asked)
    check("every send has finished when the helper returns (awaited, nothing left in flight)", inFlight === 0)

    const failing = await pushPayoutsAvailable(db as never, [{ creatorId: U(501), cents: 1 }], { send: async () => { throw new Error("no device") } })
    check("a push that fails never fails the run", failing.sent === 0 && failing.skipped === 1)

    let t = 0
    const slow = await pushPayoutsAvailable(db as never, Array.from({ length: 50 }, () => ({ creatorId: U(501), cents: 1 })), { send: async () => { t += 1_000 }, budgetMs: 25_000, now: () => t })
    check("past its time budget the rest wait for the next run", slow.sent === 30 && slow.skipped === 20, slow)

    const route = code("app/api/cron/release-holds/route.ts")
    check("release-holds no longer calls notifyPayoutAvailable with a creator id, fire and forget", !/notifyPayoutAvailable\(/.test(route))
    check("release-holds awaits the payout pushes on both paths", (route.match(/await pushPayoutsAvailable\(/g) ?? []).length === 2)
  }

  // -------------------------------------------------------------------------
  console.log("\nOne clock for a whole cron run (F3 community, F4 physical)")
  {
    /* The community run's steps, each spending ALL of the budget it is handed (a busy queue): the old shape was 10 + 45 + 10 + 15 s. */
    let t = 1_000_000
    const run = runDeadline(runBudgetMs(60), { started: t, now: () => t })
    const spent: [string, number][] = []
    const step = (name: string, ms: number) => {
      if (ms > 0) {
        spent.push([name, ms])
        t += ms
      }
    }
    t += 300 /* auth and the switch */
    step("posts", run.share(10_000))
    step("jobs", run.shareUntil(35_000, 45_000))
    step("deletions", run.share(10_000))
    step("automations", run.share(15_000))
    check("every step's budget is never negative", spent.every(([, ms]) => ms >= 0), spent)
    check("the whole run ends by 52 s from the request, under the 60 s maxDuration", t - run.started <= 52_000, { total: t - run.started, spent })
    check("the job queue stops by 35 s, so the later steps still get a turn", spent.some(([n]) => n === "deletions") && spent.some(([n]) => n === "automations"), spent)
    t = run.until - 1_000
    check("a step with under two seconds left is skipped, not started", run.share(15_000) === 0)
    check("runBudgetMs leaves a margin under maxDuration", runBudgetMs(60) === 52_000 && runBudgetMs(300) === 292_000)

    const community = code("app/api/cron/community/route.ts")
    check("community: the clock is taken before anything else in the run", /async function runJob\(request: Request\) \{\s*const run = runDeadline\(runBudgetMs\(maxDuration\)\)/.test(community))
    check("community: no step has a fixed budget counted from its own start any more", !/publishDuePosts\(db, Date\.now\(\), 10_000\)/.test(community) && !/runDueDeletions\(db, 10_000\)/.test(community) && !/runChatAutomations\(db, Date\.now\(\), 15_000\)/.test(community) && !/\{ budgetMs: RUN_BUDGET_MS \}/.test(community))

    const physical = code("app/api/cron/physical/route.ts")
    check("physical: the clock starts at the request, before the Stripe sweep and the follow-ups", /async function runJob\(request: Request\) \{\s*const run = runDeadline\(runBudgetMs\(maxDuration\)\)\s*const started = run\.started/.test(physical) && physical.indexOf("const started") < physical.indexOf("cancelStaleSitePayments(") && (physical.match(/const started =/g) ?? []).length === 1)
    check("physical: the Stripe sweep has a limit and a deadline", /cancelStaleSitePayments\(db, Date\.now\(\), SWEEP_LIMIT, started \+ SWEEP_UNTIL_MS\)/.test(physical))
    check("physical: no guard past the run's 52 s", ![...physical.matchAll(/started < (\d+)_000/g)].some((m) => Number(m[1]) > 52))
  }

  console.log("\nThe Stripe sweep stops starting cancels at its deadline (F4)")
  {
    const { cancelStaleSitePayments } = await import("@/lib/checkout/site-payment-sweep")
    const db = {
      from() {
        const q: Record<string, unknown> = {}
        for (const k of ["select", "eq", "is", "not", "lt"]) q[k] = () => q
        q.limit = async () => ({ data: [{ id: "c1", stripe_payment_intent_id: "pi_1", coupon_id: null, coupon_holder: null }], error: null })
        return q
      },
    }
    const counts = await cancelStaleSitePayments(db as never, Date.now(), 20, Date.now() - 1)
    check("past its deadline no Stripe cancel is started (nothing swept, nothing thrown)", counts.shipped === 0 && counts.baskets === 0, counts)
  }

  clearInterval(keepAlive)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
