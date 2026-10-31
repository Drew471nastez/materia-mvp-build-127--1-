import { NextResponse } from "next/server"
import { requireTeamPermission } from "@/lib/team/server"
import { getMainDomain } from "@/lib/url-helpers"
import { countReportAnswer, reportQuestion, type Answer } from "@/lib/analytics/report-answer"
import { isAnalyticsUnavailable } from "@/lib/analytics/report-read"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/* A bounded answer: the counting functions are waited for RPC_BUDGET_MS (45s), a raw read for RAW_READ_BUDGET_MS. */
export const maxDuration = 60

/*
  When the database's counting function fails (a timeout, an overloaded
  database), the answer says so at once: the page keeps its frame and its
  "could not be loaded" line, and no raw events are read in its place
  (lib/analytics/report-read rpc).
*/
const UNAVAILABLE = "Analytics are unavailable right now. Try again in a minute."

/**
 * The Analytics page's figures, its chart and every card under it, and
 * Home's chart (the same answer), for the signed-in creator only.
 *
 * WHAT IT COUNTS. lib/analytics/reports.ts has the rules and
 * lib/analytics/reports.ts says them in words. Visits are counted in
 * Postgres (analytics_report, lib/analytics/report-read), orders and money
 * from `orders`, as the Orders page counts them.
 *
 * WHICH PLACE. `property` is All (absent), `creator_page`, `onepage` or
 * `website:<install id>` (lib/analytics/properties). A website that is not
 * the creator's own is refused with a 404 before anything is read: the
 * creator is always the signed in user's, never the request's. The old
 * OnePage view (`mode=onepage`) is the OnePage property now.
 *
 * FIGURES FIRST. With `stream=1` the answer is lines of JSON: the figures
 * (every tab and the chart) as soon as they are counted, then everything,
 * the lists included. The two are counted side by side.
 *
 * ASKED TWICE IN A FEW SECONDS, COUNTED ONCE. The same question from the
 * same person within CACHE_MS is answered from memory, and one already
 * being counted is waited for rather than started again. The key is the
 * person and the whole question, so nobody is ever answered with somebody
 * else's figures.
 */
/* How long an answer is reused for the same question from the same person. */
const CACHE_MS = 15_000


/* ─── Answers just given, and ones being counted ──────────────────────── */

const answers = new Map<string, { at: number; answer: Answer }>()
const counting = new Map<string, Promise<Answer>>()

function remembered(key: string): Answer | null {
  const hit = answers.get(key)
  if (!hit) return null
  if (Date.now() - hit.at <= CACHE_MS) return hit.answer
  answers.delete(key)
  return null
}

/** Counted once however many ask at the same moment, and remembered for CACHE_MS. */
function once(key: string, count: () => Promise<Answer>): Promise<Answer> {
  const going = counting.get(key)
  if (going) return going
  const p = count()
    .then((answer) => {
      answers.set(key, { at: Date.now(), answer })
      /* A small memory: the oldest goes first. */
      while (answers.size > 200) answers.delete(answers.keys().next().value as string)
      return answer
    })
    .finally(() => counting.delete(key))
  counting.set(key, p)
  return p
}

/*
  Private, and fresh for the few seconds the server keeps it too. Vary, so a
  browser shared by two accounts never hands one of them the other's answer.
*/
const HEADERS = { "Cache-Control": `private, max-age=${CACHE_MS / 1000}`, Vary: "Cookie, Authorization" }

/**
 * The answer as lines of JSON: `figures` when they are counted, if that is
 * before everything is, then `all`. A failure is a line of its own.
 */
function streamed(figures: Promise<Answer | null>, all: Promise<Answer>) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let done = false
      figures.then(
        (f) => {
          if (f && !done) controller.enqueue(encoder.encode(`${JSON.stringify({ part: "figures", ...f })}\n`))
        },
        () => {},
      )
      try {
        const answer = await all
        done = true
        controller.enqueue(encoder.encode(`${JSON.stringify({ part: "all", ...answer })}\n`))
      } catch (error) {
        done = true
        console.error("[analytics/reports]", (error as Error).message)
        const unavailable = isAnalyticsUnavailable(error)
        controller.enqueue(encoder.encode(`${JSON.stringify({ part: "error", error: unavailable ? UNAVAILABLE : "Could not read analytics", ...(unavailable ? { unavailable: true } : {}) })}\n`))
      }
      controller.close()
    },
  })
  return new Response(body, { headers: { ...HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8" } })
}

async function answered(all: Promise<Answer>, label: string) {
  try {
    return NextResponse.json(await all, { headers: HEADERS })
  } catch (error) {
    console.error(label, (error as Error).message)
    if (isAnalyticsUnavailable(error)) return NextResponse.json({ error: UNAVAILABLE, unavailable: true }, { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } })
    return NextResponse.json({ error: "Could not read analytics" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  /* The store's figures, for its owner or a team member given Analytics (lib/team). */
  const gate = await requireTeamPermission("analytics")
  if (gate instanceof NextResponse) return gate

  const url = new URL(request.url)
  const stream = url.searchParams.get("stream") === "1"
  const admin = gate.db
  /* The question, for this store only (lib/analytics/report-answer). */
  const asked = await reportQuestion(admin, gate.userId, url, getMainDomain(), { creatorId: gate.creatorId, ownerUserId: gate.ownerUserId })
  if ("error" in asked) return NextResponse.json({ error: asked.error }, { status: asked.status })

  /* Who asks, in which store, and the whole question: a member's own store and the one they work in are two answers. */
  const key = `${gate.userId}|${gate.creatorId}|${asked.question}`
  const known = remembered(key)
  if (known) return stream ? streamed(Promise.resolve(null), Promise.resolve(known)) : NextResponse.json(known, { headers: HEADERS })

  let figures: Promise<Answer | null> = Promise.resolve(null)
  const all = once(key, () => countReportAnswer(admin, asked.q, asked.productTitles, asked.productTypes, gate.viewer, stream ? (f) => (figures = f) : undefined))
  return stream ? streamed(figures, all) : answered(all, "[analytics/reports]")
}
