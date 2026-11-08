/**
 * ===========================================================================
 *  ROUND 51: EMAILS IN THREE TABS, PEOPLE FROM CONTACTS, ONBOARDING TRIGGERS
 * ===========================================================================
 *   1. /app/emails is Campaigns | Automations | Settings, every older tab's
 *      address lands somewhere true (the shared round 51 contract).
 *   2. Campaigns is one list, All | Sent | Scheduled | Drafts.
 *   3. People picked in Contacts reach a campaign only when they agreed to
 *      hear from the creator: unsubscribed, suppressed, never consented and
 *      other creators' people are left out, on the server, and counted.
 *   4. A membership starting enters Membership onboarding once per member
 *      per automation per membership; a community's plan never does; Course
 *      onboarding starts only on a course.
 *   5. Every automation template's trigger is one the platform fires.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { CAMPAIGN_SHOWS, PAGE_TABS, emailsAddress, legacyEmailsRedirect, mergeCampaigns, showOfStatus, viewOf, campaignsHref } from "@/app/(storelib)/app/emails/emails-route"
import { listBehindShows } from "@/app/(storelib)/app/emails/list-return"
import { MAX_PICKED, readContactIds, resolvePickedContacts, type LookupContacts } from "@/lib/emails/recipient-contacts"
import { enroll, type FlowRow, type Store } from "@/lib/automations/engine"
import { TRIGGERS, TRIGGER_ORDER, dedupeKey, entryRule, isTriggerType } from "@/lib/automations/flow-model"
import { TEMPLATES } from "@/lib/automations/templates"
import { membershipTriggerInput, membershipStartedAutomations } from "@/lib/automations/membership-trigger"
import { cleanTriggerConfig, triggerNotReady } from "@/lib/automations/flow-io"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ─── A tiny PostgREST: eq, in, is, limit, maybeSingle, single, insert ─── */

type Row = Record<string, unknown>
class FakeDb {
  tables: Record<string, Row[]> = {}
  reads: Array<{ table: string; filters: string[] }> = []
  from(table: string) {
    const db = this
    const rows = () => db.tables[table] ?? []
    const filters: Array<(r: Row) => boolean> = []
    const said: string[] = []
    let insert: Row | null = null
    const pick = (r: Row, path: string) => {
      const m = path.match(/^(\w+)->>(\w+)$/)
      if (m) {
        const o = r[m[1]] as Row | null
        return o && typeof o === "object" ? (o[m[2]] ?? null) : null
      }
      return r[path]
    }
    const q = {
      select() { return q },
      eq(c: string, v: unknown) { said.push(`${c}=${String(v)}`); filters.push((r) => pick(r, c) === v); return q },
      in(c: string, vs: unknown[]) { said.push(`${c} in`); filters.push((r) => vs.includes(pick(r, c))); return q },
      is(c: string, v: unknown) { filters.push((r) => (pick(r, c) ?? null) === v); return q },
      limit() { return q },
      insert(row: Row) { insert = { id: `seg-${(db.tables[table] ?? []).length + 1}`, ...row }; return q },
      single() { return q.done(true) },
      maybeSingle() { return q.done(true) },
      done(one: boolean) {
        db.reads.push({ table, filters: said })
        if (insert) {
          ;(db.tables[table] ??= []).push(insert)
          return Promise.resolve({ data: insert, error: null })
        }
        const found = rows().filter((r) => filters.every((f) => f(r)))
        return Promise.resolve({ data: one ? found[0] ?? null : found, error: null })
      },
      then(res: (v: unknown) => void, rej?: (e: unknown) => void) { return q.done(false).then(res, rej) },
    }
    return q
  }
}

async function main() {
  /* ─── 1. Tabs and older addresses ─────────────────────────────────── */
  console.log("\n/app/emails: three tabs, older addresses redirected")
  check("the tabs are Campaigns, Automations, Settings", PAGE_TABS.join(",") === "campaigns,automations,settings")
  check("no tab is Campaigns, All", JSON.stringify(emailsAddress({})) === JSON.stringify({ tab: "campaigns", show: "all", section: "sending" }))
  check("an unknown tab or filter is the default, not an error", emailsAddress({ tab: "nope", show: "x" }).tab === "campaigns" && emailsAddress({ show: "x" }).show === "all")
  const r = (q: Record<string, string>) => legacyEmailsRedirect(q)
  check("subscribers go to Contacts, Subscribers", r({ tab: "subscribers" }) === "/app/contacts?filter=subscribers")
  check("leads go to Contacts, Leads", r({ tab: "leads" }) === "/app/contacts?filter=leads")
  check("a lead goes to that person, through /app/contacts/open", r({ tab: "leads", lead: "abc" }) === "/app/contacts/open?from=lead&id=abc" && r({ lead: "abc" }) === "/app/contacts/open?from=lead&id=abc")
  check("one form's leads go to that form in Contacts › Forms", r({ tab: "leads", form: "f1" }) === "/app/contacts/forms?form=f1")
  check("messages go to Contacts › Forms, the opened one kept", r({ tab: "messages" }) === "/app/contacts/forms" && r({ tab: "messages", message: "m 1" }) === "/app/contacts/forms?message=m%201" && r({ message: "m1" }) === "/app/contacts/forms?message=m1")
  check("a subscriber's page over the old list goes to their profile", r({ contact: "s1" }) === "/app/contacts/open?from=subscriber&id=s1")
  check("flows are Automations", r({ tab: "flows" }) === "/app/emails?tab=automations")
  check("published, scheduled and drafts are Campaigns filtered, an open email kept",
    r({ tab: "published" }) === "/app/emails?tab=campaigns&show=sent" && r({ tab: "scheduled" }) === "/app/emails?tab=campaigns&show=scheduled" && r({ tab: "drafts" }) === "/app/emails?tab=campaigns&show=drafts" && r({ tab: "published", email: "e1" }) === "/app/emails?tab=campaigns&show=sent&email=e1")
  check("customer emails are Settings › Customer emails, the family and community kept", r({ tab: "customer", kind: "communities", community: "c1" }) === "/app/emails?tab=settings&section=customer&kind=communities&community=c1")
  check("platforms are Settings › Sending", r({ tab: "platforms" }) === "/app/emails?tab=settings&section=sending")
  check("the new tabs are not redirected", r({ tab: "campaigns", show: "drafts" }) === null && r({ tab: "automations" }) === null && r({ tab: "settings", section: "customer" }) === null && r({}) === null && r({ email: "e1" }) === null)
  const page = read("app/(storelib)/app/emails/page.tsx")
  check("the page redirects before it draws", /const moved = legacyEmailsRedirect\(sp\)\s*\n\s*if \(moved\) redirect\(moved\)/.test(page))
  check("/app/emails/<id> opens the email over Campaigns", read("app/(storelib)/app/emails/[id]/page.tsx").includes("/app/emails?tab=campaigns&email="))
  check("the automation pages go back to Automations", ["flow/[id]/builder.tsx", "flow/[id]/page.tsx", "flow/new/chooser.tsx"].every((f) => !read(`app/(storelib)/app/emails/${f}`).includes("tab=flows") && read(`app/(storelib)/app/emails/${f}`).includes("tab=automations")))
  const home = read("app/(storelib)/app/emails/emails-home.tsx")
  check("one main action per tab: New email on Campaigns, Create automation on Automations, none on Settings",
    /pageTab === "campaigns" \? \([\s\S]*?data-new-email[\s\S]*?\) : pageTab === "automations" \? \([\s\S]*?Create automation[\s\S]*?\) : null/.test(home))
  check("Subscribers, Leads and Messages are no longer drawn in Emails", !/function SubscribersTable|function MessagesTable|leadsPanel/.test(home) && !/LeadsPanel|MessagePage|ContactPage/.test(read("app/(storelib)/app/emails/emails-client.tsx")))
  check("Settings holds Sending (platforms, domain, sender) and Customer emails, moved intact",
    /tab === "customer" \? <CustomerEmailsPanel bare/.test(home) && /tab === "platforms" \? <ConnectedPlatforms/.test(home) && /<SenderCard/.test(home))
  check("templates are a second place in Campaigns (opening a new email with a layout), not a tab",
    /data-email-templates/.test(home) && /\/app\/emails\/new\?layout=/.test(home) && !PAGE_TABS.includes("templates" as never))
  check("the composer applies ?layout= once, for a new email only", /presetLayout = !campaignId && preset\?\.layout/.test(read("components/email/compose/composer.tsx")))

  /* ─── 2. Campaigns, one list ──────────────────────────────────────── */
  console.log("\nCampaigns: All | Sent | Scheduled | Drafts")
  check("the filters", CAMPAIGN_SHOWS.join(",") === "all,sent,scheduled,drafts")
  check("each filter reads its own list, Sent is the period's sent emails",
    viewOf("campaigns", "all", "sending") === "all" && viewOf("campaigns", "sent", "sending") === "published" && viewOf("campaigns", "drafts", "sending") === "drafts" && viewOf("automations", "sent", "sending") === "flows" && viewOf("settings", "all", "customer") === "customer" && viewOf("settings", "all", "sending") === "platforms")
  const merged = mergeCampaigns({
    sent: { campaigns: [{ id: "s1", kind: "sent", created_at: "2026-11-01T00:00:00Z", sent_at: "2026-11-02T00:00:00Z" }] },
    scheduled: [
      { id: "c2", kind: "scheduled", created_at: "2026-10-01T00:00:00Z", scheduled_at: "2026-11-20T09:00:00Z" },
      { id: "c1", kind: "scheduled", created_at: "2026-10-01T00:00:00Z", scheduled_at: "2026-11-10T09:00:00Z" },
    ],
    drafts: [{ id: "d1", kind: "draft", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-11-05T00:00:00Z" }],
  } as never) as unknown as Array<{ id: string }>
  check("All: scheduled first, soonest first, then drafts and sent by the latest touch", merged.map((c) => c.id).join(",") === "c1,c2,d1,s1", merged.map((c) => c.id))
  check("the filter is in the address (&show=), All is the bare tab", campaignsHref("all") === "/app/emails?tab=campaigns" && campaignsHref("drafts") === "/app/emails?tab=campaigns&show=drafts")
  check("the composer's way back is a back when the list behind shows the email",
    listBehindShows("drafts", true, "tab=campaigns&show=drafts") && listBehindShows("drafts", true, "tab=campaigns") && listBehindShows("published", true, "") && !listBehindShows("scheduled", true, "tab=campaigns&show=drafts") && !listBehindShows("drafts", true, "tab=automations") && !listBehindShows("drafts", true, "tab=campaigns&email=x") && showOfStatus("published") === "sent")
  const client = read("app/(storelib)/app/emails/emails-client.tsx")
  check("an email still opens over the list (?email=), delivery figures, schedule and drafts kept",
    /p\.set\("email", c\.id\)/.test(client) && /<EmailDetail/.test(client) && /case "unschedule"/.test(client) && /kindOf\(c, tab\) === "draft" \? openLayer\(router, `\/app\/emails\/edit\/\$\{c\.id\}`\)/.test(home))
  check("All shows opened and clicked for sent emails only", /withStats = tab === "published" \|\| all/.test(home) && /\{sent \? rate\(c\.unique_opens/.test(home))

  /* ─── 3. Recipients from Contacts ─────────────────────────────────── */
  console.log("\nPeople picked in Contacts: only marketing eligible people")
  const ME = "creator-1"
  const OTHER = "creator-2"
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
  const db = new FakeDb()
  db.tables.subscribers = [
    { id: U(1), creator_id: ME, email: "ann@example.com", name: "Ann", status: "subscribed", is_active: true },
    { id: U(2), creator_id: ME, email: "bob@example.com", name: "Bob", status: "unsubscribed", is_active: false },
    { id: U(3), creator_id: ME, email: "cat@example.com", name: "Cat", status: "bounced", is_active: true },
    { id: U(4), creator_id: ME, email: "dan@example.com", name: "Dan", status: "customer", is_active: true },
    { id: U(5), creator_id: ME, email: "eve@example.com", name: "Eve", status: "subscribed", is_active: true },
    { id: U(6), creator_id: OTHER, email: "fay@example.com", name: "Fay", status: "subscribed", is_active: true },
    { id: U(7), creator_id: ME, email: "gus@example.com", name: "Gus", status: "wrote", is_active: true },
  ]
  db.tables.email_suppressions = [{ email: "eve@example.com", scope: "all", lifted_at: null }]
  const picked = await resolvePickedContacts(db, ME, [U(1), U(2), U(3), U(4), U(5), U(6), U(7), "not-a-contact", U(1)])
  check("only the subscribed, unsuppressed person is kept", picked.recipients.map((x) => x.email).join(",") === "ann@example.com", picked.recipients)
  check("the duplicate id counts once", picked.asked === 8)
  check("left out, by reason: unsubscribed, suppressed (bounced, and a live suppression), never consented (a buyer, a message writer), unknown (another creator's, not an id)",
    picked.leftOut.unsubscribed === 1 && picked.leftOut.suppressed === 2 && picked.leftOut.no_consent === 2 && picked.leftOut.unknown === 2, picked.leftOut)
  check("every subscribers read is filtered by the creator", db.reads.filter((x) => x.table === "subscribers").every((x) => x.filters.includes(`creator_id=${ME}`)))

  /* Contacts' own answer (after the merge): a community member known to Contacts without marketing consent, and one Contacts calls eligible who is not on the list. */
  const community: LookupContacts = async () => [
    { contactId: "cm-1", email: "member@example.com", name: "Member", marketing: "no_consent" },
    { contactId: "cm-2", email: "joined@example.com", name: "Joined", marketing: "eligible" },
    { contactId: "p-1", email: "ann@example.com", name: "Ann", marketing: "eligible" },
  ]
  const fromContacts = await resolvePickedContacts(db, ME, ["cm-1", "cm-2", "p-1"], community)
  check("a community member without marketing consent is never added", !fromContacts.recipients.some((x) => x.email === "member@example.com") && fromContacts.leftOut.no_consent === 2, fromContacts)
  check("someone Contacts calls eligible goes only through a subscribed row on this creator's list", fromContacts.recipients.length === 1 && fromContacts.recipients[0].subscriberId === U(1))
  check("at most 200 people from one link", readContactIds(Array.from({ length: 300 }, (_, i) => `id${i}`).join(",")).length === MAX_PICKED && MAX_PICKED === 200)
  check("?to= and ?contacts= are read together, odd ids dropped", readContactIds("a", "b,a,<x>, c").join(",") === "a,b,c")
  const route = read("app/api/email/recipients/route.ts")
  check("the route checks the session and the store (requireCreator, Marketing) and returns counts, never addresses", /requireCreator\(\)/.test(route) && !/email:/.test(route.slice(route.indexOf("NextResponse.json(\n"))))
  check("the send itself still filters every recipient (resolveAudience unchanged: subscribed and active only)", /status !== "subscribed" \|\| r\.is_active === false/.test(read("lib/email-campaigns/queue.ts")))
  const composer = read("components/email/compose/composer.tsx")
  check("the composer says how many were left out and why", /data-left-out=\{left\}/.test(composer) && /never agreed to get your emails/.test(composer))
  check("?segment= picks a saved segment, ?to= and ?contacts= go to the server", /presetSegment/.test(composer) && /"\/api\/email\/recipients"/.test(composer) && /readContactIds\(one\(sp\.to\), one\(sp\.contacts\)\)/.test(read("app/(storelib)/app/emails/new/page.tsx")))
  check("people picked in Contacts are not offered as one of the creator's segments", /!s\.picked \|\| \(value\.type === "segment"/.test(read("components/email/compose/audience-picker.tsx")))

  /* ─── 4. Membership and course onboarding ─────────────────────────── */
  console.log("\nAutomation triggers: once per member per automation per event")
  const flows: FlowRow[] = [
    { id: "f-member", creator_id: ME, name: "Membership onboarding", trigger_type: "membership_started", trigger_config: { template: "membership_onboarding", entry: { mode: "each" } }, status: "active", steps: TEMPLATES.find((t) => t.id === "membership_onboarding")!.steps },
    { id: "f-course", creator_id: ME, name: "Course onboarding", trigger_type: "purchase", trigger_config: { template: "course_onboarding", entry: { mode: "each" }, product_kinds: ["course"] }, status: "active", steps: TEMPLATES.find((t) => t.id === "course_onboarding")!.steps },
  ]
  const runs: Array<{ flowId: string; key: string; email: string }> = []
  const store = {
    async activeFlows(c: string, t: string) { return flows.filter((f) => f.creator_id === c && f.trigger_type === t && f.status === "active") },
    async exitRuns() { return 0 },
    async standing() { return { suppressed: false, unsubscribeToken: null, subscribed: false, status: null } },
    async firstOrder() { return true },
    async productKinds(_c: string, ids: string[]) { return new Map(ids.map((id) => [id, id.startsWith("course") ? "course" : "digital"])) },
    async enroll(i: { flowId: string; dedupeKey: string; email: string }) {
      if (runs.some((x) => x.flowId === i.flowId && x.key === i.dedupeKey)) return { runId: null }
      runs.push({ flowId: i.flowId, key: i.dedupeKey, email: i.email })
      return { runId: `run-${runs.length}` }
    },
  } as unknown as Store

  const mdb = new FakeDb()
  mdb.tables.products = [
    { id: "prod-member", creator_id: ME, community_id: null },
    { id: "prod-plan", creator_id: ME, community_id: "comm-1" },
  ]
  const membership = { id: "mem-1", creator_id: ME, product_id: "prod-member", buyer_email: "Ann@Example.com", buyer_name: "Ann", title: "Studio" }
  const input = await membershipTriggerInput(mdb, membership)
  check("a membership starting is the membership_started trigger, keyed by the membership", input?.triggerType === "membership_started" && input.eventId === "membership:mem-1" && input.email === "ann@example.com")
  const t0 = Date.parse("2026-11-08T12:00:00Z")
  const first = await enroll(store, input!, t0)
  const again = await enroll(store, input!, t0 + 60_000)
  check("the first call enters the automation once", first.enrolled === 1 && runs.filter((x) => x.flowId === "f-member").length === 1)
  check("the same membership again (a second webhook, the confirm page) enters nothing", again.enrolled === 0 && runs.filter((x) => x.flowId === "f-member").length === 1)
  check("the run's key is the event, one per membership", runs.find((x) => x.flowId === "f-member")?.key === "event:membership:mem-1" && dedupeKey(entryRule("membership_started", null), { email: "a@b.c", eventId: "membership:x", now: t0 }) === "event:membership:x")
  check("a community's paid plan never enters (its Welcome email and chat welcome already exist)", (await membershipTriggerInput(mdb, { ...membership, id: "mem-2", product_id: "prod-plan" })) === null)
  check("a membership from another creator's product reads as nothing", (await membershipTriggerInput(mdb, { ...membership, creator_id: OTHER })) === null)
  check("no address, nothing", (await membershipTriggerInput(mdb, { ...membership, buyer_email: "unknown+sub@storelib.invalid" })) === null)
  let entered = 0
  await membershipStartedAutomations(mdb, membership, async () => { entered++ })
  await membershipStartedAutomations(mdb, { ...membership, product_id: "prod-plan" }, async () => { entered++ })
  check("the hook enters for a membership and not for a community plan, and never throws", entered === 1)
  check("sync.ts calls it on the started change only", /if \(changed\.includes\("started"\)\) await quietly\("automations"/.test(read("lib/memberships/sync.ts")))

  const course = await enroll(store, { triggerType: "purchase", creatorId: ME, email: "ann@example.com", productId: "course-1", orderId: "o1" }, t0)
  const ebook = await enroll(store, { triggerType: "purchase", creatorId: ME, email: "ann@example.com", productId: "ebook-1", orderId: "o2" }, t0)
  check("Course onboarding starts on a course order, once per order", course.enrolled === 1 && runs.filter((x) => x.flowId === "f-course").length === 1)
  check("and not on another kind of product", ebook.enrolled === 0 && ebook.skipped.some((s) => s.why === "another kind of product"))
  const noKinds = await enroll({ ...store, productKinds: undefined } as unknown as Store, { triggerType: "purchase", creatorId: ME, email: "z@example.com", productId: "course-9", orderId: "o9" }, t0)
  check("a kind that cannot be read starts nothing", noKinds.enrolled === 0)
  check("the kinds are kept through every save of the flow", JSON.stringify(cleanTriggerConfig("purchase", { entry: { mode: "each" } }, { template: "course_onboarding", product_kinds: ["course"] }).product_kinds) === '["course"]')
  check("the trigger is refused plainly before SQL part 379 (Postgres 23514)", triggerNotReady({ code: "23514" }) && !triggerNotReady({ code: "23505" }) && /TRIGGER_NOT_READY/.test(read("app/api/automations/flows/route.ts")))

  /* ─── 5. Templates only for triggers that fire ────────────────────── */
  console.log("\nTemplates: only for triggers that are wired")
  const fires: Record<string, boolean> = {
    new_subscriber: /triggerType: "new_subscriber"/.test(read("app/api/subscribe/route.ts")),
    purchase: /triggerType: "purchase"/.test(read("lib/checkout/fulfil-payment.ts")),
    /* Derived from every purchase by the engine itself. */
    first_purchase: /\["purchase", "first_purchase"\]/.test(read("lib/automations/engine.ts")),
    abandoned_checkout: /abandoned_checkout/.test(read("lib/automations/abandoned.ts")),
    membership_started: /triggerType: "membership_started"/.test(read("lib/automations/membership-trigger.ts")),
  }
  check("every trigger the builder offers is one the platform fires", TRIGGER_ORDER.every((t) => fires[t] === true && isTriggerType(t)), fires)
  check("every template's trigger fires", TEMPLATES.every((t) => fires[t.trigger] === true), TEMPLATES.map((t) => t.trigger))
  check("onboarding templates are there: course and membership", ["course_onboarding", "membership_onboarding"].every((id) => TEMPLATES.some((t) => t.id === id)))
  check("no template for what is not wired or would be a second email (community welcome, renewal, expiry, a form)",
    !TEMPLATES.some((t) => /community|renewal|expir|form/i.test(t.id)) && !Object.keys(TRIGGERS).some((t) => /community|renewal|expir|form/.test(t)))
  check("membership onboarding is about the access paid for (buyers), and waits a day after the Membership started email", TRIGGERS.membership_started.marketing === false && TEMPLATES.find((t) => t.id === "membership_onboarding")!.steps[0].type === "wait")

  /* ─── SQL part 379 ─────────────────────────────────────────────────── */
  console.log("\nSQL part 379")
  const sql = read("supabase/migrations/20271137_email_flow_membership_trigger.sql")
  check("the run-now part is the migration, word for word", existsSync(join(process.cwd(), "supabase/sql/run-now/379_email_flow_membership_trigger.sql")) && read("supabase/sql/run-now/379_email_flow_membership_trigger.sql") === sql)
  check("it says what it does, what happens until it runs, and that it is safe to run again", /Until this runs:/.test(sql) && /Safe to run again\./.test(sql))
  check("additive: the check gets the new trigger, NOT VALID, no row rewritten", /'membership_started'/.test(sql) && /NOT VALID/.test(sql) && !/\bUPDATE\b|\bDELETE\b/i.test(sql.replace(/\/\*[\s\S]*?\*\//g, "")))
  check("registered: README, check after, the parts list", read("supabase/sql/run-now/README.md").includes("`379_email_flow_membership_trigger.sql`") && /as p379_email_flow_membership_trigger/.test(read("supabase/sql/run-now/99_check_after.sql")) && read("lib/admin/sql-parts.generated.ts").includes("379_email_flow_membership_trigger.sql"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}
void main()
