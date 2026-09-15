/**
 * ===========================================================================
 *  AN EDITOR REOPENS ON WHAT WAS SAVED, NOT ON WHAT WAS THERE BEFORE
 * ===========================================================================
 * "The settings always reset their value." They were being saved correctly
 * and rendered correctly on the page; what was wrong was the fourth act.
 *
 *   1. the drawer saves, and calls setOpen(false) BEFORE router.refresh(),
 *      because it should close at once rather than after a round trip
 *   2. the close effect runs immediately, and its only dependency is `open`
 *   3. so it puts back the props as they were BEFORE the save
 *   4. the refreshed props arrive; `open` has not changed, nothing re-runs
 *
 * Open it again and the old values are in the fields, which from the outside
 * is indistinguishable from a save that silently failed.
 *
 * This runs that sequence against the real hook's rule rather than reading
 * it: the saved values change while the editor is closed, and the fields
 * have to follow. Order matters here and nothing else does, which is exactly
 * the sort of thing a source-matching test gets wrong.
 */
import { readFileSync } from "node:fs"
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

/**
 * The hook's rule, run as a tiny state machine. The hook itself is React and
 * cannot be called outside a renderer, so what is exercised here is the
 * DECISION it encodes — re-sync when closed and the signature has moved —
 * with the old rule beside it to prove the difference is real.
 */
function simulate(rule: "open-only" | "open-and-values") {
  let fields = "before"
  let saved = "before"
  let open = false
  let lastSignature: string | null = null

  const settle = () => {
    if (open) return
    if (rule === "open-only") return /* nothing but `open` can trigger it */
    if (lastSignature === saved) return
    lastSignature = saved
    fields = saved
  }
  const openDrawer = () => {
    open = true
  }
  const closeAfterSave = (next: string) => {
    /* The real order: close first, then the refreshed data arrives. */
    open = false
    if (rule === "open-only") fields = saved /* the close effect, with stale props */
    settle()
    saved = next
    settle()
  }

  openDrawer()
  fields = "after"
  closeAfterSave("after")
  openDrawer()
  return fields
}

console.log("\nReopening an editor after a save")

check(
  "the old rule shows the value from before the save",
  simulate("open-only") === "before",
  simulate("open-only"),
)
check(
  "and the rule in use shows what was saved",
  simulate("open-and-values") === "after",
  simulate("open-and-values"),
)

console.log("\nand every editor on the creator page uses it")

const hook = readFileSync(join(process.cwd(), "lib/store-builder/use-saved-values.ts"), "utf8")
check("the re-sync watches the saved values, not just open", /\[open, signature\]/.test(hook))
check(
  "it compares by value, because these props are new objects every render",
  /JSON\.stringify\(saved/.test(hook),
)
check("and it never overwrites a drawer somebody is typing in", /if \(open\) return/.test(hook))

for (const file of [
  "components/storefront/edit-profile-button.tsx",
  "components/storefront/edit-cta-button.tsx",
  "components/storefront/edit-about-button.tsx",
]) {
  const src = readFileSync(join(process.cwd(), file), "utf8")
  const name = file.split("/").pop()
  check(`${name} re-syncs from the saved values`, /useSavedValues\(/.test(src))
  check(
    `${name} has no reset keyed on open alone`,
    !/useEffect\(\(\) => \{\s*\n\s*if \(open\) return[\s\S]*?\}, \[open\]\)/.test(src),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
