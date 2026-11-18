/** Round AW (track B): paid calls and cost control. Each section is one way Storelib could be made to spend money it should not. */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { SEND_LIMITS } from "@/lib/auth/email-code"
import { EMBED_HOSTS, embedAddress } from "@/lib/onepage/embed-address"
import { EMBED_LOOKUP_LIMITS } from "@/lib/onepage/embed-gate"
import { inlineBuildBucket, inlineBuildGate } from "@/lib/website-builder/ai-site/start"
import { newJob } from "@/lib/website-builder/ai-site/job"
import { META_INPUT_TEXT_MAX, META_INPUT_TITLE_MAX, metaDescriptionInput } from "@/lib/seo/meta-description-input"
import { limitedClassifier, routeRequest, ROUTER_MODEL_LIMITS, type RouteClassifier, type RouteInput, type RouteSelection } from "@/lib/website-builder/agent/router"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
/** The text between two markers of a file, comments taken out. */
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from)
  const b = src.indexOf(to, a + from.length)
  return a >= 0 && b > a ? src.slice(a, b) : ""
}

async function main() {
  console.log("\n1. A signed in account cannot have Storelib mail an address over and over")
  {
    const route = readCode("app/api/auth/change-email/route.ts")
    const limit = route.indexOf('bucket: "change-email"')
    check("the email change's codes are counted in the shared limiter", limit > 0 && /await rateLimit\(\{\s*bucket: "change-email"/.test(route))
    check("  per account and per address written to", /subjects: \[`user:\$\{user\.id\}`, emailSubject\(cleanEmail\)\]/.test(route))
    check("  with the sign up code's numbers", /windows: SEND_LIMITS\.email/.test(route))
    check("  before a code is written or mailed", limit > 0 && limit < route.indexOf('from("email_change_codes").insert') && limit < route.indexOf("sendEmail("))
    check("  and the refusal is answered", /if \(limited\) return limited/.test(route))
    /* The old limit: a count of email_change_codes rows that the same request deletes before writing its own, so it never passed one. */
    check("the count that the route's own delete erased is gone", !/from\("email_change_codes"\)\s*\.select\("id"\)\s*\.eq\("user_id", user\.id\)\s*\.gte\("created_at"/.test(route))
    check("  the delete of an unused code before the next one is kept (one pending code at a time)", /from\("email_change_codes"\)\.delete\(\)\.eq\("user_id", user\.id\)\.eq\("verified", false\)/.test(route))
    check("an address in other letters is the same subject", emailSubject("Victim@Example.COM ") === emailSubject("victim@example.com") && emailSubject("not an address") === null)
    check("the numbers: eight in fifteen minutes and twenty a day to one address", SEND_LIMITS.email.length === 2 && SEND_LIMITS.email[0].limit === 8 && SEND_LIMITS.email[0].seconds === 900 && SEND_LIMITS.email[1].limit === 20 && SEND_LIMITS.email[1].seconds === 86_400)

    const del = readCode("app/api/auth/delete-account/route.ts")
    const sendCode = between(del, 'if (action === "send-code") {', 'else if (action === "verify")')
    const delLimit = sendCode.indexOf('bucket: "delete-account-code"')
    check("account deletion's codes are counted the same way, per account", delLimit > 0 && /subjects: \[`user:\$\{user\.id\}`\]/.test(sendCode) && /windows: SEND_LIMITS\.email/.test(sendCode) && /if \(limited\) return limited/.test(sendCode))
    check("  before the code is written or mailed", delLimit > 0 && delLimit < sendCode.indexOf('from("account_delete_codes").insert') && delLimit < sendCode.indexOf("sendEmail("))
    check("  and not by counting rows the same press deletes", !/from\("account_delete_codes"\)\s*\.select\("id"\)\s*\.eq\("user_id", user\.id\)\s*\.gte\("created_at"/.test(del))
  }

  console.log("\n2. The OnePage music and video lookups answer the editor only, and read only the service's own address")
  {
    const good: [Parameters<typeof embedAddress>[0], string][] = [
      ["tiktok", "https://www.tiktok.com/@creator/video/7312345678901234567"],
      ["tiktok", "https://vm.tiktok.com/ZMabc123/"],
      ["tiktok", "www.tiktok.com/@creator/video/1"],
      ["soundcloud", "https://soundcloud.com/artist/track-name"],
      ["soundcloud", "https://on.soundcloud.com/AbCdE"],
      ["soundcloud", "https://m.soundcloud.com/artist/sets/playlist"],
      ["spotify", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x"],
      ["appleMusic", "https://music.apple.com/us/album/name/1234567890?i=1234567891"],
      ["appleMusic", "https://geo.music.apple.com/us/album/name/1"],
      ["youtube", "https://www.youtube.com/@creator"],
      ["youtube", "https://youtu.be/dQw4w9WgXcQ"],
    ]
    const wrongGood = good.filter(([s, u]) => embedAddress(s, u) === null)
    check(`every address the editor sends is still looked up (${good.length})`, wrongGood.length === 0)
    check("an address typed without a scheme is read as https", embedAddress("tiktok", "www.tiktok.com/@a/video/1") === "https://www.tiktok.com/@a/video/1")
    const hostile: [Parameters<typeof embedAddress>[0], string][] = [
      ["tiktok", "http://169.254.169.254/latest/meta-data/?tiktok.com"],
      ["tiktok", "https://evil.example/tiktok.com/"],
      ["tiktok", "https://tiktok.com.evil.example/x"],
      ["tiktok", "https://eviltiktok.com/x"],
      ["tiktok", "https://www.tiktok.com@evil.example/x"],
      ["tiktok", "https://www.tiktok.com:8443/x"],
      ["tiktok", "file:///etc/passwd?tiktok.com"],
      ["soundcloud", "http://localhost:3000/admin/x"],
      ["soundcloud", "http://10.0.0.1/a/b"],
      ["soundcloud", "https://example.com/artist/track"],
      ["appleMusic", "https://attacker.example/?music.apple.com"],
      ["appleMusic", "https://apple.com/us/album/x/1"],
      ["spotify", "https://spotify.com.evil.example/track/x"],
      ["youtube", "https://youtube.com.evil.example/@x"],
      ["tiktok", ""],
      ["tiktok", "x".repeat(3000)],
    ]
    const let_through = hostile.filter(([s, u]) => embedAddress(s, u) !== null)
    check(`no other address is read (${hostile.length} hostile ones)`, let_through.length === 0)
    check("a service's lookup takes no other service's address", embedAddress("soundcloud", "https://www.tiktok.com/@a/video/1") === null && embedAddress("spotify", "https://music.apple.com/us/album/x/1") === null)
    check("each service is its own host or one under it", Object.values(EMBED_HOSTS).every((hosts) => hosts.length > 0 && hosts.every((h) => /^[a-z0-9.-]+\.[a-z]+$/.test(h))))

    const gate = readCode("lib/onepage/embed-gate.ts")
    check("signed in, or 401; Auth not answering is the 503 Try again", /await routeUser\(\)/.test(gate) && /if \(who\.kind === "unavailable"\) return authUnavailableResponse\(\)/.test(gate) && /if \(who\.kind !== "user"\) return NextResponse\.json\([^)]*\{ status: 401/.test(gate))
    check("then counted per account and per caller address", /bucket: "onepage-embed"/.test(gate) && /subjects: \[`user:\$\{who\.user\.id\}`, addressSubject\(request\)\]/.test(gate) && /windows: EMBED_LOOKUP_LIMITS/.test(gate))
    /* The editor at its busiest: one lookup per music button without a picture when it opens, then THUMBNAIL_RETRIES more, four seconds apart. */
    const retries = Number((/const THUMBNAIL_RETRIES = (\d+)/.exec(read("components/onepage/tabs/links-tab.tsx")) ?? [])[1])
    check("forty music buttons with no picture fit the ten minute window", Number.isFinite(retries) && 40 * (1 + retries) <= EMBED_LOOKUP_LIMITS[0].limit && EMBED_LOOKUP_LIMITS[0].seconds === 600)
    check("and the day has a ceiling", EMBED_LOOKUP_LIMITS.some((w) => w.seconds === 86_400 && w.limit <= 5_000))

    const routes: [string, string][] = [
      ["app/api/onepage/tiktok/route.ts", "tiktok"],
      ["app/api/onepage/soundcloud/route.ts", "soundcloud"],
      ["app/api/onepage/spotify/route.ts", "spotify"],
      ["app/api/onepage/apple-music/route.ts", "appleMusic"],
      ["app/api/onepage/youtube/route.ts", "youtube"],
    ]
    for (const [file, service] of routes) {
      const src = readCode(file)
      const get = src.slice(src.indexOf("export async function GET("))
      const refusal = get.indexOf("const refused = await embedLookupRefusal(request)")
      const name = file.split("/").slice(-2, -1)[0]
      check(`${name}: refused before anything is read or fetched`, refusal > 0 && refusal < get.indexOf("try {") && /if \(refused\) return refused/.test(get))
      check(`${name}: only its own service's address goes on`, new RegExp(`const url = embedAddress\\("${service}", asked\\)`).test(get))
      check(`${name}: no substring decides whose address it is`, !/url\.includes\('(tiktok\.com|music\.apple\.com)'\)\)\s*\{\s*return/.test(get))
    }
  }

  console.log("\n3. Start with AI is counted as a new website wherever one is started")
  {
    check("with the jobs table there, nothing is built in the request", inlineBuildGate({ error: null }) === "jobs")
    check("without it (SQL part 380 not run), the build runs as before", inlineBuildGate({ error: { code: "PGRST205", message: "Could not find the table 'public.ai_site_jobs' in the schema cache" } }) === "inline" && inlineBuildGate({ error: { code: "42P01", message: 'relation "ai_site_jobs" does not exist' } }) === "inline")
    check("a read that failed for another reason starts nothing", inlineBuildGate({ error: { code: "57014", message: "canceling statement due to statement timeout" } }) === "unknown" && inlineBuildGate({ error: { message: "fetch failed" } }) === "unknown")
    const fresh = newJob({ id: "00000000-0000-4000-8000-000000000001", creatorId: "c", ownerUserId: "u", installId: "i", prompt: "A site for a yoga teacher" })
    check("a new build has no plan yet", fresh.plan === null && fresh.step === "plan")
    check("no checkpoint: a new website", inlineBuildBucket(false, null) === "site-generate")
    check("a checkpoint with no plan in it (`{}` included) starts from the beginning, so it is a new website", inlineBuildBucket(true, fresh.plan) === "site-generate" && inlineBuildBucket(true, undefined) === "site-generate")
    check("only a checkpoint that carried a plan on is a Continue", inlineBuildBucket(true, { pages: [] }) === "site-generate-continue")
    /* Changed on purpose (round BB): the owner asked for no cap on AI website building; each bucket keeps only a one minute burst guard. */
    check("each bucket keeps only a burst guard (no hourly or daily cap)", LIMITS.siteGenerate.every((w) => (w.seconds as number) <= 60) && LIMITS.siteAi.every((w) => (w.seconds as number) <= 60))

    const gen = readCode("app/api/website-builder/themes/[installId]/generate/route.ts")
    const owner = gen.indexOf("if (!site.isOwner) return")
    const probe = gen.indexOf("inlineBuildGate(await site.supabase.from(JOBS_TABLE).select(\"id\").limit(1))")
    check("the route asks whether the jobs table is there, after the owner check and before reading the body", owner > 0 && probe > owner && probe < gen.indexOf("req.json()"))
    check("  answers 409 with the table there, 503 when it could not tell", /if \(gate === "jobs"\) return NextResponse\.json\([^)]*\{ status: 409 \}\)/.test(gen) && /if \(gate === "unknown"\) return NextResponse\.json\(\{ error: AI_LIMIT_UNREADABLE \}, \{ status: 503 \}\)/.test(gen))
    /* Changed on purpose (round AW merge): main's equivalent of the same rule (only a checkpoint that carries a plan past planning is a Continue), with a day's ceiling on resumes of its own. */
    const carried = gen.indexOf("const carried = body?.checkpoint && typeof body.checkpoint === \"object\" ? fromCheckpoint(job,")
    const resumingAt = gen.indexOf("const resuming = !!carried && !!carried.plan && carried.step !== \"plan\"")
    const limited = gen.indexOf("const limited = await rateLimit({")
    check("the allowance is chosen from the job the checkpoint turned into, not from whether one was sent", carried > 0 && resumingAt > carried && limited > resumingAt)
    check("  the new website's allowance for a new website, the Continue's for a Continue", /bucket: resuming \? "site-generate-continue" : "site-generate"/.test(gen) && /windows: resuming \? \[\.\.\.LIMITS\.siteAi, RESUMES_A_DAY\] : LIMITS\.siteGenerate/.test(gen))
    check("  and nothing is built before the limit has answered", limited > 0 && limited < gen.indexOf("new ReadableStream") && /if \(limited\) return limited/.test(gen))

    const cont = readCode("app/api/website-builder/ai-jobs/[jobId]/continue/route.ts")
    const over = between(cont, 'if (action === "start_over") {', "const plan = planContinue(")
    const replay = over.indexOf("if (same) return")
    const counted = over.indexOf('bucket: "site-generate", subjects: [`creator:${creatorId}`], windows: LIMITS.siteGenerate')
    check("Start over is counted as a new website, per store", counted > 0 && /if \(capped\) return capped/.test(over)) // Changed on purpose (round AW merge): main's identical limit, named capped
    check("  after the replay of the same press, and before the new job is written", replay > 0 && counted > replay && counted < over.indexOf(".insert("))
    check("  the press itself is still limited as before", /bucket: "site-generate-continue", subjects: \[`user:\$\{site\.userId\}`\], windows: LIMITS\.siteAi/.test(cont))
  }

  console.log("\n4. The meta description model is sent the start of a description, not all of it")
  {
    const huge = "Thirty presets for warm film tones. ".repeat(60_000)
    const sent = metaDescriptionInput("T".repeat(5_000), huge)
    check("a description of megabytes goes as six thousand characters", huge.length > 2_000_000 && sent.text.length <= META_INPUT_TEXT_MAX && META_INPUT_TEXT_MAX === 6_000 && huge.startsWith(sent.text))
    check("a title is at most three hundred", sent.title.length === META_INPUT_TITLE_MAX && META_INPUT_TITLE_MAX === 300)
    const normal = metaDescriptionInput("Film Presets", "Thirty presets for warm film tones, for Lightroom and Photoshop.")
    check("an ordinary product is sent exactly as it was", normal.title === "Film Presets" && normal.text === "Thirty presets for warm film tones, for Lightroom and Photoshop.")
    check("anything that is not text is sent as nothing", metaDescriptionInput(42, { a: 1 }).title === "" && metaDescriptionInput(null, undefined).text === "")
    const seo = readCode("app/api/ai/seo/route.ts")
    const ai = seo.slice(seo.indexOf("async function generateWithAI("))
    check("the prompt is written from the clipped title and text only", /const sent = metaDescriptionInput\(title, text\)/.test(ai) && /Product title: \$\{sent\.title\}/.test(ai) && /Product description: \$\{sent\.text\}/.test(ai) && !/\$\{text\}/.test(ai) && !/\$\{title\}/.test(ai))
    check("the account's limit is still before the body is read", seo.indexOf('bucket: "ai-seo"') > 0 && seo.indexOf('bucket: "ai-seo"') < seo.indexOf("request.json()"))
  }

  console.log("\n5. The decide route's model is counted, and never refuses anybody")
  {
    const addable = [{ type: "faq", name: "FAQ" }, { type: "newsletter", name: "Newsletter" }, { type: "testimonials", name: "Testimonials" }]
    const unsure: RouteInput = { prompt: "add a before and after slider", selection: null, scoped: false, images: 0, bodySections: 3, addable }
    const hero: RouteSelection = { sectionId: "hero-1", sectionType: "hero", sectionName: "Hero", origin: "own" }
    let asked = 0
    const model: RouteClassifier = async () => {
      asked++
      return "writer"
    }
    const within = await routeRequest(unsure, limitedClassifier(model, async () => true))
    check("within the limit the model is asked as before", asked === 1 && within.by === "model" && within.agent === "writer")
    const over = await routeRequest(unsure, limitedClassifier(model, async () => false))
    check("over it the model is not asked, and the rules answer", asked === 1 && over.by === "rules" && over.agent === "page")
    let counted = 0
    await routeRequest({ ...unsure, prompt: "make the heading shorter", selection: hero, scoped: true }, limitedClassifier(model, async () => {
      counted++
      return true
    }))
    check("a request the rules can place is not counted at all", counted === 0 && asked === 1)
    check("the numbers: thirty a minute, three hundred an hour", ROUTER_MODEL_LIMITS[0].limit === 30 && ROUTER_MODEL_LIMITS[0].seconds === 60 && ROUTER_MODEL_LIMITS[1].limit === 300 && ROUTER_MODEL_LIMITS[1].seconds === 3600)
    const decide = readCode("app/api/website-builder/themes/[installId]/agent/decide/route.ts")
    check("the decide route wraps its classifier in the limit, per store", /limitedClassifier\(routerClassifier\(creatorId\), async \(\) => !\(await rateLimit\(\{ bucket: "ask-route-model", subjects: \[`creator:\$\{creatorId\}`\], windows: ROUTER_MODEL_LIMITS \}\)\)\)/.test(decide))
    check("  and no route hands the model in without it", !/canClassify \? routerClassifier\(creatorId\) : undefined/.test(decide))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
