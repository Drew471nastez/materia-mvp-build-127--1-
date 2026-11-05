/**
 * ===========================================================================
 *  SETTINGS: EVERY CONTROL SAVED WHERE IT IS READ
 * ===========================================================================
 * "Make sure all the things in Privacy actually work." Six switches in
 * Privacy were React state and saved nothing. This suite holds, for each
 * control that is left, the path it is saved by and the thing that reads it
 * back, and holds the removed ones out:
 *
 *   Personalized recommendations  PATCH /api/account/preferences
 *                                 -> profiles.personalized_recommendations
 *                                 -> read by Explore before "For you"
 *   Storelib newsletter           PATCH /api/account/preferences
 *                                 -> storelib_newsletter (service role)
 *                                 -> read back by the settings loader
 *   Analytics on this device      the consent cookie (lib/consent)
 *   Change password               supabase.auth.updateUser, reauthenticate
 *   Email me a reset link         /api/auth/reset-password
 *   Change email                  a code to each address, attempts counted
 *   Sign out / everywhere         scope local / global
 *   Delete account                attempts counted
 *
 * The layout at 390 and 1280, and the switches pressed for real, are
 * measured by scripts/check-account-settings.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { accountErrorKind, accountErrorMessage, passwordProblem } from "../lib/auth/account-errors"
import { MAX_CODE_ATTEMPTS, codeMatches, newCode, wrongCodeMessage } from "../lib/account/codes"
import { readNewsletter, writeNewsletter } from "../lib/account/preferences"

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
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`)
  }
}

/** A stand-in for the service role client, over one table held in memory. */
function fakeAdmin() {
  const rows = new Map<string, { email: string; unsubscribed_at: string | null; source?: string }>()
  const from = (table: string) => {
    if (table !== "storelib_newsletter") throw new Error(`unexpected table ${table}`)
    let op: "select" | "update" | "insert" = "select"
    let patch: Record<string, unknown> = {}
    let email = ""
    const builder: any = {
      select: () => ((op = "select"), builder),
      update: (p: Record<string, unknown>) => ((op = "update"), (patch = p), builder),
      insert: (row: { email: string; source?: string }) => {
        rows.set(row.email, { email: row.email, unsubscribed_at: null, source: row.source })
        return Promise.resolve({ error: null })
      },
      eq: (_col: string, value: string) => {
        email = value
        if (op === "update") {
          const row = rows.get(email)
          if (row) Object.assign(row, patch)
          return Promise.resolve({ error: null })
        }
        return builder
      },
      maybeSingle: () => Promise.resolve({ data: rows.get(email) ?? null, error: null }),
    }
    return builder
  }
  return { from, rows }
}

async function main() {
  console.log("\nErrors are said in plain words, from the code, never Supabase's sentence")
  {
    const cases: Array<[unknown, string]> = [
      [{ code: "weak_password", message: "Password should contain at least one character of each: abc" }, "weak_password"],
      [{ code: "same_password", message: "New password should be different from the old password." }, "same_password"],
      [{ code: "reauthentication_needed", message: "Password update requires reauthentication." }, "reauthentication_needed"],
      [{ code: "reauthentication_not_valid", message: "Verification code is invalid" }, "reauthentication_not_valid"],
      [{ code: "over_email_send_rate_limit", status: 429 }, "rate_limited"],
      [{ code: "email_exists", message: "A user with this email address has already been registered" }, "email_taken"],
      [{ name: "AuthSessionMissingError", message: "Auth session missing!" }, "signed_out"],
      [{ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, "network"],
    ]
    for (const [error, kind] of cases) check(`${kind} is recognised`, accountErrorKind(error) === kind, accountErrorKind(error))
    const words = accountErrorMessage({ code: "weak_password", message: "Password should contain at least one character of each: abc" })
    check("and the words shown are ours, not the SDK's", !/character of each|abc/.test(words), words)
    check("a short password is refused before it is sent", passwordProblem("short1", "short1") === "Use at least 8 characters.")
    check("two different passwords are refused", passwordProblem("longenough1", "longenough2") === "The two passwords do not match.")
    check("a good pair passes", passwordProblem("longenough1", "longenough1") === null)
  }

  console.log("\nCodes cannot be walked through")
  {
    const codes = Array.from({ length: 200 }, () => newCode())
    check("every code is six digits", codes.every((c) => /^\d{6}$/.test(c)), codes.find((c) => !/^\d{6}$/.test(c)))
    check("and they are not all the same", new Set(codes).size > 150)
    check("a right code matches", codeMatches("123456", "123456") && codeMatches("123456", " 123456 "))
    check("a wrong or empty one does not", !codeMatches("123456", "123457") && !codeMatches("123456", "") && !codeMatches(null, "123456"))
    check("five tries at most", MAX_CODE_ATTEMPTS === 5)
    check("it says how many are left", wrongCodeMessage(3) === "That code is not right. 2 tries left." && wrongCodeMessage(4) === "That code is not right. One try left.")
    check("and when there are none", wrongCodeMessage(5) === "Too many wrong codes. Ask for a new one.")

    const security = readCode("lib/security.ts")
    const codesSrc = readCode("lib/account/codes.ts")
    check("codes come from the operating system's random source", /randomInt\(100000, 1000000\)/.test(codesSrc) && /timingSafeEqual/.test(codesSrc))
    check("the account routes no longer use Math.random codes", !/generateVerificationCode/.test(readCode("app/api/auth/change-email/route.ts") + readCode("app/api/auth/delete-account/route.ts")))
    check("(the helper still exists for its other callers)", /export function generateVerificationCode/.test(security))
  }

  console.log("\nThe newsletter switch joins and leaves Storelib's own list")
  {
    const admin = fakeAdmin()
    check("an address not on the list reads as off", (await readNewsletter(admin, "mara@example.com")) === false)
    check("turning it on adds the address", (await writeNewsletter(admin, "Mara@Example.com", true)) && admin.rows.get("mara@example.com")?.source === "settings")
    check("and it reads back on", (await readNewsletter(admin, "mara@example.com")) === true)
    check("turning it off keeps the row with a date", (await writeNewsletter(admin, "mara@example.com", false)) && Boolean(admin.rows.get("mara@example.com")?.unsubscribed_at))
    check("and it reads back off", (await readNewsletter(admin, "mara@example.com")) === false)
    check("on again clears the date", (await writeNewsletter(admin, "mara@example.com", true)) && admin.rows.get("mara@example.com")?.unsubscribed_at === null)
    check("no address is off, not an error", (await readNewsletter(admin, null)) === false)
    {
      /* A database without the table: PostgREST's PGRST205. */
      const missing = { code: "PGRST205", message: "Could not find the table 'public.storelib_newsletter' in the schema cache" }
      const q: any = { select: () => q, eq: () => q, update: () => q, insert: async () => ({ error: missing }), maybeSingle: async () => ({ data: null, error: missing }), then: (r: any) => r({ error: missing }) }
      const bare = { from: () => q }
      let kept: boolean | null = null
      check("no table yet: turning it on is kept on the account, and says it saved", (await writeNewsletter(bare, "mara@example.com", true, async (on) => { kept = on; return true })) === true && kept === true)
      check("  and off the same way", (await writeNewsletter(bare, "mara@example.com", false, async (on) => { kept = on; return true })) === true && kept === false)
      check("  and it reads back what was kept", (await readNewsletter(bare, "mara@example.com", true)) === true && (await readNewsletter(bare, "mara@example.com", false)) === false)
    }
  }

  console.log("\nEach Privacy switch is saved where it is read")
  {
    const route = readCode("app/api/account/preferences/route.ts")
    check("the route asks who is signing in, and a blip is a 503, not a 401", /readCurrentUser/.test(route) && /state === "indeterminate"\) return unavailable\(\)/.test(route))
    check(
      "personalized recommendations: profiles column, on the person's own client",
      /supabase\.from\("profiles"\)\.update\(\{ personalized_recommendations: personalized \}\)\.eq\("id", user\.id\)/.test(route),
    )
    check("newsletter: storelib_newsletter, through the service role", /writeNewsletter\(createAdminClient\(\), user\.email, newsletter, /.test(route))
    /* "That did not save. Try again in a moment." was every save on a database
       without the column or the table (run-now 12 and 01 not run yet). */
    check("with no column or table yet, the choice is kept on the account instead of failing",
      /import \{ missingSchema, readNewsletter, writeNewsletter \} from "@\/lib\/account\/preferences"/.test(route)
        && /if \(missingSchema\(error\)\) \{/.test(route) && /supabase\.auth\.updateUser\(\{ data \}\)/.test(route)
        && /keepOnAccount\(\{ storelib_newsletter: on \}\)/.test(route) && /keepOnAccount\(\{ personalized_recommendations: personalized \}\)/.test(route))
    check("only booleans are taken from the body", /typeof body\.personalizedRecommendations === "boolean"/.test(route) && /typeof body\.newsletter === "boolean"/.test(route))

    /* Changed on purpose (round 49): For you is asked after load from /api/explore/interests (Explore is one HTML for everybody); the same column, the same fallback. */
    const explore = readCode("app/api/explore/interests/route.ts")
    check(
      "Explore reads the column before building For you",
      /select\("personalized_recommendations"\)/.test(explore) && /typeof column === "boolean" \? column : kept !== false/.test(explore) &&
        /if \(!\(await personalizationOn\(user\.id, user\.user_metadata\?\.personalized_recommendations\)\)\) return EMPTY_INTERESTS/.test(explore),
    )

    const loader = readCode("app/(storelib)/app/settings/_server.ts")
    /* Changed on purpose (round T): the page and the sheet over a page both draw app/(storelib)/app/settings/_view.tsx. */
    const page = readCode("app/(storelib)/app/settings/_view.tsx")
    check("the settings loader reads the newsletter back", /readNewsletter\(createAdminClient\(\), user\.email, user\.user_metadata\?\.storelib_newsletter === true\)/.test(loader) && /newsletter,\n/.test(loader))
    check("and the page hands it to the form", /newsletter=\{data\.newsletter\}/.test(page))

    const panels = readCode("components/app/settings/account-panels.tsx")
    check("the switch is a real switch", /role="switch"/.test(panels) && /aria-checked=\{checked\}/.test(panels))
    check("it saves through the preferences route", /fetch\("\/api\/account\/preferences", \{\s*method: "PATCH"/.test(panels))
    check("personalized comes back from the profile", /initialPersonalized=\{\(profile as \{ personalized_recommendations\?: boolean \}\)\.personalized_recommendations !== false\}/.test(readCode("components/app/settings-form-new.tsx")))
    check("analytics is the consent record", /writeConsent\(\{ \.\.\.base, analytics: next/.test(panels) && /onConsentChange/.test(panels))
    check("a failed save goes back", /wanted\.current = saved\.current\s*setValue\(saved\.current\)/.test(panels))

    const form = readCode("components/app/settings-form-new.tsx")
    for (const gone of ["AI-powered features", "Session recording", "Analytics sharing", "Product updates", "Marketing emails", "setAiFeatures", "setSessionRecording", "Coming Soon"]) {
      check(`"${gone}" is gone: nothing saved or read it`, !form.includes(gone) && !panels.includes(gone))
    }
    check("the form draws the panels", /<SecurityPanel\b/.test(form) && /<PrivacyPanel\b/.test(form) && /<EmailChangeFlow\b/.test(form))
  }

  console.log("\nPassword, email and sessions")
  {
    const panels = readCode("components/app/settings/account-panels.tsx")
    check("the password changes on this session", /supabase\.auth\.updateUser\(\s*step === "reauth" \? \{ password, nonce: nonce\.trim\(\) \} : \{ password \}/.test(panels))
    check("and asks for a code when Supabase wants reauthentication", /kind === "reauthentication_needed"/.test(panels) && /supabase\.auth\.reauthenticate\(\)/.test(panels))
    check("errors are shown in our words", /setError\(accountErrorMessage\(updateError\)\)/.test(panels))
    check("the password block is not a form inside Settings' form", !/<form onSubmit=\{change\}/.test(panels) && /role="group"/.test(panels))
    check("the reset link goes through our own route", /fetch\("\/api\/auth\/reset-password"/.test(panels))
    const reset = readCode("app/api/auth/reset-password/route.ts")
    check("whose link opens the reset page, which the app claims as a universal link", /https:\/\/storelib\.com\/reset-password\?code=/.test(reset) && /isHttpsResetPasswordUrl/.test(readCode("lib/native-oauth.ts")))

    const send = readCode("app/api/auth/change-email/route.ts")
    const verify = readCode("app/api/auth/verify-email-change/route.ts")
    check("an email change sends a code to the new address", /to: cleanEmail/.test(send))
    check("and one to the current address", /current_email_code: currentCode/.test(send) && /to: user\.email/.test(send))
    check("a taken address is found in profiles, not the first page of users", /from\("profiles"\)[\s\S]{0,80}\.ilike\("email", cleanEmail\)/.test(send) && !/listUsers/.test(send))
    check("both codes are needed to finish", /codeMatches\(pending\.code, code\) && \(!needsCurrent \|\| codeMatches\(pending\.current_email_code, currentCode\)\)/.test(verify))
    check("wrong codes are counted and the change thrown away after five", /update\(\{ attempts: next \}\)/.test(verify) && /next >= MAX_CODE_ATTEMPTS/.test(verify))
    check("the old address is told once, by the notification engine from the auth.users trigger, with both addresses", /'user\.email_changed'[\s\S]{0,200}'previousEmail', OLD\.email, 'newEmail', NEW\.email/.test(readCode("supabase/sql/run-now/40_notification_engine.sql")) && !/sendEmail\(|user\.email_changed/.test(verify))
    check("a password changed here is told too, after Supabase says yes", /fetch\("\/api\/auth\/password-changed", \{ method: "POST" \}\)/.test(panels))
    check("and the sheet asks for both", /Code sent to/.test(panels) && /double &&/.test(panels))

    const del = readCode("app/api/auth/delete-account/route.ts")
    check("deleting an account counts wrong codes too", /update\(\{ attempts: next \}\)/.test(del) && /codeMatches\(codeRecord\.code/.test(del))

    const form = readCode("components/app/settings-form-new.tsx")
    check("Sign out is this device", /const handleSignOut = async \(\) => \{\s*const supabase = createClient\(\)\s*await supabase\.auth\.signOut\(\{ scope: "local" \}\)/.test(form))
    check("Sign out everywhere is every device", /await supabase\.auth\.signOut\(\{ scope: "global" \}\)/.test(form))
  }

  console.log("\nThe SQL that gives them somewhere to live")
  {
    const migration = readFileSync("supabase/migrations/20260929_account_privacy.sql", "utf8")
    const run = readFileSync("supabase/sql/RUN_ACCOUNT_PRIVACY.sql", "utf8")
    check("the paste-ready file is the migration", migration === run)
    check("profiles.personalized_recommendations, on by default", /add column if not exists personalized_recommendations boolean not null default true/.test(migration))
    check("the second code's column", /email_change_codes\s+add column if not exists current_email_code text/.test(migration))
    check("the attempt counters", /email_change_codes\s+add column if not exists attempts integer not null default 0/.test(migration) && /account_delete_codes\s+add column if not exists attempts integer not null default 0/.test(migration))
    check("the probe that measures the page is on disk", readCode("scripts/check-account-settings.mjs").length > 0)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
