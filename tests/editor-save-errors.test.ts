/**
 * Saving in the website editor, and the two errors it gave for no reason.
 *
 * "Invalid body": an imported Shopify theme's sections carry no name, and
 * the save routes required one, so every save of an imported theme was
 * refused. "Theme not found": the routes answered 404 whenever the read of
 * the install came back empty, including when the read failed (a timeout,
 * a dropped connection), so a slider moved under load said the website did
 * not exist.
 */
import { readFileSync } from "node:fs"

import { readTwice, UNREACHABLE } from "../lib/website-builder/owned-install"
import { putJsonWithRetry } from "../lib/website-builder/save-request"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const ROUTES = "app/api/website-builder/themes/[installId]/"

;(async () => {
  console.log("\nA section with no name is saved\n")
  for (const f of ["sections/route.ts", "sections/sync-global/route.ts", "agent/route.ts"]) {
    check(`${f}: name is optional, saved as ""`, read(ROUTES + f).includes(`name: z.string().max(256).optional().default("")`))
  }

  console.log("\nNot found only when it is not there\n")
  for (const f of ["route.ts", "settings/route.ts", "sections/route.ts", "sections/sync-global/route.ts", "files/route.ts", "publish/route.ts", "backups/route.ts", "backups/[backupId]/restore/route.ts", "sections/code/route.ts", "cover/route.ts", "security/route.ts"]) {
    const src = read(ROUTES + f)
    const guard = src.indexOf("installReadErr) return")
    const missing = src.search(/if \(!install\) return/)
    check(`${f}: a failed read of the install says so (503), before any "not found"`, /readTwice\(\(\) => supabase/.test(src) && guard > 0 && guard < missing && /UNREACHABLE/.test(src))
  }
  let calls = 0
  const flaky = await readTwice(async () => (++calls === 1 ? { data: null, error: { code: "57014" } } : { data: { id: "x" }, error: null }))
  check("a read that fails once is tried again and lands", calls === 2 && flaky.data?.id === "x" && !flaky.error)
  calls = 0
  const empty = await readTwice(async () => { calls++; return { data: null, error: null } })
  check("a read that worked and found nothing is not tried again", calls === 1 && empty.data === null && !empty.error)
  check("the words say the server was not reached, not that the site is gone", /could not reach/.test(UNREACHABLE) && !/not found/i.test(UNREACHABLE))

  console.log("\nThe editor's save tries a gateway error again\n")
  const real = globalThis.fetch
  const answers = (statuses: number[]) => {
    const seen: number[] = []
    globalThis.fetch = (async () => { const s = statuses[Math.min(seen.length, statuses.length - 1)]; seen.push(s); return new Response("{}", { status: s }) }) as typeof fetch
    return seen
  }
  let seen = answers([503, 200])
  let res = await putJsonWithRetry("/x", { a: 1 })
  check("503 then 200: saved on the second try", res.status === 200 && seen.length === 2)
  seen = answers([400])
  res = await putJsonWithRetry("/x", { a: 1 })
  check("400: answered at once, not sent again", res.status === 400 && seen.length === 1)
  seen = answers([504, 504, 504, 504])
  res = await putJsonWithRetry("/x", { a: 1 })
  check("a gateway down for good: three tries, then its answer", res.status === 504 && seen.length === 3)
  globalThis.fetch = real
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("autosave and publish both save through it", (editor.match(/putJsonWithRetry\(`\/api\/website-builder\/themes\/\$\{installId\}\/(settings|sections)`/g) ?? []).length === 4)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})()
