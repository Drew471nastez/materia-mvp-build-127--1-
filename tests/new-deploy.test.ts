/**
 * A tab that is behind the live deploy, noticed before a chunk fails
 * (lib/ui/new-deploy.ts), and the files a deploy depends on.
 *
 *   1. The decisions: which deploy is "other", when a check may run, and
 *      which route changes become a full page load.
 *   2. The check itself, driven with a fake window and fetch: one request
 *      shared, a timeout, no answer read as "not behind".
 *   3. The wiring, read from the source: installed by instrumentation-client,
 *      no timer loop, a version route that is never cached.
 *   4. The default theme's manifest names only sections that exist.
 *
 * Run with:  npm run test:push
 */

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  ANSWER_FRESH_MS,
  CHECK_EVERY_MS,
  checkDue,
  confirmNewDeploy,
  fullLoadFor,
  isOtherDeploy,
  newDeployKnown,
} from "@/lib/ui/new-deploy"

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

const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")

async function main() {
  console.log("\nWhich deploy, and when to ask")
  {
    check("a different id is another deploy", isOtherDeploy("dpl_a", "dpl_b"))
    check("the same id is not", !isOtherDeploy("dpl_a", "dpl_a"))
    check("no answer, or an odd one, is not", !isOtherDeploy("dpl_a", null) && !isOtherDeploy("dpl_a", "") && !isOtherDeploy("dpl_a", 42))
    check("a build with no id of its own never thinks it is behind", !isOtherDeploy("", "dpl_b"))
    const t = 1_800_000_000_000
    check("the first check is due", checkDue(0, t))
    check("not again inside five minutes", !checkDue(t, t + CHECK_EVERY_MS - 1))
    check("and again after", checkDue(t, t + CHECK_EVERY_MS))
  }

  console.log("\nWhich route change becomes a full page load")
  {
    const base = { from: "https://storelib.com/app/orders", newDeploy: true, holdsWork: false }
    check("a push to another page, once behind, loads fully and keeps its history entry", fullLoadFor({ ...base, href: "/app/products", type: "push" }) === "assign")
    check("a replace loads in place", fullLoadFor({ ...base, href: "/app/products", type: "replace" }) === "replace")
    check("a relative href is read against the page", fullLoadFor({ ...base, from: "https://storelib.com/app/orders/1", href: "2", type: "push" }) === "assign")
    check("not when the tab is current", fullLoadFor({ ...base, newDeploy: false, href: "/app/products", type: "push" }) === null)
    check("not from a page holding unsaved work", fullLoadFor({ ...base, holdsWork: true, href: "/app/products", type: "push" }) === null)
    check("not for Back or Forward, whose address has already moved", fullLoadFor({ ...base, href: "/app", type: "traverse" }) === null)
    check("not for a query or hash on the same page", fullLoadFor({ ...base, href: "/app/orders?status=paid", type: "replace" }) === null && fullLoadFor({ ...base, href: "#x", type: "push" }) === null)
    check(
      "not out of the website builder, which saves on a timer and asks its own question",
      fullLoadFor({ ...base, from: "https://storelib.com/website-builder/editor/abc?page=home", href: "/app/website-builder", type: "push" }) === null,
    )
    check("nor out of checkout", fullLoadFor({ ...base, from: "https://storelib.com/checkout?product=x", href: "/receipt", type: "push" }) === null)
    check("nor to another origin", fullLoadFor({ ...base, href: "https://example.com/x", type: "push" }) === null)
    check("a broken address does nothing rather than throw", fullLoadFor({ ...base, from: "not a url", href: "/x", type: "push" }) === null)
  }

  console.log("\nThe check, in a fake browser")
  {
    const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch }
    const realFetch = g.fetch
    g.window = {}
    process.env.NEXT_DEPLOYMENT_ID = "dpl_old"
    let calls = 0
    let answer: unknown = { deploymentId: "dpl_old" }
    g.fetch = (async (url: string, init?: RequestInit) => {
      calls++
      if (url !== "/api/version" || init?.cache !== "no-store") throw new Error(`unexpected ${url}`)
      return { ok: true, json: async () => answer } as Response
    }) as typeof fetch

    const [a, b] = await Promise.all([confirmNewDeploy(), confirmNewDeploy()])
    check("the same deploy answers: not behind", !a && !b && !newDeployKnown())
    check("two errors at once share one request", calls === 1, `calls=${calls}`)
    answer = { deploymentId: "dpl_new" }
    const c = await confirmNewDeploy()
    check(`and a second ask inside ${ANSWER_FRESH_MS / 1000}s does not ask again`, !c && calls === 1, `calls=${calls}`)

    /* The window's state is what the instrumentation bundle and the app share. */
    const state = (g.window as { __storelibDeploy?: { checkedAt: number } }).__storelibDeploy!
    state.checkedAt = Date.now() - ANSWER_FRESH_MS - 1
    check("once that answer is old, a newer deploy is seen", (await confirmNewDeploy()) && newDeployKnown() && calls === 2)
    check("and remembered without asking again", (await confirmNewDeploy()) && calls === 2)

    g.window = {}
    g.fetch = (async () => {
      throw new TypeError("Load failed")
    }) as typeof fetch
    check("a check that cannot reach the server is not behind", !(await confirmNewDeploy()))

    g.window = {}
    process.env.NEXT_DEPLOYMENT_ID = ""
    calls = 0
    g.fetch = (async () => {
      calls++
      return { ok: true, json: async () => ({ deploymentId: "dpl_new" }) } as Response
    }) as typeof fetch
    check("a build with no deployment id never asks", !(await confirmNewDeploy()) && calls === 0)

    g.fetch = realFetch
    delete g.window
    delete process.env.NEXT_DEPLOYMENT_ID
  }

  console.log("\nWired in, and cheap")
  {
    const inst = code("instrumentation-client.ts")
    check("installed for every page", /\nwatchDeploys\(\)\n/.test(inst))
    check("every route change asks whether to load fully", /onRouterTransitionStart\(url: string, navigationType: NavigationType\)[\s\S]*loadFullyIfBehind\(url, navigationType\)/.test(inst))
    const mod = code("lib/ui/new-deploy.ts")
    check("no timer polls the server", !/setInterval/.test(mod))
    check("it asks when the tab comes back into view or gets focus", /"visibilitychange"/.test(mod) && /"focus"/.test(mod))
    check("state lives on the window, shared by both bundles", /__storelibDeploy/.test(mod))
    const route = code("app/api/version/route.ts")
    check("the version route is never cached", /no-store/.test(route) && /force-dynamic/.test(route))
    check("it answers with the deploy id and nothing else", /NextResponse\.json\(\{ deploymentId \}/.test(route))
    const stale = code("lib/ui/stale-code.ts")
    check("an unhandled \"Load failed\" asks before anything is decided", /isLoadFailed\(error\) && !newDeployKnown\(\)/.test(stale))
  }

  console.log("\nThe default theme's manifest")
  {
    const manifest = JSON.parse(read("themes/default/manifest.json")) as Record<string, unknown>
    const files = new Set(readdirSync(join(root, "themes/default/sections")).map((f) => f.replace(/\.(storelib|json)$/, "")))
    for (const key of ["section_order", "addable_sections", "structure_sections", "retired_sections"]) {
      const list = manifest[key] as string[]
      const missing = list.filter((s) => !files.has(s))
      check(`every section in ${key} has a file`, Array.isArray(list) && missing.length === 0, missing.join(", "))
    }
    const order = manifest.section_order as string[]
    check("section_order lists each section once", new Set(order).size === order.length)
    const addable = manifest.addable_sections as string[]
    const retired = manifest.retired_sections as string[]
    check("nothing is both offered and retired", !addable.some((s) => retired.includes(s)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
