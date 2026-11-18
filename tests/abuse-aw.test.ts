/**
 * Round AW (track D): phishing, spam and abuse. What a banned store can still
 * do, what a new address may be called, and what storelib.com/media/ will
 * serve as a page.
 */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { FakeDb, tick } from "./fake-campaign-db"
import { readCode } from "./_source"
import { CANNOT_SEND, loadSender, processCampaign, resetSchemaCache, runCampaignQueue, startSend } from "@/lib/email-campaigns/queue"
import { newBlock, storeBlocks, type Block } from "@/lib/email-campaigns/blocks"
import { deploymentOwnerBanned, siteIdOfPrefix } from "@/lib/sites/owner-ban"
import { allocateSiteSlug, newSiteSlugError, siteSlugError, SLUG_FALLBACK } from "@/lib/sites/slug"
import { isPhishingName } from "@/lib/security/phishing-names"
import { newSlugAllowed, validSlug } from "@/lib/communities/slug"
import { addressFree } from "@/lib/communities/server/create"
import { GET as mediaGet, MEDIA_DOCUMENT_POLICY } from "../app/api/media/[...path]/route"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

async function main() {
  /* ─── 1. A banned store sends no mail ───────────────────────────────── */

  console.log("\nA banned store sends no campaign: not a new one, not a scheduled one, not one already under way")
  const CREATOR = "c-banned"

  function seed(db: FakeDb, creator: Record<string, unknown> = {}) {
    db.tables.creators.push({ id: CREATOR, user_id: "u-9", support_email: "help@ana.shop", slug: "ana", headline: null, subscription_plan_id: "pro", subscription_status: "active", ...creator })
    db.tables.profiles.push({ id: "u-9", email: "ana@example.com", display_name: "Ana Pop", username: "anapop", avatar_url: null })
    ;["one@example.com", "two@example.com", "three@example.com"].forEach((email, i) =>
      db.tables.subscribers.push({ id: `s-${i}`, creator_id: CREATOR, email, name: null, status: "subscribed", is_active: true, source: "onepage", subscribed_at: tick(), unsubscribe_token: `unsub-${i}` }),
    )
  }
  function campaign(db: FakeDb, over: Record<string, unknown> = {}) {
    const row = {
      id: `camp-${db.tables.email_campaigns.length + 1}`,
      creator_id: CREATOR,
      subject: "Hello {{first_name}}",
      preview_text: "A short note",
      body: storeBlocks([newBlock("rich", { html: "<p>Hi, new things.</p>" } as Partial<Block>)]),
      status: "draft",
      audience_type: "all",
      segment_id: null,
      from_name: null,
      scheduled_at: null,
      sent_at: null,
      audience_count: 0,
      updated_at: tick(),
      created_at: tick(),
      last_error: null,
      send_idempotency_key: null,
      completed_at: null,
      ...over,
    }
    db.tables.email_campaigns.push(row)
    return row
  }
  function provider() {
    const log: string[] = []
    const send = async (m: { to: string }) => {
      log.push(m.to)
      return { success: true, status: 200, messageId: `<mg-${log.length}@x>` }
    }
    return { log, send: send as never }
  }
  const soon = () => Date.now() + 120_000
  const noSleep = async () => {}
  const BANNED_AT = "2026-11-12T10:00:00.000Z"

  /* The sender, as every send path reads it. */
  resetSchemaCache()
  let db = new FakeDb({ modern: true })
  seed(db, { banned_at: BANNED_AT })
  const bannedSender = await loadSender(db, CREATOR)
  check("a banned store's sender is blocked", bannedSender?.blocked === true, bannedSender?.blocked)
  db = new FakeDb({ modern: true })
  seed(db, { banned_at: null })
  check("a store that is not banned is not", (await loadSender(db, CREATOR))?.blocked === false)
  db = new FakeDb({ modern: true })
  seed(db)
  check("a database without the ban column reads as no ban (the creator row is read whole, never named column by column)", (await loadSender(db, CREATOR))?.blocked === false)

  /* A new send. */
  resetSchemaCache()
  db = new FakeDb({ modern: true })
  seed(db, { banned_at: BANNED_AT })
  let c = campaign(db)
  const refused = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft", "scheduled"] })
  check("Send is refused with 403 and says why", refused.kind === "invalid" && refused.status === 403 && refused.errors[0]?.message === CANNOT_SEND, refused)
  check("  and nothing is queued", db.tables.campaign_recipients.length === 0 && db.tables.email_campaigns[0].status === "draft")
  check("  the words are plain: no em dash, none of the banned words", !/—/.test(CANNOT_SEND) && !/unlock|elevate|seamless|powerful|effortlessly|supercharge|transform/i.test(CANNOT_SEND))

  /* A scheduled one that comes due after the ban. */
  resetSchemaCache()
  db = new FakeDb({ modern: true })
  seed(db, { banned_at: BANNED_AT })
  c = campaign(db, { status: "scheduled", scheduled_at: new Date(Date.now() - 60_000).toISOString() })
  let p = provider()
  await runCampaignQueue(db, soon(), { send: p.send, sleep: noSleep })
  check("a scheduled send that comes due after the ban goes to nobody", p.log.length === 0, p.log)
  check("  and is marked failed with the reason", db.tables.email_campaigns[0].status === "failed" && db.tables.email_campaigns[0].last_error === CANNOT_SEND, db.tables.email_campaigns[0])

  /* One already under way when the ban lands. */
  resetSchemaCache()
  db = new FakeDb({ modern: true })
  seed(db, { banned_at: null })
  c = campaign(db)
  const started = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft", "scheduled"] })
  check("(before the ban the send starts as always)", started.kind === "started" && db.tables.campaign_recipients.length === 3, started)
  db.tables.creators[0].banned_at = BANNED_AT
  p = provider()
  const run = await processCampaign(db, c.id, { deadline: soon(), leaseFrom: started.kind === "started" ? started.leaseFrom : null, send: p.send, sleep: noSleep })
  check("a send under way when the ban lands stops: no address gets it", p.log.length === 0 && run.sent === 0, { log: p.log, run })
  check("  every address not reached says why, so nothing is left to pick up", db.tables.campaign_recipients.every((r) => r.status === "failed" && r.error_message === CANNOT_SEND), db.tables.campaign_recipients.map((r) => [r.status, r.error_message]))
  check("  and the campaign is finished, not left for the cron to take over", ["failed", "sent", "partially_failed"].includes(String(db.tables.email_campaigns[0].status)) && db.tables.email_campaigns[0].status === "failed", db.tables.email_campaigns[0].status)
  const again = await processCampaign(db, c.id, { deadline: soon(), send: p.send, sleep: noSleep })
  check("  run again (the cron, or Send again for failed addresses), it still sends nothing", p.log.length === 0 && again.sent === 0)

  /* Lifting the ban, and every other store. */
  resetSchemaCache()
  db = new FakeDb({ modern: true })
  seed(db, { banned_at: null })
  c = campaign(db)
  const ok = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft", "scheduled"] })
  p = provider()
  await processCampaign(db, c.id, { deadline: soon(), leaseFrom: ok.kind === "started" ? ok.leaseFrom : null, send: p.send, sleep: noSleep })
  check("a store that is not banned (or whose ban was lifted) sends exactly as before", p.log.length === 3 && db.tables.email_campaigns[0].status === "sent", { log: p.log, status: db.tables.email_campaigns[0].status })

  const queue = readCode("lib/email-campaigns/queue.ts")
  check("the ban is read softly, from the whole creator row (lib/seo/bans isBanned)", /from\("creators"\)\s*\.select\("\*"\)/.test(queue) && /blocked: verdict\.blocked \|\| isBanned\(/.test(queue))
  check("membership post emails already skip a blocked sender, so they stop for a ban too", /loaded\.sender\.blocked/.test(read("lib/memberships/update-email.ts")))

  /* ─── 2. A banned creator's AI-built site ───────────────────────────── */

  console.log("\nA banned creator's AI-built site at <slug>.storelib.com answers as no site")
  const SITE = "0f0e0d0c-0b0a-4908-8706-050403020100"
  const DEP = "11111111-2222-4333-8444-555555555555"
  check("the site is found from the deployment's storage prefix", siteIdOfPrefix(`sites/${SITE}/${DEP}`) === SITE)
  check("  and nothing else is read as one", siteIdOfPrefix("_vendor/react-19/react.js") === null && siteIdOfPrefix("sites/not-a-uuid/x") === null && siteIdOfPrefix(null) === null && siteIdOfPrefix("x/sites/" + SITE + "/y") === null)

  const asked: string[] = []
  const reads = (owner: string | null, banned: (id: string) => boolean) => ({
    creatorOfSite: async (id: string) => {
      asked.push(id)
      return owner
    },
    isBanned: async (id: string) => banned(id),
  })
  check("a banned owner's live deployment is withheld", (await deploymentOwnerBanned(`sites/${SITE}/${DEP}`, reads("cr-1", (id) => id === "cr-1"))) === true)
  check("an owner in good standing is served", (await deploymentOwnerBanned(`sites/${SITE}/${DEP}`, reads("cr-2", () => false))) === false)
  check("an owner that cannot be read is served (a blip never takes a site down)", (await deploymentOwnerBanned(`sites/${SITE}/${DEP}`, reads(null, () => true))) === false)
  check("a failing read is served too", (await deploymentOwnerBanned(`sites/${SITE}/${DEP}`, { creatorOfSite: async () => { throw new Error("down") }, isBanned: async () => true })) === false)
  check("  and so is a failing ban read", (await deploymentOwnerBanned(`sites/${SITE}/${DEP}`, { creatorOfSite: async () => "cr-1", isBanned: async () => { throw new Error("down") } })) === false)
  asked.length = 0
  check("no prefix, no read", (await deploymentOwnerBanned(null, reads("cr-1", () => true))) === false && asked.length === 0)

  const route = readCode("app/(sites)/site/[slug]/[[...path]]/route.ts")
  const banAt = route.indexOf("deploymentOwnerBanned(live.prefix")
  check("the site route asks before it reads any file, and answers the plain 404", banAt > 0 && banAt < route.indexOf("const objectPath = wantsVendor") && /if \(live\?\.prefix && \(await deploymentOwnerBanned\(live\.prefix, ownerReads\(admin\)\)\)\) return notFound\(\)/.test(route))
  check("  with the ban answer every other surface uses (creatorIsBanned, held a minute, expired by the ban)", /isBanned: creatorIsBanned/.test(route) && /from "@\/lib\/seo\/bans"/.test(route))
  check("  the owner read is bounded and kept per site", /within<\{ creator_id\?: string \| null \}>/.test(route) && /SITE_CREATOR\.set\(siteId, creatorId\)/.test(route))
  check("  the shared React runtime is never asked about (no prefix is read for it)", /if \(!wantsVendor\) \{\s*try \{\s*live = await livePrefix/.test(route))

  /* ─── 3. A new AI site address may not be a phishing name ───────────── */

  console.log("\nA new AI site address goes through the phishing-name rule, like a username or a website's name")
  for (const bad of ["paypal-login", "apple-support", "secure-verify", "coinbasewallet", "storelib-billing"]) {
    check(`"${bad}" is refused as a new address`, isPhishingName(bad) && newSiteSlugError(bad) !== null, newSiteSlugError(bad))
  }
  check("a site named \"PayPal Login\" is not published at paypal-login.storelib.com", await allocateSiteSlug("PayPal Login", async () => false).then((s) => !/paypal|login/.test(s) && new RegExp(`^${SLUG_FALLBACK}(-[a-z0-9]+)?$`).test(s)))
  check("  nor \"Apple ID Verify\"", await allocateSiteSlug("Apple ID Verify", async () => false).then((s) => !/apple|verify/.test(s)))
  for (const good of ["portfolio-website", "andrew-rullz", "apple-orchard-farm", "my-agency", "shop"]) {
    check(`"${good}" is still a fine address`, newSiteSlugError(good) === null, newSiteSlugError(good))
  }
  check("Portfolio Website still gets portfolio-website", (await allocateSiteSlug("Portfolio Website", async () => false)) === "portfolio-website")
  check("an address a site already has is never moved (siteSlugError alone keeps it)", siteSlugError("paypal-login") === null)
  const publish = readCode("lib/sites/publish.ts")
  check("  a published site keeps its address; one never published is checked as new", /const keeps = site\.status === "draft" \? newSiteSlugError : siteSlugError/.test(publish) && /if \(site\.slug && !keeps\(site\.slug\)\) return site\.slug/.test(publish))
  const projects = readCode("lib/sites/projects.ts")
  check("  and creating a site checks its address the same way", /if \(newSiteSlugError\(base\)\) return null/.test(projects) && /if \(newSiteSlugError\(candidate\)\) continue/.test(projects))

  console.log("\nAnd a new community address on storelib.com itself, the same way")
  check("storelib.com/community/paypal-login is refused as a new address", !newSlugAllowed("paypal-login") && !newSlugAllowed("apple-id-verify") && !newSlugAllowed("binance-support"))
  check("  a community that already has such an address keeps it (validSlug alone)", validSlug("paypal-login"))
  check("  ordinary addresses are fine", ["makers", "apple-orchard-farm", "andrew-rullz-club", "free-yoga"].every((s) => newSlugAllowed(s)))
  /* The wizard's address check, through the real function: a refused address never reaches the database. */
  const noDb = { from: () => { throw new Error("asked the database") } }
  const refusedAddress = await addressFree(noDb, "PayPal Login").catch((e: unknown) => ({ error: String(e) }))
  check("the wizard's address check says \"cannot be used\" for it, before any read", (refusedAddress as { reason?: string }).reason === "invalid" && (refusedAddress as { available?: boolean }).available === false, refusedAddress)
  type Chain = { select: () => Chain; eq: () => Chain; limit: () => Promise<{ data: unknown[]; error: null }>; maybeSingle: () => Promise<{ data: null; error: null }> }
  const q: Chain = { select: () => q, eq: () => q, limit: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) }
  const emptyDb = { from: () => q }
  const freeAddress = await addressFree(emptyDb, "Yoga Makers")
  check("  and still says free for an ordinary one", freeAddress.available === true && freeAddress.slug === "yoga-makers", freeAddress)
  const create = readCode("lib/communities/server/create.ts")
  check("creating a community asks the same of an address it is given or makes from the name", /return newSlugAllowed\(s\) \? \{ slugs: \[s\], explicit: true \} : null/.test(create) && /if \(!newSlugAllowed\(base\)\) base = `community-\$\{randomTail\(\)\}`/.test(create))
  const creatorSrc = readCode("lib/communities/server/creator.ts")
  check("changing the address asks it only of the new one", /if \(slug !== c\.slug\) \{\s*if \(!newSlugAllowed\(slug\)\) return no\(400, "That address cannot be used\. Try another\.", "slug"\)/.test(creatorSrc))

  /* ─── 4. storelib.com/media/ never answers as a page ────────────────── */

  console.log("\nA stored file at storelib.com/media/ is never a page that runs script as storelib.com")
  const vercel = JSON.parse(read("vercel.json")) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
  const rule = vercel.headers.find((h) => h.source.startsWith("/media/") && h.headers.some((x) => x.key === "Content-Security-Policy"))
  check("vercel.json sends an enforced sandbox on /media/", !!rule && rule.headers.some((x) => x.key === "Content-Security-Policy" && x.value === "sandbox"), rule)
  check("  the same policy the picture route sends", MEDIA_DOCUMENT_POLICY === "sandbox" && rule?.headers.find((x) => x.key === "Content-Security-Policy")?.value === MEDIA_DOCUMENT_POLICY)
  /* The address pattern, compiled the way Next and Vercel compile a source (path-to-regexp). */
  const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as { pathToRegexp: (s: string, k?: unknown[], o?: Record<string, unknown>) => RegExp }
  const re = rule ? pathToRegexp(rule.source, [], {}) : /$^/
  const covered = ["/media/onepage-assets/u/x.svg", "/media/store-builder-images/u/a.xml", "/media/site-deployments/sites/s/d/index.html", "/media/product-images/u/p.png", "/media/product-videos/u/v.mp4", "/media/lead-form-files-v2/u/notes.txt", "/media/a/b.pdf.svg"]
  check("  it covers every stored file: a picture, a video, a text, and an SVG, XML or HTML document", covered.every((p) => re.test(p)), covered.filter((p) => !re.test(p)))
  check("  except a PDF, which Chrome and Safari will not show inside a sandbox (a lead magnet still opens)", !re.test("/media/lead-form-files-v2/u/guide.pdf") && !re.test("/media/site-assets/sites/s/Guide.PDF"))
  check("the page policy stays report only: the only enforced policy anywhere in vercel.json is that sandbox", vercel.headers.every((h) => h.headers.every((x) => x.key !== "Content-Security-Policy" || (x.value === "sandbox" && h.source.startsWith("/media/")))))

  /* The picture route itself, against a stored file whose type is an SVG document. */
  const realFetch = globalThis.fetch
  const realUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co"
  globalThis.fetch = (async () => new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>', { status: 200, headers: { "content-type": "image/svg+xml", "cache-control": "max-age=3600" } })) as typeof fetch
  try {
    const res = await mediaGet(new Request("https://storelib.com/media/onepage-assets/u/logo.png"), { params: Promise.resolve({ path: ["onepage-assets", "u", "logo.png"] }) })
    check("a picture answered with a document type is sandboxed and not sniffed", res.headers.get("content-security-policy") === "sandbox" && res.headers.get("x-content-type-options") === "nosniff", Object.fromEntries(res.headers))
    check("  and still answered (a picture a page draws is not touched by its own policy)", res.status === 200 && (await res.text()).length > 0)
  } finally {
    globalThis.fetch = realFetch
    if (realUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = realUrl
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
