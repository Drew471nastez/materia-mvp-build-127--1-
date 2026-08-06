/**
 * ===========================================================================
 *  GUARDS — the rules that stop the auth bugs coming back
 * ===========================================================================
 * The other suites test behaviour. This one tests the SOURCE, because the two
 * auth bugs in this project were not wrong logic inside a function — they were
 * the same wrong shape written independently in four different files, by
 * somebody who did not know the rule because the rule was not written down
 * anywhere it could be enforced.
 *
 * A comment explaining the rule protects the file it is in. These protect the
 * files that do not exist yet.
 *
 * Two rules, both learned the expensive way:
 *
 *  1. A TIMEOUT MAY NOT NAVIGATE SOMEBODY TO A SIGNED-OUT SCREEN.
 *     Four screens had `setTimeout(() => router.replace("/login"), 10_000)` as
 *     their "safety net" for a slow session read. It is not a safety net; it
 *     throws signed-in people out of the app because a promise was slow, with
 *     their session still valid in storage. See lib/auth/session-read.ts.
 *
 *  2. THE SCREENS THAT GATE THE APP MUST USE THE BOUNDED READ.
 *     A bare `getSession()` can hang forever — on native it can block behind a
 *     lock a suspended web view never released, in which case it never settles
 *     and no timeout on the promise itself will ever run. Every gate must go
 *     through lib/auth/session-read.ts, which stops WAITING rather than trying
 *     to cancel something that cannot be cancelled.
 *
 * If one of these fails, do not delete the guard. Read
 * lib/auth/session-read.ts, then decide whether the code is wrong (it usually
 * is) or whether this is a genuine exception — and if it genuinely is, mark
 * that one line with the escape hatch below so the reason is recorded next to
 * the code rather than lost in a commit message.
 *
 *     // auth-guard: allow — <why>
 *
 * Run with:  npm run test:push
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

// ── the files under inspection ──────────────────────────────────────────────

const ROOTS = ["app", "components", "lib"]
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "out", ".git"])

function sources(dir: string): string[] {
  let out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    let s
    try {
      s = statSync(p)
    } catch {
      continue
    }
    if (s.isDirectory()) out = out.concat(sources(p))
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p)
  }
  return out
}

const FILES = ROOTS.flatMap(sources)

/** The opt-out, so a genuine exception records its reason in the code. */
const ESCAPE = "auth-guard: allow"

/**
 * Comments are not code.
 *
 * Without this the guard fails on lib/auth/session-read.ts, whose header quotes
 * the exact bad pattern in order to explain it — a rule that punishes its own
 * documentation is a rule people delete the documentation to satisfy.
 *
 * Deliberately crude: it does not understand strings containing `//`, so a URL
 * in a string literal loses its tail. That cannot cause a false PASS here,
 * because everything this guard looks for (`"/login"`, `router.replace`) is
 * matched before any `//` that could appear in the same expression, and the
 * worst case is a missed line rather than a wrongly flagged one.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
}

// ── Rule 1 — no timeout may eject somebody to a signed-out screen ───────────

/**
 * Destinations that mean "you are not signed in". Reaching one of these from a
 * timer is the bug: the timer fires because something was SLOW, and slow is not
 * an answer about whether anybody is signed in.
 */
const SIGNED_OUT_ROUTES = ['"/login"', "'/login'", '"/welcome"', "'/welcome'", "`/login", "`/welcome"]
const NAVIGATIONS = ["router.replace", "router.push", "location.assign", "location.replace", "location.href"]

/**
 * The body of every setTimeout in a file, roughly.
 *
 * Brace-matched from the callback rather than a fixed window, so a long handler
 * is not silently half-read — the half this misses is exactly where somebody
 * would put the redirect.
 */
function timeoutBodies(src: string): Array<{ body: string; line: number }> {
  const out: Array<{ body: string; line: number }> = []
  const re = /setTimeout\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === "(") depth++
      else if (c === ")") {
        depth--
        if (depth === 0) break
      }
    }
    const body = src.slice(m.index, Math.min(i + 1, src.length))
    out.push({ body, line: src.slice(0, m.index).split("\n").length })
  }
  return out
}

function run() {
  section("Rule 1 — a timeout may not navigate to a signed-out screen")
  {
    const offenders: string[] = []
    for (const file of FILES) {
      const raw = readFileSync(file, "utf8")
      if (!raw.includes("setTimeout")) continue
      const src = stripComments(raw)
      for (const { body, line } of timeoutBodies(src)) {
        if (body.includes(ESCAPE)) continue

        // ── The two shapes that are CORRECT, not merely tolerated ──────────
        //
        // Consulting the durable evidence first. This is the whole fix: the
        // timer fired because a read was slow, so it asks the one question that
        // cannot be slow — is there a token on this device — before deciding.
        // A timeout that does this is not guessing.
        if (body.includes("hasStoredSessionToken") || body.includes("treatAsSignedIn")) continue
        //
        // A DELIBERATE sign-out. app/(auth)/reset-password/page.tsx signs you
        // out three seconds after changing your password, so the success
        // message can be read first. The timer is not deciding whether you are
        // signed in — it already knows, because it is the thing signing you
        // out. That is the opposite of the bug.
        if (body.includes("signOut(")) continue

        const goesSignedOut = SIGNED_OUT_ROUTES.some((r) => body.includes(r))
        const navigates = NAVIGATIONS.some((n) => body.includes(n))
        if (goesSignedOut && navigates) offenders.push(`${file}:${line}`)
      }
    }
    check(
      "no setTimeout redirects to /login or /welcome",
      offenders.length === 0,
      offenders.length
        ? `          A slow session read is NOT proof that nobody is signed in.\n` +
          `          Use hasStoredSessionToken() from lib/auth/session-read.ts to decide.\n` +
          offenders.map((o) => `            ${o}`).join("\n")
        : undefined,
    )
  }

  // ── Rule 2 — the gates must use the bounded read ─────────────────────────
  section("Rule 2 — every screen that gates the app uses the bounded read")
  {
    /**
     * The four places that decide whether to show the app or the sign-in
     * screen. These are the ones that hurt when they get it wrong, and they are
     * listed by name rather than detected, because "is this a gate" is a
     * judgement a regex should not be making.
     */
    const GATES = [
      "lib/use-auth-gate.ts",
      "components/native-auth-gate.tsx",
      "app/native-start/page.tsx",
      "app/(auth)/signup/page.tsx",
    ]
    for (const gate of GATES) {
      let src = ""
      try {
        src = readFileSync(gate, "utf8")
      } catch {
        check(`${gate} exists`, false, `          missing — did it move? Update this guard.`)
        continue
      }
      const usesBounded =
        src.includes("readSessionBounded") ||
        src.includes("hasStoredSessionToken") ||
        src.includes("treatAsSignedIn")
      check(
        `${gate} goes through lib/auth/session-read`,
        usesBounded,
        `          A bare getSession() here can hang forever and the UI waits on it.`,
      )
    }
  }

  // ── Rule 3 — the rule itself is still documented where it is enforced ────
  section("Rule 3 — the shared helper still says what it is for")
  {
    let src = ""
    try {
      src = readFileSync("lib/auth/session-read.ts", "utf8")
    } catch {
      /* reported below */
    }
    check("lib/auth/session-read.ts exists", src.length > 0)
    check(
      "and still explains the rule it exists to enforce",
      src.includes("A TIMEOUT IS NOT A SIGNED-OUT"),
      `          The comment is the only place this reasoning is written down.\n` +
        `          Deleting it turns a documented decision back into folklore.`,
    )
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nfailing: ${failures.join(", ")}`)
    process.exit(1)
  }
}

run()
