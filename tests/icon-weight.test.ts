/**
 * ===========================================================================
 *  A NAME LOOKED UP AT RUNTIME KEEPS THE WHOLE LIBRARY
 * ===========================================================================
 * `import * as LucideIcons from "lucide-react"` sat in the section renderer,
 * and the section renderer is on the product page, the creator page and every
 * published site. Measured on production, that import was the single largest
 * thing a visitor downloaded:
 *
 *     /_next/static/chunks/1aa56d81e44319aa.js   196 KB compressed
 *                                                794 KB raw
 *
 * of 674 KB of JavaScript on the page. All 1736 icons, for a page that draws
 * a handful.
 *
 * The namespace import is not the problem by itself. The problem is what it
 * was for: `(LucideIcons as any)[pascalCase]`, a name resolved at runtime,
 * which no bundler can narrow. The editor's picker did the same thing with
 * `require("lucide-react")`.
 *
 * Both are gone, and this is what stops them coming back. It is easy to
 * reintroduce by accident — a namespace import is one line and looks tidier
 * than 243 named ones.
 *
 * The other half of the check is that the registry still covers everything a
 * creator can actually choose. The picker's list and the renderer's aliases
 * are the two sources of icon names in this codebase; if either grows past
 * what section-icons imports, a creator picks an icon and gets a tick.
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"

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

const read = (p: string) => readFileSync(p, "utf8")

const ICONS = read("components/store-builder/section-icons.ts")
const RENDERER = stripComments(read("components/store-builder/unified-section-renderer.tsx"))
const SIDEBAR = stripComments(read("components/store-builder/sections-sidebar.tsx"))

console.log("\nNobody imports the whole icon library\n")

/**
 * Checked on the files a VISITOR downloads and on the editor both. The
 * renderer is the one that shipped to every product page; the sidebar is the
 * one that made the editor heavy.
 */
for (const [name, src] of [
  ["the section renderer", RENDERER],
  ["the editor's sections sidebar", SIDEBAR],
  ["section-icons itself", stripComments(ICONS)],
] as const) {
  check(
    `${name} has no namespace import of lucide`,
    !/import \* as \w+ from ["']lucide-react["']/.test(src),
    "a namespace import plus a runtime name lookup keeps all 1736 icons",
  )
  check(
    `${name} does not require() lucide`,
    !/require\(\s*["']lucide-react["']\s*\)/.test(src),
    "same problem, older syntax",
  )
}

console.log("\nAnd the registry still covers every name a creator can pick\n")

/** The picker's list, which is what a creator actually chooses from. */
const benefitIcons = (() => {
  const m = SIDEBAR.match(/const BENEFIT_ICONS = \[([\s\S]*?)\n\]/)
  if (!m) return [] as string[]
  return [...m[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1])
})()

check("the picker's list was found", benefitIcons.length > 100, `${benefitIcons.length} names`)

/**
 * A name resolves if the alias map names it, or if its PascalCase form is in
 * the registry. That is exactly what getIconComponent does, so this is the
 * same question the browser asks.
 */
const aliasKeys = new Set([...ICONS.matchAll(/^\s{2}"([a-z0-9-]+)":/gm)].map((m) => m[1]))
const registryNames = new Set(
  (ICONS.match(/export const ICON_REGISTRY[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
)

check("the registry was found", registryNames.size > 200, `${registryNames.size} icons`)

const pascal = (s: string) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("")

/**
 * KNOWN AND ALREADY TRUE BEFORE THIS CHANGE. These names are in the picker
 * and are not icons lucide ships, so they fell back to a tick before the
 * registry existed and they fall back to a tick now. Listed rather than
 * hidden, because the fix is to correct the picker's list, not to widen this.
 */
const NOT_IN_LUCIDE = new Set([
  "alarm", "bicep", "bulb", "bullseye", "cup", "dice", "dropper", "flash", "glow",
  "heartbeat", "hiking", "idea", "magic", "people", "present", "refresh", "rotate",
  "running", "screwdriver", "shine", "stack", "storefront", "sync", "team",
  "thumbtack", "tool", "tree",
])

const unresolvable = benefitIcons.filter(
  (n) => !aliasKeys.has(n) && !registryNames.has(pascal(n)) && !NOT_IN_LUCIDE.has(n),
)
check(
  "every icon in the picker resolves to a real component",
  unresolvable.length === 0,
  unresolvable.join(", ") + "\n        add them to components/store-builder/section-icons.ts",
)

/** The debt list should describe real entries, or it is hiding nothing. */
const stale = [...NOT_IN_LUCIDE].filter((n) => !benefitIcons.includes(n))
check("the not-in-lucide list still describes names the picker offers", stale.length === 0, stale.join(", "))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
