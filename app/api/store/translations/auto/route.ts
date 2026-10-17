import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { normalizeLocale } from "@/lib/markets/locales"
import { canDraftWithAi } from "@/lib/markets/translate-ai"
import { OPEN_NOT_SET_UP } from "@/lib/markets/open-translate"
import { translateFieldsNow } from "@/lib/markets/translation-press"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** No translator call starts after this much of the press. */
const WINDOW_MS = 40_000

/**
 * POST { locale, items: [{ key, source, rich }], replaceManual }
 *
 * A few texts translated by Storelib AI now, and live: the theme editor's
 * Translate on one text, Reset to automatic, and the review list's Use
 * automatic (lib/markets/translation-press.ts translateFieldsNow). Only the
 * texts named are sent; the rest of the website is not looked at. A
 * translation the merchant wrote is replaced only when `replaceManual` is
 * true (their own press on that text), and only by one that came back.
 *
 * The store's own, through its owner. The translator's keys stay on the
 * server; the answer is the translated values, never a provider's reply.
 */
export async function POST(request: Request) {
  const started = Date.now()
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  if (!canDraftWithAi()) return physicalJson({ error: OPEN_NOT_SET_UP }, 503)
  const limited = await rateLimit({ bucket: "site-translations-field", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }, { limit: 400, seconds: 86400 }], message: "That is a lot of translating at once. Wait a minute and try again." })
  if (limited) return limited
  const body = await readBody(request)
  const locale = normalizeLocale(body?.locale)
  if (!locale) return physicalJson({ error: "Add this language to your website first." }, 400)
  const r = await translateFieldsNow(c.db, c.creatorId, locale, body?.items, c.userId, { replaceManual: body?.replaceManual === true, deadlineAt: started + WINDOW_MS })
  if (r.ok === false) return physicalJson({ error: r.error }, r.status)
  const n = Object.keys(r.values).length
  if (n > 0) await recordActivity(c.db, c, { action: "website.translations", meta: { locale, drafted: n, reset: body?.replaceManual === true } })
  return physicalJson({ values: r.values, skipped: r.skipped })
}
