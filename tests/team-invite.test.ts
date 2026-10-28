/**
 * A team invite, end to end on the server: every state the link can be in,
 * accepting once and only as the invited email, declining, role changes and
 * removal telling the member, the owner told when someone joins, the resend
 * cooldown, and "Use another account" really signing out.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/team-invite.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { hashToken, acceptInvite, declineInvite, readInvite, updateMember, joinPath } from "@/lib/team/server"
import { inviteStateOf, refusalOf, tokenShapeOk, type InviteRow } from "@/lib/team/invite-state"
import { inviteEmailFrom, inviteSignInPath } from "@/lib/team/invite-links"
import { FREE_SEATS, RESEND_COOLDOWN_MS, resendWait } from "@/lib/team/roles"
/* Round 40: what a member sees is their own permissions (lib/team/permissions); an old Manager row reads as Orders. */
import { legacyPermissions, memberSees, permissionLinesEn } from "@/lib/team/permissions"
import { APP_PATHS, WEB_ONLY_SEGMENTS, opensInApp } from "@/lib/platform/app-links"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const TOKEN = "Gr58y8yAGczyJXsxmNkRlWBo9ZyF8OPv"
const OWNER = "11111111-1111-4111-8111-111111111111"
const ANA = "22222222-2222-4222-8222-222222222222"
const BEN = "33333333-3333-4333-8333-333333333333"
const STORE = "44444444-4444-4444-8444-444444444444"
const INVITE = "55555555-5555-4555-8555-555555555555"
const NOW = Date.now()
const later = (ms: number) => new Date(NOW + ms).toISOString()

function world(over: Partial<Record<string, unknown>> = {}) {
  return fakeDb({
    creators: [{ id: STORE, user_id: OWNER, slug: "andrewrullz", display_name: "AndrewRullz", avatar_url: null, subscription_plan_id: null }],
    store_team_members: [
      {
        id: INVITE,
        creator_id: STORE,
        email: "ana@example.com",
        user_id: null,
        role: "manager",
        status: "invited",
        token_hash: hashToken(TOKEN),
        invited_by: OWNER,
        invited_at: later(-60 * 60 * 1000),
        expires_at: later(6 * 24 * 60 * 60 * 1000),
        accepted_at: null,
        ...over,
      },
    ],
    profiles: [
      { id: ANA, email: "ana@example.com", display_name: "Ana", avatar_url: null },
      { id: OWNER, email: "owner@example.com", display_name: "Andrew", avatar_url: null },
    ],
    seller_notifications: [],
    user_notifications: [],
  })
}

const store = { id: STORE, name: "AndrewRullz", avatarUrl: null, ownerUserId: OWNER, pro: false }
const row: InviteRow = { id: INVITE, creator_id: STORE, email: "ana@example.com", role: "manager", status: "invited", user_id: null, expires_at: later(1000) }
const base = { token: TOKEN, invite: row, store, teamSize: 1, user: { id: ANA, email: "Ana@Example.com" }, hasAccount: true, now: NOW }

async function main() {
  console.log("\nWhat the link says, every way it can be (lib/team/invite-state)")
  {
    check("a cut short or odd link is invalid", inviteStateOf({ ...base, token: "short" }).kind === "invalid" && !tokenShapeOk("a b c d e f g h i j k l m n o p") && tokenShapeOk(TOKEN))
    check("no invite with that link: gone (cancelled, replaced or never sent read the same)", inviteStateOf({ ...base, invite: null }).kind === "gone")
    check("the store deleted: store_gone", inviteStateOf({ ...base, store: null }).kind === "store_gone")
    check("expired after its week", inviteStateOf({ ...base, invite: { ...row, expires_at: later(-1) } }).kind === "expired")
    const used = inviteStateOf({ ...base, invite: { ...row, status: "active", user_id: ANA } })
    check("used: accepted, and 'you're in' for the person it was for", used.kind === "accepted" && used.mine === true)
    const usedOther = inviteStateOf({ ...base, invite: { ...row, status: "active", user_id: BEN } })
    check("  someone else's: accepted, not theirs", usedOther.kind === "accepted" && usedOther.mine === false)
    const out = inviteStateOf({ ...base, user: null })
    check("signed out: sign in as the invited email, knowing whether it has an account", out.kind === "signed_out" && out.email === "ana@example.com" && out.hasAccount === true)
    const wrong = inviteStateOf({ ...base, user: { id: BEN, email: "ben@example.com" } })
    check("signed in with another email: wrong_account, naming both, and the link may still be accepted", wrong.kind === "wrong_account" && wrong.email === "ana@example.com" && wrong.signedInAs === "ben@example.com" && refusalOf(wrong) === null)
    check("the email matches whatever its case", inviteStateOf(base).kind === "ready")
    check("the owner opening their own invite: own_store", inviteStateOf({ ...base, user: { id: OWNER, email: "ana@example.com" } }).kind === "own_store")
    const full = inviteStateOf({ ...base, teamSize: FREE_SEATS + 2 })
    check("more people than the plan allows now (a downgrade after sending): seats_full", full.kind === "seats_full" && full.limit === FREE_SEATS)
    check("  a team at its limit is fine (the invite is one of its seats already)", inviteStateOf({ ...base, teamSize: FREE_SEATS }).kind === "ready")
    check("every state but ready refuses an accept, with a reason", (["invalid", "gone", "store_gone"] as const).every((k) => !!refusalOf({ kind: k } as never)) && refusalOf(inviteStateOf(base)) === null && refusalOf(full)?.status === 403)
  }

  console.log("\nSign in on the way back to the invite (lib/team/invite-links)")
  {
    const login = inviteSignInPath({ token: TOKEN, email: "ana@example.com", hasAccount: true })
    const signup = inviteSignInPath({ token: TOKEN, email: "ana@example.com", hasAccount: false })
    check("an account: Log in, with the email and the invite as next", login.startsWith("/login?") && new URLSearchParams(login.split("?")[1]).get("next") === `/team/join?token=${TOKEN}` && new URLSearchParams(login.split("?")[1]).get("email") === "ana@example.com")
    check("no account: Create account", signup.startsWith("/signup?"))
    check("the login page keeps the email only on the way back to an invite", inviteEmailFrom(new URLSearchParams(login.split("?")[1])) === "ana@example.com" && inviteEmailFrom(new URLSearchParams("email=ana@example.com&next=/app")) === null && inviteEmailFrom(new URLSearchParams("email=not-an-email&next=/team/join?token=x")) === null)
    const loginPage = read("app/(auth)/login/page.tsx")
    const signupPage = read("app/(auth)/signup/page.tsx")
    check("  and both pages fill it in and lock it", /inviteEmailFrom\(searchParams\)/.test(loginPage) && /readOnly=\{!!inviteEmail\}/.test(loginPage) && /inviteEmailFrom\(searchParams\)/.test(signupPage) && /readOnly=\{!!inviteEmail\}/.test(signupPage))
  }

  console.log("\nReading an invite from the database (readInvite)")
  {
    const r = await readInvite(world() as never, TOKEN, null)
    check("signed out with an account for the email", r.ok && r.state.kind === "signed_out" && r.state.hasAccount === true, r)
    const r2 = await readInvite(world({ email: "nobody@example.com" }) as never, TOKEN, null)
    check("signed out, no account: offers Create account", r2.ok && r2.state.kind === "signed_out" && r2.state.hasAccount === false, r2)
    const r3 = await readInvite(world() as never, "x".repeat(32), { id: ANA, email: "ana@example.com" })
    check("a link nobody sent: gone", r3.ok && r3.state.kind === "gone")
  }

  console.log("\nAccepting")
  {
    /* The link proves the invited inbox (GitHub, Slack, Notion): another account of its holder may take it, once (tests/team-join-x.test.ts). */
    const other = world()
    const byBen = await acceptInvite(other as never, TOKEN, { id: BEN, email: "ben@example.com" })
    const afterBen = await acceptInvite(other as never, TOKEN, { id: ANA, email: "ana@example.com" })
    check("a signed in account with another email may take the link, and then nobody else can", byBen.ok === true && afterBen.ok === false && afterBen.status === 409, { byBen, afterBen })
    const db = world()
    const ok = await acceptInvite(db as never, TOKEN, { id: ANA, email: "ana@example.com" })
    check("the invited email accepts, and lands where the role starts", ok.ok === true && ok.creatorId === STORE && ok.home === "/app/orders", ok)
    const rows = (db as unknown as { tables?: Record<string, unknown[]> }).tables
    const again = await acceptInvite(db as never, TOKEN, { id: ANA, email: "ana@example.com" })
    check("the same link again does nothing: single use", again.ok === false && again.status === 409, again)
    const state = await readInvite(db as never, TOKEN, { id: ANA, email: "ana@example.com" })
    check("  and opening it says you're already in", state.ok && state.state.kind === "accepted" && state.state.mine === true)
    const told = (db as unknown as { log: { table: string; op: string; payload?: { title?: string; user_id?: string } }[] }).log.filter((l) => l.table === "seller_notifications" && l.op === "insert")
    check("the owner is told in their notifications", told.length === 1 && told[0].payload?.user_id === OWNER && /ana@example\.com joined your team/.test(told[0].payload?.title ?? ""), told)
    void rows
    const expired = await acceptInvite(world({ expires_at: later(-1) }) as never, TOKEN, { id: ANA, email: "ana@example.com" })
    check("an expired invite is refused", expired.ok === false && expired.status === 410)
  }

  console.log("\nDeclining")
  {
    const db = world()
    const out = await declineInvite(db as never, TOKEN)
    const log = (db as unknown as { log: { table: string; op: string; payload?: { title?: string } }[] }).log
    check("the invite is removed", out.ok && log.some((l) => l.table === "store_team_members" && l.op === "delete"))
    check("  and the owner told", log.some((l) => l.table === "seller_notifications" && l.op === "insert" && /turned down/.test(l.payload?.title ?? "")))
    const after = await readInvite(db as never, TOKEN, null)
    check("  and the link is gone afterwards", after.ok && after.state.kind === "gone")
    check("a malformed link cannot decline anything", (await declineInvite(world() as never, "nope")).ok === false)
  }

  console.log("\nThe owner changes the team, the member is told")
  {
    const db = world({ status: "active", user_id: ANA })
    const out = await updateMember(db as never, OWNER, INVITE, { role: "manager" })
    check("a change of access is the owner's and applies to the row (an old page's role reads as what it could use)", out.ok === true)
    const notOwner = await updateMember(world({ status: "active", user_id: ANA }) as never, ANA, INVITE, { remove: true })
    check("a member cannot change the team (owner only)", notOwner.ok === false && notOwner.status === 403)
    const db2 = world({ status: "active", user_id: ANA })
    const rm = await updateMember(db2 as never, OWNER, INVITE, { remove: true })
    const log = (db2 as unknown as { log: { table: string; op: string }[] }).log
    check("removing deletes the membership and tells them (user_notifications)", rm.ok === true && log.some((l) => l.table === "store_team_members" && l.op === "delete") && log.some((l) => l.table === "user_notifications"), log.map((l) => `${l.table}:${l.op}`))
    check("  so their next request finds no membership (actingStore reads the row each time)", /\.eq\("status", "active"\)\.maybeSingle\(\)/.test(read("lib/team/server.ts")))
  }

  console.log("\nResend cooldown and staff visibility")
  {
    check("a resend waits a minute", RESEND_COOLDOWN_MS === 60_000 && resendWait(new Date(NOW - 10_000).toISOString(), NOW) === 50 && resendWait(new Date(NOW - 61_000).toISOString(), NOW) === 0 && resendWait(null, NOW) === 0)
    check("  and the server enforces it", /const wait = existing \? resendWait\(existing\.invited_at\) : 0/.test(read("lib/team/server.ts")) && /status: 429/.test(read("lib/team/server.ts")))
    const manager = legacyPermissions("manager")
    check("an old Manager's menu shows orders and nothing the owner keeps", memberSees(manager, "/app/orders") && !memberSees(manager, "/app/payouts") && !memberSees(manager, "/app/settings/billing") && !memberSees(manager, "/app/products") && !memberSees(manager, "/app/website-builder") && !memberSees(manager, "/creator-page") && !memberSees(manager, "/app/integrations?integration=x"))
    check("the invite page lists what the access lets them do", permissionLinesEn(["orders", "customers"]).length === 2)
    const sidebar = read("components/app/sidebar.tsx")
    check("the sidebar draws only what the permissions open", /memberSees\(teamPermissions, item\.href\)/.test(sidebar) && (sidebar.match(/items=\{navItems\}/g) ?? []).length === 2)
    const layout = read("app/app/layout.tsx")
    check("the layout hands the sidebar the permissions and the stores they are on", /teamPermissions=\{teamStore && acting \? acting\.permissions : null\}/.test(layout) && /teamStoresForRequest\(user\.id\)/.test(layout))
    check("the account switcher lists team stores and opens them through /api/team/act", /data-business-row="team"/.test(read("components/app/business-switcher.tsx")) && /\/api\/team\/act/.test(read("components/app/business-switcher.tsx")))
    const settings = read("components/app/settings-form-new.tsx")
    check("Settings while working in another store shows only the account's own sections", /!teamActing \|\| tab\.group === "account"/.test(settings))
    check("a member with no store of their own still reaches Team in Settings", /memberOnly: true as const/.test(read("app/app/settings/_server.ts")) && /data\.memberOnly/.test(read("app/app/settings/_view.tsx")))
  }

  console.log("\n'Use another account' signs out for real")
  {
    const sw = read("app/api/team/join/switch/route.ts")
    check("it is a POST from Storelib's own page only", /export async function POST/.test(sw) && !/export async function GET/.test(sw) && /fromOwnPage\(req\.headers, req\.url\)/.test(sw))
    check("  Supabase signs the session out and every sb- cookie expires on the response", /auth\.signOut\(\{ scope: "local" \}\)/.test(sw) && /c\.name\.startsWith\("sb-"\)/.test(sw) && /maxAge: 0/.test(sw))
    check("  then sign in (or create the account) as the invited email, back to the invite", /inviteSignInPath\(/.test(sw) && /readInvite\(createAdminClient\(\), token, null\)/.test(sw))
    const btn = read("components/team/join-actions.tsx")
    check("the button signs out in the browser first (the app's device storage), then posts", /createClient\(\)\.auth\.signOut\(\{ scope: "local" \}\)/.test(btn) && /action="\/api\/team\/join\/switch"/.test(btn) && /form\.current\?\.submit\(\)/.test(btn))
    check("the old cause is gone: no plain link to /login from the invite", !/href="\/login\?next=/.test(read("components/team/join-card.tsx")) && !/Use another account<\/a>/.test(read("app/api/team/join/route.ts")))
  }

  console.log("\nThe invite is a page, and the app opens it")
  {
    check("the email links to /team/join", joinPath(TOKEN) === `/team/join?token=${TOKEN}` && /const link = joinLink\(token\)/.test(read("lib/team/server.ts")))
    check("'team' is a platform word, never a creator's handle", isReservedRootSegment("team") && (WEB_ONLY_SEGMENTS as readonly string[]).includes("team"))
    check("the iOS app opens invite links (apple-app-site-association)", (APP_PATHS as readonly string[]).includes("/team/join") && opensInApp("/team/join") && !opensInApp("/team"))
    const page = read("app/team/join/page.tsx")
    const cards = read("components/team/join-card.tsx")
    check("the page has a card for every state", /<StateCard state=\{read\.state\}/.test(page) && ["invalid", "gone", "store_gone", "accepted", "expired", "own_store", "seats_full", "signed_out", "wrong_account", "ready"].every((k) => cards.includes(`case "${k}":`)))
    check("  and is never indexed", /robots: \{ index: false/.test(page))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
