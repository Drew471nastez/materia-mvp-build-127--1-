/**
 * ===========================================================================
 *  LOG LINES CARRY NO FULL ADDRESS, TOKEN, COOKIE OR REQUEST BODY
 * ===========================================================================
 * Round rel2-security2 (SEC-11). Server logs are read by more people, kept
 * longer and copied to more places than the tables they describe. An address
 * goes through lib/privacy/mask-email ("ja***@gmail.com"); a session token, a
 * cookie or a whole request body never goes at all.
 *
 * This reads every console call under app/, lib/ and proxy.ts and refuses the
 * obvious shapes: a variable holding an address passed or interpolated as is,
 * a token or cookie value, a parsed request body. It is a grep, so it is a
 * floor, not a proof; the lines fixed in this round are also named below.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"
import { maskEmail } from "@/lib/privacy/mask-email"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 600)}`}`)
  }
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (f === "node_modules" || f.startsWith(".")) return []
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

/* Each console call's argument text, up to its closing parenthesis on balanced counting. */
function consoleCalls(code: string): string[] {
  const out: string[] = []
  const re = /console\.(log|info|warn|error|debug)\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    let depth = 1
    let i = m.index + m[0].length
    for (; i < code.length && depth > 0; i++) {
      const c = code[i]
      if (c === "(") depth++
      else if (c === ")") depth--
    }
    out.push(code.slice(m.index + m[0].length, i - 1))
  }
  return out
}

/* An address passed as is: as an argument, or interpolated into a template. Wrapped in maskEmail()/masked() is fine. */
const ADDRESS_NAMES = String.raw`(?:email|normalizedEmail|cleanEmail|buyerEmail|customerEmail|subscriberEmail|recipientEmail|toEmail|trimmedEmail|user\??\.email|\.buyer_email|\.customer_email|\.subscriber_email)`
const RAW_ADDRESS_ARG = new RegExp(String.raw`(?:^|[,{])\s*(?:\w+\s*:\s*)?[\w.?]*?${ADDRESS_NAMES}\s*(?:\?\?[^,]*)?\s*(?:[,}]|$)`)
const RAW_ADDRESS_TEMPLATE = new RegExp(String.raw`\$\{\s*[\w.?]*?${ADDRESS_NAMES}\s*(?:\?\?[^}]*)?\}`)
/* A session secret or a cookie as a value (a mention in the message text is fine). */
const SECRET_VALUE = /(?:^|,)\s*(?:accessToken|refreshToken|access_token|refresh_token|session\??\.access_token|session\??\.refresh_token|cookieHeader|req(?:uest)?\.headers\.get\(["']cookie["']\)|cookies\(\))\s*(?:,|$)|\$\{\s*(?:accessToken|refreshToken|access_token|refresh_token)\s*\}/
/* A whole request body. */
const BODY_VALUE = /(?:^|,)\s*(?:await\s+(?:req|request)\.(?:json|text|formData)\(\)|JSON\.stringify\(\s*(?:body|rawBody|payload)\s*\))\s*(?:,|$)/

function main() {
  check("maskEmail keeps two letters and the domain", maskEmail("jane.doe@example.com") === "ja***@example.com")

  const found: Record<string, string[]> = { address: [], secret: [], body: [] }
  const roots = ["app", "lib"]
  const list = [...roots.flatMap(files), "proxy.ts"]
  for (const f of list) {
    for (const args of consoleCalls(readCode(f))) {
      const plain = args.replace(/maskEmail\([^)]*\)|masked\([^)]*\)/g, "MASKED")
      if (RAW_ADDRESS_ARG.test(plain) || RAW_ADDRESS_TEMPLATE.test(plain)) found.address.push(`${f}: ${args.slice(0, 120)}`)
      if (SECRET_VALUE.test(plain)) found.secret.push(`${f}: ${args.slice(0, 120)}`)
      if (BODY_VALUE.test(plain)) found.body.push(`${f}: ${args.slice(0, 120)}`)
    }
  }
  check("no console call logs a full email address", found.address.length === 0, found.address)
  check("no console call logs a session token or a cookie", found.secret.length === 0, found.secret)
  check("no console call logs a whole request body", found.body.length === 0, found.body)

  console.log("\nThe lines fixed in this round")
  const capture = readCode("app/api/onepage/email-capture/route.ts")
  check("email capture: the download email's recipient is masked", /sent successfully to:", maskEmail\(normalizedEmail\)\)/.test(capture))
  const exchange = readCode("app/api/auth/exchange-reset-code/route.ts")
  check("exchange-reset-code: no auth error object, no redirect query, no raw error", !/generateLink failed:", linkError\)/.test(exchange) && /pathOf\(location\)/.test(exchange) && !/Unexpected error:", error\)/.test(exchange))
  const native = readCode("lib/native-oauth.ts")
  check("leads: the request log masks the address", /subscriberEmail: maskEmail\(subscriberEmail\)/.test(readCode("app/api/onepage/leads/route.ts")))
  check("the app's sign in log masks the address", !/user\?\.email \?\? "null"/.test(native) && /maskEmail\(email\)/.test(native))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
