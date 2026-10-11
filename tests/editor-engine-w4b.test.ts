/**
 * ===========================================================================
 *  THE ENGINE AUDIT, OCTOBER 2026 (W4b)
 * ===========================================================================
 * docs/audits/website-builder-engine-2026-10.md lists what was measured in
 * the builder and on the live site, and what was changed. This holds the
 * changes in place. The numbers themselves come from the browser probes the
 * audit names (scripts/check-slider-latency.mjs and the others); a unit test
 * cannot measure a frame, so what is checked here is the shape that made the
 * numbers what they are.
 *
 * Run with:  npm run test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(join(root, dir))) {
    if (f === "node_modules" || f.startsWith(".")) continue
    const p = join(dir, f)
    if (statSync(join(root, p)).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

console.log("\nE1  NO PRESS, HOVER OR FOCUS RESTYLES THE WHOLE DOCUMENT")
{
  /*
    A pointer or focus state inside a :has() anywhere in the stylesheet, or a
    bare `:active` after a descendant combinator, made Chromium restyle every
    element of the page on every press, release, hover change and focus
    change: 1,346 elements, 35 to 150ms each, in the builder. Measured, and
    gone once the rules below were rewritten (the audit, E1).
  */
  const STATE = /(?:hover|active|focus|focus-visible|focus-within)/
  const sources = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => /\.(tsx?|css)$/.test(f))
  const offenders: string[] = []
  for (const f of sources) {
    const text = read(f)
    /* Tailwind's has-[…] and [&:has(…)] variants, in class names. */
    for (const m of text.matchAll(/has-\[([^\]\s"'`]*)\]|\[&:has\(([^)\s"'`]*)\)\]/g)) {
      const inner = m[1] ?? m[2] ?? ""
      if (new RegExp(`:${STATE.source}\\b`).test(inner)) offenders.push(`${f}: ${m[0]}`)
    }
    if (!f.endsWith(".css")) continue
    /* A :has( whose argument names a pointer or focus state, in a stylesheet (comments left out). */
    const css = text.replace(/\/\*[\s\S]*?\*\//g, "")
    for (const m of css.matchAll(/:has\(([^{}]*?)\)/g)) {
      if (new RegExp(`:${STATE.source}\\b`).test(m[1])) offenders.push(`${f}: :has(${m[1]})`)
    }
  }
  check("no :has() in a class name or a stylesheet watches a hover, a press or a focus", offenders.length === 0, offenders)

  const globals = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "")
  const bare = [...globals.matchAll(/[^\n{}]*[\s>~+]:(?:active|hover)\b[^\n{}]*/g)].map((m) => m[0].trim())
  check("globals.css has no bare :active or :hover after a combinator (the element pressed is named)", bare.length === 0, bare)
  check("the card rule still keeps a pressed card at full strength on a touch screen",
    /@media \(hover: none\), \(pointer: coarse\) \{\s*:is\(a, button, \[role="button"\], \[tabindex="0"\]\):has\(img, picture, video, canvas\):active,/.test(read("app/globals.css")))

  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  check("the header's fade siblings reads the nav's own hover", /hover:\[--nav-fade:0\.4\] \[&_a:hover\]:opacity-100/.test(header) && !/\[&:has\(a:hover\)\]/.test(header))
  check("the rich text field's halo follows focus-within", /focus-within:border-\[#c9ccd3\] focus-within:shadow-/.test(read("components/app/rich-text-editor.tsx")))
  const rows = ["app/app/products/products-client.tsx", "app/app/products/collections/collections-client.tsx", "app/app/coupons/coupons-client.tsx"]
  check("list rows grey from the press mark their link sets", rows.every((f) => /data-\[pressed\]:bg-\[#/.test(read(f)) && /\{\.\.\.pressMark\}/.test(read(f))))
  const mark = read("lib/press-mark.ts")
  check("the press mark is set on the press and taken off on release, cancel and leave",
    /onPointerDownCapture/.test(mark) && /onPointerUp: .*mark\(e, false\)/.test(mark) && /onPointerCancel: .*mark\(e, false\)/.test(mark) && /onPointerLeave: .*mark\(e, false\)/.test(mark))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
