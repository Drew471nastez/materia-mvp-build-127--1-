/**
 * Round AY (track 3): two things left open in round AX.
 *
 * 1. A visitor with no `__Host-` session could still be handed one under the
 *    old cookie name by a published site (Domain=storelib.com): a lone old
 *    name was read and moved over. Now that move ends on 2026-12-29
 *    (LEGACY_SESSION_CUTOFF_MS): after it an old name is never read on HTTPS,
 *    it is expired. A `__Host-` session is never affected, and http://localhost
 *    keeps the old name.
 *
 * 2. Mail to an address a visitor typed (a booking confirmation, a download
 *    link) is now counted per recipient and per network across every store
 *    (lib/api/typed-mail.ts), and the one piece of visitor text that reached
 *    such mail, the name in a flow's greeting, is used only when it reads as
 *    a person's name (lib/api/mail-name.ts).
 */
import { readCode } from "./_source"
import { cookiePairs, LEGACY_SESSION_CUTOFF_MS, legacyMigrationOpen, sessionView } from "@/lib/supabase/host-session"
import { readSessionFromCookies } from "@/lib/supabase/session-jar"
import { TYPED_MAIL_LIMITS, typedMailAllowed, type Limiter } from "@/lib/api/typed-mail"
import { mailSafeName } from "@/lib/api/mail-name"
import { visitorBookingMail } from "@/lib/bookings/emails"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}

const KEY = "sb-abcdefgh-auth-token"
const HOST = `__Host-${KEY}`
const stored = (who: string) => `base64-${Buffer.from(JSON.stringify({ access_token: `at-${who}`, refresh_token: who, user: { id: who } })).toString("base64url")}`
const BEFORE = Date.UTC(2026, 11, 28, 23, 59)
const AFTER = Date.UTC(2026, 11, 29, 0, 0)

/* A limiter that behaves like rateLimit with one shared clock: refused at the limit, and a refusal is not counted. */
function countingLimiter(): Limiter & { calls: string[] } {
  const hits = new Map<string, number>()
  const calls: string[] = []
  const fn = (async (o) => {
    const subjects = o.subjects.filter((s): s is string => !!s)
    calls.push(o.bucket)
    if (o.memoryFirst) calls.push("memoryFirst")
    for (const s of subjects) for (const w of o.windows) if ((hits.get(`${o.bucket}|${s}|${w.seconds}`) ?? 0) >= w.limit) return { status: 429 }
    for (const s of subjects) for (const w of o.windows) hits.set(`${o.bucket}|${s}|${w.seconds}`, (hits.get(`${o.bucket}|${s}|${w.seconds}`) ?? 0) + 1)
    return null
  }) as Limiter & { calls: string[] }
  fn.calls = calls
  return fn
}
const req = (ip: string) => new Request("https://storelib.com/api/forms/x/submit", { method: "POST", headers: { "x-forwarded-for": ip } })

async function main() {
  console.log("1. The move to __Host- has an end")
  check("the cutoff is 2026-12-29, 45 days after 2026-11-14", LEGACY_SESSION_CUTOFF_MS === Date.UTC(2026, 11, 29) && (LEGACY_SESSION_CUTOFF_MS - Date.UTC(2026, 10, 14)) / 86_400_000 === 45)
  check("open before it", legacyMigrationOpen({ retireLegacy: true, now: BEFORE }))
  check("closed from it", !legacyMigrationOpen({ retireLegacy: true, now: AFTER }))
  check("never closed where writes keep the old name (http://localhost)", legacyMigrationOpen({ retireLegacy: false, now: AFTER + 365 * 86_400_000 }))

  const lone = cookiePairs(`${KEY}=${stored("planter")}; other=1`)
  const before = sessionView(lone, KEY, [], { retireLegacy: true, now: BEFORE })
  check("before: a lone old name is still read and moved (nobody signed out)", before.cookies.some((c) => c.name === KEY) && before.migrate.length === 1)
  const after = sessionView(lone, KEY, [], { retireLegacy: true, now: AFTER })
  check("after: a lone old name is never shown to Supabase", !after.cookies.some((c) => c.name === KEY))
  check("after: it is never moved to __Host-", after.migrate.length === 0)
  check("after: it is expired (listed to expire on the host and at the domain)", after.shadowed.includes(KEY))
  check("after: other cookies are untouched", after.cookies.some((c) => c.name === "other" && c.value === "1"))
  const chunks = sessionView(cookiePairs(`${KEY}.0=aa; ${KEY}.1=bb`), KEY, [], { retireLegacy: true, now: AFTER })
  check("after: a chunked old name too", chunks.cookies.length === 0 && chunks.shadowed.includes(`${KEY}.0`) && chunks.shadowed.includes(`${KEY}.1`))
  const verifier = sessionView(cookiePairs(`${KEY}-code-verifier=planted`), KEY, [], { retireLegacy: true, now: AFTER })
  check("after: an old-name PKCE verifier too", verifier.cookies.length === 0)

  const mine = sessionView(cookiePairs(`${HOST}=${stored("visitor")}`), KEY, [], { retireLegacy: true, now: AFTER })
  check("after: a __Host- session is read exactly as before", mine.cookies.length === 1 && mine.cookies[0].name === KEY && mine.cookies[0].value === stored("visitor") && mine.shadowed.length === 0)
  const beside = sessionView(cookiePairs(`${KEY}=${stored("planter")}; ${HOST}=${stored("visitor")}`), KEY, [], { retireLegacy: true, now: AFTER })
  check("after: a __Host- session beside a planted old name keeps the visitor's own", beside.cookies.length === 1 && beside.cookies[0].value === stored("visitor"))
  const local = sessionView(lone, KEY, [], { retireLegacy: false, now: AFTER })
  check("after, on http://localhost: the old name is read as before", local.cookies.some((c) => c.name === KEY))
  check("no options (the old callers' shape): unchanged", sessionView(lone, KEY).cookies.some((c) => c.name === KEY))

  check("the browser's own read, after: nothing", (await readSessionFromCookies(KEY, `${KEY}=${stored("planter")}`, { retireLegacy: true, now: AFTER })) === null)
  check("the browser's own read, after, __Host-: the visitor", (await readSessionFromCookies(KEY, `${HOST}=${stored("visitor")}`, { retireLegacy: true, now: AFTER }))?.includes("visitor") === true)

  const proxy = readCode("proxy.ts")
  check("proxy: retires the old name where it writes __Host-", /const viewOptions = \{ retireLegacy: hostCookies \}/.test(proxy) && /sessionView\(arrived, sessionKey, \[\], viewOptions\)/.test(proxy) && /sessionKey, \[\], viewOptions\)\.cookies/.test(proxy))
  check("proxy: the cutoff is decided before the view (hostCookies first)", proxy.indexOf("const hostCookies = writesHostCookies") < proxy.indexOf("const arrivedView = sessionView"))
  check("server client: retires it too", /duplicated, \{ retireLegacy: hostCookies \}\)\.cookies/.test(readCode("lib/supabase/server.ts")))
  const client = readCode("lib/supabase/client.ts")
  check("browser client: retires it too", (client.match(/sessionView\(pairs, key, \[\], \{ retireLegacy: host \}\)/g) || []).length === 2 && /readSessionFromCookies\(key, readCookieHeader\(\), \{ retireLegacy: secureCookies\(\) && !onLocalhost\(\) \}\)/.test(client))
  check("business switch read: retires it too", /readSessionFromCookies\(key, cookies, \{ retireLegacy: secure\(\)/.test(readCode("lib/businesses/switch-client.ts")))

  console.log("\n2. Mail to a typed address")
  const limiter = countingLimiter()
  const results: boolean[] = []
  for (let i = 0; i < 12; i++) results.push(await typedMailAllowed(req(`10.0.0.${i}`), "Victim@Example.com", limiter))
  check("a person's own few mails go", results.slice(0, 10).every(Boolean))
  check("the same address from rotating networks is held back past 10 an hour", results[10] === false && results[11] === false)
  check("counted case-insensitively (one recipient)", (await typedMailAllowed(req("10.9.9.9"), "victim@example.com", limiter)) === false)
  check("another address is not affected", await typedMailAllowed(req("10.0.0.1"), "someone@example.com", limiter))

  const fromOne = countingLimiter()
  const net: boolean[] = []
  for (let i = 0; i < 62; i++) net.push(await typedMailAllowed(req("203.0.113.7"), `person${i}@example.com`, fromOne))
  check("one network mailing many addresses: 60 an hour go", net.slice(0, 60).every(Boolean))
  check("and then it is held back", net[60] === false && net[61] === false)
  check("not an address: never mailed", (await typedMailAllowed(req("10.0.0.1"), "not-an-address", countingLimiter())) === false)
  check("never memoryFirst (mail is counted in Postgres)", !fromOne.calls.includes("memoryFirst"))
  check("far above real use: at least 10 an hour and 30 a day per recipient", TYPED_MAIL_LIMITS.recipient[0].limit >= 10 && TYPED_MAIL_LIMITS.recipient.some((w) => w.seconds === 86_400 && w.limit >= 30))
  check("a shared wifi has room: 60 an hour, 300 a day per network", TYPED_MAIL_LIMITS.address[0].limit >= 60 && TYPED_MAIL_LIMITS.address.some((w) => w.seconds === 86_400 && w.limit >= 300))

  const submit = readCode("app/api/forms/[id]/submit/route.ts")
  check("booking mail to the visitor: limited, the booking still kept", /const mailVisitor = booked && valid\.email && !definition\.booking\?\.payment_product_id \? await typedMailAllowed\(request, valid\.email\) : false/.test(submit) && /const visitorJob = booked && mailVisitor \?/.test(submit))
  const capture = readCode("app/api/onepage/email-capture/route.ts")
  check("download email: limited, the link still answered on the page", /const mayMail = product && downloadLink \? await typedMailAllowed\(request, normalizedEmail\) : false/.test(capture) && /if \(product && downloadLink && mayMail\)/.test(capture) && /downloadLink \}\)/.test(capture))

  console.log("\n   no visitor-written text in mail to a typed address")
  check("a name: kept", mailSafeName("Ana Lopez") === "Ana Lopez" && mailSafeName("  José  ") === "José" && mailSafeName("O'Neil") === "O'Neil" && mailSafeName("Mary-Jane") === "Mary-Jane" && mailSafeName("Dr. Smith") === "Dr. Smith" && mailSafeName("李小龙") === "李小龙")
  check("a link: dropped", mailSafeName("visit evil.co") === null && mailSafeName("https://evil.co") === null && mailSafeName("evil.com") === null)
  check("a sentence: dropped", mailSafeName("Your account is locked, call now") === null && mailSafeName("Win a prize today at our shop") === null)
  check("digits, symbols, markup: dropped", mailSafeName("Call 555 0100") === null && mailSafeName("<b>Hi</b>") === null && mailSafeName("a@b.co") === null)
  check("too long: dropped", mailSafeName("A".repeat(41)) === null)
  check("not a string: dropped", mailSafeName(undefined) === null && mailSafeName(42) === null)
  const email = readCode("lib/email.tsx")
  check("every flow email's name goes through it", /params = \{ \.\.\.params, recipientName: mailSafeName\(params\.recipientName\) \?\? undefined \}/.test(email) && email.indexOf("mailSafeName(params.recipientName)") < email.indexOf("await enrollInFlows("))

  const booking = visitorBookingMail({
    kind: "confirmed",
    title: "Intro call",
    booking: { id: "b1", startsAt: "2027-01-05T10:00:00Z", endsAt: "2027-01-05T10:30:00Z", visitorTimezone: "UTC", ownerTimezone: "UTC", location: null, sequence: 0 },
    hostName: "Ana's Studio",
    visitorEmail: "victim@example.com",
    manageUrl: null,
  })
  check("a booking confirmation is the store's own text (title, host, time)", booking.text.includes("Intro call") && booking.text.includes("Ana's Studio") && !/victim@example\.com/.test(booking.subject))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
