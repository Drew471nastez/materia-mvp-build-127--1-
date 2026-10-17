/**
 * ===========================================================================
 *  ONE BAR, AND EVERY BAR IS IT
 * ===========================================================================
 * The owner: "Standardize all progress and fill bars across the platform:
 * course progress, lesson completion, setup progress, upload progress,
 * onboarding, analytics. One shared component or style system ... Avoid
 * animation that resets unnecessarily when components rerender."
 *
 * The rule the shared bar follows (components/ui/fill-bar), and the screens
 * that draw one: a bar that fills belongs to that module, and the measurements
 * are decided there and nowhere else. scripts/check-fill-bar.mjs measures the
 * drawn thing in a browser; this holds the shape of the code.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { FILL_BAR_HEIGHT, FILL_BAR_MS, fillPercent } from "@/components/ui/fill-bar"

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(p, "utf8")

console.log("\nThe width is the figure")
{
  check("a percentage is itself", fillPercent(30) === 30 && fillPercent(0) === 0 && fillPercent(100) === 100)
  check("counted in its own units: 7 of 12 lessons", Math.round(fillPercent(7, 12) * 10) / 10 === 58.3)
  check("more than the maximum stops at full, less than nothing at empty", fillPercent(250, 100) === 100 && fillPercent(-4, 100) === 0)
  check("a job that has begun but sent nothing is its floor, not an empty track", fillPercent(0, 100, 8) === 8 && fillPercent(20, 100, 8) === 20)
  check("a maximum of nothing is not a division: it is the floor, or empty", fillPercent(5, 0) === 0 && fillPercent(5, 0, 8) === 8)
  check("and nothing a caller can pass makes a width outside 0 to 100", [fillPercent(NaN), fillPercent(1, 1, 400), fillPercent(Infinity, 10)].every((x) => x >= 0 && x <= 100))
  check("three heights and one duration, named in the module", FILL_BAR_HEIGHT.thin === 4 && FILL_BAR_HEIGHT.regular === 6 && FILL_BAR_HEIGHT.thick === 8 && FILL_BAR_MS === 300)
}

console.log("\nIt moves only when the figure does")
{
  const bar = code("components/ui/fill-bar.tsx")
  check("the fill is a transition on the width, never an animation", /transition-\[width\] ease-out motion-reduce:transition-none/.test(bar) && !/animate-\[/.test(bar))
  check("and the width is the only thing that changes, so nothing else is animated with it", !/transition-all/.test(bar))
  check("reduced motion sets it instead of moving it", /motion-reduce:transition-none/.test(bar))
  check("an announced bar carries its minimum, maximum, value and name", /role: "progressbar", "aria-valuemin": 0, "aria-valuemax": max, "aria-valuenow"/.test(bar))
  check("the value announced never passes the maximum", /Math\.max\(0, Math\.min\(max, value\)\)/.test(bar))
  check("a quiet one is hidden from a screen reader rather than saying it twice", /quiet\s*\n?\s*\? \(\{ "aria-hidden": true \}/.test(bar.replace(/\s+/g, " ")) || /"aria-hidden": true/.test(bar))
}

console.log("\nEvery bar that fills is this one")
{
  /*
    A bar drawn by hand looks like a rounded track with a child whose width is a percentage. The ones left are
    not bars: a slider's track with a thumb on it, a carousel's rail, a skeleton's grey line, a star rating cut
    off at a width, an image sized by the creator, and the video scrubber, which is a control you press.
    Analytics' rows are a fill too, but of another kind (the words sit on the fill), and they share ROW_FILL.
  */
  const ALLOWED = new Set([
    "components/ui/fill-bar.tsx",
    "components/developers/specimens.tsx",
    "components/community/member/lightbox.tsx",
    "components/community/creator/analytics-section.tsx",
    "components/app/settings/activity-panel.tsx",
    "components/email/compose/block-editor.tsx",
    "components/website-builder/sections/renderers/product/product-blocks.tsx",
    "components/website-builder/sections/renderers/SocialProofBarSection.tsx",
    "components/product/product-gallery.tsx",
    "app/admin/physical-commerce/commerce-docs-admin.tsx",
    "app/app/analytics/analytics-reports.tsx",
  ])
  const files = execFileSync("git", ["ls-files", "*.tsx"], { encoding: "utf8" }).split("\n").filter(Boolean)
  const drawn = files.filter((f) => !f.startsWith("tests/") && !f.startsWith("scripts/") && /style=\{\{ width: `\$\{/.test(code(f)))
  const strays = drawn.filter((f) => !ALLOWED.has(f))
  check("no screen draws a bar of its own", strays.length === 0, strays)
  check("and the list of what is not a bar has not quietly grown", drawn.length <= ALLOWED.size, { drawn: drawn.length, allowed: ALLOWED.size })
  check("the shadcn default is gone, with its bg-primary and its own radix", !files.includes("components/ui/progress.tsx"))
  /* The screens the owner named, each drawing the shared bar. */
  for (const [what, file] of [
    ["course progress", "components/community/classroom/classroom-library.tsx"],
    ["lesson progress", "components/community/learn/learn-library.tsx"],
    ["setup", "components/community/creator/setup-pill.tsx"],
    ["the store's setup", "components/app/home/physical-setup-card.tsx"],
    ["an upload", "components/app/image-upload.tsx"],
    ["the Files library", "components/files/files-library.tsx"],
    ["onboarding", "components/onepage/onboarding-modal.tsx"],
    ["a translation", "components/app/settings/translate-progress.tsx"],
    ["a send", "components/email/compose/send-status.tsx"],
    ["analytics", "components/community/creator/leave-reasons-card.tsx"],
  ] as const) {
    check(`${what} draws the shared bar`, /<FillBar/.test(code(file)) && /@\/components\/ui\/fill-bar/.test(code(file)))
  }
  check("the two lists of figures share one row fill", /ROW_FILL/.test(code("app/app/analytics/analytics-reports.tsx")) && /ROW_FILL/.test(code("components/community/creator/analytics-section.tsx")) && /export const ROW_FILL/.test(code("components/ui/fill-bar.tsx")))
}

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
