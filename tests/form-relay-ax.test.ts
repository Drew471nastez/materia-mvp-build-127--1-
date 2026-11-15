/**
 * Round AX (track 4): a store's forms were an open relay.
 *
 * A Contact Form section's "Recipient Email" took any address, unconfirmed,
 * and every visitor's message went there from Storelib's sending domain (30
 * an hour, 200 a day per store, as many stores as somebody cares to open).
 * The support email, a community's contact email, and the address native
 * form responses and booking changes went to were the same kind of address.
 * Now mail somebody else wrote goes only to an address the store has proven
 * it owns (the account's sign in address, a team member's), else to the
 * account's own (lib/seller-inbox provenInbox). The rate limits stay.
 */
import { readFileSync } from "node:fs"
import { FakeSupabase } from "./fake-supabase"
import { readCode } from "./_source"
import { provenInbox, provenInboxForUser, sellerInbox } from "@/lib/seller-inbox"
import { creatorInbox } from "@/lib/site-contact/contact"
import { handleContact, type ContactDeps } from "@/lib/site-contact/handle"
import { cleanContactSource } from "@/lib/contacts/contact-source"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

const STORE = "22222222-2222-4222-8222-222222222222"
const OWNER = "u-owner"
const MATE = "u-mate"
const INVITED = "u-invited"
const BIZ = "u-business"
const LOGINS: Record<string, string> = {
  [OWNER]: "Owner@Shop.com",
  [MATE]: "mate@shop.com",
  [INVITED]: "invited@shop.com",
  [BIZ]: "owner+slb-1a2b3c4d@shop.com",
}
const login = async (id: string) => LOGINS[id] ?? null
const noAuth = async () => null

function storeDb(opts: { support?: string | null; recipient?: string; user?: string; team?: boolean; link?: boolean } = {}) {
  const db = new FakeSupabase()
  db.table("creators", {}, [{ id: STORE, user_id: opts.user ?? OWNER, support_email: opts.support ?? null }])
  db.table("profiles", {}, [{ id: opts.user ?? OWNER, email: "profile@shop.com" }])
  if (opts.team !== false) {
    db.table("store_team_members", {}, [
      { id: "t1", creator_id: STORE, user_id: MATE, email: "mate@shop.com", status: "active" },
      { id: "t2", creator_id: STORE, user_id: INVITED, email: "invited@shop.com", status: "invited" },
      { id: "t3", creator_id: "someone-else", user_id: "u-other", email: "other@shop.com", status: "active" },
    ])
  }
  if (opts.link) db.table("business_links", {}, [{ member_id: BIZ, owner_id: OWNER }])
  db.table("store_theme_installs", {}, [{ id: "inst", creator_id: STORE, status: "published", sort_order: 0 }])
  db.table("store_theme_pages", {}, [{ install_id: "inst", sections: [{ id: "form", type: "contact_form", settings: { recipient_email: opts.recipient ?? "" } }] }])
  return db
}

async function main() {
  console.log("\nWhere a visitor's message goes: only an address the store has proven")
  {
    const r = await provenInbox(storeDb(), STORE, login, ["owner@shop.com"])
    check("a recipient that is the account's sign in email passes", r?.to === "owner@shop.com" && r.held === false)
    const random = await provenInbox(storeDb(), STORE, login, ["victim@elsewhere.com"])
    check("a random address falls back to the account's sign in email", random?.to === "owner@shop.com" && random.via === "account")
    check("  and says it was held (for the log, never the address)", random?.held === true)
    const mate = await provenInbox(storeDb(), STORE, login, ["Mate@Shop.com"])
    check("an active team member's sign in email passes", mate?.to === "mate@shop.com" && mate.via === "chosen" && mate.held === false)
    const invited = await provenInbox(storeDb(), STORE, login, ["invited@shop.com"])
    check("someone only invited (not active) is not proof", invited?.to === "owner@shop.com" && invited.held)
    const other = await provenInbox(storeDb(), STORE, login, ["other@shop.com"])
    check("another store's team member is not proof", other?.to === "owner@shop.com")
    const noTeamTable = await provenInbox(storeDb({ team: false }), STORE, login, ["mate@shop.com"])
    check("before the team table exists, a team address simply is not proven (no error)", noTeamTable?.to === "owner@shop.com")
  }
  {
    const random = await provenInbox(storeDb({ support: "victim@elsewhere.com" }), STORE, login)
    check("an unconfirmed support email is passed over too", random?.to === "owner@shop.com" && random.held)
    const own = await provenInbox(storeDb({ support: "mate@shop.com" }), STORE, login)
    check("a support email that is a team member's sign in email is used", own?.to === "mate@shop.com")
    const first = await provenInbox(storeDb({ support: "mate@shop.com" }), STORE, login, ["victim@elsewhere.com"])
    check("a held recipient falls through to a proven support email before the account", first?.to === "mate@shop.com" && first.held)
    const none = await provenInbox(storeDb(), STORE, login)
    check("nothing chosen: the account's own address, nothing held", none?.to === "owner@shop.com" && none.held === false)
  }
  {
    const biz = await provenInbox(storeDb({ user: BIZ, link: true }), STORE, login, ["owner@shop.com"])
    check("a second business: the owning login's address is proven and has no +slb- tag", biz?.to === "owner@shop.com" && !/\+slb-/.test(biz.to))
    const hiccup = await provenInbox(storeDb(), STORE, noAuth, ["victim@elsewhere.com"])
    check("Auth unreadable: the profile's address still gets it (never the chosen one)", hiccup?.to === "profile@shop.com" && hiccup.via === "profile")
    check("no store: null", (await provenInbox(new FakeSupabase().table("creators", {}, []), STORE, login)) === null)
  }
  {
    const byUser = await provenInboxForUser(storeDb({ support: "victim@elsewhere.com" }), OWNER, login)
    check("a form owner's user id finds their store, then the proven address", byUser?.to === "owner@shop.com")
    const noStore = await provenInboxForUser(new FakeSupabase().table("creators", {}, []), MATE, login)
    check("a form owner with no store: their own sign in email", noStore?.to === "mate@shop.com")
  }
  {
    /* The old order still answers for mail Storelib writes itself (sales, refunds): unchanged. */
    const old = await sellerInbox(storeDb({ support: "help@brand.com" }), STORE, login)
    check("sellerInbox (sale mail, receipts' Reply-To) still answers the support email", old?.to === "help@brand.com")
  }

  console.log("\nThe Contact Form, end to end")
  {
    check("the section's random Recipient Email is not used", (await creatorInbox(storeDb({ recipient: "victim@elsewhere.com" }), STORE, "form", login)) === "owner@shop.com")
    check("the section's Recipient Email that is a team member's is used", (await creatorInbox(storeDb({ recipient: "mate@shop.com" }), STORE, "form", login)) === "mate@shop.com")
    check("the section's Recipient Email that is the account's is used", (await creatorInbox(storeDb({ recipient: "OWNER@shop.com" }), STORE, "form", login)) === "owner@shop.com")

    const db = storeDb({ recipient: "victim@elsewhere.com", support: "victim2@elsewhere.com" })
    db.table("subscribers", { defaults: () => ({ id: `s-${Math.random().toString(36).slice(2, 10)}`, source_detail: null }) })
    db.table("site_contact_messages", { defaults: (d) => ({ id: `m-${Math.random().toString(36).slice(2, 10)}`, created_at: d.now() }) })
    const sent: { to: string; replyTo: string }[] = []
    const logs: string[] = []
    const warn = console.warn
    console.warn = (...a: unknown[]) => { logs.push(a.map(String).join(" ")) }
    const deps: ContactDeps = {
      db,
      platform: "https://storelib.com",
      limit: async () => null,
      send: async (m) => { sent.push(m); return { success: true } },
      welcome: async () => {},
      source: (msg) => ({ site: "shop.storelib.com", detail: cleanContactSource({ surface: "website", site: "shop.storelib.com", form: "contact", page: msg.page }) }),
      brand: async () => "Shop",
      recordSource: async () => {},
      loginEmail: login,
    }
    const reply = await handleContact({ creator_id: STORE, name: "Spam", email: "visitor@example.org", subject: "Buy now", message: "Cheap pills here", consent: false, company: "", elapsed: 9000, page: "contact", section_id: "form" }, deps)
    console.warn = warn
    check("a visitor's message to a store with only unproven addresses reaches the account owner", reply.status === 200 && sent.length === 1 && sent[0].to === "owner@shop.com")
    check("  never the typed address or the unconfirmed support email", !sent.some((m) => /victim/.test(m.to)))
    check("  Reply-To stays the visitor", sent[0]?.replyTo === "visitor@example.org")
    check("  the log says an address was held, without the address", logs.some((l) => /not the account's or a team member's/.test(l)) && !logs.some((l) => /victim|owner@shop/.test(l)))
  }

  console.log("\nWiring: every place visitor or buyer words are mailed to a seller")
  const contact = readCode("lib/site-contact/contact.ts")
  check("the contact form's inbox is provenInbox, sellerInbox is gone from it", /provenInbox\(db, creatorId, loginEmail, chosen \? \[chosen\] : \[\]\)/.test(contact) && !/sellerInbox\(/.test(contact))
  check("  the section's address is offered as a choice, no longer returned straight away", !/if \(own\) return own/.test(contact))
  for (const route of ["app/api/receipt/contact/route.ts", "app/api/courses/contact/route.ts", "app/api/memberships/[id]/contact/route.ts"]) {
    const c = readCode(route)
    check(`${route}: a buyer's message goes through provenInbox`, /await provenInbox\(admin, [\w.]+, loginEmailFrom\(admin\)\)/.test(c) && !/sellerInbox\(/.test(c))
  }
  const community = readCode("lib/communities/server/membership-lifecycle.ts")
  check("a community member's message: the community's address only when proven", /provenInbox\(db, community\.creator_id, loginEmailFrom\(db\), own \? \[own\] : \[\]\)/.test(community) && !/const own = \(await communityPolicy\(db, community\.id\)\)\.contactEmail\s*if \(own\) return own/.test(community))
  const delivery = readCode("lib/forms/delivery-server.ts")
  const owner = delivery.slice(delivery.indexOf("async function ownerEmail"), delivery.indexOf("async function visitorEmail"))
  check("native form responses go to the proven inbox of the form owner's store (owner_id is a user id)", /provenInboxForUser\(db, job\.owner_id, loginEmailFrom\(db\)\)/.test(owner) && !/resolveCreatorIdentity/.test(owner))
  const announce = readCode("lib/bookings/announce-server.ts")
  check("a visitor's booking change goes to the proven inbox", /sellerEmail: inbox\?\.to \|\| null/.test(announce) && /provenInboxForUser\(db as never, ownerId, loginEmailFrom\(db\)\)/.test(announce))

  console.log("\nThe editor says where messages go, in the dashboard's language")
  const page = readCode("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the section panel draws the note", /<ContactDestinationNote type=\{section\.type\} settings=\{section\.settings\} \/>/.test(page))
  /* Raw source: readCode takes tt() away (tests/i18n-source.ts). */
  const note = read("components/website-builder/editor/contact-destination-note.tsx")
  const A = "Messages go to {email} only if it is your sign in email or a team member's. Otherwise they go to your sign in email."
  const B = "Messages go to your sign in email."
  const C = "Every message is also kept in Contacts › Forms."
  check("its words are tt()", [A, B, C].every((s) => note.includes(`tt(${JSON.stringify(s)}`)))
  for (const code of ["de", "es", "fr", "it", "pl", "pt-BR"]) {
    const cat = read(`lib/i18n/catalog/${code}.ts`)
    check(`  translated in ${code}`, [A, B, C].every((s) => cat.includes(`${JSON.stringify(s)}:`)))
  }
  const schema = JSON.parse(read("themes/default/sections/contact_form.json")) as { fields: { id: string; info?: string }[] }
  const field = schema.fields.find((s) => s.id === "recipient_email")
  check("the Recipient Email field says it is used only when proven", !!field?.info && /sign in email or a team member's/.test(field.info) && !/Empty uses your support email/.test(field.info))
  const canvas = readCode("components/website-builder/sections/renderers/ContactFormSection.tsx")
  check("the canvas no longer promises the typed address gets the mail", !/Messages are emailed to \$\{str\(s\.recipient_email\)\.trim\(\)\}/.test(canvas))
  const words = [note, field?.info ?? "", canvas.slice(canvas.indexOf("isEditing || inEditor) && ("))].join("\n")
  check("no em dash or banned words in the new copy", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortlessly|supercharge|transform)/i.test(words))

  console.log("\nThe rate limits stay as they were")
  const route = readCode("app/api/website-builder/contact/route.ts")
  check("30 an hour and 200 a day per store", /windows: \[\{ limit: 30, seconds: 3600 \}, \{ limit: 200, seconds: 86400 \}\]/.test(route))
  check("3 in ten minutes and 20 a day per visitor", /windows: \[\{ limit: 3, seconds: 600 \}, \{ limit: 20, seconds: 86400 \}\]/.test(route))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
