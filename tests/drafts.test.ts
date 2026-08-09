/**
 * ===========================================================================
 *  A DRAFT HAS TO BE SOMEWHERE, AND YOU HAVE TO BE ABLE TO GET IT BACK
 * ===========================================================================
 *
 * "Salvează" on the sell sheet writes a row with status 'draft'. The list at
 * /products/drafts already existed and already showed them — and every row on
 * it was inert. You could see that a half-written listing was there and do
 * nothing with it: not open it, not finish it, not delete it.
 *
 * A list you can only look at is worse than no list, because it is a promise
 * the interface does not keep. These are the properties that make it one it
 * does.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const route = strip(read("app/api/listings/drafts/[id]/route.ts"))
const list = strip(read("components/sell/drafts-list.tsx"))
const form = strip(read("components/sell/new-listing-form.tsx"))

console.log("\nDrafts: saved, findable, and finishable")

check(
  "a draft has somewhere to be, and saving takes you there",
  /router\.replace\("\/products\/drafts"\)/.test(form) &&
    /\{ label: "CIORNE", href: "\/products\/drafts" \}/.test(read("components/marketing/account-drawer.tsx")),
  "        Saving into a place with no route to it is a button things\n" +
    "        disappear into.",
)

check(
  "a row opens the form filled in from that draft",
  /router\.push\(`\/products\/new\?draft=\$\{encodeURIComponent\(id\)\}`\)/.test(list) &&
    /new URLSearchParams\(window\.location\.search\)\.get\("draft"\)/.test(form),
)

check(
  "reading the draft id does not make the sheet mount twice",
  (() => {
    // useSearchParams forces a Suspense boundary around this component, so the
    // sheet mounts, suspends and mounts AGAIN — playing its slide twice. Same
    // reasoning and same fix as the listing page's `origin` breadcrumb.
    return !/useSearchParams/.test(form)
  })(),
)

check(
  "finishing a draft UPDATES it rather than making a second listing",
  (() => {
    // POSTing again would create a second row and leave the draft behind: save
    // twice and you have two half-listings; publish and you have a live listing
    // next to the draft it came from. It also mints a fresh slug and breaks any
    // link already shared.
    return (
      /: draftId\s*\n\s*\? `\/api\/listings\/drafts\/\$\{encodeURIComponent\(draftId\)\}`\s*\n\s*: "\/api\/listings"/.test(form) &&
      /method: editId \|\| draftId \? "PATCH" : "POST"/.test(form)
    )
  })(),
)

check(
  "the draft id is in the submit callback's dependencies",
  // Without it, `submit` closes over whatever the id was on first render — so
  // the first save of a resumed draft would go to the wrong endpoint.
  /setMotion, draftId, editId\]/.test(form),
)

check(
  "photos already in storage are not uploaded a second time",
  (() => {
    const loader = form.slice(form.indexOf("const url = editId"))
    return /uploading: false/.test(loader.slice(0, 1800))
  })(),
)

check(
  "a draft that will not load leaves an empty form, not an error",
  (() => {
    const loader = form.slice(form.indexOf("const url = editId"))
    // Deleted on another device, or somebody else's id pasted into the URL.
    // The worst case is writing the listing from scratch, which is what the
    // screen is for anyway.
    return /\.catch\(\(\) => undefined\)/.test(loader.slice(0, 2600))
  })(),
)

check(
  "the server asks a draft for ONE thing, the same one the form asks for",
  (() => {
    // It demanded a photo AND a title, which is stricter than the sell form's
    // own gate (title OR photo) — so "write the title now, photograph it
    // later", the most ordinary way to start a draft, was accepted by the
    // client and refused by the server. The refusal then surfaced as raw
    // English field keys in a sentence at the bottom of the page.
    const create = strip(read("app/api/listings/route.ts"))
    return (
      /if \(draft\) \{\s*\n\s*if \(photos\.length < 1 && !title\) problems\.push\("empty"\)/.test(create) &&
      /title: title \|\| null,/.test(create)
    )
  })(),
)

check(
  "a server refusal is walked back to its control, not printed at the bottom",
  (() => {
    // The server and the form enforce the same rules, so a 400's field list
    // can be mapped to the same anchored notes a local refusal uses — same
    // note, same place, same smooth scroll.
    return (
      /const SERVER_FIELD_TO_GAP: Record<string, GapKey>/.test(form) &&
      /showFirstGap\(mapped\[0\]\)/.test(form) &&
      !/\$\{data\.fields\.join/.test(form)
    )
  })(),
)

check(
  "the catch-all sentence, when it does appear, is scrolled to",
  (() => {
    // A message nobody sees is a save that looks like it did nothing.
    return /errorRef\.current\?\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/.test(form)
  })(),
)

console.log("\nWhose draft is it")

check(
  "ownership is part of the query, not a comparison afterwards",
  (() => {
    // Fetching then comparing leaks the row's existence through timing and
    // through which error comes back. A draft that is not yours has to be
    // indistinguishable from one that does not exist.
    const scoped = (route.match(/\.eq\("creator_id", creatorId\)/g) ?? []).length
    return scoped >= 3 && /const NOT_FOUND = NextResponse\.json\(\{ error: "not_found" \}, \{ status: 404 \}\)/.test(route)
  })(),
)

check(
  "every handler is scoped to a DRAFT as well as to an owner",
  (() => {
    // Otherwise DELETE is a way to remove a live listing somebody may already
    // have bought, and PATCH is a way to re-publish something that was sold.
    return (route.match(/\.eq\("status", "draft"\)/g) ?? []).length >= 3
  })(),
)

check(
  "publishing from a draft applies the same completeness rules as creating",
  (() => {
    // A draft is allowed to be half-written. A listing on the feed is not, and
    // the rules have to be on the server because a client can be bypassed.
    const block = route.slice(route.indexOf("if (publish) {"), route.indexOf("const patch"))
    return (
      /MIN_PHOTOS/.test(block) &&
      /missing\.push\("titlu"\)/.test(block) &&
      /missing\.push\("preț"\)/.test(block) &&
      /status: 400/.test(block)
    )
  })(),
)

check(
  "the slug is never rewritten",
  (() => {
    // It was minted when the draft was created and somebody may already have
    // the link; re-slugging on every save would break it each time the title
    // changed.
    const patch = route.slice(route.indexOf("const patch"), route.indexOf("const admin = createAdminClient()"))
    return !/slug/.test(patch)
  })(),
)

check(
  "a half-run migration does not lose the save",
  // The resale attribute columns only exist after 20260801_listing_attributes.
  // POST already retries without them; so does this.
  /full update failed, retrying/.test(route) && /const OPTIONAL = \[/.test(route),
)

console.log("\nDeleting one")

check(
  "delete asks first, and names what it is deleting",
  (() => {
    // A bin that deletes on the first tap is how twenty minutes of writing is
    // lost to a thumb that landed a centimetre off, and a draft has no undo.
    return /setConfirming/.test(list) && /Ștergi „/.test(list)
  })(),
)

check(
  "the row goes when the server confirms, not before",
  (() => {
    const fn = list.slice(list.indexOf("const remove ="), list.indexOf("const open ="))
    // Removing optimistically and putting it back on failure is a list that
    // flickers to tell you about a problem you can do nothing about.
    return fn.indexOf("if (!res.ok) return") < fn.indexOf("setDrafts((list)")
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
