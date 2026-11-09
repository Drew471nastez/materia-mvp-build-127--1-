/**
 * Round 51: Forms in Contacts, Community connected (never moved).
 *
 *   LIST        every form with its kind, its responses and where it is used,
 *               worked out in a fixed number of reads, each filtered by the
 *               signed in owner or their creator (lib/forms/overview-server)
 *   DEEP LINKS  ?form=&view=, ?response=, the old Emails › Messages
 *               ?message=<id>, and Community's ?member=<community_members.id>
 *   CONTACTS    View contact goes through /app/contacts/open only, never for
 *               an anonymous response
 *   INSIGHTS    worked out from responses only, no invented completion rate
 *   MEMBERSHIP  one row per person per community whatever the way in; joining
 *               never puts anyone on the marketing list; join answers stay
 *               apart from marketing form responses
 *   CHECKOUT    the checkout's shared ui, words and Stripe loader live outside
 *               Storelib's own route folder (a website's stylesheet scan)
 */
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { formKind, idsIn } from "../lib/forms/kind"
import { formInsights } from "../lib/forms/insights"
import { formUsages, responseCounts, siteFormsOf } from "../lib/forms/overview-server"

let passed = 0
let failed = 0
async function check(label: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ok    ${label}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${label}\n        ${(e as Error).message.slice(0, 400)}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(n)) out.push(p)
  }
  return out
}

/* A PostgREST-shaped stub: records every query (table, columns, filters) and answers from `answer`. */
type Query = { table: string; columns: string; filters: string[]; head: boolean }
function fakeDb(answer: (q: Query) => { data?: unknown; error?: unknown; count?: number }) {
  const log: Query[] = []
  const from = (table: string) => {
    const q: Query = { table, columns: "", filters: [], head: false }
    log.push(q)
    const chain: Record<string, unknown> = {}
    const self = new Proxy(chain, {
      get(_t, prop: string) {
        if (prop === "then") return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer(q)).then(ok, bad)
        if (prop === "select")
          return (cols: string, opts?: { head?: boolean }) => {
            q.columns = cols
            q.head = Boolean(opts?.head)
            return self
          }
        return (...args: unknown[]) => {
          q.filters.push(`${prop}:${args.map((a) => (Array.isArray(a) ? a.join("|") : String(a))).join(",")}`)
          return self
        }
      },
    })
    return self
  }
  return { db: { from }, log }
}

const OWNER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const F2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const F3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

async function main() {
  console.log("\nForms list: kinds, counts, usages\n")

  await check("a form's kind comes from what it holds: quiz, booking, lead capture, application, survey, form", () => {
    assert.equal(formKind({ mode: "quiz", fields: [] } as never), "quiz")
    assert.equal(formKind({ mode: "form", booking: {} as never, fields: [] } as never), "booking")
    assert.equal(formKind({ mode: "form", completion: { kind: "gated", message: "" }, fields: [{ id: "q", type: "textarea", label: "x", required: false }] } as never), "lead")
    assert.equal(formKind({ mode: "form", completion: { message: "" }, fields: [{ id: "e", type: "email", label: "Email", required: true }, { id: "c", type: "consent", label: "ok", required: true }] } as never), "lead")
    assert.equal(formKind({ title: "Coaching application", mode: "form", completion: { message: "" }, fields: [{ id: "e", type: "email", label: "Email", required: true }, { id: "g", type: "textarea", label: "Goal", required: true }] } as never), "application")
    assert.equal(formKind({ mode: "form", completion: { message: "" }, fields: [{ id: "a", type: "single", label: "A", required: true }, { id: "b", type: "rating", label: "B", required: true }] } as never), "survey")
    assert.equal(formKind({ mode: "form", completion: { message: "" }, fields: [{ id: "e", type: "email", label: "Email", required: true }, { id: "m", type: "textarea", label: "Message", required: true }] } as never), "form")
    assert.equal(formKind(null), "form")
  })

  await check("a form id is found in a page's saved JSON, in any case, and only the ids asked for", () => {
    const found = idsIn({ blocks: [{ data: { form_id: F1.toUpperCase() } }, { action: { form_id: F3 } }], other: "x" }, new Set([F1, F2]))
    assert.deepEqual([...found], [F1])
  })

  await check("responses are counted in one read of the owner's forms (embedded count), not one per form", async () => {
    const { db, log } = fakeDb((q) => (q.table === "native_forms" ? { data: [{ id: F1, form_submissions: [{ count: 7 }] }, { id: F2, form_submissions: [{ count: 0 }] }] } : { data: null, error: { message: "unexpected" } }))
    const counts = await responseCounts(db, OWNER, [F1, F2])
    assert.equal(counts.get(F1), 7)
    assert.equal(counts.get(F2), 0)
    assert.equal(log.length, 1)
    assert.ok(log[0].columns.includes("form_submissions(count)"))
    assert.ok(log[0].filters.includes(`eq:owner_id,${OWNER}`), log[0].filters.join(" "))
  })

  await check("  and when the embedded count is refused, head counts run side by side, each filtered by the owner", async () => {
    const { db, log } = fakeDb((q) => (q.table === "native_forms" ? { data: null, error: { code: "PGRST200", message: "no relationship" } } : { data: null, count: q.filters.some((f) => f.endsWith(F1)) ? 3 : 1 }))
    const counts = await responseCounts(db, OWNER, [F1, F2])
    assert.equal(counts.get(F1), 3)
    assert.equal(counts.get(F2), 1)
    const heads = log.filter((q) => q.table === "form_submissions")
    assert.equal(heads.length, 2)
    assert.ok(heads.every((q) => q.head && q.filters.includes(`eq:owner_id,${OWNER}`)))
  })

  await check("where each form is used: OnePage blocks (chat button questions too), website pages and the Creator Page, in three reads", async () => {
    const { db, log } = fakeDb((q) => {
      if (q.table === "onepages") return { data: [{ id: "op", title: "My links", slug: "me", draft_blocks: [{ type: "form_quiz", data: { form_id: F1 } }], published_blocks: [{ type: "whatsapp", action: { form_id: F2 } }] }] }
      if (q.table === "store_builder_configs") return { data: [{ id: "cfg", page_type: "shop", draft_config: { sections: [{ type: "native-form", settings: { form_id: F2 } }] }, published_config: null }] }
      if (q.table === "store_theme_installs") return { data: [{ id: "ins", name: "Main site", status: "published", pages: [{ page_key: "contact", sections: [{ type: "native_form", settings: { form_url: `/forms/${F1}` } }], draft_sections: null }] }] }
      return { data: null, error: { message: "unexpected" } }
    })
    const usages = await formUsages(db, OWNER, CREATOR, [F1, F2, F3])
    assert.deepEqual(usages.get(F1)?.map((u) => u.kind).sort(), ["onepage", "website"])
    assert.deepEqual(usages.get(F2)?.map((u) => u.kind).sort(), ["creator_page", "onepage"])
    assert.equal(usages.get(F3), undefined)
    assert.equal(usages.get(F1)?.find((u) => u.kind === "website")?.label, "Main site › contact")
    assert.equal(log.length, 3)
    assert.ok(log.find((q) => q.table === "onepages")!.filters.includes(`eq:owner_id,${OWNER}`))
    assert.ok(log.find((q) => q.table === "store_builder_configs")!.filters.includes(`eq:creator_id,${CREATOR}`))
    assert.ok(log.find((q) => q.table === "store_theme_installs")!.filters.includes(`eq:creator_id,${CREATOR}`))
  })

  await check("  a page table that is not there is no usage, never a failure", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }))
    const usages = await formUsages(db, OWNER, CREATOR, [F1])
    assert.equal(usages.size, 0)
  })

  await check("the older website builder's forms are read only through the creator's own sites, with their responses counted", async () => {
    const { db, log } = fakeDb((q) => {
      if (q.table === "sites") return { data: [{ id: "s1", name: "Shop" }] }
      if (q.table === "site_forms") return { data: [{ id: F3, site_id: "s1", name: "Contact", created_at: "2026-01-01T00:00:00Z", site_form_submissions: [{ count: 4 }] }] }
      return { data: null }
    })
    const rows = await siteFormsOf(db, CREATOR)
    assert.equal(rows[0].responses, 4)
    assert.equal(rows[0].site_name, "Shop")
    assert.ok(log[0].filters.includes(`eq:creator_id,${CREATOR}`))
    assert.ok(log[1].filters.includes("in:site_id,s1"))
    assert.deepEqual(await siteFormsOf(db, null), [])
  })

  await check("GET /api/forms?overview=1 adds kind, responses and usages; the plain list the pickers read is unchanged", () => {
    const route = read("app/api/forms/route.ts")
    assert.match(route, /searchParams\.get\("overview"\) === "1"/)
    assert.match(route, /if \(!overview\) return NextResponse\.json\(\{ forms \}/)
    assert.match(route, /responseCounts\(actor\.db, actor\.user\.id, ids\)/)
    assert.match(route, /formUsages\(admin, actor\.user\.id, creatorId, ids\)/)
    assert.match(read("lib/forms/overview-server.ts"), /creatorIdOf[\s\S]*\.eq\("user_id", userId\)/)
  })

  await check("the list shows title, kind, status, responses and where it is used, and the website contact form inbox", () => {
    const list = read("app/(storelib)/app/emails/forms/forms-list.tsx")
    assert.match(list, /kindWord\(f\.kind \?\? "form"\)/)
    assert.match(list, /responses\(f\.responses \?\? 0\)/)
    assert.match(list, /data-form-usage/)
    assert.match(list, /f\.status === "published" \? tt\("Published"\) : tt\("Draft"\)/)
    assert.match(list, /\/api\/email\/area\?part=messages/)
    assert.match(list, /tt\("Website contact form"\)/)
  })

  console.log("\nDeep links\n")
  const { routeOf } = await import("../app/(storelib)/app/emails/forms/forms-route")
  await check("?message=<id> (the old Emails › Messages link) opens that message", () => {
    const r = routeOf(`?message=${F1}`)
    assert.equal(r.message, F1)
    assert.equal(r.form, null)
    assert.match(read("app/(storelib)/app/emails/forms/forms-list.tsx"), /if \(route\.message\) \{[\s\S]*<MessagePage[\s\S]*message=\{openedMessage\}/)
  })
  await check("?form=<id> opens a form on Edit; &view= picks Responses, Insights or Settings; &response= opens one response", () => {
    assert.deepEqual(routeOf(`?form=${F1}`), { form: F1, view: "edit", response: null, message: null, inbox: false, siteform: null })
    const r = routeOf(`?form=${F1}&view=responses&response=${F2}`)
    assert.equal(r.view, "responses")
    assert.equal(r.response, F2)
    assert.equal(routeOf(`?form=${F1}&view=nonsense`).view, "edit")
    assert.equal(routeOf("?form=not-an-id&message=<script>").form, null)
    assert.equal(routeOf("?form=not-an-id&message=<script>").message, null)
  })
  await check("a new response's email and bell link open it in Contacts › Forms", () => {
    assert.match(read("lib/forms/delivery-server.ts"), /\/app\/contacts\/forms\?form=\$\{encodeURIComponent\(job\.form_id\)\}&view=responses&response=/)
    assert.match(read("app/api/forms/[id]/submit/route.ts"), /\/app\/contacts\/forms\?form=\$\{id\}&view=responses&response=\$\{lead\}/)
  })
  await check("Community ?member=<community_members.id> reads that member alone, in this community only, and opens their sheet", () => {
    const sections = read("lib/communities/server/admin-sections.ts")
    assert.match(sections, /typeof sp\.member === "string"/)
    assert.match(sections, /memberById\(ctx\.db, ctx\.community\.id, focusId/)
    const creator = read("lib/communities/server/creator.ts")
    assert.match(creator, /export async function memberById[\s\S]{0,400}\.eq\("community_id", communityId\)\.eq\("id", memberId\)/)
    assert.match(creator, /memberId: r\.id,/)
    const section = read("components/community/creator/members-section.tsx")
    assert.match(section, /useState<string \| null>\(p\.focus\?\.userId \?\? null\)/)
    assert.match(section, /url\.searchParams\.set\("member", row\.memberId\)/)
    assert.match(read("app/(storelib)/app/community/[id]/members/page.tsx"), /focus=\{r\.focus\}/)
  })

  console.log("\nView contact\n")
  await check("responses link to the person through /app/contacts/open only, and an anonymous response has no link", () => {
    const panels = read("app/(storelib)/app/emails/forms/form-panels.tsx")
    assert.match(panels, /`\/app\/contacts\/open\?from=\$\{from\}&id=\$\{encodeURIComponent\(id\)\}`/)
    /* Changed on purpose (wave 7): the link is worked out once per row (the person's name and View contact both use it). */
    assert.match(panels, /identifiable\(r\) \? \(?[\s\S]{0,200}contactOpenHref\("form_submission", r\.id\)/)
    assert.match(panels, /contactOpenHref\("site_form_submission", r\.id\)/)
    assert.doesNotMatch(panels, /\/app\/contacts\/(?!open)/)
  })
  await check("a member's sheet has View contact (owner and admins) to /app/contacts/open?from=community_member", () => {
    const sheet = read("components/community/creator/member-sheet.tsx")
    assert.match(sheet, /\/app\/contacts\/open\?from=community_member&id=\$\{encodeURIComponent\(memberId\)\}/)
    assert.match(sheet, /canContact && m\.memberId && m\.role !== "owner"/)
    assert.match(read("components/community/creator/members-section.tsx"), /canContact=\{p\.canEmail\}/)
  })

  console.log("\nInsights\n")
  await check("weeks, sources, follow up and identified come from the responses, the newest week last", () => {
    const now = Date.parse("2026-11-08T12:00:00Z")
    const i = formInsights(
      [
        { submitted_at: "2026-11-07T10:00:00Z", source_kind: "onepage", status: "new", contact_email: "a@b.co" },
        { submitted_at: "2026-11-01T10:00:00Z", source_kind: "website", status: "contacted" },
        { submitted_at: "2025-01-01T10:00:00Z", source_kind: "form", status: "converted", contact_phone: "+1" },
      ],
      { now },
    )
    assert.equal(i.total, 3)
    assert.equal(i.last30, 2)
    assert.equal(i.weeks.length, 12)
    assert.equal(i.weeks[11].count, 1)
    assert.equal(i.weeks.reduce((n, w) => n + w.count, 0), 2)
    assert.deepEqual(i.sources, { onepage: 1, website: 1, form: 1 })
    assert.equal(i.identified, 2)
    assert.equal(i.scores, null)
  })
  await check("  a quiz's scores fall into its results' ranges", () => {
    const i = formInsights([{ submitted_at: "2026-11-01T00:00:00Z", score: 3 }, { submitted_at: "2026-11-01T00:00:00Z", score: 9 }], { quiz: true, results: [{ id: "a", min: 0, max: 5, title: "Low", message: "" }, { id: "b", min: 6, max: 10, title: "High", message: "" }] })
    assert.deepEqual(i.scores?.map((s) => [s.label, s.count]), [["Low", 1], ["High", 1]])
  })
  await check("  the insights route reads only the owner's own form and responses, at most 5,000", () => {
    const route = read("app/api/forms/[id]/insights/route.ts")
    assert.match(route, /from\("native_forms"\)\.select\("id,draft,published"\)\.eq\("id", id\)\.eq\("owner_id", actor\.user\.id\)/)
    assert.match(route, /\.eq\("owner_id", actor\.user\.id\)\s*\.eq\("form_id", id\)/)
    assert.match(route, /const READ_CAP = 5000/)
  })

  console.log("\nMembership and consent\n")
  await check("one row per person per community: the unique key exists since part 81 and every way in goes through grantMembership", () => {
    assert.match(read("supabase/sql/run-now/81_communities.sql"), /CONSTRAINT community_members_once UNIQUE \(community_id, user_id\)/)
    const inserts: string[] = []
    for (const f of [...walk("lib"), ...walk("app")]) {
      const src = read(f)
      if (/from\("community_members"\)\s*\.(insert|upsert)\(/.test(src)) inserts.push(f)
    }
    assert.deepEqual(inserts, ["lib/communities/server/membership.ts"])
    const membership = read("lib/communities/server/membership.ts")
    assert.match(membership, /if \(isUniqueViolation\(error\) && !retried\) return grantMembership\(db, input, true\)/)
    const join = read("lib/communities/server/join.ts")
    assert.ok((join.match(/grantMembership\(/g) || []).length >= 4, "free join, request, paid and invite paths")
    assert.match(read("lib/communities/server/moderation.ts"), /grantMembership\(db, \{/)
  })
  await check("joining never puts anyone on the marketing list or marks consent", () => {
    const files = [...walk("lib/communities"), ...walk("components/community"), ...walk("app/api/app/community")]
    const offenders = files.filter((f) => /from\("subscribers"\)|recordCheckoutContact|email_opt_in:\s*"true"/.test(read(f)))
    assert.deepEqual(offenders, [])
    /* A community membership bought through the memberships checkout records a contact only on the buyer's own tick. */
    assert.match(read("app/api/memberships/checkout/route.ts"), /if \(body\.emailOptIn === true\) \{\s*after\(async \(\) => \{\s*await recordCheckoutContactAndWelcome/)
  })
  await check("join answers stay in community_join_answers, apart from marketing form responses, and show in the member's sheet", () => {
    const files = walk("lib/communities")
    assert.deepEqual(files.filter((f) => /from\("form_submissions"\)/.test(read(f))), [])
    const panel = read("lib/communities/server/member-panel.ts")
    assert.match(panel, /answersOf\(db, communityId, \[userId\]\)/)
    assert.match(read("app/api/app/community/[id]/members/[userId]/route.ts"), /answers: can\(gate\.role, "approve_member", gate\.viewer\.perms\)/)
    assert.match(read("components/community/creator/member-sheet.tsx"), /data-member-join-answers/)
  })

  console.log("\nCheckout parts\n")
  await check("the checkout's shared ui, words and Stripe loader live in components/checkout/parts, with no second copy", () => {
    for (const f of ["ui.tsx", "words.tsx", "stripe-loader.ts"]) {
      assert.ok(statSync(`components/checkout/parts/${f}`).isFile())
      assert.throws(() => statSync(`app/(storelib)/checkout/parts/${f}`))
    }
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
