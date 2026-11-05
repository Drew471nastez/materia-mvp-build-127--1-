/**
 * Joining a team from the invite email, signed in any way.
 *
 * The owner's report: open the invite, sign in with Google or Apple, press
 * Join, and the browser shows {"error":"Open the invite from your email."}.
 * The cause: the invite page asked for `referrer: no-referrer`, and under
 * that policy a browser sends a form post's Origin as "null", which the old
 * check refused. This suite holds the fix in place:
 *
 *   the press check (lib/team/own-page.ts) as a table, and the page's policy
 *   the invite surviving every way of signing in (next, the OAuth carry
 *   cookie, the invite cookie fallback)
 *   another email signed in (Apple's Hide My Email, a Google alias): the
 *   link may be accepted, once, and the page says which email it was for
 *   expired and used links refused
 *   no JSON ever answers a press on the page
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/team-join-x.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { fakeDb } from "./_fake-db"
import { fromOwnPage } from "@/lib/team/own-page"
import { acceptInvite, hashToken, readInvite } from "@/lib/team/server"
import { acceptable, inviteStateOf, refusalOf, sameEmail, type InviteRow } from "@/lib/team/invite-state"
import { INVITE_COOKIE, inviteFallbackNext, invitePath, inviteSignInPath } from "@/lib/team/invite-links"
import { decodeCarry, destinationAfterAuth, encodeCarry, readCarry } from "@/lib/auth/continue"
import { welcomeDone } from "@/lib/account/welcome"
import { Note, StateCard } from "@/components/team/join-card"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const headers = (h: Record<string, string>) => new Headers(h)

const TOKEN = "Hq71z9xBGdzyJXsxmNkRlWBo9ZyF8OPw"
const OWNER = "11111111-1111-4111-8111-111111111111"
const ANA = "22222222-2222-4222-8222-222222222222"
const BEN = "33333333-3333-4333-8333-333333333333"
const STORE = "44444444-4444-4444-8444-444444444444"
const INVITE = "55555555-5555-4555-8555-555555555555"
const NOW = Date.now()
const later = (ms: number) => new Date(NOW + ms).toISOString()
const RELAY = "x7k2p9q4rt@privaterelay.appleid.com"

function world(over: Record<string, unknown> = {}, extraMembers: Record<string, unknown>[] = []) {
  return fakeDb({
    creators: [{ id: STORE, user_id: OWNER, slug: "andrewrullz", display_name: "AndrewRullz", avatar_url: null, subscription_plan_id: null }],
    store_team_members: [
      {
        id: INVITE,
        creator_id: STORE,
        email: "ana@example.com",
        user_id: null,
        role: "staff",
        status: "invited",
        token_hash: hashToken(TOKEN),
        invited_by: OWNER,
        invited_at: later(-60 * 60 * 1000),
        expires_at: later(6 * 24 * 60 * 60 * 1000),
        accepted_at: null,
        ...over,
      },
      ...extraMembers,
    ],
    profiles: [{ id: ANA, email: "ana@example.com", display_name: "Ana", avatar_url: null }],
    seller_notifications: [],
    user_notifications: [],
  })
}

async function main() {
  console.log("\nThe press check (lib/team/own-page.ts)")
  {
    const url = "https://storelib.com/api/team/join"
    check("the bug: Origin null from the page's own form, Sec-Fetch-Site same-origin, is a press on the page", fromOwnPage(headers({ origin: "null", "sec-fetch-site": "same-origin" }), url))
    check("Origin equal to this site", fromOwnPage(headers({ origin: "https://storelib.com", "sec-fetch-site": "same-origin" }), url))
    check("behind the proxy the request URL may name another host: x-forwarded-host counts", fromOwnPage(headers({ origin: "https://storelib.com", "x-forwarded-host": "storelib.com" }), "http://localhost:3000/api/team/join"))
    check("no Origin and no Sec-Fetch-Site (an old browser) is let through, as before", fromOwnPage(headers({}), url))
    check("another site's form is refused", !fromOwnPage(headers({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }), url))
    check("a creator's subdomain (same-site, their own HTML) is refused", !fromOwnPage(headers({ origin: "https://shop.storelib.com", "sec-fetch-site": "same-site" }), url))
    check("a sandboxed frame elsewhere (Origin null, cross-site) is refused", !fromOwnPage(headers({ origin: "null", "sec-fetch-site": "cross-site" }), url))
    check("an Origin that is not a URL is refused", !fromOwnPage(headers({ origin: "storelib.com" }), url))
    const page = read("app/(storelib)/team/join/page.tsx")
    check("the page asks for same-origin, not no-referrer (which makes the browser send Origin: null)", /referrer: "same-origin"/.test(page) && !/referrer: "no-referrer"/.test(page))
  }

  console.log("\nNo JSON answers a press on the invite page")
  {
    for (const p of ["app/api/team/join/route.ts", "app/api/team/join/switch/route.ts", "app/api/team/join/sign-in/route.ts"]) {
      const src = read(p)
      check(`${p}: no NextResponse.json, and the old sentence is gone`, !/NextResponse\.json/.test(src) && !/Open the invite from your email/.test(src))
    }
    const { POST } = await import("@/app/api/team/join/route")
    const forged = new Request("https://storelib.com/api/team/join", {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: TOKEN, action: "accept" }).toString(),
    })
    const res = await POST(forged)
    const to = new URL(res.headers.get("location") ?? "", "https://storelib.com")
    check("a forged press goes back to the invite page with a plain note, never JSON", res.status === 303 && to.pathname === "/team/join" && to.searchParams.get("token") === TOKEN && to.searchParams.get("note") === "again" && !/json/.test(res.headers.get("content-type") ?? ""), { status: res.status, location: res.headers.get("location") })
    const note = renderToStaticMarkup(createElement(Note, { kind: "again" }))
    check("  and the note is a sentence", /Press Join again/.test(note) && !/[{}]/.test(note.replace(/<[^>]+>/g, "")))
  }

  console.log("\nThe invite survives every way of signing in")
  {
    const next = invitePath(TOKEN)
    const login = inviteSignInPath({ token: TOKEN, email: "ana@example.com", hasAccount: true })
    const carry = readCarry(new URLSearchParams(login.split("?")[1]), "storelib.com")
    check("the login page's next is the invite, accepted by the carry rules", carry.next === next, carry)
    const cookie = encodeCarry(carry)
    check("Google and Apple: the OAuth carry cookie /auth/start writes brings it back to /auth/callback", decodeCarry(cookie, "storelib.com").next === next)
    check("  and the callback sends a new buyer account there", destinationAfterAuth(decodeCarry(cookie, "storelib.com"), { state: "none" } as never) === next)
    check("  and a seller there too, not the dashboard", destinationAfterAuth(decodeCarry(cookie, "storelib.com"), { state: "seller" } as never) === next || destinationAfterAuth(decodeCarry(cookie, "storelib.com"), { state: "complete" } as never) === next)
    check("  a new account's welcome step ends at the invite", welcomeDone(next) === next)
    check("the invite cookie: a sign in with nowhere to go goes back to the invite", inviteFallbackNext(null, TOKEN) === next)
    check("  never over a next that was given", inviteFallbackNext("/app/orders", TOKEN) === "/app/orders")
    check("  and a made up value is ignored", inviteFallbackNext(null, "../../evil") === null && inviteFallbackNext(null, "") === null)
    const cb = read("app/(storelib)/auth/callback/route.ts")
    const cont = read("app/(storelib)/auth/continue/route.ts")
    check("/auth/callback and /auth/continue both read the invite cookie once", [cb, cont].every((s) => /jar\.get\(INVITE_COOKIE\)/.test(s) && /jar\.delete\(INVITE_COOKIE\)/.test(s) && /inviteFallbackNext\(carry\.next, invite\)/.test(s)))
    const signIn = read("app/api/team/join/sign-in/route.ts")
    check("Log in to accept keeps the invite in a short lived httpOnly cookie", /cookies\.set\(INVITE_COOKIE, token, \{ httpOnly: true, sameSite: "lax"/.test(signIn) && /INVITE_COOKIE_MAX_AGE_SECONDS/.test(signIn) && /tokenShapeOk\(token\)/.test(signIn) && INVITE_COOKIE === "sl_team_invite")
    check("  and the card links there", /\/api\/team\/join\/sign-in\?token=/.test(read("components/team/join-card.tsx")))
    check("a join clears it", /cookies\.set\(INVITE_COOKIE, "", \{ path: "\/", maxAge: 0 \}\)/.test(read("app/api/team/join/route.ts")))
  }

  console.log("\nSigned in with another email")
  {
    const store = { id: STORE, name: "AndrewRullz", avatarUrl: null, ownerUserId: OWNER, pro: false }
    const row: InviteRow = { id: INVITE, creator_id: STORE, email: "ana@example.com", role: "staff", status: "invited", user_id: null, expires_at: later(1000) }
    const base = { token: TOKEN, invite: row, store, teamSize: 1, hasAccount: true, now: NOW }
    check("case and spaces never make two people", sameEmail(" Ana@Example.COM ", "ana@example.com") && !sameEmail(null, "ana@example.com") && !sameEmail("", ""))
    const relay = inviteStateOf({ ...base, user: { id: BEN, email: RELAY } })
    check("Apple's Hide My Email: wrong_account, naming both, acceptable", relay.kind === "wrong_account" && relay.email === "ana@example.com" && relay.signedInAs === RELAY && acceptable(relay) && refusalOf(relay) === null)
    const noEmail = inviteStateOf({ ...base, user: { id: BEN, email: null } })
    check("an account with no email at all is offered the same", noEmail.kind === "wrong_account" && acceptable(noEmail))
    check("the owner is still told it is their own store, whatever email", inviteStateOf({ ...base, user: { id: OWNER, email: "owner@example.com" } }).kind === "own_store")
    check("a full team is still full", inviteStateOf({ ...base, teamSize: 99, user: { id: BEN, email: RELAY } }).kind === "seats_full")
    check("already on the team through another invite: you're in, not a second seat", (() => { const s = inviteStateOf({ ...base, alreadyMember: true, user: { id: BEN, email: RELAY } }); return s.kind === "accepted" && s.mine })())

    const db = world()
    const r = await readInvite(db as never, TOKEN, { id: BEN, email: RELAY })
    check("readInvite: wrong_account for the relay address", r.ok && r.state.kind === "wrong_account", r)
    const out = await acceptInvite(db as never, TOKEN, { id: BEN, email: RELAY })
    check("the relay account accepts with the link", out.ok === true && out.creatorId === STORE, out)
    const log = (db as unknown as { log: { table: string; op: string; payload?: Record<string, unknown> }[] }).log
    const up = log.find((l) => l.table === "store_team_members" && l.op === "update")
    check("  the membership is that account's", up?.payload?.user_id === BEN && up?.payload?.status === "active", up)
    const told = log.find((l) => l.table === "seller_notifications" && l.op === "insert")
    check("  and the owner is told which account took it", /ana@example\.com joined your team/.test(String(told?.payload?.title)) && new RegExp(`signed in as ${RELAY.replace(/\./g, "\\.")}`).test(String(told?.payload?.message)), told)
    const again = await acceptInvite(db as never, TOKEN, { id: ANA, email: "ana@example.com" })
    check("single use: the invited email cannot take it again after", again.ok === false && again.status === 409, again)

    const twice = world({}, [{ id: "66666666-6666-4666-8666-666666666666", creator_id: STORE, email: "ben@example.com", user_id: BEN, role: "staff", status: "active", token_hash: null, invited_by: OWNER, invited_at: later(-1000), expires_at: null, accepted_at: later(-500) }])
    const already = await acceptInvite(twice as never, TOKEN, { id: BEN, email: RELAY })
    check("already a member through another invite: refused as you're already on this team", already.ok === false && /already on this team/.test((already as { error: string }).error), already)

    const card = renderToStaticMarkup(createElement(StateCard, { state: relay, token: TOKEN, note: "", signedIn: true }))
    const text = card.replace(/<[^>]+>/g, " ")
    check("the card says which email it was sent to and who is signed in", /ana@example\.com/.test(text) && text.includes(RELAY))
    check("  with Join with this account and Switch account", /Join with this account/.test(text) && /Switch account/.test(text) && /action="\/api\/team\/join"/.test(card) && /action="\/api\/team\/join\/switch"/.test(card))
    check("  and no raw JSON", !/"error"/.test(text) && !/[{}]/.test(text))
  }

  console.log("\nExpired and used links")
  {
    const expired = await acceptInvite(world({ expires_at: later(-1) }) as never, TOKEN, { id: BEN, email: RELAY })
    check("an expired link is refused for any account", expired.ok === false && expired.status === 410, expired)
    const used = await acceptInvite(world({ status: "active", user_id: ANA }) as never, TOKEN, { id: BEN, email: RELAY })
    check("a used link is refused for anybody else", used.ok === false && used.status === 409, used)
    const forged = await acceptInvite(world() as never, "Zz71z9xBGdzyJXsxmNkRlWBo9ZyF8OPw", { id: BEN, email: RELAY })
    check("a link nobody sent is refused", forged.ok === false && forged.status === 404, forged)
    const page = read("app/(storelib)/team/join/page.tsx")
    check("refusals are drawn by the page as cards, never JSON", /<StateCard state=\{read\.state\}/.test(page))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
