import { NextResponse } from "next/server"
import { readTwice, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { siteOrigin } from "@/lib/website-builder/site-seo-data"
import { LAB_COOLDOWN_MS, PSI_TIMEOUT_MS, parsePsi, psiRequestUrl, type LabStrategy } from "@/lib/website-builder/pagespeed"
import { forgetPerformance, isMissingRelation } from "@/lib/website-builder/web-performance-read"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/* Google's test takes 10 to 40 seconds. */
export const maxDuration = 60

type Params = { params: Promise<{ installId: string }> }

/** A path on the creator's own site: no host, no query, nothing that climbs out. */
const PATH = /^\/[a-z0-9\-_/.~%]{0,200}$/i

const MESSAGES = {
  quota: "Google's free speed test has had too many requests today. Try again later.",
  unreachable: "Google could not load this page. Check that it opens in a browser, then try again.",
  failed: "Google's speed test did not finish. Try again in a minute.",
  invalid: "Google's speed test did not finish. Try again in a minute.",
} as const

/**
 * POST /api/website-builder/themes/[installId]/performance/lab
 *   { strategy: "mobile" | "desktop", path?: "/products/hat" }
 *
 * A lab test of one page of the creator's own published website by Google
 * PageSpeed Insights (lib/website-builder/pagespeed.ts). Only the website's
 * own address is ever tested: the origin comes from the database (the
 * primary connected domain, else the Storelib subdomain), never from the
 * request, and only a plain path is taken from it. PAGESPEED_API_KEY is
 * read here and nowhere else; without it Google's small keyless quota is
 * used. One test per site and strategy a minute, and the shared limit per
 * person. The newest result per strategy is kept (site_lab_tests, part 210).
 */
export async function POST(request: Request, { params }: Params) {
  const { installId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator, error: creatorReadErr } = await readTwice(() => supabase.from("creators").select("id, username").eq("user_id", user.id).maybeSingle())
  if (creatorReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install, error: installReadErr } = await readTwice(() => supabase
    .from("store_theme_installs")
    .select("id, status")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle())
  if (installReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })
  if (install.status !== "published") return NextResponse.json({ error: "Publish your website to test it." }, { status: 409 })

  const body = (await request.json().catch(() => ({}))) as { strategy?: unknown; path?: unknown; locale?: unknown }
  const strategy: LabStrategy = body.strategy === "desktop" ? "desktop" : "mobile"
  const path = typeof body.path === "string" && PATH.test(body.path) && !body.path.includes("..") ? body.path : "/"

  const limited = await rateLimit({
    bucket: "site-lab-test",
    subjects: [`user:${user.id}`, `install:${install.id}`],
    windows: LIMITS.siteLabTest,
    message: "That is a lot of speed tests in a short time. Try again in a few minutes.",
  })
  if (limited) return limited

  const admin = createAdminClient()
  const last = await admin.from("site_lab_tests").select("ran_at").eq("install_id", install.id).eq("strategy", strategy).maybeSingle()
  const lastAt = Date.parse((last.data as { ran_at?: string } | null)?.ran_at ?? "")
  if (Number.isFinite(lastAt) && Date.now() - lastAt < LAB_COOLDOWN_MS) {
    return NextResponse.json({ error: "A test of this website just ran. Try again in a minute." }, { status: 429 })
  }

  const origin = await siteOrigin(creator.id, String((creator as { username?: string | null }).username ?? ""))
  const target = `${origin}${path === "/" ? "/" : path}`
  const locale = typeof body.locale === "string" ? body.locale : null

  let status = 0
  let json: unknown = null
  try {
    const res = await fetch(psiRequestUrl(target, strategy, { key: process.env.PAGESPEED_API_KEY || null, locale }), {
      signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
      cache: "no-store",
    })
    status = res.status
    json = await res.json().catch(() => null)
  } catch (e) {
    console.warn("[lab test] PageSpeed Insights did not answer:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: MESSAGES.failed }, { status: 502 })
  }
  const parsed = parsePsi(json, status)
  if (parsed.ok === false) {
    const reason = (parsed as { error: keyof typeof MESSAGES }).error
    return NextResponse.json({ error: MESSAGES[reason] }, { status: reason === "quota" ? 429 : 502 })
  }
  const result = (parsed as { result: import("@/lib/website-builder/pagespeed").LabResult }).result
  const ranAt = new Date().toISOString()
  const saved = await admin
    .from("site_lab_tests")
    .upsert({ install_id: install.id, creator_id: creator.id, strategy, url: target, ran_at: ranAt, result }, { onConflict: "install_id,strategy" })
  if (saved.error && !isMissingRelation(saved.error)) console.warn("[lab test] not kept:", saved.error.message)
  forgetPerformance(install.id)
  return NextResponse.json({ lab: { strategy, url: target, ranAt, result }, kept: !saved.error })
}
