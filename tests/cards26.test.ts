/**
 * ===========================================================================
 *  ROUND 26 (W1): THE COMMUNITY CARDS, THE PLAN'S PLACES, THE STATES
 * ===========================================================================
 * Held against the in-memory database, the owner's words:
 *
 *   PLACES     "scheduled for permanent deletion on November 5 but today is
 *              October 16, that should not prevent a replacement now": a
 *              community whose deletion is scheduled takes no place on the
 *              Free plan; the list's count, the wizard gate and the create
 *              path agree; before part 202 nothing changes
 *   KEEP       Keep (undo) after a replacement took the place is refused with
 *              a plain sentence and changes nothing (no membership touched,
 *              still scheduled); with a place free again it works
 *   TWO TABS   two creates at once: the later one is taken back; a double
 *              tap on Delete writes one delete; asking twice to schedule is
 *              refused (round 33 keeps that)
 *   STATES     Draft, Published, Archived, Pending deletion as badges; Share
 *              only for a published community; the setup pill stays away
 *              from an archived one; Settings hides Archive while deleting
 *   CARDS      the badge ends the name's line (not on the cover's edge), the
 *              card is as tall as before, nothing moves on hover or press
 *   PUBLIC     a draft is a 404 to everyone but its staff, never indexed,
 *              never previewed (read, not changed, here)
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"
import { fakeDb } from "./_fake-db"
import { FREE_COMMUNITY_LIMIT, KEEP_LIMIT_TEXT, PLAN_LIMIT_ERROR, takesCommunitySlot } from "@/lib/communities/plan-limit"
import { communityRoom, madeWithinLimit, pendingDeletions } from "@/lib/communities/server/creator-policies"
import { createFromFlow, deleteCommunity, loadCreatorCommunities } from "@/lib/communities/server/creator"
import { undoDeletion, type DeletionDeps } from "@/lib/communities/server/community-deletion"
import { loadSetupChecklist } from "@/lib/communities/server/setup-checklist"
import { checkWizard } from "@/lib/communities/create-wizard"
import type { CommunityRow } from "@/lib/communities/types"

/* The plan is read where Sites reads it; with no database configured that read answers Free, which is what is held here. */
delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(untt(raw(p), p))
/* Without untt: for a pin that names a tt() call itself. */
const plain = (p: string) => stripComments(raw(p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const CREATOR = "e0000000-0000-4000-8000-000000000026"
const OWNER = "a0000000-0000-4000-8000-0000000000a1"
const KEEP_ID = "c0000000-0000-4000-8000-00000000000a"
const LEAVING = "c0000000-0000-4000-8000-00000000000b"
const DAY = 86_400_000
/* October 16, 2026, and a deletion due on November 5: the owner's own example. */
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)
const NOV5 = new Date(Date.UTC(2026, 10, 5, 12, 0, 0)).toISOString()
const iso = (ms: number) => new Date(ms).toISOString()

function community(id: string, over: Record<string, unknown> = {}): Record<string, Any> {
  return {
    id,
    slug: id === KEEP_ID ? "makers" : "old-club",
    name: id === KEEP_ID ? "Makers" : "Old Club",
    tagline: null,
    description: "",
    logo_url: null,
    cover_url: null,
    creator_id: CREATOR,
    owner_user_id: OWNER,
    access: "free",
    visibility: "public",
    status: "published",
    member_count: 1,
    post_count: 0,
    benefits: [],
    rules: [],
    onboarding: {},
    classroom_enabled: false,
    events_enabled: false,
    created_at: iso(NOW - (id === KEEP_ID ? 30 : 90) * DAY),
    archived_at: null,
    deleted_at: null,
    suspended_at: null,
    ...over,
  }
}

/** A Free creator with two communities: Makers, and Old Club whose deletion is scheduled for November 5. */
function world(o: { part202?: boolean } = {}) {
  const tables: Record<string, Any[]> = {
    communities: [community(KEEP_ID), community(LEAVING, { status: "archived", archived_at: iso(NOW - DAY) })],
    community_members: [
      { id: "m1", community_id: KEEP_ID, user_id: OWNER, role: "owner", status: "active", source: "owner" },
      { id: "m2", community_id: LEAVING, user_id: OWNER, role: "owner", status: "active", source: "owner" },
    ],
    community_audit_log: [],
    community_spaces: [],
    community_levels: [],
    community_tiers: [],
    memberships: [],
    products: [],
    ...(o.part202 === false
      ? {}
      : {
          community_deletions: [{ community_id: LEAVING, state: "scheduled", mode: "period_end", delete_at: NOV5, requested_by: OWNER, requested_at: iso(NOW - DAY), prior_status: "published", prior_archived_at: null, members_total: 1 }],
          community_deletion_members: [],
        }),
  }
  return <Any>(
    fakeDb(
      tables,
      o.part202 === false ? { failWith: { community_deletions: { code: "42P01", message: 'relation "public.community_deletions" does not exist' }, community_deletion_members: { code: "42P01", message: "missing" } } } : { unique: { community_deletions: [["community_id"]], communities: [["slug"]] } },
    )
  )
}

/** Stripe and the mailer, never to be reached when Keep is refused; recorded. */
function stub(at: { now: number }) {
  const calls = { update: [] as Any[], mails: [] as Any[] }
  const deps: DeletionDeps = {
    update: async (id, params) => {
      calls.update.push([id, params.cancel_at_period_end])
    },
    sync: async () => null,
    endNow: async () => undefined,
    createRefund: async () => ({ id: "re_x", status: "succeeded", currency: "usd", metadata: null }),
    findRefund: async () => null,
    afterRefund: async () => undefined,
    sendMail: async (m) => {
      calls.mails.push(m)
      return { success: true }
    },
    baseUrl: () => "https://storelib.com",
    now: () => at.now,
    plan: async () => "free",
  }
  return { deps, calls }
}

const byId = (db: Any, id: string) => db.tables.communities.find((c: Any) => c.id === id) as CommunityRow & Record<string, Any>
const audits = (db: Any, action: string) => db.tables.community_audit_log.filter((a: Any) => a.action === action).length
const wizard = (name: string) => {
  const v = checkWizard({ name, type: "free" })
  if (!v.ok) throw new Error(`wizard refused ${name}`)
  return v.value
}

async function main() {
  /* ── The rule ────────────────────────────────────────────────────────── */
  console.log("\nthe rule")
  check("a deleted or scheduled community takes no place; an archived one still does", takesCommunitySlot({}) && !takesCommunitySlot({ deleted: true }) && !takesCommunitySlot({ deleting: true }) && takesCommunitySlot({ deleting: false }))
  check("Keep's refusal is a plain sentence with the plan's number", KEEP_LIMIT_TEXT.includes(String(FREE_COMMUNITY_LIMIT)) && /Delete one or upgrade to Pro/.test(KEEP_LIMIT_TEXT))

  /* ── Places on the Free plan ─────────────────────────────────────────── */
  console.log("\nplaces")
  {
    const db = world()
    const pending = await pendingDeletions(db, [LEAVING, KEEP_ID], NOW)
    check("the scheduled deletion is read, with its date and Keep still possible", pending.size === 1 && pending.get(LEAVING)?.deleteAt === NOV5 && pending.get(LEAVING)?.canKeep === true, [...pending])
    const room = await communityRoom(db, CREATOR, "free")
    check("October 16: two owned, one scheduled for November 5, so one place is free", room.ok && room.limit.owned === 1 && room.limit.max === 2, room)
    const pro = await communityRoom(db, CREATOR, "pro")
    check("Pro has no limit", pro.ok && pro.limit.max === null)

    const list = await loadCreatorCommunities(db, CREATOR, OWNER)
    const leaving = list.rows.find((r) => r.id === LEAVING)
    const kept = list.rows.find((r) => r.id === KEEP_ID)
    check("the list still shows the one being deleted, with its date", list.available && !!leaving?.deleting && leaving.deleting.deleteAt === NOV5 && leaving.deleting.canKeep === true && leaving.archived === true, leaving)
    check("the list's count agrees: 1 of 2", list.limit.owned === 1 && list.limit.max === 2, list.limit)
    check("a community not being deleted says nothing about it", kept?.deleting === null)

    const made = await createFromFlow(db, { creatorId: CREATOR, userId: OWNER, input: wizard("Makers Two") })
    check("the replacement is made the same day", made.ok && db.tables.communities.filter((c: Any) => !c.deleted_at).length === 3, made)
    const full = await communityRoom(db, CREATOR, "free")
    check("now both places are taken", !full.ok && full.limit.owned === 2, full.limit)
    const fourth = await createFromFlow(db, { creatorId: CREATOR, userId: OWNER, input: wizard("Makers Three") })
    check("a third active one is refused with plan_limit and makes nothing", !fourth.ok && fourth.status === 402 && fourth.error === PLAN_LIMIT_ERROR && db.tables.communities.length === 3)

    /* ── Keep after the replacement took the place ─────────────────────── */
    console.log("\nkeep")
    const at = { now: NOW }
    const { deps, calls } = stub(at)
    const refused = await undoDeletion(db, { community: byId(db, LEAVING), actorId: OWNER }, deps)
    check("Keep is refused with the plain sentence (402)", !refused.ok && refused.status === 402 && refused.error === KEEP_LIMIT_TEXT, refused)
    check("and nothing changed: still scheduled, still archived, no membership touched, nobody emailed", db.tables.community_deletions[0].state === "scheduled" && !db.tables.community_deletions[0].undone_at && byId(db, LEAVING).status === "archived" && calls.update.length === 0 && calls.mails.length === 0 && audits(db, "community.deletion_undone") === 0)
    check("the job run still finds it", (await pendingDeletions(db, [LEAVING], NOW)).size === 1)

    const replacement = made.ok ? byId(db, made.community.id) : null
    const gone = replacement ? await deleteCommunity(db, { community: replacement, actorId: OWNER, confirm: "Makers Two" }) : null
    check("the replacement deleted (nobody pays): at once", !!gone?.ok && !!replacement && !!byId(db, replacement.id).deleted_at)
    const twice = replacement ? await deleteCommunity(db, { community: replacement, actorId: OWNER, confirm: "Makers Two" }) : null
    check("a second Delete (a double tap, a second tab with the old page) is refused and writes no second delete", !!twice && !twice.ok && twice.status === 409 && audits(db, "community.deleted") === 1, twice)

    const keptNow = await undoDeletion(db, { community: byId(db, LEAVING), actorId: OWNER }, deps)
    check("with the place free again, Keep works and the community is what it was", keptNow.ok && db.tables.community_deletions[0].state === "undone" && byId(db, LEAVING).status === "published" && audits(db, "community.deletion_undone") === 1, keptNow)
    const after = await communityRoom(db, CREATOR, "free")
    check("and it takes its place again", !after.ok && after.limit.owned === 2)
  }

  /* ── Before part 202 ─────────────────────────────────────────────────── */
  console.log("\nbefore part 202")
  {
    const db = world({ part202: false })
    const room = await communityRoom(db, CREATOR, "free")
    check("without the deletions table every community not deleted counts, as before", !room.ok && room.limit.owned === 2, room.limit)
  }

  /* ── Two tabs ────────────────────────────────────────────────────────── */
  console.log("\ntwo tabs")
  {
    const db = world()
    /* Both passed the room check (one place free), then both were written: the older keeps the place. */
    const A = "c0000000-0000-4000-8000-0000000000f1"
    const B = "c0000000-0000-4000-8000-0000000000f2"
    db.tables.communities.push(community(A, { slug: "a", name: "A", created_at: iso(NOW) }), community(B, { slug: "b", name: "B", created_at: iso(NOW + 5) }))
    const first = await madeWithinLimit(db, CREATOR, A, "free")
    const second = await madeWithinLimit(db, CREATOR, B, "free")
    check("the first made keeps its place, the later one is over", first === true && second === false)
    check("on Pro both stay", (await madeWithinLimit(db, CREATOR, B, "pro")) === true)
    const creator = code("lib/communities/server/creator.ts")
    check("the create path takes the later one back and answers plan_limit", /if \(!\(await madeWithinLimit\(db, a\.creatorId, made\.community\.id\)\)\) \{\s*await db\.from\("communities"\)\.delete\(\)\.eq\("id", made\.community\.id\)\s*return no\(402, PLAN_LIMIT_ERROR\)/.test(creator))
    const policies = code("lib/communities/server/creator-policies.ts")
    check("Duplicate does the same", /madeWithinLimit\(db, a\.creatorId, made\.community\.id\)/.test(policies))
    check("the immediate delete only acts on a row not yet deleted", /\.eq\("id", c\.id\)\.is\("deleted_at", null\)\.select\("id"\)/.test(creator) && /It has already been deleted\./.test(creator))
    const dialog = code("components/community/creator/delete-community.tsx")
    check("the delete dialog stops a second press before it is drawn busy", (dialog.match(/if \(inFlight\.current\) return/g) ?? []).length === 2 && /const inFlight = React\.useRef\(false\)/.test(dialog))
    const del = code("lib/communities/server/community-deletion.ts")
    check("Keep counts after its claim and gives the claim back over the plan", /\.eq\("state", "scheduled"\)\.select\("community_id"\)[\s\S]{0,400}communityRoom\(db, owner/.test(del) && /update\(\{ state: "scheduled", undone_by: null, undone_at: null[\s\S]{0,60}?\}\)\.eq\("community_id", c\.id\)\.eq\("state", "undone"\)/.test(del))
  }

  /* ── States ──────────────────────────────────────────────────────────── */
  console.log("\nstates")
  {
    const parts = code("components/community/creator/parts.tsx")
    check("four states and suspended, Pending deletion its own", /export type CommunityState = "published" \| "draft" \| "archived" \| "deleting" \| "suspended"/.test(parts) && /get deleting\(\) \{\s*return tt\("Pending deletion"\)/.test(raw("components/community/creator/parts.tsx")))
    check("suspended first, then deleting, then archived", /if \(c\.suspended \|\| c\.status === "suspended"\) return "suspended"\s*if \(c\.deleting\) return "deleting"\s*if \(c\.archived \|\| c\.status === "archived"\) return "archived"/.test(parts))
    check("Pending deletion is the critical tone", /deleting: "critical"/.test(parts))
    const creator = code("lib/communities/server/creator.ts")
    check("the admin header carries it, read only for an archived community", /archived \? pendingDeletions\(ctx\.db, \[c\.id\]\)/.test(creator) && /deleting: deletion \? \{ deleteAt: deletion\.deleteAt, canKeep: deletion\.canKeep && ctx\.role === "owner" \} : null/.test(creator))
    const shell = code("components/community/creator/community-shell.tsx")
    check("the header's badge reads the whole head, so it says Pending deletion", /<CommunityStatusBadge state=\{communityState\(head\)\} \/>/.test(shell))
    const settings = plain("components/community/creator/settings-section.tsx")
    check("Settings hides Archive and Bring it back while the deletion is scheduled", /\{head\.deleting \? null : \(\s*<EditorCard\s+title=\{head\.archived \? tt\("Archived"\) : tt\("Archive"\)\}/.test(settings))
    check("Publish and Unpublish still there for a draft and a published one", /run\("unpublish", `\/api\/app\/community\/\$\{head\.id\}`, \{ publish: false \}/.test(settings) && /run\("publish", `\/api\/app\/community\/\$\{head\.id\}`, \{ publish: true \}/.test(settings))

    const db = world()
    const archived = await loadSetupChecklist(db, { community: byId(db, LEAVING), userId: OWNER, role: "owner", paymentsReady: true })
    const open = await loadSetupChecklist(db, { community: byId(db, KEEP_ID), userId: OWNER, role: "owner", paymentsReady: true })
    check("the setup pill stays away from an archived community (it said 'It is a draft. Publish')", archived.pillHidden === true && open.pillHidden === false)
  }

  /* ── The cards ───────────────────────────────────────────────────────── */
  console.log("\ncards")
  {
    const list = plain("components/community/creator/community-list.tsx")
    check("the logo's row holds only the logo", /<div className="-mt-6 flex">\s*<Logo row=\{r\} \/>\s*<\/div>/.test(list))
    check("the badge ends the name's line, a 22px line 8px under the logo", /<div className="mt-2 flex h-\[22px\] min-w-0 items-center gap-2">\s*<p className="min-w-0 flex-1 truncate[^"]*" data-card-name="">\s*\{r\.name\}\s*<\/p>\s*<span data-card-state=\{state\} className="inline-flex shrink-0">\s*<CommunityStatusBadge state=\{state\} \/>/.test(list))
    check("no -mb on the badge, nothing pulled onto the cover", !/-mb-0\.5 inline-flex/.test(list))
    check("nothing on a card moves: no translate, scale or lift on hover, focus or press", !/(hover|focus|focus-visible|active|group-hover\/card):(-?translate|scale|-?mt|-?mb|top|bottom)/.test(list) && /transition-\[box-shadow,border-color\]/.test(list))
    check("Share only for a published community", /if \(state === "published"\) out\.push\(\{ label: tt\("Share"\)/.test(list))
    check("one being deleted offers Keep (to the card that keeps it), never Archive or Bring back", /if \(r\.deleting\?\.canKeep\) out\.push\(\{ label: tt\("Keep the community"\)[^}]*href: `\$\{base\}\/settings\?tab=advanced`/.test(list) && /else if \(r\.can\.archive && state !== "suspended" && state !== "deleting"\)/.test(list))
    check("its line says when it goes", /tt\("Deleting on \{date\}", \{ date: shortDate\(r\.deleting\.deleteAt\) \}\)/.test(list))
    check("the plan note says communities being deleted do not count", /rows\.some\(\(r\) => r\.deleting && r\.role === "owner"\)/.test(list) && /Communities being deleted do not count\./.test(raw("components/community/creator/community-list.tsx")))
    for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
      const cat = raw(`lib/i18n/catalog/${lang}.ts`)
      check(`${lang}: the new words are translated`, /"Pending deletion": "[^"]+"/.test(cat) && /"Communities being deleted do not count\.": "[^"]+"/.test(cat))
    }
  }

  /* ── Public: what a state shows ──────────────────────────────────────── */
  console.log("\npublic")
  {
    const pub = code("lib/communities/server/public.ts")
    check("a draft is a 404 to everyone but its staff", /if \(community\.status === "draft" && !staff\) return null/.test(pub))
    check("only a published public one is indexable", /return c\.status === "published" && c\.visibility === "public" && !c\.suspended_at && !c\.deleted_at && !c\.platform_hidden/.test(pub))
    check("a draft's link shows nothing in a preview", /return c\.status !== "draft" && c\.status !== "suspended" && !c\.suspended_at && !c\.deleted_at/.test(pub))
  }

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\ncopy")
  for (const f of ["components/community/creator/community-list.tsx", "lib/communities/plan-limit.ts", "lib/communities/server/creator-policies.ts"]) {
    const s = raw(f)
    check(`${f}: no em dash, none of the banned words`, !/—/.test(s) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(s))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
