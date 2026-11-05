/**
 * ===========================================================================
 *  A SERVER COMPONENT CANNOT HAND A CLIENT COMPONENT A FUNCTION
 * ===========================================================================
 * It went to production and took every creator's live page with it:
 *
 *   Error: Functions cannot be passed directly to Client Components unless
 *   you explicitly expose it by marking it with "use server".
 *     {$$typeof: ..., render: function, displayName: ...}
 *
 * That object is a forwardRef component — a lucide icon, passed as
 * `icon={MessagesSquare}` from the creator page, which is a Server Component,
 * to EmptyTabPanel, which is a client one. Props crossing that boundary are
 * serialised, and a component is a function.
 *
 * NOTHING CAUGHT IT. It type-checks, because the prop really did accept a
 * ComponentType. It builds, because the boundary is a runtime rule. The page
 * renders in the editor's own preview, because that preview is a client
 * component and the boundary is not crossed there. The first thing that knew
 * was a visitor.
 *
 * So this reads the server pages and looks for the shape: a prop whose value
 * is a bare capitalised identifier that the file imported as a component.
 * Crude on purpose — it is looking for one specific mistake, and the cost of
 * that mistake is every shop on the platform.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
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
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const root = process.cwd()

function pagesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...pagesUnder(full))
    else if (/\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/**
 * Components imported into this file, by the name it uses for them. Only
 * lucide icons and the project's own components: those are the ones that are
 * functions. A string, a number or an object prop is fine to pass.
 */
function importedComponents(src: string): Set<string> {
  const names = new Set<string>()
  const importRe = /import\s+\{([^}]*)\}\s+from\s+"(lucide-react|@\/components\/[^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = importRe.exec(src))) {
    for (const raw of match[1].split(",")) {
      const name = raw.split(" as ").pop()!.trim()
      if (/^[A-Z]/.test(name)) names.add(name)
    }
  }
  return names
}

const offenders: string[] = []
for (const file of pagesUnder(join(root, "app"))) {
  const src = readFileSync(file, "utf8")
  /* A "use client" file is on the other side of the boundary; passing a
     component within client-land is ordinary React. */
  if (/^\s*["']use client["']/m.test(src)) continue

  const body = strip(src)
  const components = importedComponents(body)
  if (components.size === 0) continue

  /* prop={Identifier} — not prop={<Identifier />}, which is an element and
     serialises perfectly well, and not prop={x.y} or a call. */
  const propRe = /\s([a-z][A-Za-z0-9]*)=\{([A-Z][A-Za-z0-9]*)\}/g
  let m: RegExpExecArray | null
  while ((m = propRe.exec(body))) {
    if (components.has(m[2])) {
      const line = body.slice(0, m.index).split("\n").length
      offenders.push(`${file.replace(root + "/", "")}:${line}  ${m[1]}={${m[2]}}`)
    }
  }
}

console.log("\nNo server page hands a component across the boundary")
check(
  "no component is passed as a prop from a server page",
  offenders.length === 0,
  offenders.join("\n        "),
)

/* The fix for the one that shipped, pinned by name. */
const tabs = readFileSync(join(root, "components/storefront/storefront-tabs.tsx"), "utf8")
check(
  "the empty panel takes a NAME for its icon, not a component",
  /icon\?: keyof typeof EMPTY_ICONS/.test(tabs) && /const EMPTY_ICONS = \{/.test(tabs),
)

/**
 * And the page keeps rendering when a section does throw. The products are
 * deliberately NOT wrapped: a shop that quietly loses its products looks fine
 * and sells nothing, which is worse than one that says it is broken.
 */
const page = readFileSync(join(root, "app/(storelib)/(marketing)/u/[username]/page.tsx"), "utf8")
for (const region of ["reviews", "about", "footer"]) {
  check(`the ${region} cannot take the whole shop down with it`, new RegExp(`SafeRegion name="${region}"`).test(page))
}
check(
  "and a swallowed fault is still reported",
  /\/api\/client-errors/.test(readFileSync(join(root, "components/storefront/safe-region.tsx"), "utf8")),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
