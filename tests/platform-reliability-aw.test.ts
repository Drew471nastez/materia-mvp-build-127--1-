/** Round AW: what the Nov 13 production logs and the sweep of routes added since the last isolation sweep found. */
import { readFileSync } from "node:fs"
import { SUSPEND_SLACK_MS, sleptThrough } from "@/lib/net/suspended"
import { SettingUnread, readSetting } from "@/lib/platform/setting-read"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")

type Answer = { data: { value?: unknown } | null; error: { code?: string; message?: string } | null }
/** A platform_settings client whose n-th ask answers with `answers[n]`; "never" does not answer at all. */
function client(answers: (Answer | "never")[]) {
  let asked = 0
  const c = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            const a = answers[Math.min(asked++, answers.length - 1)]
            return a === "never" ? new Promise<Answer>(() => {}) : Promise.resolve(a)
          },
        }),
      }),
    }),
  }
  return { c, asked: () => asked }
}

async function main() {
  console.log("\nA timer that fired far too late means the server slept, not that the database was slow")
  check("on time, or a little late, is an honest timeout", !sleptThrough(0, 3000, 3000) && !sleptThrough(0, 3000, 3000 + SUSPEND_SLACK_MS))
  check("the production case (a 3s timer firing 11s to 515s later) is a sleep", sleptThrough(0, 3000, 11_000) && sleptThrough(0, 3000, 515_000))

  {
    /* The instance slept 100 seconds between the ask and the timer: the clock says so when the timer fires. */
    let t = 0
    const now = () => (t += 100_000)
    const w = client(["never", { data: { value: true }, error: null }])
    const got = await readSetting("explore_marketplace", w.c as never, { ms: 20, now })
    check("a read the instance slept through is asked again, and its answer is the answer", got === true && w.asked() === 2)
  }
  {
    let t = 0
    const now = () => (t += 100_000)
    const w = client(["never", "never"])
    const threw = await readSetting("explore_marketplace", w.c as never, { ms: 20, now }).then(() => false, (e) => e instanceof SettingUnread)
    check("asked again once only: a second silence is unread, never a loop", threw && w.asked() === 2)
  }
  {
    const w = client(["never", { data: { value: true }, error: null }])
    const threw = await readSetting("explore_marketplace", w.c as never, { ms: 20 }).then(() => false, (e) => e instanceof SettingUnread && /no answer in 20ms/.test(e.message))
    check("an honest timeout is not asked again: the caller keeps its last answer, as before", threw && w.asked() === 1)
  }
  {
    const w = client([{ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }])
    const threw = await readSetting("explore_marketplace", w.c as never, { ms: 20 }).then(() => false, (e) => e instanceof SettingUnread)
    check("a database error still throws, it is never read as off", threw && w.asked() === 1)
  }

  console.log("\nA new AI website is counted as one, however it is asked for")
  const gen = code("app/api/website-builder/themes/[installId]/generate/route.ts")
  check("a resume is a checkpoint with a plan and a step past planning, not any object", /const resuming = !!carried && !!carried\.plan && carried\.step !== "plan"/.test(gen) && !/const resuming = body\?\.checkpoint && typeof body\.checkpoint === "object"/.test(gen))
  check("anything else is charged as a new website", /bucket: resuming \? "site-generate-continue" : "site-generate"/.test(gen) && /windows: resuming \? \[\.\.\.LIMITS\.siteAi, RESUMES_A_DAY\] : LIMITS\.siteGenerate/.test(gen))
  check("resumes have a day's ceiling", /const RESUMES_A_DAY = \{ limit: 40, seconds: 86_400 \}/.test(gen))
  check("the limit is asked before any model work", gen.indexOf("if (limited) return limited") < gen.indexOf("new ReadableStream"))
  const cont = code("app/api/website-builder/ai-jobs/[jobId]/continue/route.ts")
  const startOver = cont.slice(cont.indexOf('if (action === "start_over")'))
  check("start over is charged to the new website bucket, per store", /rateLimit\(\{ bucket: "site-generate", subjects: \[`creator:\$\{creatorId\}`\], windows: LIMITS\.siteGenerate/.test(startOver))
  check("after the key lookup (the same press twice is counted once) and before the job is made", startOver.indexOf('eq("idempotency_key", key)') < startOver.indexOf('bucket: "site-generate"') && startOver.indexOf('bucket: "site-generate"') < startOver.indexOf(".insert("))

  console.log("\nA handed over business does not keep the founder's Google Calendar")
  const handoff = code("lib/handoff/server.ts")
  check("finishing a handoff removes the business account's calendar grant", /steps\.calendar = await forgetFounderCalendar\(deps\.db, row\.business_user_id\)/.test(handoff) && /from\("google_calendar_connections"\)\.delete\(\)\.eq\("owner_id", businessUserId\)/.test(handoff))
  check("a failed removal keeps the handoff unfinished, so the claim page tries again", handoff.indexOf("steps.calendar =") < handoff.indexOf("const done = Object.values(steps).every(Boolean)"))

  console.log("\nA booking form shows the price of its own store's product only")
  const pub = code("app/api/forms/[id]/public/route.ts")
  check("the form's owner is read with the form", /\.select\("id,owner_id,published,revision"\)/.test(pub) && /bookingPrice\(definition\.booking\.payment_product_id, data\.owner_id\)/.test(pub))
  check("the product must belong to that owner's store before its price is said", /from\("creators"\)\.select\("id"\)\.eq\("id", data\.creator_id\)\.eq\("user_id", formOwnerId\)\.maybeSingle\(\)/.test(pub) && /if \(!own\) return null/.test(pub) && pub.indexOf("if (!own) return null") < pub.indexOf("formatStoreMoney("))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
main()
