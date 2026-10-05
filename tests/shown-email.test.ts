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
  const settings = read("app/account/settings/page.tsx")
  check("the profile's Settings", /displayEmail\(user\.email\) \|\| ""/.test(settings) && !/email=\{user\.email \|\| ""\}/.test(settings))

  const seller = read("components/app/settings-form-new.tsx")
  check("  the seller's Settings, with no raw fall back behind it", /displayEmail\(profile\.email\) \|\| ""/.test(seller) && !/\|\| profile\.email \|\|/.test(seller))

  const header = read("components/platform/platform-header-client.tsx")
  check("  the header's account row", /displayEmail\(user\.email\) \|\| "Your account"/.test(header))
  check("  and the name it makes out of an address", /emailLocalPart\(user\?\.email\)/.test(header) && !/user\.email\.split\("@"\)\[0\]/.test(header))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
