/**
 * ===========================================================================
 *  WAVE 9: ADD CONTACT, A PERSON'S PAGE AND FORMS, SMOOTH AND WORKING
 * ===========================================================================
 * The owner: "editing forms, contacts, add contact and the subpages of
 * contacts ... smooth, clean transitions, simple, easy to understand, all
 * fully working, no issues." What this wave fixed, held here:
 *   - Add contact is one clean sheet (Email, then Name, Phone, Tags, Notes,
 *     each optional), checked field by field before anything is sent, a
 *     person already in the store named with a link, and the new person on
 *     the list the moment the sheet closes (the sheet comes back as it was
 *     if the save fails). Notes and a phone typed there are kept (the route
 *     said it took notes and dropped them).
 *   - A person's page: Edit shows what it saved at once, keeps a phone, and
 *     the journey reads in the order things happened; the back arrow is the
 *     same 44px press as every other bar in Contacts.
 *   - Forms: a second visit shows the forms at once (no shimmer, no jump),
 *     the views' row holds its place while the first visit reads, Publish
 *     rests when there is nothing new, the Edit tab's card is not a second
 *     "Settings", a response's disclosure arrow is not a second menu arrow.
 * Measured in a browser frame by frame (the wave's probe); held here by
 * logic and by source.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { EMPTY_DRAFT, checkDraft, draftBody, draftEmail, draftPhone, draftTags, isPendingId, optimisticRow, sameEmail, withAdded } from "@/app/(storelib)/app/contacts/add-contact-logic"
import { journeyInTime } from "@/app/(storelib)/app/contacts/contact-words"
import { addDetails, cleanPhone, updateRow } from "@/lib/contacts/write-server"
import type { PersonRow } from "@/lib/contacts/identity"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  console.log("Add contact: what is checked before anything is sent")
  check("an empty address is asked for", JSON.stringify(checkDraft(EMPTY_DRAFT)) === JSON.stringify([{ field: "email", code: "email_missing" }]))
  check("a half address is not one", checkDraft({ ...EMPTY_DRAFT, email: "ana@" })[0]?.code === "email_invalid")
  check("a whole address passes, the rest optional", checkDraft({ ...EMPTY_DRAFT, email: "  Ana@Souza.Studio " }).length === 0)
  check("a phone in words is said under the phone", checkDraft({ ...EMPTY_DRAFT, email: "a@b.co", phone: "call me" }).map((p) => p.code).join() === "phone_invalid")
  check("an empty phone is fine", checkDraft({ ...EMPTY_DRAFT, email: "a@b.co", phone: "  " }).length === 0)
  check("addresses are kept as the lists key them", draftEmail(" Ana@Souza.Studio ") === "ana@souza.studio")
  check("a phone as typed, spaces tidied", draftPhone(" +351  912 345 678 ") === "+351 912 345 678" && draftPhone("12") === null && draftPhone("(212) 555-0100") === "(212) 555-0100")
  check("the server keeps the same phone rule", cleanPhone(" +351  912 345 678 ") === "+351 912 345 678" && cleanPhone("call me") === null && cleanPhone(42) === null)
  check("tags: trimmed, each once whatever its case", JSON.stringify(draftTags(" VIP, vip ,Wholesale,, ")) === JSON.stringify(["VIP", "Wholesale"]))
  const body = draftBody({ email: "Nina@Studio.io ", name: "  Nina  Petrova ", phone: "+351 912", tags: "A, B", notes: " met at the market ", agreed: true }, false)
  check("what is sent: the address, name, phone, tags and notes; never a subscribe without Marketing", body.email === "nina@studio.io" && body.name === "Nina Petrova" && body.phone === "+351 912" && body.tags.join() === "A,B" && body.notes === "met at the market" && body.subscribe === false)
  check("with Marketing and their word, they are subscribed", draftBody({ ...EMPTY_DRAFT, email: "a@b.co", agreed: true }, true).subscribe === true)

  console.log("\nAdd contact: the list at once")
  const row = (o: Partial<PersonRow>): PersonRow => ({ ...optimisticRow({ ...EMPTY_DRAFT, email: "x@y.co" }, "2026-11-10T00:00:00Z"), id: "c_1", ...o })
  const page = [row({ id: "u_ana", email: "ana@souza.studio", name: "Ana" }), row({ id: "s_2", email: "marcus@x.co" })]
  const fresh = optimisticRow({ ...EMPTY_DRAFT, email: "Nina@Studio.io", name: " Nina ", tags: "VIP" }, "2026-11-10T00:00:00Z")
  check("the new row is the person typed, added by hand, not yet named by the server", isPendingId(fresh.id) && fresh.email === "nina@studio.io" && fresh.name === "Nina" && fresh.origin === "manual" && fresh.tags.join() === "VIP" && fresh.hasContact)
  check("on All, page 1, it is on top", withAdded(page, [fresh], { filter: "all", page: 1, filtered: false })[0] === fresh)
  check("a person already on the page is not drawn twice", withAdded(page, [row({ id: "c_9", email: "ANA@souza.studio" })], { filter: "all", page: 1, filtered: false }).length === 2)
  check("not on another view, page or search, where they may not belong", withAdded(page, [fresh], { filter: "leads", page: 1, filtered: false }).length === 2 && withAdded(page, [fresh], { filter: "all", page: 2, filtered: false }).length === 2 && withAdded(page, [fresh], { filter: "all", page: 1, filtered: true }).length === 2)
  check("someone already in the store is found by address, whatever its case", sameEmail(page, " ANA@souza.studio ")?.id === "u_ana" && sameEmail(page, "nobody@x.co") === null)

  console.log("\nAdd contact: notes and a phone are kept")
  const calls: { op: string; set?: Record<string, unknown> }[] = []
  let kept: Record<string, unknown> = { id: "11111111-1111-4111-8111-111111111111", notes: "Old note", fields: { source_row: 3 } }
  const chain = (op: string, set?: Record<string, unknown>) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.maybeSingle = async () => ({ data: kept, error: null })
    q.then = (ok: (v: unknown) => unknown) => {
      calls.push({ op, set })
      if (op === "update" && set) kept = { ...kept, ...set }
      return Promise.resolve({ error: null }).then(ok)
    }
    return q
  }
  const db = { from: () => ({ select: () => chain("select"), update: (set: Record<string, unknown>) => chain("update", set) }) } as never
  const scope = { creatorId: "c1" } as never
  const key = await addDetails(db, scope, "ana@souza.studio", { notes: " Met at the market ", phone: "+351 912 345 678" })
  const upd = calls.find((c) => c.op === "update")?.set ?? {}
  check("the contact's key comes back, so the row opens the person", key === "c_11111111-1111-4111-8111-111111111111")
  check("new notes go under the ones already kept, never over them", upd.notes === "Old note\n\nMet at the market")
  check("the phone is kept in the row's own fields, the rest of them untouched", JSON.stringify(upd.fields) === JSON.stringify({ source_row: 3, phone: "+351 912 345 678" }))
  calls.length = 0
  await updateRow(db, scope, "11111111-1111-4111-8111-111111111111", { phone: "" })
  const cleared = calls.find((c) => c.op === "update")?.set ?? {}
  check("an emptied phone is taken off", JSON.stringify(cleared.fields) === JSON.stringify({ source_row: 3 }))
  calls.length = 0
  await addDetails(db, scope, "ana@souza.studio", {})
  check("nothing typed, nothing written", !calls.some((c) => c.op === "update"))

  const route = read("app/api/contacts/route.ts")
  const keyRoute = read("app/api/contacts/[key]/route.ts")
  check("POST /api/contacts keeps the notes and phone and answers the contact's key", /addDetails\(gate\.db, gate, email, \{ notes, phone:/.test(route) && /contactId \}\)/.test(route))
  check("PATCH /api/contacts/<id> keeps a phone too", /phone: typeof body\.phone === "string" \? body\.phone : null/.test(keyRoute))
  check("the profile reads the phone from the row's fields", /select\("id, name, notes, tags, fields"\)/.test(read("lib/contacts/profile-server.ts")))

  console.log("\nThe sheet and the list")
  const sheet = read("app/(storelib)/app/contacts/add-contact.tsx")
  const people = read("app/(storelib)/app/contacts/people-client.tsx")
  check("one sheet: Email, Name, Phone, Tags, Notes", ["data-add-email", "data-add-name", "data-add-phone", "data-add-tags", "data-add-notes"].every((k) => sheet.includes(k)))
  check("the browser's own bubbles are off; each field says its own problem", /noValidate/.test(sheet) && /role="alert" data-add-problem="email"/.test(sheet) && /aria-invalid=\{emailProblem/.test(sheet))
  check("a person already there is named, with a link to open them", /data-add-existing=/.test(sheet) && /is already in your contacts/.test(sheet) && /href=\{`\/app\/contacts\/\$\{existing\.id\}`\}/.test(sheet))
  check("fields are 44px at 16px on a phone (iOS does not zoom)", /max-sm:h-11 max-sm:rounded-xl max-sm:px-3 max-sm:text-\[16px\]/.test(sheet))
  check("the old sheet is gone", !/function AddContact\(/.test(people))
  check("Add contact closes the sheet before the server answers, and reopens it as it was if the save fails", /setAdding\(false\)[\s\S]{0,200}setJustAdded\(\(x\) => \[\{ row: optimisticRow/.test(people) && /if \(!r\.ok\) \{\s*setJustAdded[\s\S]{0,120}setAddError\(r\.error\)\s*setAdding\(true\)/.test(people))
  check("the news is a toast, so the rows do not move", /toast\(\{\s*title:/.test(people))
  check("a row still being saved opens nothing and cannot be picked", /if \(pending \|\| \(e\.target/.test(people) && /rows\.filter\(\(r\) => !isPendingId\(r\.id\)\)/.test(people))
  check("the import sheet has one clear file picker", /data-import-file=""/.test(people) && /className="sr-only"/.test(people))

  console.log("\nA person's page")
  const profile = read("app/(storelib)/app/contacts/[key]/profile-client.tsx")
  check("Edit shows what it saved at once", /const profile = React\.useMemo\(\(\) => withEdits\(served, saved\)/.test(profile) && /setSaved\(values\)/.test(profile))
  check("Edit keeps a phone, shown in Details", /data-edit-phone=""/.test(profile) && /data-contact-phone=""/.test(profile))
  check("the back arrow is Contacts' own (44px on a phone)", /className=\{BACK_ARROW\} aria-label=\{tt\("Back to contacts"\)\}/.test(profile))
  const steps = journeyInTime([
    { id: "seen", reached: true, at: "2026-04-22" },
    { id: "lead", reached: true, at: "2026-09-19" },
    { id: "subscriber", reached: true, at: "2026-05-12" },
    { id: "customer", reached: false, at: null },
    { id: "member", reached: true, at: "2026-07-31" },
  ])
  check("the journey reads in the order it happened, steps not reached last", steps.map((s) => s.id).join() === "seen,subscriber,member,lead,customer")

  console.log("\nForms")
  const list = read("app/(storelib)/app/emails/forms/forms-list.tsx")
  const builder = read("components/forms/forms-manager.tsx")
  const panels = read("app/(storelib)/app/emails/forms/form-panels.tsx")
  check("a second visit shows the forms at once, read again behind", /let lastOverview: Overview \| null = null/.test(list) && /useState\(!kept\)/.test(list) && /if \(!lastOverview\) setLoading\(true\)/.test(list))
  check("the views' row holds its place while the first visit reads", /data-forms-views-wait=""/.test(list))
  check("the views fade at the edge on a phone, as People's", /data-forms-views=""/.test(list) && /max-sm:\[mask-image:linear-gradient/.test(list))
  check("Publish rests when there is nothing new", (builder.match(/upToDate=\{state === "live"\}/g) ?? []).length === 2 && /disabled=\{upToDate\}/.test(builder))
  check("the Edit tab's card is not a second Settings", /inPage \? tt\("Form options"\) : tt\("Settings"\)/.test(builder))
  check("a response's disclosure arrow is not a second menu arrow", /<ChevronRight aria-hidden[^>]*rotate-90[^>]*data-response-toggle=""/.test(panels))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
