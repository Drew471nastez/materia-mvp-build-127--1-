/**
 * ===========================================================================
 *  THE BLANK PAGE, MADE IMPOSSIBLE TO REINTRODUCE
 * ===========================================================================
 * "Application error: a client-side exception has occurred" is the screen
 * Next.js paints when a client component throws and no boundary catches it.
 * It replaced the whole product, on every route, because the app had a root
 * layout and no root error boundary.
 *
 * Two guarantees are checked here, and the second is the one that matters in
 * six months:
 *
 *   1. The decision logic is driven: what counts as stale code, when the page
 *      may reload itself, what is said to the person, and what is allowed to
 *      leave the browser in a report.
 *
 *   2. EVERY ROUTE IS COVERED. The check walks app/ and fails if any page
 *      sits under a segment with no error boundary at or above it. A new
 *      section of the product added next year is covered by the root
 *      boundary, and if somebody removes that boundary this test says so
 *      rather than a visitor saying so.
 *
 * Run with:  npm run test:push
 */

import {
  RELOAD_AGAIN_MS,
  RELOAD_KEY,
  buildReport,
  isStaleCodeError,
  describeForUser,
  isChunkLoadError,
  shouldReloadForStaleCode,
} from "@/lib/client-errors"
import { staleAction } from "@/lib/ui/stale-code"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
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
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

/** A store that behaves like sessionStorage, and one that refuses to. */
function fakeStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    read: () => Object.fromEntries(map),
  }
}
const blockedStore = {
  getItem() {
    throw new Error("The operation is insecure.")
  },
  setItem() {
    throw new Error("The operation is insecure.")
  },
}

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("A deploy is not a crash")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const spellings = [
      { name: "ChunkLoadError", message: "Loading chunk 4821 failed." },
      { name: "Error", message: "Loading CSS chunk 12 failed." },
      { name: "TypeError", message: "Failed to fetch dynamically imported module: https://storelib.com/_next/static/chunks/x.js" },
      { name: "TypeError", message: "error loading dynamically imported module" },
      { name: "TypeError", message: "Importing a module script failed." },
      { name: "TypeError", message: "Expected a JavaScript module script but the server responded with a MIME type of 'text/html' is not a valid JavaScript MIME type." },
    ]
    check(
      "every engine's way of saying the code is gone is recognised",
      spellings.every((e) => isChunkLoadError(e)),
      spellings.filter((e) => !isChunkLoadError(e)).map((e) => e.message).join(" | "),
    )
    check(
      "an ordinary bug is not mistaken for one",
      !isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")) &&
        !isChunkLoadError(new Error("Failed to fetch")) &&
        !isChunkLoadError(null) &&
        !isChunkLoadError("a string"),
    )

    const store = fakeStore()
    check("a stale tab reloads itself", shouldReloadForStaleCode({ name: "ChunkLoadError", message: "Loading chunk 1 failed." }, store))
    check("and records that it did", !!store.read()[RELOAD_KEY])
    check(
      "but only once, because a reload loop is worse than the error",
      !shouldReloadForStaleCode({ name: "ChunkLoadError", message: "Loading chunk 1 failed." }, store),
    )
    check(
      "a real bug never triggers a reload",
      !shouldReloadForStaleCode(new TypeError("x is not a function"), fakeStore()),
    )
    check(
      "and neither does a browser whose storage throws, which would loop for ever",
      !shouldReloadForStaleCode({ name: "ChunkLoadError", message: "Loading chunk 1 failed." }, blockedStore),
    )
    check("nor one with no storage at all", !shouldReloadForStaleCode({ name: "ChunkLoadError", message: "x" }, null))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A deploy under Turbopack, and a tab that outlives two deploys")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* The production reports, word for word in shape: Turbopack's plain Error, no ChunkLoadError name. */
    const turbo = new Error("Failed to load chunk /_next/static/chunks/0f3c1d2e9a8b7c6d.js?dpl=dpl_8XyZ from module 81234")
    check("Turbopack's \"Failed to load chunk\" is recognised as stale code", isChunkLoadError(turbo))
    check("so it is reported as stale, not as a fault", buildReport(turbo, "https://storelib.com/checkout?product=x").stale === true)
    const store = fakeStore()
    check("and the page reloads for it", shouldReloadForStaleCode(turbo, store))

    const safari = new TypeError("Load failed")
    check("Safari's \"Load failed\" on its own is not stale code: a dropped connection says the same", !isStaleCodeError(safari) && !isStaleCodeError(safari, false))
    check("it is once a newer deploy is known to be live", isStaleCodeError(safari, true))
    check("and then it reloads like any stale chunk", shouldReloadForStaleCode(safari, fakeStore(), true) && !shouldReloadForStaleCode(safari, fakeStore(), false))
    check("a different failure is not, deploy or no deploy", !isStaleCodeError(new TypeError("Failed to fetch"), true))
    check("a report says stale for \"Load failed\" only with a newer deploy", buildReport(safari, "https://storelib.com/app", true).stale && !buildReport(safari, "https://storelib.com/app").stale)

    const t0 = 1_800_000_000_000
    const tab = fakeStore()
    check("a stale tab reloads", shouldReloadForStaleCode(turbo, tab, false, t0))
    check("a failure straight after that reload does not reload again", !shouldReloadForStaleCode(turbo, tab, false, t0 + 5_000))
    check("the next deploy, later that day, reloads the same tab again", shouldReloadForStaleCode(turbo, tab, false, t0 + RELOAD_AGAIN_MS + 1))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Outside a boundary: reload, or a bar where something was typed")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const chunk = new Error("Failed to load chunk /_next/static/chunks/a.js from module 1")
    const t = 1_800_000_000_000
    check("a page with nothing typed reloads", staleAction({ error: chunk, path: "/lucadragoste", holdsWork: false, store: fakeStore(), now: t }) === "reload")
    check("checkout never reloads by itself: a card, a company and a tip are not kept", staleAction({ error: chunk, path: "/checkout", holdsWork: false, store: fakeStore(), now: t }) === "bar")
    check("nor a page with words in a field or unsaved work", staleAction({ error: chunk, path: "/app/products/new", holdsWork: true, store: fakeStore(), now: t }) === "bar")
    check("a page that reloaded a moment ago offers the bar instead of looping", staleAction({ error: chunk, path: "/explore", holdsWork: false, store: fakeStore({ [RELOAD_KEY]: String(t - 3_000) }), now: t }) === "bar")
    check("blocked storage offers the bar, never a reload", staleAction({ error: chunk, path: "/explore", holdsWork: false, store: blockedStore, now: t }) === "bar")
    check("an ordinary bug does nothing here", staleAction({ error: new TypeError("x is not a function"), path: "/explore", holdsWork: false, store: fakeStore(), now: t }) === "none")
    const inst = readFileSync(join(root, "instrumentation-client.ts"), "utf8")
    check("installed for every page, before the app starts", /\nwatchStaleCode\(\)\n/.test(inst))
    const region = readFileSync(join(root, "components/storefront/safe-region.tsx"), "utf8")
    check("a creator page's swallowed section heals the same way", /if \(recoverFromStaleCode\(error\)\) return/.test(region))
    const screen = readFileSync(join(root, "components/platform/error-screen.tsx"), "utf8")
    check("the boundary's screen passes what it knows of a newer deploy", /shouldReloadForStaleCode\(error, store, newDeploy\)/.test(screen))
    check("and asks before deciding on a bare \"Load failed\"", /isLoadFailed\(error\) && !newDeployKnown\(\)/.test(screen) && /confirmNewDeploy\(\)/.test(screen))
    check("it decides before paint, so a stale tab never shows the error first", /useLayoutEffect/.test(screen) && /useBeforePaint\(\(\) =>/.test(screen))
    check("the website builder never reloads by itself either", staleAction({ error: chunk, path: "/website-builder/editor/abc", holdsWork: false, store: fakeStore(), now: t }) === "bar")
    check("\"Load failed\" outside a boundary does nothing until a newer deploy is known", staleAction({ error: new TypeError("Load failed"), path: "/app", holdsWork: false, store: fakeStore(), now: t }) === "none" && staleAction({ error: new TypeError("Load failed"), path: "/app", holdsWork: false, store: fakeStore(), newDeploy: true, now: t }) === "reload")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What the person reads, and what leaves their browser")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const bug = describeForUser(Object.assign(new TypeError("t.map is not a function"), { digest: "3841abc" }))
    check("the exception's own message is never shown", !bug.title.includes("map") && !bug.detail.includes("map"))
    check("the digest is, because it is what makes a report findable", bug.digest === "3841abc")
    check("and they are told the rest of the product still works", /still working/.test(bug.detail))

    const stale = describeForUser({ name: "ChunkLoadError", message: "Loading chunk 9 failed." })
    check("a stale tab is described as what it is, not as a fault", /out of date/i.test(stale.title))

    /**
     * THE REPORT IS THE PART THAT COULD LEAK. A query string is where an
     * email address, a token or an order id ends up, so the path is taken
     * apart rather than trimmed.
     */
    const report = buildReport(
      Object.assign(new Error("boom"), { digest: "d1" }),
      "https://storelib.com/app/orders?token=secret-value&email=a@b.com",
    )
    check("only the path is reported, never the query", report.path === "/app/orders")
    check("so nothing from the query can reach a log", !JSON.stringify(report).includes("secret-value") && !JSON.stringify(report).includes("a@b.com"))
    check("the report carries four fields and no more", Object.keys(report).sort().join(",") === "digest,message,path,stale")
    check(
      "a long message is cut rather than logged whole",
      buildReport(new Error("x".repeat(5_000)), "https://storelib.com/").message.length === 300,
    )
    /**
     * A href is whatever the browser had; it is never parsed for meaning,
     * only for its path, and the one thing it must not do is throw while
     * building the report for an error that has already happened.
     */
    let survived = true
    let odd = ""
    try {
      odd = buildReport(new Error("x"), "not a url").path
    } catch {
      survived = false
    }
    check("a href that is not a URL does not throw while reporting", survived && odd.length > 0 && odd.length <= 200, odd)
    check("and one with no path at all still reports something", buildReport(new Error("x"), "").path === "/")

    /**
     * Read the CODE, not the comments. The first version of this check
     * matched the word "cookies" in this endpoint's own note saying that it
     * reads none, which is a test that fails when the file explains itself.
     */
    const withComments = readFileSync(join(root, "app/api/client-errors/route.ts"), "utf8")
    const api = withComments.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")
    check("the endpoint strips a query the client somehow sent anyway", /\.split\("\?"\)\[0\]/.test(api))
    check("and newlines, so nothing can forge a second log line", /replace\(\/\[\\r\\n\]\+\/g/.test(withComments))
    check("it reads no cookie, no header beyond the ip, and no session", !/cookies|authorization|supabase/i.test(api))
    check("an oversized body is refused rather than parsed", /raw\.length > MAX_BYTES/.test(api))
    check("and it answers with nothing, so a failure cannot become a retry storm", /status: 204/.test(api))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every route in the product is covered")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const appDir = join(root, "app")

    /** Route groups, (like this), are not path segments. */
    const isGroup = (name: string) => name.startsWith("(") && name.endsWith(")")
    /** @parallel routes and _private folders are not pages. */
    const skip = (name: string) => name.startsWith("_") || name.startsWith("@") || name === "api"

    const uncovered: string[] = []

    function walk(dir: string, covered: boolean) {
      const entries = readdirSync(dir)
      /**
       * A boundary covers its own segment and everything below it. A route
       * group's boundary covers the group, which is why the flag is passed
       * down rather than recomputed from the path.
       */
      const here = covered || entries.includes("error.tsx") || entries.includes("global-error.tsx")
      if (entries.includes("page.tsx") && !here) uncovered.push(relative(appDir, dir) || "/")
      for (const name of entries) {
        if (skip(name)) continue
        const full = join(dir, name)
        if (!statSync(full).isDirectory()) continue
        walk(full, here)
      }
      void isGroup
    }
    walk(appDir, false)

    check(
      "no page can render without an error boundary above it",
      uncovered.length === 0,
      uncovered.length ? `${uncovered.length} uncovered: ${uncovered.slice(0, 8).join(", ")}` : "",
    )

    /**
     * The root pair specifically. `error.tsx` catches a page; only
     * `global-error.tsx` catches the ROOT LAYOUT, which is where the
     * providers and the fonts are, and a failure there is the one that
     * produced a completely blank document.
     */
    /* Changed on purpose (r52): two roots, Storelib's (app/(storelib)) and the websites' (app/(site)), each with its boundary. */
    const rootError = readFileSync(join(appDir, "(storelib)", "error.tsx"), "utf8")
    check("the websites' root has its boundary too", /ErrorScreen/.test(readFileSync(join(appDir, "(site)", "error.tsx"), "utf8")))
    const globalError = readFileSync(join(appDir, "global-error.tsx"), "utf8")
    check("the root segment has a boundary", /ErrorScreen/.test(rootError) && /"use client"/.test(rootError))
    check("and so does the root layout itself", /ErrorScreen/.test(globalError))
    check(
      "the layout boundary renders its own html and body, because it replaces the layout",
      /<html/.test(globalError) && /<body/.test(globalError),
    )

    const screen = readFileSync(join(root, "components/platform/error-screen.tsx"), "utf8")
    check(
      "the error screen needs no stylesheet, because a missing stylesheet is one of the causes",
      !/className=/.test(screen) && /CSSProperties/.test(screen),
    )
    check("it offers a way out", /Try again/.test(screen) && /Reload the page/.test(screen))
    check("it reports itself", /\/api\/client-errors/.test(screen))
    check("with keepalive, so a report is not lost to a navigation", /keepalive: true/.test(screen))
    check(
      "and a failure to report can never become the thing on screen",
      /catch \(\) => \{\}\)|\.catch\(\(\) => \{\}\)/.test(screen) && /} catch {/.test(screen),
    )
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
