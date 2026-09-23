#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE POLICY PARSES, AND DOES WHAT ITS COMMENTS SAY IT DOES
 * ===========================================================================
 * lib/security/csp.ts ships report-only, so a mistake in it would refuse
 * nothing and show up as nothing. That is the safe way to roll one out and it
 * is also a way to carry a policy for months that does not work: a mistyped
 * directive name is silently ignored, and a policy that would have broken
 * checkout looks identical to one that would not.
 *
 * So the real policy string is applied ENFORCING to a page here, and what it
 * allows and refuses is measured. Everything tested works with no network, so
 * the result is the policy's doing rather than the sandbox's.
 *
 *   what it must allow     an inline script, because Next.js hydrates
 *                          through one, and eval, because monaco needs it;
 *                          a blob: worker for pdf.js; a data: image
 *   what it must refuse    a <base href> pointing at another origin, which
 *                          is the trick that silently repoints every
 *                          relative URL on a page at somebody else's server
 *
 * A second page runs the same checks under `default-src 'none'`, as a control.
 * If the strict policy does not refuse what the real one allows, the harness
 * is not applying any policy at all and every result above it is meaningless.
 *
 *   node scripts/check-csp.mjs
 *
 * ---------------------------------------------------------------------------
 *  WHAT THIS CAN AND CANNOT SEE
 * ---------------------------------------------------------------------------
 * Only the directives whose effect is observable without a network. Whether
 * js.stripe.com is really reachable under `script-src`, and whether the host
 * list is complete for a real page, is what the report-only rollout is for:
 * that question is answered by real browsers on real traffic, not here.
 *
 * `report-uri` is ignored when a policy arrives in a <meta> tag rather than a
 * header, which is why nothing here asserts a report was sent.
 *
 * `worker-src blob:` is not measured either. A pending Worker stops the page
 * ever going idle, and with --virtual-time-budget that means the run never
 * finishes rather than failing: the first version of this file hung until it
 * was killed. The directive is pinned as text in tests/public-abuse.test.ts.
 */
import { execFileSync } from "node:child_process"
import { writeFileSync, rmSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"

const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const work = join(root, ".csp-probe")
mkdirSync(work, { recursive: true })

try {
  /* The policy exactly as it is served, read from the module that builds it. */
  execFileSync("npx", [
    "esbuild", join(root, "lib/security/csp.ts"),
    "--format=cjs", "--platform=node", `--outfile=${join(work, "csp.cjs")}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit" })
  const { CONTENT_SECURITY_POLICY } = await import(`file://${join(work, "csp.cjs")}`)
    .then((m) => m.default ?? m)

  /* And the one the header actually carries, so this tests what ships. */
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"))
  const served = (vercel.headers ?? [])
    .flatMap((h) => h.headers ?? [])
    .find((h) => h.key.startsWith("Content-Security-Policy"))?.value

  if (served !== CONTENT_SECURITY_POLICY) {
    fail("vercel.json and lib/security/csp.ts have drifted; this would be testing a policy nobody serves.")
  }

  /*
    `report-uri` is meaningless in a meta tag and Chromium warns about it, so
    it is dropped for the fixture. Nothing below depends on it.
  */
  const forMeta = CONTENT_SECURITY_POLICY.split("; ").filter((d) => !d.startsWith("report-uri")).join("; ")

  const probe = (policy, file) => {
    const page = join(work, file)
    writeFileSync(page, `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy.replace(/"/g, "&quot;")}">
<base href="https://example.invalid/hijacked/">
<a id="rel" href="thing">x</a>
<pre id="out">pending</pre>
<script>window.__inline = true</script>
<script>
async function measure() {
  const r = { inline: window.__inline === true }

  /* monaco and esbuild-wasm need this; nothing else here does. */
  try { r.evaluates = eval("1 + 1") === 2 } catch { r.evaluates = false }

  /* A 1x1 gif as a data: URI, which is what an inline placeholder is. */
  r.dataImage = await new Promise((done) => {
    const img = new Image()
    img.onload = () => done(true)
    img.onerror = () => done(false)
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
  })

  /*
    THE ONE THAT MATTERS ON ITS OWN. The <base> above points at another
    origin. With base-uri 'self' the browser ignores it and a relative link
    still resolves against this page; without it, every relative URL on the
    page silently points at somebody else's server.
  */
  r.relative = document.getElementById("rel").href

  document.getElementById("out").textContent = JSON.stringify(r)
}
addEventListener("load", () => setTimeout(measure, 200))
</script>`)
    const dom = execFileSync(CHROMIUM, [
      "--headless=new", "--no-sandbox", "--disable-gpu",
      "--virtual-time-budget=8000", "--dump-dom", `file://${page}`,
    ], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      /* A probe that hangs tells you nothing and blocks everything after it. */
      timeout: 30_000,
      killSignal: "SIGKILL",
    })
    const m = dom.match(/<pre id="out">([^<]*)</)
    if (!m) fail(`${file} did not render at all.`)
    /*
      `null` means the page never reported. Under a policy that refuses
      inline script that is not a broken fixture, it is the fixture working:
      the script doing the measuring is itself refused.
    */
    if (m[1] === "pending") return null
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
  }

  const real = probe(forMeta, "real.html")
  if (!real) fail("The real policy refused the page's own inline script. Every page would be dead.")

  /* No script-src at all, so the measuring script cannot run: silence is the result. */
  const strict = probe("default-src 'none'", "strict.html")

  /*
    And the same policy with base-uri taken out, which is the only way to show
    that base-uri is what stops the hijack rather than something else about
    the fixture.
  */
  const withoutBaseUri = probe(
    forMeta.split("; ").filter((d) => !d.startsWith("base-uri")).join("; "),
    "no-base-uri.html",
  )
  if (!withoutBaseUri) fail("The base-uri control refused its own script; it cannot act as a control.")

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  console.log("\nThe policy as served, applied enforcing to a page\n")
  console.log(`  inline script   ${real.inline ? "runs" : "refused"}`)
  console.log(`  eval            ${real.evaluates ? "runs" : "refused"}`)
  console.log(`  data: image     ${real.dataImage ? "loads" : "refused"}`)
  console.log(`  relative link   ${real.relative}`)
  console.log("")

  /* ── THE HARNESS IS REALLY APPLYING A POLICY ─────────────────────────── */
  expect(
    strict === null,
    "under `default-src 'none'` the page cannot even run its own script, so a policy is really being applied",
    "the strict control still reported, which means no policy is in force and nothing below means anything",
  )

  /* ── WHAT THE APP NEEDS STILL WORKS ──────────────────────────────────── */
  expect(real.inline, "Next.js can hydrate through an inline script", "inline script refused; every page would be dead")
  expect(real.evaluates, "monaco and esbuild-wasm can still evaluate", "eval refused; the code editor would not load")
  expect(real.dataImage, "an inline data: image still loads", "data: image refused")

  /* ── AND THE TRICK IT EXISTS TO STOP IS STOPPED ──────────────────────── */
  expect(
    !real.relative.startsWith("https://example.invalid/"),
    "a <base href> at another origin is ignored, so relative URLs stay on this site",
    `a relative link resolved to ${real.relative}`,
  )
  expect(
    withoutBaseUri.relative.startsWith("https://example.invalid/"),
    "and the same page WITHOUT base-uri is hijacked, so that directive is what stops it",
    `the control resolved to ${withoutBaseUri.relative}, so this proves nothing`,
  )

  console.log(`\n${broken === 0 ? "The policy parses, allows what the app needs, and closes what it claims to." : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
