import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { recordActivity } from "@/lib/activity/log-server"
import { saveTranslationRules, translationRulesOf } from "@/lib/markets/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET   the store's glossary and the texts it keeps untranslated
 * PUT   { rules }   saved whole (lib/markets/translation-rules.ts validateRules)
 *
 * Only steers Storelib AI: a translation the merchant wrote is never changed
 * by a rule. A text newly marked Don't translate loses Storelib AI's
 * translations of it, so the original shows in every language. The store's
 * own, through its owner. Kept in store_localization.translation_rules
 * (SQL part 213); before it runs, GET reads no rules and PUT says what it needs.
 */
export async function GET() {
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  const r = await translationRulesOf(c.db, c.creatorId)
  return physicalJson({ ready: r.ready, rules: r.rules })
}

export async function PUT(request: Request) {
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "site-translation-rules", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const r = await saveTranslationRules(c.db, c.creatorId, body.rules)
  if (r.ok === false) return physicalJson({ error: r.error }, r.status)
  await recordActivity(c.db, c, { action: "website.translations", meta: { rules: true, terms: r.value.glossary.length, untranslated: r.value.noTranslate.length } })
  return physicalJson({ rules: r.value, removed: r.removed })
}
