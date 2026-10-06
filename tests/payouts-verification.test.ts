/**
 * ===========================================================================
 *  SET UP PAYOUTS, STEP TWO: VERIFY ID
 * ===========================================================================
 * Round 14, the owner with a photograph of their phone on step two:
 *
 *     "Stripe would not start the check: Your account is not set up to use
 *      Identity. Please have an account admin visit to get started.
 *      Get rid of this and make sure it works."
 *
 * Two faults in one screen.
 *
 *   THE CHECK COULD NOT RUN. Step two called Stripe Identity, which is a
 *   separate Stripe product: an account admin has to switch it on in the
 *   Stripe dashboard and it is billed per check. It is not on, so every
 *   creator was stopped. A Connect account already carries its own identity
 *   verification, on Stripe's own hosted page, at no extra per check cost,
 *   and that is the path that runs now (lib/payments/stripe/hosted-verification.ts).
 *   Identity is kept for where it is genuinely available: probed once,
 *   remembered, and every refusal falls through to Connect in silence.
 *
 *   STRIPE'S OWN SENTENCE WAS PRINTED AT THE CREATOR. Nothing a creator can
 *   act on, and a note meant for us. Every refusal is one calm Storelib
 *   sentence with what to do next (lib/payments/verify-id.ts).
 *
 * The decision and the words are pure and tested for real here; the wiring
 * around Stripe is read from source, as every payments suite in this
 * repository does, because no test may touch a live Stripe account.
 *
 * Run with:  pnpm run test:push
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { VERIFY_LINES, identityUnavailable, readsLikeStripe, verifyLine, verifyWay } from "../lib/payments/verify-id"
import { idOutstanding } from "../lib/payments/stripe/status"

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
const read = (p: string) => readFileSync(p, "utf8")

/* The refusal in the owner's screenshot, as the Stripe library hands it over. */
const OWNERS_ERROR = {
  type: "invalid_request_error",
  code: "account_not_set_up",
  message: "Your account is not set up to use Identity. Please have an account admin visit https://dashboard.stripe.com/identity to get started.",
  raw: { code: "account_not_set_up", message: "Your account is not set up to use Identity. Please have an account admin visit https://dashboard.stripe.com/identity to get started." },
}

console.log("\n1. Stripe refusing Identity is read as 'there is no Identity here'")
check("the refusal the owner met", identityUnavailable(OWNERS_ERROR))
check("  by its code alone, with no message at all", identityUnavailable({ code: "account_not_set_up" }))
check("  and when it arrives only as raw", identityUnavailable({ raw: { code: "account_not_set_up", message: "" } }))
check("the endpoints simply not being there for this platform", identityUnavailable({ code: "resource_missing", message: "No such verification session" }))
check("  an expired or wrong key, which is the same dead end for the creator", identityUnavailable({ code: "api_key_expired", message: "Expired API Key provided" }))
check("  Stripe saying the platform is not allowed to use it", identityUnavailable({ message: "This platform is not allowed to use Identity." }))
/*
  It used to answer yes to any error with the word "identity" in it, which is
  nearly every error the Identity API returns, so a parameter Stripe refused
  was reported as the product being switched off and the real cause was never
  seen. A bad request is still a bad request.
*/
check("but a parameter Stripe refused is NOT 'Identity is off'", !identityUnavailable({ code: "parameter_unknown", message: "Received unknown parameter: options[document][require_live_capture]" }))
check("  nor an invalid value", !identityUnavailable({ message: "The value for `type` is not a valid verification session type." }))
check("  nor nothing at all", !identityUnavailable(null) && !identityUnavailable(undefined) && !identityUnavailable({}))

console.log("\n2. Identity unavailable means the Connect path, every time")
check("no Identity: Stripe's own hosted verification for the connected account", verifyWay({ identityOn: false }) === "connect")
check("Identity really switched on: Identity's own screen", verifyWay({ identityOn: true }) === "identity")
{
  const identity = readCode("lib/payments/stripe/identity.ts")
  const hosted = readCode("lib/payments/stripe/hosted-verification.ts")
  check("Identity is never called when it is known to refuse", /if \(!\(await identityOnForPlatform\(\)\)\) return \{ ok: false, reason: "not_enabled" \}/.test(identity))
  check("  the answer is probed once and kept, or settled by STRIPE_IDENTITY", /let identityOffered: boolean \| null = null/.test(identity) && /process\.env\.STRIPE_IDENTITY/.test(identity) && /if \(identityOffered !== null\) return identityOffered/.test(identity))
  check("  a refusal on a real create is remembered too", /if \(reason === "not_enabled"\) identityOffered = false/.test(identity))
  check("  and a probe that could not answer falls through rather than holding anybody up", /console\.error\("\[identity\] availability probe"/.test(identity) && /return false\n  \}\n\}/.test(identity))
  check("  reading the check's progress asks nothing of Identity either when it is off", /if \(!\(await identityOnForPlatform\(\)\)\) return \{ status: "none", problem: null \}/.test(identity))

  check("the Connect path is a hosted Account Link for this one account", /stripe\.accountLinks\.create\(/.test(hosted) && /account: account\.id/.test(hosted))
  check("  only what Stripe asks for today, never what it may ask for later", /collection_options: \{ fields: "currently_due", future_requirements: "omit" \}/.test(hosted))
  check("  account_update once Stripe has the details, account_onboarding before that", /account\.details_submitted \? "account_update" : "account_onboarding"/.test(hosted))
  check("  it comes back to Storelib, and so does an expired link", /return_url: where\.returnUrl/.test(hosted) && /refresh_url: where\.refreshUrl/.test(hosted))
  check("Identity is tried first, and standing down is not a dead end", /verifyWay\(\{ identityOn: await identityOnForPlatform\(\) \}\) === "identity"/.test(hosted) && /going through Connect/.test(hosted) && /way: "connect"/.test(hosted))
  check("  except 'Stripe is not asking for your ID', which is an answer", /if \(identity\.reason === "nothing_to_verify"\) return \{ ok: false, reason: "nothing_to_verify" \}/.test(hosted))
}

console.log("\n3. The return from Stripe, and a session picked up later")
{
  const route = readCode("app/api/payments/[action]/route.ts")
  const client = readCode("lib/payments/identity-client.ts")
  const settings = readCode("components/app/settings/storelib-payments-settings.tsx")
  check("a browser comes back to Payouts with ?setup=1", /returnUrl: body\.inApp === true \? `\$\{origin\}\/app\/payouts\/identity-done` : `\$\{origin\}\/app\/payouts\?setup=1`/.test(route))
  check("  and ?setup=1 reopens setup on the step that is left", /url\.searchParams\.get\("setup"\) !== "1"/.test(settings) && /setPanel\(\{ open: true, mode: modeFor\(view\?\.action\) \}\)/.test(settings))
  check("  a link that expired lands on Storelib too, never on a Stripe error", /refreshUrl: `\$\{origin\}\/app\/payouts\?setup=1`/.test(route))
  check("the phone app runs it in its own sheet and comes back to the page it closes", /if \(isNativeApp\(\)\) return openSheet\(url\)/.test(client) && /identity-done/.test(route))
  check("  a browser goes there in this same tab, not a second window a blocker eats", /window\.location\.assign\(url\)/.test(client) && !/window\.open\(url/.test(client))
  check("how far the check has got is read from the account when Identity is off", /verificationStatus/.test(route) && /pending\.has\("individual\.verification\.document"\)/.test(readCode("lib/payments/stripe/hosted-verification.ts")))
}

console.log("\n4. No Stripe word, code or id ever reaches a creator")
{
  const flow = read("components/app/settings/payments-setup-flow.tsx")
  const flowCode = readCode("components/app/settings/payments-setup-flow.tsx")
  check("the sentence from the screenshot is recognised as Stripe's own", readsLikeStripe(OWNERS_ERROR.message))
  check("  so are account ids, keys and tokens", readsLikeStripe("acct_1234 could not be read") && readsLikeStripe("No such file: file_9") && readsLikeStripe("invalid_request_error"))
  check("  and the codes a creator cannot act on", readsLikeStripe("account_not_set_up") && readsLikeStripe("resource_missing") && readsLikeStripe("capability transfers is inactive"))
  check("but a sentence written for a creator passes through", !readsLikeStripe("Check the fields marked in red.") && !readsLikeStripe("Add a photo of the front of your ID."))
  check("every line Verify ID can show is Storelib's own", VERIFY_LINES.every((line) => !readsLikeStripe(line)), VERIFY_LINES.find((line) => readsLikeStripe(line)))
  check("  each one says what to do next", VERIFY_LINES.every((line) => /Try again|Go back|Press Continue|finish those/.test(line)), VERIFY_LINES.find((line) => !/Try again|Go back|Press Continue|finish those/.test(line)))
  check("  and a reason nobody planned for is still a calm sentence", verifyLine("something_new") === "We could not open the ID check just now. Try again in a moment." && verifyLine(undefined) === verifyLine("something_new"))
  check("the step says a failed send in Storelib's words, from that one list", /setIdProblem\(verifyLine\("offline"\)\)/.test(flowCode) && !/openHostedVerification|openIdentity/.test(flowCode))
  check("  'Stripe would not start the check' is gone from the flow entirely", !/would not start the check/.test(flow))
  check("  and so is the line sending a creator to the Stripe dashboard", !/not switched on for Storelib/.test(flow) && !/Turn on Stripe Identity/.test(flow))
  check("the server hands the page a reason, never Stripe's text", !/detail/.test(readCode("lib/payments/stripe/identity.ts")))
  check("everything else from a server goes through the same rule", /if \(!message\.trim\(\) \|\| readsLikeStripe\(message\)\) return "Something went wrong\. Try again in a moment\."/.test(flowCode))
  /* Every place in the flow that puts a message on screen runs it through safe() first. */
  const raw = flowCode.match(/set(?:Error|IdProblem)\(\s*(?:err|error|e)\b/g) ?? []
  check("  nothing from a thrown error is shown unwashed", raw.length === 0, raw.slice(0, 2))
}

console.log("\n5. An account Stripe has already cleared skips the step")
{
  const own = readCode("lib/payments/stripe/own-form.ts")
  const flowCode = readCode("components/app/settings/payments-setup-flow.tsx")
  check("Stripe has verified them: nothing outstanding", !idOutstanding({ business_type: "individual", individual: { verification: { status: "verified" } } }))
  check("the document is already on file: nothing outstanding", !idOutstanding({ business_type: "individual", individual: { verification: { status: "unverified", document: { front: "file_1" } } } }))
  check("Stripe is looking at the one just sent: nothing outstanding", !idOutstanding({ business_type: "individual", individual: { verification: { status: "pending" } }, requirements: { pending_verification: ["individual.verification.document"] } }))
  check("a company account is never asked for a personal ID", !idOutstanding({ business_type: "company", individual: { verification: { status: "unverified" } } }))
  check("but an individual Stripe has not verified is", idOutstanding({ business_type: "individual", individual: { verification: { status: "unverified" } } }))
  check("so the form only adds the document when it is really outstanding", /if \(!needs\.fields\.includes\("document"\) && idOutstanding\(account\)\) needs\.fields = \[\.\.\.needs\.fields, "document"\]/.test(own))
  check("  and the ID step hands straight on when there is nothing to ask", /only === "id"\s*\n?\s*\? !idAsked/.test(flowCode) && /onEmpty\?\.\(\)\s*\n\s*onNext\(form, null\)/.test(flowCode))
  check("  which walks Back past it too, so nobody is bounced forwards again", /const stepBefore = \(from: Step\): Step => \(from === 3 \? \(idEmpty \? \(detailsEmpty \? 0 : 1\) : 2\)/.test(flowCode))
  check("Verify ID is not even a step in the stepper until Stripe asks", /const labels = idNeeded \? STEP_LABELS : STEP_LABELS_NO_ID/.test(flowCode))
}

console.log("\n6. The copy")
{
  const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
  const files = ["lib/payments/verify-id.ts", "lib/payments/stripe/hosted-verification.ts", "lib/payments/stripe/identity.ts", "lib/payments/identity-client.ts"]
  for (const f of files) check(`${f}: no em dashes, none of the banned words`, !banned.test(read(f)), (read(f).match(banned) ?? [])[0])
  /* The flow uses the CSS property `transform`, which is not the word the rules are about. */
  const flowWords = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge/i
  const flow = read("components/app/settings/payments-setup-flow.tsx")
  check("components/app/settings/payments-setup-flow.tsx: no em dashes, none of the banned words", !flowWords.test(flow), (flow.match(flowWords) ?? [])[0])
  check("step two still promises what it can keep: Stripe takes the document, Storelib never sees it", flow.includes("It goes straight to Stripe, and Storelib never sees or keeps the document.") && flow.includes("Storelib never sees the document."))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailures:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
