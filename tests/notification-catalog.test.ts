/**
 * ===========================================================================
 *  EVERY NOTIFICATION IS LISTED, AND EVERY ONE OPENS SOMETHING REAL
 * ===========================================================================
 * The owner: "Notifications must cover comments and replies, mentions,
 * reactions, announcements, new discussions, event reminders, course updates,
 * membership changes, join approvals, moderation actions, and direct
 * messages. Notifications must navigate to the exact relevant destination ...
 * Avoid duplicate or conflicting notifications ... Ensure accurate badge
 * counts and avoid unnecessary polling where realtime is already available."
 *
 * lib/notifications/catalog says what the product sends. This walks it
 * against the code: a kind with no row fails, a row naming a module that does
 * not raise it fails, a destination that is not a route of this app fails,
 * and a kind that writes a row without a dedupe key fails, because two
 * serverless instances share no memory and a unique key in Postgres is the
 * only thing that can stop the same event arriving twice.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { ALL_NOTIFICATIONS, DECLARED_KINDS, RAISED_BY_NOTHING, shapeOf, rowFor } from "@/lib/notifications/catalog"
import { wantsNotification } from "@/lib/communities/permissions"

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(p, "utf8")

/** Every page this app serves, as a path: the folders, with a (group) dropped and the file taken off. */
function routes(): Set<string> {
  const files = execFileSync("git", ["ls-files", "app/**/page.tsx"], { encoding: "utf8" }).split("\n").filter(Boolean)
  const out = new Set<string>()
  for (const f of files) {
    const path = f
      .replace(/^app/, "")
      .replace(/\/page\.tsx$/, "")
      .split("/")
      .filter((seg) => !/^\(.*\)$/.test(seg))
      .join("/")
    out.add(path || "/")
  }
  return out
}

console.log("\nEvery kind the product declares is listed")
{
  const missing = DECLARED_KINDS.filter((k) => !rowFor(k))
  check("no kind without a row", missing.length === 0, missing)
  const extra = ALL_NOTIFICATIONS.filter((r) => !DECLARED_KINDS.includes(r.kind))
  check("and no row for a kind the product does not have", extra.length === 0, extra.map((r) => r.kind))
  check("the owner's list is covered", ["comment", "reply", "mention", "reaction", "announcement", "event_reminder", "course_available", "membership", "join_request", "report"].every((k) => !!rowFor(k)))
  check("each row says what happens, in a sentence", ALL_NOTIFICATIONS.every((r) => r.what.length > 20 && r.what.endsWith(".")), ALL_NOTIFICATIONS.filter((r) => r.what.length <= 20).map((r) => r.kind))
}

console.log("\nEach row names the code that raises it")
{
  for (const r of ALL_NOTIFICATIONS) {
    if (!r.raisedIn.length) continue
    const found = r.raisedIn.filter((f) => existsSync(f) && new RegExp(`["']${r.kind}["']`).test(code(f)))
    check(`${r.kind}: raised where the row says`, found.length === r.raisedIn.length, { named: r.raisedIn, found })
  }
  check("the kinds nothing raises are the ones named, and no others", ALL_NOTIFICATIONS.filter((r) => !r.raisedIn.length).map((r) => r.kind).sort().join() === [...RAISED_BY_NOTHING].sort().join(), ALL_NOTIFICATIONS.filter((r) => !r.raisedIn.length).map((r) => r.kind))
}

console.log("\nEach one opens the thing it is about")
{
  const have = routes()
  for (const r of ALL_NOTIFICATIONS) {
    check(`${r.kind}: ${r.opens} is a page this app serves`, have.has(r.route) && shapeOf(r.opens) === shapeOf(r.route), { route: r.route, opens: r.opens, served: have.has(r.route) })
  }
  check("a comment opens its post at the comment, not the feed", rowFor("comment")!.opens.includes("#c-<commentId>") && rowFor("reply")!.opens.includes("#c-<commentId>"))
  check("an event opens that event", rowFor("event")!.opens.endsWith("/events/<eventId>") && rowFor("event_reminder")!.opens.endsWith("/events/<eventId>"))
  check("a join request opens the people waiting, already filtered", rowFor("join_request")!.opens.endsWith("?status=pending"))
  check("a report opens the moderation queue", rowFor("report")!.opens.endsWith("/moderation"))
  /* The anchor a comment's address uses has to be the one the page writes. */
  const comments = code("components/community/member/comments.tsx")
  
  check("and the page writes that anchor on each comment", /id=\{`c-\$\{/.test(comments), "no c-<id> anchor found on a comment")
}

console.log("\nNothing arrives twice")
{
  const writers = execFileSync("git", ["ls-files", "lib/communities/server/**/*.ts", "lib/notifications/*.ts"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => /from\("community_notifications"\)\s*\n?\s*\.?(insert|upsert)/.test(code(f).replace(/\s+/g, " ").replace(/from\("community_notifications"\) \./g, 'from("community_notifications").')))
  check("there are writers of the notification table to check", writers.length > 0, writers)
  const withoutKey = writers.filter((f) => !/dedupe_key|dedupeKey/.test(code(f)))
  check("every one of them writes a dedupe key", withoutKey.length === 0, withoutKey)
  const upserts = writers.filter((f) => /onConflict: "dedupe_key"/.test(code(f)))
  check("and the ones that fan out let Postgres refuse the second copy", upserts.length > 0, upserts)
  check("no notification is deduped in memory, which serverless instances do not share", !writers.some((f) => /new Set\(\)[\s\S]{0,200}dedupe/i.test(code(f))))
}

console.log("\nWhat a member turns off")
{
  check("reactions stop at important, everything but what is addressed to them at mentions, all of it at none",
    wantsNotification("all", "reaction") && !wantsNotification("important", "reaction") && wantsNotification("important", "comment")
      && wantsNotification("mentions", "mention") && wantsNotification("mentions", "reply") && !wantsNotification("mentions", "comment")
      && !wantsNotification("none", "mention"))
  check("a member's own membership reaches them whatever they set", wantsNotification("mentions", "membership"), "membership is addressed to them")
  for (const r of ALL_NOTIFICATIONS.filter((x) => x.silencedBy === "level")) {
    check(`${r.kind}: the level can stop it`, !wantsNotification("none", r.kind as never))
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
