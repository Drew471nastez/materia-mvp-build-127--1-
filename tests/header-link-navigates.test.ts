/**
 * ===========================================================================
 *  A LINK THAT CANCELS ITSELF AND THEN NAVIGATES NOWHERE
 * ===========================================================================
 * Two My Library entries in the header — the mobile profile sheet and the
 * mobile menu — were written as:
 *
 *     onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); onCanonicalNav(e, "/library") }}
 *
 * On a seller subdomain, and inside Capacitor, onCanonicalNav navigates by
 * itself, so that reads fine. On storelib.com in an ordinary browser it takes
 * neither branch and returns — and the <Link> default that would have done the
 * navigating had already been cancelled on the line before. The tap was
 * swallowed and My Library never loaded.
 *
 * Two assertions, because either one alone can rot: no caller cancels the
 * default before handing the event to onCanonicalNav, and onCanonicalNav
 * carries the navigation itself if it ever finds the default already gone.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  const header = read("components/platform/platform-header-client.tsx")

  /* Any onClick body that cancels the default AND defers to onCanonicalNav. */
  const swallowed = header
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /preventDefault\(\)/.test(line) && /onCanonicalNav\(/.test(line))

  check(
    "no header link cancels its own default and then relies on onCanonicalNav to navigate",
    swallowed.length === 0,
    swallowed.map(({ n }) => `line ${n}`).join(", "),
  )

  /* The guard inside onCanonicalNav, so a future caller cannot reintroduce it. */
  const i = header.indexOf("const onCanonicalNav = useCallback(")
  const body = i < 0 ? "" : header.slice(i, header.indexOf("\n  const getCanonicalOrRelativePath", i))
  check("onCanonicalNav exists", body.length > 0)
  check(
    "onCanonicalNav navigates itself when the default has already been cancelled",
    /e\.defaultPrevented/.test(body) && /router\.push\(targetPath\)/.test(body),
    "otherwise a cancelled click on the apex domain goes nowhere",
  )

  /* Break-test the scan: the shape it looks for is one it can actually find. */
  const probe = `onClick={(e) => { e.preventDefault(); onCanonicalNav(e, "/library") }}`
  check(
    "the scan recognises the shape it is banning",
    /preventDefault\(\)/.test(probe) && /onCanonicalNav\(/.test(probe),
  )

  /*
    THE SELECTED CATEGORY PILL IS GREY, NOT BLACK. A black fill on the pill row
    read as a hole in the page next to the white pills beside it. Grey with dark
    text keeps the selection legible and keeps the text visible.
  */
  const explore = read("components/explore/explore-page-client.tsx")
  const pill = explore.indexOf("shrink-0 px-3.5 py-2 rounded-full")
  const pillBlock = pill < 0 ? "" : explore.slice(Math.max(0, pill - 400), pill + 400)
  check("the category pill row is where the test expects it", pillBlock.length > 0)
  check(
    "a selected category pill is grey with dark text, not a black fill",
    /bg-\[#e2e4e8\] text-neutral-900/.test(pillBlock) &&
      !/bg-neutral-900 text-white border-neutral-900/.test(pillBlock),
  )
  check(
    "and it is pressed in rather than flat",
    /shadow-\[inset_0_1px_1\.5px_rgba\(15,23,42,0\.07\)/.test(pillBlock),
    "scripts/check-category-pill.mjs measures the rendered depth",
  )
  check(
    "box-shadow is in the pill transition, so the depth does not snap",
    /transition-\[background-color,border-color,color,box-shadow\]/.test(pillBlock),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
