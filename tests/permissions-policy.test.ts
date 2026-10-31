/**
 * ===========================================================================
 *  A PERMISSIONS POLICY ON STORELIB.COM, AND ONLY THERE
 * ===========================================================================
 * Round rel2-security2 (SEC-12). vercel.json sends Permissions-Policy for the
 * hosts storelib.com and www.storelib.com: the dashboard, the app's WebView,
 * the checkout. Creator subdomains, custom domains and storelib.me OnePages
 * do not get it from here (an AI site sets its own, app/(sites)/site).
 *
 * What the platform itself uses stays allowed:
 *  - camera: the ID photo in payments setup (components/app/settings/id-camera)
 *    and Stripe's embedded onboarding (connect-js.stripe.com, js.stripe.com);
 *  - microphone: the website builder's voice ask (components/website-builder/ask-voice);
 *  - payment: Apple Pay and Google Pay in Stripe's frame (js.stripe.com).
 * Geolocation, USB and screen capture are used nowhere and are off.
 * The content security policy stays report only.
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}

type Rule = { source: string; has?: Array<{ type: string; value: string }>; headers: Array<{ key: string; value: string }> }

/* As Vercel matches a `has` host: the whole host against the value. */
function hostMatches(value: string, host: string): boolean {
  return new RegExp(`^(?:${value})$`).test(host)
}

function main() {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { headers: Rule[] }
  const rules = config.headers.filter((r) => r.headers.some((h) => h.key.toLowerCase() === "permissions-policy"))
  check("one rule sends Permissions-Policy", rules.length === 1, rules)
  const rule = rules[0]
  const host = rule?.has?.find((h) => h.type === "host")?.value ?? ""
  check("  only for a host condition", !!host)
  for (const h of ["storelib.com", "www.storelib.com"]) check(`  applies on ${h}`, hostMatches(host, h))
  for (const h of ["jane.storelib.com", "shop.example.com", "storelib.me", "storelib.com.evil.example", "xstorelib.com", "help.storelib.com"]) check(`  not on ${h}`, !hostMatches(host, h))

  const value = rule?.headers.find((h) => h.key.toLowerCase() === "permissions-policy")?.value ?? ""
  const part = (name: string) => value.split(",").map((s) => s.trim()).find((s) => s.startsWith(`${name}=`)) ?? ""
  check("camera: this site and Stripe's onboarding frames", /^camera=\(self\b/.test(part("camera")) && part("camera").includes('"https://connect-js.stripe.com"') && part("camera").includes('"https://js.stripe.com"'), part("camera"))
  check("microphone: this site", part("microphone") === "microphone=(self)", part("microphone"))
  check("payment: this site and Stripe's wallet frame", part("payment") === 'payment=(self "https://js.stripe.com")', part("payment"))
  check("geolocation, usb and screen capture off", part("geolocation") === "geolocation=()" && part("usb") === "usb=()" && part("display-capture") === "display-capture=()")

  console.log("\nStill in use, so still allowed")
  check("the ID camera still asks for the camera", /getUserMedia/.test(readCode("components/app/settings/id-camera.tsx")))
  check("the voice ask still records", /getUserMedia|MediaRecorder/.test(readCode("components/website-builder/ask-voice.ts")))

  console.log("\nThe content security policy")
  const all = config.headers.flatMap((r) => r.headers.map((h) => h.key.toLowerCase()))
  check("is still report only (nothing enforces it yet)", all.includes("content-security-policy-report-only") && !all.includes("content-security-policy"))

  check("the deploy smoke checks it on storelib.com", /a permissions policy is sent/.test(readCode("scripts/smoke-deploy.mjs")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
