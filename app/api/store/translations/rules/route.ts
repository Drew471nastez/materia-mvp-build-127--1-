import { NextResponse, after } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { recordActivity } from "@/lib/activity/log-server"
import { saveTranslationRules, translationRulesOf } from "@/lib/markets/server"
import { canDraftWithAi } from "@/lib/markets/translate-ai"
import { planGlossaryRewrite, rewriteForGlossary, type GlossaryRewrite } from "@/lib/markets/translation-press"
import { translationsChanged } from "@/lib/markets/translate-queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** The rewrite after a glossary change works for this long after answering; what is left keeps its earlier words. */
const REWRITE_MS = 270_000

/**
 * GET   the store's glossary and the texts it keeps untranslated
 * PUT   { rules }   saved whole (lib/markets/translation-rules.ts validateRules)
 *
 * Only steers Storelib AI: a translation the merchant wrote is never changed
 * by a rule. A text newly marked Don't translate loses Storelib AI's
 * translations of it, so the original shows in every language. A glossary
 * term added, removed or changed has Storelib AI's live translations that
 * use it written again after the answer (translation-press.ts
 * planGlossaryRewrite, rewriteForGlossary); `rewriting` says how many.
 * The store's own, through its owner. Kept in
 * store_localization.translation_rules (SQL part 213); before it runs, GET
 * reads no rules and PUT says what it needs.
 */
export async function GET() {
  const c = await shopCaller("website", { read: true })
  if (c instanceof NextResponse) return c
  const r = await translationRulesOf(c.db, c.creatorId)
  return physicalJson({ ready: r.ready, rules: r.rules })
}

export async function PUT(request: Request) {
  const started = Date.now()
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "site-translation-rules", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const r = await saveTranslationRules(c.db, c.creatorId, body.rules)
  if (r.ok === false) return physicalJson({ error: r.error }, r.status)
  await recordActivity(c.db, c, { action: "website.translations", meta: { rules: true, terms: r.value.glossary.length, untranslated: r.value.noTranslate.length } })
  /* Product names, or a text, handed back to automatic translation: the next automatic run (when it is on) picks them up. */
  if ((r.before.keepProductNames && !r.value.keepProductNames) || r.before.noTranslate.some((k) => !r.value.noTranslate.includes(k))) translationsChanged(c.creatorId)
  /*
    THE GLOSSARY APPLIED TO WHAT IS ALREADY TRANSLATED. Only when a term
    changed, only Storelib AI's own live translations, a limited number an
    hour so a glossary being typed in is not a translation bill.
  */
  let rewriting = 0
  if (canDraftWithAi()) {
    const plan: GlossaryRewrite = await planGlossaryRewrite(c.db, c.creatorId, r.before, r.value).catch((): GlossaryRewrite => [])
    const count = plan.reduce((n, p) => n + p.items.length, 0)
    if (count > 0) {
      const busy = await rateLimit({ bucket: "site-translation-glossary", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 3600 }] })
      if (!busy) {
        rewriting = count
        after(() => rewriteForGlossary(c.db, c.creatorId, plan, c.userId, started + REWRITE_MS).then(() => undefined, () => undefined))
      }
    }
  }
  return physicalJson({ rules: r.value, removed: r.removed, rewriting })
}
