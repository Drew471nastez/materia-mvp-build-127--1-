/**
 * ===========================================================================
 *  /app/emails NEVER FALLS OVER ON AN ANSWER OF ANOTHER SHAPE (wave 7)
 * ===========================================================================
 * The owner hit the /app error screen on Emails; the live build reported
 * `eN.find is not a function` from /app/emails. A 200 whose body was not
 * JSON (a sign-in page, an empty or cut answer) was read as `{}` and kept as
 * the automations list; the client drew `flows.find(...)` on every render.
 *
 *   1. Every loader behind the page (app/(storelib)/app/emails/emails-data.ts),
 *      fed every bad shape (an object, `{ error }`, null, a string, a list
 *      of junk, lists that are objects, HTML, an empty body, a 500), either
 *      answers with real lists or fails with an Error the page shows with
 *      Try again: never a TypeError, never an object where a list belongs.
 *   2. The pure shapers (lib/emails/shapes.ts) never throw and always hand
 *      back lists, for the panels that read for themselves (Customer emails,
 *      a community's emails and automations, the connected platforms).
 *   3. The client checks what it keeps where it draws it, and each part of
 *      the page is drawn in a net of its own (components/app/emails/part-boundary)
 *      so one part that throws says "Couldn't load this part · Retry" in its
 *      place and the page stays.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadAll, loadCampaigns, loadCustomerEmails, loadFlows, loadMessages, loadPlatforms, loadReport, loadSent, loadSubscribers, loadTab, mergeCampaigns, TABS } from "@/app/(storelib)/app/emails/emails-data"
import { activityFrom, asArray, campaignsFrom, communityAutomationsFrom, communityEmailsFrom, customerEmailsFrom, flowsFrom, marketingFrom, reportFrom, sendingDomainFrom, sentFrom, wordsInFrom } from "@/lib/emails/shapes"
import { EmailsPartBoundary } from "@/components/app/emails/part-boundary"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail).slice(0, 300)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ─── The answers ───────────────────────────────────────────────────── */
type Body = { status: number; body: string; type?: string }
const json = (v: unknown, status = 200): Body => ({ status, body: JSON.stringify(v) })
const BAD: Record<string, Body> = {
  "an object": json({}),
  "{ error } with a 200": json({ error: "Something odd" }),
  "null": json(null),
  "a string": json("hello"),
  "a number": json(42),
  "a list of junk": json([null, 1, "a", { id: { x: 1 } }, { name: "no id" }]),
  "an empty list": json([]),
  "lists that are objects": json({ campaigns: { a: 1 }, rows: { a: 1 }, marketing: { klaviyo: {} }, communities: { c: {} }, copy: "x", shop: "x", stats: [], monthlyUsage: "x", links: {}, campaign: "x" }),
  "lists that are null": json({ campaigns: null, rows: null, marketing: null, communities: null, copy: null, shop: null }),
  "an HTML sign-in page": { status: 200, body: "<!doctype html><html><body>Sign in</body></html>", type: "text/html" },
  "an empty body": { status: 200, body: "" },
  "a 500 with words": json({ error: "Could not load your automations." }, 500),
  "a 503 with HTML": { status: 503, body: "<html>busy</html>", type: "text/html" },
}

let answer: Body = json({})
;(globalThis as { fetch: typeof fetch }).fetch = (async () => new Response(answer.body, { status: answer.status, headers: { "Content-Type": answer.type ?? "application/json" } })) as typeof fetch

const isList = (v: unknown) => Array.isArray(v)
/** Every list the page draws from this loader's answer is a list. */
const LISTS: Record<string, (v: any) => boolean> = {
  loadFlows: (v) => isList(v) && v.every((f: any) => typeof f.id === "string" && typeof f.name === "string"),
  loadCampaigns: (v) => isList(v) && v.every((c: any) => typeof c.id === "string" && typeof c.subject === "string"),
  loadSent: (v) => isList(v.campaigns) && typeof v.overview.total_sent === "number" && typeof v.usage.limit === "number",
  loadAll: (v) => isList(v.sent.campaigns) && isList(v.scheduled) && isList(v.drafts) && isList(mergeCampaigns(v)),
  loadSubscribers: (v) => isList(v.rows),
  loadMessages: (v) => isList(v.rows),
  loadPlatforms: (v) => isList(v.marketing) && !!v.sending && typeof v.sending === "object",
  loadCustomerEmails: (v) => !!v.shop && typeof v.copy === "object" && !Array.isArray(v.copy) && isList(v.communities),
  loadReport: (v) => !!v.campaign && isList(v.links),
}
const LOADERS: Record<string, () => Promise<unknown>> = {
  loadFlows: () => loadFlows(),
  loadCampaigns: () => loadCampaigns("draft"),
  loadSent: () => loadSent("timeRange=all"),
  loadAll: () => loadAll("timeRange=all"),
  loadSubscribers: () => loadSubscribers(),
  loadMessages: () => loadMessages(),
  loadPlatforms: () => loadPlatforms(),
  loadCustomerEmails: () => loadCustomerEmails(),
  loadReport: () => loadReport("00000000-0000-4000-8000-000000000001"),
}

async function settle(fn: () => Promise<unknown>): Promise<{ value?: unknown; error?: unknown; threw?: unknown }> {
  try {
    return { value: await fn() }
  } catch (error) {
    return { error }
  }
}

async function main() {
  console.log("\n1. Every loader, every bad shape: real lists, or an Error to show with Try again\n")
  for (const [name, load] of Object.entries(LOADERS)) {
    for (const [shape, body] of Object.entries(BAD)) {
      answer = body
      const r = await settle(load)
      const ok =
        r.error !== undefined
          ? r.error instanceof Error && !(r.error instanceof TypeError) && typeof r.error.message === "string" && r.error.message.length > 0
          : (() => {
              try {
                return LISTS[name](r.value)
              } catch {
                return false
              }
            })()
      check(`${name}: ${shape}`, ok, r.error instanceof Error ? `${r.error.name}: ${r.error.message}` : r.value)
    }
  }
  /* What was the crash: an object kept as the automations list. */
  answer = json({})
  const flows = await settle(loadFlows)
  check("the crash's own answer ({} with a 200) is a failed read, not an object kept as the list", flows.error instanceof Error && flows.value === undefined)
  answer = BAD["an HTML sign-in page"]
  check("an HTML 200 is a failed read too (it was read as {})", (await settle(loadFlows)).error instanceof Error)
  answer = json({ error: "Sign in again to do this." }, 401)
  const words = await settle(loadFlows)
  check("a refusal keeps the server's own words", words.error instanceof Error && words.error.message === "Sign in again to do this.")

  /* loadTab, every view, the worst shapes. */
  for (const shape of ["an object", "a list of junk", "an HTML sign-in page", "lists that are objects"]) {
    answer = BAD[shape]
    const all = await Promise.all(TABS.map((t) => settle(() => loadTab(t, "timeRange=all"))))
    check(`loadTab, all seven views: ${shape}`, all.every((r) => (r.error ? r.error instanceof Error && !(r.error instanceof TypeError) : true)), all.map((r) => (r.error instanceof Error ? r.error.name : "ok")))
  }

  console.log("\n   The right shapes still come through whole\n")
  answer = json([{ id: "f1", name: "Welcome", trigger_type: "new_subscriber", status: "active", steps: [], totals: { sent: 3, opened: 1, clicked: 0, failed: 0, in_progress: 2 } }])
  const good = (await loadFlows()) as Array<{ id: string; totals: { in_progress: number } | null }>
  check("a list of automations is kept, totals and all", good.length === 1 && good[0].id === "f1" && good[0].totals?.in_progress === 2)
  answer = json({ campaigns: [{ id: "c1", subject: "Hi", created_at: "2026-11-01T00:00:00Z" }], stats: { totalSent: 10, openRate: 50 }, monthlyUsage: { sent: 3, limit: 2000 } })
  const sent = await loadSent("timeRange=all")
  check("the sent list, its numbers and the month's use are kept", sent.campaigns.length === 1 && sent.campaigns[0].kind === "sent" && sent.overview.total_sent === 10 && sent.overview.open_rate === 50 && sent.usage.limit === 2000)

  console.log("\n2. The shapers never throw and always hand back lists\n")
  const junk: unknown[] = [undefined, null, 0, "", "x", [], {}, [null, 1, "a"], { error: "x" }, { a: { b: [] } }, Object.create(null)]
  const shapers: Record<string, (v: unknown) => unknown> = {
    flowsFrom, campaignsFrom, sentFrom, customerEmailsFrom, activityFrom, reportFrom, marketingFrom, sendingDomainFrom, wordsInFrom,
    communityAutomationsFrom: (v) => communityAutomationsFrom(v),
    communityEmailsFrom: (v) => communityEmailsFrom(v),
  }
  for (const [name, fn] of Object.entries(shapers)) {
    let threw: unknown = null
    for (const v of junk) {
      try {
        fn(v)
      } catch (e) {
        threw = e
      }
    }
    check(`${name} never throws`, threw === null, String(threw))
  }
  check("marketingFrom: anything that is not a list is no platforms", asArray(marketingFrom({ klaviyo: {} })).length === 0 && marketingFrom<{ counts: { subscribed: number } }>([{ provider: "klaviyo", counts: "x" }])[0].counts.subscribed === 0)
  const listed = communityAutomationsFrom<{ id: string }, { id: string }>({ ready: true, automations: {}, channels: "x" })
  check("a community's automations: lists that were objects are empty lists", !!listed && isList(listed.automations) && isList(listed.channels))
  const loaded = communityEmailsFrom({ emails: { recent: {} }, words: { words: "x" } })
  check("a community's emails: recent is a list, words a record", !!loaded && isList(loaded.emails.recent) && typeof loaded.words.words === "object")
  const activity = activityFrom<{ days: number; emails: object; communities: Record<string, object>; flows: unknown[] }>({ emails: "x", communities: { c1: "y" }, flows: { a: 1 } })
  check("what each email sent: the emails and communities are records, the automations a list", !!activity && typeof activity.emails === "object" && typeof activity.communities.c1 === "object" && isList(activity.flows) && activity.days === 30)
  const customer = customerEmailsFrom<{ copy: Record<string, unknown>; communities: unknown[] }>({ shop: { name: "Ana" }, copy: { receipt: "x", refund: { subject: "Hi" } }, communities: { a: 1 } })
  check("customer emails: copy keeps only words, communities a list", !!customer && !("receipt" in customer.copy) && !!customer.copy.refund && isList(customer.communities))
  check("customer emails: not the answer at all is null (a failed read), never a half-made list", customerEmailsFrom({}) === null && customerEmailsFrom([]) === null && customerEmailsFrom({ error: "x" }) === null)
  check("automations: only a list is a list of automations", flowsFrom({}) === null && flowsFrom({ rows: [] }) === null && flowsFrom(null) === null && (flowsFrom([null, { id: "a" }]) ?? []).length === 1)

  console.log("\n3. The client checks what it keeps; each part has its own net\n")
  const client = read("app/(storelib)/app/emails/emails-client.tsx")
  const home = read("app/(storelib)/app/emails/emails-home.tsx")
  const data = read("app/(storelib)/app/emails/emails-data.ts")
  check("the automations list is a list wherever it is drawn (the line that crashed)", /const flows = Array\.isArray\(flowsKept\) \? \(flowsKept as FlowRow\[\]\) : NO_FLOWS/.test(client) && !/as FlowRow\[\] \| undefined\) \?\? \[\]/.test(client))
  check("the kept Sent and All reads are checked before their lists are used", /function sentDataOf\(v: unknown\)/.test(client) && /function allDataOf\(v: unknown\)/.test(client) && /Array\.isArray\(current\.data\) \? \(current\.data as CampaignRow\[\]\) : \[\]/.test(client))
  check("a body that is not JSON is a failed read, never {}", /res\.json\(\)\.catch\(\(\) => NOT_READ\)/.test(data) && !/res\.json\(\)\.catch\(\(\) => \(\{\}\)\)/.test(data))
  check("every loader shapes its answer", ["flowsFrom", "campaignsFrom", "sentFrom", "customerEmailsFrom", "marketingFrom", "sendingDomainFrom", "reportFrom"].every((f) => new RegExp(`\\b${f}\\b`).test(data)))
  for (const part of ['name="numbers"', "name={tab}", 'name="community-automations"', 'name="templates"']) check(`emails-home draws ${part} in its own net`, home.includes(`<EmailsPartBoundary ${part}`))
  check("an email's own page is in its own net, with its way back", /<EmailsPartBoundary name="email" resetKey=\{displayedId\} onBack=\{onBack\}/.test(client))
  check("the navigation is outside every net, so it is always there", home.indexOf("data-emails-nav") < home.indexOf("<EmailsPartBoundary"))
  for (const [file, f] of [
    ["components/app/settings/customer-emails-panel.tsx", "customerEmailsFrom"],
    ["components/app/settings/customer-emails-panel.tsx", "activityFrom"],
    ["components/app/emails/community-automations.tsx", "communityAutomationsFrom"],
    ["components/app/emails/community-emails.tsx", "communityEmailsFrom"],
    ["components/app/settings/marketing-sync-panel.tsx", "marketingFrom"],
  ]) check(`${file.split("/").pop()} reads through ${f}`, new RegExp(`\\b${f}[<(]`).test(read(file)))

  /* The net itself: a part that throws draws the inline line, the rest is untouched. */
  function Throws(): React.ReactElement {
    const flows = {} as unknown as Array<{ id: string }>
    return React.createElement("p", null, flows.find((f) => f.id === "x")?.id)
  }
  const original = console.error
  console.error = () => {}
  let html = ""
  try {
    /* Server rendering has no error boundaries; the fallback is checked by drawing it directly. */
    const b = new EmailsPartBoundary({ name: "list", children: null })
    b.state = EmailsPartBoundary.getDerivedStateFromError(new TypeError("eN.find is not a function"))
    html = renderToStaticMarkup(b.render() as React.ReactElement)
  } finally {
    console.error = original
  }
  check("a part that throws says so in its place, with Retry", /role="alert"/.test(html) && /data-emails-part-failed="list"/.test(html) && /Couldn&#x27;t load this part\.|Couldn't load this part\./.test(html) && /data-emails-part-retry=""/.test(html), html)
  check("  and its Retry is a thumb's 44px on a phone", /h-11 shrink-0[^"]*sm:h-9/.test(html))
  let threw = false
  try {
    renderToStaticMarkup(React.createElement(Throws))
  } catch (e) {
    threw = e instanceof TypeError
  }
  check("  (the fault the net is for: .find on an object throws a TypeError)", threw)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
