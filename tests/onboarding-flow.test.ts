import { readFileSync } from "node:fs"
import { paymentsSetupErrorMessage } from "@/lib/payments/stripe/setup-errors"
import { parsePersonal, personalFields, personalIssues } from "@/lib/payments/stripe/onboarding-steps"
import { accountSessionComponents } from "@/lib/payments/stripe/session-components"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}

check("an individual is not asked for a company", personalFields("individual").join(",") === "firstName,lastName")
check("a business is asked for the business name", personalFields("business").join(",") === "businessName,firstName,lastName")

const ro = parsePersonal({ kind: "individual", country: "ro", firstName: "Andrei", lastName: "Radu", businessName: "Ignored SRL" })
check("Romania individual keeps the person only", ro.ok === true && ro.ok && ro.value.country === "RO" && ro.value.businessName === null && ro.value.kind === "individual")
check(
  "Romania individual has no company issue",
  personalIssues({ kind: "individual", country: "RO", firstName: "Andrei", lastName: "Radu" }).businessName === undefined,
)

const roBusinessMissing = parsePersonal({ kind: "business", country: "RO", firstName: "Andrei", lastName: "Radu" })
check("Romania business requires the business name", roBusinessMissing.ok === false && roBusinessMissing.ok === false && roBusinessMissing.error === "Enter the business name.")
const roBusiness = parsePersonal({ kind: "business", country: "RO", firstName: "Andrei", lastName: "Radu", businessName: "Storelib SRL" })
check("Romania business accepts the business name", roBusiness.ok === true && roBusiness.ok && roBusiness.value.businessName === "Storelib SRL")

const us = parsePersonal({ kind: "individual", country: "US", firstName: "Ada", lastName: "Lovelace" })
check("US individual parses", us.ok === true && us.ok && us.value.country === "US")
const gb = parsePersonal({ kind: "individual", country: "gb", firstName: "Ada", lastName: "Lovelace" })
check("UK individual parses", gb.ok === true && gb.ok && gb.value.country === "GB")
const de = parsePersonal({ kind: "business", country: "DE", firstName: "Ada", lastName: "Lovelace", businessName: "Ada GmbH" })
check("EU business parses", de.ok === true && de.ok && de.value.country === "DE")

check("a country name is refused", parsePersonal({ kind: "individual", country: "Romania", firstName: "Ada", lastName: "Lovelace" }).ok === false)
const edge = parsePersonal({ kind: "individual", country: "AQ", firstName: "Ada", lastName: "Lovelace" })
check("an edge country is not given a special form", edge.ok === true)
check(
  "an unsupported country stays in plain language",
  paymentsSetupErrorMessage({ message: "The country AQ is not supported for this account" }) ===
    "Payments are not available for that country yet. Choose another country, or write to support@storelib.com.",
)
check(
  "a Romania card_payments refusal is not reported as the country being closed",
  paymentsSetupErrorMessage({ message: "You cannot request the card_payments capability for accounts in country RO" }) !==
    "Payments are not available for that country yet. Choose another country, or write to support@storelib.com." &&
    paymentsSetupErrorMessage({ message: "recipient ToS is not supported for platforms in RO creating accounts in RO" }) !==
      "Payments are not available for that country yet. Choose another country, or write to support@storelib.com.",
)

/* The exact Account Session components: one component per session, and only what that screen uses. */
const inStorelib = { external_account_collection: true, disable_stripe_user_authentication: true }
check(
  "onboarding enables account_onboarding only, bank in the form, no Stripe sign-in",
  JSON.stringify(accountSessionComponents("onboarding", true)) === JSON.stringify({ account_onboarding: { enabled: true, features: inStorelib } }),
)
check(
  "account details enable account_management only",
  JSON.stringify(accountSessionComponents("management", true)) === JSON.stringify({ account_management: { enabled: true, features: inStorelib } }),
)
check(
  "payouts never switch on money moves Storelib does not offer",
  JSON.stringify(accountSessionComponents("payouts", true)) ===
    JSON.stringify({ payouts: { enabled: true, features: { ...inStorelib, instant_payouts: false, standard_payouts: false, edit_payout_schedule: false } } }),
)
check("an older Stripe-run account gets no platform-only features", JSON.stringify(accountSessionComponents("onboarding", false)) === JSON.stringify({ account_onboarding: { enabled: true, features: {} } }))

const steps = untt(readFileSync("lib/payments/stripe/onboarding-steps.ts", "utf8"), "lib/payments/stripe/onboarding-steps.ts")
check("payout currency is not hardcoded", !/\b(EUR|RON|USD|GBP)\b/.test(steps))

const ui = untt(readFileSync("components/app/settings/storelib-payments-settings.tsx", "utf8"), "components/app/settings/storelib-payments-settings.tsx")
const flow = untt(readFileSync("components/app/settings/payments-setup-flow.tsx", "utf8"), "components/app/settings/payments-setup-flow.tsx")
const collection = untt(readFileSync("lib/payments/stripe/setup-collection.ts", "utf8"), "lib/payments/stripe/setup-collection.ts")
const read = (path: string) => untt(readFileSync(path, "utf8"), path)
/*
  Setup does not render this any more (see below), and nothing else does
  either. It is kept, with its rules, because Stripe can still force an
  embedded form on the web one day, and a half-remembered one would be worse
  than this. Nothing in the phone app may reach it.
*/
const embedded = untt(readFileSync("components/app/settings/stripe-connect-embedded.tsx", "utf8"), "components/app/settings/stripe-connect-embedded.tsx")
const connect = untt(readFileSync("lib/payments/stripe/connect.ts", "utf8"), "lib/payments/stripe/connect.ts")
const route = untt(readFileSync("app/api/payments/[action]/route.ts", "utf8"), "app/api/payments/[action]/route.ts")
const overview = untt(readFileSync("lib/payments/stripe/overview.ts", "utf8"), "lib/payments/stripe/overview.ts")
check("the card holds no bank or identity fields", !/iban|routing|accountNumber|passport/i.test(ui))
/* The owner, October 2026: "like Gumroad, our own component, don't embed Stripe's setup". Storelib's own form, asking only what Stripe lists for the account. */
const own = untt(readFileSync("lib/payments/stripe/own-form.ts", "utf8"), "lib/payments/stripe/own-form.ts")
const rules = untt(readFileSync("lib/payments/stripe/own-form-rules.ts", "utf8"), "lib/payments/stripe/own-form-rules.ts")
/*
  Setup is Storelib's own form from end to end, for an individual and for a
  business alike. There was a step that handed the rarer fields to Stripe's
  embedded form; the owner, October 2026: "it never loads inside the app
  capacitor ios android, it loads infinitely and takes me outside of the app
  to js.stripe to browser ... i don't want stripe connect branding things, i
  want storelib's own, very simple, clean, not so many steps". So it is gone,
  and the fields it took are drawn here.
*/
check("setup is Stripe's embedded steps inside this page; a bank change is still Storelib's form", /function SetupEmbed/.test(flow) && /function BankForm/.test(flow) && /StripeConnectEmbedded/.test(flow) && !/BusinessDetailsStep/.test(flow))
check("the server keeps none of it: no table write and no value in a log", !/createAdminClient|\.from\("|\.insert\(|\.upsert\(/.test(own) && /replace\(\/\\d\{2,\}\/g, "#"\)/.test(own) && !/console\.(log|error)\([^)]*(iban|idNumber|id_number|account_number|dob)\b/i.test(own))
check("the account is always the signed-in creator's own, never one from the browser", /readCreatorStripe\(creator\.id\)/.test(own) && !/body\.(account|stripeAccount|accountId)/.test(route))
/* The owner, October 2026: identity verification is part of setup, required to continue, not left for later. */
check("it asks what Stripe will need, not only today's, so a creator is asked once", /eventually_due/.test(rules) && /currently_due/.test(rules) && /past_due/.test(rules))
check("  there is no way to finish setup around verification", !/>Later</.test(flow) && flow.includes("Continue verification") && flow.includes("Payments turn on once Stripe has verified your identity."))
check("  the bank is the country's own format, with the IBAN checked before it is sent", /IBAN_COUNTRIES/.test(rules) && /ibanValid\(iban, country\)/.test(own) && /ibanLooksValid\(/.test(flow))
check("Your details is headed, and no lock-and-promise line under it", flow.includes('title="Your details"') && !/Sent securely to Stripe|Secured by Stripe\. Storelib never sees/.test(flow))
/* The owner, October 2026: the ID check has to be on the form from the start, not sprung weeks later. */
/*
  The owner, October 2026: "once users set up it's done, they upload their
  KYC and that's all", and Verify ID is step three. Stripe lists the document
  under eventually_due the day the account is made and moves it to
  currently_due seconds after the details go in; asking only for "now" made
  setup bounce: details, "checking", back to the form for the ID. So the
  document is the one thing taken from eventually_due, asked last, once.
*/
/* The owner, October 2026: "the steps forever should be simple: personal info, KYC with ID only, with camera, bank details". Verify ID is step two for every seller until Stripe holds an ID, whatever Stripe lists. */
check("Verify ID is always step two until Stripe holds an ID", /if \(!needs\.fields\.includes\("document"\) && idOutstanding\(account\)\) needs\.fields = \[\.\.\.needs\.fields, "document"\]/.test(own))
check("  and nothing from eventually_due is ever asked", !/eventually_due/.test(own.replace(/\/\*[\s\S]*?\*\//g, "").split("export async function detailsForm")[0] ?? "") && /scope === "all" \? \(req\?\.eventually_due \?\? \[\]\) : \[\]/.test(rules))
check("no 'How are you selling', no Business option, no 'contact support' line in setup", !/How are you selling/.test(flow) && !/data-account-kind/.test(flow) && !/Stripe also needs something this form does not cover/.test(flow))
check("'Checking your ID' only after an ID really went in this setup", /idSent\.current \? "id" : "details"/.test(flow) && /left\?\.needs\.given\?\.includes\("document"\) && step === 2\) idSent\.current = true/.test(flow))
check("  and Stripe's identity check may start as soon as the document is listed", /eventually_due/.test(untt(readFileSync("lib/payments/stripe/identity.ts", "utf8"), "lib/payments/stripe/identity.ts").split("function documentDue")[1]?.split("\n}\n")[0] ?? ""))
check("the stepper shows Verify ID from the start when it is ahead, and the end screen says what it is checking", /useState\(!!data\.idAhead\)/.test(flow) && /what === "id" \? "Checking your ID" : "Checking your details"/.test(flow))
check("  and a Stripe ask that arrives on the checking screen goes to the step, not to a 'not finished' wall", /if \(mode === "setup" && now === "more"\) \{\s*\n\s*setEnding\(null\)\s*\n\s*go\(1\)/.test(flow))
check("a step is answered from the write Stripe just acknowledged, not another read", /return viewOf\(creator, saved\)/.test(own) && !/await syncStripeAccount\(creator\.id, "creator"\)\.catch\(\(\) => undefined\)\s*\n\s*return detailsForm/.test(own))
check("the Account step's names are not asked again by Storelib", (flow.match(/autoComplete="given-name"/g) ?? []).length === 1)
check("ID photos go to Stripe as the account's file, attached in the same call", /stripe\.files\.create\(/.test(own) && /stripeAccount: row\.stripe_account_id/.test(own) && /verification: \{ \[which\]: \{ \[side\]: uploaded\.id \} \}/.test(own))
check("a bank on file shows its last four and can be replaced", /Current account ending in/.test(flow) && flow.includes("Change bank account") && /createExternalAccount\(account\.id, \{ external_account: bank, default_for_currency: true \}\)/.test(own))
check("nothing opens a Stripe page or the Stripe dashboard", !/window\.open|dashboard\.stripe|account_links|accountLinks|connect\.stripe\.com\/(setup|express)/i.test(flow + ui + embedded))
/* The owner, October 2026: like Skool, personal info, verification with the camera, then the bank with its payout currency. */
check("setup is Stripe's form on this page, and our field step is not what opens", /\["Personal info", "Verify ID", "Bank account"\]/.test(flow) && /data-bank-step/.test(flow) && /function SetupEmbed/.test(flow) && !/mode === "details"[\s\S]{0,120}<DetailsStep/.test(flow))
check("  the bank step picks the payout currency first, from what Stripe pays out to that country", /data-payout-currency/.test(flow) && /countrySpecs\.retrieve\(/.test(own) && /supported_bank_account_currencies/.test(own) && /default_currency: currency/.test(own))
/* The owner, October 2026: "the kyc photo id needs to be separate step", and the CNP "should not be needed". */
check("  the ID check is its own step, drawn apart from the details", /only === "id" \? f === "document"/.test(flow))
/* The owner, October 2026: "verify id is not step 2 is actually 3, so I don't have to re-enter again the details". */
check("  setup opens Stripe's form, not a second pass over Storelib's fields", /<SetupEmbed[\s\S]*?key=\{`id-\$\{openCount\}`\}/.test(flow) && !/<DetailsStep[\s\S]*?key=\{`details-step/.test(flow))
check("  and what was typed survives walking between the steps", /let detailsDraft: DetailsDraft/.test(flow) && /function useDraft</.test(flow) && /clearDetailsDraft\(\)/.test(flow))
check("  the draft is memory for this tab only, never storage", !/localStorage|sessionStorage|indexedDB/i.test(flow))
/* Stripe: "Identity documents are JPG or PNG format", address documents may also be PDF, 10 MB, colour. */
check("an identity document is never offered as a PDF", /const ID_TYPES = new Set\(\["image\/jpeg", "image\/png"\]\)/.test(own) && /const ADDRESS_TYPES = new Set\(\["image\/jpeg", "image\/png", "application\/pdf"\]\)/.test(own))
check("  and the picker for an ID offers no PDF either", /accept="image\/jpeg,image\/png,image\/heic"\s*\n\s*hidden/.test(flow))
check("  with Stripe's own 10 MB limit, not a stricter guess", /DOC_MAX_BYTES = 10 \* 1024 \* 1024/.test(own))
check("  the ID number is not asked again once Stripe holds the document", /given\?: DetailField\[\]/.test(flow) && /needs\.given = given/.test(own))
check("the step comes from Stripe's status", /setupStepOf\(/.test(flow))
/* The owner, October 2026: going on "takes to much", and "We're verifying your details" appearing out of nowhere. */
check("  the next step reads the overview the write returned, with no second sync", !/onNext\([^)]*\)\s*\n?\s*await post<Overview>\("refresh"/.test(flow) && /const settle = async \(sent: Overview, left: DetailsForm \| null\)/.test(flow))
/* The owner, October 2026: "it says well notify you in 2 days, that should not be the case once users set up and uploaded their KYC". */
check("  the checking screen waits with them instead of promising days", /function Outcome\([\s\S]*?"Checking your ID"/.test(flow) && !/line:[^\n]*business days/.test(flow))
check("    and it asks again while it is open, becoming active by itself", /outcome !== "checking"\) return[\s\S]*?post<Overview>\("refresh"/.test(flow) && /onChecked/.test(flow))
/* The owner, October 2026: Stripe does not take the photo we send. Verify ID is Stripe's own embedded check, on this page, and it never leaves for Stripe's site. */
const idClient = untt(readFileSync("lib/payments/identity-client.ts", "utf8"), "lib/payments/identity-client.ts")
check("Stripe's hosted page still exists, and the step does not open it", /openHostedVerification/.test(idClient) && !/openHostedVerification|openIdentity/.test(flow))
check("  setup is Stripe's embedded form, on this page", /data-id-embed/.test(flow) && /stripe_onboarding/.test(flow) && /stripe_management/.test(flow) && /StripeConnectEmbedded/.test(flow))
check("  it does not ask what kind of seller you are, or for a live selfie, an extra address document, or a bank-ownership file", /business_type",[\s\S]{0,500}?"individual\.verification\.proof_of_liveness",\s*"individual\.verification\.additional_document",\s*"documents\.bank_account_ownership_verification"/.test(flow + collection))
check("  and the step never leaves for Stripe", !/location\.assign|window\.open|Verify with Stripe|Opening Stripe|openHostedVerification/.test(flow))
/*
  Round 20, the owner: on iOS and Android the setup opens as a mobile bottom
  sheet with Stripe's embed in it, no step asking for a website, a
  profession or what type of person you are, and it closes back to Storelib
  when it is finished. Browsers and big screens stay as they are.
*/
check("in the apps setup opens Stripe's embed on /payouts-sheet in the system browser sheet, never Safari", /const sheet = isNativeApp\(\)/.test(flow) && /const OWN_STEPS_IN_APP = false/.test(flow) && /if \(sheet && !inApp\) \{[\s\S]{0,200}<AppBrowserSetup/.test(flow) && /presentationStyle: "popover"/.test(flow) && /post<\{ url: string \}>\("app-sheet"/.test(flow) && /Browser\.close\(\)/.test(flow))
check("  the sheet's page is signed in by a link in its #fragment, for one creator, checked again on the server", /payouts-sheet#f=\$\{form\}&t=/.test(read("app/api/payments/[action]/route.ts")) && /verifySheetLink\(body\.token\)/.test(read("app/api/payouts-sheet/route.ts")) && /row\.user_id !== link\.u/.test(read("app/api/payouts-sheet/route.ts")) && /replaceState/.test(read("app/payouts-sheet/payouts-sheet.tsx")))
check("  a browser keeps the page it had", /<Panel open=\{open\} phone=\{phone\} onClose=\{onClose\} label=\{title\}>\s*\{bar\}\s*\{content\}/.test(flow))
check("  Stripe is not asked for the website, the industry or what is sold", /"business_profile\.url",\s*"business_profile\.mcc",\s*"business_profile\.product_description"/.test(collection))
check("  and the account has them before the form is drawn", /fill\.business_profile = \{/.test(untt(readFileSync("lib/payments/stripe/connect.ts", "utf8"), "lib/payments/stripe/connect.ts")) && /if \(!account\.business_type\) fill\.business_type = "individual"/.test(untt(readFileSync("lib/payments/stripe/connect.ts", "utf8"), "lib/payments/stripe/connect.ts")))
check("  payouts on: the done screen for a moment, then the sheet closes back to Storelib", /if \(!sheet \|\| !open \|\| ending !== "done"\) return[\s\S]{0,120}finishRef\.current\(\)/.test(flow))
check("  a pull inside Stripe's form never closes the sheet", /data-payments-setup-panel="sheet" data-sheet-no-drag=""/.test(flow))
/*
  Round 14, the owner with a screenshot of step two: "Stripe would not start
  the check: Your account is not set up to use Identity. Please have an
  account admin visit to get started. Get rid of this and make sure it
  works." Stripe Identity is a separate Stripe product an account admin has
  to switch on, and it is billed per check. A Connect account already carries
  its own identity verification, on Stripe's own hosted page, at no extra
  cost, so that is the path that runs. Identity is kept for where it is
  really there, probed once and remembered, and every refusal falls through
  to Connect without a word to the creator.
*/
const verifyWords = untt(readFileSync("lib/payments/verify-id.ts", "utf8"), "lib/payments/verify-id.ts")
const hosted = untt(readFileSync("lib/payments/stripe/hosted-verification.ts", "utf8"), "lib/payments/stripe/hosted-verification.ts")
check("Verify ID runs through Connect's own hosted verification", /stripe\.accountLinks\.create\(/.test(hosted) && /collection_options: \{ fields: "currently_due"/.test(hosted) && /account\.details_submitted \? "account_update" : "account_onboarding"/.test(hosted))
check("  and it comes back to Storelib, on the step that is left", /return_url: where\.returnUrl/.test(hosted) && /refresh_url: where\.refreshUrl/.test(hosted) && /\/app\/payouts\?setup=1/.test(route))
check("  Stripe Identity is tried first and falls through quietly when it is not there", /verifyWay\(\{ identityOn: await identityOnForPlatform\(\) \}\) === "identity"/.test(hosted) && /way: "connect"/.test(hosted))
check("  a photo that does not go through says one Storelib sentence, never Stripe's", /setIdProblem\(verifyLine\("offline"\)\)/.test(flow) && !/would not start the check/.test(flow) && !/not switched on for Storelib/.test(flow))
check("  and no Stripe word or code can reach a creator through it", /account_not_set_up/.test(verifyWords) && /account admin/.test(verifyWords) && /readsLikeStripe/.test(flow))
/*
  The owner, October 2026, kept being told "Stripe's ID check is not switched
  on". It was a guess. The old test for it answered yes to any Stripe error
  with the word "identity" in it, which is nearly all of them, so a parameter
  Stripe refused was reported as Identity being off and the real cause never
  surfaced. What Stripe refused was ours: options.document.require_live_capture
  on a related_person session, which Stripe's own example does not send.
*/
const identitySrc = untt(readFileSync("lib/payments/stripe/identity.ts", "utf8"), "lib/payments/stripe/identity.ts")
/* The code only: the comments name the parameter that caused this, on purpose. */
const identityCode = identitySrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
check("the session is created exactly as Stripe documents it: type, related_person, no options", /type: "document",[\s\S]{0,160}related_person: \{ account: account\.id, person: personId \}/.test(identityCode) && !/require_live_capture/.test(identityCode))
check("  a selfie is only asked for where the requirement is proof_of_liveness", /liveness \? \{ options: \{ document: \{ require_matching_selfie: true \} \} \} : \{\}/.test(identityCode))
check("  Identity is never called when it is known to refuse", /if \(!\(await identityOnForPlatform\(\)\)\) return \{ ok: false, reason: "not_enabled" \}/.test(identityCode) && /STRIPE_IDENTITY/.test(identityCode))
check("  a refusal is remembered, so the next creator does not wait on the same dead call", /if \(reason === "not_enabled"\) identityOffered = false/.test(identityCode))
check("  and nothing Stripe said is ever handed back to the page", !/detail/.test(identityCode) && /return \{ ok: false, reason \}/.test(identityCode))
check("Stripe Identity is only used for what it can fill, never an additional document", /individual\\\.verification\\\.\(document\|proof_of_liveness\)/.test(identityCode))
check("the computer keeps asking until the phone's photo is in", /idDevice !== "desk" \|\| only !== "id"/.test(flow) && /void askStripe\(\)/.test(flow))
check("every Stripe call in a photo upload is bounded, so the page is never left hanging", /timeout: 20_000, maxNetworkRetries: 1/.test(own))
check("  and a camera that cannot open stays in Storelib, rather than opening something else", /data-id-camera-open/.test(flow) && !/how === "no_way"/.test(flow))
check("  verifying is never shown while Stripe is still asking for something", /const stepFor = \(form: DetailsForm \| null\): Step \| null/.test(flow) && /if \(target !== null && target !== step\)/.test(flow))
/* The owner, October 2026: finish it properly. Every way out of settle has to land somewhere. */
check("  what is still owed decides the step, so no Continue leads nowhere", /if \(detailsLeft\) return 1/.test(flow) && /if \(idLeft\) return 2/.test(flow) && /if \(needs\.bank\) return 3/.test(flow))
check("  and a step is never sent to itself, which was an endless remount", /target !== step/.test(flow) && /outcome === "bank" && step !== 3/.test(flow))
check("a failed load has a way on", embedded.includes("Couldn't load verification") && embedded.includes("Try again in a moment.") && embedded.includes(">\n          Try again"))
check("one loader, then Stripe's form fades in", /setOnLoaderStart/.test(embedded) && (embedded.match(/<WaitingArea/g) ?? []).length === 1)
/* The owner, October 2026: "3 layers of backdrop, fade, I don't like those", and the modal "should not have that much width". */
check("setup is one page of its own: no darkened backdrop behind it", /data-payments-setup-panel=\{phone \? "subpage" : "page"\}/.test(flow) && !/bg-\[#0f1115\]\/45/.test(flow) && /h-\[100dvh\]/.test(flow))
check("  one narrow column of 560px with one card on a computer, the whole width on a phone", /max-w-\[560px\]/.test(flow) && /data-setup-card=""/.test(flow) && !/max-w-\[min\(760px/.test(flow))
check("  Storelib's mark in its bar, and a way out", /<StorelibLogo size=\{28\} \/>/.test(flow) && /aria-label="Close"/.test(flow))
check("  Stripe's own windows match Storelib: Inter, 10px corners, a soft backdrop", /fontFamily: 'Inter,/.test(embedded) && /formBorderRadius: "10px"/.test(embedded) && /overlayBackdropColor:/.test(embedded) && /fonts: FONTS/.test(embedded))
check("the keyboard fix hooks stay", /data-setup-footer=""/.test(flow) && /data-setup-scroll=""/.test(flow))
{
  /* The panel is drawn above the layer a phone sheet uses, so the country
     list has to be told to come out higher still or it opens behind it and
     the field looks dead. */
  const sheet = untt(readFileSync("components/ui/bottom-sheet.tsx", "utf8"), "components/ui/bottom-sheet.tsx")
  const picker = untt(readFileSync("components/app/settings/country-picker.tsx", "utf8"), "components/app/settings/country-picker.tsx")
  const list = untt(readFileSync("components/ui/choice-list.tsx", "utf8"), "components/ui/choice-list.tsx")
  check(
    "the country list opens above the setup panel on a phone",
    /const PANEL_Z = 1000/.test(flow) && /const SHEET_Z = PANEL_Z \+ 10/.test(flow) && /sheetZIndex=\{SHEET_Z\}/.test(flow),
  )
  check(
    "and the layer is carried from the field down to the sheet",
    /sheetZIndex\?: number/.test(picker) && /sheetZIndex=\{sheetZIndex\}/.test(list) && /zIndex=\{sheetZIndex\}/.test(list),
  )
  check(
    "a sheet nobody asked to move stays where every sheet is",
    /zIndex == null && "z-\[200\]"/.test(sheet) && /zIndex\?: number/.test(sheet),
  )
}
check(
  "nothing in an individual's setup needs a Stripe frame, and nothing opens a browser",
  !/OpenInBrowser|openExternal\(/.test(flow) && !/<iframe|loadConnectAndInitialize/.test(flow) && /const labels = idNeeded \? STEP_LABELS : STEP_LABELS_NO_ID/.test(flow),
)
{
  /* The app gets its own, much narrower frame-src: Stripe's embedded forms
     have to be in it, and Stripe.js's controller iframe has to stay out. */
  const native = untt(readFileSync("proxy.ts", "utf8"), "proxy.ts").match(/"Content-Security-Policy",\s*\n([\s\S]*?)\n\s*\)/)?.[1] ?? ""
  check(
    "the app's frame rules let Stripe's embedded forms load",
    /"frame-src 'self'"/.test(native) && /https:\/\/connect-js\.stripe\.com/.test(native),
  )
  check("and still keep Stripe.js's controller iframe out", !/controller/.test(native))
  check(
    "a frame that does navigate stays in the app",
    /* Round 7 added Storelib's own hosts to the list (tests/native-app-links.test.ts); Stripe's three are still first. */
    /allowNavigation: \[\s*'js\.stripe\.com',\s*'hooks\.stripe\.com',\s*'connect-js\.stripe\.com',/.test(untt(readFileSync("capacitor.config.ts", "utf8"), "capacitor.config.ts")),
  )
}
/* Changed on purpose (currency round AP): the account shapes moved to lib/payments/stripe/account-attempts.ts. */
const attemptsSrc = readFileSync("lib/payments/stripe/account-attempts.ts", "utf8")
check("new accounts are run by Storelib, with no Stripe dashboard", /requirement_collection: "application"/.test(attemptsSrc) && /stripe_dashboard: \{ type: "none" \}/.test(attemptsSrc) && /accountAttempts\(shared, route, options\)/.test(connect))
check("an unfinished Express account is replaced, not duplicated", /storelibOnly: true/.test(connect) && /stripe\.accounts\.del\(replacing\)/.test(connect))
check("sessions are made per view for the signed-in creator's own account", /stripe\.accountSessions\.create\(\{ account: row\.stripe_account_id, components \}\)/.test(connect) && !/stripe_account_id|accountId|account:/.test(embedded))
check("the embed uses the server key", embedded.includes("publishableKey") && !embedded.includes("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"))
check("session secrets are not stored or logged", !/localStorage|sessionStorage|console\./.test(embedded) && !/console\.[a-z]+\([^)]*client_secret/.test(connect))
check("the overview reads status from Stripe", /syncStripeAccountFull\(/.test(overview) && /paymentsStatus/.test(overview))

const payouts = untt(readFileSync("app/app/payouts/payouts-client.tsx", "utf8"), "app/app/payouts/payouts-client.tsx")
const payoutsPage = untt(readFileSync("app/app/payouts/page.tsx", "utf8"), "app/app/payouts/page.tsx")
const accountLink = untt(readFileSync("app/api/stripe/account-link/route.ts", "utf8"), "app/api/stripe/account-link/route.ts")
const connectStart = untt(readFileSync("app/api/stripe/connect/start/route.ts", "utf8"), "app/api/stripe/connect/start/route.ts")
check("payouts does not open an account link", !/\/api\/stripe\/account-link/.test(payouts) && !/Could not open Stripe/.test(payouts))
check("an unfinished payouts page is only the setup card", /if \(!paymentsReady\)/.test(payouts) && /paymentsReady \? \(/.test(payoutsPage))
check("the page does not request an Express dashboard link", !/createLoginLink/.test(payoutsPage))
check("account link routes do not call Stripe", !/accountLinks\.create/.test(accountLink) && !/accountLinks\.create/.test(connectStart))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
