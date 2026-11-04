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
  trustsOutboundLinks,
  isDisposableEmail,
  BLOCK_SCORE,
  REVIEW_SCORE,
} from "../lib/security/spam-signals"
import { isValidUsername } from "../lib/reserved-words"
import { creatorIndexable } from "../lib/seo/indexing"
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
/** Comment lines out, so an assertion matches code and not the prose beside it. */
const strip = (src: string) => src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")

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
/* Changed on purpose (round 41, tests/indexing-r41.test.ts): publishing no longer gates the index, it gates the
   links' authority (trustsOutboundLinks); the handle score and an operator's verdict still gate the index. */
check(
  "deservesIndexing judges the handle and the verdict, and trust in links needs a published product",
  deservesIndexing({ handle: "mariapopescu" }) &&
    !deservesIndexing({ handle: "mariapopescu", spamState: "confirmed" }) &&
    !trustsOutboundLinks({ publishedProducts: 0 }) &&
    trustsOutboundLinks({ publishedProducts: 1 }),
)

check(
  "a farm handle is refused indexing even if it publishes something",
  !deservesIndexing({ handle: "powerokebos999" }) && !creatorIndexable({ publishedProducts: 5, handle: "powerokebos999" }),
)

/* The sitemap readers and the rules they apply (the index moved out of
   app/sitemap.ts when it grew into chunks). */
const sitemap = stripComments(read("lib/seo/sitemaps.ts") + read("lib/seo/indexing.ts"))
check(
  "the sitemap gates storefronts on published products",
  sitemap.includes("deservesIndexing") &&
    /status.*published/s.test(sitemap) &&
    // The old unconditional query listed every profile that had a username.
    // That exact shape must not come back.
    !/\.from\("profiles"\)[\s\S]{0,160}\.not\("username", "is", null\)[\s\S]{0,80}\.limit\(5000\)/.test(sitemap),
  "        lib/seo/sitemaps.ts, lib/seo/indexing.ts",
)

const storefront = stripComments(read("app/(marketing)/u/[username]/page.tsx"))
check(
  "the storefront's robots tag follows the same rule",
  /* Changed on purpose (round 41): the storefront reads creatorIndexable, which reads deservesIndexing. */
  storefront.includes("creatorIndexable") &&
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
    (purge.includes('.eq("status", "published")') || purge.includes('p.status === "published"')) &&
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
    /* Changed on purpose (round 45 leftovers): the layout prints STORELIB_PAGE_LANG, which a product's JSON-LD reads too (lib/seo/page-language.ts). */
    /<html lang=\{STORELIB_PAGE_LANG\}/.test(rootLayout) &&
    /export const STORELIB_PAGE_LANG = "en"/.test(read("lib/seo/page-language.ts")),
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
    /**
     * DERIVED, NOT COUNTED BY HAND.
     *
     * This used to require ">= 3 rows in the sidebar", a number written against
     * a sidebar that has since been replaced. It happened to still be right and
     * it caught a real miss -- but a hardcoded floor cannot see a FOURTH menu
     * added without a language row, which is the same bug one menu later.
     *
     * An account menu is one that offers a way out, so every Sign out is a menu
     * and every menu must also offer the language. Equality, not a floor.
     */
    const header = stripComments(read("components/platform/platform-header-client.tsx"))
    const sidebar = stripComments(read("components/app/sidebar.tsx"))
    const count = (src: string, re: RegExp) => src.match(re)?.length ?? 0
    const pairs: [string, string, number, number][] = [
      [
        "platform-header-client.tsx",
        "header",
        count(header, /handleLogout\b/g) - 1, // minus its own declaration
        count(header, /setLanguageOpen\(true\)/g),
      ],
      [
        "sidebar.tsx",
        "sidebar",
        count(sidebar, /handleSignOut\(\)/g),
        count(sidebar, /setLanguageOpen\(true\)/g),
      ],
    ]
    const problems = pairs
      .filter(([, , menus, rows]) => menus < 1 || rows < menus)
      .map(([f, , menus, rows]) => `${f}: ${menus} account menus but ${rows} language rows`)
    if (problems.length) console.log("        " + problems.join("\n        "))
    return (
      problems.length === 0 &&
      header.includes("<LanguageModal") &&
      /* /app opens its own list of the dashboard's languages (components/app/language-picker). */
      sidebar.includes("<AppLanguageModal")
    )
  })(),
  "        every Sign out row must be matched by a language row",
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

check(
  "the picker offers a language and not a currency",
  (() => {
    /**
     * Salvaged from tests/checkout-pricing.test.ts, which was deleted with the
     * marketplace pricing it guarded.
     *
     * The property is worth keeping on its own: a six-currency switcher once
     * relabelled every price against a static rate table while the card was
     * charged in one currency regardless, so a shopper who chose GBP read
     * pounds everywhere and got a lei charge. A control that moves the label
     * and not the money is worse than no control. Whatever modal the account
     * menus open must not offer one.
     */
    const modal = read("components/platform/language-modal.tsx")
    return !/setCurrency/.test(modal) && !/currencies\.map/.test(modal)
  })(),
  "        components/platform/language-modal.tsx",
)

// ===========================================================================
console.log("\nBulk moderation: ban is reversible, delete is not, and they differ\n")
// ===========================================================================

/**
 * Offering a ban and a delete as one button with a different adjective is how
 * the wrong one gets pressed. A ban is a judgement — reviewable, reversible,
 * and it keeps the evidence. Delete cascades into auth.users and cannot be
 * undone by anyone, including whoever asked for it.
 */

const moderate = read("app/api/admin/creators/moderate/route.ts")

check(
  "moderation is behind the admin session, on both verbs",
  (() => {
    const guards = moderate.match(/if \(!\(await isAdminAuthenticated\(\)\)\)/g) ?? []
    return guards.length >= 2 && /export async function GET/.test(moderate) && /export async function POST/.test(moderate)
  })(),
)

check(
  "the dry run changes nothing",
  (() => {
    const get = moderate.slice(moderate.indexOf("export async function GET"), moderate.indexOf("export async function POST"))
    /**
     * GET is the default verb and has to stay incapable of acting — an
     * operator reads the whole batch before agreeing to any of it.
     */
    return !/\.update\(|\.delete\(|\.insert\(|deleteAllUserData|deleteAccount\(/.test(get)
  })(),
)

check(
  "acting requires the count to be echoed back",
  (() => {
    /**
     * Not a checkbox: a number read off the dry run and typed back. If the set
     * moved between reviewing and confirming, the numbers disagree and the
     * request is refused rather than performed on a different set.
     */
    return /body\.confirm !== ids\.length/.test(moderate) && /Send confirm: \$\{ids\.length\}/.test(moderate)
  })(),
)

check(
  "deleting an account with orders is refused unless forced",
  (() => {
    /**
     * An account with orders is a paying relationship — somebody's receipts,
     * somebody's downloads, and in most places somebody's tax records.
     * Deleting takes those with it, so it is a second decision rather than a
     * consequence of the first.
     */
    return (
      /action === "delete" && !body\.force/.test(moderate) &&
      /status: 409/.test(moderate) &&
      /Ban them instead/.test(moderate)
    )
  })(),
)

check(
  "a ban takes the products down with the storefront",
  (() => {
    /**
     * A ban that closes the storefront but leaves the products reachable from
     * search and from every link already posted is not a ban.
     */
    return (
      /banned_at: new Date\(\)\.toISOString\(\)/.test(moderate) &&
      /store_published: false/.test(moderate) &&
      /\.update\(\{ status: "unpublished" \}\)/.test(moderate)
    )
  })(),
)

check(
  "an unban does not republish anything",
  (() => {
    const unban = moderate.slice(moderate.indexOf('action === "unban"'), moderate.indexOf("} else {", moderate.indexOf('action === "unban"')))
    /**
     * Which products should come back is the creator's decision. Guessing
     * would put something live that they may have taken down themselves before
     * any of this happened.
     */
    return /banned_at: null/.test(unban) && !/status: "published"/.test(unban)
  })(),
)

check(
  "what was destroyed outlives the destruction",
  (() => {
    /**
     * A delete cascades into auth.users and leaves nothing behind, so the one
     * thing that must survive is the record that it happened. Without it,
     * "where did that account go" has no answer at all.
     */
    const sql = read("sql/20260919_creator_bans.sql")
    return (
      /admin_moderation_log/.test(moderate) &&
      /create table if not exists public\.admin_moderation_log/.test(sql) &&
      /enable row level security/.test(sql) &&
      // no policy: an audit log a user can read tells them they were reported
      !/create policy/.test(sql)
    )
  })(),
)

check(
  "a batch is bounded",
  (() => {
    /**
     * Five hundred now that a DATE RANGE can select the set — a window is one
     * decision that can name four hundred accounts, and the bound is what
     * stops a mistyped year acting on the whole platform.
     */
    return /ids\.length > 500/.test(moderate) && /Narrow it/.test(moderate)
  })(),
)

check(
  "a date range is resolved on the server, twice",
  (() => {
    /**
     * The window is sent, never the ids it resolved to. The server resolves it
     * again when acting, so a range that gained a member since the preview
     * produces a different count and the echo refuses it. Trusting the client's
     * list would let a stale page act on a set nobody reviewed.
     */
    const client = read("app/admin/blog/seo/_seo-client.tsx")
    return (
      /async function resolve\(selection: Selection\)/.test(moderate) &&
      (moderate.match(/await resolve\(/g) ?? []).length >= 2 &&
      /from: rangeFrom \|\| undefined, to: rangeTo \|\| undefined/.test(client)
    )
  })(),
)

check(
  "every write in the ban path is checked, because postgrest does not throw",
  (() => {
    /**
     * `await admin.from(...).update(...)` resolves to `{ error }`. Nothing
     * throws. So a refused write and a successful one look identical, and the
     * loop's try/catch — which is what puts a creator in `failed` — never
     * sees it.
     *
     * This was live: `products.status` allowed only ('draft', 'published'),
     * so writing "unpublished" was a 23514, swallowed, and the ban reported
     * success with every product still published and buyable. Storefront
     * closed, shelves full.
     *
     * The bare-write pattern must not come back, so this counts: the ban
     * branch may contain no `await admin.from(...)` that is not wrapped.
     */
    const at = moderate.indexOf('if (action === "ban") {')
    const branch = strip(moderate.slice(at, moderate.indexOf("} else {", at)))
    const bare = (branch.match(/await\s+admin\s*\n?\s*\.from\(/g) ?? []).length
    return (
      /async function must</.test(moderate) &&
      /if \(error\) \{?[\s\S]{0,120}throw new Error/.test(moderate) &&
      /await must\(/.test(branch) &&
      bare === 0
    )
  })(),
)

check(
  "and the status a ban writes is one the products table accepts",
  (() => {
    /**
     * The other half. Checking the error turns a silent failure into a visible
     * one; it does not make the ban work. `products` was created with
     * CHECK (status IN ('draft', 'published')) and nothing widened it, while
     * `sites` and `theme_installs` had allowed 'unpublished' all along — the
     * vocabulary existed everywhere except the table a ban writes to.
     *
     * Asserted against the migration rather than against a live database,
     * which the tests do not have: the value the route writes must appear in
     * the constraint the migration installs.
     */
    const migration = read("sql/20260919_creator_bans.sql")
    const written = moderate.match(/\.update\(\{ status: "([a-z]+)" \}\)/)?.[1]
    const constraint = migration.match(/check \(status in \(([^)]*)\)\)/)?.[1] ?? ""
    return (
      written !== undefined &&
      /alter table public\.products/.test(migration) &&
      constraint.includes(`'${written}'`)
    )
  })(),
)

check(
  "the admin UI selects by id, not by username",
  (() => {
    const client = read("app/admin/blog/seo/_seo-client.tsx")
    /**
     * A username can be changed. An action that resolves by name would act on
     * whoever holds it when the request lands, rather than on whoever was
     * reviewed.
     */
    return (
      /const \[selected, setSelected\] = useState<Set<string>>/.test(client) &&
      /next\.add\(creator\.id\)/.test(client) &&
      /creatorIds: ids/.test(client)
    )
  })(),
)

check(
  "and it asks before it acts, naming what happens",
  (() => {
    const client = read("app/admin/blog/seo/_seo-client.tsx")
    return (
      /window\.confirm\(/.test(client) &&
      /cannot be undone/.test(client) &&
      /confirm: plan\.count/.test(client)
    )
  })(),
)

console.log("\nThe guard that cannot be skipped\n")

const hook = read("app/api/auth/hooks/before-user-created/route.ts")

check(
  "the page guard was only ever enforced by the page",
  (() => {
    const page = read("app/(auth)/signup/page.tsx")
    /**
     * The browser asks signup-guard, and if the answer is no the BROWSER
     * stops — then it calls supabase.auth.signUp() directly. A script that
     * never loads the page never asks and is never refused, which made every
     * lexicon and velocity limit decoration against an actual bot.
     *
     * This assertion documents the hole rather than guarding it: the fix is
     * the hook below, and the page keeps its client check because a fast
     * refusal is better UX for a real person who typed the wrong thing.
     */
    return /signup-guard/.test(page) && /supabase\.auth\.signUp/.test(page)
  })(),
)

check(
  "the hook refuses anything it cannot verify",
  (() => {
    /**
     * The opposite of the page guard, on purpose. There, a broken fetch must
     * not stop a real person: a false refusal costs a customer and a miss
     * costs one spam account. Here, an unverifiable request is one that did not
     * come from Supabase, and the only thing that produces is somebody probing
     * the endpoint.
     */
    return (
      /if \(!verified\(request, raw\)\)/.test(hook) &&
      /status: 401/.test(hook) &&
      /if \(!secret\) return false/.test(hook)
    )
  })(),
)

check(
  "the signature is compared in constant time, over id.timestamp.payload",
  (() => {
    /**
     * Reading the whole file was not enough: `timingSafeEqual` appears in the
     * import line, so swapping the comparison for `value === expected` left
     * this test green. The body of `verified` is what has to be looked at, and
     * it must hold no plain equality against the computed signature — an early
     * exit on the first differing byte is a timing oracle that recovers the
     * signature one character at a time.
     */
    const at = hook.indexOf("function verified(")
    const body = strip(hook.slice(at, hook.indexOf("\n}", at)))
    return (
      /timingSafeEqual\(/.test(body) &&
      !/===\s*expected|expected\s*===/.test(body) &&
      /\$\{id\}\.\$\{timestamp\}\.\$\{raw\}/.test(body)
    )
  })(),
)

check(
  "and a captured request expires",
  (() => {
    /**
     * Without a window a captured request works forever, which turns one
     * intercepted signup into an unlimited supply of them.
     */
    return /age > 300/.test(hook)
  })(),
)

check(
  "it applies the same judgement the page guard does",
  (() => /isDisposableEmail\(email\)/.test(hook) && /scoreSignup\(\{ email, handle \}\)/.test(hook))(),
)

check(
  "velocity is counted by email domain, because the IP here is Supabase's",
  (() => {
    /**
     * The page guard counts by IP hash and can — it sees the request. This
     * request is Supabase's, so its address says nothing about who is signing
     * up. What is left is the domain they used.
     */
    return /\.eq\("email_domain", domain\)/.test(hook) && !/hashIp/.test(hook)
  })(),
)

check(
  "it writes only columns signup_attempts actually has",
  (() => {
    /**
     * An invented column fails inside the catch that wraps this, so every row
     * would have been silently missing — the evidence gone and nothing to say
     * so. `source` was invented and removed.
     */
    const guard = read("app/api/auth/signup-guard/route.ts")
    const columnsOf = (src: string) => {
      const at = src.indexOf('from("signup_attempts").insert({')
      return new Set(
        [...src.slice(at, src.indexOf("})", at)).matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]),
      )
    }
    const known = columnsOf(guard)
    return [...columnsOf(hook)].every((column) => known.has(column))
  })(),
)

check(
  "and a logging failure never refuses a signup",
  (() => {
    const at = hook.indexOf("async function record")
    return /try \{/.test(hook.slice(at)) && /\} catch \{/.test(hook.slice(at))
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
