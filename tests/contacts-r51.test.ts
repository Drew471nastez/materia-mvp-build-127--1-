/**
 * CONTACTS (round 51): one person per creator, read the way the People list,
 * a profile, the export and the composer's preselect read them.
 *
 * Through the real route handlers over the journey harness (tests/_journey:
 * an in-memory PostgREST with every table the SQL makes, no creator_people
 * function, so the app's own join answers, as before SQL part 378 runs):
 *
 *   the same account as a subscriber, a buyer and a community member is one
 *   person; two people sharing a name are two; an address on an account whose
 *   email is not confirmed is never joined to it; an address two accounts
 *   gave stays apart; a community member who never subscribed is not
 *   marketing eligible; another store's row through /app/contacts/open is
 *   refused; an export holds only the store's own people; deleting a contact
 *   removes only the creator's own row; an import never puts back on the list
 *   somebody who left it; the legacy addresses redirect.
 *
 * The SQL function's parity with lib/contacts/identity.ts is checked on a
 * real Postgres by scripts/check-contacts-sql.mjs.
 *
 * Run: node scripts/run-push-tests.mjs (in SUITES)
 */
import "./_journey/env"
import { readFileSync } from "node:fs"
import { Journey } from "./_journey/harness"
import { contactsForEmail, lookupContacts } from "@/lib/contacts/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { contactKey, mergePeople, parseContactKey, readPeopleQuery, peopleQueryString, type SourceRecord, type Account } from "@/lib/contacts/identity"
import { readImport, csvCell } from "@/lib/contacts/csv"
import { contactsPermitted, memberSees, pathPermits } from "@/lib/team/permissions"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(p, "utf8")

/* The suite's next/navigation records where redirect() was asked to go (scripts/push-test-loader.mjs); the first one is where the page sends you. */
async function redirectOf(load: () => Promise<{ default: (a: { searchParams: Promise<Record<string, string>> }) => unknown }>, sp: Record<string, string> = {}): Promise<string | null> {
  const seen: string[] = []
  ;(globalThis as { __PUSH_TEST_REDIRECTS__?: string[] }).__PUSH_TEST_REDIRECTS__ = seen
  try {
    const mod = await load()
    await mod.default({ searchParams: Promise.resolve(sp) })
  } catch (e) {
    const digest = String((e as { digest?: string }).digest ?? "")
    if (digest.startsWith("NEXT_REDIRECT")) seen.push(digest.split(";")[2] ?? "")
  } finally {
    delete (globalThis as { __PUSH_TEST_REDIRECTS__?: string[] }).__PUSH_TEST_REDIRECTS__
  }
  return seen[0] ?? null
}

async function main() {
  section("1. The rule, pure (lib/contacts/identity.ts)")
  {
    const U = "11111111-1111-4111-8111-111111111111"
    const accounts = new Map<string, Account>([[U, { email: "ana@ex.com", verified: true, name: "Ana" }]])
    const recs: SourceRecord[] = [
      { kind: "subscriber", id: "22222222-2222-4222-8222-222222222222", userId: null, email: "ana@ex.com", name: "Ana", at: "2026-01-01T00:00:00Z", status: "subscribed", active: true },
      { kind: "order", id: "33333333-3333-4333-8333-333333333333", userId: U, email: "ana@ex.com", name: null, at: "2026-02-01T00:00:00Z", paid: true },
      { kind: "community_member", id: "44444444-4444-4444-8444-444444444444", userId: U, email: null, name: null, at: "2026-03-01T00:00:00Z", live: true },
      { kind: "form_submission", id: "55555555-5555-4555-8555-555555555555", userId: null, email: null, name: "Ana", at: "2026-03-02T00:00:00Z" },
    ]
    const people = mergePeople(recs, accounts)
    check("account + its verified address + an order + a membership: one person", people.filter((p) => p.userId === U).length === 1 && people.find((p) => p.userId === U)!.customer && people.find((p) => p.userId === U)!.member && people.find((p) => p.userId === U)!.subscriber, people)
    check("a form answered with a name and no address is a person of its own (never joined by name)", people.length === 2, people.map((p) => p.id))
    check("a key names its row and parses back", parseContactKey(contactKey("user", U))?.id === U && parseContactKey("x_" + U) === null && parseContactKey("u_not-a-uuid") === null)
    const q = readPeopleQuery((k) => ({ filter: "members", sort: "name", page: "2", tag: " vip ", community: "bad", from: "2026-01-01" } as Record<string, string>)[k])
    check("the address is read strictly: unknown values dropped", q.filter === "members" && q.sort === "name" && q.page === 2 && q.adv.tag === "vip" && !q.adv.community && q.adv.from === "2026-01-01", q)
    check("and written back without its defaults", peopleQueryString({ ...q, page: 1 }) === "filter=members&sort=name&tag=vip&from=2026-01-01", peopleQueryString({ ...q, page: 1 }))
    const imp = readImport("﻿Name;E-mail;Tags\nAna;ANA@ex.com;vip|beta\nBo;not-an-address;\nAna again;ana@ex.com;\n")
    check("an import reads a semicolon file, the address column by its name, each address once", imp.rows.length === 1 && imp.rows[0].email === "ana@ex.com" && imp.rows[0].tags.join() === "vip,beta" && imp.invalid === 1 && imp.repeated === 1, imp)
    check("an export cell a spreadsheet would run is written as text", csvCell("=HYPERLINK(1)") === "'=HYPERLINK(1)" && csvCell('a,"b"') === '"a,""b"""')
  }

  section("2. Two stores, their people")
  const j = await Journey.start()
  const seller = await j.signUp("maker@example.com", { name: "Mia Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mia" } })
  const other = await j.signUp("rival@example.com", { name: "Rex Rival" })
  await j.call("POST /api/onboarding/finalize", { as: other, body: { role: "creator", creatorSlug: "rex" } })
  const A = j.rows("creators").find((c) => c.user_id === seller.id)!
  const B = j.rows("creators").find((c) => c.user_id === other.id)!
  check("both stores exist", !!A?.id && !!B?.id)

  const ana = await j.signUp("ana@ex.com", { name: "Ana" })
  const mo = await j.signUp("mo@ex.com", { name: "Mo" })
  const uv = await j.signUp("uv@ex.com", { name: "Uv" })
  const g1 = await j.signUp("g1@ex.com")
  const g2 = await j.signUp("g2@ex.com")
  const verify = (id: string, yes: boolean) => {
    const p = j.rows("profiles").find((r) => r.id === id)!
    p.email_verified = yes
  }
  verify(ana.id, true)
  verify(mo.id, true)
  verify(uv.id, false)
  verify(g1.id, true)
  verify(g2.id, true)

  const now = (d: number) => new Date(Date.UTC(2026, 5, d)).toISOString()
  const [subAna] = j.db.insert("subscribers", { creator_id: A.id, email: "ana@ex.com", name: "Ana", status: "subscribed", is_active: true, subscribed_at: now(1), created_at: now(1) }, {})
  const [order] = j.db.insert("orders", { creator_id: A.id, buyer_id: ana.id, buyer_email: "Ana@Ex.com", amount_cents: 1500, currency: "usd", status: "completed", created_at: now(2) }, {})
  const [community] = j.db.insert("communities", { creator_id: A.id, owner_user_id: seller.id, slug: "club", name: "Club" }, {})
  const [memberAna] = j.db.insert("community_members", { community_id: community.id, user_id: ana.id, status: "active", role: "member", joined_at: now(3) }, {})
  const [memberMo] = j.db.insert("community_members", { community_id: community.id, user_id: mo.id, status: "active", role: "member", joined_at: now(4) }, {})
  j.db.insert("community_members", { community_id: community.id, user_id: seller.id, status: "active", role: "owner", joined_at: now(1) }, {})
  /* Two different people with the same name. */
  j.db.insert("subscribers", { creator_id: A.id, email: "sam.one@ex.com", name: "Sam Lee", status: "subscribed", is_active: true, subscribed_at: now(5), created_at: now(5) }, {})
  j.db.insert("subscribers", { creator_id: A.id, email: "sam.two@ex.com", name: "Sam Lee", status: "subscribed", is_active: true, subscribed_at: now(6), created_at: now(6) }, {})
  /* An account whose address is not confirmed, and a sign up with that address. */
  j.db.insert("community_members", { community_id: community.id, user_id: uv.id, status: "active", role: "member", joined_at: now(7) }, {})
  j.db.insert("subscribers", { creator_id: A.id, email: "uv@ex.com", name: "Someone", status: "subscribed", is_active: true, subscribed_at: now(7), created_at: now(7) }, {})
  /* One address given by two accounts at checkout, and a sign up with it. */
  j.db.insert("orders", { creator_id: A.id, buyer_id: g1.id, buyer_email: "shared@ex.com", amount_cents: 100, status: "completed", created_at: now(8) }, {})
  j.db.insert("orders", { creator_id: A.id, buyer_id: g2.id, buyer_email: "shared@ex.com", amount_cents: 100, status: "completed", created_at: now(8) }, {})
  j.db.insert("subscribers", { creator_id: A.id, email: "shared@ex.com", status: "subscribed", is_active: true, subscribed_at: now(9), created_at: now(9) }, {})
  /* The other store's people. */
  const [subB] = j.db.insert("subscribers", { creator_id: B.id, email: "secret@rival.com", name: "Rival Fan", status: "subscribed", is_active: true, subscribed_at: now(1), created_at: now(1) }, {})
  const [orderB] = j.db.insert("orders", { creator_id: B.id, buyer_id: ana.id, buyer_email: "ana@ex.com", amount_cents: 999, status: "completed", created_at: now(2) }, {})

  section("3. The People list (before SQL part 378: the app's own join)")
  const list = await j.call("GET /api/contacts?sort=name", { as: seller })
  check("the list answers", list.status === 200 && Array.isArray(list.json?.rows), list)
  const rows = (list.json?.rows ?? []) as Array<{ id: string; userId: string | null; email: string | null; name: string | null; customer: boolean; member: boolean; subscriber: boolean; orders: number }>
  check("it was answered by the app's join (no creator_people in this database)", list.json?.via === "app")
  const anaRows = rows.filter((r) => r.userId === ana.id || r.email === "ana@ex.com")
  check("Ana as a subscriber, a buyer (address in another case) and a community member is ONE person", anaRows.length === 1 && anaRows[0].id === `u_${ana.id}` && anaRows[0].customer && anaRows[0].member && anaRows[0].subscriber && anaRows[0].orders === 1, anaRows)
  check("two people named Sam Lee are two", rows.filter((r) => r.name === "Sam Lee").length === 2)
  check("an unconfirmed account's address is not joined to it: two people", rows.filter((r) => r.userId === uv.id).length === 1 && rows.some((r) => r.userId === null && r.email === "uv@ex.com"), rows.filter((r) => r.email === "uv@ex.com" || r.userId === uv.id))
  check("an address two accounts gave stays apart from both", rows.some((r) => r.userId === null && r.email === "shared@ex.com") && rows.filter((r) => r.userId === g1.id || r.userId === g2.id).length === 2)
  check("the store's owner, as their own community's owner, is not one of its people", !rows.some((r) => r.userId === seller.id))
  check("nobody of the other store is listed", !rows.some((r) => r.email === "secret@rival.com"))
  check("the five counts", list.json?.counts?.all === rows.length && list.json?.counts?.members === 3 && list.json?.counts?.customers === 3, list.json?.counts)
  const members = await j.call("GET /api/contacts?filter=members", { as: seller })
  check("?filter=members: the three live community members", members.json?.total === 3, members.json?.total)
  const searched = await j.call("GET /api/contacts?q=sam", { as: seller })
  check("search by name", searched.json?.total === 2)
  const anonymous = await j.call("GET /api/contacts")
  check("signed out: refused", anonymous.status === 401)

  section("4. Marketing eligibility is the list's, never a membership")
  const targets = await contactsForEmail(A.id, [`u_${ana.id}`, `u_${mo.id}`, `s_${subB.id}`])
  const t = (id: string) => targets.find((x) => x.id === id)
  check("Ana (subscribed) may get a campaign", t(`u_${ana.id}`)?.marketingEligible === true && t(`u_${ana.id}`)?.email === "ana@ex.com", targets)
  check("Mo, a community member who never subscribed, may not", t(`u_${mo.id}`)?.marketingEligible === false && t(`u_${mo.id}`)?.reason === "not_subscribed", t(`u_${mo.id}`))
  check("another store's subscriber is not found", t(`s_${subB.id}`)?.reason === "not_found" && !t(`s_${subB.id}`)?.email)
  const anaSub = j.rows("subscribers").find((s) => s.id === subAna.id)!
  Object.assign(anaSub, { status: "unsubscribed", is_active: false })
  const after = await contactsForEmail(A.id, [`u_${ana.id}`])
  check("unsubscribed: not eligible, reason said", after[0]?.marketingEligible === false && after[0]?.reason === "unsubscribed", after)
  Object.assign(anaSub, { status: "subscribed", is_active: true })

  const looked = await lookupContacts(createAdminClient(), A.id, [`u_${ana.id}`, `u_${mo.id}`, `s_${subB.id}`])
  check("lookupContacts, the composer's shape: own ids only, eligible and no_consent", looked.length === 2 && looked.find((l) => l.contactId === `u_${ana.id}`)?.marketing === "eligible" && looked.find((l) => l.contactId === `u_${mo.id}`)?.marketing === "no_consent", looked)
  section("5. /app/contacts/open: the store's own rows only")
  const mine = await j.call(`GET /app/contacts/open?from=order&id=${order.id}`, { as: seller })
  check("an order of this store opens its buyer", mine.status === 303 && /\/app\/contacts\/u_/.test(mine.location ?? "") && (mine.location ?? "").includes(ana.id), mine.location)
  const viaMember = await j.call(`GET /app/contacts/open?from=community_member&id=${memberAna.id}`, { as: seller })
  check("a community member opens the same person", viaMember.location === mine.location, viaMember.location)
  const viaSub = await j.call(`GET /app/contacts/open?from=subscriber&id=${subAna.id}`, { as: seller })
  check("and so does their subscriber row", viaSub.location === mine.location, viaSub.location)
  const theirs = await j.call(`GET /app/contacts/open?from=subscriber&id=${subB.id}`, { as: seller })
  check("another store's subscriber is refused, nothing of it shown", theirs.status === 303 && (theirs.location ?? "").endsWith("/app/contacts?notice=not_found"), theirs.location)
  const theirOrder = await j.call(`GET /app/contacts/open?from=order&id=${orderB.id}`, { as: seller })
  check("another store's order is refused", (theirOrder.location ?? "").endsWith("notice=not_found"), theirOrder.location)
  const stranger = await j.call(`GET /app/contacts/open?from=user&id=${g1.id}`, { as: other })
  check("an account with no row in that store is refused", (stranger.location ?? "").endsWith("notice=not_found"), stranger.location)
  const signedOut = await j.call(`GET /app/contacts/open?from=order&id=${order.id}`)
  check("signed out: to sign in, and back after", (signedOut.location ?? "").includes("/login?next="), signedOut.location)

  section("6. A profile, and what it never shows")
  const profile = await j.call(`GET /api/contacts/u_${ana.id}`, { as: seller })
  check("Ana's profile: one purchase of this store, her community, her consent", profile.status === 200 && profile.json?.purchases?.length === 1 && profile.json?.communities?.length === 1 && profile.json?.consent?.state === "subscribed", profile.json && { purchases: profile.json.purchases, communities: profile.json.communities, consent: profile.json.consent })
  check("the community deep link is the member's own", profile.json?.communities?.[0]?.memberId === memberAna.id)
  const moProfile = await j.call(`GET /api/contacts/u_${mo.id}`, { as: seller })
  check("Mo: a member, and marketing 'none', kept apart", moProfile.json?.person?.member === true && moProfile.json?.consent?.state === "none", moProfile.json?.consent)
  const crossProfile = await j.call(`GET /api/contacts/s_${subB.id}`, { as: seller })
  check("another store's key is 404", crossProfile.status === 404)

  section("7. Export: only the store's own")
  const exp = await j.call("GET /api/contacts/export", { as: seller })
  const csv = String(exp.json ?? "")
  check("A's export has A's people", exp.status === 200 && csv.includes("ana@ex.com") && csv.includes("sam.one@ex.com"), csv.slice(0, 300))
  check("and none of B's", !csv.includes("secret@rival.com"))
  const expB = await j.call("GET /api/contacts/export", { as: other })
  const csvB = String(expB.json ?? "")
  check("B's export has B's subscriber and Ana as B's buyer, nobody else of A's", csvB.includes("secret@rival.com") && !csvB.includes("sam.one@ex.com") && !csvB.includes("mo@ex.com"), csvB.slice(0, 300))
  const picked = await j.call(`GET /api/contacts/export?ids=u_${mo.id}`, { as: seller })
  check("an export of a selection has only the people picked", String(picked.json).includes("mo@ex.com") && !String(picked.json).includes("ana@ex.com"))

  section("8. Tags, delete, import")
  const tag = await j.call("POST /api/contacts/bulk", { as: seller, body: { action: "tag", ids: [`u_${ana.id}`, `s_${subB.id}`], tag: "VIP" } })
  check("tagging: only this store's people", tag.status === 200 && tag.json?.changed === 1 && j.rows("creator_contacts").length === 1 && j.rows("creator_contacts")[0].creator_id === A.id, tag.json)
  const tagged = await j.call("GET /api/contacts?tag=vip", { as: seller })
  check("the tag filters the list, and Ana is still one person (now kept by a contact row)", tagged.json?.total === 1 && String(tagged.json?.rows?.[0]?.id).startsWith("c_"), tagged.json?.rows)
  const ordersBefore = j.rows("orders").length
  const del = await j.call("POST /api/contacts/bulk", { as: seller, body: { action: "delete", ids: [tagged.json?.rows?.[0]?.id] } })
  check("deleting removes only the creator's own row", del.json?.deleted === 1 && j.rows("creator_contacts").length === 0 && j.rows("orders").length === ordersBefore && j.rows("community_members").some((m) => m.id === memberAna.id) && j.rows("subscribers").some((s) => s.id === subAna.id), del.json)
  check("and she is still in the list, made of her other rows", (await j.call("GET /api/contacts?q=ana", { as: seller })).json?.total === 1)
  const imported = await j.call("POST /api/contacts/import?subscribe=1", { as: seller, raw: "email,name\nnew@ex.com,New Person\nana@ex.com,Ana\nleft@ex.com,Left\n", headers: { "content-type": "text/csv" } })
  j.db.insert("subscribers", { creator_id: A.id, email: "gone@ex.com", status: "unsubscribed", is_active: false, subscribed_at: now(1), created_at: now(1) }, {})
  const again = await j.call("POST /api/contacts/import?subscribe=1", { as: seller, raw: "email\ngone@ex.com\n", headers: { "content-type": "text/csv" } })
  check("an import with the creator's yes adds new addresses to the list", imported.status === 200 && j.rows("subscribers").some((s) => s.email === "new@ex.com" && s.status === "subscribed" && s.creator_id === A.id), imported.json)
  check("but never puts back somebody who unsubscribed", again.json?.keptOff === 1 && j.rows("subscribers").find((s) => s.email === "gone@ex.com")?.status === "unsubscribed", again.json)
  const noYes = await j.call("POST /api/contacts/import", { as: seller, raw: "email\nquiet@ex.com\n", headers: { "content-type": "text/csv" } })
  check("without the yes: a contact, not a subscriber", noYes.status === 200 && !j.rows("subscribers").some((s) => s.email === "quiet@ex.com") && j.rows("creator_contacts").some((c) => c.email_normalized === "quiet@ex.com"), noYes.json)

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)

  section("9. Legacy addresses")
  const r1 = await redirectOf(() => import("@/app/(storelib)/app/emails/forms/page") as never, { form: "f1", view: "responses", response: "r1", message: "m1", inbox: "1", siteform: "s1", other: "x" })
  check("/app/emails/forms keeps ?form, ?view, ?response, ?message, ?inbox and ?siteform", r1 === "/app/contacts/forms?form=f1&view=responses&response=r1&message=m1&inbox=1&siteform=s1", r1)
  check("/app/emails/forms alone", (await redirectOf(() => import("@/app/(storelib)/app/emails/forms/page") as never)) === "/app/contacts/forms")
  check("/app/audience: the People list showing leads", (await redirectOf(() => import("@/app/(storelib)/app/audience/page") as never)) === "/app/contacts?filter=leads")
  check("/app/audience/leads?lead= opens that person through the resolver", (await redirectOf(() => import("@/app/(storelib)/app/audience/leads/page") as never, { lead: "abc" })) === "/app/contacts/open?from=lead&id=abc")
  check("/app/audience/forms?form= keeps the form", (await redirectOf(() => import("@/app/(storelib)/app/audience/forms/page") as never, { form: "f9" })) === "/app/contacts/forms?form=f9")

  section("10. Navigation and team access")
  const sidebar = read("components/app/sidebar.tsx")
  const contactsAt = sidebar.indexOf('{ href: "/app/contacts", label: tt("Contacts"), icon: NAV_ICONS.contacts }')
  check("Contacts sits directly above Emails, with no rows under it", contactsAt > 0 && sidebar.indexOf('{ href: "/app/emails", label: t("nav.emails"), icon: NAV_ICONS.emails }') > contactsAt && !/href: "\/app\/contacts"[^}]*children/.test(sidebar))
  check("one icon pair, drawn and filled", /contacts: \{ line: ContactsLinear, fill: ContactsBold \}/.test(read("components/app/sidebar-desktop-nav.tsx")))
  check("a member with Customers or Marketing sees Contacts; one with neither does not", memberSees(["customers"], "/app/contacts") && memberSees(["marketing"], "/app/contacts?filter=leads") && !memberSees(["products"], "/app/contacts") && contactsPermitted(["marketing"]) && pathPermits(["marketing"], "/app/contacts/u_x") && !pathPermits(["orders"], "/app/contacts"))
  check("the order page links to the person through the resolver", read("app/(storelib)/app/orders/order-detail.tsx").includes("/app/contacts/open?from=order&id="))
  check("Customers stays (spend in the store's currency, location) and links both ways", read("app/(storelib)/app/customers/page.tsx").includes("/app/contacts/open?from=customer&id=") && read("app/(storelib)/app/customers/page.tsx").includes("/app/contacts?filter=customers"))

  section("11. SQL part 378")
  const sql = read("supabase/sql/run-now/378_creator_contacts.sql")
  check("mirrored as a migration, text unchanged", read("supabase/migrations/20271136_creator_contacts.sql") === sql)
  check("RLS on, no table or function for anon and authenticated", /alter table public\.creator_contacts enable row level security/.test(sql) && /revoke all on public\.creator_contacts from anon, authenticated/.test(sql) && /revoke all on function public\.creator_people\([^)]*\) from public, anon, authenticated/.test(sql) && /grant execute on function public\.creator_people\([^)]*\) to service_role/.test(sql))
  check("every source read is filtered by the creator", (sql.match(/where [a-z]+\.creator_id = p_creator|where co\.creator_id = p_creator|where pr\.creator_id = p_creator|fs\.owner_id = v_owner|op\.seller_id = p_creator/g) ?? []).length >= 9)
  check("never deletes or rewrites a source row", !/\b(delete from|update public\.(orders|subscribers|community_members|form_submissions|memberships))\b/i.test(sql.replace(/\/\*[\s\S]*?\*\//g, "")))
  check("listed in the README and the check after", read("supabase/sql/run-now/README.md").includes("`378_creator_contacts.sql`") && /as p378_creator_contacts;/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
