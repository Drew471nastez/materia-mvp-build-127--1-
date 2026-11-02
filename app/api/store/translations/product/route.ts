import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { recordActivity } from "@/lib/activity/log-server"
import { canDraftWithAi } from "@/lib/markets/translate-ai"
import { OPEN_NOT_SET_UP } from "@/lib/markets/open-translate"
import { productTranslationsView, saveProductField, setShowOriginal, translateProductAuto } from "@/lib/markets/product-translations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * ONE PRODUCT'S TRANSLATIONS (Products › Translations, lib/markets/product-translations.ts).
 *
 * GET   ?id=<product>                          its fields' originals and their value in each language
 * PUT   { id, locale, field, value }           a person's translation of one field; empty shows the original
 * POST  { id, locale }                         Translate automatically, pressed: what has no translation
 *                                              in that language, never a person's, never the product
 * PATCH { id, showOriginal }                   Always show the original, on or off
 *
 * The store's own product, through its owner or a team member who has
 * Products (lib/team). The product row is only ever read here.
 */
export async function GET(request: Request) {
  const c = await shopCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  const id = new URL(request.url).searchParams.get("id")
  if (!isUuid(id)) return physicalJson({ error: "Bad request." }, 400)
  const r = await productTranslationsView(c.db, c.creatorId, id)
  if (r.ok === false) return physicalJson({ error: (r as { error: string }).error }, (r as { status: number }).status)
  return physicalJson({ ...r.value, canTranslate: canDraftWithAi() })
}

export async function PUT(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "site-translations-product", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 400, seconds: 600 }, { limit: 5000, seconds: 86400 }], message: "That is a lot of saves at once. Wait a minute and try again." })
  if (limited) return limited
  const body = await readBody(request)
  if (!body || !isUuid(body.id)) return physicalJson({ error: "Bad request." }, 400)
  const r = await saveProductField(c.db, c.creatorId, body.id, body.locale, body.field, body.value, c.userId)
  if (r.ok === false) return physicalJson({ error: (r as { error: string }).error }, (r as { status: number }).status)
  return physicalJson(r.value)
}

export async function POST(request: Request) {
  const started = Date.now()
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  if (!canDraftWithAi()) return physicalJson({ error: OPEN_NOT_SET_UP }, 503)
  /* Each press is a paid call: the same allowance as Settings' Translate with AI. */
  const limited = await rateLimit({ bucket: "site-translations-ai-product", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 30, seconds: 3600 }, { limit: 200, seconds: 86400 }], message: "Translating can be started a few times an hour. Try again later." })
  if (limited) return limited
  const body = await readBody(request)
  if (!body || !isUuid(body.id)) return physicalJson({ error: "Bad request." }, 400)
  const r = await translateProductAuto(c.db, c.creatorId, body.id, body.locale, c.userId, started + 45_000)
  if (r.ok === false) return physicalJson({ error: (r as { error: string }).error }, (r as { status: number }).status)
  if (r.value.translated > 0) await recordActivity(c.db, c, { action: "website.translations", meta: { locale: body.locale, product: body.id, drafted: r.value.translated } })
  return physicalJson(r.value)
}

export async function PATCH(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body || !isUuid(body.id)) return physicalJson({ error: "Bad request." }, 400)
  const r = await setShowOriginal(c.db, c.creatorId, body.id, body.showOriginal, c.userId)
  if (r.ok === false) return physicalJson({ error: (r as { error: string }).error }, (r as { status: number }).status)
  return physicalJson(r.value)
}
