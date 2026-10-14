import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { normalizeLocale } from "@/lib/markets/locales"
import { canDraftWithAi } from "@/lib/markets/translate-ai"
import { OPEN_NOT_SET_UP } from "@/lib/markets/open-translate"
import { draftRound } from "@/lib/markets/translation-press"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * No batch starts after this much of the press: what came back by then is
 * saved and counted, and the rest is the next press's (the sheet asks
 * again until nothing is left). Leaves room inside maxDuration for the save.
 */
const DRAFT_WINDOW_MS = 85_000

/**
 * POST { locale }: "Translate with AI". The website's texts in that language
 * that are missing or outdated, drafted by Storelib AI. A translation the
 * merchant wrote or edited is never sent or replaced, outdated or not: it
 * shows as outdated in the sheet for them to update. Drafted by Storelib AI
 * (lib/markets/translate-ai.ts) and saved as drafts to review. The store's
 * own, through its owner; twelve presses an hour, which is one whole "Translate
 * everything" (the sheet presses up to twelve times), as each is a paid call.
 * What AI may write is lib/markets/translate.ts aiMayWrite, the same rule as
 * the hourly job's (lib/markets/auto-translate.ts).
 */

export async function POST(request: Request) {
  const started = Date.now()
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  if (!canDraftWithAi()) return physicalJson({ error: OPEN_NOT_SET_UP }, 503)
  const limited = await rateLimit({ bucket: "site-translations-ai", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 12, seconds: 3600 }, { limit: 40, seconds: 86400 }], message: "Translating can be started a few times an hour. Try again later." })
  if (limited) return limited
  const body = await readBody(request)
  const locale = normalizeLocale(body?.locale)
  if (!locale) return physicalJson({ error: "Add this language to your website first." }, 400)
  /* One round, the same as the background job's (lib/markets/translation-press.ts). */
  const r = await draftRound(c.db, c.creatorId, locale, c.userId, started + DRAFT_WINDOW_MS)
  if (r.ok === false) return physicalJson({ error: r.error }, r.status)
  if (r.drafted > 0) await recordActivity(c.db, c, { action: "website.translations", meta: { locale, drafted: r.drafted } })
  return physicalJson({ drafted: r.drafted, left: r.left, done: r.done, total: r.total })
}
