/**
 * A second business's address carries a tag Storelib made up
 * (andrew+slb-1a2b3c4d@gmail.com). It is bookkeeping, and the owner saw it on
 * their own screen. Nothing that prints an address prints the tag.
 *
 *   npx tsx tests/shown-email.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { businessAlias, displayEmail, emailLocalPart, isBusinessAlias, ownerAddress } from "@/lib/businesses/email-alias"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe address a person is shown\n")
{
  const tagged = businessAlias("andrew@gmail.com", "1a2b3c4d")
  check("a business's address is the owner's with a tag", tagged === "andrew+slb-1a2b3c4d@gmail.com", tagged)
  check("  shown, it is the owner's own address", displayEmail(tagged) === "andrew@gmail.com", displayEmail(tagged))
  check("  an ordinary address is shown exactly as it is", displayEmail("Andrew@Gmail.com ") === "Andrew@Gmail.com")
  check("  an account made for a phone sign in has no address to show", displayEmail(businessAlias(null, "1a2b3c4d")) === null)
  check("  and nothing at all is nothing", displayEmail(null) === null && displayEmail("") === null)
  check("  a name made from an address never carries the tag", emailLocalPart(tagged) === "andrew" && emailLocalPart("sam@x.co") === "sam")
  check("  what is written to and what is shown agree", ownerAddress(tagged) === displayEmail(tagged))
  check("  the tag is still recognised, so nothing else has to guess", isBusinessAlias(tagged) && !isBusinessAlias("andrew@gmail.com"))
}

console.log("\nEvery screen that prints the person's own address goes through it\n")
{
  /* The account page's data moved into one loader shared with its overlay (lib/account/load-account-settings.ts). */
  const settings = read("lib/account/load-account-settings.ts")
  check("the profile's Settings", /email: displayEmail\(user\.email\) \|\| ""/.test(settings) && !/email: user\.email \|\| ""/.test(settings))

  const seller = read("components/app/settings-form-new.tsx")
  check("  the seller's Settings, with no raw fall back behind it", /displayEmail\(profile\.email\) \|\| ""/.test(seller) && !/\|\| profile\.email \|\|/.test(seller))

  const header = read("components/platform/platform-header-client.tsx")
  check("  the header's account row", /displayEmail\(user\.email\) \|\| "Your account"/.test(header))
  check("  and the name it makes out of an address", /emailLocalPart\(user\?\.email\)/.test(header) && !/user\.email\.split\("@"\)\[0\]/.test(header))

  /* The account menu on storelib.com, in both of the shapes it exists in. */
  for (const f of ["components/marketing/user-nav.tsx", "components/marketing/user-nav-client.tsx"]) {
    const code = read(f)
    check(`  ${f.split("/").pop()}`, /\{displayEmail\(user\.email\)\}/.test(code) && !/>\{user\.email\}</.test(code) && /from "@\/lib\/businesses\/email-alias"/.test(code))
  }

  const composer = read("components/email/compose/composer.tsx")
  check("  where a test goes, and where replies go, in the composer", /email: displayEmail\(user\.email\)/.test(composer) && /displayEmail\(user\.email\) \|\| ""/.test(composer) && !/email: user\.email \?\? null/.test(composer))

  const receipt = read("app/receipt/[token]/receipt-view.tsx")
  check("  \"Receipt goes to\" on a receipt", /displayEmail\(viewer\.email\)/.test(receipt) && !/viewer\.email \? viewer\.email :/.test(receipt))
}

console.log("\nAnd what is SENT is the owner's own inbox, not the tag\n")
{
  const queue = read("lib/email-campaigns/queue.ts")
  check("a campaign's reply to is the owner's address, with Storelib's own behind it", /normalizeAddress\(ownerAddress\(profile\?\.email\)\) \|\| EMAIL_REPLY_TO/.test(queue) && !/normalizeAddress\(profile\?\.email\) \|\| EMAIL_REPLY_TO/.test(queue))

  const test = read("app/api/email/send-test/route.ts")
  check("  a test may go to the address the composer showed them, and the refusal names that one", /normalizeAddress\(ownerAddress\(ctx\.userEmail\)\),/.test(test) && /ownAddresses\[0\]/.test(test))
  check("  the tagged address still counts as theirs, so nothing that worked stops working", /normalizeAddress\(ctx\.userEmail\),/.test(test))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
