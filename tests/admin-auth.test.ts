/**
 * ===========================================================================
 *  THE GATE ON THE ADMIN
 * ===========================================================================
 * One cookie opens /admin/blog, which writes and deletes posts on
 * storelib.com, and /api/admin/spam-purge, which deletes user accounts.
 *
 * It was a constant in this repository, issued by a username and password
 * that were also constants in this repository. Anybody who could read the
 * code could set the cookie by hand and skip the login, and nothing could be
 * revoked without a deploy.
 *
 * This suite runs the real token functions rather than reading them, because
 * "it is signed" is a claim a regex cannot check.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { issueSessionToken, verifySessionToken, SESSION_MAX_AGE } from "@/lib/admin-session"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/**
 * The CODE, without the comments. Both files explain the bug they fix by
 * quoting the constants that were there, and a regex cannot tell a warning
 * from the thing it warns about.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const auth = stripComments(read("lib/admin-session.ts"))
const route = stripComments(read("app/api/admin/blog/auth/route.ts"))

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Nothing that opens the admin is written in the repository")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * The shape of the old bug: a string literal that IS the answer. A
     * comparison against a constant, a password, or a token spelled out in
     * the file. The comment in the file quotes the old name to explain
     * itself, so this looks for an assignment, not a mention.
     */
    check("no session token is assigned a literal", !/SESSION_TOKEN\s*=\s*"/.test(auth))
    /**
     * "no password is assigned a literal" USED TO BE HERE, and it is gone on
     * the repository owner's explicit, repeated instruction: the username and
     * the password are written in the route, no environment variable needed.
     * An intermediate version stored a scrypt digest, which behaves
     * identically from the outside, and that was declined too.
     *
     * The check is not weakened quietly — it is removed and the reason is
     * written down, because a test that fails for a decision somebody made on
     * purpose gets deleted by the next person without the reason surviving.
     *
     * What is still checked is the part that is not a matter of taste: the
     * environment still overrides both, so the owner can move the credential
     * out of the file with one variable and no deploy.
     */
    check("the sign-in name can come from the environment", /process\.env\.BLOG_ADMIN_USER/.test(route))
    check("and so can the password", /process\.env\.BLOG_ADMIN_PASSWORD/.test(route))
    check(
      "the environment wins over what is written in the file",
      /process\.env\.BLOG_ADMIN_USER \|\| "/.test(route) && /process\.env\.BLOG_ADMIN_PASSWORD \|\| "/.test(route),
      "otherwise the only way to rotate the credential is a deploy",
    )
    /**
     * The token is the half that must never be a constant whatever the
     * credential is. A password in the file lets somebody with the repository
     * SIGN IN; a session token in the file lets them skip the login entirely
     * and cannot be revoked without a deploy.
     */
    check("the session token is still signed and dated, not a string", /createHmac/.test(auth) && /v2\./.test(auth))
    /**
     * The cost of the credential living in the file is recorded in the route
     * itself, in a comment addressed to whoever comes to "fix" it. That
     * comment is the only thing standing between this decision and somebody
     * reverting it and locking the owner out, so it is checked like anything
     * else that matters.
     */
    check(
      "the trade is written down where somebody would undo it",
      /THE CREDENTIAL IS WRITTEN HERE, AND THE OWNER ASKED FOR IT TWICE/.test(
        read("app/api/admin/blog/auth/route.ts"),
      ),
      "an undocumented decision is one the next person deletes",
    )
    check("the answer never says which half was wrong", (route.match(/Invalid credentials/g) ?? []).length === 1)
    check("both halves are compared in constant time", /timingSafeEqual/.test(route) && /sameSecret\(username/.test(route) && /sameSecret\(password/.test(route))
    check(
      "the cookie cannot be read by script, sent cross-site, or sent in the clear",
      /httpOnly: true/.test(route) && /sameSite: "strict"/.test(route) && /secure: process\.env\.NODE_ENV === "production"/.test(route),
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A token is signed, dated, and cannot be guessed")
  // ═══════════════════════════════════════════════════════════════════════
  {
    // The key the token is signed with, for this process only.
    process.env.BLOG_ADMIN_SECRET = "a-test-signing-key-long-enough-to-count"

    const token = issueSessionToken()
    check("a token is issued", typeof token === "string" && token!.startsWith("v2."))
    check("and it verifies", verifySessionToken(token))

    check("a made up one does not", !verifySessionToken("v2.abc.def.0123456789abcdef"))
    check("nor the old constant", !verifySessionToken("slblog_4f8e2a1b9c3d7e6f0a5b2c8d4e1f9a3b_v1"))
    check("nor an empty cookie", !verifySessionToken("") && !verifySessionToken(undefined))
    check("nor one with the signature removed", !verifySessionToken(token!.split(".").slice(0, 3).join(".")))

    // Two tokens issued in the same millisecond still differ, so the value is
    // not a function of the clock alone.
    check("two tokens are never the same string", issueSessionToken() !== issueSessionToken())

    const [, issued, nonce, sig] = token!.split(".")
    check("a token carries when it was issued", Number.isFinite(Number.parseInt(issued, 36)))
    check("the signature is a sha256, not a truncation of one", sig.length === 64)
    check(
      "changing the nonce breaks the signature",
      !verifySessionToken(`v2.${issued}.${nonce.replace(/.$/, (c) => (c === "a" ? "b" : "a"))}.${sig}`),
    )
    check(
      "and so does changing the date, which is what stops one being extended",
      !verifySessionToken(`v2.${(Date.now() + 5000).toString(36)}.${nonce}.${sig}`),
    )

    const old = Date.now() - (SESSION_MAX_AGE + 60) * 1000
    check("an expired token is refused even with a good signature", (() => {
      // Signed properly, for a month and a minute ago.
      const t = issueSessionToken()!
      const parts = t.split(".")
      return !verifySessionToken(`v2.${old.toString(36)}.${parts[2]}.${parts[3]}`)
    })())

    // A different key must not verify what the first one signed.
    process.env.BLOG_ADMIN_SECRET = "a-different-signing-key-long-enough-x"
    check("rotating the key signs everybody out", !verifySessionToken(token))

    delete process.env.BLOG_ADMIN_SECRET
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Everything behind the gate uses the gate")
  // ═══════════════════════════════════════════════════════════════════════
  {
    for (const f of [
      "app/(storelib)/admin/blog/page.tsx",
      "app/(storelib)/admin/blog/dashboard/page.tsx",
      "app/(storelib)/admin/blog/seo/page.tsx",
      "app/(storelib)/admin/blog/posts/new/page.tsx",
      "app/(storelib)/admin/blog/posts/[id]/page.tsx",
      "app/api/admin/blog/posts/route.ts",
      "app/api/admin/blog/posts/[id]/route.ts",
      "app/api/admin/spam-purge/route.ts",
    ]) {
      check(`${f} asks`, /isAdminAuthenticated\(\)/.test(read(f)))
    }
    check(
      "and the one that can delete accounts asks on every method it answers",
      (() => {
        const purge = read("app/api/admin/spam-purge/route.ts")
        const handlers = (purge.match(/export async function (GET|POST|DELETE|PUT|PATCH)/g) ?? []).length
        const gates = (purge.match(/if \(!\(await isAdminAuthenticated\(\)\)\)/g) ?? []).length
        return handlers > 0 && gates >= handlers
      })(),
    )
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
