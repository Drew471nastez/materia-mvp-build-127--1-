/**
 * ===========================================================================
 *  THE LINK FARM STAYS OUT, AND REAL SELLERS STAY IN
 * ===========================================================================
 *
 * Three hundred and sixty accounts registered on Storelib in three same-day
 * batches in August 2026, published nothing, and collected an indexable
 * storefront each. This suite is what keeps the fix for that from rotting.
 *
 * It guards three separate things, and they fail for different reasons:
 *
 *   1. DETECTION — the fourteen handles actually observed are refused, and a
 *      list of legitimate handles is not. The second half is the important
 *      half. A false positive costs Storelib a seller; a false negative costs
 *      a spammer nine seconds.
 *
 *   2. ENFORCEMENT — the gate is wired into isValidUsername, which is the one
 *      choke point every username-setting path already goes through. A gate
 *      nobody calls is decoration.
 *
 *   3. CONTAINMENT — the sitemap only lists storefronts that have published
 *      something, and the storefront's robots tag and structured data follow
 *      the same rule. This is the half that removes the incentive, so it is
 *      the half most worth a source-level guard: it is a few easily-reverted
 *      lines in two files, and reverting either one quietly reopens the door.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  scoreHandle,
  scoreSignup,
  handleSignature,
  deservesIndexing,
  isDisposableEmail,
  BLOCK_SCORE,
  REVIEW_SCORE,
} from "../lib/security/spam-signals"
import { isValidUsername } from "../lib/reserved-words"
import { dictionaries } from "../lib/i18n/dictionaries"
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
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

console.log("\nThe link farm stays out, and real sellers stay in\n")

/**
 * ---------------------------------------------------------------------------
 * 1. DETECTION
 * ---------------------------------------------------------------------------
 * The observed batch, copied from the admin list exactly as it appeared —
 * including the two that were shouted in capitals, because case folding is part
 * of what is being tested.
 */
const OBSERVED_FARM = [
  "powerokebos999",
  "okebos999autojp2026",
  "powerdompethoki",
  "powersanur999",
  "dompethokiautojp2026",
  "powerputon888",
  "sanur999autojp2026",
  "JUNKRAYA999",
  "JUNKBETON888",
  "beton888autojp2026",
  "sendbeton888",
  "puton888asix",
  "suaka999asix",
  "beton999asix",
]

const missed = OBSERVED_FARM.filter((h) => !scoreHandle(h).blocked)
check(
  `all ${OBSERVED_FARM.length} observed farm handles are refused`,
  missed.length === 0,
  missed.length ? `        got through: ${missed.join(", ")}` : undefined,
)

/**
 * The other half, and the one that matters more.
 *
 * Storelib is a Romanian marketplace and some of the farm's vocabulary is
 * ordinary Romanian: "beton" is concrete and, colloquially, "brilliant";
 * "depozit" is a warehouse. A naive substring blocklist refuses betonarie and
 * casa-betonului on day one, and nobody finds out until a seller gives up.
 *
 * Also pinned here: a bare lucky number, a bare farm affix, and a bare digit
 * sandwich. Each is a signal the scorer uses, and NONE of them may block on its
 * own — that property is the entire safety margin of this design, so it is
 * asserted rather than assumed.
 */
const MUST_PASS = [
  // Ordinary handles
  "andrewrullz",
  "mariapopescu",
  "ana-maria",
  "alexandra88",
  "hokusai",
  "jp-morgan",
  "vipstore",
  // Romanian words that collide with the farm's weak vocabulary
  "betonarie",
  "betonstar",
  "casa-betonului",
  "depozitul-meu",
  // A single weak signal, alone, must never be enough
  "sneakers999",
  "gabi999",
  "powerfit",
  "power999",
  "junk-food",
  "sendcloud",
  "raya-store",
  "slotenmaker",
  "user1234name",
  "jordan23air",
  "air4life",
  "maria2026",
]

const falsePositives = MUST_PASS.filter((h) => scoreHandle(h).blocked)
check(
  `none of the ${MUST_PASS.length} legitimate handles is refused`,
  falsePositives.length === 0,
  falsePositives.length ? `        wrongly refused: ${falsePositives.join(", ")}` : undefined,
)

check(
  "no single signal can block on its own",
  ["sneakers999", "powerfit", "junkyard", "user1234name", "betonarie"].every((h) => scoreHandle(h).score < BLOCK_SCORE),
)

check("the review line sits below the refusal line", REVIEW_SCORE < BLOCK_SCORE)

check(
  "case and separators do not change the verdict",
  scoreHandle("JUNKBETON888").blocked &&
    scoreHandle("junk-beton-888").blocked &&
    scoreHandle("junkbeton888").blocked,
)

check(
  "an empty or tiny handle scores nothing rather than throwing",
  scoreHandle("").score === 0 && scoreHandle(null).score === 0 && scoreHandle("ab").score === 0,
)

/**
 * The cohort signature is what still works after they rename. Two handles from
 * the same generator must reduce to the same skeleton, and a handle that is
 * shaped differently must not.
 */
check(
  "handles from one generated batch share a signature",
  handleSignature("powersanur999") === handleSignature("powerputon888") &&
    handleSignature("puton888asix") === handleSignature("suaka999asix") &&
    handleSignature("puton888asix") !== handleSignature("powersanur999"),
)

check(
  "disposable email domains are caught, including one subdomain deep",
  isDisposableEmail("x@mailinator.com") &&
    isDisposableEmail("x@mail.yopmail.com") &&
    !isDisposableEmail("maria@gmail.com") &&
    !isDisposableEmail("contact@magazinul-meu.ro"),
)

check(
  "a disposable domain adds weight, never refuses on its own, and does not flood the queue",
  (() => {
    // Three points: enough to push an already-suspicious handle over the line,
    // never enough to refuse an ordinary one, and deliberately BELOW the review
    // line — surfacing every temp-mail signup for a human to look at would bury
    // the batch this queue exists to find.
    const clean = scoreSignup({ handle: "mariapopescu", email: "maria@mailinator.com" })
    const suspicious = scoreSignup({ handle: "betonstar", email: "x@mailinator.com" })
    const withTierOne = scoreSignup({ handle: "gacorstore", email: "x@mailinator.com" })
    return (
      clean.score === 3 && !clean.blocked && !clean.review && !suspicious.blocked && withTierOne.blocked
    )
  })(),
)

check(
  "plus-tagged addresses are not penalised",
  scoreSignup({ handle: "mariapopescu", email: "maria+storelib@gmail.com" }).score === 0,
)

/**
 * ---------------------------------------------------------------------------
 * 2. ENFORCEMENT
 * ---------------------------------------------------------------------------
 * isValidUsername is the choke point: the settings forms, the buyer settings,
 * PATCH /api/profile and the availability endpoint all call it. If the gate is
 * not in there, it is not anywhere.
 */
check(
  "isValidUsername refuses farm handles",
  OBSERVED_FARM.every((h) => !isValidUsername(h.toLowerCase()).valid),
)

check(
  "isValidUsername still accepts ordinary handles",
  MUST_PASS.filter((h) => h.length >= 3).every((h) => isValidUsername(h).valid),
)

check(
  "the refusal does not name the token that tripped it",
  (() => {
    // Naming it would hand a spammer a tuning loop: rename, resubmit, read
    // which word to drop. It must read the same as an unavailable handle.
    const err = isValidUsername("powerokebos999").error ?? ""
    return err === "This username is not available" && !/okebos|power|999/i.test(err)
  })(),
)

/**
 * ---------------------------------------------------------------------------
 * 3. CONTAINMENT — the half that removes the incentive
 * ---------------------------------------------------------------------------
 */
check(
  "deservesIndexing requires a published product",
  !deservesIndexing({ publishedProducts: 0, handle: "mariapopescu" }) &&
    deservesIndexing({ publishedProducts: 1, handle: "mariapopescu" }),
)

check(
  "a farm handle is refused indexing even if it publishes something",
  !deservesIndexing({ publishedProducts: 5, handle: "powerokebos999" }),
)

const sitemap = stripComments(read("app/sitemap.ts"))
check(
  "the sitemap gates storefronts on published products",
  sitemap.includes("deservesIndexing") &&
    /status.*published/s.test(sitemap) &&
    // The old unconditional query listed every profile that had a username.
    // That exact shape must not come back.
    !/\.from\("profiles"\)[\s\S]{0,160}\.not\("username", "is", null\)[\s\S]{0,80}\.limit\(5000\)/.test(sitemap),
  "        app/sitemap.ts",
)

const storefront = stripComments(read("app/(marketing)/u/[username]/page.tsx"))
check(
  "the storefront's robots tag follows the same rule",
  storefront.includes("deservesIndexing") &&
    storefront.includes("index: false") &&
    storefront.includes("follow: false") &&
    // The unconditional `robots: { index: true ... }` is what a link farm was
    // buying. It must never be reachable without the indexable check.
    !/robots:\s*\{\s*index:\s*true/.test(storefront),
  "        app/(marketing)/u/[username]/page.tsx",
)

check(
  "structured data is withheld from storefronts that are not indexable",
  (() => {
    // Both JSON-LD render sites — the published-config branch and the default
    // one — must sit behind the gate. One of the two being guarded is the
    // failure mode this catches, because it looks fixed from either end.
    const guarded = storefront.match(/\{indexable && \(/g)?.length ?? 0
    const scripts = storefront.match(/application\/ld\+json/g)?.length ?? 0
    return guarded >= 2 && scripts === 4
  })(),
  "        expected both ld+json pairs behind {indexable && …}",
)

/**
 * The signup form's two bot tells. Both are verified server-side, but the form
 * is what collects them, and a honeypot that is visible or tabbable is worse
 * than none — it blocks real people.
 */
const signup = stripComments(read("app/(auth)/signup/page.tsx"))
check(
  "the signup form carries a honeypot and a fill timer",
  signup.includes('name="website"') &&
    signup.includes("elapsedMs") &&
    signup.includes("/api/auth/signup-guard"),
  "        app/(auth)/signup/page.tsx",
)

check(
  "the honeypot is hidden from people and from assistive technology",
  (() => {
    const i = signup.indexOf('name="website"')
    if (i < 0) return false
    const field = signup.slice(Math.max(0, i - 200), i + 400)
    return (
      field.includes("tabIndex={-1}") &&
      field.includes('aria-hidden="true"') &&
      field.includes('autoComplete="off"') &&
      // Off-screen rather than display:none — the better bots skip the latter.
      field.includes("-9999px")
    )
  })(),
  "        app/(auth)/signup/page.tsx",
)

const guard = stripComments(read("app/api/auth/signup-guard/route.ts"))
check(
  "the guard fails open and never stores a raw IP",
  guard.includes("allow: true") &&
    guard.includes("hashIp") &&
    guard.includes("createHash") &&
    // ip_hash is the only column it writes an address into. A plain `ip:` field
    // would mean storing personal data this never needs.
    !/\bip:\s*clientIp/.test(guard),
  "        app/api/auth/signup-guard/route.ts",
)

/**
 * ---------------------------------------------------------------------------
 * 4. THE CLEAN-UP ROUTE
 * ---------------------------------------------------------------------------
 * The one irreversible thing in this whole feature. Its safety properties are
 * a handful of lines that would be easy to "simplify" away by somebody who
 * did not know what they were for, so they are pinned here.
 */
const purge = stripComments(read("app/api/admin/spam-purge/route.ts"))
check(
  "removal is admin-only and refuses a count that no longer matches",
  purge.includes("isAdminAuthenticated") && purge.includes("confirm_mismatch") && purge.includes("body?.confirm !== candidates.length"),
  "        app/api/admin/spam-purge/route.ts",
)

check(
  "an account that published, messaged, ordered or was cleared is spared",
  purge.includes('spam_state === "clear"') &&
    purge.includes('.eq("status", "published")') &&
    purge.includes('.from("messages")') &&
    purge.includes('.from("orders")'),
  "        app/api/admin/spam-purge/route.ts",
)

check(
  "a failed activity lookup spares rather than removes",
  (() => {
    // Inverting this turns a transient database error into mass deletion of
    // real customers. It is the single most dangerous line in the feature.
    const i = purge.indexOf('.from("orders")')
    if (i < 0) return false
    const region = purge.slice(i, i + 420)
    return region.includes("if (error) {") && region.includes("for (const id of part) spare.add(id)")
  })(),
  "        app/api/admin/spam-purge/route.ts",
)

/**
 * The migration has to survive a database that is missing the optional tables
 * it reads. It did not, the first time it was run:
 *
 *     ERROR: 42P01: relation "public.products" does not exist
 *     LINE 143: from public.products pr
 *
 * A bare `create view` is resolved at parse time, so one missing table aborted
 * the whole file and left the abuse defence half-applied. RUN_EVERYTHING.sql
 * promises the opposite in its own header, and every other section keeps that
 * promise. This is what keeps this one keeping it.
 */
const abuseSql = read("supabase/migrations/20260815_signup_abuse.sql")
check(
  "the migration guards the tables it does not create",
  (() => {
    // Both optional tables must be behind to_regclass, and the view must be
    // built through EXECUTE -- deferring it to a string is what stops the
    // planner resolving the tables when the guard is false.
    const guarded =
      /to_regclass\('public\.products'\) is null/.test(abuseSql) &&
      /to_regclass\('public\.creators'\) is null/.test(abuseSql) &&
      /execute \$view\$/.test(abuseSql)
    // And there must be no bare `create ... view` left at STATEMENT level:
    // that is exactly the shape that aborted the script. The one inside the
    // EXECUTE string is the fix, not the bug, so the deferred block is removed
    // before looking -- otherwise this check can never pass.
    const outsideExecute = abuseSql.replace(/\$view\$[\s\S]*?\$view\$/g, "")
    const bareView = /^\s*create (or replace )?view/im.test(outsideExecute)
    return guarded && !bareView
  })(),
  "        supabase/migrations/20260815_signup_abuse.sql",
)

check(
  "nothing the abuse defence actually needs depends on those tables",
  (() => {
    // The ledger, the prune function and the profiles columns must all sit
    // BEFORE the guarded section, so a database without products still gets the
    // whole working defence. If one of them drifts below the guard it silently
    // stops being applied on exactly the databases that hit this bug.
    const guardAt = abuseSql.indexOf("to_regclass('public.products')")
    const required = [
      "create table if not exists public.signup_attempts",
      "create or replace function public.prune_signup_attempts",
      "add column if not exists spam_score",
      "add column if not exists spam_state",
    ]
    return guardAt > 0 && required.every((frag) => {
      const at = abuseSql.indexOf(frag)
      return at > 0 && at < guardAt
    })
  })(),
  "        supabase/migrations/20260815_signup_abuse.sql",
)

/**
 * ---------------------------------------------------------------------------
 * 5. LANGUAGE
 * ---------------------------------------------------------------------------
 * English is the default again, and the three places that decide it must
 * agree — a mismatch renders one language on the server and hydrates into
 * another, which the reader sees as the page changing language under them.
 */
const provider = stripComments(read("components/locale-provider.tsx"))
const serverLocale = stripComments(read("lib/i18n/server.ts"))
const rootLayout = stripComments(read("app/layout.tsx"))

check(
  "client, server and <html lang> all default to English",
  /DEFAULT_LANGUAGE: SupportedLanguage = "en"/.test(provider) &&
    /DEFAULT_LOCALE: LocaleCode = "en"/.test(serverLocale) &&
    /<html lang="en"/.test(rootLayout),
  "        locale-provider.tsx, lib/i18n/server.ts, app/layout.tsx",
)

check(
  "the picker only offers locales that are actually translated",
  (() => {
    // Listing a locale with a 0.5% dictionary means somebody picks Español and
    // the page does not change. The provider must filter, not just declare.
    const baseline = Object.keys(dictionaries.en).length
    const ready = Object.entries(dictionaries)
      .filter(([, d]) => Object.keys(d).length / baseline >= 0.7)
      .map(([code]) => code)
      .sort()
    return (
      provider.includes("AVAILABLE_LANGUAGES") &&
      provider.includes("languages: AVAILABLE_LANGUAGES") &&
      // Five are translated. The other four (pt-BR, it, nl, pl) are still
      // seven-key stubs and must not appear in the picker until they are done.
      ready.join(",") === "de,en,es,fr,ro"
    )
  })(),
  "        components/locale-provider.tsx",
)

check(
  "every offered locale is a COMPLETE translation, key for key",
  (() => {
    // Coverage by count is not enough: a dictionary could hit 70% while missing
    // the checkout and carrying junk keys that match nothing. This compares the
    // key SETS, so a locale that drifts from English fails here rather than
    // falling through to English in front of a customer mid-purchase.
    const en = new Set(Object.keys(dictionaries.en))
    const problems: string[] = []
    for (const loc of ["es", "fr", "de", "ro"]) {
      const keys = new Set(Object.keys(dictionaries[loc] ?? {}))
      const missing = [...en].filter((k) => !keys.has(k))
      const extra = [...keys].filter((k) => !en.has(k))
      if (missing.length) problems.push(`${loc} missing ${missing.length}: ${missing.slice(0, 5).join(", ")}`)
      if (extra.length) problems.push(`${loc} extra ${extra.length}: ${extra.slice(0, 5).join(", ")}`)
    }
    if (problems.length) console.log("        " + problems.join("\n        "))
    return problems.length === 0
  })(),
  "        lib/i18n/dict/{es,fr,de}.ts vs the English baseline",
)

check(
  "a translated locale actually differs from English",
  (() => {
    // The cheap way to pass the key-set check above is to copy the English
    // file. Brand names and loanwords legitimately match (Nike, SEO, Zoom), so
    // this asks that the OVERWHELMING majority differ rather than all of them.
    const keys = Object.keys(dictionaries.en)
    return ["es", "fr", "de"].every((loc) => {
      const same = keys.filter((k) => dictionaries[loc][k] === dictionaries.en[k]).length
      return same / keys.length < 0.1
    })
  })(),
  "        lib/i18n/dict/{es,fr,de}.ts",
)

check(
  "a visitor whose browser is Romanian still gets Romanian",
  provider.includes("detectBrowserLanguage") && provider.includes("navigator.languages"),
  "        components/locale-provider.tsx",
)

check(
  "the picker is reachable from every account menu",
  (() => {
    // Three menus in the marketplace header and /app sidebar. A row that only
    // exists on desktop is the failure this catches.
    const header = stripComments(read("components/platform/platform-header-client.tsx"))
    const sidebar = stripComments(read("components/app/sidebar.tsx"))
    const headerRows = header.match(/setLanguageOpen\(true\)/g)?.length ?? 0
    const sidebarRows = sidebar.match(/setLanguageOpen\(true\)/g)?.length ?? 0
    return (
      headerRows >= 2 &&
      sidebarRows >= 3 &&
      header.includes("<LanguageModal") &&
      sidebar.includes("<LanguageModal")
    )
  })(),
  "        platform-header-client.tsx (2 menus), sidebar.tsx (3 menus)",
)

check(
  "the modal is controlled, so it outlives the menu that opened it",
  (() => {
    // A self-triggering modal is unmounted by the click that opens it: the
    // menus close on outside-click and the dialog portals to body.
    const modal = stripComments(read("components/platform/language-modal.tsx"))
    return (
      modal.includes("open: boolean") &&
      modal.includes("onOpenChange") &&
      !modal.includes("trigger")
    )
  })(),
  "        components/platform/language-modal.tsx",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
