/**
 * ===========================================================================
 *  THE WALLET DOMAIN LOGIC, RUN RATHER THAN READ
 * ===========================================================================
 * Apple Pay and Google Pay draw at checkout only on a domain registered with
 * the Stripe account. There is no live key here, so the decisions are all
 * pure (lib/checkout/wallet-domains.ts) and run against the answers Stripe
 * actually sends: which domain we are talking about, whether to create the
 * registration or re-validate it, and what each wallet's status and error
 * message mean.
 *
 * The rest reads the two files that carry the other half — the route and the
 * panel — and pins what must not quietly change: the admin gate, create for
 * an unregistered domain and validate for a registered one, no payment
 * parameter anywhere near this route, and the association file still being
 * served, byte for byte, as text/plain.
 *
 * Run with:  npm run test:push
 */
import { readFileSync, statSync } from "node:fs"

import {
  ASSOCIATION_BYTES,
  ASSOCIATION_PATH,
  FALLBACK_DOMAIN,
  WALLETS,
  associationNote,
  associationOk,
  buildReport,
  findDomain,
  nextStep,
  normaliseDomain,
  siteDomain,
  throwawayHost,
  walletRows,
  type DomainRecord,
} from "@/lib/checkout/wallet-domains"

import { stripComments } from "./_source"

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
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

/* Stripe's own shape, as the API answers it. */
const registered: DomainRecord = {
  id: "pmd_1Abc",
  domain_name: "storelib.com",
  enabled: true,
  livemode: true,
  created: 1_764_000_000,
  apple_pay: { status: "active" },
  google_pay: { status: "active" },
  link: { status: "active" },
  paypal: { status: "inactive", status_details: { error_message: "PayPal is not enabled on this account." } },
}

const halfDone: DomainRecord = {
  ...registered,
  apple_pay: {
    status: "inactive",
    status_details: { error_message: "The domain is not registered with Apple. Serve the association file at https://storelib.com/.well-known/apple-developer-merchantid-domain-association and try again." },
  },
  google_pay: { status: "active" },
  link: { status: "active" },
}

const none = { url: `https://storelib.com${ASSOCIATION_PATH}`, status: 200, bytes: ASSOCIATION_BYTES, redirectedTo: null, ok: true, note: "Served as Stripe's own file." }

function main() {
  console.log("\nA domain name is read out of whatever was given\n")
  {
    check("a full URL becomes its host", normaliseDomain("https://storelib.com/checkout?x=1") === "storelib.com")
    check("a host with a port loses it", normaliseDomain("storelib.com:3000") === "storelib.com")
    check("capitals and spaces are levelled", normaliseDomain("  STORELIB.com  ") === "storelib.com")
    check("a trailing dot goes", normaliseDomain("storelib.com.") === "storelib.com")
    check("a subdomain stays whole", normaliseDomain("ana.storelib.com") === "ana.storelib.com")
    check("a creator's own domain reads too", normaliseDomain("www.materiabuilder.store") === "www.materiabuilder.store")
    check("a sentence is not a domain", normaliseDomain("please register my domain") === null)
    check("one label is not a domain", normaliseDomain("storelib") === null)
    check("an underscore is not a host", normaliseDomain("my_store.com") === null)
    check("nothing at all is nothing", normaliseDomain("") === null && normaliseDomain(null) === null && normaliseDomain(42) === null)
    check("a bare scheme is nothing", normaliseDomain("https://") === null)
  }

  console.log("\nA preview deployment never registers its own address\n")
  {
    check("a vercel preview is a throwaway", throwawayHost("materia-mvp-git-main.vercel.app"))
    check("localhost is a throwaway", throwawayHost("localhost") && throwawayHost("127.0.0.1"))
    check("storelib.com is not", !throwawayHost("storelib.com"))
    check("the configured address wins", siteDomain("https://storelib.com", "https://abc123.vercel.app/api/admin/payment-domains") === "storelib.com")
    check("a configured preview host is refused, and the request is read instead", siteDomain("https://abc.vercel.app", "https://storelib.com/api/admin/payment-domains") === "storelib.com")
    check("with nothing real anywhere it is the platform's own domain", siteDomain("http://localhost:3000", "http://localhost:3000/x") === FALLBACK_DOMAIN)
    check("and an empty configuration falls back too", siteDomain(null, null) === FALLBACK_DOMAIN)
    check("a creator's domain can be asked for by name", siteDomain("https://theirdomain.store") === "theirdomain.store")
  }

  console.log("\nStripe's list decides whether this is a registration or a re-check\n")
  {
    check("a domain on the list is found", findDomain([registered], "storelib.com")?.id === "pmd_1Abc")
    check("found however it was spelled", findDomain([registered], "https://STORELIB.com/")?.id === "pmd_1Abc")
    check("a different domain is not found", findDomain([registered], "other.com") === null)
    check("an empty list finds nothing", findDomain([], "storelib.com") === null && findDomain(null, "storelib.com") === null)
    check("a registered domain is re-checked, not registered twice", nextStep(registered) === "validate")
    check("an unregistered domain is created", nextStep(null) === "create")
    check("and a row with no id is created too", nextStep({ domain_name: "storelib.com" }) === "create")
  }

  console.log("\nEach wallet's own status, and Stripe's own words when it is not showing\n")
  {
    const rows = walletRows(registered)
    check("one row per wallet, in one order", rows.map((r) => r.id).join(",") === "apple_pay,google_pay,link,paypal")
    check("the express row asks for two of them", rows.filter((r) => r.checkout).map((r) => r.label).join(", ") === "Apple Pay, Google Pay")
    check("active reads as active", rows[0].state === "active" && rows[0].message === null)
    check("Stripe's error message is carried through as it came", walletRows(halfDone)[0].message?.startsWith("The domain is not registered with Apple") === true)
    check("an unregistered domain knows nothing rather than claiming inactive", walletRows(null).every((r) => r.state === "unknown" && r.message === null))
    check("a wallet Stripe did not mention is unknown", walletRows({ id: "pmd_2", domain_name: "x.com" })[1].state === "unknown")
    check("a status nobody has seen before is unknown, not active", walletRows({ id: "pmd_3", apple_pay: { status: "pending_review" } })[0].state === "unknown")
    check("an empty error message is no message", walletRows({ id: "pmd_4", apple_pay: { status: "inactive", status_details: { error_message: "   " } } })[0].message === null)
    check("the wallet list itself stays these four", WALLETS.map((w) => w.id).join(",") === "apple_pay,google_pay,link,paypal")
  }

  console.log("\nOur own association file, as Apple would see it\n")
  {
    check("a 404 says Apple cannot verify anything", associationNote({ status: 404, bytes: 0, redirectedTo: null }).includes("Apple cannot verify"))
    check("and is not ok", !associationOk({ status: 404, bytes: 0, redirectedTo: null }))
    check("a redirect is named, because Apple does not follow one", associationNote({ status: 308, bytes: null, redirectedTo: "https://www.storelib.com/x" }).includes("does not follow a redirect"))
    check("a redirect is not ok either", !associationOk({ status: 301, bytes: null, redirectedTo: "/login" }))
    check("a 500 asks for a plain 200", associationNote({ status: 500, bytes: null, redirectedTo: null }).includes("plain 200"))
    check("the right file, the right length, reads as served", associationOk({ status: 200, bytes: ASSOCIATION_BYTES, redirectedTo: null }) && associationNote({ status: 200, bytes: ASSOCIATION_BYTES, redirectedTo: null }) === "Served as Stripe's own file.")
    check("a short answer names both lengths", associationNote({ status: 200, bytes: 12, redirectedTo: null }).includes("12 bytes") && associationNote({ status: 200, bytes: 12, redirectedTo: null }).includes(String(ASSOCIATION_BYTES)))
    check("a different length is served but flagged", associationNote({ status: 200, bytes: 9000, redirectedTo: null }).includes("check it is the current one"))
    check("unreachable says nothing is known", associationNote({ status: null, bytes: null, redirectedTo: null }).includes("Nothing is known"))
  }

  console.log("\nThe report the panel draws\n")
  {
    const all = [registered, { id: "pmd_9", domain_name: "theirdomain.store", enabled: false, livemode: true, apple_pay: { status: "inactive" } }]
    const done = buildReport({ domain: "storelib.com", record: registered, all, association: none })
    check("a registered domain says so", done.registered && done.enabled && done.recordId === "pmd_1Abc")
    check("its summary names the wallets that are live", done.summary.includes("Apple Pay, Google Pay are all active"))
    check("the registration date comes back as a date", done.registeredAt === new Date(1_764_000_000_000).toISOString())
    check("every domain on the account is listed", done.allDomains.length === 2 && done.allDomains[1].domain === "theirdomain.store" && done.allDomains[1].enabled === false)
    check("the button would re-check", done.nextStep === "validate")

    const missing = buildReport({ domain: "storelib.com", record: null, all: [], association: { ...none, status: 404, bytes: 0, ok: false, note: associationNote({ status: 404, bytes: 0, redirectedTo: null }) } })
    check("an unregistered domain says no button is drawn", missing.summary.includes("not registered") && missing.summary.includes("no wallet button is drawn"))
    check("and the button would register it", missing.nextStep === "create" && !missing.registered)
    check("with the file's own 404 carried in the same answer", missing.association.status === 404 && !missing.association.ok)

    const off = buildReport({ domain: "storelib.com", record: { ...registered, enabled: false }, all: [registered], association: none })
    check("a registration that is switched off is not a working one", off.registered && !off.enabled && off.summary.includes("switched off"))

    const partial = buildReport({ domain: "storelib.com", record: halfDone, all: [halfDone], association: none })
    check("a half-done domain names both sides", partial.summary.includes("Google Pay active") && partial.summary.includes("Apple Pay not yet"))

    const empty = buildReport({ domain: "storelib.com", record: { id: "pmd_5", domain_name: "storelib.com", enabled: true }, all: [], association: none })
    check("registered with nothing active yet says exactly that", empty.summary.includes("no wallet active on it yet"))
  }

  console.log("\nThe route asks who is calling, and never touches a payment\n")
  {
    const route = "app/api/admin/payment-domains/route.ts"
    const src = stripComments(readFileSync(route, "utf8"))
    check("both handlers are there", /export async function GET/.test(src) && /export async function POST/.test(src))
    check("each one checks the admin session first", (src.match(/const denied = await requireAdmin\(\)\s*\n\s*if \(denied\) return denied/g) ?? []).length === 2)
    check("it runs on node, not the edge", /export const runtime = "nodejs"/.test(src))
    /* Everything above POST is what GET can reach, and none of it changes anything at Stripe. */
    const beforePost = src.slice(0, src.indexOf("export async function POST"))
    check("GET only lists and fetches: no create, no validate", !/paymentMethodDomains\.(create|validate)/.test(beforePost) && /paymentMethodDomains\.list/.test(beforePost))
    check("POST creates when Stripe's list does not have it", /paymentMethodDomains\.create\(\{ domain_name: domain, enabled: true \}\)/.test(src))
    check("and validates when it does", /paymentMethodDomains\.validate\(existing!\.id!\)/.test(src))
    check("which of the two is decided by nextStep, not by a guess", /const step = nextStep\(existing\)/.test(src))
    check("the domain is derived, not hardcoded", /siteDomain\(baseUrl\(\), request\.url\)/.test(src) && !/"storelib\.com"/.test(src))
    check("an explicit domain is accepted, for a creator's own", /normaliseDomain\(asked\)/.test(src))
    check("it is recorded in the audit log", /recordAdminAction\(/.test(src) && /register_payment_domain/.test(src))
    check("Stripe's refusal is passed on, so the owner reads what to fix", /Stripe refused: \$\{e\.raw\.message\}/.test(src))
    check(
      "nothing in this route touches money: no amount, no PaymentIntent, no transfer",
      !/amount|paymentIntent|payment_intent|transfer_data|application_fee/i.test(src),
    )
    check("and the answer is never cached", (src.match(/"Cache-Control": "no-store"/g) ?? []).length >= 2)
  }

  console.log("\nThe panel is on the Health view and shows Stripe's own reason\n")
  {
    const panel = readFileSync("app/(storelib)/admin/_console/panel-wallets.tsx", "utf8")
    const view = readFileSync("app/(storelib)/admin/_console/view-platform.tsx", "utf8")
    check("the Health view renders it", /<WalletDomainsPanel \/>/.test(view) && /from "\.\/panel-wallets"/.test(view))
    /* Round 11: a template string now, so one panel can ask about the OnePage host (storelib.me) too. */
    check("the panel calls the route", /fetch\(["`]\/api\/admin\/payment-domains/.test(panel))
    check("and the OnePage host has a panel of its own", /<WalletDomainsPanel domain=\{getOnePageDomain\(\)\} \/>/.test(view))
    check("one press, GET or POST, nothing else", !/method: "(PUT|DELETE|PATCH)"/.test(panel))
    /* Whole and wrapped, under the table: a truncated cell would lose the one sentence the fix depends on. */
    check("it shows Stripe's message as it came", /rows\.filter\(\(w\) => w\.message\)/.test(panel) && /\{w\.message\}/.test(panel) && /overflow-wrap:anywhere/.test(panel))
    check("it shows the association file's status", /answer\.association\.status/.test(panel))
    check("no purple anywhere in it", !/8b5cf6|purple|violet/i.test(panel))
    check("a client component, with no server import", /^"use client"/.test(panel) && !/server-only|@\/lib\/stripe|@\/lib\/supabase/.test(panel))
  }

  console.log("\nThe file Apple fetches is still served, byte for byte\n")
  {
    /*
      Pinned because the registration this panel makes fails without it, and a
      404 here is exactly how Apple Pay was invisible before commit aebe6c9.
    */
    const file = `public${ASSOCIATION_PATH}`
    check(`${file} is there`, statSync(file).isFile())
    check(`and is ${ASSOCIATION_BYTES} bytes, as Stripe hands it out`, statSync(file).size === ASSOCIATION_BYTES, `${statSync(file).size} bytes`)
    const config = readFileSync("next.config.mjs", "utf8")
    check("served as text/plain, so Apple's fetch reads it", new RegExp(`source: '${ASSOCIATION_PATH}'`).test(config) && /text\/plain/.test(config))
  }

  console.log("\nThe checkout still asks for Apple Pay and Google Pay\n")
  {
    const pay = readFileSync("app/(storelib)/checkout/parts/stripe-pay.tsx", "utf8")
    check("the express row asks for Apple Pay and Google Pay, not Link", /applePay: "auto", googlePay: "auto", link: "never"/.test(pay))
    check("and the card form does not draw the wallets a second time", /wallets: \{ applePay: "never", googlePay: "never" \}/.test(pay))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
