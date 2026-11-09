/**
 * ===========================================================================
 *  WAVE 5: CONTACTS IN STORELIB'S LIST LOOK
 * ===========================================================================
 * The owner: "the contacts page is bad, doesn't make sense to be that
 * complex, make it more Storelib UI adapted". People is now drawn as Orders
 * is: the list bar (title, Forms, one ⋯ for import and export, Add contact),
 * one card with the views, search and sort on its top row, the filters as
 * chips while searching, a table of name and email, where they came from,
 * tags and last activity, and the count and pages at its foot. A profile
 * opens on one Details card. Nothing is lost: every filter, the import, the
 * export, the bulk tag, email, export and delete, and every address.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { peopleQueryString, readPeopleQuery } from "@/lib/contacts/identity"

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

function main() {
  const people = read("app/(storelib)/app/contacts/people-client.tsx")
  const header = read("app/(storelib)/app/contacts/contacts-header.tsx")
  const forms = read("app/(storelib)/app/contacts/forms/page.tsx")
  const profile = read("app/(storelib)/app/contacts/[key]/profile-client.tsx")

  console.log("\nThe list bar and the card, as Orders")
  check("the bar is the list bar Orders and Products wear (LIST_BAR)", header.includes("className={LIST_BAR}") && people.includes("<ContactsHeader"))
  check("no second row of People | Forms tabs and no pill row of counts", !/SegmentedPills|FilterPills/.test(people + header))
  check("one ⋯ holds import and export; Forms is a button on a computer and in the ⋯ on a phone", people.includes("data-contacts-more") && people.includes('tt("Import from a CSV file")') && people.includes('tt("Export these people")') && people.includes('href: "/app/contacts/forms"') && people.includes("data-contacts-forms-link"))
  check("Add contact stays the page's one dark action", /buttonAccent[^\n]*data-add-contact/.test(people))
  check("views, search and sort sit on the card's top row, as Orders' toolbar", people.includes('role="tablist"') && people.includes('tt("Search and filter")') && people.includes("<SortMenu"))
  check("the table shows name and email, came from, tags and last activity", ['tt("Name")', 'tt("Came from")', 'tt("Tags")', 'tt("Last activity")'].every((s) => people.includes(s)) && !people.includes('<th className={th}>{tt("Marketing emails")}'))
  check("a phone shows each person as one stacked row", people.includes('data-phone-row=""'))
  check("the count and pages sit at the card's foot", people.includes('tt("{from}–{to} of {value}"'))

  console.log("\nNothing is lost")
  for (const k of ["origin", "tag", "subscription", "bought", "community", "tier", "access", "forms", "course", "leadStatus", "dates"]) check(`the ${k} filter is a chip`, people.includes(`id="${k}"`) || people.includes(`yesNo("${k}"`))
  check("picking people still tags, emails, exports and deletes", ['"/api/contacts/bulk"', "/app/emails/new?contacts=", 'tt("Export")', 'send("delete")', 'send("untag")'].every((s) => people.includes(s)))
  check("import and add still post to their routes", people.includes("/api/contacts/import") && people.includes('"/api/contacts"'))
  const q = readPeopleQuery((k) => ({ filter: "leads", q: "ana", sort: "name", tag: "VIP", sub: "subscribed", bought: "yes", from: "2026-01-01" })[k as "q"])
  check("an older address reads and writes back the same", peopleQueryString(q) === "filter=leads&q=ana&sort=name&tag=VIP&sub=subscribed&bought=yes&from=2026-01-01", peopleQueryString(q))

  console.log("\nForms and a person")
  check("Forms is a page under Contacts with Back, the forms list unchanged", forms.includes('<ContactsHeader title={tt("Forms")} back />') && forms.includes("<FormsList />") && header.includes('aria-label={tt("Back to contacts")}'))
  check("a person opens on one Details card, consent inside it, before their tags and notes", profile.includes('<Section title={tt("Details")}>') && !profile.includes('tt("Email and community")') && profile.indexOf("<Details ") < profile.indexOf("<TagsNotes "))
  check("purchases come first in the activity column", profile.indexOf("<Purchases ") < profile.indexOf("<Activity "))
  check("one Edit for name, tags and notes; unsubscribe and delete kept", profile.includes('tt("Edit name, tags and notes")') && !profile.includes('tt("Manage tags")') && profile.includes('tt("Unsubscribe from emails")') && profile.includes('tt("Delete contact")'))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}
main()
