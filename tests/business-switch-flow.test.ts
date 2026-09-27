/**
 * ===========================================================================
 *  A SWITCH ENDS, WHATEVER NEVER ANSWERS
 * ===========================================================================
 * "On mobile devices, when I'm switching business, and it shows the loading
 * 'Switching to ...', sometimes it gets stuck there. Just ensure this never
 * happens."
 *
 * lib/businesses/switch-flow runs every step of a switch against parts the
 * browser hands it. Here those parts are fakes that can answer, refuse, or
 * never answer at all, on a clock this file moves by hand, so each wait's
 * limit and each way out is held to what it must be:
 *
 *   the token read that never answers     the jar's token, after AUTH_READ_MS
 *   the server that never answers         failed after ASK_MS, the request aborted
 *     ...but did switch                   the new business, from the jar's proof
 *   a refusal                             failed, the server's words, no Try again
 *   a web view that dropped the cookies   written straight into the jar
 *   the app's client that never answers   the page opens anyway after APPLY_MS
 *   the page that never comes             asked again at NAV_RETRY_MS, then stalled
 *   the page shown again from the cache   asked for again at once
 *   two presses                           one switch
 *   the new page's own screen             its limits, and the script for a
 *                                         page whose script never runs
 *   the session's cookies                 read back as the client's own
 */
import { runInNewContext } from "node:vm"
import {
  APPLY_MS,
  ASK_MS,
  AUTH_READ_MS,
  failureOf,
  NAV_GIVE_UP_MS,
  NAV_RETRY_MS,
  runSwitch,
  single,
  tokenUser,
  type AskAnswer,
  type SwitchDeps,
  type SwitchOutcome,
  type SwitchPhase,
} from "../lib/businesses/switch-flow"
import {
  ARRIVAL_CAP_MS,
  ARRIVAL_GIVE_UP_MS,
  ARRIVAL_HARD_CAP_MS,
  ARRIVAL_SETTLE_CAP_MS,
  HANDOVER_MS,
  SWITCH_ARRIVAL_SCRIPT,
  SWITCH_COOKIE,
  SWITCH_HTML_CLASS,
} from "../lib/businesses/switch-screen"
import { fresherSession, readSessionFromCookies, sessionCookieChunks, sessionCookieWrites, storedSessionJson } from "../lib/supabase/session-jar"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}

/* ── A clock moved by hand ──────────────────────────────────────────────── */

const flush = () => new Promise<void>((r) => setImmediate(r))

class Clock {
  now = 0
  private timers: { at: number; fn: () => void; id: number }[] = []
  private next = 1
  setTimer = (fn: () => void, ms: number) => {
    const id = this.next++
    this.timers.push({ at: this.now + ms, fn, id })
    return id
  }
  clearTimer = (id: unknown) => {
    this.timers = this.timers.filter((t) => t.id !== id)
  }
  /** Move on by `ms`, running every timer that falls due, in order, with the promises they start. */
  async advance(ms: number) {
    const target = this.now + ms
    for (;;) {
      await flush()
      const due = this.timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.timers = this.timers.filter((t) => t !== due)
      this.now = due.at
      due.fn()
    }
    this.now = target
    await flush()
  }
}

const never = <T>() => new Promise<T>(() => {})

/* A token whose `sub` is the account, as Supabase's are. */
function jwt(sub: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
  return `${b64({ alg: "HS256" })}.${b64({ sub, exp: 9_999_999_999 })}.sig`
}
const OLD = "00000000-0000-4000-8000-00000000000a"
const NEW = "00000000-0000-4000-8000-00000000000b"
const SESSION = { access_token: jwt(NEW), refresh_token: "r", expires_at: 2_000_000_000, expires_in: 3600, token_type: "bearer", user: { id: NEW } }
const YES: AskAnswer = { ok: true, status: 200, data: { session: SESSION } }

interface Log {
  phases: SwitchPhase[]
  navigations: number[]
  asked: { headers: Record<string, string>; signal: AbortSignal }[]
  writes: number
  paused: number
  resumed: number
  prepared: number
}

/**
 * A browser. By default everything answers at once, the server says yes and
 * its answer's cookies land in the jar. Each part can be swapped for one
 * that refuses or never answers.
 */
function browser(clock: Clock, over: Partial<SwitchDeps> & { serverSetsCookie?: boolean } = {}) {
  const log: Log = { phases: [], navigations: [], asked: [], writes: 0, paused: 0, resumed: 0, prepared: 0 }
  let jarUser: string | null = OLD
  const restoreHandlers: (() => void)[] = []
  const serverSetsCookie = over.serverSetsCookie ?? true
  const deps: SwitchDeps = {
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    readToken: async () => jwt(OLD),
    jarToken: async () => (jarUser ? jwt(jarUser) : null),
    ask: async (headers, signal) => {
      log.asked.push({ headers, signal })
      if (serverSetsCookie) jarUser = NEW
      return YES
    },
    jarHolds: async (id) => jarUser === id,
    writeJar: () => {
      log.writes++
      jarUser = NEW
    },
    pauseRenewal: () => void log.paused++,
    resumeRenewal: () => void log.resumed++,
    prepare: () => void log.prepared++,
    navigate: () => void log.navigations.push(clock.now),
    onPhase: (p) => void log.phases.push(p),
    onRestored: (fn) => {
      restoreHandlers.push(fn)
      return () => {
        const i = restoreHandlers.indexOf(fn)
        if (i !== -1) restoreHandlers.splice(i, 1)
      }
    },
    ...over,
  }
  return { deps, log, restore: () => restoreHandlers.slice().forEach((fn) => fn()), setJar: (u: string | null) => { jarUser = u } }
}

function track(p: Promise<SwitchOutcome>) {
  const box: { outcome: SwitchOutcome | null } = { outcome: null }
  p.then((o) => { box.outcome = o })
  return box
}

const FALLBACK = "That business could not be opened. Try again."

async function main() {
  console.log("\nThe way it should go")
  {
    const clock = new Clock()
    const { deps, log } = browser(clock)
    const run = track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(0)
    check("the server's yes opens the new page at once", log.navigations.length === 1 && log.navigations[0] === 0, log.navigations)
    check("  asking, then opening", log.phases.join(">") === "asking>opening", log.phases)
    check("  with the browser's own token in the header", log.asked[0]?.headers.Authorization === `Bearer ${jwt(OLD)}`)
    check("  the client's renewing of the old session stopped first, so it cannot write the old business back into the jar", log.paused === 1 && log.resumed === 0)
    check("  the jar already held it from the answer's cookies: nothing written by hand", log.writes === 0)
    check("  what is kept per account emptied, and the screen's cookie written, just before", log.prepared === 1)
    check("  and the switch has not ended while the page is on its way", run.outcome === null)
  }

  console.log("\nThe token for the header never comes")
  {
    const clock = new Clock()
    const { deps, log } = browser(clock, { readToken: () => never<string>() })
    track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(AUTH_READ_MS - 1)
    check("nothing is sent while the client may still answer", log.asked.length === 0)
    await clock.advance(1)
    check(`after ${AUTH_READ_MS}ms the request goes, with the token straight from the jar`, log.asked.length === 1 && log.asked[0].headers.Authorization === `Bearer ${jwt(OLD)}`)
    check("  and the new page is asked for", log.navigations.length === 1)
  }
  {
    const clock = new Clock()
    const { deps, log } = browser(clock, { readToken: () => never<string>(), jarToken: async () => null })
    track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(AUTH_READ_MS)
    check("  no token anywhere: the request goes on its cookie alone", log.asked.length === 1 && !("Authorization" in log.asked[0].headers))
  }

  console.log("\nThe server never answers")
  {
    const clock = new Clock()
    let aborted = false
    const { deps, log } = browser(clock, {
      ask: (_h, signal) => {
        signal.addEventListener("abort", () => { aborted = true })
        return never<AskAnswer>()
      },
    })
    const run = track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(ASK_MS - 1)
    check("still asking just before the limit", run.outcome === null && log.phases.join(">") === "asking")
    await clock.advance(1)
    check(`after ${ASK_MS}ms it has failed, in a sentence, with Try again`, run.outcome?.kind === "failed" && run.outcome.message === FALLBACK && run.outcome.retry === true, run.outcome)
    check("  the request aborted, not left running", aborted)
    check("  the page never asked for, the old session's renewing started again", log.navigations.length === 0 && log.resumed === 1)
    check("  and the limit counts from the request, not from before the token was read", clock.now === ASK_MS)
  }
  {
    const clock = new Clock()
    const b = browser(clock, { ask: () => never<AskAnswer>() })
    const run = track(runSwitch(b.deps, NEW, "/app", FALLBACK))
    await clock.advance(ASK_MS / 2)
    /* The answer reached the browser, set its cookies, and was lost on the way to the page. */
    b.setJar(NEW)
    await clock.advance(ASK_MS / 2)
    check("the answer lost but the server switched: the jar proves it, and the new business opens", run.outcome === null && b.log.navigations.length === 1 && b.log.phases.includes("opening"), b.log)
  }
  {
    const clock = new Clock()
    /* The client's token read and the server both hang. (The jar is read straight from document.cookie: it has nothing to wait on.) */
    const { deps, log } = browser(clock, { readToken: () => never<string>(), ask: () => never<AskAnswer>() })
    const run = track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(AUTH_READ_MS + ASK_MS)
    check(`everything hangs at once: over in ${AUTH_READ_MS + ASK_MS}ms, never longer`, run.outcome?.kind === "failed" && log.navigations.length === 0, run.outcome)
  }

  console.log("\nThe server says no")
  {
    const clock = new Clock()
    const { deps, log } = browser(clock, { ask: async () => ({ ok: false, status: 403, data: { error: "That business is not yours to open." } }), serverSetsCookie: false })
    const run = track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(0)
    check("its own words, and no Try again: pressing again cannot change it", run.outcome?.kind === "failed" && run.outcome.message === "That business is not yours to open." && run.outcome.retry === false, run.outcome)
    check("  nothing written, nothing opened", log.writes === 0 && log.navigations.length === 0)
  }
  {
    const clock = new Clock()
    const { deps } = browser(clock, { ask: async () => ({ ok: false, status: 502, data: {} }), serverSetsCookie: false })
    const run = track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(0)
    check("a server error with nothing said: the plain sentence, with Try again", run.outcome?.kind === "failed" && run.outcome.message === FALLBACK && run.outcome.retry)
  }
  check("too many switches keeps its own words and gets no Try again (it says when)", failureOf({ ok: false, status: 429, data: { error: "Too many switches just now. Try again in a minute." } }, FALLBACK).retry === false)

  console.log("\nA web view that drops the answer's cookies")
  {
    const clock = new Clock()
    const { deps, log } = browser(clock, { serverSetsCookie: false })
    track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(0)
    check("the session is written straight into the jar, then the page asked for", log.writes === 1 && log.navigations.length === 1)
  }
  {
    const clock = new Clock()
    const { deps, log } = browser(clock, { serverSetsCookie: false, writeJar: () => { throw new Error("no cookies") } })
    const run = track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(0)
    check("  and a jar that will not take it: failed, never the old business opened under the new one's name", run.outcome?.kind === "failed" && log.navigations.length === 0 && log.resumed === 1)
  }

  console.log("\nThe app's own client never answers")
  {
    const clock = new Clock()
    const { deps, log } = browser(clock, { applyToClient: () => never() })
    track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(APPLY_MS - 1)
    check("the device store gets its chance", log.navigations.length === 0)
    await clock.advance(1)
    check(`and after ${APPLY_MS}ms the page opens anyway: the jar holds the session, and the device catches up from it`, log.navigations.length === 1)
  }

  console.log("\nThe new page never comes")
  {
    const clock = new Clock()
    const { deps, log } = browser(clock)
    const run = track(runSwitch(deps, NEW, "/app", FALLBACK))
    await clock.advance(NAV_RETRY_MS)
    check(`asked for again after ${NAV_RETRY_MS}ms`, log.navigations.length === 2 && log.navigations[1] === NAV_RETRY_MS, log.navigations)
    await clock.advance(NAV_GIVE_UP_MS - NAV_RETRY_MS - 1)
    check("  still waiting just before the limit", run.outcome === null)
    await clock.advance(1)
    check(`  and after ${NAV_GIVE_UP_MS}ms the wait ends: stalled, so the screen says so with Try again`, run.outcome?.kind === "stalled" && log.phases[log.phases.length - 1] === "stalled", run.outcome)
    await clock.advance(NAV_GIVE_UP_MS * 2)
    check("  and nothing is asked for after that on its own", log.navigations.length === 2)
  }

  console.log("\nThe page shown again from the back and forward cache")
  {
    const clock = new Clock()
    const b = browser(clock)
    const run = track(runSwitch(b.deps, NEW, "/app", FALLBACK))
    await clock.advance(NAV_RETRY_MS - 1000)
    b.restore()
    check("the new page is asked for again the moment it is shown", b.log.navigations.length === 2 && b.log.navigations[1] === NAV_RETRY_MS - 1000)
    await clock.advance(NAV_GIVE_UP_MS - 1)
    check("  and its limits start over from there", run.outcome === null)
    await clock.advance(1)
    check("  and still end", run.outcome?.kind === "stalled")
  }

  console.log("\nTwo presses")
  {
    let runs = 0
    const once = single(async (to: string) => {
      runs++
      await new Promise((r) => setTimeout(r, 5))
      return to
    })
    const a = once("x")
    const b = once("y")
    check("the second joins the first: one request, one session", a === b && runs === 1 && (await a) === "x")
    const c = once("z")
    check("  and once it has ended, a new press is a new switch", c !== a && (await c) === "z" && runs === 2)
  }

  console.log("\nWho a token belongs to")
  check("the account in the token", tokenUser(jwt(NEW)) === NEW)
  check("  anything else is nobody", tokenUser("a") === null && tokenUser(null) === null && tokenUser("x.!!!.y") === null)

  console.log("\nThe new page's own screen")
  check("the gate on the device (10s) ends before the screen's hard limit, so the screen hands over to its end, never to its cold start",
    ARRIVAL_HARD_CAP_MS > 10_000 + HANDOVER_MS)
  check("  and the page's own waits fit inside it", ARRIVAL_CAP_MS + ARRIVAL_SETTLE_CAP_MS + HANDOVER_MS < ARRIVAL_HARD_CAP_MS)
  check("  and the HTML's limit, for a page with no script, is after the script's", ARRIVAL_GIVE_UP_MS > ARRIVAL_HARD_CAP_MS)
  {
    /* The HTML's own script, in a page whose own script never loads. */
    const made = (owned: boolean) => {
      const timers: (() => void)[] = []
      const classes = new Set([SWITCH_HTML_CLASS, "light"])
      const screen = { style: { display: "" } }
      const doc = {
        cookie: "",
        documentElement: { style: { setProperty() {} }, classList: { remove: (c: string) => classes.delete(c) } },
        querySelectorAll: (sel: string) => (sel === "[data-business-switch-screen]" ? [screen] : []),
      }
      const win: Record<string, unknown> = {
        setTimeout: (fn: () => void, ms: number) => { if (ms === ARRIVAL_GIVE_UP_MS) timers.push(fn); return 7 },
        matchMedia: () => ({ matches: false }),
      }
      win.window = win
      runInNewContext(SWITCH_ARRIVAL_SCRIPT, { window: win, document: doc, location: { protocol: "https:" }, setTimeout: win.setTimeout, matchMedia: win.matchMedia, Date })
      if (owned) win.__slSwitchOwned = true
      timers.forEach((fn) => fn())
      return { timers: timers.length, classes, screen, cookie: doc.cookie, handle: win.__slSwitchGiveUp }
    }
    const alone = made(false)
    check("a page whose script never runs: the screen is hidden, the cookie cleared, the canvas given back",
      alone.timers === 1 && alone.screen.style.display === "none" && !alone.classes.has(SWITCH_HTML_CLASS) && alone.cookie.startsWith(`${SWITCH_COOKIE}=; Path=/app; Max-Age=0`) && /Secure/.test(alone.cookie), alone)
    const owned = made(true)
    check("  and once the script has taken over, that timer touches nothing", owned.screen.style.display === "" && owned.classes.has(SWITCH_HTML_CLASS) && owned.cookie === "" && owned.handle === 7)
  }

  console.log("\nThe session's cookies")
  {
    const key = "sb-abcdefgh-auth-token"
    const json = storedSessionJson(SESSION)
    const parsed = JSON.parse(json)
    check("stored as the client stores it: the tokens, the expiry, the user", parsed.access_token === SESSION.access_token && parsed.refresh_token === "r" && parsed.expires_at === SESSION.expires_at && parsed.user?.id === NEW && parsed.token_type === "bearer")
    const header = sessionCookieWrites(key, json, "", true).map((l) => l.split(";")[0]).join("; ")
    check("  and read back from the jar as exactly that", (await readSessionFromCookies(key, header)) === json)
    const { set, expire } = sessionCookieChunks(key, json, [`${key}.0`, `${key}.1`, `${key}.2`, "other"])
    check("  the server's own chunks are the same chunks, and older ones it no longer needs are expired",
      set.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ") === header && expire.every((n) => n.startsWith(key)) && !expire.includes("other"))
    const older = JSON.stringify({ ...JSON.parse(json), expires_at: SESSION.expires_at - 600, access_token: jwt(OLD) })
    check("  and the app's device copy of the business before loses to it: the new page opens as the new business", fresherSession(older, json) === json)
    const missing = JSON.parse(storedSessionJson({ access_token: "a", refresh_token: "b", expires_in: 3600 }, 1_000))
    check("  an answer with no expiry gets one from its length", missing.expires_at === 4_600 && missing.expires_in === 3600)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
