/**
 * ===========================================================================
 *  ROUND 13 O2: NAMES, ONBOARDING, APP LINKS
 * ===========================================================================
 *   NAMES        nobody is ever "Your profile", "Creator" or "Unknown": the
 *                helpers in lib/profile/display-name.ts, the sign in that
 *                keeps a name (lib/profile/keep-name.ts, against a stand in
 *                database), and every screen that used to write its own
 *                placeholder reads personName() instead
 *   ONBOARDING   a new account is asked once what brought it here
 *                (lib/account/welcome.ts), both branches, and lands where it
 *                was going (a community, joined when free)
 *   APP LINKS    apple-app-site-association and assetlinks.json from env
 *                vars, served as JSON; https links open the page in the app
 *
 * Browser measurements: scripts/check-onboarding-branch.mjs,
 * scripts/check-app-pull.mjs, scripts/check-open-app-pill.mjs.
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import {
  NAMELESS,
  NAME_MAX,
  cleanName,
  isStandInName,
  nameFromEmail,
  nameFromHandle,
  nameRepair,
  needsNameStep,
  personName,
  providerNameOf,
} from "../lib/profile/display-name"
import { keepProfileName, type KeepNameDb } from "../lib/profile/keep-name"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}

/** A profiles table of one row, with the compare and set keep-name writes. */
function standIn(row: { display_name?: string | null; username?: string | null; email?: string | null } | null) {
  const state = { row: row ? { ...row } : null, writes: 0 }
  const db: KeepNameDb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }),
      update: (values) => ({
        eq: () => ({
          is: () => ({
            select: async () => {
              if (state.row && state.row.display_name == null) {
                state.row.display_name = values.display_name
                state.writes++
                return { data: [{ id: "u" }], error: null }
              }
              return { data: [], error: null }
            },
          }),
          eq: (_c: string, value: string) => ({
            select: async () => {
              if (state.row && state.row.display_name === value) {
                state.row.display_name = values.display_name
                state.writes++
                return { data: [{ id: "u" }], error: null }
              }
              return { data: [], error: null }
            },
          }),
        }),
      }),
    }),
  }
  return { db, state }
}

async function main() {
  console.log("\nA name is cleaned, and a placeholder word is no name")
  check("spaces collapsed, control and zero width characters out", cleanName("  Ana​   Lucia\n") === "Ana Lucia")
  check("every placeholder word is no name, whatever its case", ["Your profile", "creator", "UNKNOWN", "User", "Member", "anonymous", "null", "undefined", "Storelib user"].every((w) => cleanName(w) === null))
  check("one letter is an initial, not a name", cleanName("A") === null && cleanName("Al") === "Al")
  check("a long name stops at a word near the ceiling", (cleanName("Maria ".repeat(20)) ?? "").length <= NAME_MAX && !(cleanName("Maria ".repeat(20)) ?? "").endsWith(" "))
  check("not a string is no name", cleanName(null) === null && cleanName(42) === null && cleanName(undefined) === null)

  console.log("\nA name made from an email or a handle")
  check("ana.lucia92@x.com is Ana Lucia", nameFromEmail("ana.lucia92@x.com") === "Ana Lucia")
  check("a +tag is dropped", nameFromEmail("maya+shop@x.com") === "Maya")
  check("Apple's hidden address is never a name", nameFromEmail("x7h2k9qz@privaterelay.appleid.com") === null && nameFromEmail("ana@privaterelay.appleid.com") === null)
  check("a local part that reads as a code is no name", nameFromEmail("q8x2kz7v@gmail.com") === null && nameFromEmail("123456@x.com") === null && nameFromEmail("bcdfgh@x.com") === null)
  check("ana-lucia is Ana Lucia, @ana is Ana", nameFromHandle("ana-lucia") === "Ana Lucia" && nameFromHandle("@ana") === "Ana")
  check("member-12345 (a handle made for nobody in particular) is no name", nameFromHandle("member-12345") === null && nameFromHandle("member") === null)

  console.log("\nThe provider's name")
  check("Google's full_name, else name", providerNameOf({ full_name: "Ana Lucia", name: "Ana" }) === "Ana Lucia" && providerNameOf({ name: "Ana" }) === "Ana")
  check("Apple's given and family names", providerNameOf({ given_name: "Ana", family_name: "Lucia" }) === "Ana Lucia")
  check("an email sent as the name is not a name", providerNameOf({ full_name: "ana@x.com" }) === null)
  check("nothing sent, nothing", providerNameOf({}) === null && providerNameOf(null) === null)

  console.log("\nWhat a screen shows: never a placeholder, never an address")
  check("their own name first", personName({ name: "Ana Lucia", username: "zz" }) === "Ana Lucia")
  check("a placeholder stored as the name falls through to the handle", personName({ name: "Creator", username: "maya-prints" }) === "Maya Prints")
  check("  to the email's words when there is no handle", personName({ name: "Unknown", email: "ana.lucia@x.com" }) === "Ana Lucia")
  check("  to the store's address for a seller with nothing else", personName({ name: null, slug: "clay-studio" }) === "Clay Studio")
  check("  and to the one neutral line when nothing is known", personName({}) === NAMELESS && personName(null) === NAMELESS)
  check("an email stored as the name is never shown", personName({ name: "ana@x.com", username: "ana" }) === "Ana" && !personName({ name: "ana@x.com" }).includes("@"))
  check("the code an Apple hidden address left as the name gives way to the handle", personName({ name: "x7h2k9qz", email: "x7h2k9qz@privaterelay.appleid.com", username: "maya" }) === "Maya")
  check("  and is still better than nothing when there is no handle", personName({ name: "x7h2k9qz", email: "x7h2k9qz@privaterelay.appleid.com" }) === "x7h2k9qz")
  check("a caller's own fallback is kept for a place that needs one", personName({}, "Clay Studio") === "Clay Studio")
  const words = ["Your profile", "Creator", "Unknown", "User", "Member"]
  const samples = [{}, { name: "" }, { name: "  " }, { name: "creator" }, { name: "Unknown", username: "" }, { name: "user", slug: "" }, { username: "member-1" }]
  check("no input ever comes out as a placeholder word", samples.every((s) => !words.includes(personName(s))), samples.map((s) => personName(s)))

  console.log("\nWhat a sign in writes into a profile")
  check("a name they have is never touched", nameRepair({ stored: "Ana Lucia", email: "ana@x.com", meta: { full_name: "Someone Else" } }) === null)
  check("Google's name over the email's letters the trigger wrote", nameRepair({ stored: "jsmith92", email: "jsmith92@gmail.com", meta: { full_name: "John Smith" } }) === "John Smith")
  check("Google's name over an empty one", nameRepair({ stored: null, email: "a@b.com", meta: { name: "John Smith" } }) === "John Smith")
  check("no provider name: a name from the handle over an empty one", nameRepair({ stored: "", username: "maya-prints", email: "q8x2kz7v@x.com" }) === "Maya Prints")
  check("  else from the email", nameRepair({ stored: null, username: null, email: "ana.lucia@x.com" }) === "Ana Lucia")
  check("  over a placeholder word too", nameRepair({ stored: "User", username: "maya", email: "q8x2kz7v@x.com" }) === "Maya")
  check("the email's letters are kept when they read as a name", nameRepair({ stored: "ana", email: "ana@x.com", username: "ana-1" }) === null)
  check("  and replaced by the handle when they read as a code", nameRepair({ stored: "x7h2k9qz", email: "x7h2k9qz@privaterelay.appleid.com", username: "maya" }) === "Maya")
  check("a stand in is the email's letters, empty, or a placeholder", isStandInName("ana", "ana@x.com") && isStandInName("", "a@x.com") && isStandInName("Creator", null) && !isStandInName("Ana", "ana.l@x.com"))

  console.log("\nWho is asked \"What should we call you?\"")
  check("an email sign up (the trigger wrote the email's letters)", needsNameStep({ stored: "ana", email: "ana@x.com" }))
  check("nobody Google or Apple sent a name for", !needsNameStep({ stored: "jsmith92", email: "jsmith92@gmail.com", meta: { full_name: "John Smith" } }))
  check("nobody with a name of their own", !needsNameStep({ stored: "Ana Lucia", email: "ana@x.com" }))

  console.log("\nThe sign in keeps a name (lib/profile/keep-name, a stand in database)")
  {
    const { db, state } = standIn({ display_name: "jsmith92", username: "jsmith92", email: "jsmith92@gmail.com" })
    const r = await keepProfileName(db, { id: "u", email: "jsmith92@gmail.com", user_metadata: { full_name: "John Smith" } })
    check("Google's name replaces the email's letters", r === "saved" && state.row?.display_name === "John Smith", { r, row: state.row })
    const again = await keepProfileName(db, { id: "u", email: "jsmith92@gmail.com", user_metadata: { full_name: "John Smith" } })
    check("  and the next sign in changes nothing", again === "has_name" && state.writes === 1)
  }
  {
    const { db, state } = standIn({ display_name: "Ana Lucia", username: "ana", email: "ana@x.com" })
    const r = await keepProfileName(db, { id: "u", email: "ana@x.com", user_metadata: { full_name: "Google Name" } })
    check("a name they set is never overwritten", r === "has_name" && state.row?.display_name === "Ana Lucia")
  }
  {
    const { db, state } = standIn({ display_name: null, username: "maya-prints", email: "q8x2kz7v@x.com" })
    const r = await keepProfileName(db, { id: "u", email: "q8x2kz7v@x.com", user_metadata: {} })
    check("an empty name gets the handle's words", r === "saved" && state.row?.display_name === "Maya Prints")
  }
  {
    const { db, state } = standIn({ display_name: "jsmith92", username: "j", email: "jsmith92@gmail.com" })
    /* Settings saved a name between the read and the write: the write finds the row changed and leaves it. */
    const racing: KeepNameDb = {
      from: (t) => {
        const real = db.from(t)
        return {
          select: real.select,
          update: (v) => {
            state.row!.display_name = "Set In Settings"
            return real.update(v)
          },
        }
      },
    }
    const r = await keepProfileName(racing, { id: "u", email: "jsmith92@gmail.com", user_metadata: { full_name: "John Smith" } })
    check("a name saved in the same moment wins (compare and set)", r === "lost_race" && state.row?.display_name === "Set In Settings")
  }
  {
    const broken: KeepNameDb = { from: () => { throw new Error("down") } }
    check("a database that throws never fails a sign in", (await keepProfileName(broken, { id: "u" })) === "failed")
    const { db } = standIn(null)
    check("no profile yet is said, not written", (await keepProfileName(db, { id: "u", user_metadata: { full_name: "A B" } })) === "no_profile")
  }

  console.log("\nEvery way in keeps the name")
  const callback = readCode("app/auth/callback/route.ts")
  const cont = readCode("app/auth/continue/route.ts")
  const sync = readCode("app/auth/sync-session/route.ts")
  check("the web callback writes the provider's name on a new profile, never \"User\"", /display_name: initialName/.test(callback) && !/\|\| "User"/.test(callback))
  check("  and keeps it on every sign in, after the answer", /after\(\(\) => keepProfileName\(/.test(callback))
  check("/auth/continue (a password, the email code, the app) keeps it too", /after\(\(\) => keepProfileName\(/.test(cont))
  check("the app's sign in (sync-session) keeps it beside the photo", /keepProfileName\(createAdminClient\(\)/.test(sync) && /keepProviderPhoto\(/.test(sync))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailed:\n  " + failures.join("\n  "))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
