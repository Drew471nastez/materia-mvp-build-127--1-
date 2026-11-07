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
  /* Changed on purpose (round 40 team permissions): the signed in person's own address now comes from the server (app/api/email/area?part=sender, gate.userEmail) as `sender.email`, and the composer still shows it through displayEmail. */
  check("  where a test goes, and where replies go, in the composer", /email: displayEmail\(sender\.email\)/.test(composer) && /displayEmail\(sender\.email\) \|\| ""/.test(composer) && !/email: (user|sender)\.email \?\? null/.test(composer))

  const receipt = read("app/(storelib)/receipt/[token]/receipt-view.tsx")
  check("  \"Receipt goes to\" on a receipt", /displayEmail\(viewer\.email\)/.test(receipt) && !/viewer\.email \? viewer\.email :/.test(receipt))

  /* Round AL: the owner still saw "nasties112+slb-66c749a6@gmail.com". These are the places that still printed it. */
  const area = read("app/api/email/area/route.ts")
  check("  the composer's sender reads the shown address from the server", /email: displayEmail\(gate\.userEmail\)/.test(area))
  check("  the Help Center's account menu shows the real address instead of hiding it", /displayEmail\(user\.email\)/.test(read("app/api/help/me/route.ts")) && !/includes\("\+slb-"\)/.test(read("app/api/help/me/route.ts")))
  check("  and its menu prints it through the helper", /\{displayEmail\(me\.email\)\}/.test(read("components/help/help-account.tsx")))
  check("  a flow's test line names the real address", /accountEmail: displayEmail\(user\.email\)/.test(read("app/(storelib)/app/emails/flow/[id]/page.tsx")))
  check("  and the flow test is sent to it", /const to = ownerAddress\(me\.userEmail\)/.test(read("app/api/automations/flows/[id]/test/route.ts")))
  check("  the store's contact email starts from the real address", /contactEmail: displayEmail\(account\?\.data\?\.user\?\.email\)/.test(read("app/api/store/settings/route.ts")))
  check("  the dashboard's name made from an address never carries the tag", /emailLocalPart\(user\.email\)/.test(read("app/(storelib)/app/layout.tsx")) && !/user\.email\?\.split\("@"\)\[0\]/.test(read("app/(storelib)/app/layout.tsx")))
  check("  reset password says which account", /displayEmail\(data\.user\.email\)/.test(read("app/(storelib)/(auth)/reset-password/page.tsx")))
  check("  the handoff page's \"signed in as\"", /signedInAs: displayEmail\(viewer\.email\)/.test(read("lib/handoff/rules.ts")))
  check("  the team invite's \"signed in as\"", /signedInAs: displayEmail\(user\.email\)/.test(read("lib/team/invite-state.ts")))
  check("  checkout prefills the real address", /displayEmail\(userEmail\)/.test(read("app/(storelib)/checkout/checkout-client.tsx")) && /displayEmail\(f\.buyer!\.email\)/.test(read("components/checkout/instant-checkout.tsx")) && /displayEmail\(buyer\?\.email\)/.test(read("app/(storelib)/checkout/site/site-checkout.tsx")))
  check("  the tax summary names the real address", /sellerEmail: displayEmail\(profile\?\.email\)/.test(read("app/api/stripe/tax-summary/route.ts")))
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
