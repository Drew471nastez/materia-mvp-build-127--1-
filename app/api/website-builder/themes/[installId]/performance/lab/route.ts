import { websiteInstallCaller } from "@/lib/team/website"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { siteOrigin } from "@/lib/website-builder/site-seo-data"
import { LAB_COOLDOWN_MS, type AnyLabResult, type LabStrategy } from "@/lib/website-builder/pagespeed"
import { LAB_MESSAGES, runLab, type LabFailure } from "@/lib/website-builder/lab-run"
import { forgetPerformance, isMissingRelation } from "@/lib/website-builder/web-performance-read"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/* Google's test takes 10 to 40 seconds, and the quick check after it up to 15. */
export const maxDuration = 60

type Params = { params: Promise<{ installId: string }> }

/** A path on the creator's own site: no host, no query, nothing that climbs out. */
const PATH = /^\/[a-z0-9\-_/.~%]{0,200}$/i

/**
 * POST /api/website-builder/themes/[installId]/performance/lab
 *   { strategy: "mobile" | "desktop", path?: "/products/hat" }
 *
 * A lab test of one page of the creator's own published website: Google
 * PageSpeed Insights when PAGESPEED_API_KEY is set on the server, else
 * Storelib's own quick check, which also stands in when Google's quota is
 * used up (lib/website-builder/lab-run.ts). Only the website's own address
 * is ever tested: the origin comes from the database (the primary connected
 * domain, else the Storelib subdomain), never from the request, and only a
 * plain path is taken from it. PAGESPEED_API_KEY is read here and nowhere
 * else. One test per site and strategy a minute (inside it, the same page
 * asked again gets the result already kept), and the shared limit per
 * person and site. The newest result per strategy is kept (site_lab_tests,
 * part 210).
 */
export async function POST(request: Request, { params }: Params) {
  const { installId } = await params
  /* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
  const site = await websiteInstallCaller<{ id: string; status: string }>(installId, "id, status")
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { supabase, user, install } = site
  const { data: creatorRow } = await supabase.from("creators").select("id, username").eq("id", site.creatorId).maybeSingle()
  const creator = { id: site.creatorId, username: (creatorRow as { username?: string | null } | null)?.username ?? null }
  if (install.status !== "published") return NextResponse.json({ error: "Publish your website to test it." }, { status: 409 })

  const body = (await request.json().catch(() => ({}))) as { strategy?: unknown; path?: unknown; locale?: unknown }
  const strategy: LabStrategy = body.strategy === "desktop" ? "desktop" : "mobile"
  const path = typeof body.path === "string" && PATH.test(body.path) && !body.path.includes("..") ? body.path : "/"

  const origin = await siteOrigin(creator.id, String((creator as { username?: string | null }).username ?? ""))
  const target = `${origin}${path === "/" ? "/" : path}`

  const admin = createAdminClient()
  const last = await admin.from("site_lab_tests").select("url, ran_at, result").eq("install_id", install.id).eq("strategy", strategy).maybeSingle()
  const kept = last.data as { url?: string; ran_at?: string; result?: AnyLabResult } | null
  const lastAt = Date.parse(kept?.ran_at ?? "")
  if (Number.isFinite(lastAt) && Date.now() - lastAt < LAB_COOLDOWN_MS) {
    if (kept?.url === target && kept.result) return NextResponse.json({ lab: { strategy, url: target, ranAt: kept.ran_at, result: kept.result }, cached: true })
    return NextResponse.json({ error: "A test of this website just ran. Try again in a minute." }, { status: 429 })
  }

  const limited = await rateLimit({
    bucket: "site-lab-test",
    subjects: [`user:${user.id}`, `install:${install.id}`],
    windows: LIMITS.siteLabTest,
    message: "That is a lot of speed tests in a short time. Try again in a few minutes.",
  })
  if (limited) return limited

  const locale = typeof body.locale === "string" ? body.locale : null
  const ran = await runLab({ target, strategy, key: process.env.PAGESPEED_API_KEY || null, locale })
  if (ran.ok === false) {
    const reason = (ran as { error: LabFailure }).error
    return NextResponse.json({ error: LAB_MESSAGES[reason] }, { status: 502 })
  }
  const result = (ran as { result: AnyLabResult }).result
  const fellBack = (ran as { fellBack: string | null }).fellBack
  if (fellBack && fellBack !== "no-key") console.warn(`[lab test] PageSpeed Insights answered "${fellBack}", the quick check ran instead`)
  const ranAt = new Date().toISOString()
  const saved = await admin
    .from("site_lab_tests")
    .upsert({ install_id: install.id, creator_id: creator.id, strategy, url: target, ran_at: ranAt, result }, { onConflict: "install_id,strategy" })
  if (saved.error && !isMissingRelation(saved.error)) console.warn("[lab test] not kept:", saved.error.message)
  forgetPerformance(install.id)
  return NextResponse.json({ lab: { strategy, url: target, ranAt, result }, kept: !saved.error })
}
