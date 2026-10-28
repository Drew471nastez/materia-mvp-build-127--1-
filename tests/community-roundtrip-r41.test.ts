/**
 * Round 41: /app/community and a community's admin, there and back (scripts/check-community-roundtrip.mjs measures it
 * at 390 and 1280, CREATE=1 through New community).
 *
 *   ROUND TRIP   a card opens its community one entry after the list; the back arrow is one traversal back to that
 *                entry however many sections were opened (Navigation API index), the landing checked; the list lands
 *                with no fade and its scroll as it was.
 *   CREATE       New community opens the wizard the same way; Create replaces the wizard's entry with the community
 *                it made, which keeps "opened from the list", so its back arrow lands once on the list.
 *   APPROVE ALL  one POST to join-requests per APPROVE_MANY requests, each one through actOnMember on the server (the
 *                approve_member permission, the rank check, the audit line), as PATCH members/<userId> does.
 */
import { readCode } from "./_source"
import { APPROVE_MANY } from "@/components/community/creator/logic"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`)
  }
}

const ret = readCode("components/app/list-return.ts")
const back = readCode("lib/navigation/go-back.ts")
const list = readCode("components/community/creator/community-list.tsx")
const shell = readCode("components/community/creator/community-shell.tsx")
const create = readCode("components/community/creator/create-flow.tsx")
const panel = readCode("components/community/creator/join-requests-panel.tsx")
const route = readCode("app/api/app/community/[id]/join-requests/route.ts")

console.log("\nROUND TRIP")
check("the list's entry is noted at the press, by its Navigation API index", /listIndex = navigationEntries\(\)\?\.currentEntry\?\.index \?\? null\s*\n\s*router\.push\(href\)/.test(ret))
check("the way back is that many entries, checked by the list's address, one back without the API", /return here - listIndex/.test(ret) && /new URL\(entry\.url\)\.pathname !== listHref\) return 1/.test(ret) && /if \(!nav \|\| listIndex === null\) return 1/.test(ret))
check("a back that lands anywhere but the list puts the list up there, marked as a return", /if \(window\.location\.pathname !== listHref\) replaceWithList\(\)/.test(ret) && /markTraversal\(\)\s*\n\s*router\.replace\(listHref\)/.test(ret))
check("more than one entry is one history.go", /if \(steps > 1\) window\.history\.go\(-Math\.floor\(steps\)\)/.test(back))
check("a card's plain press opens through the list's way in; a middle click stays the browser's", /if \(!isPlainClick\(e\)\) return\s*\n\s*e\.preventDefault\(\)\s*\n\s*onOpen\(base\)/.test(list))
check("back on the list: no landing, the card tinted", /if \(returning\) holdLanding\(\)/.test(list) && /tintReturnedRow\(listRef\.current, back\.id, LAYER_LEAVE_MS\)/.test(list) && /data-row=\{r\.id\}/.test(list))
check("the shell notes its origin, keeps the list warm and its arrow leaves through it", /communitiesReturn\.useOrigin\(\)/.test(shell) && /prefetchAppPage\(router, communitiesReturn\.href, \{ keepWarm: true \}\)/.test(shell) && /communitiesReturn\.leave\(router, \{ id: head\.id \}\)/.test(shell))

console.log("\nCREATE")
check("New community opens the wizard through the list's way in (the upgrade sheet at the limit)", /if \(!room\) return setUpgrade\(true\)\s*\n[\s\S]{0,200}communitiesReturn\.open\(router, "\/app\/community\/new"\)/.test(list))
check("the wizard notes it was opened from the list", /communitiesReturn\.useOrigin\(\)/.test(create))
check("Create replaces the wizard's own entry, never pushes after it", /router\.replace\(`\/app\/community\/\$\{made\.slug\}\?created=1`\)/.test(create) && !/router\.push\(`\/app\/community\/\$\{made\.slug\}/.test(create))
check("Cancel and the arrow go back to the list it came from", (create.match(/onClick=\{leaveToList\}/g) ?? []).length === 2 && /communitiesReturn\.leave\(router, \{ id: null \}\)/.test(create))

console.log("\nAPPROVE ALL")
check("at most 50 a request", APPROVE_MANY === 50)
check("the panel sends the queue in parts of APPROVE_MANY, one POST each, never a PATCH per person", /i \+= APPROVE_MANY/.test(panel) && /join-requests`, "POST", \{ action: "approve", userIds: part \}/.test(panel) && !/await act\(r, "approve"\)/.test(panel))
check("the route asks approve_member and the rate limit once, refuses anything but 1 to 50 ids", /requireCreatorCommunity\(id, "approve_member"\)/.test(route.slice(route.indexOf("export async function POST"))) && /manageLimit\(gate\.ctx\.userId\)/.test(route.slice(route.indexOf("export async function POST"))) && /ids\.length > APPROVE_MANY/.test(route))
check("each person goes through actOnMember, as the PATCH does (permission, rank, audit per person)", /for \(const userId of ids\) \{\s*\n\s*const done = await actOnMember\(gate\.ctx\.admin, \{ community: gate\.community, actor, action: "approve", userId/.test(route))
check("it says which it could not", /failed\.push\(\{ userId, error: done\.error \}\)/.test(route) && /if \(res\.data\.failed\?\.length\) problem = /.test(panel))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
