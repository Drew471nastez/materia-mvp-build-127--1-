/**
 * VERIFY ID ON A PHONE: THE LINK IN THE QR CODE
 *
 * The phone is not signed in, so the token is the only key. These pin that
 * it names one creator, expires, cannot be edited, and that the route it
 * opens can only add the ID photos.
 */
import { readFileSync } from "node:fs"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-long-enough"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}

async function main() {
  const { signIdHandoff, verifyIdHandoff, HANDOFF_TTL_MS } = await import("@/lib/payments/stripe/id-handoff")
  const now = 1_800_000_000_000
  const token = signIdHandoff("creator-1", now)
  check("a token is made for a creator", typeof token === "string" && token.includes("."))
  check("  and reads back as that creator", verifyIdHandoff(token, now + 1000) === "creator-1")
  check("it lasts thirty minutes and no more", HANDOFF_TTL_MS === 30 * 60_000 && verifyIdHandoff(token, now + HANDOFF_TTL_MS - 1) === "creator-1" && verifyIdHandoff(token, now + HANDOFF_TTL_MS + 1) === null)
  const [body, sig] = (token ?? "").split(".")
  const other = Buffer.from(JSON.stringify({ k: "id", c: "creator-2", e: now + HANDOFF_TTL_MS }), "utf8").toString("base64url")
  check("swapping in another creator breaks the signature", verifyIdHandoff(`${other}.${sig}`, now) === null)
  check("a changed signature is refused", verifyIdHandoff(`${body}.${"0".repeat(sig?.length ?? 64)}`, now) === null)
  check("rubbish is refused", verifyIdHandoff("nope", now) === null && verifyIdHandoff(null, now) === null && verifyIdHandoff("x".repeat(5000), now) === null)

  const route = readFileSync("app/api/payments/handoff/route.ts", "utf8")
  check("the route takes the creator from the token, never from the request", /verifyIdHandoff\(token\)/.test(route) && !/searchParams\.get\("creator|form\?\.get\("creator/.test(route))
  check("  it can only add the ID document, nothing else", /idHandoffUpload\(/.test(route) && !/submitDetails|addBank/.test(route))
  check("  and it is rate limited", /rateLimit\(/.test(route))
  const own = readFileSync("lib/payments/stripe/own-form.ts", "utf8")
  check("the upload it uses is the ID document only", /uploadDocument\(creator, \{ which: "document", side: input\.side, file: input\.file \}\)/.test(own))
  const page = readFileSync("app/verify-id/[token]/page.tsx", "utf8")
  check("the phone page is never indexed or sent as a referrer", /index: false/.test(page) && /referrer: "no-referrer"/.test(page))
  const flow = readFileSync("components/app/settings/payments-setup-flow.tsx", "utf8")
  check("setup on a computer shows the QR code and watches for the photos", /function PhoneHandoff/.test(flow) && /post<\{ url: string \}>\("handoff"/.test(flow) && /idSides/.test(flow))
  const phone = readFileSync("components/app/settings/verify-id-phone.tsx", "utf8")
  check("the phone page sends the link's token with every photo", /data\.set\("t", token\)/.test(phone) && /sendIdPhoto<Sides>\("\/api\/payments\/handoff"/.test(phone))
  const camera = readFileSync("components/app/settings/id-camera.tsx", "utf8")
  check("photos are 1600px JPEGs, sent with progress and a time limit", /ID_PHOTO_PX = 1600/.test(camera) && /xhr\.upload\.onprogress/.test(camera) && /xhr\.timeout = timeoutMs/.test(camera))
  check("the upload answers without waiting for a full re-sync", /after\(\(\) => syncStripeAccount\(creator\.id, "creator"\)/.test(own) && /await Promise\.all\(\[\s*\n\s*ownAccount\(creator\),\s*\n\s*stripe\.files\.create\(/.test(own))
  check("no 'use a photo instead' way round the camera", !/No camera\? Use a photo/.test(flow) && !/onPickFile=\{/.test(flow))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
