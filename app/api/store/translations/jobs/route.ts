import { NextResponse, after } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { normalizeLocale } from "@/lib/markets/locales"
import { canDraftWithAi } from "@/lib/markets/translate-ai"
import { AI_UNAVAILABLE, translatableLocale } from "@/lib/markets/translation-press"
import { askNextRun, readJobs, runJob, startJob } from "@/lib/markets/translation-jobs"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** This run works the job for this long after answering, then lets the next run carry on. */
const RUN_MS = 270_000

/**
 * TRANSLATE WITH AI IN THE BACKGROUND (lib/markets/translation-jobs.ts).
 *
 *   GET           every language's job: running, done or failed, with how
 *                 many texts are translated out of all of them
 *   POST {locale} starts one (or joins the one running) and answers at once;
 *                 the work goes on here after the answer, and in the runs
 *                 that follow, whatever the page does
 *
 * `ready: false` without SQL part 177: the page presses round by round itself.
 */
export async function GET() {
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  return physicalJson(await readJobs(c.db, c.creatorId))
}

export async function POST(request: Request) {
  const started = Date.now()
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  if (!canDraftWithAi()) return physicalJson({ error: AI_UNAVAILABLE }, 503)
  const body = await readBody(request)
  const locale = normalizeLocale(body?.locale)
  if (!locale || !(await translatableLocale(c.db, c.creatorId, locale)).ok) return physicalJson({ error: "Add this language to your website first." }, 400)
  const limited = await rateLimit({ bucket: "site-translations-ai", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 12, seconds: 3600 }, { limit: 40, seconds: 86400 }], message: "Translating with AI can be used a few times an hour. Try again later." })
  if (limited) return limited
  const begun = await startJob(c.db, c.creatorId, locale, c.userId)
  if (begun.ok === false) return begun.missing ? physicalJson({ ready: false }, 409) : physicalJson({ error: begun.error }, 500)
  if (begun.run) {
    await recordActivity(c.db, c, { action: "website.translations", meta: { locale, background: true } })
    const origin = new URL(request.url).origin
    after(async () => {
      const r = await runJob(c.db, c.creatorId, locale, started + RUN_MS)
      if (r.more) await askNextRun(origin, c.creatorId, locale)
    })
  }
  return physicalJson({ ready: true, job: begun.job })
}
