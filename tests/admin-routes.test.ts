/**
 * ===========================================================================
 *  EVERY ADMIN ROUTE ASKS WHO IS CALLING BEFORE IT DOES ANYTHING
 * ===========================================================================
 * The admin can refund an order, ban a creator, delete an account. Every one
 * of those lives under app/api/admin, and every file there has to check the
 * caller on the server before it touches the database: the page hiding a
 * button is not a lock, because the route is reachable with curl.
 *
 * This reads every route file and every exported handler in it, and checks
 * that the handler's first awaited step is the admin check (the signed
 * cookie, through isAdminAuthenticated or requireAdmin) or, for the two
 * routes a script calls, the ADMIN_SECRET bearer check. The login route is
 * the one that issues the cookie, so it is the only exception, and it is
 * checked for the owner's credential decision staying as it is.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

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

function walk(dir: string, name: RegExp, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, name, out)
    else if (name.test(e)) out.push(p)
  }
  return out
}

function body(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return src.slice(open + 1)
}

const LOGIN = "app/api/admin/blog/auth/route.ts"
const SECRET_ROUTES = new Set(["app/api/admin/delete-user/route.ts", "app/api/admin/setup-test-user/route.ts"])
const COOKIE_GATE = /await isAdminAuthenticated\(\)|await requireAdmin\(\)/
const SECRET_GATE = /requireBearerSecret\(\s*\w+\s*,\s*"ADMIN_SECRET"\s*\)/

const routes = walk("app/api/admin", /^route\.ts$/)

console.log("\nEvery handler checks the caller first\n")
check("the routes are there to check", routes.length >= 15, `${routes.length} route files`)

for (const file of routes) {
  if (file === LOGIN) continue
  const src = stripComments(readFileSync(file, "utf8"))
  const handlers = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)[^{]*\{/g)]
  if (handlers.length === 0) {
    check(`${file} exports a handler`, false)
    continue
  }
  for (const h of handlers) {
    const text = body(src, h.index! + h[0].length - 1)
    const gate = SECRET_ROUTES.has(file) ? SECRET_GATE : COOKIE_GATE
    const gateAt = text.search(gate)
    /* The first thing that waits on anything, or touches the database, or reads the request. */
    const firstWork = (() => {
      const awaits = [...text.matchAll(/\bawait\b|createAdminClient\(|new Reader\(|\.json\(\)|\.formData\(\)/g)]
        .map((m) => m.index!)
        .filter((i) => !(gateAt >= 0 && i >= gateAt && i < gateAt + 40))
      return awaits.length ? Math.min(...awaits) : Infinity
    })()
    check(
      `${file} ${h[1]} checks ${SECRET_ROUTES.has(file) ? "the ADMIN_SECRET" : "the admin session"} before anything else`,
      gateAt >= 0 && gateAt < firstWork,
      gateAt < 0 ? "no gate call in this handler" : `gate at ${gateAt}, first work at ${firstWork}`,
    )
    /* And a refused caller is answered, not waved through. */
    check(
      `${file} ${h[1]} returns when refused`,
      /if \(!\(await isAdminAuthenticated\(\)\)\)\s*\{?\s*(return|redirect)/.test(text) ||
        /const (denied|authed) = await (requireAdmin|isAdminAuthenticated)\(\)\s*\n\s*if \((denied|!authed)\) return/.test(text) ||
        /const denied = requireBearerSecret\([^)]*\)\s*\n\s*if \(denied\) return denied/.test(text),
    )
  }
}

console.log("\nThe routes that must stay, stay as they are\n")
{
  const login = readFileSync(LOGIN, "utf8")
  check("the login route is still there", existsSync(LOGIN))
  check(
    "with the owner's credential decision written down and untouched",
    /THE CREDENTIAL IS WRITTEN HERE, AND THE OWNER ASKED FOR IT TWICE/.test(login) &&
      /process\.env\.BLOG_ADMIN_USER \|\| "Storelib"/.test(login) &&
      /process\.env\.BLOG_ADMIN_PASSWORD \|\| "/.test(login),
  )
  check("setup-test-user is kept, behind the secret", existsSync("app/api/admin/setup-test-user/route.ts"))
}

console.log("\nEvery admin page checks on the server\n")
{
  const pages = walk("app/admin", /^page\.tsx$/)
  check("the pages are there to check", pages.length >= 6, `${pages.length} pages`)
  /* Changed on purpose: 171abff5 (Payments Operations Center) gates /admin/payments once, in its server layout, and its pages are client pages that read through the gated /api/admin/payments routes. So a page counts as asking when it asks itself or a server layout above it under app/admin refuses everyone but a signed in admin. */
  const serverGate = (src: string) => !/^\s*["']use client["']/.test(src) && /await isAdminAuthenticated\(\)/.test(src)
  const gatedByLayout = (file: string) => {
    for (let dir = join(file, ".."); dir.startsWith("app/admin"); dir = join(dir, "..")) {
      const layout = join(dir, "layout.tsx")
      if (!existsSync(layout)) continue
      const src = stripComments(readFileSync(layout, "utf8"))
      if (serverGate(src) && /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin/.test(src)) return true
    }
    return false
  }
  for (const file of pages) {
    const src = stripComments(readFileSync(file, "utf8"))
    check(`${file} asks for the admin session on the server`, serverGate(src) || gatedByLayout(file))
  }
  const console_ = stripComments(readFileSync("app/admin/page.tsx", "utf8"))
  check(
    "the console is rendered only for a signed in admin, and the login otherwise",
    /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin/.test(console_) || /authed \? <AdminConsole/.test(console_),
  )
}

console.log("\nDestructive actions confirm, record, and do not echo the database\n")
{
  const refund = stripComments(readFileSync("app/api/admin/orders/refund/route.ts", "utf8"))
  check("a refund needs the amount echoed back", /planRefund\(order, body\.confirm\)/.test(refund))
  check("a refund reverses the seller's transfer, as the creator's does", /reverse_transfer: true/.test(refund))
  check("a refund uses the creator route's idempotency key", /idempotencyKey: plan\.idempotencyKey/.test(refund))
  check("a refund is recorded", /recordAdminAction\(admin, \{\s*action: "refund"/.test(refund))

  const product = stripComments(readFileSync("app/api/admin/products/moderate/route.ts", "utf8"))
  check("unpublishing needs the dialog's confirmation", /body\.confirm !== productId/.test(product))
  check("and changes a product only from the state it was read in", /\.eq\("id", productId\)\.eq\("status", from\)/.test(product))
  check("and is recorded", /recordAdminAction\(/.test(product))

  const moderate = stripComments(readFileSync("app/api/admin/creators/moderate/route.ts", "utf8"))
  check("a ban is recorded in the audit trail too", /recordAdminAction\(admin,/.test(moderate))

  /* No route hands the database's own message to the browser. */
  const leaks: string[] = []
  for (const file of routes) {
    const src = stripComments(readFileSync(file, "utf8"))
    for (const m of src.matchAll(/NextResponse\.json\(\s*\{[^}]*\b(error|details|message)\s*:\s*[^,}]*\b(error|err|e|thrown|\w+Error)\.message\b/g)) leaks.push(`${file}: ${m[0].slice(0, 80)}`)
  }
  check("no route answers with a raw error message", leaks.length === 0, leaks.join("\n        "))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
