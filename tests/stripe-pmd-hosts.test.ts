/**
 * Hostnames registered with Stripe for a creator domain. storelib.com is
 * never one of them. No Stripe key: the plan is decided from plain objects.
 */
import { readFileSync } from "node:fs"
import { checkoutHostsFor, isStorelibHost, needsOneValidate, planPaymentDomain } from "@/lib/custom-domains/payment-hosts"
import { checkoutCanonical, checkoutOrigin, checkoutShareDescription, checkoutShareTitle, checkoutSiteName } from "@/lib/checkout/share-meta"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""))
    console.log(`  FAIL  ${label}`)
  }
}

check("a path is not a hostname", checkoutHostsFor("https://shop.example.com/checkout?x=1").join() === "shop.example.com")
check("an apex and www are both registered, the apex is not replaced", checkoutHostsFor("example.com").join() === "example.com,www.example.com" && checkoutHostsFor("www.example.com").join() === "example.com,www.example.com")
check("a subdomain is only itself", checkoutHostsFor("links.example.co.uk").join() === "links.example.co.uk")
check("storelib.com is left alone", checkoutHostsFor("storelib.com").length === 0 && checkoutHostsFor("https://www.storelib.com/checkout").length === 0 && checkoutHostsFor("shop.storelib.com").length === 0 && isStorelibHost("storelib.com"))
check("a preview host is not registered", checkoutHostsFor("foo.vercel.app").length === 0)

const active = { id: "pmd_1", enabled: true, apple_pay: { status: "active" }, google_pay: { status: "active" } }
check("an existing active domain is not created again", planPaymentDomain(active) === "keep" && !needsOneValidate(active))
check("a missing domain is created", planPaymentDomain(null) === "create")
check("a disabled domain is turned back on", planPaymentDomain({ id: "pmd_2", enabled: false, apple_pay: { status: "active" }, google_pay: { status: "active" } }) === "enable")
check("an incomplete registration is validated once", planPaymentDomain({ id: "pmd_3", enabled: true, apple_pay: { status: "inactive" }, google_pay: { status: "active" } }) === "validate" && needsOneValidate({ id: "pmd_3", enabled: true, apple_pay: { status: "inactive" }, google_pay: { status: "active" } }))

const verify = readFileSync("app/api/domains/verify/route.ts", "utf8")
const remove = readFileSync("app/api/domains/route.ts", "utf8")
check("a live domain is registered after it is marked active", /await syncStripePaymentDomains\(admin, domainId, domain\)/.test(verify))
check("disconnect disables the Stripe domain and does not touch storelib.com by name in that call", /await disableStripePaymentDomains\(admin, domainRecord\.domain\)/.test(remove))
check("DNS checks are still the same route", /const dnsVerified = apex \? aRecordVerified/.test(verify))

check("checkout metadata uses the host that served the page", checkoutOrigin({ forwardedHost: "alexriver.com", proto: "https" }) === "https://alexriver.com" && checkoutCanonical("https://alexriver.com", { productId: "p1" }) === "https://alexriver.com/checkout?productId=p1")
check("a custom-domain preview is the product, not Storelib", checkoutShareTitle("LinkedIn Content OS") === "LinkedIn Content OS" && checkoutShareDescription("<p>Plan every post.</p>", "Luca Dragoste") === "Plan every post. — Luca Dragoste" && checkoutSiteName("alexriver.com", "Luca Dragoste") === "Luca Dragoste" && checkoutSiteName("alexriver.com", null) === "alexriver.com")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
