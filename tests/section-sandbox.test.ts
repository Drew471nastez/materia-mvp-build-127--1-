/**
 * ===========================================================================
 *  WHAT A SECTION'S SCRIPT MAY CHANGE ON THE PAGE IT IS ON
 * ===========================================================================
 * A section's script runs in an opaque-origin frame against a copy of its
 * own markup (scripts/check-section-sandbox.mjs runs that in a browser,
 * escape attempts included). What comes back is a list of changes, and
 * lib/storelib-theme/sandbox/protocol.ts is the gate every one passes on
 * the page's side. This is that gate, called directly with the inputs a
 * hostile section would send.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  ATTR_ALLOWED,
  EVENTS_FORWARDED,
  SANDBOX_LIMITS,
  acceptNavigation,
  acceptPatch,
  attrAllowed,
  styleAllowed,
} from "@/lib/storelib-theme/sandbox/protocol"
import { GUEST_SOURCE } from "@/lib/storelib-theme/sandbox/guest-source"
import { checkScript } from "@/lib/storelib-theme/storelib/script"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\nAttributes: what describes crosses, what loads or runs does not")

  for (const ok of ["class", "hidden", "open", "aria-expanded", "data-state", "tabindex", "disabled"]) {
    check(`${ok} may be set`, attrAllowed(ok))
  }
  for (const no of ["src", "href", "action", "formaction", "srcdoc", "style", "onclick", "ONCLICK", "onmouseover",
    "xlink:href", "poster", "data", "data-sb", "data-storelib-form", "data-block-id", "aria-", "data-"]) {
    check(`${no} may not`, !attrAllowed(no))
  }
  check("nothing on the allowed list loads or runs anything",
    !ATTR_ALLOWED.some((a) => /^(on|src|href|action|formaction|srcdoc|poster|style)$/.test(a) || a.startsWith("on")))

  console.log("\nStyles: property by property, and never a fetch")

  check("an ordinary value is applied", styleAllowed("transform", "translateX(-100%)") && styleAllowed("--depth", "3px"))
  for (const bad of [
    "url(https://evil.example/x.png)", "URL( 'x' )", "expression(alert(1))", "javascript:alert(1)",
    "\\75 rl(x)", "@import 'x'",
  ]) {
    check(`refused: ${bad}`, !styleAllowed("background", bad))
  }
  check("a property name that is not one is refused", !styleAllowed("background;color", "red") && !styleAllowed("", "red"))
  check("and so is a value too long to be honest", !styleAllowed("color", "a".repeat(SANDBOX_LIMITS.valueChars + 1)))

  console.log("\nEvery patch is checked, and malformed ones are dropped")

  check("an allowed attribute passes", acceptPatch({ k: "attr", i: 3, n: "class", v: "open" })?.k === "attr")
  check("removing one passes", acceptPatch({ k: "attr", i: 3, n: "hidden", v: null })?.k === "attr")
  check("a forbidden one is dropped", acceptPatch({ k: "attr", i: 3, n: "onclick", v: "x()" }) === null)
  check("text passes as text", acceptPatch({ k: "text", i: 1, v: "<img src=x onerror=1>" })?.k === "text")
  check("a style that fetches is dropped", acceptPatch({ k: "style", i: 1, n: "background", v: "url(x)" }) === null)
  check("a scroll keeps only finite numbers",
    JSON.stringify(acceptPatch({ k: "scroll", i: 0, left: Infinity, top: 40, smooth: "yes" })) === JSON.stringify({ k: "scroll", i: 0, left: undefined, top: 40, smooth: false }))
  for (const [what, raw] of [
    ["no index", { k: "attr", n: "class", v: "x" }],
    ["a negative index", { k: "attr", i: -1, n: "class", v: "x" }],
    ["a fractional index", { k: "text", i: 1.5, v: "x" }],
    ["a string index", { k: "text", i: "1", v: "x" }],
    ["an unknown kind", { k: "html", i: 1, v: "<b>x</b>" }],
    ["a non-string value", { k: "attr", i: 1, n: "class", v: { toString: () => "x" } }],
    ["null", null],
    ["a string", "patch"],
  ] as const) {
    check(`dropped: ${what}`, acceptPatch(raw) === null)
  }
  check("an oversized text is dropped", acceptPatch({ k: "text", i: 1, v: "x".repeat(SANDBOX_LIMITS.valueChars + 1) }) === null)

  console.log("\nNavigation: this site, and nothing else")

  check("a path on this site", acceptNavigation("/products/mug?colour=red#top") === "/products/mug?colour=red#top")
  for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)",
    "products", "", "/a b", "/" + "x".repeat(600), 42]) {
    check(`refused: ${String(bad).slice(0, 30)}`, acceptNavigation(bad) === null)
  }

  console.log("\nThe page side trusts nothing the frame says")

  const host = read("components/website-builder/sections/section-sandbox.tsx")
  const hostCode = host.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  check("the frame is sandboxed with allow-scripts ONLY", /sandbox="allow-scripts"/.test(hostCode) && !/allow-same-origin/.test(hostCode))
  check("only the frame is listened to, by window identity",
    /event\.source !== frameRef\.current\.contentWindow/.test(host))
  check("every patch goes through the gate", /const patch = acceptPatch\(raw\)/.test(host))
  check("and a batch is capped before it is looked at", /msg\.patches\.slice\(0, SANDBOX_LIMITS\.patchesPerBatch\)/.test(host))
  check("text is written as text, never as HTML",
    /el\.textContent = patch\.v/.test(host) && !/innerHTML/.test(hostCode))
  check("navigation needs the capability on the page's own record, and never in the canvas",
    /entry\.capabilities\.includes\("navigation"\)/.test(host) && /inEditorRef\.current\) return/.test(host) && /acceptNavigation\(msg\.path\)/.test(host))
  check("a script is restarted when its markup changes, so it never drives stale nodes",
    /section\?\.bundle, section\?\.html\]/.test(host))
  check("no frame is made for a page with no script", /needed && enabled \?/.test(host) && /setNeeded\(true\)/.test(host))

  console.log("\nThe guest")

  check("it maps elements by identity, so a script cannot renumber them",
    /var numbers = new WeakMap\(\)/.test(GUEST_SOURCE) && !/getAttribute\(INDEX\)/.test(GUEST_SOURCE))
  check("it numbers from the same wrapper the page does",
    /var rootEl = document\.createElement\("div"\);\s*rootEl\.innerHTML = html;/.test(GUEST_SOURCE))
  check("it watches text as it is really changed, by replacing the node",
    /childList: true/.test(GUEST_SOURCE) && /rec\.type === "childList"/.test(GUEST_SOURCE))
  check("it never sends markup", !/innerHTML\s*[:}]|k: "html"/.test(GUEST_SOURCE))
  check("it does not depend on animation frames in a frame nobody draws",
    /window\.requestAnimationFrame = function/.test(GUEST_SOURCE) && /setTimeout\(function \(\) \{\s*flushing = false;/.test(GUEST_SOURCE))
  check("a runaway script is stopped", /\+\+spent > MAX_PER_SECOND/.test(GUEST_SOURCE))
  check("the capabilities it hands over are frozen", /return Object\.freeze\(api\)/.test(GUEST_SOURCE))
  check("every forwarded event is one the page listens for", EVENTS_FORWARDED.includes("click") && EVENTS_FORWARDED.includes("input"))

  console.log("\nWhat reaches the sandbox was checked when it was saved")

  const ok = checkScript('root.querySelector(".x").classList.add("on")')
  check("a script is wrapped as a function over the six names",
    ok.ok === true && /^"use strict";\n\(function \(root, settings, blocks, theme, page, storelib\) \{/.test(ok.value.bundle))
  check("document is still refused by name, so a section queries its own root",
    checkScript("document.querySelector('.x')").ok === false)
  check("timers still need their capability",
    checkScript("setInterval(f, 1000)").ok === false && checkScript("setInterval(f, 1000)", { capabilities: ["timers"] }).ok === true)

  const section = read("components/website-builder/sections/StorelibSection.tsx")
  check("a section hands its script, markup and capabilities to the sandbox",
    /useSectionScript\(/.test(section) && /bundle: script/.test(section) && /capabilities: out\.ok === true \? out\.capabilities/.test(section))
  check("the published page's prerender carries the script down",
    /script: out\.script, capabilities: out\.capabilities/.test(read("lib/website-builder/storefront-render.ts")))
  check("ThemePage provides one sandbox per page, told when it is the canvas",
    /<SectionSandboxProvider inEditor=\{storefront\?\.inEditor === true\}>/.test(read("components/website-builder/theme/ThemePage.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
