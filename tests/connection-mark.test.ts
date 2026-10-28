/**
 * ===========================================================================
 *  WHICH MARK THE TOP BAR SHOWS, AND HOW OFTEN THE EDITOR ASKS
 * ===========================================================================
 * The editor's top bar shows one connection: the one that acted most
 * recently, else any live agent connection, else the GitHub link, else
 * GitHub's mark without a dot. lib/agent-access/connection-mark.ts decides,
 * from a brief that carries names and times and never a token.
 *
 * And the activity log is read quickly while changes arrive and more slowly
 * while nothing does, not at all while nothing is connected, never while the
 * tab is hidden. The rendered behaviour is measured by
 * scripts/check-live-notice.mjs; these pin the rules and the costs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  POLL_ACTIVE_MS,
  POLL_BASE_MS,
  POLL_MAX_MS,
  actedRecently,
  connectionTip,
  describeChange,
  kindForName,
  activityFollowUp,
  nextPollDelay,
  pickConnection,
  sectionTypeOf,
  type ConnectionsBrief,
} from "../lib/agent-access/connection-mark"
import { revealWithin } from "../lib/website-builder/canvas-scroll"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? `: ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString()

function main() {
  console.log("\nA connection's mark, from the name it was given")
  check("Claude Code is Claude", kindForName("Claude Code") === "claude")
  check("and so is anything naming Claude", kindForName("claude on my laptop") === "claude")
  check("Codex is OpenAI's", kindForName("Codex") === "openai")
  check("and so are ChatGPT and OpenAI", kindForName("ChatGPT") === "openai" && kindForName("OpenAI Codex") === "openai")
  check("a GitHub push is GitHub", kindForName("GitHub") === "github" && kindForName("GitHub · drew471") === "github")
  check("anything else is a plain agent", kindForName("AI agent") === "agent" && kindForName("GitHub Copilot") === "agent")

  console.log("\nWhich one the bar shows")
  const none = pickConnection({ agents: [], github: null, latest: null })
  check("nothing connected: GitHub's mark, no dot", none.kind === "github" && !none.online)
  check("before the brief is read, the same", pickConnection(null).kind === "github" && !pickConnection(null).online)

  const githubOnly = pickConnection({ agents: [], github: { repo: "drew/shop" }, latest: null })
  check("a GitHub link: GitHub, live, named by its repository", githubOnly.kind === "github" && githubOnly.online && githubOnly.label === "GitHub: drew/shop")

  const both: ConnectionsBrief = { agents: [{ name: "Claude Code", lastUsedAt: null }], github: { repo: "drew/shop" }, latest: null }
  const agentFirst = pickConnection(both)
  check("an agent connection beats a GitHub link when neither has acted", agentFirst.kind === "claude" && agentFirst.label === "Claude Code connected")
  check("and the tooltip names the other", agentFirst.others.join() === "GitHub: drew/shop")

  const pushed = pickConnection({ ...both, agents: [{ name: "Claude Code", lastUsedAt: ago(600) }], latest: { name: "GitHub · drew", at: ago(30) } })
  check("the one that acted last wins: a push a moment ago beats a token used ten minutes ago", pushed.kind === "github", pushed.kind)

  const codexUsed = pickConnection({ agents: [{ name: "Claude Code", lastUsedAt: ago(900) }, { name: "Codex", lastUsedAt: ago(20) }], github: null, latest: { name: "Claude Code", at: ago(300) } })
  check("a token's last use counts as acting", codexUsed.kind === "openai" && codexUsed.name === "Codex", codexUsed.name)

  const unknownWriter = pickConnection({ agents: [], github: null, latest: { name: "Codex", at: ago(5) } })
  check("a writer made after the brief was read is still shown", unknownWriter.kind === "openai" && unknownWriter.online)
  const oldPush = pickConnection({ agents: [], github: null, latest: { name: "GitHub", at: ago(5) } })
  check("but a push from a link since removed is not a connection", !oldPush.online)

  check("recent means within five minutes", actedRecently(pushed, Date.now()) && !actedRecently({ ...pushed, lastActiveAt: Date.now() - 6 * 60_000 }, Date.now()))

  console.log("\nHow often it asks")
  let d = POLL_BASE_MS
  const idle: number[] = []
  for (let i = 0; i < 8; i++) idle.push((d = nextPollDelay(d, false)))
  check("idle, it slows down", idle.every((x, i) => i === 0 || x >= idle[i - 1]), idle.join(","))
  // Changed on purpose (round AA): a GitHub push sat unseen for up to twenty seconds; the owner asked for it to show without waiting.
  check("to one small read every ten seconds and no slower", idle[idle.length - 1] === POLL_MAX_MS && POLL_MAX_MS === 10_000)
  // Changed on purpose (the owner: lower Vercel costs): after two quiet minutes with nobody at the editor it reads every thirty seconds; tests/polling-costs.test.ts pins that.
  check("changes arriving bring it back to about once a second, so the page follows a push", nextPollDelay(POLL_MAX_MS, true) === POLL_ACTIVE_MS && POLL_ACTIVE_MS === 1_000)
  check("a missing activity table stops the editor; a blip is asked again", activityFollowUp(200, { missing: true, ready: false }) === "stop" && activityFollowUp(503, { ready: true, retry: true }) === "retry" && activityFollowUp(401, null) === "retry" && activityFollowUp(200, { ready: true }) === "ok" && activityFollowUp(200, { ready: false }) === "retry")
  check("an hour idle is at most 370 small reads, where it was 720 at the start", Math.ceil(3_600_000 / POLL_MAX_MS) + 10 <= 370)

  console.log("\nThe notice's lines, in words")
  const name = (t: string) => ({ hero: "Hero", pricing: "Pricing", faq_section: "FAQ section" } as Record<string, string>)[t]
  check("a new section", describeChange({ id: 1, agent_name: "Claude Code", path: "sections/pricing.storelib", action: "created" }, name) === "New section: Pricing")
  check("an updated one", describeChange({ id: 2, agent_name: "Claude Code", path: "sections/hero.storelib", action: "updated" }, name) === "Hero section updated")
  check("without saying section twice", describeChange({ id: 3, agent_name: "x", path: "sections/faq_section.storelib", action: "updated" }, name) === "FAQ section updated")
  check("a file with no schema yet is named from its file", describeChange({ id: 4, agent_name: "x", path: "sections/image_slider.storelib", action: "created" }, () => undefined) === "New section: Image slider")
  check("theme settings", describeChange({ id: 5, agent_name: "x", path: "config/settings_data.json", action: "updated" }, name) === "Theme settings changed")
  check("the section a line points at", sectionTypeOf("sections/hero.storelib") === "hero" && sectionTypeOf("config/x.json") === null)

  console.log("\nA section is brought into the canvas only when none of it shows")
  const scroller = (top: number, bottom: number) => {
    const s = { scrollTop: 500, moved: null as number | null, getBoundingClientRect: () => ({ top, bottom }), scrollTo: ({ top: t }: { top: number }) => { s.moved = t } }
    return s
  }
  const at = (top: number, bottom: number) => ({ getBoundingClientRect: () => ({ top, bottom }) })
  const a = scroller(50, 850)
  check("wholly on screen: left alone", revealWithin(a, at(200, 400)) === null && a.moved === null)
  const b = scroller(50, 850)
  check("a sliver at the bottom: left alone", revealWithin(b, at(840, 1400)) === null && b.moved === null)
  const c = scroller(50, 850)
  check("a sliver at the top: left alone", revealWithin(c, at(-600, 60)) === null && c.moved === null)
  const e = scroller(50, 850)
  check("entirely below: brought to the top", revealWithin(e, at(1200, 1500)) === 1650 && e.moved === 1650)
  const f = scroller(50, 850)
  check("entirely above: brought to the top", revealWithin(f, at(-500, 20)) === 0 && f.moved === 0)

  console.log("\nWhat the route and the editor cost")
  const route = read("app/api/website-builder/themes/[installId]/agent-activity/route.ts")
  const follow = read("components/website-builder/site-connections.tsx")
  check("the follow read is one query on (install_id, id), twenty rows at most",
    /* Changed on purpose (round G): beside the log, one indexed read of the GitHub link's row, so a failed push (which writes no log line) still reaches the editor. */ (route.split("if (after === null)")[1] ?? "").split("\n  }\n")[1]?.match(/\.from\("theme_agent_activity"\)/g)?.length === 1 && /\.gt\("id", after\)/.test(route) && /\.limit\(20\)/.test(route))
  check("the brief is three small reads side by side, not one per connection", /await Promise\.all\(\[/.test(route) && /\.limit\(10\)/.test(route) && /\.maybeSingle\(\)/.test(route))
  check("and never carries a token, a prefix or a hash", !/token_hash|prefix/.test(route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
  check("connection status stays separate from following newly connected writers", /const connected = ready && !!brief && \(brief\.agents\.length > 0 \|\| !!brief\.github\)/.test(follow) && /if \(!ready\) return/.test(follow) && !/if \(!connected\) return/.test(follow))
  check("a hidden tab stops asking, and coming back asks at once", /document\.visibilityState !== "visible"/.test(follow) && /document\.addEventListener\("visibilitychange", wake\)/.test(follow) && /window\.addEventListener\("focus", wake\)/.test(follow))
  check("one read at a time", /if \(stopped \|\| busy/.test(follow))

  console.log("\nThe tooltip is four words at most")
  {
    const tips = [
      connectionTip(pickConnection(null)),
      connectionTip(pickConnection({ agents: [], github: { repo: "drew/storely" }, latest: null } as unknown as ConnectionsBrief)),
      connectionTip(pickConnection({ agents: [{ name: "Claude Code", lastUsedAt: null }, { name: "Codex", lastUsedAt: null }, { name: "My ChatGPT", lastUsedAt: null }], github: { repo: "drew/storely" }, latest: { name: "Claude Code", at: new Date().toISOString() } } as unknown as ConnectionsBrief)),
    ]
    check("nothing connected, one connected, several connected", tips[0] === "Connect an agent" && tips[1] === "GitHub connected" && tips[2] === "Claude + 3 more", tips.join(" | "))
    check("never more than four words, and never the repo or the list", tips.every((t) => t.split(/\s+/).length <= 4 && !t.includes("/")))
    check("the top bar's tooltip is that line alone", /<TooltipContent side="bottom">\{connectionTip\(mark\)\}/.test(readFileSync(join(process.cwd(), "components/website-builder/site-connections.tsx"), "utf8")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
